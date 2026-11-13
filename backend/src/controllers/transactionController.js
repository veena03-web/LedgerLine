
const crypto = require("crypto");
const prisma = require("../config/prisma");



const runReadCommittedTransaction = async (operation) => {
  return await prisma.$transaction(operation, {
    isolationLevel: "ReadCommitted"
  });
};



const transferMoney = async (req, res) => {
    try {
        const { sourceAccountId, destinationAccountId, amountPaise } = req.body;
        const idempotencyKey = req.headers["idempotency-key"];

        if (
            !sourceAccountId ||
            !destinationAccountId ||
            sourceAccountId === destinationAccountId ||
            typeof amountPaise !== "string" ||
            !/^[1-9]\d*$/.test(amountPaise) ||
            BigInt(amountPaise) > 9007199254740991n ||
            typeof idempotencyKey !== "string" ||
            idempotencyKey.length < 8 ||
            idempotencyKey.length > 128
        ) {
            return res.status(400).json({
                message: "Invalid transfer details or idempotency key"
            });
        }

        const amount = BigInt(amountPaise);

        const requestHash = crypto
            .createHash("sha256")
            .update(JSON.stringify({
                sourceAccountId,
                destinationAccountId,
                amountPaise
            }))
            .digest("hex");

        const result = await runReadCommittedTransaction(async (tx) => {

            // Check whether this request was already processed
            const existing = await tx.transaction.findUnique({
                where: {
                    initiatedById_idempotencyKey: {
                        initiatedById: req.user.id,
                        idempotencyKey
                    }
                },
                include: { entries: true }
            });

            if (existing) {
                if (existing.requestHash !== requestHash) {
                    return { error: "IDEMPOTENCY_CONFLICT" };
                }

                return { existing: true, transaction: existing };
            }

            // Lock both account rows in a consistent order
            const accounts = await tx.$queryRaw`
                SELECT id, "ownerId", "ledgerAccountId",
                       "balancePaise", status
                FROM "Account"
                WHERE id IN (
                    ${sourceAccountId}::uuid,
                    ${destinationAccountId}::uuid
                )
                ORDER BY id
                FOR UPDATE
            `;

            const source = accounts.find(
                account => account.id === sourceAccountId
            );

            const destination = accounts.find(
                account => account.id === destinationAccountId
            );

            if (!source || !destination) {
                return { error: "ACCOUNT_NOT_FOUND" };
            }

            if (source.ownerId !== req.user.id) {
                return { error: "SOURCE_NOT_OWNED" };
            }

            if (
                source.status !== "ACTIVE" ||
                destination.status !== "ACTIVE"
            ) {
                return { error: "ACCOUNT_INACTIVE" };
            }

            if (source.balancePaise < amount) {
                return { error: "INSUFFICIENT_BALANCE" };
            }

            // Create the transaction record
            const transaction = await tx.transaction.create({
                data: {
                    type: "TRANSFER",
                    amountPaise: amount,
                    sourceAccountId,
                    destinationAccountId,
                    initiatedById: req.user.id,
                    idempotencyKey,
                    requestHash,
                    status: "POSTED"
                }
            });

            // Update both account balances
            
// Update both account balances
const updatedSource = await tx.account.update({
    where: { id: sourceAccountId },
    data: { balancePaise: { decrement: amount } }
});

const updatedDestination = await tx.account.update({
    where: { id: destinationAccountId },
    data: { balancePaise: { increment: amount } }
});

// Create balanced double-entry ledger records
await tx.ledgerEntry.createMany({
    data: [
        {
            transactionId: transaction.id,
            ledgerAccountId: source.ledgerAccountId,
            initiatedById: req.user.id,
            lineNumber: 1,
            side: "DEBIT",
            amountPaise: amount,
            balanceAfterPaise: updatedSource.balancePaise
        },
        {
            transactionId: transaction.id,
            ledgerAccountId: destination.ledgerAccountId,
            initiatedById: req.user.id,
            lineNumber: 2,
            side: "CREDIT",
            amountPaise: amount,
            balanceAfterPaise: updatedDestination.balancePaise
        }
    ]
});


            // Record the transfer in the audit log
            await tx.auditEvent.create({
                data: {
                    actorId: req.user.id,
                    action: "MONEY_TRANSFERRED",
                    targetType: "Transaction",
                    targetId: transaction.id,
                    ipAddress: req.ip
                }
            });

            return { transaction };
        });

        if (result.error) {
            const errors = {
                IDEMPOTENCY_CONFLICT: [409, "Idempotency key reused with different details"],
                ACCOUNT_NOT_FOUND: [404, "Source or destination account not found"],
                SOURCE_NOT_OWNED: [403, "You do not own the source account"],
                ACCOUNT_INACTIVE: [409, "Both accounts must be active"],
                INSUFFICIENT_BALANCE: [409, "Insufficient balance"]
            };

            const [status, message] = errors[result.error];

            return res.status(status).json({ message });
        }

        
const transaction = result.transaction || result.existing;

return res.status(result.existing ? 200 : 201).json({
  message: result.existing
    ? "Transaction already processed."
    : "Transfer successful.",
  transaction: {
    id: transaction.id,
    type: transaction.type,
    amountPaise: transaction.amountPaise.toString(),
    status: transaction.status,
    sourceAccountId: transaction.sourceAccountId,
    destinationAccountId: transaction.destinationAccountId,
    createdAt: transaction.createdAt
  }
});


    } catch (error) {
        console.error("Transfer error:", error.message);

        if (error.code === "P2002") {
            return res.status(409).json({
                message: "Duplicate transaction request. Retry using the original idempotency key."
            });
        }

        if (
    error.code === "P2034" ||
    error.code === "40001" ||
    error.meta?.code === "40001" ||
    error.cause?.code === "40001"
) {
    return res.status(409).json({
        message: "Transaction conflict. Retry with the same idempotency key."
    });
}

        return res.status(500).json({
            message: "Transfer failed"
        });
    }
};

