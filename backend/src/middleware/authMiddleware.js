
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

// Verify login token and identify the user
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        // Check Bearer token
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                message: "Authentication token is required"
            });
        }

        const token = authHeader.split(" ")[1];

        if (!token) {
            return res.status(401).json({
                message: "Invalid authentication token"
            });
        }

        // Verify token signature and claims
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET,
            {
                algorithms: ["HS256"],
                issuer: "balancevault-api",
                audience: "balancevault-client"
            }
        );

        // Get current user and role from database
                const user = await prisma.user.findUnique({
            where: { id: decoded.sub },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isActive: true,
                tokenVersion: true
            }
        });

                if (!user || !user.isActive) {
            return res.status(401).json({
                message: "User not found or account is inactive"
            });
        }

        // Reject tokens issued before a password reset
        if ((decoded.tokenVersion ?? 0) !== user.tokenVersion) {
            return res.status(401).json({
                message: "Session expired. Please log in again."
            });
        }

        // Attach authenticated user to request
        req.user = user;

        next();

    } catch (error) {
        if (error.name === "JsonWebTokenError" ||
            error.name === "TokenExpiredError" ||
            error.name === "NotBeforeError") {
            return res.status(401).json({
                message: "Invalid or expired token"
            });
        }

        console.error("Authentication error:", error.message);

        return res.status(500).json({
            message: "Authentication failed"
        });
    }
};

// Check whether the user has an allowed role
const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                message: "Please authenticate first"
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                message: "You do not have permission to access this resource"
            });
        }

        next();
    };
};

module.exports = {
    authenticate,
    authorize
};
