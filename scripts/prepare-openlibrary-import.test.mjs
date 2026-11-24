import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareOpenLibraryImport } from "./prepare-openlibrary-import.mjs";

async function writeJsonl(path, rows) {
  await writeFile(path, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
}

function record(kind, id, fields = {}) {
  return { source_code: "openlibrary", record_type: kind, external_record_id: id, source_record_version: "7", ...fields };
}

test("prepares separate entities and preserves many-Edition-to-one-Work relationships", async () => {
  const dir = await mkdtemp(join(tmpdir(), "openlibrary-package-"));
  try {
    const input = join(dir, "input");
    const output = join(dir, "output");
    await mkdir(input);
    await writeJsonl(join(input, "openlibrary-editions.jsonl"), [
      record("edition", "OL100M", { title: "Physics, first edition", publication_year: 1910, work_keys: ["OL10W"], isbn_identifiers: [{ normalizedValue: "0306406152" }] }),
      record("edition", "OL101M", { title: "Physics, second edition", publication_year: 1920, work_keys: ["OL10W"], isbn_identifiers: [{ normalizedValue: "0306406152" }] }),
      record("edition", "OL102M", { title: "Mathematics", publication_year: 1800, work_keys: ["OL404W"], isbn_identifiers: [] }),
    ]);
    await writeJsonl(join(input, "openlibrary-works.jsonl"), [
      record("work", "OL10W", { title: "Physics", author_keys: ["OL1A"] }),
    ]);
    await writeJsonl(join(input, "openlibrary-authors.jsonl"), [
      record("author", "OL1A", { preferred_name: "Ada Author", alternate_names: ["A. Author"] }),
    ]);

    const { manifest, outputPaths } = await prepareOpenLibraryImport({ inputDir: input, outDir: output, maxEditions: 100 });
    const editions = (await readFile(outputPaths.editions, "utf8")).trim().split("\n").map(JSON.parse);
    const works = (await readFile(outputPaths.works, "utf8")).trim().split("\n").map(JSON.parse);
    const relations = (await readFile(outputPaths.relationships, "utf8")).trim().split("\n").map(JSON.parse);
    assert.deepEqual(manifest.counts, { editions: 3, works: 1, authors: 1, relationships: 4 });
    assert.deepEqual(editions[0].work_external_ids, ["OL10W"]);
    assert.equal(works.length, 1);
    assert.equal(relations.filter((r) => r.relation === "edition_works" && r.to_id === "OL10W" && r.resolved).length, 2);
    assert.equal(editions[2].review_required, true);
    assert.ok(editions[2].review_reasons.includes("unresolved_or_conflicting_work_reference"));
    assert.equal(manifest.quality.duplicateIsbnValues, 1);
    assert.ok(editions[0].review_reasons.includes("isbn_shared_by_multiple_editions"));
    assert.ok(editions[1].review_reasons.includes("isbn_shared_by_multiple_editions"));
    assert.equal(manifest.safety.automaticMerges, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("marks conflicting revisions of a source key for review rather than choosing silently", async () => {
  const dir = await mkdtemp(join(tmpdir(), "openlibrary-conflicts-"));
  try {
    const input = join(dir, "input");
    const output = join(dir, "output");
    await mkdir(input);
    await writeJsonl(join(input, "openlibrary-editions.jsonl"), [
      record("edition", "OL200M", { title: "Title A", publication_year: 1950, work_keys: ["OL20W"] }),
      record("edition", "OL200M", { title: "Title B", publication_year: 1951, work_keys: ["OL20W"] }),
    ]);
    await writeJsonl(join(input, "openlibrary-works.jsonl"), [record("work", "OL20W", { title: "Work", author_keys: [] })]);
    await writeJsonl(join(input, "openlibrary-authors.jsonl"), []);
    const { manifest, outputPaths } = await prepareOpenLibraryImport({ inputDir: input, outDir: output, maxEditions: 10 });
    const editions = (await readFile(outputPaths.editions, "utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(editions.length, 1);
    assert.equal(editions[0].review_required, true);
    assert.ok(editions[0].review_reasons.includes("duplicate_source_record_id_conflicting_payloads"));
    const relationships = (await readFile(outputPaths.relationships, "utf8")).trim().split("\\n").map(JSON.parse);
    assert.equal(relationships[0].resolved, false);
    assert.equal(relationships[0].review_required, true);
    assert.equal(manifest.quality.unresolvedEditionWorkLinks, 1);
    assert.equal(manifest.quality.editionsInput.conflictingIds, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rejects invalid limits before processing files", async () => {
  await assert.rejects(() => prepareOpenLibraryImport({ inputDir: "missing", outDir: "unused", maxEditions: 0 }), /maxEditions/);
});
