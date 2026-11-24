import test from "node:test";
import assert from "node:assert/strict";
import { mapHalRecord, normalizeHalPayload } from "./hal-import-core.mjs";

const document = {
  docid: "1234567",
  halId_s: "hal-01234567",
  title_s: ["Introduction à la physique", "Introduction to physics"],
  authFullName_s: ["Marie Exemple", "Jean Test"],
  publisher_s: ["Éditions scientifiques"],
  producedDateY_i: 2022,
  publicationDate_s: "2022",
  language_s: ["fr"],
  keyword_s: ["physique", "mécanique classique"],
  domain_s: ["physique"],
  doiId_s: ["10.1234/hal.book"],
  isbn_s: ["978-0-306-40615-7"],
  licence_s: ["CC-BY"],
  uri_s: "https://hal.science/hal-01234567",
  docType_s: "OUV",
};

test("maps a HAL book into the shared source-record contract", () => {
  const record = mapHalRecord(document);
  assert.equal(record.externalRecordId, "hal-01234567");
  assert.equal(record.title, "Introduction à la physique");
  assert.equal(record.publicationYear, 2022);
  assert.equal(record.language, "fr");
  assert.deepEqual(record.authors, ["Marie Exemple", "Jean Test"]);
  assert.equal(record.publisher, "Éditions scientifiques");
  assert.deepEqual(record.isbns, ["9780306406157"]);
  assert.deepEqual(record.dois, ["10.1234/hal.book"]);
  assert.deepEqual(record.rightsEvidence, ["CC-BY"]);
  assert.deepEqual(record.issues, []);
  assert.equal(record.raw, document);
});

test("uses the HAL document identifier if no public HAL id is present", () => {
  const record = mapHalRecord({ docid: "7654321", docType_s: "OUV" });
  assert.equal(record.externalRecordId, "7654321");
  assert.equal(record.recordUrl, null);
});

test("flags articles and incomplete records instead of classifying them as books silently", () => {
  const record = mapHalRecord({
    docid: "99",
    title_s: ["An article"],
    docType_s: "ART",
  });
  assert.ok(record.issues.includes("unsupported_document_type"));
  assert.ok(record.issues.includes("unsupported_or_missing_language"));
  assert.ok(record.issues.includes("missing_contributors"));
});

test("normalizes HAL's response.docs envelope", () => {
  const [record] = normalizeHalPayload({ response: { docs: [document] } });
  assert.equal(record.externalRecordId, "hal-01234567");
});

test("rejects an unknown HAL response wrapper", () => {
  assert.throws(() => normalizeHalPayload({ data: [] }), /Format HAL non reconnu/);
});
