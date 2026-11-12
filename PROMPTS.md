
# BalanceVault - AI Development Journal

## Purpose

This document records how AI assistance was used during
BalanceVault development, including implementation guidance,
debugging, verification and corrections.

AI-generated suggestions were reviewed and tested before
being treated as working project functionality.

## Entry 1 - Project Initialization

**Date:** November 7, 2026

**Task:** Initialize the project structure.

**AI assistance:**
- Explained the React frontend and Node.js backend architecture.
- Guided project initialization and Git setup.
- Helped establish the initial database connection.

**Verification:**
- Started the React development server.
- Tested the Express health endpoint.
- Verified the initial database connection.

**Outcome:** Initial project structure created.

## Entry 2 - Database Architecture

**Task:** Design the financial database.

**AI assistance:**
- Explained users, accounts, ledger accounts and transactions.
- Helped design Prisma models and relationships.
- Explained why monetary values should use integer paise.

**Verification:**
- Validated the Prisma schema.
- Generated Prisma Client.
- Applied the initial database migration.
- Verified PostgreSQL connectivity.

**Outcome:** Core database models and relationships created.

## Entry 3 - Authentication and Authorization

**Task:** Implement secure user access.

**AI assistance:**
- Explained password hashing and JWT authentication.
- Guided implementation of registration and login.
- Explained role-based access control.

**Verification:**
- Tested registration and login.
- Tested protected user routes.
- Confirmed that an account holder cannot access
  an administrator-only endpoint.

**Outcome:** Authentication and role-based authorization implemented.

## Entry 4 - Redis Rate Limiting

**Task:** Protect login against repeated attempts.

**AI assistance:**
- Explained Redis-backed request limiting.
- Guided integration of Upstash Redis and rate limiting.
- Helped configure a sliding-window limit.

**Verification:**
- Verified Redis connectivity.
- Tested allowed and blocked login attempts.

**Outcome:** Login rate limiting implemented.

## Entry 5 - Account Management

**Task:** Implement customer account creation and access.

**AI assistance:**
- Guided account creation and account ownership validation.
- Explained the relationship between customer accounts
  and ledger accounts.

**Verification:**
- Tested account creation.
- Tested account listing and balance retrieval.
- Verified account data was stored in PostgreSQL.

**Outcome:** Account management endpoints implemented.

## Entry 6 - Double-Entry Accounting

**Task:** Implement deposits and transfers.

**AI assistance:**
- Explained debit and credit accounting.
- Guided implementation of paired ledger entries.
- Explained transactional balance updates.

**Verification:**
- Tested deposits.
- Checked that corresponding debit and credit entries
  have equal amounts.
- Tested successful transfers between customer accounts.

**Outcome:** Core double-entry transaction processing implemented.

## Entry 7 - Idempotency and Overdraft Prevention

**Task:** Prevent duplicate processing and overspending.

**AI assistance:**
- Explained idempotency keys and request hashing.
- Guided validation of available account balances.
- Explained atomic transaction handling.

**Verification:**
- Repeated a transfer with the same idempotency key.
- Confirmed that money was not transferred twice.
- Attempted an overdraft and verified that balances
  remained unchanged.

**Outcome:** Idempotency and overdraft protections tested.

## Entry 8 - Concurrency Safety

**Task:** Prevent simultaneous transfers from spending
the same available balance.

**AI assistance:**
- Explained PostgreSQL row-level locking.
- Guided use of SELECT FOR UPDATE.
- Explained Serializable transaction isolation.

**Verification:**
- Executed two concurrent ₹80 transfers from an account
  containing ₹100.
- Confirmed that only one transfer succeeded.
- Verified the final balances.

**Outcome:** Concurrent transfer protection verified.

## Entry 9 - Automated Testing

**Task:** Create repeatable API and financial tests.

**AI assistance:**
- Helped structure automated tests using Node.js test runner
  and Supertest.
- Explained test setup and cleanup.
- Helped diagnose transaction timeout issues.

**Verification:**
- Ran the automated test suite.
- Latest recorded result: 6 passed, 0 failed.

**Outcome:** Automated tests cover API health, deposits,
transfers, idempotency, overdrafts and concurrency.

## Entry 10 - Deployment and Debugging

**Date:** November 12, 2026

**Task:** Deploy the application.

**AI assistance:**
- Guided backend deployment on Render.
- Diagnosed the missing generated Prisma Client on deployment.
- Corrected the start command to use tsx.
- Guided frontend deployment on Vercel.
- Helped configure the public API URL and CORS.

**Verification:**
- Render deployment succeeded.
- `/api/health` returned OK.
- `/api/ready` confirmed database connectivity.
- Vercel frontend displayed the BalanceVault login screen.
- Live login and customer account creation succeeded.

**Outcome:** Frontend and backend deployed successfully.

## AI Usage Principles

1. AI was used as a development assistant, not as a replacement
   for testing or engineering decisions.
2. Suggested code was reviewed and verified.
3. Errors were investigated and corrected through testing.
4. Security limitations were documented instead of claiming
   unsupported protections.
5. Git commits were used to preserve development progress.

## Remaining Improvements

- Database-level ledger immutability.
- Restricted production database roles.
- More comprehensive API documentation.
- Transaction history and reconciliation.
- Additional integration and security tests.
