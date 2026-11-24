import test from "node:test";
import assert from "node:assert/strict";
import { mapOpenLibraryWork, normalizeOpenLibraryPayload } from "./openlibrary-import-core.mjs";

const work = {
  key: "/works/OL27448W",
  title: "The Lord of the Rings",
  author_name: ["J. R. R. Tolkien"],
  author_key: ["OL26320A"],
  first_publish_year: 1954,
  edition_count: 120,
  edition_key: ["OL7353617M", "OL27449M"],
  isbn: ["9780618260300", "0261103571"],
  language: ["eng"],
  subject: ["Fantasy", "Fiction"],
};

test("maps an Open Library work with a stable work identifier", () => {
  const record = mapOpenLibraryWork(work);
  assert.equal(record.externalRecordId, "OL27448W");
  assert.equal(record.title, "The Lord of the Rings");
  assert.equal(record.publicationYear, 1954);
  assert.equal(record.language, "en");
  assert.deepEqual(record.authors, ["J. R. R. Tolkien"]);
  assert.deepEqual(record.editionKeys, ["OL7353617M", "OL27449M"]);
  assert.equal(record.editionCount, 120);
  assert.deepEqual(record.candidateIsbns, ["9780618260300", "0261103571"]);
});

test("does not attach aggregated work-level ISBNs to a fabricated edition", () => {
  const record = mapOpenLibraryWork(work);
  assert.deepEqual(record.isbns, []);
  assert.deepEqual(record.isbnIdentifiers, []);
  assert.ok(record.issues.includes("work_level_record_requires_edition_resolution"));
});

test("flags missing language while retaining work-level metadata", () => {
  const record = mapOpenLibraryWork({
    key: "/works/OL123W",
    title: "A historical book",
    first_publish_year: 1790,
    author_name: ["An Author"],
  });
  assert.equal(record.language, null);
  assert.ok(record.issues.includes("unsupported_or_missing_language"));
});

test("normalizes the Search API docs envelope", () => {
  const [record] = normalizeOpenLibraryPayload({ numFound: 1, docs: [work] });
  assert.equal(record.externalRecordId, "OL27448W");
});

test("rejects an unknown Open Library response envelope", () => {
  assert.throws(() => normalizeOpenLibraryPayload({ results: [] }), /Format Open Library non reconnu/);
});
