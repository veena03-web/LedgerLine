
require("dotenv").config();

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const request = require("supertest");

const prisma = require("../src/config/prisma");
const app = require("../server");

let testUserId;
let testAccountId;
let testLedgerAccountId;
let testTransactionId;

test("Deposit creates two equal and opposite ledger entries", async () => {
  await prisma.$connect();

  const uniqueId = crypto.randomUUID();
  const email = `test-${uniqueId}@balancevault.local`;
  const accountNumber = `BV${uniqueId.replace(/-/g, "").slice(0, 16)}`;

  // 1. Create a temporary admin user
  const user = await prisma.user.create({
    data: {
      name: "Financial Test Admin",
      email,
      passwordHash: "test-only-password-hash",
      role: "ADMIN"
    }
  });

  testUserId = user.id;

  // 2. Create a customer ledger account
  const ledgerAccount = await prisma.ledgerAccount.create({
    data: {
      code: accountNumber,
      name: "Financial Test Customer Account",
      type: "CUSTOMER"
    }
  });

  testLedgerAccountId = ledgerAccount.id;

  // 3. Create a customer account with zero balance
  const account = await prisma.account.create({
    data: {
      ownerId: user.id,
      accountNumber,
      ledgerAccountId: ledgerAccount.id,
      balancePaise: 0n,
      currency: "INR"
    }
  });

  testAccountId = account.id;

  // 4. Generate a temporary admin JWT
  const token = jwt.sign(
    {},
    process.env.JWT_SECRET,
    {
      algorithm: "HS256",
      subject: user.id,
      issuer: "balancevault-api",
      audience: "balancevault-client",
      expiresIn: "5m"
    }
  );

  // 5. Call the actual deposit API: ₹100 = 10000 paise
  const response = await request(app)
    .post("/api/transactions/deposit")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `deposit-${uniqueId}`)
    .send({
      destinationAccountId: account.id,
      amountPaise: "10000"
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.transaction.amountPaise, "10000");

  testTransactionId = response.body.transaction.id;

  // 6. Check the customer's actual account balance
  const updatedAccount = await prisma.account.findUnique({
    where: { id: account.id }
  });

  assert.equal(updatedAccount.balancePaise, 10000n);

  // 7. Read the actual ledger entries
  const transaction = await prisma.transaction.findUnique({
    where: { id: testTransactionId },
    include: { entries: true }
  });

  assert.equal(transaction.entries.length, 2);

  const debit = transaction.entries.find(
    entry => entry.side === "DEBIT"
  );

  const credit = transaction.entries.find(
    entry => entry.side === "CREDIT"
  );

  assert.ok(debit, "Debit entry must exist");
  assert.ok(credit, "Credit entry must exist");

  assert.equal(debit.amountPaise, 10000n);
  assert.equal(credit.amountPaise, 10000n);

  assert.equal(
    debit.amountPaise,
    credit.amountPaise,
    "Total debits must equal total credits"
  );

  assert.equal(transaction.status, "POSTED");
});


