const { createClient } = require("redis");

let redisClient = null;
let isRedisReady = false;
const memoryLocks = new Map();

async function connectRedis() {
  const redisUrl = process.env.REDIS_URL;
  const hasRemoteRedis = Boolean(redisUrl);

  try {
    redisClient = createClient({
      url: redisUrl || "redis://127.0.0.1:6379",
      socket: {
        connectTimeout: hasRemoteRedis ? 5000 : 1500,
        reconnectStrategy: hasRemoteRedis
          ? (retries) => (retries > 5 ? false : Math.min(retries * 200, 2000))
          : false,
      },
    });

    redisClient.on("ready", () => {
      isRedisReady = true;
    });

    redisClient.on("end", () => {
      isRedisReady = false;
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

  if (isRedisReady && redisClient) {
    const result = await redisClient.set(key, driverId, { NX: true, EX: ttlSeconds });
    return result === "OK";
  }

  const existingLock = memoryLocks.get(key);
  if (existingLock && existingLock.expiresAt > Date.now()) {
    return false;
  }

  memoryLocks.set(key, {
    driverId,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  return true;
}

async function getSlotLockOwner(slotId) {
  const key = `lock:slot:${slotId}`;

  if (isRedisReady && redisClient) {
    return await redisClient.get(key);
  }

  const existingLock = memoryLocks.get(key);
  if (!existingLock || existingLock.expiresAt <= Date.now()) {
    memoryLocks.delete(key);
    return null;
  }
  return existingLock.driverId;
}

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