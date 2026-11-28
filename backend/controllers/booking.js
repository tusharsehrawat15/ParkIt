const Slot = require("../models/slot");
const Booking = require("../models/booking");
const User = require("../models/user");
const Waitlist = require("../models/waitlist");
const {
  acquireSlotLock,
  getSlotLockOwner,
  releaseSlotLock,
} = require("../redis");
const { createNotification } = require("./notification");
const {
  promoteNextWaitlistDriver,
  notifyNearbyWaitlistedDrivers,
} = require("./waitlist");
const { getIO } = require("../socket");

async function handleLockSlot(req, res) {
  try {
    const { slotId } = req.params;
    const driverId = req.user.id;

    // 0. Prevent double active bookings
    const existingActive = await Booking.findOne({ driverId, status: "ACTIVE" });
    if (existingActive) {
      return res.status(409).json({
        error: `You already have an active session at ${existingActive.buildingName}. Checkout first.`,
      });
    }

    const slot = await Slot.findById(slotId);
    if (!slot) {
      return res.status(404).json({ error: "Parking slot not found" });
    }

    if (slot.status === "LOCKED") {
      // Check if the Redis lock is still active and owned by someone else
      const existingLockOwner = await getSlotLockOwner(slotId);
      if (existingLockOwner && existingLockOwner !== driverId) {
        return res.status(409).json({ error: "Slot is currently LOCKED by another driver" });
      }
      // Expired or owned by the same driver — release so it can be re-acquired cleanly
      await releaseSlotLock(slotId);
    } else if (slot.status !== "AVAILABLE") {
      return res.status(409).json({ error: `Slot is currently ${slot.status}` });
    }

    const isLocked = await acquireSlotLock(slotId, driverId, 300);
    if (!isLocked) {
      return res.status(409).json({ error: "Another driver just locked this slot" });
    }

    slot.status = "LOCKED";
    slot.lockExpiresAt = new Date(Date.now() + 300 * 1000);
    await slot.save();

    const io = getIO();
    if (io) io.emit("slotsUpdated");

    return res.status(200).json({
      message: "Slot locked for 5 minutes",
      slotId: slot._id,
      expiresInSeconds: 300,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function handleConfirmBooking(req, res) {
  try {
    const { slotId } = req.params;
    const { estimatedDuration } = req.body || {};
    const driverId = req.user.id;

    if (!estimatedDuration || estimatedDuration <= 0) {
      return res.status(400).json({ error: "Please select an estimated stay duration." });
    }

    const existingActive = await Booking.findOne({ driverId, status: "ACTIVE" });
    if (existingActive) {
      return res.status(409).json({
        error: `You already have an active session at ${existingActive.buildingName}. Checkout first.`,
      });
    }

    const lockOwnerId = await getSlotLockOwner(slotId);
    if (!lockOwnerId) {
      await Slot.findByIdAndUpdate(slotId, { status: "AVAILABLE", lockExpiresAt: null });
      return res.status(400).json({
        error: "Your 5-minute reservation lock expired. Please try again.",
      });
    }

    if (lockOwnerId !== driverId) {
      return res.status(403).json({
        error: "This slot is currently locked by another driver.",
      });
    }

    const slot = await Slot.findById(slotId);
    const driver = await User.findById(driverId);

    if (!slot || !driver) {
      return res.status(404).json({ error: "Slot or Driver not found" });
    }

    const newBooking = await Booking.create({
      slotId: slot._id,
      driverId: driver._id,
      ownerId: slot.ownerId,
      buildingName: slot.buildingName,
      locality: slot.locality,
      city: slot.city,
      slotNumber: slot.slotNumber,
      vehicleNumber: driver.vehicleNumber,
      hourlyRate: slot.hourlyRate,
      estimatedDuration,
    });

    slot.status = "BOOKED";
    slot.bookedBy = driver._id;
    slot.lockExpiresAt = null;
    await slot.save();

    await releaseSlotLock(slotId);

    // If this driver was promoted from the waitlist, mark that entry completed
    await Waitlist.updateMany(
      { driverId, status: { $in: ["WAITING", "READY"] } },
      { $set: { status: "COMPLETED" } }
    );

    // Send live notifications to both Owner and Driver
    await createNotification({
      userId: slot.ownerId,
      title: "New Vehicle Parked",
      message: `${driver.vehicleNumber} booked a ${slot.slotType === "EV" ? "EV Charging" : "Parking"} slot.`,
      type: "BOOKING",
    });

    await createNotification({
      userId: driver._id,
      title: "Booking Confirmed",
      message: `Your ${slot.slotType === "EV" ? "EV Charging" : "Parking"} slot at ${slot.buildingName} is now active.`,
      type: "BOOKING",
    });

    const io = getIO();
    if (io) {
      io.emit("slotsUpdated");
      io.emit("bookingsUpdated");
      io.emit("waitlistUpdated");
    }

    return res.status(201).json({
      message: "Booking confirmed successfully",
      booking: newBooking,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function handleReleaseSlot(req, res) {
  try {
    const { slotId } = req.params;
    const driverId = req.user.id;

    const activeBooking = await Booking.findOne({
      slotId,
      driverId,
      status: "ACTIVE",
    });

    if (!activeBooking) {
      return res.status(404).json({
        error: "No active booking found for you on this slot",
      });
    }

    const endTime = new Date();
    const durationMs = endTime - new Date(activeBooking.startTime);
    const hoursParked = Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60)));
    const totalAmount = hoursParked * activeBooking.hourlyRate;

    activeBooking.endTime = endTime;
    activeBooking.totalAmount = totalAmount;
    activeBooking.status = "COMPLETED";
    await activeBooking.save();

    const slot = await Slot.findByIdAndUpdate(
      slotId,
      { status: "AVAILABLE", bookedBy: null, lockExpiresAt: null },
      { new: true }
    );

    // Send checkout notifications to both Owner and Driver
    await createNotification({
      userId: activeBooking.ownerId,
      title: "Vehicle Checked Out",
      message: `${activeBooking.vehicleNumber} checked out from their slot. Earned ₹${totalAmount}.`,
      type: "CHECKOUT",
    });

    await createNotification({
      userId: driverId,
      title: "Checkout Complete",
      message: `Session ended at ${activeBooking.buildingName}. Final bill: ₹${totalAmount}.`,
      type: "CHECKOUT",
    });

    // Promote next waiter in THIS building; if none, notify waiters in the same city + locality
    if (slot) {
      const promoted = await promoteNextWaitlistDriver(activeBooking.ownerId, slot.slotType, slot._id);
      if (!promoted) {
        await notifyNearbyWaitlistedDrivers(slot);
      }
    }

    const io = getIO();
    if (io) {
      io.emit("slotsUpdated");
      io.emit("bookingsUpdated");
      io.emit("waitlistUpdated");
    }

    return res.status(200).json({
      message: "Checked out successfully. Slot is now AVAILABLE.",
      hoursParked,
      totalAmount,
      booking: activeBooking,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function handleGetDriverHistory(req, res) {
  try {
    const history = await Booking.find({ driverId: req.user.id })
      .populate("ownerId", "name buildingName locality city")
      .populate("slotId", "slotType")
      .sort({
        createdAt: -1,
      });
    return res.status(200).json({ count: history.length, history });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function handleGetOwnerHistory(req, res) {
  try {
    const history = await Booking.find({ ownerId: req.user.id })
      .populate("driverId", "name vehicleNumber")
      .populate("slotId", "slotType")
      .sort({ createdAt: -1 });
    return res.status(200).json({ count: history.length, history });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  handleLockSlot,
  handleConfirmBooking,
  handleReleaseSlot,
  handleGetDriverHistory,
  handleGetOwnerHistory,
};