const express = require("express");
const {
  handleSendSignupOtp,
  handleUserSignup,
  handleUserLogin,
  handleForgotPassword,
  handleResetPassword,
  handleGetCurrentUser,
  handleUserLogout,
  handleUpdateBuildingLocation,
  handleUpdateProfile,
  handleSendDeleteOtp,
  handleDeleteAccount,
} = require("../controllers/user");
const { checkAuth, restrictTo } = require("../middlewares/auth");

const router = express.Router();

router.post("/send-signup-otp", handleSendSignupOtp);
router.post("/signup", handleUserSignup);
router.post("/login", handleUserLogin);
router.post("/forgot-password", handleForgotPassword);
router.post("/reset-password", handleResetPassword);
router.get("/me", checkAuth, handleGetCurrentUser);
router.post("/logout", handleUserLogout);
router.put("/location", checkAuth, restrictTo(["OWNER"]), handleUpdateBuildingLocation);
router.put("/profile", checkAuth, handleUpdateProfile);
router.post("/delete-otp", checkAuth, handleSendDeleteOtp);
router.delete("/account", checkAuth, handleDeleteAccount);

module.exports = router;