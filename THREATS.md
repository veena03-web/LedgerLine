# LedgerLine Threat Model

## Purpose

Identify ways an attacker or system failure
could compromise financial integrity.

## Threats

To be identified, evaluated, tested and documented.



## 1. Unauthorized Account Access

Threat:
A user attempts to access another user's account.

Planned Protection:
Server-side authentication and account ownership checks.

Status: Not implemented yet.

## 2. Duplicate Transactions

Threat:
A user submits the same transfer request multiple times.

Planned Protection:
Idempotency keys.

Status: Not implemented yet.

## 3. Negative Account Balance

Threat:
A user attempts to withdraw more money than available.

Planned Protection:
Server-side balance validation and atomic database transactions.

Status: Not implemented yet.

## 4. Concurrent Withdrawals

Threat:
Multiple withdrawal requests happen simultaneously.

Planned Protection:
Database transactions and concurrency-safe balance updates.

Status: Not implemented yet.

## 5. Audit Record Manipulation

Threat:
Someone attempts to modify historical financial records.

Planned Protection:
Append-only application controls and restricted database permissions.

Status: Not implemented yet.