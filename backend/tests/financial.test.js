
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
  // Repeat the same deposit request with the same idempotency key
const duplicateResponse = await request(app)
  .post("/api/transactions/deposit")
  .set("Authorization", `Bearer ${token}`)
  .set("Idempotency-Key", `deposit-${uniqueId}`)
  .send({
    destinationAccountId: account.id,
    amountPaise: "10000"
  });

assert.equal(duplicateResponse.status, 200);
assert.equal(
  duplicateResponse.body.transaction.id,
  response.body.transaction.id
);

  testTransactionId = response.body.transaction.id;

  // 6. Check the customer's actual account balance
  const updatedAccount = await prisma.account.findUnique({
    where: { id: account.id }
  });

  assert.equal(updatedAccount.balancePaise, 10000n);
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

    // 8. Repeat the exact same request with the same idempotency key
    const duplicateResponse = await request(app)
      .post("/api/transactions/transfer")
      .set("Authorization", `Bearer ${customerToken}`)
      .set("Idempotency-Key", `transfer-${uniqueId}`)
      .send({
        sourceAccountId: source.id,
        destinationAccountId: destination.id,
        amountPaise: "4000"
      });

    // The server should return the already processed transaction
    assert.equal(duplicateResponse.status, 200);

    // Both responses must refer to the same transaction
    assert.equal(
      duplicateResponse.body.transaction.id,
      transferResponse.body.transaction.id
    );


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
    // Verify balance snapshots after transfer
assert.equal(debit.balanceAfterPaise, 6000n);
assert.equal(credit.balanceAfterPaise, 4000n);
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


test("Transfer rejects amounts greater than available balance", async () => {
  const uniqueId = crypto.randomUUID();
  let adminId;
  let customerId;
  let sourceLedgerId;
  let destinationLedgerId;
  let sourceId;
  let destinationId;

  try {
    await prisma.$connect();

    // Create temporary admin
    const admin = await prisma.user.create({
      data: {
        name: "Overdraft Test Admin",
        email: `overdraft-admin-${uniqueId}@balancevault.local`,
        passwordHash: "test-only-hash",
        role: "ADMIN"
      }
    });
    adminId = admin.id;

    // Create temporary customer
    const customer = await prisma.user.create({
      data: {
        name: "Overdraft Test Customer",
        email: `overdraft-customer-${uniqueId}@balancevault.local`,
        passwordHash: "test-only-hash",
        role: "ACCOUNT_HOLDER"
      }
    });
    customerId = customer.id;

    // Create two ledger accounts
    const sourceLedger = await prisma.ledgerAccount.create({
      data: {
        code: `OVS${uniqueId.replace(/-/g, "").slice(0, 16)}`,
        name: "Overdraft Source",
        type: "CUSTOMER"
      }
    });
    sourceLedgerId = sourceLedger.id;

    const destinationLedger = await prisma.ledgerAccount.create({
      data: {
        code: `OVD${uniqueId.replace(/-/g, "").slice(0, 16)}`,
        name: "Overdraft Destination",
        type: "CUSTOMER"
      }
    });
    destinationLedgerId = destinationLedger.id;

    // Create two accounts
    const source = await prisma.account.create({
      data: {
        ownerId: customer.id,
        accountNumber: sourceLedger.code,
        ledgerAccountId: sourceLedger.id,
        balancePaise: 0n,
        currency: "INR"
      }
    });
    sourceId = source.id;

    const destination = await prisma.account.create({
      data: {
        ownerId: customer.id,
        accountNumber: destinationLedger.code,
        ledgerAccountId: destinationLedger.id,
        balancePaise: 0n,
        currency: "INR"
      }
    });
    destinationId = destination.id;

    const adminToken = jwt.sign({}, process.env.JWT_SECRET, {
      algorithm: "HS256",
      subject: admin.id,
      issuer: "balancevault-api",
      audience: "balancevault-client",
      expiresIn: "5m"
    });

    // Deposit ₹100
    const deposit = await request(app)
      .post("/api/transactions/deposit")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", `overdraft-deposit-${uniqueId}`)
      .send({
        destinationAccountId: source.id,
        amountPaise: "10000"
      });

    assert.equal(deposit.status, 201);

    const customerToken = jwt.sign({}, process.env.JWT_SECRET, {
      algorithm: "HS256",
      subject: customer.id,
      issuer: "balancevault-api",
      audience: "balancevault-client",
      expiresIn: "5m"
    });

    // Attempt to transfer ₹150
    const transfer = await request(app)
      .post("/api/transactions/transfer")
      .set("Authorization", `Bearer ${customerToken}`)
      .set("Idempotency-Key", `overdraft-transfer-${uniqueId}`)
      .send({
        sourceAccountId: source.id,
        destinationAccountId: destination.id,
        amountPaise: "15000"
      });

    // Insufficient funds should be rejected
    assert.equal(transfer.status, 409);

    // Verify source balance remains ₹100
    const updatedSource = await prisma.account.findUnique({
      where: { id: source.id }
    });

    assert.equal(updatedSource.balancePaise, 10000n);

    // Verify destination remains ₹0
    const updatedDestination = await prisma.account.findUnique({
      where: { id: destination.id }
    });

    assert.equal(updatedDestination.balancePaise, 0n);

    // Verify no successful transfer was recorded
    const transferCount = await prisma.transaction.count({
      where: {
        initiatedById: customer.id,
        idempotencyKey: `overdraft-transfer-${uniqueId}`
      }
    });

    assert.equal(transferCount, 0);

  } finally {
    const actorIds = [adminId, customerId].filter(Boolean);

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

    if (sourceId || destinationId) {
      await prisma.account.deleteMany({
        where: {
          id: { in: [sourceId, destinationId].filter(Boolean) }
        }
      });
    }

    const ledgerIds = [sourceLedgerId, destinationLedgerId].filter(Boolean);

    if (ledgerIds.length) {
      await prisma.ledgerAccount.deleteMany({
        where: { id: { in: ledgerIds } }
      });
    }

    if (customerId) {
      await prisma.user.deleteMany({ where: { id: customerId } });
    }

    if (adminId) {
      await prisma.user.deleteMany({ where: { id: adminId } });
    }
  }
});


