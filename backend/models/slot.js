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
    locality: {
      type: String,
      required: true,
    },
    city: {
      type: String,
      required: true,
    },
    buildingType: {
      type: String,
      enum: ["PARKING", "EV", "BOTH"],
      required: true,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: undefined,
      },
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
    lockExpiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

slotSchema.index({ location: "2dsphere" });

const Slot = mongoose.model("slot", slotSchema);

module.exports = Slot;