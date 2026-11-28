process.env.JWT_SECRET = process.env.JWT_SECRET || "parkit-test-secret-key";

const http = require("http");
const { performance } = require("perf_hooks");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const jwt = require("jsonwebtoken");
const request = require("supertest");

const app = require("../app");
const User = require("../models/user");
const Slot = require("../models/slot");
const Booking = require("../models/booking");
const { connectRedis, releaseSlotLock } = require("../redis");
const { initSocket } = require("../socket");

let server;
let mongoServer;
let ownerCookie;
let ownerId;
let driverCookie;
let testSlotId;

beforeAll(async () => {
  server = http.createServer(app);
  initSocket(server);

  const uri =
    process.env.MONGO_TEST_URI ||
    (mongoServer = await MongoMemoryServer.create()).getUri();
  await mongoose.connect(uri, {
    runtimeAdapters: { os: require("os") },
  });
  await Slot.createIndexes();
  await connectRedis();
}, 120000);

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
  if (server && server.listening) {
    server.close();
  }
});

describe("1. Authentication & Role Guards", () => {
  test("Rejects unauthenticated requests to /api/user/me", async () => {
    const res = await request(app).get("/api/user/me");
    expect(res.statusCode).toBe(401);
  });

  test("Signs up and logs in a Building Owner", async () => {
    const signupRes = await request(app).post("/api/user/signup").send({
      name: "Test Owner",
      email: "owner@test.com",
      password: "password123",
      role: "OWNER",
      buildingName: "Tech Park Plaza",
      locality: "Katraj",
      city: "Pune",
      buildingType: "BOTH",
    });
    expect(signupRes.statusCode).toBe(201);
    ownerId = signupRes.body.user.id;

    const loginRes = await request(app).post("/api/user/login").send({
      email: "owner@test.com",
      password: "password123",
    });
    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.headers["set-cookie"]).toBeDefined();
    ownerCookie = loginRes.headers["set-cookie"];
  });

  test("Signs up and logs in a Driver", async () => {
    const signupRes = await request(app).post("/api/user/signup").send({
      name: "Test Driver",
      email: "driver@test.com",
      password: "password123",
      role: "DRIVER",
      vehicleNumber: "MH12AB1234",
    });
    expect(signupRes.statusCode).toBe(201);

    const loginRes = await request(app).post("/api/user/login").send({
      email: "driver@test.com",
      password: "password123",
    });
    expect(loginRes.statusCode).toBe(200);
    driverCookie = loginRes.headers["set-cookie"];
  });
});

describe("2. Slot Sync & Standard Booking Lifecycle", () => {
  test("Owner syncs 1 parking slot and retrieves it", async () => {
    const syncRes = await request(app)
      .post("/api/slot/sync")
      .set("Cookie", ownerCookie)
      .send({ slotType: "STANDARD", hourlyRate: 100, totalSlots: 1 });
    expect([200, 201]).toContain(syncRes.statusCode);

    const slotsRes = await request(app)
      .get("/api/slot/my-slots")
      .set("Cookie", ownerCookie);
    expect(slotsRes.statusCode).toBe(200);
    expect(slotsRes.body.slots.length).toBeGreaterThanOrEqual(1);

    testSlotId = slotsRes.body.slots[0]._id;
  });

  test("Driver locks, confirms, and releases the slot cleanly", async () => {
    const lockRes = await request(app)
      .post(`/api/booking/lock/${testSlotId}`)
      .set("Cookie", driverCookie);
    expect([200, 201]).toContain(lockRes.statusCode);

    const confirmRes = await request(app)
      .post(`/api/booking/confirm/${testSlotId}`)
      .set("Cookie", driverCookie)
      .send({ estimatedDuration: 2 });
    expect([200, 201]).toContain(confirmRes.statusCode);

    const releaseRes = await request(app)
      .post(`/api/booking/release/${testSlotId}`)
      .set("Cookie", driverCookie);
    expect(releaseRes.statusCode).toBe(200);
    // Immediate checkout on ₹100/hr slot should bill the 30-min minimum (₹50)
    expect(releaseRes.body.billableMinutes).toBe(30);
    expect(releaseRes.body.totalAmount).toBe(50);
  });
});

