
const express = require("express");
const router = express.Router();

const {
  authenticate,
  authorize
} = require("../middleware/authMiddleware");

const {
  transferMoney,
  depositMoney,
  withdrawMoney
} = require("../controllers/transactionController");


const {
  getTransactionHistory
} = require("../controllers/transactionHistoryController");

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
// Withdraw money: account holders only
router.post(
  "/withdraw",
  authenticate,
  authorize("ACCOUNT_HOLDER"),
  withdrawMoney
);

// Transaction history: account holders, admins and auditors
router.get(
  "/history",
  authenticate,
  authorize("ACCOUNT_HOLDER", "ADMIN", "AUDITOR"),
  getTransactionHistory
);

module.exports = router;
