const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

const connectDB = require("./src/config/db");

const app = express();

app.use(helmet());

app.use(cors({
    origin: "http://localhost:5173"
}));

app.use(express.json());

app.get("/", (req, res) => {
    res.send("Welcome to LedgerLine Backend!");
});

app.get("/api/health", (req, res) => {
    res.json({
        status: "OK",
        message: "LedgerLine server is running"
    });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    await connectDB();

    app.listen(PORT, () => {
        console.log(`LedgerLine server running on port ${PORT}`);
    });
};

startServer();