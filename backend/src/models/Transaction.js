
const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    // What kind of money movement?
    type: {
      type: String,
      enum: ["deposit", "withdrawal", "transfer"],
      required: true
    },

    // Account from which money is taken
    sourceAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      default: null
    },

    // Account receiving the money
    destinationAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      default: null
    },

    // Amount stored in paise
    amountPaise: {
  type: Number,
  required: true,
  min: 1,
  validate: {
    validator: Number.isSafeInteger,
    message: "Amount must be a positive safe integer in paise"
  }
},

    // User who requested the transaction
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    // Unique identifier for duplicate request protection
    idempotencyKey: {
  type: String,
  required: true,
  trim: true,
  minlength: 16,
  maxlength: 128
},

    // Current transaction state
    status: {
      type: String,
      enum: ["pending", "posted", "failed"],
      default: "pending"
    },

    // Optional explanation
    description: {
      type: String,
      trim: true,
      maxlength: 200
    }
  },
  {
    timestamps: true
  }
);

// One user cannot reuse an idempotency key
// for another transaction.
transactionSchema.index(
  { initiatedBy: 1, idempotencyKey: 1 },
  { unique: true }
);

// Create Transaction model
const Transaction = mongoose.model(
  "Transaction",
  transactionSchema
);

module.exports = Transaction;
