import test from "node:test";
import assert from "node:assert/strict";
import {
  mapDoabRecord,
  normalizeDoabPayload,
  normalizeIsbn,
  normalizeLanguage,
  normalizeDoi,
  parsePublicationYear,
} from "./doab-import-core.mjs";

const dspaceRecord = {
  _embedded: {
    searchResult: {
      _embedded: {
        objects: [
          {
            indexableObject: {
              uuid: "pilot-fixture-001",
              handle: "20.5000/example-book",
              lastModified: "2026-11-01T10:00:00Z",
              metadata: [
                { key: "dc.title", value: "Foundations of Physics" },
                { key: "dc.contributor.author", value: "A. Example" },
                { key: "dc.publisher", value: "Example Academic Press" },
                { key: "dc.date.issued", value: "2024" },
                { key: "dc.language.iso", value: "eng" },
                { key: "dc.subject", value: "Physics" },
                { key: "dc.identifier.isbn", value: "978-0-306-40615-7" },
                { key: "dc.identifier.doi", value: "https://doi.org/10.1234/Example.DOI" },
                { key: "dc.rights.uri", value: "https://creativecommons.org/licenses/by/4.0/" },
              ],
            },
          },
        ],
      },
    },
  },
};

test("normalizes a DSpace-style DOAB record without losing provenance fields", () => {
  const [record] = normalizeDoabPayload(dspaceRecord);
  assert.equal(record.externalRecordId, "20.5000/example-book");
  assert.equal(record.title, "Foundations of Physics");
  assert.equal(record.publicationYear, 2024);
  assert.equal(record.language, "en");
  assert.deepEqual(record.authors, ["A. Example"]);
  assert.deepEqual(record.disciplines, ["physics"]);
  assert.deepEqual(record.isbns, ["9780306406157"]);
  assert.deepEqual(record.dois, ["10.1234/example.doi"]);
  assert.deepEqual(record.rightsEvidence, ["https://creativecommons.org/licenses/by/4.0/"]);
  assert.equal(record.raw, dspaceRecord._embedded.searchResult._embedded.objects[0]);
  assert.deepEqual(record.issues, []);
});

test("rejects invalid ISBN checksums and malformed DOI values", () => {
  assert.equal(normalizeIsbn("9780306406157"), "9780306406157");
  assert.equal(normalizeIsbn("9780306406158"), null);
  assert.equal(normalizeIsbn("0306406152"), "0306406152");
  assert.equal(normalizeDoi("doi:10.5555/ABC-1"), "10.5555/abc-1");
  assert.equal(normalizeDoi("https://example.org/not-a-doi"), null);
});

test("maps supported language aliases and leaves unsupported languages unresolved", () => {
  assert.equal(normalizeLanguage("eng"), "en");
  assert.equal(normalizeLanguage("fr-FR"), "fr");
  assert.equal(normalizeLanguage("spa"), "es");
  assert.equal(normalizeLanguage("por"), "pt");
  assert.equal(normalizeLanguage("deu"), null);
});

test("parses publication years without inventing an unknown year", () => {
  assert.equal(parsePublicationYear("2021-05-17"), 2021);
  assert.equal(parsePublicationYear("circa 1890"), 1890);
  assert.equal(parsePublicationYear("unknown"), null);
});

test("does not create a fully valid record when required metadata are missing", () => {
  const record = mapDoabRecord({
    uuid: "record-without-required-fields",
    metadata: [
      { key: "dc.title", value: "A title only" },
    ],
  });
  assert.equal(record.language, null);
  assert.equal(record.publicationYear, null);
  assert.ok(record.issues.includes("unsupported_or_missing_language"));
  assert.ok(record.issues.includes("missing_or_unparsed_publication_year"));
  assert.ok(record.issues.includes("missing_contributors"));
});

test("rejects an unknown DOAB response wrapper instead of silently importing zero records", () => {
  assert.throws(
    () => normalizeDoabPayload({ unexpected: { payload: [] } }),
    /Format DOAB non reconnu/
  );
});