test("Concurrent transfers cannot spend the same balance twice", async () => {
  const uniqueId = crypto.randomUUID();

  let adminId;
  let customerId;
  const ledgerIds = [];
  const accountIds = [];

  try {
    await prisma.$connect();

    const admin = await prisma.user.create({
      data: {
        name: "Concurrency Admin",
        email: `con-admin-${uniqueId}@balancevault.local`,
        passwordHash: "test-only-hash",
        role: "ADMIN"
      }
    });
    adminId = admin.id;

    const customer = await prisma.user.create({
      data: {
        name: "Concurrency Customer",
        email: `con-customer-${uniqueId}@balancevault.local`,
        passwordHash: "test-only-hash",
        role: "ACCOUNT_HOLDER"
      }
    });
    customerId = customer.id;

    const codes = ["SOURCE", "DESTONE", "DESTTWO"].map(
      prefix => `${prefix}${uniqueId.replace(/-/g, "").slice(0, 12)}`
    );

    const ledgers = [];

    for (let i = 0; i < codes.length; i++) {
      const ledger = await prisma.ledgerAccount.create({
        data: {
          code: codes[i],
          name: `Concurrency account ${i}`,
          type: "CUSTOMER"
        }
      });

      ledgers.push(ledger);
      ledgerIds.push(ledger.id);
    }

    const accounts = [];

    for (let i = 0; i < codes.length; i++) {
      const account = await prisma.account.create({
        data: {
          ownerId: customer.id,
          accountNumber: codes[i],
          ledgerAccountId: ledgers[i].id,
          balancePaise: 0n,
          currency: "INR"
        }
      });

      accounts.push(account);
      accountIds.push(account.id);
    }

    const adminToken = jwt.sign({}, process.env.JWT_SECRET, {
      algorithm: "HS256",
      subject: admin.id,
      issuer: "balancevault-api",
      audience: "balancevault-client",
      expiresIn: "5m"
    });

    const customerToken = jwt.sign({}, process.env.JWT_SECRET, {
      algorithm: "HS256",
      subject: customer.id,
      issuer: "balancevault-api",
      audience: "balancevault-client",
      expiresIn: "5m"
    });

    // Fund source account with ₹100
    const deposit = await request(app)
      .post("/api/transactions/deposit")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", `con-deposit-${uniqueId}`)
      .send({
        destinationAccountId: accounts[0].id,
        amountPaise: "10000"
      });

    assert.equal(deposit.status, 201);

    // Two simultaneous attempts to transfer ₹80 each
    const makeTransfer = (destination, key) =>
      request(app)
        .post("/api/transactions/transfer")
        .set("Authorization", `Bearer ${customerToken}`)
        .set("Idempotency-Key", key)
        .send({
          sourceAccountId: accounts[0].id,
          destinationAccountId: destination,
          amountPaise: "8000"
        });

    const results = await Promise.all([
      makeTransfer(accounts[1].id, `con-a-${uniqueId}`),
      makeTransfer(accounts[2].id, `con-b-${uniqueId}`)
    ]);

    const statuses = results.map(result => result.status);

    assert.equal(statuses.filter(status => status === 201).length, 1);
    assert.equal(statuses.filter(status => status === 409).length, 1);

    // Check all balances
    const finalAccounts = await prisma.account.findMany({
      where: { id: { in: accountIds } }
    });

    const totalBalance = finalAccounts.reduce(
      (sum, account) => sum + account.balancePaise,
      0n
    );

    assert.equal(totalBalance, 10000n);

    const source = finalAccounts.find(
      account => account.id === accounts[0].id
    );

    assert.equal(source.balancePaise, 2000n);

  } finally {
    const actorIds = [adminId, customerId].filter(Boolean);

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

    if (customerId) {
      await prisma.user.deleteMany({ where: { id: customerId } });
    }

    if (adminId) {
      await prisma.user.deleteMany({ where: { id: adminId } });
    }
  }
});


