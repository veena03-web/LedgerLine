
const crypto = require("crypto");
const prisma = require("../config/prisma");

const createAccount = async (req, res) => {
    try {
        // Only account holders can create customer accounts
        if (req.user.role !== "ACCOUNT_HOLDER") {
            return res.status(403).json({
                message: "Only account holders can create customer accounts"
            });
        }

        const accountNumber =
            "BV" + crypto.randomBytes(8).toString("hex").toUpperCase();

        const account = await prisma.$transaction(async (tx) => {

            // 1. Create the customer's ledger account
            const ledgerAccount = await tx.ledgerAccount.create({
                data: {
                    code: accountNumber,
                    name: `Customer account ${accountNumber}`,
                    type: "CUSTOMER"
                }
            });

            // 2. Create the actual bank account
            const createdAccount = await tx.account.create({
                data: {
                    ownerId: req.user.id,
                    accountNumber,
                    ledgerAccountId: ledgerAccount.id,
                    balancePaise: 0,
                    currency: "INR",
                    status: "ACTIVE"
                },
                select: {
                    id: true,
                    accountNumber: true,
                    balancePaise: true,
                    currency: true,
                    status: true,
                    createdAt: true
                }
            });

            // 3. Record account creation in audit log
            await tx.auditEvent.create({
                data: {
                    actorId: req.user.id,
                    action: "ACCOUNT_CREATED",
                    targetType: "Account",
                    targetId: createdAccount.id,
                    ipAddress: req.ip
                }
            });

            return createdAccount;
        });

        return res.status(201).json({
            message: "Bank account created successfully",
            account: {
                ...account,
                balancePaise: account.balancePaise.toString()
            }
        });

    } catch (error) {
        console.error("Account creation error:", error.message);

        return res.status(500).json({
            message: "Could not create bank account"
        });
    }
};




// List accounts belonging to the logged-in user
const getMyAccounts = async (req, res) => {
    try {
        const accounts = await prisma.account.findMany({
            where: {
                ownerId: req.user.id
            },
            select: {
                id: true,
                accountNumber: true,
                balancePaise: true,
                currency: true,
                status: true,
                createdAt: true
            },
            orderBy: {
                createdAt: "desc"
            }
        });

        return res.json({
            count: accounts.length,
            accounts: accounts.map(account => ({
                ...account,
                balancePaise: account.balancePaise.toString()
            }))
        });

    } catch (error) {
        console.error(error.message);
        return res.status(500).json({
            message: "Could not retrieve accounts"
        });
    }
};


// View balance of an account owned by the logged-in user
const getAccountBalance = async (req, res) => {
    try {
        const account = await prisma.account.findFirst({
            where: {
                id: req.params.id,
                ownerId: req.user.id
            },
            select: {
                accountNumber: true,
                balancePaise: true,
                currency: true,
                status: true
            }
        });

        if (!account) {
            return res.status(404).json({
                message: "Account not found"
            });
        }

        return res.json({
            accountNumber: account.accountNumber,
            balancePaise: account.balancePaise.toString(),
            currency: account.currency,
            status: account.status
        });

    } catch (error) {
        console.error(error.message);
        return res.status(500).json({
            message: "Could not retrieve account balance"
        });
    }
};


// List all customer accounts - ADMIN ONLY
const getAllAccounts = async (req, res) => {
    try {
        const accounts = await prisma.account.findMany({
            select: {
                id: true,
                accountNumber: true,
                balancePaise: true,
                currency: true,
                status: true,
                createdAt: true
            },
            orderBy: {
                createdAt: "desc"
            }
        });

        return res.json({
            count: accounts.length,
            accounts: accounts.map(account => ({
                ...account,
                balancePaise: account.balancePaise.toString()
            }))
        });

    } catch (error) {
        console.error("Admin account retrieval error:", error.message);

        return res.status(500).json({
            message: "Could not retrieve customer accounts"
        });
    }
};


// PATCH /api/accounts/:id/close
// Admin: safely close a customer bank account
const closeAccount = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await prisma.$transaction(async (tx) => {
            // 1. Lock the account row to prevent concurrent changes
            const lockedAccounts = await tx.$queryRaw`
                SELECT id
                FROM "Account"
                WHERE id = ${id}::uuid
                FOR UPDATE
            `;

            if (lockedAccounts.length === 0) {
                return { notFound: true };
            }

            // 2. Retrieve the account after acquiring the lock
            const account = await tx.account.findUnique({
                where: { id },
                select: {
                    id: true,
                    accountNumber: true,
                    balancePaise: true,
                    status: true
                }
            });

            if (!account) {
                return { notFound: true };
            }

            // 3. Only active accounts can be closed
            if (account.status !== "ACTIVE") {
                return { invalidStatus: true, status: account.status };
            }

            // 4. An account must have zero balance
            if (account.balancePaise !== 0n) {
                return { nonZeroBalance: true };
            }

            // 5. Reject accounts with unresolved transactions
            const unresolvedTransactions = await tx.transaction.count({
                where: {
                    status: { in: ["PENDING"] },
                    OR: [
                        { sourceAccountId: id },
                        { destinationAccountId: id }
                    ]
                }
            });

            if (unresolvedTransactions > 0) {
                return { unresolvedTransactions: true };
            }

            // 6. Close the account without deleting financial records
            const closedAccount = await tx.account.update({
                where: { id },
                data: { status: "CLOSED" },
                select: {
                    id: true,
                    accountNumber: true,
                    balancePaise: true,
                    currency: true,
                    status: true
                }
            });

            // 7. Record the administrative action
            await tx.auditEvent.create({
                data: {
                    actorId: req.user.id,
                    action: "ACCOUNT_CLOSED",
                    targetType: "Account",
                    targetId: id,
                    ipAddress: req.ip
                }
            });

            return { account: closedAccount };
        }, {
            isolationLevel: "Serializable",
            maxWait: 10000,
            timeout: 15000
        });

        if (result.notFound) {
            return res.status(404).json({
                message: "Account not found"
            });
        }

        if (result.invalidStatus) {
            return res.status(409).json({
                message: `Only ACTIVE accounts can be closed. Current status: ${result.status}`
            });
        }

        if (result.nonZeroBalance) {
            return res.status(409).json({
                message: "Account cannot be closed because its balance is not zero"
            });
        }

        if (result.unresolvedTransactions) {
            return res.status(409).json({
                message: "Account cannot be closed because it has unresolved transactions"
            });
        }

        return res.status(200).json({
            message: "Bank account closed successfully",
            account: {
                ...result.account,
                balancePaise: result.account.balancePaise.toString()
            }
        });

    } catch (error) {
        console.error("Account closure error:", error.message);

        return res.status(500).json({
            message: "Could not close bank account"
        });
    }
};


module.exports = {
    createAccount,
    getMyAccounts,
    getAccountBalance,
    getAllAccounts,
    closeAccount
};