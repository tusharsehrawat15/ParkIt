require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const{connectMongoDB} = require("./connection");
const userRoute = require("./routes/user");
const slotRoute = require("./routes/slot");
const { connectRedis } = require("./redis");

const app = express();
const PORT = process.env.PORT || 8000;

connectMongoDB(process.env.MONGO_URI);
connectRedis();

//Middleware to read JSON data sent from Postman/ Frontend
app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
  return res.status(200).json({ message: "ParkIt Server is alive!" });
});

//Register User Routes
app.use("/api/user",userRoute);
app.use("/api/slot", slotRoute);

app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});