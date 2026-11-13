const express = require("express");
const { handleUserSignup, handleUserLogin, handleGetCurrentUser } = require("../controllers/user");
const { checkAuth } = require("../middlewares/auth");

const router = express.Router();

router.post("/signup", handleUserSignup);
router.post("/login", handleUserLogin);
router.get("/me", checkAuth, handleGetCurrentUser);

module.exports = router;