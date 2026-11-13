
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

// Register a new account holder

const register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // 1. Validate required fields
        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Name, email and password are required"
            });
        }

        // 2. Validate name
        if (
            typeof name !== "string" ||
            name.trim().length < 2 ||
            name.trim().length > 100
        ) {
            return res.status(400).json({
                message: "Name must contain 2 to 100 characters"
            });
        }

        // 3. Validate email
        if (
            typeof email !== "string" ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
        ) {
            return res.status(400).json({
                message: "Please provide a valid email address"
            });
        }

        // 4. Validate password
        if (
            typeof password !== "string" ||
            password.length < 8 ||
            password.length > 72
        ) {
            return res.status(400).json({
                message: "Password must contain 8 to 72 characters"
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // 5. Check whether user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email: normalizedEmail }
        });

        if (existingUser) {
            return res.status(409).json({
                message: "An account with this email already exists"
            });
        }

        // 6. Hash password
        const passwordHash = await bcrypt.hash(password, 12);

        // 7. Create user and audit event atomically
        const user = await prisma.$transaction(async (tx) => {
            const createdUser = await tx.user.create({
                data: {
                    name: name.trim(),
                    email: normalizedEmail,
                    passwordHash,
                    role: "ACCOUNT_HOLDER"
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    createdAt: true
                }
            });

            await tx.auditEvent.create({
                data: {
                    actorId: createdUser.id,
                    action: "USER_REGISTERED",
                    targetType: "User",
                    targetId: createdUser.id,
                    ipAddress: req.ip
                }
            });

            return createdUser;
        });

        // 8. Return successful registration
        return res.status(201).json({
            message: "Registration successful",
            user
        });

    } catch (error) {
        console.error("Registration error:", error.message);

        // Handle duplicate email race condition
        if (error.code === "P2002") {
            return res.status(409).json({
                message: "An account with this email already exists"
            });
        }

        return res.status(500).json({
            message: "Registration failed. Please try again."
        });
    }
};



const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Validate input
        if (
            typeof email !== "string" ||
            typeof password !== "string" ||
            !email.trim() ||
            !password
        ) {
            return res.status(400).json({
                message: "Email and password are required"
            });
        }

        if (password.length > 72) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        // 2. Find user
        const user = await prisma.user.findUnique({
            where: {
                email: email.trim().toLowerCase()
            }
        });

        // Use the same error for unknown email and wrong password
        if (!user) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        // 3. Check password
        const passwordMatches = await bcrypt.compare(
            password,
            user.passwordHash
        );

        if (!passwordMatches) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        // 4. Check whether user is active
        if (!user.isActive) {
            return res.status(403).json({
                message: "Your account is inactive. Contact an administrator."
            });
        }

        // 5. Check JWT secret
        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET is not configured");
        }

        // 6. Record successful login
        await prisma.auditEvent.create({
            data: {
                actorId: user.id,
                action: "USER_LOGIN",
                targetType: "User",
                targetId: user.id,
                ipAddress: req.ip
            }
        });

        // 7. Create signed token
                const token = jwt.sign(
            {
                role: user.role,
                tokenVersion: user.tokenVersion
            },
            process.env.JWT_SECRET,
            {
                subject: user.id,
                expiresIn: "15m",
                algorithm: "HS256",
                issuer: "balancevault-api",
                audience: "balancevault-client"
            }
        );

        // 8. Return token and safe user details
        return res.status(200).json({
            message: "Login successful",
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Login error:", error.message);

        return res.status(500).json({
            message: "Login failed. Please try again."
        });
    }
};


module.exports = { register, login };
