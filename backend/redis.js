const { createClient } = require("redis");

let redisClient = null;
let isRedisReady = false;
const memoryLocks = new Map();

async function connectRedis() {
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
      socket: { connectTimeout: 2000, reconnectStrategy: false },
    });

    redisClient.on("error", () => {
      isRedisReady = false;
    });

    await redisClient.connect();
    isRedisReady = true;
    console.log("Redis Connected Successfully");
  } catch (error) {
    isRedisReady = false;
    console.log("Redis not detected locally — using automatic In-Memory fallback");
  }
}

async function acquireSlotLock(slotId, driverId, ttlSeconds = 300) {
  const key = `lock:slot:${slotId}`;

  //If real Redis is connected
  if (isRedisReady && redisClient) {
    const result = await redisClient.set(key, driverId, { NX: true, EX: ttlSeconds });
    return result === "OK";
  }

  // Path B: Local Windows fallback using our Map
  const existingLock = memoryLocks.get(key);
  if (existingLock && existingLock.expiresAt > Date.now()) {
    return false; // Someone else's 5-minute timer is still running!
  }

  memoryLocks.set(key, {
    driverId,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  return true;
}

async function getSlotLockOwner(slotId) {
  const key = `lock:slot:${slotId}`;

  // Path A: Real Redis
  if (isRedisReady && redisClient) {
    return await redisClient.get(key);
  }

  // Path B: Windows In-Memory Map
  const existingLock = memoryLocks.get(key);
  if (!existingLock || existingLock.expiresAt <= Date.now()) {
    memoryLocks.delete(key); // Clean up expired lock
    return null;
  }
  return existingLock.driverId;
}

// 2. Delete the temporary lock once booking is confirmed (or cancelled)
async function releaseSlotLock(slotId) {
  const key = `lock:slot:${slotId}`;

  if (isRedisReady && redisClient) {
    await redisClient.del(key);
  } else {
    memoryLocks.delete(key);
  }
}

module.exports = { 
    connectRedis,
    acquireSlotLock,
    getSlotLockOwner,
    releaseSlotLock,
};