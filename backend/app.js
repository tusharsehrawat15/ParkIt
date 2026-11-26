const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");

const userRoute = require("./routes/user");
const slotRoute = require("./routes/slot");
const bookingRoute = require("./routes/booking");
const notificationRoute = require("./routes/notification");
const waitlistRoute = require("./routes/waitlist");

const app = express();

// Middleware to read JSON data and cookies
app.use(express.json());
app.use(cookieParser());

app.use(express.static(path.join(__dirname, "../frontend")));

// Register API Routes
app.use("/api/user", userRoute);
app.use("/api/slot", slotRoute);
app.use("/api/booking", bookingRoute);
app.use("/api/notification", notificationRoute);
app.use("/api/waitlist", waitlistRoute);

module.exports = app;