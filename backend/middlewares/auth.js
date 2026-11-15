const jwt = require("jsonwebtoken");

function checkAuth(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Please log in first" });
  }

  try {
    const decodedUser = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decodedUser;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}


// New Role Guard: Pass an array like ["OWNER"] or ["DRIVER"]
function restrictTo(roles = []) {
  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Access Denied: You do not have permission" });
    }
    return next();
  };
}

module.exports = {
  checkAuth,
  restrictTo,
};