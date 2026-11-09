
const mongoose = require("mongoose");

// 1. Create the User schema
const userSchema = new mongoose.Schema(
  {
    // User's full name
    name: {
      type: String,
      required: true,
      trim: true
    },

    // Email used for login
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  "Please enter a valid email address"
  ]
    },

    // Store the hashed password, never plain text
    password: {
      type: String,
      required: true,
      select: false
    },

    // Defines what the user is allowed to do
    role: {
      type: String,
      enum: ["admin", "account_holder", "auditor"],
      default: "account_holder"
    },

    // Whether this user is active
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    // Automatically creates createdAt and updatedAt
    timestamps: true
  }
);

// 2. Create the User model
const User = mongoose.model("User", userSchema);

// 3. Export the model
module.exports = User;