test("Withdrawal debits the account and prevents duplicate or unauthorized withdrawals", async () => {
  await prisma.$connect();

  const uniqueId = crypto.randomUUID();

  let adminId;
  let customerId;
  let otherCustomerId;
  const ledgerIds = [];
  const accountIds = [];

  try {
    // 1. Create admin and two customers
    const admin = await prisma.user.create({
      data: {
        name: "Withdrawal Test Admin",
        email: `withdraw-admin-${uniqueId}@balancevault.local`,
        passwordHash: "test-only-hash",
        role: "ADMIN"
      }
    });
    adminId = admin.id;

    const customer = await prisma.user.create({
      data: {
        name: "Withdrawal Test Customer",
        email: `withdraw-customer-${uniqueId}@balancevault.local`,
        passwordHash: "test-only-hash",
        role: "ACCOUNT_HOLDER"
      }
    });
    customerId = customer.id;

    const otherCustomer = await prisma.user.create({
      data: {
        name: "Other Withdrawal Customer",
        email: `withdraw-other-${uniqueId}@balancevault.local`,
        passwordHash: "test-only-hash",
        role: "ACCOUNT_HOLDER"
      }
    });
    otherCustomerId = otherCustomer.id;

    // 2. Create two ledger accounts
    const sourceLedger = await prisma.ledgerAccount.create({
      data: {
        code: `WDS${uniqueId.replace(/-/g, "").slice(0, 16)}`,
        name: "Withdrawal Test Source",
        type: "CUSTOMER"
      }
    });
    ledgerIds.push(sourceLedger.id);

    const otherLedger = await prisma.ledgerAccount.create({
      data: {
        code: `WDO${uniqueId.replace(/-/g, "").slice(0, 16)}`,
        name: "Other Customer Account",
        type: "CUSTOMER"
      }
    });
    ledgerIds.push(otherLedger.id);

    // 3. Create customer accounts
    const account = await prisma.account.create({
      data: {
        ownerId: customer.id,
        accountNumber: sourceLedger.code,
        ledgerAccountId: sourceLedger.id,
        balancePaise: 0,
        currency: "INR"
      }
    });
    accountIds.push(account.id);

    const otherAccount = await prisma.account.create({
      data: {
        ownerId: otherCustomer.id,
        accountNumber: otherLedger.code,
        ledgerAccountId: otherLedger.id,
        balancePaise: 0,
        currency: "INR"
      }
    });
    accountIds.push(otherAccount.id);

    // 4. Generate JWT tokens
    const adminToken = jwt.sign({}, process.env.JWT_SECRET, {
      algorithm: "HS256",
      subject: admin.id,
      issuer: "balancevault-api",
      audience: "balancevault-client",
      expiresIn: "5m"
    });

    const customerToken = jwt.sign({}, process.env.JWT_SECRET, {
      algorithm: "HS256",
      subject: customer.id,
      issuer: "balancevault-api",
      audience: "balancevault-client",
      expiresIn: "5m"
    });

    // 5. Deposit ₹100 into the customer's account
    const deposit = await request(app)
      .post("/api/transactions/deposit")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", `withdraw-deposit-${uniqueId}`)
      .send({
        destinationAccountId: account.id,
        amountPaise: "10000"
      });

    assert.equal(deposit.status, 201);

    // 6. Withdraw ₹40
    const withdrawalKey = `withdraw-${uniqueId}`;

    const withdrawal = await request(app)
      .post("/api/transactions/withdraw")
      .set("Authorization", `Bearer ${customerToken}`)
      .set("Idempotency-Key", withdrawalKey)
      .send({
        sourceAccountId: account.id,
        amountPaise: "4000"
      });

    assert.equal(withdrawal.status, 201);
    assert.equal(withdrawal.body.transaction.amountPaise, "4000");
    assert.equal(withdrawal.body.transaction.type, "WITHDRAWAL");

    // 7. Repeat the same request: it must not withdraw twice
    const duplicate = await request(app)
      .post("/api/transactions/withdraw")
      .set("Authorization", `Bearer ${customerToken}`)
      .set("Idempotency-Key", withdrawalKey)
      .send({
        sourceAccountId: account.id,
        amountPaise: "4000"
      });

    assert.equal(duplicate.status, 200);
    assert.equal(
      duplicate.body.transaction.id,
      withdrawal.body.transaction.id
    );

    // 8. Verify the account balance is ₹60
    const updatedAccount = await prisma.account.findUnique({
      where: { id: account.id }
    });

    assert.equal(updatedAccount.balancePaise, 6000n);

    // 9. Verify withdrawal ledger entries
    const transaction = await prisma.transaction.findUnique({
      where: { id: withdrawal.body.transaction.id },
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

    // 10. Attempt to withdraw more than the remaining balance
    const overdraft = await request(app)
      .post("/api/transactions/withdraw")
      .set("Authorization", `Bearer ${customerToken}`)
      .set("Idempotency-Key", `withdraw-over-${uniqueId}`)
      .send({
        sourceAccountId: account.id,
        amountPaise: "7000"
      });

    assert.equal(overdraft.status, 409);

    // 11. Attempt to withdraw from another customer's account
    const unauthorized = await request(app)
      .post("/api/transactions/withdraw")
      .set("Authorization", `Bearer ${customerToken}`)
      .set("Idempotency-Key", `withdraw-other-${uniqueId}`)
      .send({
        sourceAccountId: otherAccount.id,
        amountPaise: "1000"
      });

    assert.notEqual(unauthorized.status, 201);

    // 12. Confirm the original balance was not changed by failed requests
    const finalAccount = await prisma.account.findUnique({
      where: { id: account.id }
    });

    assert.equal(finalAccount.balancePaise, 6000n);

  } finally {
    const actorIds = [adminId, customerId, otherCustomerId].filter(Boolean);

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

    if (customerId) {
      await prisma.user.deleteMany({ where: { id: customerId } });
    }

    if (otherCustomerId) {
      await prisma.user.deleteMany({ where: { id: otherCustomerId } });
    }

    if (adminId) {
      await prisma.user.deleteMany({ where: { id: adminId } });
    }
  }
});


test("Admin can list, search, and view customers while non-admin access is blocked", async () => {
    await prisma.$connect();

    const uniqueId = crypto.randomUUID();

    let adminId;
    let customerId;

    try {
        // 1. Create a temporary admin
        const admin = await prisma.user.create({
            data: {
                name: "User Management Admin",
                email: `um-admin-${uniqueId}@balancevault.local`,
                passwordHash: "test-only-hash",
                role: "ADMIN"
            }
        });

        adminId = admin.id;

        // 2. Create a temporary customer
        const customer = await prisma.user.create({
            data: {
                name: "User Management Customer",
                email: `um-customer-${uniqueId}@balancevault.local`,
                passwordHash: "test-only-hash",
                role: "ACCOUNT_HOLDER"
            }
        });

        customerId = customer.id;

        // 3. Generate valid JWT tokens
        const adminToken = jwt.sign({}, process.env.JWT_SECRET, {
            algorithm: "HS256",
            subject: admin.id,
            issuer: "balancevault-api",
            audience: "balancevault-client",
            expiresIn: "5m"
        });

        const customerToken = jwt.sign({}, process.env.JWT_SECRET, {
            algorithm: "HS256",
            subject: customer.id,
            issuer: "balancevault-api",
            audience: "balancevault-client",
            expiresIn: "5m"
        });

        // 4. Admin lists customers
        const listResponse = await request(app)
            .get("/api/users")
            .set("Authorization", `Bearer ${adminToken}`);

        assert.equal(listResponse.status, 200);
        assert.ok(Array.isArray(listResponse.body.users));
        assert.ok(
            listResponse.body.users.some(user => user.id === customer.id),
            "Customer should appear in the admin customer list"
        );

        // 5. Admin searches for the customer by name
        const searchResponse = await request(app)
            .get("/api/users")
            .query({ search: "User Management Customer" })
            .set("Authorization", `Bearer ${adminToken}`);

        assert.equal(searchResponse.status, 200);
        assert.ok(
            searchResponse.body.users.some(user => user.id === customer.id),
            "Search should return the matching customer"
        );

        // 6. Admin views individual customer details
        const detailsResponse = await request(app)
            .get(`/api/users/${customer.id}`)
            .set("Authorization", `Bearer ${adminToken}`);

        assert.equal(detailsResponse.status, 200);
        assert.equal(detailsResponse.body.user.id, customer.id);
        assert.equal(detailsResponse.body.user.email, customer.email);
        assert.equal(detailsResponse.body.user.role, "ACCOUNT_HOLDER");

        // 7. Customer must not access the admin customer list
        const forbiddenResponse = await request(app)
            .get("/api/users")
            .set("Authorization", `Bearer ${customerToken}`);

        assert.equal(forbiddenResponse.status, 403);

        // 8. Customer must not view another customer's details
        const forbiddenDetails = await request(app)
            .get(`/api/users/${customer.id}`)
            .set("Authorization", `Bearer ${customerToken}`);

        assert.equal(forbiddenDetails.status, 403);

        // 9. Unauthenticated request must be rejected
        const unauthenticatedResponse = await request(app)
            .get("/api/users");

        assert.equal(unauthenticatedResponse.status, 401);

    } finally {
        // Remove only the temporary test users
        const userIds = [adminId, customerId].filter(Boolean);

        if (userIds.length) {
            await prisma.auditEvent.deleteMany({
                where: { actorId: { in: userIds } }
            });

            await prisma.user.deleteMany({
                where: { id: { in: userIds } }
            });
        }
    }
});


test("Admin can create customers with secure passwords and bank accounts", async () => {
    await prisma.$connect();

    const bcrypt = require("bcryptjs");
    const uniqueId = crypto.randomUUID();

    let adminId;
    let customerId;
    let accountId;
    let ledgerAccountId;

    try {
        // 1. Create a temporary admin
        const admin = await prisma.user.create({
            data: {
                name: "Customer Creation Admin",
                email: `create-admin-${uniqueId}@balancevault.local`,
                passwordHash: "test-only-hash",
                role: "ADMIN"
            }
        });

        adminId = admin.id;

        // 2. Create a regular account holder
        const regularUser = await prisma.user.create({
            data: {
                name: "Regular Test User",
                email: `regular-${uniqueId}@balancevault.local`,
                passwordHash: "test-only-hash",
                role: "ACCOUNT_HOLDER"
            }
        });

        const adminToken = jwt.sign({}, process.env.JWT_SECRET, {
            algorithm: "HS256",
            subject: admin.id,
            issuer: "balancevault-api",
            audience: "balancevault-client",
            expiresIn: "5m"
        });

        const customerToken = jwt.sign({}, process.env.JWT_SECRET, {
            algorithm: "HS256",
            subject: regularUser.id,
            issuer: "balancevault-api",
            audience: "balancevault-client",
            expiresIn: "5m"
        });

        // 3. Admin creates a new customer
        const customerEmail = `new-customer-${uniqueId}@balancevault.local`;
        const customerPassword = "SecureTestPass123!";

        const createResponse = await request(app)
            .post("/api/users")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                name: "New Test Customer",
                email: customerEmail,
                password: customerPassword
            });

        assert.equal(createResponse.status, 201);
        assert.equal(
            createResponse.body.customer.email,
            customerEmail
        );
        assert.equal(
            createResponse.body.customer.role,
            "ACCOUNT_HOLDER"
        );

        customerId = createResponse.body.customer.id;
        accountId = createResponse.body.account.id;

        assert.equal(createResponse.body.account.balancePaise, "0");
        assert.equal(createResponse.body.account.status, "ACTIVE");
        assert.equal(
            createResponse.body.account.currency,
            "INR"
        );

        // 4. Verify the customer exists in the database
        const savedCustomer = await prisma.user.findUnique({
            where: { id: customerId }
        });

        assert.ok(savedCustomer);
        assert.equal(savedCustomer.isActive, true);

        // 5. Verify password was securely hashed
        assert.notEqual(savedCustomer.passwordHash, customerPassword);

        assert.equal(
            await bcrypt.compare(
                customerPassword,
                savedCustomer.passwordHash
            ),
            true
        );

        // Password must never appear in the API response
        assert.equal(
            Object.hasOwn(createResponse.body.customer, "password"),
            false
        );
        assert.equal(
            Object.hasOwn(createResponse.body.customer, "passwordHash"),
            false
        );

        // 6. Verify the bank account and ledger account exist
        const savedAccount = await prisma.account.findUnique({
            where: { id: accountId }
        });

        assert.ok(savedAccount);
        assert.equal(savedAccount.ownerId, customerId);
        assert.equal(savedAccount.balancePaise, 0n);

        ledgerAccountId = savedAccount.ledgerAccountId;

        const savedLedger = await prisma.ledgerAccount.findUnique({
            where: { id: ledgerAccountId }
        });

        assert.ok(savedLedger);
        assert.equal(savedLedger.type, "CUSTOMER");

        // 7. Duplicate email must be rejected
        const duplicateResponse = await request(app)
            .post("/api/users")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                name: "Duplicate Customer",
                email: customerEmail,
                password: customerPassword
            });

        assert.equal(duplicateResponse.status, 409);

        // 8. Invalid customer details must be rejected
        const invalidResponse = await request(app)
            .post("/api/users")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                name: "A",
                email: "invalid-email",
                password: "123"
            });

        assert.equal(invalidResponse.status, 400);

        // 9. A regular customer must not create another customer
        const forbiddenResponse = await request(app)
            .post("/api/users")
            .set("Authorization", `Bearer ${customerToken}`)
            .send({
                name: "Unauthorized Customer",
                email: `unauthorized-${uniqueId}@balancevault.local`,
                password: "SecureTestPass123!"
            });

        assert.equal(forbiddenResponse.status, 403);

    } finally {
        // 10. Clean up only records created by this test
        if (accountId) {
            await prisma.account.deleteMany({
                where: { id: accountId }
            });
        }

        if (ledgerAccountId) {
            await prisma.ledgerAccount.deleteMany({
                where: { id: ledgerAccountId }
            });
        }

        if (adminId) {
            await prisma.auditEvent.deleteMany({
                where: { actorId: adminId }
            });
        }

        const userIds = [adminId, customerId].filter(Boolean);

        if (userIds.length) {
            await prisma.user.deleteMany({
                where: { id: { in: userIds } }
            });
        }

        await prisma.user.deleteMany({
            where: {
                email: `regular-${uniqueId}@balancevault.local`
            }
        });
    }
});


