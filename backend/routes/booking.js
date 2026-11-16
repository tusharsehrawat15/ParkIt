const express = require("express");
const { 
    handleLockSlot,
    handleConfirmBooking,
    handleReleaseSlot, 
    handleGetDriverHistory,
    handleGetOwnerHistory,
 } = require("../controllers/booking");
const { checkAuth, restrictTo } = require("../middlewares/auth");

const router = express.Router();

router.post("/lock/:slotId", checkAuth, restrictTo(["DRIVER"]), handleLockSlot);
router.post("/confirm/:slotId", checkAuth, restrictTo(["DRIVER"]), handleConfirmBooking);
router.post("/release/:slotId", checkAuth, restrictTo(["DRIVER"]), handleReleaseSlot);
router.get("/my-history", checkAuth, restrictTo(["DRIVER"]), handleGetDriverHistory);
router.get("/building-history", checkAuth, restrictTo(["OWNER"]), handleGetOwnerHistory);


module.exports = router;