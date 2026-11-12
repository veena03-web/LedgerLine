
-- Financial amounts must always be positive.
ALTER TABLE "Transaction"
ADD CONSTRAINT "Transaction_amountPaise_positive"
CHECK ("amountPaise" > 0);

ALTER TABLE "LedgerEntry"
ADD CONSTRAINT "LedgerEntry_amountPaise_positive"
CHECK ("amountPaise" > 0);

-- Account balance snapshots cannot be negative.
ALTER TABLE "LedgerEntry"
ADD CONSTRAINT "LedgerEntry_balanceAfterPaise_nonnegative"
CHECK ("balanceAfterPaise" IS NULL OR "balanceAfterPaise" >= 0);
