
const express = require("express");
const router = express.Router();

const {
    createCustomer,
    getUsers,
    getUserById,
    activateCustomer,
    deactivateCustomer,
    resetCustomerPassword
} = require("../controllers/userController");

const { authenticate, authorize } = require("../middleware/authMiddleware");

// All user-management routes require ADMIN access
router.use(authenticate, authorize("ADMIN"));

router.post("/", createCustomer);
router.get("/", getUsers);
router.patch("/:id/deactivate", deactivateCustomer);
router.patch("/:id/activate", activateCustomer);
router.patch("/:id/password", resetCustomerPassword);
router.get("/:id", getUserById);

module.exports = router;
