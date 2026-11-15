const Slot = require("../models/slot");
const { acquireSlotLock } = require("../redis");

async function handleLockSlot(req, res) {
  try {
    const { slotId } = req.params;
    const driverId = req.user.id;

    // 1. Check if the slot exists in MongoDB
    const slot = await Slot.findById(slotId);
    if (!slot) {
      return res.status(404).json({ error: "Parking slot not found" });
    }

    // 2. Check if the slot is already booked or locked
    if (slot.status !== "AVAILABLE") {
      return res.status(409).json({ error: `Slot is currently ${slot.status}` });
    }

    // 3. Try to grab the 5-minute (300 seconds) atomic lock
    const isLocked = await acquireSlotLock(slotId, driverId, 300);
    if (!isLocked) {
      return res.status(409).json({ error: "Another driver just locked this slot" });
    }

    // 4. Update MongoDB status so the UI shows it as yellow/locked
    slot.status = "LOCKED";
    await slot.save();

    return res.status(200).json({
      message: "Slot locked for 5 minutes",
      slotId: slot._id,
      expiresInSeconds: 300,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  handleLockSlot,
};