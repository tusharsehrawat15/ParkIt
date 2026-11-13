require("dotenv").config();
const express = require("express");
const{connectMongoDB} = require("./connection");

const app = express();
const PORT = process.env.PORT || 8000;

connectMongoDB(process.env.MONGO_URI);

app.get("/", (req, res) => {
  return res.status(200).json({ message: "ParkIt Server is alive!" });
});

app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});