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

module.exports = {
  handleCreateSlot,
  handleGetAllSlots,
  handleGetOwnerSlots,
};