describe("3. Concurrency & Double-Booking Stress Test", () => {
  test("100 simultaneous lock requests on the same slot: exactly 1 succeeds, 99 fail cleanly", async () => {
    const CONCURRENT_USERS = 100;

    const driversPayload = Array.from({ length: CONCURRENT_USERS }, (_, i) => ({
      name: `Race Driver ${i}`,
      email: `racedriver${i}@test.com`,
      password: "hashedpasswordplaceholder",
      role: "DRIVER",
      vehicleNumber: `MH12RC${1000 + i}`,
    }));
    const createdDrivers = await User.insertMany(driversPayload);

    const driverCookies = createdDrivers.map((u) => {
      const token = jwt.sign(
        { id: u._id, role: u.role, name: u.name },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );
      return `token=${token}`;
    });

    const latencies = [];
    const results = await Promise.all(
      driverCookies.map(async (cookie) => {
        const start = performance.now();
        const res = await request(app)
          .post(`/api/booking/lock/${testSlotId}`)
          .set("Cookie", cookie);
        latencies.push(performance.now() - start);
        return res.statusCode;
      })
    );

    const succeeded = results.filter((code) => code === 200 || code === 201);
    const rejectedCleanly = results.filter((code) => code >= 400 && code < 500);
    const serverErrors = results.filter((code) => code >= 500);

    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)].toFixed(2);
    const median = latencies[Math.floor(latencies.length * 0.5)].toFixed(2);

    console.log(
      `\n[Concurrency Benchmark] ${CONCURRENT_USERS} concurrent requests -> ` +
        `Succeeded: ${succeeded.length} | Rejected cleanly: ${rejectedCleanly.length} | ` +
        `5xx Errors: ${serverErrors.length} | Median: ${median}ms | p95: ${p95}ms\n`
    );

    expect(succeeded.length).toBe(1);
    expect(rejectedCleanly.length).toBe(CONCURRENT_USERS - 1);
    expect(serverErrors.length).toBe(0);

    // Clean up the winning lock for downstream tests
    await releaseSlotLock(testSlotId);
    await Slot.findByIdAndUpdate(testSlotId, { status: "AVAILABLE", lockExpiresAt: null });
  });
});

describe("4. Geospatial Pinning & Nearest Parking Search", () => {
  test("Owner pins building location and driver receives nearest parkings sorted by distance", async () => {
    const pinRes = await request(app)
      .put("/api/user/location")
      .set("Cookie", ownerCookie)
      .send({ lat: 18.4575, lng: 73.8677 });
    expect(pinRes.statusCode).toBe(200);
    expect(pinRes.body.location.coordinates).toEqual([73.8677, 18.4575]);

    await request(app).post("/api/user/signup").send({
      name: "Far Owner",
      email: "farowner@test.com",
      password: "password123",
      role: "OWNER",
      buildingName: "Hinjewadi Hub",
      locality: "Hinjewadi",
      city: "Pune",
      buildingType: "PARKING",
      lat: 18.5913,
      lng: 73.7389,
    });
    const farLogin = await request(app).post("/api/user/login").send({
      email: "farowner@test.com",
      password: "password123",
    });
    const farOwnerCookie = farLogin.headers["set-cookie"];

    await request(app)
      .post("/api/slot/sync")
      .set("Cookie", farOwnerCookie)
      .send({ slotType: "STANDARD", hourlyRate: 80, totalSlots: 1 });

    // Search within 30 km so both Katraj and Hinjewadi appear sorted by distance
    const nearbyRes = await request(app)
      .get("/api/slot?lat=18.4580&lng=73.8680&maxDistance=30000")
      .set("Cookie", driverCookie);
    expect(nearbyRes.statusCode).toBe(200);
    expect(nearbyRes.body.slots.length).toBeGreaterThanOrEqual(2);

    expect(nearbyRes.body.slots[0].buildingName).toBe("Tech Park Plaza");
    expect(nearbyRes.body.slots[0].distanceKm).toBeLessThan(1);
    expect(nearbyRes.body.slots[1].buildingName).toBe("Hinjewadi Hub");
    expect(nearbyRes.body.slots[1].distanceKm).toBeGreaterThan(10);
  });
});

describe("5. Prorated Billing Logic (30-Min Minimum + Per-Minute)", () => {
  test("Charges per-minute accurately after 30 minutes (45 mins at ₹100/hr = ₹75)", async () => {
    const lockRes = await request(app)
      .post(`/api/booking/lock/${testSlotId}`)
      .set("Cookie", driverCookie);
    expect(lockRes.statusCode).toBe(200);

    const confirmRes = await request(app)
      .post(`/api/booking/confirm/${testSlotId}`)
      .set("Cookie", driverCookie)
      .send({ estimatedDuration: 1 });
    expect(confirmRes.statusCode).toBe(201);

    const bookingId = confirmRes.body.booking._id;
    // Backdate startTime by 44.5 minutes so Math.ceil(durationMs / 60000) === 45
    const backdatedStart = new Date(Date.now() - 44.5 * 60 * 1000);
    await Booking.findByIdAndUpdate(bookingId, { startTime: backdatedStart });

    const releaseRes = await request(app)
      .post(`/api/booking/release/${testSlotId}`)
      .set("Cookie", driverCookie);
    expect(releaseRes.statusCode).toBe(200);
    expect(releaseRes.body.billableMinutes).toBe(45);
    expect(releaseRes.body.totalAmount).toBe(75);
    expect(releaseRes.body.hoursParked).toBe(0.75);
  });
});

