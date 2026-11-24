const Slot = require("../models/slot");
const Booking = require("../models/booking");
const User = require("../models/user");
const { 
    acquireSlotLock,
    getSlotLockOwner,
    releaseSlotLock,
 } = require("../redis");

async function handleLockSlot(req, res) {
  try {
    const { slotId } = req.params;
    const driverId = req.user.id;
    // 0. Prevent a driver from booking a second slot while already parked
    const existingActive = await Booking.findOne({ driverId, status: "ACTIVE" });
    if (existingActive) {
      return res.status(409).json({
        error: `You already have an active session at ${existingActive.buildingName}. Checkout first.`,
      });
    }

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

async function handleConfirmBooking(req, res) {
  try {
    const { slotId } = req.params;
    const { estimatedDuration } = req.body;
    const driverId = req.user.id;

    // Basic validation
    if (!estimatedDuration || estimatedDuration <= 0) {
      return res.status(400).json({ error: "Please select an estimated stay duration." });
    }

    // 1. Check if the 5-minute lock still exists in Redis/Map
    const lockOwnerId = await getSlotLockOwner(slotId);

    if (!lockOwnerId) {
      // If the 5-minute timer expired, reset the slot back to AVAILABLE in MongoDB
      await Slot.findByIdAndUpdate(slotId, { status: "AVAILABLE" });
      return res.status(400).json({
        error: "Your 5-minute reservation lock expired. Please lock the slot again.",
      });
    }

    // 2. Make sure the driver confirming is the exact same driver who locked it
    if (lockOwnerId !== driverId) {
      return res.status(403).json({
        error: "This slot is currently locked by another driver.",
      });
    }

    // 3. Fetch the Slot and Driver details from MongoDB
    const slot = await Slot.findById(slotId);
    const driver = await User.findById(driverId);

    if (!slot || !driver) {
      return res.status(404).json({ error: "Slot or Driver not found" });
    }

    // 4. Create the permanent receipt in the Booking collection
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
      estimatedDuration: estimatedDuration,
    });

    // 5. Mark the physical slot as BOOKED and link it to this driver
    slot.status = "BOOKED";
    slot.bookedBy = driver._id;
    await slot.save();

    // 6. Delete the temporary 5-minute lock from RAM since it's now permanently booked
    await releaseSlotLock(slotId);

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

    // 1. Find the currently ACTIVE booking for this slot
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

    // 2. Calculate duration in hours (minimum 1 hour, rounded up)
    const endTime = new Date();
    const durationMs = endTime - new Date(activeBooking.startTime);
    const hoursParked = Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60)));
    const totalAmount = hoursParked * activeBooking.hourlyRate;

    // 3. Complete the booking receipt
    activeBooking.endTime = endTime;
    activeBooking.totalAmount = totalAmount;
    activeBooking.status = "COMPLETED";
    await activeBooking.save();

    // 4. Free up the physical slot in MongoDB for the next driver
    await Slot.findByIdAndUpdate(slotId, {
      status: "AVAILABLE",
      bookedBy: null,
    });

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
    const history = await Booking.find({ driverId: req.user.id }).sort({
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
      .populate("driverId", "name email")
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