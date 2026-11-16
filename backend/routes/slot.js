const express = require("express");
const { handleCreateSlot, handleGetAllSlots, handleGetOwnerSlots, handleSyncOwnerServices } = require("../controllers/slot");
const { checkAuth, restrictTo } = require("../middlewares/auth");

const router = express.Router();

// Only a logged-in user with role "OWNER" can create a slot
router.post("/create", checkAuth, restrictTo(["OWNER"]), handleCreateSlot);
router.post("/sync", checkAuth, restrictTo(["OWNER"]), handleSyncOwnerServices);
router.get("/my-slots", checkAuth, restrictTo(["OWNER"]), handleGetOwnerSlots);
// Any logged-in user (Driver or Owner) can browse all slots
router.get("/", checkAuth, handleGetAllSlots);


module.exports = router;