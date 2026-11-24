const mongoose = require("mongoose");

const waitlistSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    driverId: {
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
    vehicleNumber: {
      type: String,
      required: true,
    },
    slotType: {
      type: String,
      enum: ["STANDARD", "EV"],
      required: true,
    },
    status: {
      type: String,
      enum: ["WAITING", "READY", "COMPLETED", "CANCELLED", "EXPIRED"],
      default: "WAITING",
    },
    assignedSlotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "slot",
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const Waitlist = mongoose.model("waitlist", waitlistSchema);
module.exports = Waitlist;