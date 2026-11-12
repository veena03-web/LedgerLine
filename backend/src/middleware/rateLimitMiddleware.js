
const { Redis } = require("@upstash/redis");
const { Ratelimit } = require("@upstash/ratelimit");

// Connect to hosted Upstash Redis
const redis = Redis.fromEnv();

// Allow 5 login attempts per IP every 15 minutes
const loginLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "15 m"),
    analytics: true,
    prefix: "balancevault:login"
});

// Middleware to protect login endpoint
const rateLimitLogin = async (req, res, next) => {
    try {
        const identifier = req.ip || "unknown";

        const result = await loginLimiter.limit(identifier);

        res.setHeader("RateLimit-Limit", result.limit);
        res.setHeader("RateLimit-Remaining", result.remaining);
        res.setHeader("RateLimit-Reset", result.reset);

        if (!result.success) {
            return res.status(429).json({
                message: "Too many login attempts. Please try again later."
            });
        }

        next();

    } catch (error) {
        console.error("Redis rate limiter error:", error.message);

        // Fail closed: don't allow unprotected login if Redis is unavailable
        return res.status(503).json({
            message: "Login service temporarily unavailable. Please try again later."
        });
    }
};

module.exports = { rateLimitLogin };