describe("6. Expired Lock Auto-Release & Building Cascade", () => {
  test("Automatically releases a LOCKED slot whose lockExpiresAt has passed", async () => {
    await Slot.findByIdAndUpdate(testSlotId, {
      status: "LOCKED",
      lockExpiresAt: new Date(Date.now() - 10 * 1000),
    });

    const res = await request(app)
      .get("/api/slot")
      .set("Cookie", driverCookie);
    expect(res.statusCode).toBe(200);

    const refreshed = await Slot.findById(testSlotId);
    expect(refreshed.status).toBe("AVAILABLE");
    expect(refreshed.lockExpiresAt).toBeNull();
  });

  test("Updating owner building name cascades to all owner slots", async () => {
    const updateRes = await request(app)
      .put("/api/user/profile")
      .set("Cookie", ownerCookie)
      .send({ buildingName: "Bharati Vihar", locality: "Katraj", city: "Pune" });
    expect(updateRes.statusCode).toBe(200);

    const slot = await Slot.findById(testSlotId);
    expect(slot.buildingName).toBe("Bharati Vihar");
  });
});

describe("7. Dual Waitlists, Auto-Promotion & Claim Flow", () => {
  let secondDriverCookie;

  test("Second driver joins STANDARD waitlist while EV is still open, gets promoted, and claims slot", async () => {
    // Owner also adds 1 EV slot so the building offers both services
    const evSync = await request(app)
      .post("/api/slot/sync")
      .set("Cookie", ownerCookie)
      .send({ slotType: "EV", hourlyRate: 75, totalSlots: 1 });
    expect(evSync.statusCode).toBe(200);

    // Sign up & login second driver
    await request(app).post("/api/user/signup").send({
      name: "Waitlist Driver",
      email: "waiter@test.com",
      password: "password123",
      role: "DRIVER",
      vehicleNumber: "MH12WL9999",
    });
    const login2 = await request(app).post("/api/user/login").send({
      email: "waiter@test.com",
      password: "password123",
    });
    secondDriverCookie = login2.headers["set-cookie"];

    // First driver occupies the only STANDARD slot
    await request(app).post(`/api/booking/lock/${testSlotId}`).set("Cookie", driverCookie);
    await request(app)
      .post(`/api/booking/confirm/${testSlotId}`)
      .set("Cookie", driverCookie)
      .send({ estimatedDuration: 1 });

    // Second driver joins STANDARD waitlist even though EV has an open slot
    const joinRes = await request(app)
      .post("/api/waitlist/join")
      .set("Cookie", secondDriverCookie)
      .send({ ownerId, slotType: "STANDARD" });
    expect([200, 201]).toContain(joinRes.statusCode);

    // First driver checks out -> second driver should be auto-promoted to READY
    const releaseRes = await request(app)
      .post(`/api/booking/release/${testSlotId}`)
      .set("Cookie", driverCookie);
    expect(releaseRes.statusCode).toBe(200);

    // Second driver checks waitlist status and sees READY with assignedSlotId
    const statusRes = await request(app)
      .get("/api/waitlist/my-status")
      .set("Cookie", secondDriverCookie);
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.body.entry).toBeDefined();
    expect(statusRes.body.entry.status).toBe("READY");
    expect(statusRes.body.entry.assignedSlotId).toBeDefined();

    const claimedSlotId =
      statusRes.body.entry.assignedSlotId._id || statusRes.body.entry.assignedSlotId;

    // Second driver claims the reserved slot directly via /confirm
    const claimRes = await request(app)
      .post(`/api/booking/confirm/${claimedSlotId}`)
      .set("Cookie", secondDriverCookie)
      .send({ estimatedDuration: 1 });
    expect(claimRes.statusCode).toBe(201);

    // Clean up second driver's session
    const release2 = await request(app)
      .post(`/api/booking/release/${claimedSlotId}`)
      .set("Cookie", secondDriverCookie);
    expect(release2.statusCode).toBe(200);
  });
});

describe("8. Persistent MongoDB Notifications", () => {
  test("Driver fetches saved notifications, marks all read, and clears them", async () => {
    const getRes = await request(app)
      .get("/api/notification")
      .set("Cookie", driverCookie);
    expect(getRes.statusCode).toBe(200);
    expect(getRes.body.notifications.length).toBeGreaterThan(0);

    const readRes = await request(app)
      .patch("/api/notification/read-all")
      .set("Cookie", driverCookie);
    expect(readRes.statusCode).toBe(200);

    const afterRead = await request(app)
      .get("/api/notification")
      .set("Cookie", driverCookie);
    expect(afterRead.body.unreadCount).toBe(0);

    const clearRes = await request(app)
      .delete("/api/notification")
      .set("Cookie", driverCookie);
    expect(clearRes.statusCode).toBe(200);

    const afterClear = await request(app)
      .get("/api/notification")
      .set("Cookie", driverCookie);
    expect(afterClear.body.notifications.length).toBe(0);
  });
});