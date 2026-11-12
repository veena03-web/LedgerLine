
const prisma = require("../config/prisma");

// GET /api/transactions/history
const getTransactionHistory = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, parseInt(req.query.limit, 10) || 10)
    );

    const skip = (page - 1) * limit;

    // Build access rules based on the logged-in user's role.
    let where = {};

    if (req.user.role === "ACCOUNT_HOLDER") {
      const accounts = await prisma.account.findMany({
        where: { ownerId: req.user.id },
        select: { id: true }
      });

      const accountIds = accounts.map((account) => account.id);

      where = {
        OR: [
          { sourceAccountId: { in: accountIds } },
          { destinationAccountId: { in: accountIds } }
        ]
      };
    } else if (
      req.user.role !== "ADMIN" &&
      req.user.role !== "AUDITOR"
    ) {
      return res.status(403).json({
        message: "You are not authorized to view transaction history"
      });
    }

    const [transactions, total] = await prisma.$transaction([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          type: true,
          amountPaise: true,
          status: true,
          description: true,
          sourceAccountId: true,
          destinationAccountId: true,
          createdAt: true
        }
      }),
      prisma.transaction.count({ where })
    ]);

    return res.status(200).json({
      message: "Transaction history retrieved successfully",
      data: transactions.map((transaction) => ({
        ...transaction,
        amountPaise: transaction.amountPaise.toString()
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Transaction history error:", error);

    return res.status(500).json({
      message: "Unable to retrieve transaction history"
    });
  }
};

module.exports = { getTransactionHistory };
