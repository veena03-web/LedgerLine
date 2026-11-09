
const mongoose = require("mongoose");

const ledgerEntrySchema = new mongoose.Schema(
  {
    // Which transaction created this entry?
    transaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: true
    },

    // Which account does this entry belong to?
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true
    },

    // Is money debited or credited?
    entryType: {
      type: String,
      enum: ["debit", "credit"],
      required: true
    },

    //This records the account balance immediately after the ledger entry is posted.
    balanceAfterPaise: {
  type: Number,
  required: true,
  min: 0
},

    initiatedBy: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  required: true
},

    // Amount stored in paise
    amountPaise: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: "Amount must be a safe integer in paise"
      }
    }
  },
  {
    timestamps: true
  }
);

// Create LedgerEntry model
const LedgerEntry = mongoose.model(
  "LedgerEntry",
  ledgerEntrySchema
);

module.exports = LedgerEntry;
