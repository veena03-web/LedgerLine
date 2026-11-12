
require("dotenv").config();

const prisma = require("./src/config/prisma");

async function testDatabase() {
    try {
        const result = await prisma.$queryRaw`SELECT 1 AS connected`;

        console.log("PostgreSQL connection successful!");
        console.log("Database test result:", result);
    } catch (error) {
        console.error("Database connection failed:");
        console.error(error.message);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

testDatabase();
