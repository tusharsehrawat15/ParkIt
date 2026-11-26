const Slot = require("../models/slot");
const Booking = require("../models/booking");
const User = require("../models/user");
const { getIO } = require("../socket");
const {
  expireStaleReadyWaitlists,
  promoteNextWaitlistDriver,
  notifyNearbyWaitlistedDrivers,
} = require("./waitlist");

async function handleCreateSlot(req, res) {
  try {
    const { slotNumber, slotType, hourlyRate } = req.body || {};

    if (!slotNumber || !hourlyRate) {
      return res.status(400).json({ error: "Slot number and hourly rate are required" });
    }

    const owner = await User.findById(req.user.id);
    if (!owner || !owner.buildingName) {
      return res.status(400).json({ error: "Owner building details not found" });
    }

    const existingSlot = await Slot.findOne({ ownerId: owner._id, slotNumber });
    if (existingSlot) {
      return res.status(409).json({ error: `Slot ${slotNumber} already exists in ${owner.buildingName}` });
    }

    const slotPayload = {
      ownerId: owner._id,
      buildingName: owner.buildingName,
      locality: owner.locality,
      city: owner.city,
      buildingType: owner.buildingType,
      slotNumber,
      slotType: slotType || "STANDARD",
      hourlyRate,
    };

    if (owner.location?.coordinates?.length === 2) {
      slotPayload.location = owner.location;
    }

    const newSlot = await Slot.create(slotPayload);

    const promoted = await promoteNextWaitlistDriver(owner._id, newSlot.slotType, newSlot._id);
    if (!promoted) {
      await notifyNearbyWaitlistedDrivers(newSlot);
    }

    const io = getIO();
    if (io) io.emit("slotsUpdated");

    return res.status(201).json({
      message: "Parking slot created successfully",
      slot: newSlot,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function handleGetAllSlots(req, res) {
  try {
    await expireStaleReadyWaitlists();

    const filter = {};
    if (req.query.slotType) filter.slotType = req.query.slotType;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.city) {
      filter.city = { $regex: req.query.city, $options: "i" };
    }
    if (req.query.locality) {
      filter.locality = { $regex: req.query.locality, $options: "i" };
    }
    if (req.query.search) {
      filter.$or = [
        { city: { $regex: req.query.search, $options: "i" } },
        { locality: { $regex: req.query.search, $options: "i" } },
        { buildingName: { $regex: req.query.search, $options: "i" } },
      ];
    }

    const lat = req.query.lat !== undefined ? parseFloat(req.query.lat) : NaN;
    const lng = req.query.lng !== undefined ? parseFloat(req.query.lng) : NaN;
    const hasCoords = !Number.isNaN(lat) && !Number.isNaN(lng);

    let slots;
    if (hasCoords) {
      const maxDistance = req.query.maxDistance ? Number(req.query.maxDistance) : 50000; // default 50 km
      slots = await Slot.aggregate([
        {
          $geoNear: {
            near: { type: "Point", coordinates: [lng, lat] },
            distanceField: "distanceMeters",
            maxDistance,
            spherical: true,
            query: filter,
          },
        },
      ]);
    } else {
      slots = await Slot.find(filter).sort({ buildingName: 1, slotNumber: 1 });
    }

    const slotsWithOccupancy = await Promise.all(
      slots.map(async (slot) => {
        const slotData = slot.toObject ? slot.toObject() : { ...slot };
        if (typeof slotData.distanceMeters === "number") {
          slotData.distanceKm = Number((slotData.distanceMeters / 1000).toFixed(2));
        }
        if (slotData.status === "BOOKED") {
          const activeBooking = await Booking.findOne({
            slotId: slotData._id,
            status: "ACTIVE",
          });
          if (activeBooking) {
            const startTime = activeBooking.startTime.getTime();
            const durationMs = activeBooking.estimatedDuration * 60 * 60 * 1000;
            slotData.scheduledEndTime = startTime + durationMs;
          }
        }
        return slotData;
      })
    );

    const bookedSlots = slotsWithOccupancy.filter((s) => s.status === "BOOKED" && s.scheduledEndTime);
    let nextAvailableTime = null;
    if (bookedSlots.length > 0) {
      nextAvailableTime = Math.min(...bookedSlots.map((s) => s.scheduledEndTime));
    }

    return res.status(200).json({
      count: slotsWithOccupancy.length,
      slots: slotsWithOccupancy,
      nextAvailableTime,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function handleGetOwnerSlots(req, res) {
  try {
    await expireStaleReadyWaitlists();
    const slots = await Slot.find({ ownerId: req.user.id }).sort({ slotNumber: 1 });
    return res.status(200).json({ count: slots.length, slots });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function handleSyncOwnerServices(req, res) {
  try {
    const ownerId = req.user.id;
    const { slotType, hourlyRate, totalSlots } = req.body;

    if (!slotType || !hourlyRate || totalSlots === undefined) {
      return res.status(400).json({ error: "Slot type, hourly rate, and total slots are required." });
    }

    const owner = await User.findById(ownerId);
    if (!owner || !owner.buildingName) {
      return res.status(400).json({ error: "Owner building details not found." });
    }

    const ownerHasCoords = owner.location?.coordinates?.length === 2;
    const updateFields = { hourlyRate: Number(hourlyRate) };
    if (ownerHasCoords) {
      updateFields.location = owner.location;
    }

    await Slot.updateMany({ ownerId, slotType }, { $set: updateFields });

    const currentSlots = await Slot.find({ ownerId, slotType }).sort({ slotNumber: 1 });
    const currentCount = currentSlots.length;

    if (totalSlots > currentCount) {
      const slotsToAdd = totalSlots - currentCount;
      const newSlotsData = [];
      const nextIndex = currentCount + 1;

      for (let i = 0; i < slotsToAdd; i++) {
        const slotNumId = `${slotType === "EV" ? "EV" : "B1"}-${String(nextIndex + i).padStart(2, "0")}`;
        const slotDoc = {
          ownerId,
          buildingName: owner.buildingName,
          locality: owner.locality,
          city: owner.city,
          buildingType: owner.buildingType,
          slotNumber: slotNumId,
          slotType,
          hourlyRate: Number(hourlyRate),
          status: "AVAILABLE",
        };
        if (ownerHasCoords) {
          slotDoc.location = owner.location;
        }
        newSlotsData.push(slotDoc);
      }

      const insertedSlots = await Slot.insertMany(newSlotsData);
      let remainingOpenSlot = null;

      for (const s of insertedSlots) {
        const promoted = await promoteNextWaitlistDriver(ownerId, slotType, s._id);
        if (!promoted) remainingOpenSlot = s;
      }

      // Notify drivers waitlisted in other buildings within the exact same City + Locality
      if (remainingOpenSlot) {
        await notifyNearbyWaitlistedDrivers(remainingOpenSlot);
      }
    } else if (totalSlots < currentCount) {
      const excessCount = currentCount - totalSlots;
      const availableSlotsToRemove = await Slot.find({ ownerId, slotType, status: "AVAILABLE" })
        .sort({ slotNumber: -1 })
        .limit(excessCount);

      const idsToRemove = availableSlotsToRemove.map((s) => s._id);
      if (idsToRemove.length > 0) {
        await Slot.deleteMany({ _id: { $in: idsToRemove } });
      }
    }

    const updatedSlots = await Slot.find({ ownerId, slotType });

    const io = getIO();
    if (io) io.emit("slotsUpdated");

    return res.status(200).json({
      message: "Building services synced successfully",
      count: updatedSlots.length,
      slots: updatedSlots,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  handleCreateSlot,
  handleGetAllSlots,
  handleGetOwnerSlots,
  handleSyncOwnerServices,
};