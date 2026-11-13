
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const prisma = require("../config/prisma");

// POST /api/users
// Admin: create a customer and their first bank account
const createCustomer = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // 1. Validate input
        if (
            typeof name !== "string" ||
            typeof email !== "string" ||
            typeof password !== "string"
        ) {
            return res.status(400).json({
                message: "Name, email and password are required"
            });
        }

        const cleanName = name.trim();
        const cleanEmail = email.trim().toLowerCase();

        if (cleanName.length < 2 || cleanName.length > 100) {
            return res.status(400).json({
                message: "Name must contain between 2 and 100 characters"
            });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
            return res.status(400).json({
                message: "Please provide a valid email address"
            });
        }

        if (password.length < 8 || password.length > 72) {
            return res.status(400).json({
                message: "Password must contain between 8 and 72 characters"
            });
        }

        // 2. Hash password before storing it
        const passwordHash = await bcrypt.hash(password, 12);

        // 3. Generate a unique bank account number
        const accountNumber =
            "BV" + crypto.randomBytes(8).toString("hex").toUpperCase();

        // 4. Create customer, ledger account and bank account atomically
        const result = await prisma.$transaction(async (tx) => {
            const customer = await tx.user.create({
                data: {
                    name: cleanName,
                    email: cleanEmail,
                    passwordHash,
                    role: "ACCOUNT_HOLDER",
                    isActive: true
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    isActive: true,
                    createdAt: true
                }
            });

            const ledgerAccount = await tx.ledgerAccount.create({
                data: {
                    code: accountNumber,
                    name: `Customer account ${accountNumber}`,
                    type: "CUSTOMER"
                }
            });

            const account = await tx.account.create({
                data: {
                    ownerId: customer.id,
                    accountNumber,
                    ledgerAccountId: ledgerAccount.id,
                    balancePaise: 0n,
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

            // Record customer creation
            await tx.auditEvent.create({
                data: {
                    actorId: req.user.id,
                    action: "CUSTOMER_CREATED",
                    targetType: "User",
                    targetId: customer.id,
                    ipAddress: req.ip
                }
            });

            // Record bank account creation
            await tx.auditEvent.create({
                data: {
                    actorId: req.user.id,
                    action: "ACCOUNT_CREATED",
                    targetType: "Account",
                    targetId: account.id,
                    ipAddress: req.ip
                }
            });

            return { customer, account };
        });

        return res.status(201).json({
            message: "Customer and bank account created successfully",
            customer: result.customer,
            account: {
                ...result.account,
                balancePaise: result.account.balancePaise.toString()
            }
        });

    } catch (error) {
        if (error.code === "P2002") {
            return res.status(409).json({
                message: "A customer with this email already exists"
            });
        }

        console.error("Customer creation error:", error.message);

        return res.status(500).json({
            message: "Could not create customer"
        });
    }
};


// GET /api/users
// Admin: list account holders with optional search and pagination
const getUsers = async (req, res) => {
    try {
        const search = String(req.query.search || "").trim();
        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        const limit = Math.min(
            50,
            Math.max(1, Number.parseInt(req.query.limit, 10) || 10)
        );

        const where = {
            role: "ACCOUNT_HOLDER",
            ...(search
                ? {
                    OR: [
                        { name: { contains: search, mode: "insensitive" } },
                        { email: { contains: search, mode: "insensitive" } },
                        {
                            accounts: {
                                some: {
                                    accountNumber: {
                                        contains: search,
                                        mode: "insensitive"
                                    }
                                }
                            }
                        }
                    ]
                }
                : {})
        };

        const [users, total] = await prisma.$transaction([
            prisma.user.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    isActive: true,
                    createdAt: true,
                    accounts: {
                        select: {
                            id: true,
                            accountNumber: true,
                            balancePaise: true,
                            currency: true,
                            status: true
                        }
                    }
                }
            }),
            prisma.user.count({ where })
        ]);

        const formattedUsers = users.map(user => ({
            ...user,
            accounts: user.accounts.map(account => ({
                ...account,
                balancePaise: account.balancePaise.toString()
            }))
        }));

        return res.status(200).json({
            users: formattedUsers,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error("Get users error:", error.message);
        return res.status(500).json({
            message: "Unable to retrieve customers"
        });
    }
};


// GET /api/users/:id
// Admin: view one customer's details and accounts
const getUserById = async (req, res) => {
    try {
        const { id } = req.params;

        const user = await prisma.user.findFirst({
            where: {
                id,
                role: "ACCOUNT_HOLDER"
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
                accounts: {
                    orderBy: { createdAt: "desc" },
                    select: {
                        id: true,
                        accountNumber: true,
                        balancePaise: true,
                        currency: true,
                        status: true,
                        createdAt: true
                    }
                }
            }
        });

        if (!user) {
            return res.status(404).json({
                message: "Customer not found"
            });
        }

        const formattedUser = {
            ...user,
            accounts: user.accounts.map(account => ({
                ...account,
                balancePaise: account.balancePaise.toString()
            }))
        };

        return res.status(200).json({ user: formattedUser });
    } catch (error) {
        console.error("Get customer details error:", error.message);
        return res.status(500).json({
            message: "Unable to retrieve customer details"
        });
    }
};


