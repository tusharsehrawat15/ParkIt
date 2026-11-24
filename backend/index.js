const http = require("http");
const path = require("path");
require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const { connectMongoDB } = require("./connection");
const { connectRedis } = require("./redis");
const { initSocket } = require("./socket");

const userRoute = require("./routes/user");
const slotRoute = require("./routes/slot");
const bookingRoute = require("./routes/booking");
const notificationRoute = require("./routes/notification");
const waitlistRoute = require("./routes/waitlist");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 8000;

initSocket(server);
connectMongoDB(process.env.MONGO_URI);
connectRedis();

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

server.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});