const User = require("../models/user");
const Slot = require("../models/slot");
const Booking = require("../models/booking");
const Waitlist = require("../models/waitlist");
const Otp = require("../models/otp");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getIO } = require("../socket");
const { sendOtpEmail } = require("../utils/mailer");

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

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function setAuthCookie(res, user) {
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
}

// 1. Send Signup Verification OTP
async function handleSendSignupOtp(req, res) {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: "Email is already registered" });
    }

    const otp = generateOtp();
    await Otp.deleteMany({ email, purpose: "SIGNUP" });
    await Otp.create({ email, otp, purpose: "SIGNUP" });
    await sendOtpEmail(email, otp, "SIGNUP");

    return res.status(200).json({ message: "Verification code sent to your email" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

// 2. User Sign Up
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
      otp,
    } = req.body || {};

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "Name, email, password, and role are required" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (role === "DRIVER" && !vehicleNumber) {
      return res.status(400).json({ error: "Vehicle number is required for Vehicle Owners" });
    }
    if (role === "OWNER" && (!buildingName || !locality || !city || !buildingType)) {
      return res.status(400).json({
        error: "Building name, Locality, City , and Building Type are required for Parking Owners",
      });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ error: "Email is already registered" });
    }

    // Enforce email OTP verification outside automated Jest runs
    if (process.env.NODE_ENV !== "test") {
      if (!otp) {
        return res.status(400).json({ error: "Email verification code is required" });
      }
      const validOtp = await Otp.findOne({
        email: normalizedEmail,
        otp: String(otp).trim(),
        purpose: "SIGNUP",
      });
      if (!validOtp) {
        return res.status(400).json({ error: "Invalid or expired verification code" });
      }
      await Otp.deleteMany({ email: normalizedEmail, purpose: "SIGNUP" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const userPayload = {
      name,
      email: normalizedEmail,
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

// 3. User Login
async function handleUserLogin(req, res) {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    const password = req.body?.password;

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

    setAuthCookie(res, user);

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

// 4. Forgot Password — Send Reset OTP
async function handleForgotPassword(req, res) {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: "Please enter your registered email" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "No account found with that email" });
    }

    const otp = generateOtp();
    await Otp.deleteMany({ email, purpose: "RESET" });
    await Otp.create({ email, otp, purpose: "RESET" });
    await sendOtpEmail(email, otp, "RESET");

    return res.status(200).json({ message: "Verification code sent to your email" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

// 5. Reset Password — Verify OTP, Set New Password & Log User In
async function handleResetPassword(req, res) {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    const otp = String(req.body?.otp || "").trim();
    const newPassword = req.body?.newPassword;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: "Email, verification code, and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }

    const validOtp = await Otp.findOne({ email, otp, purpose: "RESET" });
    if (!validOtp) {
      return res.status(400).json({ error: "Invalid or expired verification code" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    await Otp.deleteMany({ email, purpose: "RESET" });

    // Log them in right away after setting the new password
    setAuthCookie(res, user);

    return res.status(200).json({
      message: "Password updated and logged in successfully",
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

// 6. Get Current Logged-In User
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

// 7. Update Building Map Pin Location (OWNER only)
async function handleUpdateBuildingLocation(req, res) {
  try {
    const { lat, lng } = req.body || {};
    const geoPoint = parseGeoPoint(lat, lng);

    if (!geoPoint) {
      return res.status(400).json({
        error: "Valid latitude (-90 to 90) and longitude (-180 to 180) are required.",
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { location: geoPoint } },
      { returnDocument: "after" }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ error: "Owner not found" });
    }

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

// 8. Logout
async function handleUserLogout(req, res) {
  res.clearCookie("token");
  return res.status(200).json({ message: "Logged out successfully" });
}

// 9. Update Profile Details
async function handleUpdateProfile(req, res) {
  try {
    const { name, vehicleNumber, buildingName, locality, city, buildingType } = req.body || {};
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (name && name.trim()) user.name = name.trim();
    if (user.role === "DRIVER" && vehicleNumber !== undefined) {
      user.vehicleNumber = vehicleNumber.trim().toUpperCase();
    }
    if (user.role === "OWNER") {
      if (buildingName) user.buildingName = buildingName.trim();
      if (locality) user.locality = locality.trim();
      if (city) user.city = city.trim();
      if (buildingType) user.buildingType = buildingType;
    }

    await user.save();

    // Cascade updated building details to all slots, active bookings, and active waitlist entries
    if (user.role === "OWNER") {
      const buildingFields = {
        buildingName: user.buildingName,
        locality: user.locality,
        city: user.city,
      };
      const ownerSlots = await Slot.find({ ownerId: user._id }).select("_id");
      const ownerSlotIds = ownerSlots.map((s) => s._id);

      await Promise.all([
        Slot.updateMany(
          { ownerId: user._id },
          { $set: { ...buildingFields, buildingType: user.buildingType } }
        ),
        Booking.updateMany(
          {
            status: "ACTIVE",
            $or: [{ ownerId: user._id }, { slotId: { $in: ownerSlotIds } }],
          },
          { $set: buildingFields }
        ),
        Waitlist.updateMany(
          { ownerId: user._id, status: { $in: ["WAITING", "READY"] } },
          { $set: buildingFields }
        ),
      ]);

      const io = getIO();
      if (io) {
        io.emit("slotsUpdated");
        io.emit("bookingsUpdated");
        io.emit("waitlistUpdated");
      }
    }

    const safeUser = user.toObject();
    delete safeUser.password;

    return res.status(200).json({ message: "Profile updated", user: safeUser });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

// 10. Delete Account Step 1 — Verify Password & Send Email OTP
async function handleSendDeleteOtp(req, res) {
  try {
    const { password } = req.body || {};
    if (!password) {
      return res.status(400).json({ error: "Please enter your current password" });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Incorrect password" });
    }

    const otp = generateOtp();
    await Otp.deleteMany({ email: user.email, purpose: "DELETE" });
    await Otp.create({ email: user.email, otp, purpose: "DELETE" });
    await sendOtpEmail(user.email, otp, "DELETE");

    return res.status(200).json({ message: "Verification code sent to your email" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

// 11. Delete Account Step 2 — Verify OTP & Permanently Delete
async function handleDeleteAccount(req, res) {
  try {
    const otp = String(req.body?.otp || "").trim();
    if (!otp) {
      return res.status(400).json({ error: "Verification code is required" });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const validOtp = await Otp.findOne({ email: user.email, otp, purpose: "DELETE" });
    if (!validOtp) {
      return res.status(400).json({ error: "Invalid or expired verification code" });
    }

    if (user.role === "OWNER") {
      await Slot.deleteMany({ ownerId: user._id });
    }
    await Otp.deleteMany({ email: user.email });
    await User.findByIdAndDelete(user._id);

    res.clearCookie("token");
    return res.status(200).json({ message: "Account permanently deleted" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  handleSendSignupOtp,
  handleUserSignup,
  handleUserLogin,
  handleForgotPassword,
  handleResetPassword,
  handleGetCurrentUser,
  handleUserLogout,
  handleUpdateBuildingLocation,
  handleUpdateProfile,
  handleSendDeleteOtp,
  handleDeleteAccount,
};