const User = require("../models/user");
const Slot = require("../models/slot");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getIO } = require("../socket");

function parseGeoPoint(lat, lng) {
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (
    lat === undefined ||
    lng === undefined ||
    Number.isNaN(numLat) ||
    Number.isNaN(numLng) ||
    numLat < -90 ||
    numLat > 90 ||
    numLng < -180 ||
    numLng > 180
  ) {
    return null;
  }
  return { type: "Point", coordinates: [numLng, numLat] };
}

// User Sign Up
async function handleUserSignup(req, res) {
  try {
    const {
      name,
      email,
      password,
      role,
      vehicleNumber,
      buildingName,
      locality,
      city,
      buildingType,
      lat,
      lng,
    } = req.body || {};

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "Name, email, password, and role are required" });
    }

    if (role === "DRIVER" && !vehicleNumber) {
      return res.status(400).json({ error: "Vehicle number is required for Vehicle Owners" });
    }
    if (role === "OWNER" && (!buildingName || !locality || !city || !buildingType)) {
      return res.status(400).json({
        error: "Building name, Locality, City , and Building Type are required for Parking Owners",
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: "Email is already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const userPayload = {
      name,
      email,
      password: hashedPassword,
      role,
      vehicleNumber: role === "DRIVER" ? vehicleNumber : null,
      buildingName: role === "OWNER" ? buildingName : null,
      locality: role === "OWNER" ? locality : null,
      city: role === "OWNER" ? city : null,
      buildingType: role === "OWNER" ? buildingType : null,
    };

    if (role === "OWNER") {
      const geoPoint = parseGeoPoint(lat, lng);
      if (geoPoint) userPayload.location = geoPoint;
    }

    const newUser = await User.create(userPayload);

    return res.status(201).json({
      message: "User registered successfully",
      user: {
        id: newUser._id,
        name: newUser.name,
        role: newUser.role,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

// User Login
async function handleUserLogin(req, res) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

// Get Current Logged-In User
async function handleGetCurrentUser(req, res) {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.status(200).json({ user });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

// Update Building Map Pin Location (OWNER only)
async function handleUpdateBuildingLocation(req, res) {
  try {
    const { lat, lng } = req.body || {};
    const geoPoint = parseGeoPoint(lat, lng);

    if (!geoPoint) {
      return res.status(400).json({ error: "Valid latitude (-90 to 90) and longitude (-180 to 180) are required." });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { location: geoPoint } },
      { returnDocument: "after" }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ error: "Owner not found" });
    }

    // Keep all existing slots in this building synced with the new map pin
    await Slot.updateMany(
      { ownerId: req.user.id },
      { $set: { location: geoPoint } }
    );

    const io = getIO();
    if (io) io.emit("slotsUpdated");

    return res.status(200).json({
      message: "Building location updated successfully",
      location: updatedUser.location,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

// Logout
async function handleUserLogout(req, res) {
  res.clearCookie("token");
  return res.status(200).json({ message: "Logged out successfully" });
}

module.exports = {
  handleUserSignup,
  handleUserLogin,
  handleGetCurrentUser,
  handleUserLogout,
  handleUpdateBuildingLocation,
};