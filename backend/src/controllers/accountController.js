
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

module.exports = {
    createAccount,
    getMyAccounts,
    getAccountBalance
};