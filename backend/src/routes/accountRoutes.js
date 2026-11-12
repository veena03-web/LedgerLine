
const express = require("express");
const router = express.Router();

const {
    createAccount,
    getMyAccounts,
    getAccountBalance,
    getAllAccounts
} = require("../controllers/accountController");

const {
    authenticate,
    authorize
} = require("../middleware/authMiddleware");

// All routes require authentication
router.use(authenticate);

// Customer routes
router.post("/", authorize("ACCOUNT_HOLDER"), createAccount);
router.get("/", authorize("ACCOUNT_HOLDER"), getMyAccounts);
router.get("/:id/balance", authorize("ACCOUNT_HOLDER"), getAccountBalance);

// Admin-only route
router.get("/admin/all", authorize("ADMIN"), getAllAccounts);

module.exports = router;
