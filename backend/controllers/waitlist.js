const Waitlist = require("../models/waitlist");
const Slot = require("../models/slot");
const Booking = require("../models/booking");
const User = require("../models/user");
const { acquireSlotLock, releaseSlotLock } = require("../redis");
const { createNotification } = require("./notification");
const { getIO } = require("../socket");

const MAX_WAITLIST = 5;

function exactCaseInsensitiveRegex(value) {
  const escaped = String(value || "")
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}$`, "i");
}

// Notify WAITING drivers in OTHER buildings within the exact same City + Locality
async function notifyNearbyWaitlistedDrivers(slot) {
  try {
    if (!slot || !slot.city || !slot.locality) return;

    const nearbyWaiters = await Waitlist.find({
      status: "WAITING",
      slotType: slot.slotType,
      ownerId: { $ne: slot.ownerId },
      city: exactCaseInsensitiveRegex(slot.city),
      locality: exactCaseInsensitiveRegex(slot.locality),
    });

    if (nearbyWaiters.length === 0) return;

    const serviceName = slot.slotType === "EV" ? "EV Charging" : "Parking";

    await Promise.all(
      nearbyWaiters.map((entry) =>
        createNotification({
          userId: entry.driverId,
          title: "Nearby Slot Opened!",
          message: `A ${serviceName} slot just opened at ${slot.buildingName} (${slot.locality}, ${slot.city}) for ₹${slot.hourlyRate}/hr.`,
          type: "WAITLIST",
        })
      )
    );
  } catch (err) {
    console.error("Failed to notify nearby waitlisted drivers:", err.message);
  }
}

// Auto-expire any READY waitlist offers whose 5-minute window passed
async function expireStaleReadyWaitlists() {
  const now = new Date();
  const expiredEntries = await Waitlist.find({
    status: "READY",
    expiresAt: { $lte: now },
  });

  for (const entry of expiredEntries) {
    entry.status = "EXPIRED";
    await entry.save();

    if (entry.assignedSlotId) {
      await releaseSlotLock(String(entry.assignedSlotId));
      const slot = await Slot.findById(entry.assignedSlotId);

      if (slot && slot.status === "LOCKED") {
        slot.status = "AVAILABLE";
        await slot.save();

        // Offer to next driver in this building; if none, alert same city+locality waiters
        const promoted = await promoteNextWaitlistDriver(entry.ownerId, entry.slotType, slot._id);
        if (!promoted) {
          await notifyNearbyWaitlistedDrivers(slot);
        }
      }
    }

    await createNotification({
      userId: entry.driverId,
      title: "Waitlist Offer Expired",
      message: `Your 5-minute window at ${entry.buildingName} expired.`,
      type: "WAITLIST",
    });
  }

  if (expiredEntries.length > 0) {
    const io = getIO();
    if (io) {
      io.emit("waitlistUpdated");
      io.emit("slotsUpdated");
    }
  }
}

// Promote the oldest WAITING driver when a slot opens up in the SAME building
async function promoteNextWaitlistDriver(ownerId, slotType, slotId) {
  const nextEntry = await Waitlist.findOne({
    ownerId,
    slotType,
    status: "WAITING",
  }).sort({ createdAt: 1 });

  if (!nextEntry) return false;

  const locked = await acquireSlotLock(String(slotId), String(nextEntry.driverId), 300);
  if (!locked) return false;

  await Slot.findByIdAndUpdate(slotId, { status: "LOCKED" });

  nextEntry.status = "READY";
  nextEntry.assignedSlotId = slotId;
  nextEntry.expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await nextEntry.save();

  await createNotification({
    userId: nextEntry.driverId,
    title: "Slot Ready!",
    message: `A ${slotType === "EV" ? "EV Charging" : "Parking"} slot opened at ${nextEntry.buildingName}. Confirm within 5 minutes!`,
    type: "WAITLIST",
  });

  const io = getIO();
  if (io) {
    io.emit("waitlistUpdated");
    io.emit("slotsUpdated");
  }

  return true;
}

async function handleJoinWaitlist(req, res) {
  try {
    await expireStaleReadyWaitlists();

    const driverId = req.user.id;
    const { ownerId, slotType } = req.body || {};

    if (!ownerId || !["STANDARD", "EV"].includes(slotType)) {
      return res.status(400).json({ error: "Valid ownerId and slotType (STANDARD or EV) are required." });
    }

    const activeBooking = await Booking.findOne({ driverId, status: "ACTIVE" });
    if (activeBooking) {
      return res.status(409).json({
        error: `You already have an active session at ${activeBooking.buildingName}. Checkout first.`,
      });
    }

    const existingWaitlist = await Waitlist.findOne({
      driverId,
      status: { $in: ["WAITING", "READY"] },
    });
    if (existingWaitlist) {
      return res.status(409).json({
        error: `You are already waitlisted at ${existingWaitlist.buildingName}. Leave that queue first.`,
      });
    }

    const serviceSlots = await Slot.find({ ownerId, slotType });
    if (serviceSlots.length === 0) {
      return res.status(404).json({ error: "This building does not offer the selected service." });
    }

    const hasAvailable = serviceSlots.some((s) => s.status === "AVAILABLE");
    if (hasAvailable) {
      return res.status(400).json({ error: "Slots are currently available! Book directly instead." });
    }

    const waitingCount = await Waitlist.countDocuments({
      ownerId,
      slotType,
      status: "WAITING",
    });
    if (waitingCount >= MAX_WAITLIST) {
      return res.status(409).json({ error: `Waitlist is full (${MAX_WAITLIST}/${MAX_WAITLIST}).` });
    }

    const driver = await User.findById(driverId);
    const sampleSlot = serviceSlots[0];

    const entry = await Waitlist.create({
      ownerId,
      driverId,
      buildingName: sampleSlot.buildingName,
      locality: sampleSlot.locality,
      city: sampleSlot.city,
      vehicleNumber: driver.vehicleNumber || "UNKNOWN",
      slotType,
      status: "WAITING",
    });

    await createNotification({
      userId: ownerId,
      title: "Driver Joined Waitlist",
      message: `${driver.vehicleNumber} joined the ${slotType === "EV" ? "EV" : "Parking"} waitlist (#${waitingCount + 1}/${MAX_WAITLIST}).`,
      type: "WAITLIST",
    });

    const io = getIO();
    if (io) io.emit("waitlistUpdated");

    return res.status(201).json({
      message: `Joined waitlist at position #${waitingCount + 1}`,
      position: waitingCount + 1,
      entry,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function handleLeaveWaitlist(req, res) {
  try {
    const driverId = req.user.id;
    const entry = await Waitlist.findOne({
      driverId,
      status: { $in: ["WAITING", "READY"] },
    });

    if (!entry) {
      return res.status(404).json({ error: "You are not currently on any waitlist." });
    }

    const wasReady = entry.status === "READY";
    const slotId = entry.assignedSlotId;

    entry.status = "CANCELLED";
    await entry.save();

    if (wasReady && slotId) {
      await releaseSlotLock(String(slotId));
      const freedSlot = await Slot.findByIdAndUpdate(
        slotId,
        { status: "AVAILABLE" },
        { new: true }
      );
      if (freedSlot) {
        const promoted = await promoteNextWaitlistDriver(entry.ownerId, entry.slotType, freedSlot._id);
        if (!promoted) {
          await notifyNearbyWaitlistedDrivers(freedSlot);
        }
      }
    }

    const io = getIO();
    if (io) {
      io.emit("waitlistUpdated");
      io.emit("slotsUpdated");
    }

    return res.status(200).json({ message: "Removed from waitlist." });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function handleGetDriverWaitlist(req, res) {
  try {
    await expireStaleReadyWaitlists();

    const entry = await Waitlist.findOne({
      driverId: req.user.id,
      status: { $in: ["WAITING", "READY"] },
    }).populate("assignedSlotId");

    if (!entry) {
      return res.status(200).json({ entry: null });
    }

    let position = null;
    let totalWaiting = 0;

    if (entry.status === "WAITING") {
      const queue = await Waitlist.find({
        ownerId: entry.ownerId,
        slotType: entry.slotType,
        status: "WAITING",
      }).sort({ createdAt: 1 });

      totalWaiting = queue.length;
      position = queue.findIndex((item) => String(item._id) === String(entry._id)) + 1;
    }

    return res.status(200).json({
      entry,
      position,
      totalWaiting,
      maxWaitlist: MAX_WAITLIST,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function handleGetBuildingWaitlistCounts(req, res) {
  try {
    await expireStaleReadyWaitlists();

    const entries = await Waitlist.find({ status: "WAITING" }).select("ownerId slotType");
    const counts = {};

    entries.forEach((e) => {
      const key = `${e.ownerId}_${e.slotType}`;
      counts[key] = (counts[key] || 0) + 1;
    });

    return res.status(200).json({ counts, maxWaitlist: MAX_WAITLIST });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function handleGetOwnerWaitlist(req, res) {
  try {
    await expireStaleReadyWaitlists();

    const queue = await Waitlist.find({
      ownerId: req.user.id,
      status: { $in: ["WAITING", "READY"] },
    }).sort({ createdAt: 1 });

    return res.status(200).json({ count: queue.length, maxWaitlist: MAX_WAITLIST, queue });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  notifyNearbyWaitlistedDrivers,
  expireStaleReadyWaitlists,
  promoteNextWaitlistDriver,
  handleJoinWaitlist,
  handleLeaveWaitlist,
  handleGetDriverWaitlist,
  handleGetBuildingWaitlistCounts,
  handleGetOwnerWaitlist,
};