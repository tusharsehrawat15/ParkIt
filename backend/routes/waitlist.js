const express = require("express");
const {
  handleJoinWaitlist,
  handleLeaveWaitlist,
  handleGetDriverWaitlist,
  handleGetBuildingWaitlistCounts,
  handleGetOwnerWaitlist,
} = require("../controllers/waitlist");
const { checkAuth, restrictTo } = require("../middlewares/auth");

const router = express.Router();

router.post("/join", checkAuth, restrictTo(["DRIVER"]), handleJoinWaitlist);
router.delete("/leave", checkAuth, restrictTo(["DRIVER"]), handleLeaveWaitlist);
router.get("/my-status", checkAuth, restrictTo(["DRIVER"]), handleGetDriverWaitlist);
router.get("/building-counts", checkAuth, handleGetBuildingWaitlistCounts);
router.get("/owner-queue", checkAuth, restrictTo(["OWNER"]), handleGetOwnerWaitlist);

module.exports = router;