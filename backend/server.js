const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

const app = express();

// Security-related HTTP headers
app.use(helmet());

// Allow our frontend to communicate with backend
app.use(cors({
    origin: "http://localhost:5173"
}));

// Read JSON request bodies
app.use(express.json());

// First test route
app.get("/", (req, res) => {
    res.send("Welcome to LedgerLine Backend!");
});

// Health-check route
app.get("/api/health", (req, res) => {
    res.json({
        status: "OK",
        message: "LedgerLine server is running"
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`LedgerLine server running on port ${PORT}`);
});