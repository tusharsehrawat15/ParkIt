const http = require("http");
require("dotenv").config();
const app = require("./app");
const { connectMongoDB } = require("./connection");
const { connectRedis } = require("./redis");
const { initSocket } = require("./socket");

const server = http.createServer(app);
const PORT = process.env.PORT || 8000;

initSocket(server);
connectMongoDB(process.env.MONGO_URI);
connectRedis();

server.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});