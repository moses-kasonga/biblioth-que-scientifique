import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanOpenLibraryDumps } from "./scan-openlibrary-dump.mjs";

function row(type, key, revision, modified, record) {
  return [type, key, String(revision), modified, JSON.stringify(record)].join("\t");
}

test("streams edition and work dumps into separate JSONL files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "openlibrary-dump-"));
  try {
    const editionsPath = join(dir, "editions.txt.gz");
    const worksPath = join(dir, "works.txt.gz");
    const scientificEdition = row("/type/edition", "/books/OL100M", 7, "2026-11-01T00:00:00.000000", {
      title: "A book about physics",
      publish_date: "1901",
      publishers: ["Science Press"],
      languages: [{ key: "/languages/eng" }],
      isbn_10: ["0306406152"],
      isbn_13: ["9780306406157"],
      subjects: ["Physics", "Science"],
      works: [{ key: "/works/OL10W" }],
    });
    const nonScientificEdition = row("/type/edition", "/books/OL101M", 2, "2026-11-02T00:00:00.000000", {
      title: "A poetry book",
      publish_date: "1902",
      subjects: ["Poetry"],
      works: [{ key: "/works/OL11W" }],
    });
    const historicalEdition = row("/type/edition", "/books/OL102M", 3, "2026-11-03T00:00:00.000000", {
      title: "Older mathematics",
      publish_date: "1790",
      languages: [{ key: "/languages/fre" }],
      isbn_10: ["0306406152"],
      subjects: ["Mathematics"],
      works: [{ key: "/works/OL12W" }],
    });
    await writeFile(editionsPath, gzipSync([scientificEdition, nonScientificEdition, historicalEdition].join("\n") + "\n"));

    const work10 = row("/type/work", "/works/OL10W", 9, "2026-11-03T00:00:00.000000", {
      title: "A book about physics",
      first_publish_date: "1901",
      subjects: ["Physics"],
      authors: [{ author: { key: "/authors/OL1A" } }],
    });
    const work12 = row("/type/work", "/works/OL12W", 4, "2026-11-03T00:00:00.000000", {
      title: "Older mathematics",
      first_publish_date: "1790",
      subjects: ["Mathematics"],
    });
    const unrelatedWork = row("/type/work", "/works/OL99W", 1, "2026-11-03T00:00:00.000000", {
      title: "Unrelated work",
      subjects: ["Poetry"],
    });
    await writeFile(worksPath, gzipSync([work10, work12, unrelatedWork].join("\n") + "\n"));

    const report = await scanOpenLibraryDumps({
      editions: editionsPath,
      works: worksPath,
      fromYear: 1720,
      toYear: 2026,
      maxEditions: 100,
      skipMatching: 0,
      outDir: join(dir, "out"),
    });

    assert.equal(report.editions.scanned, 3);
    assert.equal(report.editions.selected, 2);
    assert.equal(report.editions.nonScientific, 1);
    assert.equal(report.editions.validIsbnValues, 2);
    assert.equal(report.linkedWorks.selected, 2);
    assert.equal(report.linkedWorks.unresolvedWorkKeys, 0);

    const editions = (await readFile(report.output.editionsPath, "utf8")).trim().split("\n").map(JSON.parse);
    const works = (await readFile(report.output.worksPath, "utf8")).trim().split("\n").map(JSON.parse);
    assert.deepEqual(editions.map((record) => record.external_record_id), ["OL100M", "OL102M"]);
    assert.deepEqual(editions[0].work_keys, ["OL10W"]);
    assert.deepEqual(editions[0].isbn_identifiers.map((item) => item.normalizedValue), ["0306406152", "9780306406157"]);
    assert.deepEqual(works.map((record) => record.external_record_id), ["OL10W", "OL12W"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
