require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit").rateLimit;
const { connectDB, closeDB } = require("./config/db");
const bookRoutes = require("./routes/book.routes");
const borrowRoutes = require("./routes/borrow.routes");

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      // Requests from tools such as curl/Postman may not include an Origin header.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked this origin: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests. Please try again in a minute." },
  }),
);

// Required REST API routes.
app.use("/books", bookRoutes);
app.use("/borrows", borrowRoutes);

// Unknown API endpoint.
app.use((req, res) => {
  return res.status(404).json({ message: `API route not found: ${req.method} ${req.originalUrl}` });
});

// Central error handler (Express 5 forwards rejected async route promises here).
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  console.error("API error:", error);

  if (error && error.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Invalid JSON request body." });
  }
  if (error && error.message && error.message.startsWith("CORS blocked")) {
    return res.status(403).json({ message: "This website origin is not allowed to access the API." });
  }

  const statusCode = Number.isInteger(error.status) ? error.status : 500;
  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error."
      : error.message || "Internal server error.";

  return res.status(statusCode).json({ message });
});

let httpServer;

async function startServer() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be set in server/.env and contain at least 32 characters.");
  }

  await connectDB();

  httpServer = app.listen(PORT, () => {
    console.log(`BookNook Express API is running at http://localhost:${PORT}`);
    console.log(`Allowed frontend origin(s): ${allowedOrigins.join(", ")}`);
  });
}

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down BookNook API...`);
  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
  await closeDB();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startServer().catch(async (error) => {
  console.error("Failed to start BookNook API:", error);
  await closeDB().catch(() => {});
  process.exit(1);
});

module.exports = app;
