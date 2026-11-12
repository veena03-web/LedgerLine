
require("dotenv").config();

const bcrypt = require("bcryptjs");
const prisma = require("../src/config/prisma");

async function bootstrapAdmin() {
    try {
        const name = process.env.ADMIN_NAME;
        const email = process.env.ADMIN_EMAIL;
        const password = process.env.ADMIN_PASSWORD;

        // 1. Validate environment variables
        if (!name || !email || !password) {
            throw new Error(
                "ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD must be configured"
            );
        }

        if (
            name.trim().length < 2 ||
            name.trim().length > 100 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
            password.length < 12 ||
            Buffer.byteLength(password, "utf8") > 72
        ) {
            throw new Error("Invalid admin name, email or password");
        }

        const normalizedEmail = email.trim().toLowerCase();

        // 2. Check whether an administrator already exists
        const existingAdmin = await prisma.user.findFirst({
            where: { role: "ADMIN" }
        });

        if (existingAdmin) {
            console.log("An administrator already exists. No changes made.");
            return;
        }

        // 3. Never promote an existing public account automatically
        const existingUser = await prisma.user.findUnique({
            where: { email: normalizedEmail }
        });

        if (existingUser) {
            throw new Error(
                "This email already belongs to a user. Choose a new admin email."
            );
        }

        // 4. Hash administrator password
        const passwordHash = await bcrypt.hash(password, 12);

        // 5. Create admin and audit event atomically
        const admin = await prisma.$transaction(async (tx) => {
            const createdAdmin = await tx.user.create({
                data: {
                    name: name.trim(),
                    email: normalizedEmail,
                    passwordHash,
                    role: "ADMIN"
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true
                }
            });

            await tx.auditEvent.create({
                data: {
                    actorId: createdAdmin.id,
                    action: "FIRST_ADMIN_CREATED",
                    targetType: "User",
                    targetId: createdAdmin.id,
                    metadata: {
                        method: "bootstrap_script"
                    }
                }
            });

            return createdAdmin;
        });

        console.log("First administrator created successfully!");
        console.log(admin);

    } catch (error) {
        console.error("Admin bootstrap failed:", error.message);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

bootstrapAdmin();
