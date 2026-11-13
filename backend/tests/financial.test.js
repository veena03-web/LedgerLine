
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
