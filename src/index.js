
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");

const { connectDB, closeDB } = require("./config/db");
const bookRoutes = require("./routes/book.routes");
const borrowRoutes = require("./routes/borrow.routes");

const app = express();

const PORT = process.env.PORT || 5000;

// Important for Vercel proxy.
app.set("trust proxy", 1);

app.disable("x-powered-by");

const allowedOrigins = (
  process.env.CLIENT_URL || "http://localhost:3000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Security
app.use(helmet());

// CORS
app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        allowedOrigins.includes(origin)
      ) {
        return callback(null, true);
      }

      return callback(new Error("CORS blocked this origin."));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// JSON parser
app.use(express.json({ limit: "1mb" }));

// Rate limiter
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      message: "Too many requests. Please try again later.",
    },
  })
);

// Health check
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "BookNook API is running",
  });
});

// MongoDB connection before API routes
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    next(error);
  }
});

// API routes
app.use("/books", bookRoutes);
app.use("/borrows", borrowRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    message: `API route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Error handler
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  console.error("API error:", error);

  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      message: "Invalid JSON request body.",
    });
  }

  if (error.message?.startsWith("CORS blocked")) {
    return res.status(403).json({
      message: "This website origin is not allowed to access the API.",
    });
  }

  const statusCode = Number.isInteger(error.statusCode)
    ? error.statusCode
    : Number.isInteger(error.status)
      ? error.status
      : 500;

  return res.status(statusCode).json({
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error."
        : error.message || "Internal server error.",
  });
});

// Localhost startup only.
// Vercel imports and uses the exported Express app.
if (require.main === module) {
  async function startServer() {
    if (
      !process.env.JWT_SECRET ||
      process.env.JWT_SECRET.length < 32
    ) {
      throw new Error(
        "JWT_SECRET must contain at least 32 characters."
      );
    }

    await connectDB();

    const server = app.listen(PORT, () => {
      console.log(`BookNook API running at http://localhost:${PORT}`);
    });

    async function shutdown(signal) {
      console.log(`${signal}: Shutting down BookNook API...`);

      server.close(async () => {
        await closeDB();
        process.exit(0);
      });
    }

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  }

  startServer().catch(async (error) => {
    console.error("Failed to start BookNook API:", error);
    await closeDB().catch(() => {});
    process.exit(1);
  });
}

module.exports = app;
