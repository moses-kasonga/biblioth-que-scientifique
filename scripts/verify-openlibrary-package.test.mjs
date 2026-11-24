import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyOpenLibraryPackage } from "./verify-openlibrary-package.mjs";

const hash = (text) => createHash("sha256").update(text).digest("hex");
const line = (value) => JSON.stringify(value) + "\n";

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "openlibrary-verify-"));
  const files = {
    editions: "editions-prepared.jsonl", works: "works-prepared.jsonl",
    authors: "authors-prepared.jsonl", relationships: "relationships-prepared.jsonl",
  };
  const data = {
    editions: line({ source_record: { record_type: "edition", external_record_id: "OL100M" }, work_external_ids: ["OL10W"], review_required: false, review_reasons: [] }),
    works: line({ source_record: { record_type: "work", external_record_id: "OL10W" }, author_external_ids: ["OL1A"], review_required: false, review_reasons: [] }),
    authors: line({ source_record: { record_type: "author", external_record_id: "OL1A" }, review_required: false, review_reasons: [] }),
    relationships: line({ from_type: "edition", from_id: "OL100M", to_type: "work", to_id: "OL10W", relation: "edition_works", resolved: true, review_required: false }) +
      line({ from_type: "work", from_id: "OL10W", to_type: "agent", to_id: "OL1A", relation: "work_agents", role_code: "author", resolved: true, review_required: false }),
  };
  const outputs = {};
  for (const [name, filename] of Object.entries(files)) {
    await writeFile(join(dir, filename), data[name]);
    outputs[name] = { file: filename, sha256: hash(data[name]) };
  }
  const manifest = {
    format: "nexus-openlibrary-import-package", formatVersion: 1,
    executionMode: "preparation-only; no database connection and no catalogue writes",
    counts: { editions: 1, works: 1, authors: 1, relationships: 2 },
    quality: { unresolvedEditionWorkLinks: 0, unresolvedWorkAuthorLinks: 0 },
    outputs,
    safety: { canonicalEntitiesCreated: false, sourceRecordsWritten: false, automaticMerges: false },
  };
  await writeFile(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return { dir, manifest, data, files };
}

test("accepts a complete package with matching hashes and resolved graph", async () => {
  const f = await fixture();
  try {
    const result = await verifyOpenLibraryPackage(f.dir);
    assert.equal(result.valid, true);
    assert.deepEqual(result.counts, { editions: 1, works: 1, authors: 1, relationships: 2 });
    assert.equal(result.databaseAccessed, false);
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});

test("rejects a changed JSONL file using its SHA-256 manifest", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.dir, f.files.editions), f.data.editions + "{}\n");
    await assert.rejects(() => verifyOpenLibraryPackage(f.dir), /Empreinte SHA-256 incorrecte/);
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});

test("rejects a missing Edition-to-Work edge even when its checksum is updated", async () => {
  const f = await fixture();
  try {
    const relationships = f.data.relationships.split("\n").filter(Boolean).slice(1).join("\n") + "\n";
    await writeFile(join(f.dir, f.files.relationships), relationships);
    f.manifest.outputs.relationships.sha256 = hash(relationships);
    f.manifest.counts.relationships = 1;
    await writeFile(join(f.dir, "manifest.json"), JSON.stringify(f.manifest, null, 2));
    await assert.rejects(() => verifyOpenLibraryPackage(f.dir), /Lien Edition–Work attendu absent/);
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});



test("accepts unresolved links whose source key is explicitly conflicted", async () => {
  const f = await fixture();
  try {
    const edition = line({
      source_record: { record_type: "edition", external_record_id: "OL100M" },
      work_external_ids: ["OL10W"], review_required: true,
      review_reasons: ["duplicate_source_record_id_conflicting_payloads"],
    });
    const relationships = line({
      from_type: "edition", from_id: "OL100M", to_type: "work", to_id: "OL10W",
      relation: "edition_works", resolved: false, review_required: true,
    }) + line({
      from_type: "work", from_id: "OL10W", to_type: "agent", to_id: "OL1A",
      relation: "work_agents", role_code: "author", resolved: true, review_required: false,
    });
    await writeFile(join(f.dir, f.files.editions), edition);
    await writeFile(join(f.dir, f.files.relationships), relationships);
    f.manifest.outputs.editions.sha256 = hash(edition);
    f.manifest.outputs.relationships.sha256 = hash(relationships);
    f.manifest.quality.unresolvedEditionWorkLinks = 1;
    await writeFile(join(f.dir, "manifest.json"), JSON.stringify(f.manifest, null, 2));
    const result = await verifyOpenLibraryPackage(f.dir);
    assert.equal(result.valid, true);
    assert.equal(result.unresolved.editionWork, 1);
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});

test("rejects manifest counts that do not match the JSONL records", async () => {
  const f = await fixture();
  try {
    f.manifest.counts.editions = 9;
    await writeFile(join(f.dir, "manifest.json"), JSON.stringify(f.manifest, null, 2));
    await assert.rejects(() => verifyOpenLibraryPackage(f.dir), /Compteur manifest/);
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});
