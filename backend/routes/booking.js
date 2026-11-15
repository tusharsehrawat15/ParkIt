const express = require("express");
const { handleLockSlot, handleConfirmBooking, handleReleaseSlot } = require("../controllers/booking");
const { checkAuth, restrictTo } = require("../middlewares/auth");

const router = express.Router();

router.post("/lock/:slotId", checkAuth, restrictTo(["DRIVER"]), handleLockSlot);
router.post("/confirm/:slotId", checkAuth, restrictTo(["DRIVER"]), handleConfirmBooking);
router.post("/release/:slotId", checkAuth, restrictTo(["DRIVER"]), handleReleaseSlot);

module.exports = router;