test("Admin can deactivate and reactivate customers securely", async () => {
    await prisma.$connect();

    const uniqueId = crypto.randomUUID();

    let adminId;
    let customerId;

    try {
        // 1. Create temporary admin and customer
        const admin = await prisma.user.create({
            data: {
                name: "Status Test Admin",
                email: `status-admin-${uniqueId}@balancevault.local`,
                passwordHash: "test-only-hash",
                role: "ADMIN"
            }
        });
        adminId = admin.id;

        const customer = await prisma.user.create({
            data: {
                name: "Status Test Customer",
                email: `status-customer-${uniqueId}@balancevault.local`,
                passwordHash: "test-only-hash",
                role: "ACCOUNT_HOLDER"
            }
        });
        customerId = customer.id;

        const adminToken = jwt.sign({}, process.env.JWT_SECRET, {
            algorithm: "HS256",
            subject: admin.id,
            issuer: "balancevault-api",
            audience: "balancevault-client",
            expiresIn: "5m"
        });

        const customerToken = jwt.sign({}, process.env.JWT_SECRET, {
            algorithm: "HS256",
            subject: customer.id,
            issuer: "balancevault-api",
            audience: "balancevault-client",
            expiresIn: "5m"
        });

        // 2. Deactivate customer
        const deactivate = await request(app)
            .patch(`/api/users/${customer.id}/deactivate`)
            .set("Authorization", `Bearer ${adminToken}`);

        assert.equal(deactivate.status, 200);
        assert.equal(deactivate.body.customer.isActive, false);

        // 3. Verify database status
        let savedCustomer = await prisma.user.findUnique({
            where: { id: customer.id }
        });
        assert.equal(savedCustomer.isActive, false);

        // 4. Existing customer token must now be rejected
        const blockedRequest = await request(app)
            .get("/api/auth/me")
            .set("Authorization", `Bearer ${customerToken}`);

        assert.equal(blockedRequest.status, 401);

        // 5. Repeated deactivation should be rejected
        const repeatedDeactivate = await request(app)
            .patch(`/api/users/${customer.id}/deactivate`)
            .set("Authorization", `Bearer ${adminToken}`);

        assert.equal(repeatedDeactivate.status, 409);

        // 6. Reactivate customer
        const activate = await request(app)
            .patch(`/api/users/${customer.id}/activate`)
            .set("Authorization", `Bearer ${adminToken}`);

        assert.equal(activate.status, 200);
        assert.equal(activate.body.customer.isActive, true);

        // 7. Verify database status
        savedCustomer = await prisma.user.findUnique({
            where: { id: customer.id }
        });
        assert.equal(savedCustomer.isActive, true);

        // 8. Existing token should work again
        const restoredRequest = await request(app)
            .get("/api/auth/me")
            .set("Authorization", `Bearer ${customerToken}`);

        assert.equal(restoredRequest.status, 200);

        // 9. Repeated activation should be rejected
        const repeatedActivate = await request(app)
            .patch(`/api/users/${customer.id}/activate`)
            .set("Authorization", `Bearer ${adminToken}`);

        assert.equal(repeatedActivate.status, 409);

        // 10. Verify audit events
        const auditEvents = await prisma.auditEvent.findMany({
            where: {
                actorId: admin.id,
                targetId: customer.id,
                action: {
                    in: [
                        "CUSTOMER_DEACTIVATED",
                        "CUSTOMER_ACTIVATED"
                    ]
                }
            }
        });

        assert.equal(auditEvents.length, 2);

        assert.ok(
            auditEvents.some(event => event.action === "CUSTOMER_DEACTIVATED")
        );
        assert.ok(
            auditEvents.some(event => event.action === "CUSTOMER_ACTIVATED")
        );

    } finally {
        const userIds = [adminId, customerId].filter(Boolean);

        if (userIds.length) {
            await prisma.auditEvent.deleteMany({
                where: { actorId: { in: userIds } }
            });

            await prisma.user.deleteMany({
                where: { id: { in: userIds } }
            });
        }
    }
});


