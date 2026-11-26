process.env.JWT_SECRET = process.env.JWT_SECRET || "parkit-test-secret-key";

const http = require("http");
const { performance } = require("perf_hooks");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const jwt = require("jsonwebtoken");
const request = require("supertest");

const app = require("../app");
const User = require("../models/user");
const { connectRedis } = require("../redis");
const { initSocket } = require("../socket");
const Slot = require("../models/slot");

let server;
let mongoServer;
let ownerCookie;
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
  });
});

describe("3. Concurrency & Double-Booking Stress Test", () => {
  test("100 simultaneous lock requests on the same slot: exactly 1 succeeds, 99 fail cleanly", async () => {
    const CONCURRENT_USERS = 100;

    // Create 100 distinct drivers in the test DB
    const driversPayload = Array.from({ length: CONCURRENT_USERS }, (_, i) => ({
      name: `Race Driver ${i}`,
      email: `racedriver${i}@test.com`,
      password: "hashedpasswordplaceholder",
      role: "DRIVER",
      vehicleNumber: `MH12RC${1000 + i}`,
    }));
    const createdDrivers = await User.insertMany(driversPayload);

    // Sign a JWT cookie for each driver
    const driverCookies = createdDrivers.map((u) => {
      const token = jwt.sign(
        { id: u._id, role: u.role, name: u.name },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );
      return `token=${token}`;
    });

    // Fire all 100 booking lock requests at the exact same time
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
  });
});


describe("4. Geospatial Pinning & Nearest Parking Search", () => {
  test("Owner pins building location and driver receives nearest parkings sorted by distance", async () => {
    // Pin the first owner's building (Tech Park Plaza) in Katraj, Pune
    const pinRes = await request(app)
      .put("/api/user/location")
      .set("Cookie", ownerCookie)
      .send({ lat: 18.4575, lng: 73.8677 });
    expect(pinRes.statusCode).toBe(200);
    expect(pinRes.body.location.coordinates).toEqual([73.8677, 18.4575]);

    // Create a second owner farther away in Hinjewadi, Pune
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

    // Driver searches from right next to Katraj
    const nearbyRes = await request(app)
      .get("/api/slot?lat=18.4580&lng=73.8680")
      .set("Cookie", driverCookie);
    expect(nearbyRes.statusCode).toBe(200);
    expect(nearbyRes.body.slots.length).toBeGreaterThanOrEqual(2);

    // Closest building should come first
    expect(nearbyRes.body.slots[0].buildingName).toBe("Tech Park Plaza");
    expect(nearbyRes.body.slots[0].distanceKm).toBeLessThan(1);
    expect(nearbyRes.body.slots[1].buildingName).toBe("Hinjewadi Hub");
    expect(nearbyRes.body.slots[1].distanceKm).toBeGreaterThan(10);
  });
});