const depositMoney = async (req, res) => {
  try {
    const { destinationAccountId, amountPaise } = req.body;
    const idempotencyKey = req.headers["idempotency-key"];

    if (
      !destinationAccountId ||
      typeof amountPaise !== "string" ||
      !/^[1-9]\d*$/.test(amountPaise) ||
      typeof idempotencyKey !== "string" ||
      idempotencyKey.length < 8 ||
      idempotencyKey.length > 128
    ) {
      return res.status(400).json({
        message: "Invalid account, amount, or idempotency key."
      });
    }

    const amount = BigInt(amountPaise);

    const requestHash = crypto
      .createHash("sha256")
      .update(JSON.stringify({ destinationAccountId, amountPaise }))
      .digest("hex");

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.transaction.findUnique({
        where: {
          initiatedById_idempotencyKey: {
            initiatedById: req.user.id,
            idempotencyKey
          }
        }
      });

      if (existing) {
        if (existing.requestHash !== requestHash) {
          return { error: "IDEMPOTENCY_CONFLICT" };
        }
        return { existing };
      }

      const accounts = await tx.$queryRaw`
        SELECT id, "ledgerAccountId", "balancePaise", status
        FROM "Account"
        WHERE id = ${destinationAccountId}::uuid
        FOR UPDATE
      `;

      const account = accounts[0];

      if (!account) return { error: "ACCOUNT_NOT_FOUND" };
      if (account.status !== "ACTIVE") return { error: "ACCOUNT_INACTIVE" };

      const clearingAccount = await tx.ledgerAccount.upsert({
        where: { code: "SYSTEM_CASH_CLEARING" },
        update: {},
        create: {
          code: "SYSTEM_CASH_CLEARING",
          name: "System Cash Clearing",
          type: "CASH_CLEARING"
        }
      });

      const transaction = await tx.transaction.create({
        data: {
          type: "DEPOSIT",
          amountPaise: amount,
          destinationAccountId,
          initiatedById: req.user.id,
          idempotencyKey,
          requestHash,
          status: "POSTED"
        }
      });

      const updatedAccount = await tx.account.update({
        where: { id: destinationAccountId },
        data: { balancePaise: { increment: amount } }
      });

      await tx.ledgerEntry.createMany({
        data: [
          {
            transactionId: transaction.id,
            ledgerAccountId: clearingAccount.id,
            initiatedById: req.user.id,
            lineNumber: 1,
            side: "DEBIT",
            amountPaise: amount
          },
          {
            transactionId: transaction.id,
            ledgerAccountId: account.ledgerAccountId,
            initiatedById: req.user.id,
            lineNumber: 2,
            side: "CREDIT",
            amountPaise: amount,
            balanceAfterPaise: updatedAccount.balancePaise
          }
        ]
      });

      await tx.auditEvent.create({
        data: {
          actorId: req.user.id,
          action: "MONEY_DEPOSITED",
          targetType: "Transaction",
          targetId: transaction.id,
          ipAddress: req.ip
        }
      });

      return { transaction, updatedAccount };
    }, { isolationLevel: "Serializable" });

    if (result.error === "IDEMPOTENCY_CONFLICT") {
      return res.status(409).json({ message: "Idempotency key reused with different details." });
    }

    if (result.error === "ACCOUNT_NOT_FOUND") {
      return res.status(404).json({ message: "Account not found." });
    }

    if (result.error === "ACCOUNT_INACTIVE") {
      return res.status(409).json({ message: "Account is not active." });
    }

    const transaction = result.transaction || result.existing;

    return res.status(result.existing ? 200 : 201).json({
      message: result.existing ? "Deposit already processed." : "Deposit successful.",
      transaction: {
        id: transaction.id,
        type: transaction.type,
        amountPaise: transaction.amountPaise.toString(),
        status: transaction.status
      },
      balancePaise: result.updatedAccount
        ? result.updatedAccount.balancePaise.toString()
        : undefined
    });

  } catch (error) {
    console.error("Deposit error:", error.message);

    if (error.code === "P2002" || error.code === "P2034") {
      return res.status(409).json({
        message: "Transaction conflict. Retry using the same idempotency key."
      });
    }

    return res.status(500).json({ message: "Deposit failed." });
  }
};