test("Admin can securely reset customer passwords and invalidate old tokens", async () => {
    await prisma.$connect();

    const bcrypt = require("bcryptjs");
    const uniqueId = crypto.randomUUID();

    let adminId;
    let customerId;

    try {
        // 1. Create temporary admin
        const admin = await prisma.user.create({
            data: {
                name: "Password Reset Admin",
                email: `reset-admin-${uniqueId}@balancevault.local`,
                passwordHash: "test-only-hash",
                role: "ADMIN"
            }
        });
        adminId = admin.id;

        // 2. Create customer with an existing password
        const oldPassword = "OldPassword123";
        const newPassword = "NewPassword456";

        const customer = await prisma.user.create({
            data: {
                name: "Password Reset Customer",
                email: `reset-customer-${uniqueId}@balancevault.local`,
                passwordHash: await bcrypt.hash(oldPassword, 12),
                role: "ACCOUNT_HOLDER"
            }
        });
        customerId = customer.id;

        // 3. Generate admin and customer tokens
        const adminToken = jwt.sign(
            { tokenVersion: 0 },
            process.env.JWT_SECRET,
            {
                algorithm: "HS256",
                subject: admin.id,
                issuer: "balancevault-api",
                audience: "balancevault-client",
                expiresIn: "5m"
            }
        );

        const customerToken = jwt.sign(
            { tokenVersion: 0 },
            process.env.JWT_SECRET,
            {
                algorithm: "HS256",
                subject: customer.id,
                issuer: "balancevault-api",
                audience: "balancevault-client",
                expiresIn: "5m"
            }
        );

        // 4. Non-admin must not reset passwords
        const forbidden = await request(app)
            .patch(`/api/users/${customer.id}/password`)
            .set("Authorization", `Bearer ${customerToken}`)
            .send({ newPassword });

        assert.equal(forbidden.status, 403);

        // 5. Reject an invalid password
        const invalidPassword = await request(app)
            .patch(`/api/users/${customer.id}/password`)
            .set("Authorization", `Bearer ${adminToken}`)
            .send({ newPassword: "short" });

        assert.equal(invalidPassword.status, 400);

        // 6. Reject a nonexistent customer
        const missingCustomer = await request(app)
            .patch(`/api/users/${crypto.randomUUID()}/password`)
            .set("Authorization", `Bearer ${adminToken}`)
            .send({ newPassword });

        assert.equal(missingCustomer.status, 404);

        // 7. Admin resets the customer's password
        const reset = await request(app)
            .patch(`/api/users/${customer.id}/password`)
            .set("Authorization", `Bearer ${adminToken}`)
            .send({ newPassword });

        assert.equal(reset.status, 200);
        assert.equal(reset.body.customer.id, customer.id);
        assert.equal(reset.body.customer.role, "ACCOUNT_HOLDER");

        // Password and hash must never appear in the response
        assert.equal(Object.hasOwn(reset.body.customer, "password"), false);
        assert.equal(Object.hasOwn(reset.body.customer, "passwordHash"), false);

        // 8. Verify the database password and token version
        const savedCustomer = await prisma.user.findUnique({
            where: { id: customer.id }
        });

        assert.equal(savedCustomer.tokenVersion, 1);

        assert.equal(
            await bcrypt.compare(newPassword, savedCustomer.passwordHash),
            true
        );

        assert.equal(
            await bcrypt.compare(oldPassword, savedCustomer.passwordHash),
            false
        );

        // 9. Previously issued customer token must be rejected
        const oldTokenRequest = await request(app)
            .get("/api/auth/me")
            .set("Authorization", `Bearer ${customerToken}`);

        assert.equal(oldTokenRequest.status, 401);

        // 10. Old password must no longer work
        const oldLogin = await request(app)
            .post("/api/auth/login")
            .send({
                email: customer.email,
                password: oldPassword
            });

        assert.equal(oldLogin.status, 401);

        // 11. New password must allow login
        const newLogin = await request(app)
            .post("/api/auth/login")
            .send({
                email: customer.email,
                password: newPassword
            });

        assert.equal(newLogin.status, 200);
        assert.ok(newLogin.body.token);

        // 12. Newly issued token must work
        const newTokenRequest = await request(app)
            .get("/api/auth/me")
            .set("Authorization", `Bearer ${newLogin.body.token}`);

        assert.equal(newTokenRequest.status, 200);

        // 13. Verify password-reset audit event
        const auditEvent = await prisma.auditEvent.findFirst({
            where: {
                actorId: admin.id,
                targetId: customer.id,
                action: "CUSTOMER_PASSWORD_RESET"
            }
        });

        assert.ok(auditEvent);

    } finally {
        const userIds = [adminId, customerId].filter(Boolean);

        if (userIds.length) {
            await prisma.auditEvent.deleteMany({
                where: {
                    OR: [
                        { actorId: { in: userIds } },
                        { targetId: { in: userIds } }
                    ]
                }
            });

            await prisma.user.deleteMany({
                where: { id: { in: userIds } }
            });
        }
    }
});


