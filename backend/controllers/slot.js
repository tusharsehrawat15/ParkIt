const Slot = require("../models/slot");
const Booking = require("../models/booking");
const User = require("../models/user");

async function handleCreateSlot(req, res) {
  try {
    const { slotNumber, slotType, hourlyRate } = req.body || {};

    if (!slotNumber || !hourlyRate) {
      return res.status(400).json({ error: "Slot number and hourly rate are required" });
    }

    // Grab the logged-in Building Owner's details from MongoDB
    const owner = await User.findById(req.user.id);
    if (!owner || !owner.buildingName) {
      return res.status(400).json({ error: "Owner building details not found" });
    }

    // Stop the same building from having two slots with the exact same number
    const existingSlot = await Slot.findOne({
      ownerId: owner._id,
      slotNumber,
    });
    if (existingSlot) {
      return res.status(409).json({ error: `Slot ${slotNumber} already exists in ${owner.buildingName}` });
    }

    const newSlot = await Slot.create({
      ownerId: owner._id,
      buildingName: owner.buildingName,
      locality: owner.locality,
      city: owner.city,
      buildingType: owner.buildingType,
      slotNumber,
      slotType: slotType || "STANDARD",
      hourlyRate,
    });

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

    
    const slots = await Slot.find(filter).sort({ buildingName: 1, slotNumber: 1 });

    
    const slotsWithOccupancy = await Promise.all(
      slots.map(async (slot) => {
        const slotData = slot.toObject();
        if (slot.status === "BOOKED") {
          const activeBooking = await Booking.findOne({
            slotId: slot._id,
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
      count: slots.length, 
      slots: slotsWithOccupancy,
      nextAvailableTime: nextAvailableTime // Used when a building is full to show estimated free time
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function handleGetOwnerSlots(req, res) {
  try {
    const slots = await Slot.find({ ownerId: req.user.id }).sort({ slotNumber: 1 });
    return res.status(200).json({ count: slots.length, slots });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}


async function handleSyncOwnerServices(req, res) {
  try {
    const ownerId = req.user.id;
    const { slotType, hourlyRate, totalSlots } = req.body; // e.g. slotType: "STANDARD" or "EV"

    if (!slotType || !hourlyRate || totalSlots === undefined) {
      return res.status(400).json({ error: "Slot type, hourly rate, and total slots are required." });
    }

    const owner = await User.findById(ownerId);
    if (!owner || !owner.buildingName) {
      return res.status(400).json({ error: "Owner building details not found." });
    }

    // 1. Update hourly rate for all existing slots of this type for this owner
    await Slot.updateMany(
      { ownerId, slotType },
      { $set: { hourlyRate: Number(hourlyRate) } }
    );

    // 2. Count current slots of this type
    const currentSlots = await Slot.find({ ownerId, slotType }).sort({ slotNumber: 1 });
    const currentCount = currentSlots.length;

    if (totalSlots > currentCount) {
      // 3. Add extra slots if owner increased the count
      const slotsToAdd = totalSlots - currentCount;
      const newSlotsData = [];
      
      // Find the highest existing slot number index or generate sequentially
      const nextIndex = currentCount + 1;
      for (let i = 0; i < slotsToAdd; i++) {
        const slotNumId = `${slotType === "EV" ? "EV" : "B1"}-${String(nextIndex + i).padStart(2, '0')}`;
        newSlotsData.push({
          ownerId,
          buildingName: owner.buildingName,
          locality: owner.locality,
          city: owner.city,
          buildingType: owner.buildingType,
          slotNumber: slotNumId,
          slotType,
          hourlyRate: Number(hourlyRate),
          status: "AVAILABLE"
        });
      }
      await Slot.insertMany(newSlotsData);
    } else if (totalSlots < currentCount) {
      // 4. Remove unbooked extra slots if owner decreased the count
      const excessCount = currentCount - totalSlots;
      // Only remove available slots so we don't delete actively booked bays
      const availableSlotsToRemove = await Slot.find({ ownerId, slotType, status: "AVAILABLE" })
        .sort({ slotNumber: -1 })
        .limit(excessCount);

      const idsToRemove = availableSlotsToRemove.map(s => s._id);
      if (idsToRemove.length > 0) {
        await Slot.deleteMany({ _id: { $in: idsToRemove } });
      }
    }

    const updatedSlots = await Slot.find({ ownerId, slotType });
    return res.status(200).json({
      message: "Building services synced successfully",
      count: updatedSlots.length,
      slots: updatedSlots
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