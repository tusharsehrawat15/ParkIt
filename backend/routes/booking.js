const express = require("express");
const { handleLockSlot } = require("../controllers/booking");
const { checkAuth, restrictTo } = require("../middlewares/auth");

const router = express.Router();

router.post("/lock/:slotId", checkAuth, restrictTo(["DRIVER"]), handleLockSlot);

module.exports = router;