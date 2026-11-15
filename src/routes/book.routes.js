const express = require("express");
const { getDB } = require("../config/db");
const { optionalAuth, requireAuth } = require("../middleware/auth");
const {
  BOOK_CATEGORIES,
  isNonEmptyString,
  isHttpUrl,
  parseObjectId,
  escapeRegex,
} = require("../utils/validation");

const router = express.Router();

// GET /books — public. Add ?limit=6 for newest arrivals or ?mine=true for owner's books.
router.get("/", optionalAuth, async (req, res) => {
  const filter = {};

  if (req.query.mine === "true") {
    if (!req.user) {
      return res.status(401).json({ message: "Log in to view the books you added." });
    }
    filter["addedBy.email"] = req.user.email;
  }

  if (typeof req.query.category === "string" && BOOK_CATEGORIES.includes(req.query.category)) {
    filter.category = req.query.category;
  }

  if (typeof req.query.q === "string" && req.query.q.trim()) {
    const search = escapeRegex(req.query.q.trim().slice(0, 80));
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { author: { $regex: search, $options: "i" } },
    ];
  }

  const cursor = getDB()
    .collection("books")
    .find(filter)
    .sort({ createdAt: -1 });

  const limit = Number.parseInt(req.query.limit, 10);
  if (Number.isInteger(limit) && limit > 0) {
    cursor.limit(Math.min(limit, 100));
  }

  const books = await cursor.toArray();
  return res.status(200).json({ books });
});

// GET /books/:id — public book details.
router.get("/:id", async (req, res) => {
  const id = parseObjectId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid book ID." });

  const book = await getDB().collection("books").findOne({ _id: id });
  if (!book) return res.status(404).json({ message: "Book not found." });

  return res.status(200).json({ book });
});

// POST /books — add a book. Owner details come from the verified JWT, not the request body.
router.post("/", requireAuth, async (req, res) => {
  const { title, author, category, image, description, totalCopies } = req.body || {};

  if (![title, author, description].every(isNonEmptyString)) {
    return res.status(400).json({
      message: "Book title, author name, and description are required.",
    });
  }
  if (!BOOK_CATEGORIES.includes(category)) {
    return res.status(400).json({ message: "Please select a valid book category." });
  }
  if (!isHttpUrl(image)) {
    return res.status(400).json({ message: "Please provide a valid book image URL." });
  }
  if (!Number.isInteger(totalCopies) || totalCopies < 1 || totalCopies > 500) {
    return res.status(400).json({ message: "Total copies must be a whole number between 1 and 500." });
  }

  const book = {
    title: title.trim(),
    author: author.trim(),
    category,
    image: image.trim(),
    description: description.trim(),
    totalCopies,
    availableCopies: totalCopies,
    addedBy: {
      name: req.user.name,
      email: req.user.email,
    },
    createdAt: new Date(),
  };

  const result = await getDB().collection("books").insertOne(book);
  return res.status(201).json({
    message: "Book added successfully.",
    book: { ...book, _id: result.insertedId },
  });
});

// PATCH /books/:id — only the person who added the book can update it.
router.patch("/:id", requireAuth, async (req, res) => {
  const id = parseObjectId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid book ID." });

  const books = getDB().collection("books");
  const current = await books.findOne({ _id: id });
  if (!current) return res.status(404).json({ message: "Book not found." });
  if (current.addedBy?.email !== req.user.email) {
    return res.status(403).json({ message: "You can only edit books you added." });
  }

  const { title, author, category, image, description, totalCopies } = req.body || {};
  if (![title, author, description].every(isNonEmptyString)) {
    return res.status(400).json({ message: "All book fields are required." });
  }
  if (!BOOK_CATEGORIES.includes(category)) {
    return res.status(400).json({ message: "Please select a valid book category." });
  }
  if (!isHttpUrl(image)) {
    return res.status(400).json({ message: "Please provide a valid book image URL." });
  }
  if (!Number.isInteger(totalCopies) || totalCopies < 1 || totalCopies > 500) {
    return res.status(400).json({ message: "Total copies must be a whole number between 1 and 500." });
  }

  const currentlyBorrowed = current.totalCopies - current.availableCopies;
  if (totalCopies < currentlyBorrowed) {
    return res.status(409).json({
      message: `There are ${currentlyBorrowed} active borrow(s). Total copies cannot be lower than that.`,
    });
  }

  const updateResult = await books.updateOne(
    {
      _id: id,
      "addedBy.email": req.user.email,
      totalCopies: current.totalCopies,
      availableCopies: current.availableCopies,
    },
    {
      $set: {
        title: title.trim(),
        author: author.trim(),
        category,
        image: image.trim(),
        description: description.trim(),
        totalCopies,
        availableCopies: totalCopies - currentlyBorrowed,
        updatedAt: new Date(),
      },
    },
  );

  if (updateResult.modifiedCount !== 1) {
    return res.status(409).json({
      message: "This book changed while you were editing it. Reload the page and try again.",
    });
  }

  const updatedBook = await books.findOne({ _id: id });
  return res.status(200).json({ message: "Book updated successfully.", book: updatedBook });
});

// DELETE /books/:id — only the owner may delete a book with no active borrows.
router.delete("/:id", requireAuth, async (req, res) => {
  const id = parseObjectId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid book ID." });

  const books = getDB().collection("books");
  const existing = await books.findOne({ _id: id });
  if (!existing) return res.status(404).json({ message: "Book not found." });
  if (existing.addedBy?.email !== req.user.email) {
    return res.status(403).json({ message: "You can only delete books you added." });
  }

  const result = await books.deleteOne({
    _id: id,
    "addedBy.email": req.user.email,
    $expr: { $eq: ["$availableCopies", "$totalCopies"] },
  });

  if (result.deletedCount !== 1) {
    return res.status(409).json({
      message: "This book has active borrows. It cannot be deleted until every copy is returned.",
    });
  }

  return res.status(200).json({ message: "Book deleted successfully." });
});

module.exports = router;
