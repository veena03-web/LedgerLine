
const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema(
  {
    // Which user owns this account?
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    // Unique account number
    accountNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },

    // Balance stored in paise
    balancePaise: {
  type: Number,
  required: true,
  default: 0,
  min: 0,
  validate: [
    {
      validator: Number.isSafeInteger,
      message: "Balance must be a safe integer in paise"
    }
  ]
},

    // Currency used by this account
    currency: {
      type: String,
      default: "INR",
      enum: ["INR"]
    },

    // Account status
    status: {
      type: String,
      enum: ["active", "frozen", "closed"],
      default: "active"
    }
  },
  {
    timestamps: true
  }
);

// Create Account model
const Account = mongoose.model("Account", accountSchema);

// Export model
module.exports = Account;
