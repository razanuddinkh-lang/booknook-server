const { ObjectId } = require("mongodb");

const BOOK_CATEGORIES = ["Fiction", "Science", "History", "Kids", "Others"];

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function parseObjectId(value) {
  if (typeof value !== "string" || !/^[a-fA-F0-9]{24}$/.test(value)) {
    return null;
  }
  return new ObjectId(value);
}

function isHttpUrl(value) {
  if (!isNonEmptyString(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  BOOK_CATEGORIES,
  isNonEmptyString,
  parseObjectId,
  isHttpUrl,
  escapeRegex,
};
