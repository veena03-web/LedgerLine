# Vaultora – Intelligent Ledger & Secure Banking System

**Secure financial management powered by double-entry accounting, transaction integrity, and role-based access control.**

Vaultora is a secure banking and financial transaction management application designed to provide reliable account operations, controlled money movement, and auditable financial records.

## Live Application

- **Frontend:** https://ledger-line-psi.vercel.app
- **Backend API:** https://balancevault-api-plnv.onrender.com
- **GitHub Repository:** https://github.com/veena03-web/LedgerLine

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React |
| Backend | Node.js, Express.js |
| ORM | Prisma |
| Database | PostgreSQL (Neon) |
| Rate Limiting | Redis (Upstash) |
| Authentication | JWT |
| Password Hashing | bcryptjs |

## Key Features

### Authentication and Authorization
- User registration and login.
- JWT-based authentication.
- Role-based access control.
- Supported roles: Admin, Account Holder, and Auditor.
- Redis-based login rate limiting.

### Account Management
- Customer account creation.
- Account ownership validation.
- Account balance tracking.
- Account status management.

### Financial Transactions
- Account-to-account money transfers.
- Administrator-controlled deposits.
- Integer-paise monetary calculations.
- Idempotency protection against duplicate requests.
- Overdraft prevention.
- Transaction concurrency protection.

### Double-Entry Ledger
- Debit and credit ledger entries.
- Equal and opposite ledger records for supported financial operations.
- Balance snapshots for customer ledger entries.
- Database constraints for positive transaction and ledger amounts.

### Transaction History
- Paginated transaction history endpoint.
- Newest transactions displayed first.
- Account-holder access restricted to their own accounts.
- Administrative and auditor access controlled by roles.

## Security and Reliability

- JWT authentication and authorization middleware.
- Password hashing using bcryptjs.
- Redis-backed login rate limiting.
- Database-level financial amount constraints.
- Transaction consistency through database transactions.
- Idempotency keys and request validation.
- Threat documentation maintained in `THREATS.md`.

## Project Structure

```text
LedgerLine/
├── frontend/
├── backend/
│   ├── prisma/
│   │   └── migrations/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   └── generated/
│   ├── tests/
│   ├── scripts/
│   └── package.json
├── PROMPTS.md
├── THREATS.md
└── README.md
```

## Local Setup

### Prerequisites
- Node.js
- npm
- PostgreSQL database
- Redis instance

### 1. Clone the repository

```bash
git clone https://github.com/veena03-web/LedgerLine.git
cd LedgerLine
```

### 2. Configure the backend

```bash
cd backend
npm install
```

Create a `.env` file using the environment variable names required by the backend configuration. Configure database connections, authentication secrets, and Redis credentials locally.

Never commit `.env` files or credentials.

### 3. Generate Prisma Client and apply migrations

```bash
npx prisma generate
npx prisma migrate deploy
```

### 4. Start the backend

```bash
npm run dev
```

### 5. Start the frontend

Open another terminal:

```bash
cd frontend
npm install
npm start
```

The frontend and backend configuration must point to the appropriate local API URLs.

## Testing

Run the backend test suite:

```bash
cd backend
npm test
```

The current backend test suite contains seven passing tests covering:
- API welcome and health endpoints.
- Deposit ledger entries and idempotency.
- Transfer correctness and idempotency.
- Overdraft rejection.
- Concurrent transfer protection.
- Database rejection of zero and negative ledger amounts.

## Documentation

- `PROMPTS.md` – AI-assisted development journal.
- `THREATS.md` – Security threat model.

## Current Development Status

Core authentication, account management, deposits, transfers, double-entry ledger operations, and backend reliability checks have been implemented.

Transaction history has been added to the backend and pushed to GitHub. Further feature development, live endpoint verification, integration testing, and security hardening remain ongoing.

---

**Vaultora – Intelligent Ledger & Secure Banking System**