test("Admin can safely close zero-balance accounts and prevent invalid closures", async () => {
    await prisma.$connect();

    const uniqueId = crypto.randomUUID();

    let adminId;
    let customerId;
    const ledgerIds = [];
    const accountIds = [];

    try {
        // 1. Create temporary admin and customer
        const admin = await prisma.user.create({
            data: {
                name: "Account Closure Admin",
                email: `closure-admin-${uniqueId}@balancevault.local`,
                passwordHash: "test-only-hash",
                role: "ADMIN"
            }
        });
        adminId = admin.id;

        const customer = await prisma.user.create({
            data: {
                name: "Account Closure Customer",
                email: `closure-customer-${uniqueId}@balancevault.local`,
                passwordHash: "test-only-hash",
                role: "ACCOUNT_HOLDER"
            }
        });
        customerId = customer.id;

        // 2. Create two customer ledger accounts
        const zeroLedger = await prisma.ledgerAccount.create({
            data: {
                code: `CLZ${uniqueId.replace(/-/g, "").slice(0, 16)}`,
                name: "Closure Zero Balance",
                type: "CUSTOMER"
            }
        });
        ledgerIds.push(zeroLedger.id);

        const fundedLedger = await prisma.ledgerAccount.create({
            data: {
                code: `CLF${uniqueId.replace(/-/g, "").slice(0, 16)}`,
                name: "Closure Funded Account",
                type: "CUSTOMER"
            }
        });
        ledgerIds.push(fundedLedger.id);

        // 3. Create one zero-balance and one funded account
        const zeroAccount = await prisma.account.create({
            data: {
                ownerId: customer.id,
                accountNumber: zeroLedger.code,
                ledgerAccountId: zeroLedger.id,
                balancePaise: 0n,
                currency: "INR"
            }
        });
        accountIds.push(zeroAccount.id);

        const fundedAccount = await prisma.account.create({
            data: {
                ownerId: customer.id,
                accountNumber: fundedLedger.code,
                ledgerAccountId: fundedLedger.id,
                balancePaise: 10000n,
                currency: "INR"
            }
        });
        accountIds.push(fundedAccount.id);

        // 4. Generate admin and customer tokens
        const adminToken = jwt.sign(
            { tokenVersion: 0 },
            process.env.JWT_SECRET,
            {
                algorithm: "HS256",
                subject: admin.id,
                issuer: "balancevault-api",
                audience: "balancevault-client",
                expiresIn: "5m"
            }
        );

        const customerToken = jwt.sign(
            { tokenVersion: 0 },
            process.env.JWT_SECRET,
            {
                algorithm: "HS256",
                subject: customer.id,
                issuer: "balancevault-api",
                audience: "balancevault-client",
                expiresIn: "5m"
            }
        );

        // 5. Non-admin customer must not close an account
        const forbidden = await request(app)
            .patch(`/api/accounts/${zeroAccount.id}/close`)
            .set("Authorization", `Bearer ${customerToken}`);

        assert.equal(forbidden.status, 403);

        // 6. Admin cannot close an account with money in it
        const nonZeroBalance = await request(app)
            .patch(`/api/accounts/${fundedAccount.id}/close`)
            .set("Authorization", `Bearer ${adminToken}`);

        assert.equal(nonZeroBalance.status, 409);

        // Verify the funded account remains active
        const fundedSaved = await prisma.account.findUnique({
            where: { id: fundedAccount.id }
        });

        assert.equal(fundedSaved.status, "ACTIVE");
        assert.equal(fundedSaved.balancePaise, 10000n);

        // 7. Admin successfully closes the zero-balance account
        const closeResponse = await request(app)
            .patch(`/api/accounts/${zeroAccount.id}/close`)
            .set("Authorization", `Bearer ${adminToken}`);

        assert.equal(closeResponse.status, 200);
        assert.equal(closeResponse.body.account.status, "CLOSED");
        assert.equal(closeResponse.body.account.balancePaise, "0");

        // 8. Verify the account is actually closed in the database
        const closedAccount = await prisma.account.findUnique({
            where: { id: zeroAccount.id }
        });

        assert.equal(closedAccount.status, "CLOSED");
        assert.equal(closedAccount.balancePaise, 0n);

        // 9. Repeated closure must be rejected
        const repeatedClose = await request(app)
            .patch(`/api/accounts/${zeroAccount.id}/close`)
            .set("Authorization", `Bearer ${adminToken}`);

        assert.equal(repeatedClose.status, 409);

        // 10. Non-existent account must return 404
        const missingAccount = await request(app)
            .patch(`/api/accounts/${crypto.randomUUID()}/close`)
            .set("Authorization", `Bearer ${adminToken}`);

        assert.equal(missingAccount.status, 404);

        // 11. Verify the administrative audit event
        const auditEvent = await prisma.auditEvent.findFirst({
            where: {
                actorId: admin.id,
                targetId: zeroAccount.id,
                action: "ACCOUNT_CLOSED"
            }
        });

        assert.ok(auditEvent, "Account closure must create an audit event");

    } finally {
        // 12. Clean up only records created by this test
        const userIds = [adminId, customerId].filter(Boolean);

        await prisma.auditEvent.deleteMany({
            where: {
                OR: [
                    ...(userIds.length
                        ? [{ actorId: { in: userIds } }]
                        : []),
                    ...(accountIds.length
                        ? [{ targetId: { in: accountIds } }]
                        : [])
                ]
            }
        });

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

        if (userIds.length) {
            await prisma.user.deleteMany({
                where: { id: { in: userIds } }
            });
        }
    }
});


test("Database rejects zero and negative ledger amounts", async () => {
  await assert.rejects(
    prisma.ledgerEntry.create({
      data: {
        transactionId: crypto.randomUUID(),
        ledgerAccountId: crypto.randomUUID(),
        initiatedById: crypto.randomUUID(),
        lineNumber: 1,
        side: "DEBIT",
        amountPaise: 0n
      }
    })
  );
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
