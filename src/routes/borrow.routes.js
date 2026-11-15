const express = require("express");
const { getDB } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { parseObjectId } = require("../utils/validation");

const router = express.Router();
router.use(requireAuth);

// POST /borrows — create one active borrow for a user and book.
router.post("/", async (req, res) => {
  const { bookId, returnDate } = req.body || {};
  const objectId = parseObjectId(bookId);
  if (!objectId) {
    return res.status(400).json({ message: "A valid book ID is required." });
  }

  const parsedReturnDate = new Date(returnDate);
  if (!returnDate || Number.isNaN(parsedReturnDate.getTime()) || parsedReturnDate <= new Date()) {
    return res.status(400).json({ message: "Choose a valid return date in the future." });
  }

  const db = getDB();
  const books = db.collection("books");
  const borrows = db.collection("borrows");
  const userEmail = req.user.email;

  const existingBorrow = await borrows.findOne({ bookId: objectId, userEmail });
  if (existingBorrow) {
    return res.status(409).json({
      message: "You already borrowed this book. Return it before borrowing it again.",
    });
  }

  const book = await books.findOne({ _id: objectId });
  if (!book) return res.status(404).json({ message: "Book not found." });

  // Conditional update is atomic. Concurrent requests cannot borrow the same final copy.
  const decrementResult = await books.updateOne(
    { _id: objectId, availableCopies: { $gt: 0 } },
    { $inc: { availableCopies: -1 } },
  );

  if (decrementResult.modifiedCount !== 1) {
    const latestBook = await books.findOne({ _id: objectId });
    if (!latestBook) return res.status(404).json({ message: "Book not found." });
    return res.status(409).json({ message: "No copies are currently available." });
  }

  const borrow = {
    bookId: objectId,
    bookTitle: book.title,
    bookImage: book.image,
    userEmail,
    borrowDate: new Date(),
    returnDate: parsedReturnDate,
  };

  try {
    const insertResult = await borrows.insertOne(borrow);
    return res.status(201).json({
      message: "Book borrowed successfully.",
      borrow: { ...borrow, _id: insertResult.insertedId },
    });
  } catch (error) {
    // Restore the reserved copy if the borrow could not be recorded.
    await books.updateOne(
      {
        _id: objectId,
        $expr: { $lt: ["$availableCopies", "$totalCopies"] },
      },
      { $inc: { availableCopies: 1 } },
    );

    if (error && error.code === 11000) {
      return res.status(409).json({
        message: "You already borrowed this book. Return it before borrowing it again.",
      });
    }
    throw error;
  }
});

// GET /borrows — return active borrows belonging only to the signed-in user.
router.get("/", async (req, res) => {
  const borrows = await getDB()
    .collection("borrows")
    .find({ userEmail: req.user.email })
    .sort({ borrowDate: -1 })
    .toArray();

  return res.status(200).json({ borrows });
});

// DELETE /borrows/:id — return one book; only the borrower can return it.
router.delete("/:id", async (req, res) => {
  const borrowId = parseObjectId(req.params.id);
  if (!borrowId) return res.status(400).json({ message: "Invalid borrow ID." });

  const db = getDB();
  const borrows = db.collection("borrows");
  const books = db.collection("books");

  // Deleting the active borrow first makes simultaneous return requests idempotent:
  // only one request can obtain and return this borrow record.
  const borrow = await borrows.findOneAndDelete({
    _id: borrowId,
    userEmail: req.user.email,
  });

  if (!borrow) {
    return res.status(404).json({ message: "Active borrow not found. It may already have been returned." });
  }

  const restoreResult = await books.updateOne(
    {
      _id: borrow.bookId,
      $expr: { $lt: ["$availableCopies", "$totalCopies"] },
    },
    { $inc: { availableCopies: 1 } },
  );

  if (restoreResult.modifiedCount !== 1) {
    // Preserve the borrow record if the corresponding copy cannot be restored.
    try {
      await borrows.insertOne(borrow);
    } catch (restoreError) {
      console.error("Could not restore borrow record after failed return:", restoreError);
    }
    return res.status(409).json({
      message: "The book copy could not be restored. Please contact the library administrator.",
    });
  }

  return res.status(200).json({ message: "Book returned successfully." });
});

module.exports = router;
