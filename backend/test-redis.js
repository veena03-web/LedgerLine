
require("dotenv").config();

const { Redis } = require("@upstash/redis");

async function testRedis() {
    try {
        const redis = Redis.fromEnv();

        const result = await redis.ping();

        console.log("Redis connection successful!");
        console.log("Redis response:", result);

    } catch (error) {
        console.error("Redis connection failed:", error.message);
        process.exitCode = 1;
    }
}

testRedis();
