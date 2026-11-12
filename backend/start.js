
require("dotenv").config();

const app = require("./server");
const prisma = require("./src/config/prisma");

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await prisma.$connect();
    console.log("PostgreSQL connected through Prisma!");

    app.listen(PORT, () => {
      console.log(`BalanceVault server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
}

startServer();
