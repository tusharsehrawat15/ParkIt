const User = require("../models/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");


//User Sign Up will be handled here.
async function handleUserSignup(req, res) {
  try {
    const { name, email, password, role, vehicleNumber, buildingName } = req.body || {};

    // 1. Basic validation: Check if common required fields are missing
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "Name, email, password, and role are required" });
    }

    // 2. Role-specific check (Matches your 2-screen frontend flow!)
    if (role === "DRIVER" && !vehicleNumber) {
      return res.status(400).json({ error: "Vehicle number is required for Vehicle Owners" });
    }
    if (role === "OWNER" && !buildingName) {
      return res.status(400).json({ error: "Building name is required for Parking Owners" });
    }

    // 3. Check if email already exists in MongoDB
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: "Email is already registered" });
    }

    // 4. Encrypt (hash) the password before saving
    const hashedPassword = await bcrypt.hash(password, 10);

    // 5. Create the user in MongoDB
    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      vehicleNumber: role === "DRIVER" ? vehicleNumber : null,
      buildingName: role === "OWNER" ? buildingName : null,
    });

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


// User Logging In will be handled here.
async function handleUserLogin(req, res) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user by email in MongoDB
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Compare plain password from Postman with hashed password in MongoDB
    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Create JWT token containing user's ID and Role (DRIVER or OWNER)
    const token = jwt.sign(
      { id: user._id, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // Send token inside a secure httpOnly cookie
    res.cookie("token", token, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 1 day in milliseconds
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

module.exports = {
  handleUserSignup,
  handleUserLogin,
};