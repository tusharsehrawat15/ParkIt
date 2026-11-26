const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["DRIVER", "OWNER"],
      required: true,
    },
    vehicleNumber: {
      type: String,
      default: null,
    },
    buildingName: {
      type: String,
      default: null,
    },
    locality: {
      type: String,
      default: null,
    },
    city: {
      type: String,
      default: null,
    },
    buildingType: {
      type: String,
      enum: ["PARKING", "EV", "BOTH"],
      default: null,
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
  },
  { timestamps: true }
);

userSchema.index({ location: "2dsphere" });

const User = mongoose.model("user", userSchema);
module.exports = User;