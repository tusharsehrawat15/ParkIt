const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");

const userRoute = require("./routes/user");
const slotRoute = require("./routes/slot");
const bookingRoute = require("./routes/booking");
const notificationRoute = require("./routes/notification");
const waitlistRoute = require("./routes/waitlist");

const app = express();

// Required behind Render/reverse proxies so Secure cookies work over HTTPS
app.set("trust proxy", 1);

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""));

app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin, Postman, Supertest, or whitelisted frontends
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// Middleware to read JSON data and cookies
app.use(express.json());
app.use(cookieParser());

app.use(express.static(path.join(__dirname, "../frontend")));

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Register API Routes
app.use("/api/user", userRoute);
app.use("/api/slot", slotRoute);
app.use("/api/booking", bookingRoute);
app.use("/api/notification", notificationRoute);
app.use("/api/waitlist", waitlistRoute);

module.exports = app;