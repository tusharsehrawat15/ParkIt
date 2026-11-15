const mongoose = require("mongoose");

const slotSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    buildingName: {
      type: String,
      required: true,
    },
    slotNumber: {
      type: String,
      required: true,
    },
    slotType: {
      type: String,
      enum: ["STANDARD", "EV"],
      default: "STANDARD",
    },
    hourlyRate: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["AVAILABLE", "LOCKED", "BOOKED"],
      default: "AVAILABLE",
    },
    bookedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
  },
  { timestamps: true }
);

const Slot = mongoose.model("slot", slotSchema);

module.exports = Slot;