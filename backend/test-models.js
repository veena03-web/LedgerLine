
const User = require("./src/models/User");
const Account = require("./src/models/Account");
const Transaction = require("./src/models/Transaction");
const LedgerEntry = require("./src/models/LedgerEntry");

console.log("Checking LedgerLine models...\n");

console.log("User model:", User.modelName);
console.log("Account model:", Account.modelName);
console.log("Transaction model:", Transaction.modelName);
console.log("LedgerEntry model:", LedgerEntry.modelName);

console.log("\nAll four models loaded successfully!");
