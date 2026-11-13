const mongoose = require("mongoose");

async function connectMongoDB(url) {
  try {
    await mongoose.connect(url);
    console.log("MongoDB Connected Successfully");
  } catch (error) {
    console.error("MongoDB Connection Error:", error.message);
  }
}

module.exports = { connectMongoDB };