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

test("recognizes a single M-keyed edition and may attach its ISBN to that edition", () => {
  const record = mapOpenLibraryWork({
    key: "/works/OL16062681M",
    title: "Natural philosophy",
    first_publish_year: 1900,
    edition_count: 1,
    edition_key: ["OL16062681M"],
    author_name: ["Example Author"],
    language: ["eng"],
    isbn: ["9780306406157"],
    publisher: ["Example Press"],
    subject: ["Science"],
  });
  assert.equal(record.externalRecordId, "OL16062681M");
  assert.equal(record.identifierLevel, "edition");
  assert.equal(record.recordUrl, "https://openlibrary.org/books/OL16062681M");
  assert.deepEqual(record.isbns, ["9780306406157"]);
  assert.deepEqual(record.issues, []);
});

test("does not resolve a work to an arbitrary one among several editions", () => {
  const record = mapOpenLibraryWork({
    key: "/works/OL987W",
    title: "A work with editions",
    first_publish_year: 1920,
    edition_count: 3,
    edition_key: ["OL1M", "OL2M", "OL3M"],
    isbn: ["9780306406157"],
    author_name: ["Example Author"],
    language: ["eng"],
  });
  assert.equal(record.identifierLevel, "work");
  assert.deepEqual(record.isbns, []);
  assert.ok(record.issues.includes("work_level_record_requires_edition_resolution"));
});
