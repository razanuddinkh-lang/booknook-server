
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");

const { connectDB } = require("./config/db");

const bookRoutes = require("./routes/book.routes");
const borrowRoutes = require("./routes/borrow.routes");

const app = express();

// Allowed frontend origins
const allowedOrigins = [
  "http://localhost:3000",
  ...(process.env.CLIENT_URL || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
];

app.disable("x-powered-by");

app.use(helmet());

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error(`CORS blocked this origin: ${origin}`)
      );
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "1mb" }));

// Rate limiting
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      message: "Too many requests. Please try again in a minute.",
    },
  })
);

// Health check (does not require a database connection)
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "BookNook API is running",
  });
});

// Connect to MongoDB before processing database routes.
// This also handles new serverless instances.
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    next(error);
  }
});

// Book and borrow routes
app.use("/books", bookRoutes);
app.use("/borrows", borrowRoutes);

// Unknown routes
app.use((req, res) => {
  res.status(404).json({
    message: `API route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Central error handler
app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

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

  const statusCode =
    Number.isInteger(error.statusCode)
      ? error.statusCode
      : Number.isInteger(error.status)
        ? error.status
        : 500;

  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error."
      : error.message || "Internal server error.";

  res.status(statusCode).json({ message });
});

module.exports = app;