test("Transfer moves money correctly between two accounts", async () => {
  await prisma.$connect();

  const uniqueId = crypto.randomUUID();
  const adminId = [];
  const customerId = [];
  const ledgerIds = [];
  const accountIds = [];

  try {
    // 1. Create temporary admin
    const admin = await prisma.user.create({
      data: {
        name: "Transfer Test Admin",
        email: `admin-${uniqueId}@balancevault.local`,
        passwordHash: "test-only-hash",
        role: "ADMIN"
      }
    });
    adminId.push(admin.id);

    // 2. Create temporary customer
    const customer = await prisma.user.create({
      data: {
        name: "Transfer Test Customer",
        email: `customer-${uniqueId}@balancevault.local`,
        passwordHash: "test-only-hash",
        role: "ACCOUNT_HOLDER"
      }
    });
    customerId.push(customer.id);

    // 3. Create two customer ledger accounts and bank accounts
    const sourceCode = `SRC${uniqueId.replace(/-/g, "").slice(0, 16)}`;
    const destinationCode = `DST${uniqueId.replace(/-/g, "").slice(0, 16)}`;

    const sourceLedger = await prisma.ledgerAccount.create({
      data: {
        code: sourceCode,
        name: "Transfer Source",
        type: "CUSTOMER"
      }
    });
    ledgerIds.push(sourceLedger.id);

    const destinationLedger = await prisma.ledgerAccount.create({
      data: {
        code: destinationCode,
        name: "Transfer Destination",
        type: "CUSTOMER"
      }
    });
    ledgerIds.push(destinationLedger.id);

    const source = await prisma.account.create({
      data: {
        ownerId: customer.id,
        accountNumber: sourceCode,
        ledgerAccountId: sourceLedger.id,
        balancePaise: 0n,
        currency: "INR"
      }
    });
    accountIds.push(source.id);

    const destination = await prisma.account.create({
      data: {
        ownerId: customer.id,
        accountNumber: destinationCode,
        ledgerAccountId: destinationLedger.id,
        balancePaise: 0n,
        currency: "INR"
      }
    });
    accountIds.push(destination.id);

    // 4. Generate temporary admin token
    const adminToken = jwt.sign({}, process.env.JWT_SECRET, {
      algorithm: "HS256",
      subject: admin.id,
      issuer: "balancevault-api",
      audience: "balancevault-client",
      expiresIn: "5m"
    });

    // 5. Deposit ₹100 into the source account
    const depositResponse = await request(app)
      .post("/api/transactions/deposit")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", `deposit-${uniqueId}`)
      .send({
        destinationAccountId: source.id,
        amountPaise: "10000"
      });

    assert.equal(depositResponse.status, 201);

    // 6. Generate customer token
    const customerToken = jwt.sign({}, process.env.JWT_SECRET, {
      algorithm: "HS256",
      subject: customer.id,
      issuer: "balancevault-api",
      audience: "balancevault-client",
      expiresIn: "5m"
    });

    // 7. Transfer ₹40 from source to destination
    const transferResponse = await request(app)
      .post("/api/transactions/transfer")
      .set("Authorization", `Bearer ${customerToken}`)
      .set("Idempotency-Key", `transfer-${uniqueId}`)
      .send({
        sourceAccountId: source.id,
        destinationAccountId: destination.id,
        amountPaise: "4000"
      });

    assert.equal(transferResponse.status, 201);

    // 8. Verify actual database balances
    const updatedSource = await prisma.account.findUnique({
      where: { id: source.id }
    });

    const updatedDestination = await prisma.account.findUnique({
      where: { id: destination.id }
    });

    assert.equal(updatedSource.balancePaise, 6000n);
    assert.equal(updatedDestination.balancePaise, 4000n);

    // 9. Verify transfer ledger entries
    const transaction = await prisma.transaction.findUnique({
      where: { id: transferResponse.body.transaction.id },
      include: { entries: true }
    });

    assert.equal(transaction.entries.length, 2);

    const debit = transaction.entries.find(
      entry => entry.side === "DEBIT"
    );

    const credit = transaction.entries.find(
      entry => entry.side === "CREDIT"
    );

    assert.ok(debit);
    assert.ok(credit);
    assert.equal(debit.amountPaise, 4000n);
    assert.equal(credit.amountPaise, 4000n);
    assert.equal(debit.ledgerAccountId, sourceLedger.id);
    assert.equal(credit.ledgerAccountId, destinationLedger.id);
    assert.equal(transaction.status, "POSTED");

    assert.equal(
      updatedSource.balancePaise + updatedDestination.balancePaise,
      10000n
    );

  } finally {
    // 10. Clean up only this test's temporary records
    const actorIds = [...adminId, ...customerId];

    if (actorIds.length) {
      await prisma.ledgerEntry.deleteMany({
        where: { initiatedById: { in: actorIds } }
      });

      await prisma.transaction.deleteMany({
        where: { initiatedById: { in: actorIds } }
      });

      await prisma.auditEvent.deleteMany({
        where: { actorId: { in: actorIds } }
      });
    }

    if (accountIds.length) {
      await prisma.account.deleteMany({
        where: { id: { in: accountIds } }
      });
    }

    if (ledgerIds.length) {
      await prisma.ledgerAccount.deleteMany({
        where: { id: { in: ledgerIds } }
      });
    }

    if (customerId.length) {
      await prisma.user.deleteMany({
        where: { id: { in: customerId } }
      });
    }

    if (adminId.length) {
      await prisma.user.deleteMany({
        where: { id: { in: adminId } }
      });
    }
  }
});


after(async () => {
  // Remove only records created by this test
  if (testUserId) {
    await prisma.ledgerEntry.deleteMany({
      where: { initiatedById: testUserId }
    });

    await prisma.transaction.deleteMany({
      where: { initiatedById: testUserId }
    });

    await prisma.auditEvent.deleteMany({
      where: { actorId: testUserId }
    });

    if (testAccountId) {
      await prisma.account.deleteMany({
        where: { id: testAccountId }
      });
    }

    if (testLedgerAccountId) {
      await prisma.ledgerAccount.deleteMany({
        where: { id: testLedgerAccountId }
      });
    }

    await prisma.user.deleteMany({
      where: { id: testUserId }
    });
  }

  await prisma.$disconnect();
});
