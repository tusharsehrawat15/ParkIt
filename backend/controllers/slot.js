const Slot = require("../models/slot");
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

    const slots = await Slot.find(filter).sort({ buildingName: 1, slotNumber: 1 });
    return res.status(200).json({ count: slots.length, slots });
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