const { MongoClient } = require("mongodb");

let client;
let database;
let connectingPromise;

async function connectDB() {
  if (database) return database;
  if (connectingPromise) return connectingPromise;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is missing. Add it to server/.env.");
  }

  connectingPromise = (async () => {
    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 10,
    });

    await client.connect();
    database = client.db(process.env.MONGODB_DB || "booknook");

    // Indexes used by the library pages and duplicate-borrow protection.
    await Promise.all([
      database.collection("books").createIndex({ createdAt: -1 }),
      database.collection("books").createIndex({ "addedBy.email": 1, createdAt: -1 }),
      database.collection("books").createIndex({ category: 1, createdAt: -1 }),
      database.collection("borrows").createIndex(
        { bookId: 1, userEmail: 1 },
        { unique: true, name: "one_active_borrow_per_user_and_book" },
      ),
      database.collection("borrows").createIndex({ userEmail: 1, borrowDate: -1 }),
    ]);

    console.log(`Connected to MongoDB database: ${database.databaseName}`);
    return database;
  })();

  try {
    return await connectingPromise;
  } catch (error) {
    connectingPromise = undefined;
    if (client) {
      await client.close().catch(() => {});
      client = undefined;
    }
    throw error;
  }
}

function getDB() {
  if (!database) {
    throw new Error("MongoDB is not connected. The API server has not finished starting.");
  }
  return database;
}

async function closeDB() {
  if (client) {
    await client.close();
    client = undefined;
    database = undefined;
    connectingPromise = undefined;
    console.log("MongoDB connection closed.");
  }
}

module.exports = { connectDB, getDB, closeDB };
