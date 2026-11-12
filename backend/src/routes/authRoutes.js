
const express = require("express");
const router = express.Router();

const { register, login } = require("../controllers/authController");
const { rateLimitLogin } = require("../middleware/rateLimitMiddleware");

const {
    authenticate,
    authorize
} = require("../middleware/authMiddleware");

// Public routes
router.post("/register", register);
router.post("/login", rateLimitLogin, login);

// Protected route: any authenticated user
router.get("/me", authenticate, (req, res) => {
    res.json({
        message: "Authenticated successfully",
        user: req.user
    });
});

// Admin-only route
router.get(
    "/admin-check",
    authenticate,
    authorize("ADMIN"),
    (req, res) => {
        res.json({
            message: "Welcome, administrator!"
        });
    }
);

module.exports = router;
