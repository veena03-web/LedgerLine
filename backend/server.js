
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

app.use(cors({
    origin: "http://localhost:5173"
}));

app.use(express.json());
app.use("/api/auth", authRoutes);

app.use("/api/accounts", accountRoutes);
app.use("/api/transactions", transactionRoutes);

app.get("/", (req, res) => {
    res.send("Welcome to BalanceVault Backend!");
});

// Basic health check: server is running
app.get("/api/health", (req, res) => {
    res.json({
        status: "OK",
        message: "BalanceVault server is running"
    });
});

// Readiness check: server and database are available
app.get("/api/ready", async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;

        res.json({
            status: "READY",
            database: "connected"
        });
    } catch (error) {
        res.status(503).json({
            status: "NOT_READY",
            database: "disconnected"
        });
    }
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    try {
        await prisma.$connect();

        console.log("PostgreSQL connected through Prisma!");

        app.listen(PORT, () => {
            console.log(`BalanceVault server running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Failed to connect to PostgreSQL:", error.message);
        process.exit(1);
    }
};

startServer();
