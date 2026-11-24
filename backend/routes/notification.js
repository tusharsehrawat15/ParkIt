const express = require("express");
const { handleGetNotifications, handleMarkAllRead } = require("../controllers/notification");
const { checkAuth } = require("../middlewares/auth");

const router = express.Router();

router.get("/", checkAuth, handleGetNotifications);
router.patch("/read-all", checkAuth, handleMarkAllRead);

module.exports = router;