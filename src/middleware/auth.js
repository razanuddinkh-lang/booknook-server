const jwt = require("jsonwebtoken");

function getUserFromRequest(req) {
  const authorization = req.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return null;

  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET is missing or is shorter than 32 characters.");
  }

  const payload = jwt.verify(token, secret, {
    algorithms: ["HS256"],
    issuer: "booknook-web",
    audience: "booknook-api",
  });

  if (
    !payload ||
    typeof payload !== "object" ||
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.name !== "string"
  ) {
    return null;
  }

  return {
    id: payload.sub,
    email: payload.email.trim().toLowerCase(),
    name: payload.name.trim(),
  };
}

function optionalAuth(req, res, next) {
  try {
    const authorization = req.headers.authorization;
    if (!authorization) return next();

    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: "Invalid authentication token." });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token. Please log in again." });
  }
}

function requireAuth(req, res, next) {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: "Authentication required. Please log in." });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token. Please log in again." });
  }
}

module.exports = { optionalAuth, requireAuth };
