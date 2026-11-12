
const express = require("express");
const router = express.Router();

const {
    createAccount,
    getMyAccounts,
    getAccountBalance
} = require("../controllers/accountController");

const {
    authenticate,
    authorize
} = require("../middleware/authMiddleware");

router.use(authenticate, authorize("ACCOUNT_HOLDER"));

router.post("/", createAccount);
router.get("/", getMyAccounts);
router.get("/:id/balance", getAccountBalance);

module.exports = router;
