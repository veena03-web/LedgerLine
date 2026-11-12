
require("dotenv").config();

const { test, after } = require("node:test");
const assert = require("node:assert/strict");

const prisma = require("../src/config/prisma");

test("PostgreSQL is accessible to the financial test suite", async () => {
  await prisma.$connect();

  const result = await prisma.$queryRaw`
    SELECT 1 AS connected
  `;

  assert.equal(Number(result[0].connected), 1);
});

after(async () => {
  await prisma.$disconnect();
});
