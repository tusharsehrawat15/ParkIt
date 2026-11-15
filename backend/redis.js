const { createClient } = require("redis");

let redisClient = null;
let isRedisReady = false;

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

module.exports = { connectRedis };