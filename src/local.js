
require("dotenv").config();

const app = require("./app");
const { closeDB } = require("./config/db");

const PORT = process.env.PORT || 5000;

const httpServer = app.listen(PORT, () => {
  console.log(
    `BookNook API running at http://localhost:${PORT}`
  );
});

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down...`);

  httpServer.close(async () => {
    await closeDB();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