const withdrawMoney = async (req, res) => {
  try {
    const { sourceAccountId, amountPaise } = req.body;
    const idempotencyKey = req.headers["idempotency-key"];

    if (
      !sourceAccountId ||
      typeof amountPaise !== "string" ||
      !/^[1-9]\d*$/.test(amountPaise) ||
      BigInt(amountPaise) > 9007199254740991n ||
      typeof idempotencyKey !== "string" ||
      idempotencyKey.length < 8 ||
      idempotencyKey.length > 128
    ) {
      return res.status(400).json({
        message: "Invalid withdrawal details or idempotency key."
      });
    }

    const amount = BigInt(amountPaise);

    const requestHash = crypto
      .createHash("sha256")
      .update(JSON.stringify({ sourceAccountId, amountPaise }))
      .digest("hex");

    const result = await prisma.$transaction(async (tx) => {
      // Check duplicate requests
      const existing = await tx.transaction.findUnique({
        where: {
          initiatedById_idempotencyKey: {
            initiatedById: req.user.id,
            idempotencyKey
          }
        }
      });

      if (existing) {
        if (existing.requestHash !== requestHash) {
          return { error: "IDEMPOTENCY_CONFLICT" };
        }
        return { existing };
      }

      // Lock the customer's account
      const accounts = await tx.$queryRaw`
        SELECT id, "ownerId", "ledgerAccountId",
               "balancePaise", status
        FROM "Account"
        WHERE id = ${sourceAccountId}::uuid
        FOR UPDATE
      `;

      const account = accounts[0];

      if (!account) return { error: "ACCOUNT_NOT_FOUND" };

      if (account.ownerId !== req.user.id) {
        return { error: "SOURCE_NOT_OWNED" };
      }

      if (account.status !== "ACTIVE") {
        return { error: "ACCOUNT_INACTIVE" };
      }

      if (account.balancePaise < amount) {
        return { error: "INSUFFICIENT_BALANCE" };
      }

      // Get or create the system cash-clearing ledger account
      const clearingAccount = await tx.ledgerAccount.upsert({
        where: { code: "SYSTEM_CASH_CLEARING" },
        update: {},
        create: {
          code: "SYSTEM_CASH_CLEARING",
          name: "System Cash Clearing",
          type: "CASH_CLEARING"
        }
      });

      // Create withdrawal transaction
      const transaction = await tx.transaction.create({
        data: {
          type: "WITHDRAWAL",
          amountPaise: amount,
          sourceAccountId,
          initiatedById: req.user.id,
          idempotencyKey,
          requestHash,
          status: "POSTED"
        }
      });

      // Deduct money from customer account
      const updatedAccount = await tx.account.update({
        where: { id: sourceAccountId },
        data: { balancePaise: { decrement: amount } }
      });

      // Create balanced double-entry ledger records
      await tx.ledgerEntry.createMany({
        data: [
          {
            transactionId: transaction.id,
            ledgerAccountId: account.ledgerAccountId,
            initiatedById: req.user.id,
            lineNumber: 1,
            side: "DEBIT",
            amountPaise: amount,
            balanceAfterPaise: updatedAccount.balancePaise
          },
          {
            transactionId: transaction.id,
            ledgerAccountId: clearingAccount.id,
            initiatedById: req.user.id,
            lineNumber: 2,
            side: "CREDIT",
            amountPaise: amount
          }
        ]
      });

      // Record audit event
      await tx.auditEvent.create({
        data: {
          actorId: req.user.id,
          action: "MONEY_WITHDRAWN",
          targetType: "Transaction",
          targetId: transaction.id,
          ipAddress: req.ip
        }
      });

      return { transaction, updatedAccount };
    }, {
      isolationLevel: "Serializable"
    });

    const errors = {
      IDEMPOTENCY_CONFLICT: [409, "Idempotency key reused with different details."],
      ACCOUNT_NOT_FOUND: [404, "Account not found."],
      SOURCE_NOT_OWNED: [403, "You do not own this account."],
      ACCOUNT_INACTIVE: [409, "Account is not active."],
      INSUFFICIENT_BALANCE: [409, "Insufficient balance."]
    };

    if (result.error) {
      const [status, message] = errors[result.error];
      return res.status(status).json({ message });
    }

    const transaction = result.transaction || result.existing;

    return res.status(result.existing ? 200 : 201).json({
      message: result.existing
        ? "Withdrawal already processed."
        : "Withdrawal successful.",
      transaction: {
        id: transaction.id,
        type: transaction.type,
        amountPaise: transaction.amountPaise.toString(),
        status: transaction.status,
        sourceAccountId: transaction.sourceAccountId,
        createdAt: transaction.createdAt
      },
      balancePaise: result.updatedAccount
        ? result.updatedAccount.balancePaise.toString()
        : undefined
    });

  } catch (error) {
    console.error("Withdrawal error:", error.message);

    if (
      error.code === "P2002" ||
      error.code === "P2034" ||
      error.code === "40001" ||
      error.meta?.code === "40001" ||
      error.cause?.code === "40001"
    ) {
      return res.status(409).json({
        message: "Transaction conflict. Retry using the same idempotency key."
      });
    }

    return res.status(500).json({
      message: "Withdrawal failed."
    });
  }
};

module.exports = {
  transferMoney,
  depositMoney,
  withdrawMoney
};