// PATCH /api/users/:id/deactivate
// Admin: deactivate a customer
const deactivateCustomer = async (req, res) => {
    try {
        const { id } = req.params;

        if (id === req.user.id) {
            return res.status(400).json({
                message: "You cannot deactivate your own account"
            });
        }

        const result = await prisma.$transaction(async (tx) => {
            const customer = await tx.user.findFirst({
                where: {
                    id,
                    role: "ACCOUNT_HOLDER"
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    isActive: true
                }
            });

            if (!customer) {
                return { notFound: true };
            }

            if (!customer.isActive) {
                return { alreadyInactive: true };
            }

            const updatedCustomer = await tx.user.update({
                where: { id },
                data: { isActive: false },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    isActive: true
                }
            });

            await tx.auditEvent.create({
                data: {
                    actorId: req.user.id,
                    action: "CUSTOMER_DEACTIVATED",
                    targetType: "User",
                    targetId: id,
                    ipAddress: req.ip
                }
            });

            return { customer: updatedCustomer };
        });

        if (result.notFound) {
            return res.status(404).json({
                message: "Customer not found"
            });
        }

        if (result.alreadyInactive) {
            return res.status(409).json({
                message: "Customer is already inactive"
            });
        }

        return res.status(200).json({
            message: "Customer deactivated successfully",
            customer: result.customer
        });

    } catch (error) {
        console.error("Customer deactivation error:", error.message);

        return res.status(500).json({
            message: "Could not deactivate customer"
        });
    }
};


// PATCH /api/users/:id/activate
// Admin: reactivate a customer
const activateCustomer = async (req, res) => {
    try {
        const { id } = req.params;

        if (id === req.user.id) {
            return res.status(400).json({
                message: "This operation is only available for customers"
            });
        }

        const result = await prisma.$transaction(async (tx) => {
            const customer = await tx.user.findFirst({
                where: {
                    id,
                    role: "ACCOUNT_HOLDER"
                },
                select: {
                    id: true,
                    isActive: true
                }
            });

            if (!customer) {
                return { notFound: true };
            }

            if (customer.isActive) {
                return { alreadyActive: true };
            }

            const updatedCustomer = await tx.user.update({
                where: { id },
                data: { isActive: true },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    isActive: true
                }
            });

            await tx.auditEvent.create({
                data: {
                    actorId: req.user.id,
                    action: "CUSTOMER_ACTIVATED",
                    targetType: "User",
                    targetId: id,
                    ipAddress: req.ip
                }
            });

            return { customer: updatedCustomer };
        });

        if (result.notFound) {
            return res.status(404).json({
                message: "Customer not found"
            });
        }

        if (result.alreadyActive) {
            return res.status(409).json({
                message: "Customer is already active"
            });
        }

        return res.status(200).json({
            message: "Customer activated successfully",
            customer: result.customer
        });

    } catch (error) {
        console.error("Customer activation error:", error.message);

        return res.status(500).json({
            message: "Could not activate customer"
        });
    }
};


// PATCH /api/users/:id/password
// Admin: reset a customer's password
const resetCustomerPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const { newPassword } = req.body;

        // 1. Validate the new password
        if (
            typeof newPassword !== "string" ||
            newPassword.length < 8 ||
            newPassword.length > 72
        ) {
            return res.status(400).json({
                message: "Password must contain between 8 and 72 characters"
            });
        }

        // 2. Hash the new password
        const passwordHash = await bcrypt.hash(newPassword, 12);

        // 3. Update password, invalidate old tokens and record audit event
        const result = await prisma.$transaction(async (tx) => {
            const customer = await tx.user.findFirst({
                where: {
                    id,
                    role: "ACCOUNT_HOLDER"
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    isActive: true
                }
            });

            if (!customer) {
                return { notFound: true };
            }

            const updatedCustomer = await tx.user.update({
                where: { id },
                data: {
                    passwordHash,
                    tokenVersion: { increment: 1 }
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    isActive: true
                }
            });

            await tx.auditEvent.create({
                data: {
                    actorId: req.user.id,
                    action: "CUSTOMER_PASSWORD_RESET",
                    targetType: "User",
                    targetId: id,
                    ipAddress: req.ip
                }
            });

            return { customer: updatedCustomer };
        });

        if (result.notFound) {
            return res.status(404).json({
                message: "Customer not found"
            });
        }

        return res.status(200).json({
            message: "Customer password reset successfully. They must log in again.",
            customer: result.customer
        });

    } catch (error) {
        console.error("Customer password reset error:", error.message);

        return res.status(500).json({
            message: "Could not reset customer password"
        });
    }
};


module.exports = {
    createCustomer,
    getUsers,
    getUserById,
    activateCustomer,
    deactivateCustomer,
    resetCustomerPassword
};
