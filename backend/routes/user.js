const express = require("express");
const {
  handleUserSignup,
  handleUserLogin,
  handleGetCurrentUser,
  handleUserLogout,
  handleUpdateBuildingLocation,
} = require("../controllers/user");
const { checkAuth, restrictTo } = require("../middlewares/auth");

const router = express.Router();

router.post("/signup", handleUserSignup);
router.post("/login", handleUserLogin);
router.get("/me", checkAuth, handleGetCurrentUser);
router.post("/logout", handleUserLogout);
router.put("/location", checkAuth, restrictTo(["OWNER"]), handleUpdateBuildingLocation);

module.exports = router;