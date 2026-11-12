
const express = require("express");
const router = express.Router();

const {
  authenticate,
  authorize
} = require("../middleware/authMiddleware");

const {
  transferMoney,
  depositMoney
} = require("../controllers/transactionController");

// Transfer money: account holders only
router.post(
  "/transfer",
  authenticate,
  authorize("ACCOUNT_HOLDER"),
  transferMoney
);

// Deposit money: admins only
router.post(
  "/deposit",
  authenticate,
  authorize("ADMIN"),
  depositMoney
);

module.exports = router;
