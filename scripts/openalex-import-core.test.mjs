import test from "node:test";
import assert from "node:assert/strict";
import { mapOpenAlexWork, normalizeOpenAlexPayload } from "./openalex-import-core.mjs";

const work = {
  id: "https://openalex.org/W1234567890",
  display_name: "Foundations of Physics",
  type: "book",
  publication_year: 2024,
  publication_date: "2024-05-01",
  language: "en",
  updated_date: "2026-11-20T10:00:00Z",
  doi: "https://doi.org/10.1234/Physics.Book",
  ids: { openalex: "https://openalex.org/W1234567890" },
  authorships: [
    { author: { display_name: "Ada Example" }, contributor_roles: [] },
    {
      author: { display_name: "Benoit Editor" },
      contributor_roles: [{ id: "https://openalex.org/contributor-roles/editor", display_name: "editor" }],
    },
  ],
  topics: [{ display_name: "Physics", field: { display_name: "Physical Sciences" } }],
  keywords: [{ display_name: "classical mechanics" }],
  open_access: { is_oa: false },
};

test("maps an OpenAlex book into the shared source-record contract", () => {
  const record = mapOpenAlexWork(work);
  assert.equal(record.externalRecordId, "W1234567890");
  assert.equal(record.title, "Foundations of Physics");
  assert.equal(record.publicationYear, 2024);
  assert.equal(record.language, "en");
  assert.deepEqual(record.authors, ["Ada Example"]);
  assert.deepEqual(record.editors, ["Benoit Editor"]);
  assert.deepEqual(record.dois, ["10.1234/physics.book"]);
  assert.ok(record.disciplines.includes("physics"));
  assert.deepEqual(record.rightsEvidence, ["open_access.is_oa=false"]);
  assert.deepEqual(record.issues, []);
  assert.equal(record.raw, work);
});

test("keeps missing ISBN and publisher fields empty instead of inventing values", () => {
  const record = mapOpenAlexWork(work);
  assert.deepEqual(record.isbns, []);
  assert.equal(record.publisher, "");
});

test("flags non-book records and incomplete metadata for review", () => {
  const record = mapOpenAlexWork({
    id: "https://openalex.org/W2",
    title: "An article",
    type: "article",
    publication_year: 2020,
  });
  assert.ok(record.issues.includes("unsupported_work_type"));
  assert.ok(record.issues.includes("unsupported_or_missing_language"));
  assert.ok(record.issues.includes("missing_contributors"));
});

test("normalizes the paged OpenAlex response without losing the raw record", () => {
  const payload = { meta: { count: 1, next_cursor: "cursor-2" }, results: [work] };
  const [record] = normalizeOpenAlexPayload(payload);
  assert.equal(record.externalRecordId, "W1234567890");
});

test("rejects an unknown OpenAlex response wrapper", () => {
  assert.throws(() => normalizeOpenAlexPayload({ data: [] }), /Format OpenAlex non reconnu/);
});
