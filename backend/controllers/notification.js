const Notification = require("../models/notification");
const { getIO } = require("../socket");

// Reusable helper called by booking & waitlist controllers
async function createNotification({ userId, title, message, type = "INFO" }) {
  try {
    const notif = await Notification.create({ userId, title, message, type });
    const io = getIO();
    if (io) {
      io.to(String(userId)).emit("notification:new", notif);
    }
    return notif;
  } catch (err) {
    console.error("Notification creation failed:", err.message);
    return null;
  }
}

async function handleGetNotifications(req, res) {
  try {
    const notifications = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20);

    const unreadCount = notifications.filter((n) => !n.isRead).length;
    return res.status(200).json({ unreadCount, notifications });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function handleMarkAllRead(req, res) {
  try {
    await Notification.updateMany(
      { userId: req.user.id, isRead: false },
      { $set: { isRead: true } }
    );
    return res.status(200).json({ message: "Notifications marked as read" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  createNotification,
  handleGetNotifications,
  handleMarkAllRead,
};