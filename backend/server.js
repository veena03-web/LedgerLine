
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

require("dotenv").config();

const prisma = require("./src/config/prisma");

const authRoutes = require("./src/routes/authRoutes");
const accountRoutes = require("./src/routes/accountRoutes");
const transactionRoutes = require("./src/routes/transactionRoutes");

const app = express();

app.use(helmet());
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/transactions", transactionRoutes);

app.get("/", (req, res) => {
  res.json({ message: "Welcome to BalanceVault API" });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "BalanceVault is running" });
});

app.get("/api/ready", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "READY", database: "connected" });
  } catch (error) {
    res.status(503).json({ status: "NOT_READY", database: "disconnected" });
  }
});

module.exports = app;
