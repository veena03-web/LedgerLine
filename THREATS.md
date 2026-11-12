
# BalanceVault Threat Model

## 1. Purpose

BalanceVault is a money movement application designed around
double-entry accounting, controlled access and auditable transactions.

This document identifies security threats, implemented protections,
verification performed and remaining risks.

## 2. Assets to Protect

- User credentials and personal information
- Customer account balances
- Financial transactions
- Ledger entries
- Administrative operations
- Audit records
- Database connection credentials and JWT secrets

## 3. Threat Analysis

### Threat 1: Unauthorized Account Access

**Risk:** A user attempts to access another customer's account.

**Protection implemented:**
- JWT-based authentication.
- Password hashing using bcrypt.
- Server-side account ownership checks.
- Role-based access control.
- Inactive users cannot authenticate.

**Verification:** Tested registration, login, protected routes and
rejection of unauthorized administrative access.

**Status:** Implemented and tested.

### Threat 2: Duplicate Transactions

**Risk:** A client retries a transfer and accidentally processes
the same payment more than once.

**Protection implemented:**
- Idempotency keys.
- Unique database constraint on initiating user and idempotency key.
- Request hashing to detect reuse of a key with different details.

**Verification:** Automated test confirms that a repeated transfer
returns the existing transaction without moving money twice.

**Status:** Implemented and tested.

### Threat 3: Overdraft and Negative Balances

**Risk:** A customer attempts to transfer more money than the
available account balance.

**Protection implemented:**
- Server-side amount validation.
- Account status checks.
- Balance validation inside a database transaction.
- Atomic balance updates.

**Verification:** Automated test attempts to transfer more than
the available balance and confirms that balances remain unchanged.

**Status:** Implemented and tested.

### Threat 4: Concurrent Transfers

**Risk:** Multiple simultaneous transfers attempt to spend
the same available balance.

**Protection implemented:**
- PostgreSQL transactions.
- Row-level account locks using SELECT FOR UPDATE.
- Serializable transaction isolation.
- Transaction timeout configuration.

**Verification:** Automated concurrency test sends two simultaneous
transfers of ₹80 from an account containing ₹100. Only one succeeds.

**Status:** Implemented and tested.

### Threat 5: Unauthorized Administrative Operations

**Risk:** A normal customer attempts to perform an administrative
deposit or access administrator-only endpoints.

**Protection implemented:**
- ADMIN, ACCOUNT_HOLDER and AUDITOR roles.
- Server-side role authorization middleware.
- First-admin bootstrap script.
- Public registration cannot assign the ADMIN role.

**Verification:** Account-holder access to an admin-only endpoint
was rejected with HTTP 403. Administrator access was tested.

**Status:** Implemented and tested.

### Threat 6: Login Brute-Force Attempts

**Risk:** An attacker repeatedly guesses account passwords.

**Protection implemented:**
- Redis-backed sliding-window rate limiter.
- Maximum of five login attempts per 15 minutes.
- Requests exceeding the limit receive HTTP 429.
- Rate limiter fails closed if Redis is unavailable.

**Verification:** Redis connectivity and rate-limit behavior
were tested.

**Status:** Implemented and tested.

### Threat 7: Ledger and Audit Record Tampering

**Risk:** A privileged application user or database operator
attempts to modify historical financial records.

**Protection implemented:**
- Separate LedgerEntry records for debit and credit operations.
- AuditEvent records for important security and financial actions.
- Financial operations write related records transactionally.
- No normal customer API exposes ledger or audit modification.

**Remaining limitation:**
Database-level immutable triggers and restricted database roles
have not yet been implemented. A database administrator or
sufficiently privileged database role could still modify records.

**Status:** Application-level controls implemented;
database-level immutability pending.

### Threat 8: Exposure of Secrets

**Risk:** Database credentials, JWT secrets or Redis tokens
are accidentally exposed.

**Protection implemented:**
- Secrets are stored in environment variables.
- `.env` files are excluded from Git.
- Frontend configuration exposes only the public API URL.
- Passwords are hashed before database storage.

**Remaining limitation:**
Production secret rotation and a formal secrets-management
procedure should be established.

**Status:** Basic protections implemented.

## 4. Financial Integrity Design

- Monetary values are represented as integer paise.
- Transfers create corresponding debit and credit ledger entries.
- Deposits create corresponding cash-clearing and customer entries.
- Balance updates and transaction records are committed atomically.
- Idempotency prevents duplicate successful processing.

## 5. Testing Evidence

Automated tests cover:

1. API welcome endpoint.
2. API health endpoint.
3. Deposit and equal debit/credit ledger entries.
4. Successful transfers and duplicate idempotency requests.
5. Overdraft rejection.
6. Concurrent transfer safety.

Latest recorded test result: 6 tests passed, 0 failed.

## 6. Remaining Risks and Future Improvements

- Implement database-level ledger and audit immutability.
- Create restricted production database roles.
- Add automated database integrity constraints.
- Add transaction history and reconciliation reports.
- Improve monitoring, alerting and operational recovery.
- Add further security and failure-injection tests.

## 7. Conclusion

BalanceVault implements important application-level financial
integrity and access-control protections. Automated tests verify
key transaction scenarios. Database-level immutability and
restricted production database roles remain outstanding and
must not be considered completed.
