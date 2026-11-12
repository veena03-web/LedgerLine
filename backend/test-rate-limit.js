
require("dotenv").config();

const { Redis } = require("@upstash/redis");
const { Ratelimit } = require("@upstash/ratelimit");

async function testRateLimit() {
    const redis = Redis.fromEnv();

    const limiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, "15 m"),
        prefix: "balancevault:test"
    });

    try {
        console.log("Testing Redis rate limiter...\n");

        for (let i = 1; i <= 6; i++) {
            const result = await limiter.limit("test-user-123");

            console.log(
                `Attempt ${i}:`,
                result.success ? "ALLOWED" : "BLOCKED",
                `| Remaining: ${result.remaining}`
            );
        }

    } catch (error) {
        console.error("Test failed:", error.message);
        process.exitCode = 1;
    }
}

testRateLimit();
