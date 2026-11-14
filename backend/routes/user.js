const express = require("express");
const { handleUserSignup, handleUserLogin, handleGetCurrentUser, handleUserLogout } = require("../controllers/user");
const { checkAuth } = require("../middlewares/auth");

const router = express.Router();

router.post("/signup", handleUserSignup);
router.post("/login", handleUserLogin);
router.get("/me", checkAuth, handleGetCurrentUser);
router.post("/logout", handleUserLogout);

module.exports = router;