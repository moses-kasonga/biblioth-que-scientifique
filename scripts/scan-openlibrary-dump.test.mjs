import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
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
    const authorsPath = join(dir, "authors.txt.gz");
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
    const undatedScientificEdition = row("/type/edition", "/books/OL103M", 1, "2026-11-03T00:00:00.000000", {
      title: "Introduction to quantum physics",
      publishers: ["Research Press"],
      works: [{ key: "/works/OL13W" }],
    });
    await writeFile(editionsPath, gzipSync([scientificEdition, nonScientificEdition, historicalEdition, undatedScientificEdition].join("\n") + "\n"));

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
    const work13 = row("/type/work", "/works/OL13W", 1, "2026-11-03T00:00:00.000000", {
      title: "Introduction to quantum physics",
      authors: [],
    });
    const unrelatedWork = row("/type/work", "/works/OL99W", 1, "2026-11-03T00:00:00.000000", {
      title: "Unrelated work",
      subjects: ["Poetry"],
    });
    await writeFile(worksPath, gzipSync([work10, work12, work13, unrelatedWork].join("\n") + "\n"));
    const author1 = row("/type/author", "/authors/OL1A", 5, "2026-11-04T00:00:00.000000", {
      name: "Ada Author",
      alternate_names: ["A. Author"],
      birth_date: "1970",
      remote_ids: { viaf: "12345" },
    });
    const unrelatedAuthor = row("/type/author", "/authors/OL99A", 1, "2026-11-04T00:00:00.000000", {
      name: "Unrelated Person",
    });
    await writeFile(authorsPath, gzipSync([author1, unrelatedAuthor].join("\n") + "\n"));

    const report = await scanOpenLibraryDumps({
      editions: editionsPath,
      works: worksPath,
      authors: authorsPath,
      fromYear: 1720,
      toYear: 2026,
      maxEditions: 100,
      skipMatching: 0,
      outDir: join(dir, "out"),
    });

    assert.equal(report.editions.scanned, 4);
    assert.equal(report.editions.selected, 3);
    assert.equal(report.editions.nonScientific, 1);
    assert.equal(report.editions.reviewMissingYear, 1);
    assert.equal(report.editions.missingYear, 1);
    assert.equal(report.editions.validIsbnValues, 3);
    assert.equal(report.linkedWorks.selected, 3);
    assert.equal(report.linkedWorks.unresolvedWorkKeys, 0);
    assert.equal(report.linkedAuthors.selected, 1);
    assert.equal(report.linkedAuthors.unresolvedAuthorKeys, 0);

    const editions = (await readFile(report.output.editionsPath, "utf8")).trim().split("\n").map(JSON.parse);
    const works = (await readFile(report.output.worksPath, "utf8")).trim().split("\n").map(JSON.parse);
    const authors = (await readFile(report.output.authorsPath, "utf8")).trim().split("\n").map(JSON.parse);
    assert.deepEqual(editions.map((record) => record.external_record_id), ["OL100M", "OL102M", "OL103M"]);
    assert.deepEqual(editions[0].work_keys, ["OL10W"]);
    assert.deepEqual(editions[0].isbn_identifiers.map((item) => item.normalizedValue), ["0306406152", "9780306406157"]);
    assert.deepEqual(works.map((record) => record.external_record_id), ["OL10W", "OL12W", "OL13W"]);
    assert.deepEqual(works[0].author_keys, ["OL1A"]);
    assert.deepEqual(authors.map((record) => record.external_record_id), ["OL1A"]);
    assert.equal(authors[0].preferred_name, "Ada Author");
    assert.deepEqual(authors[0].alternate_names, ["A. Author"]);

    // Simulate an interrupted run that left durable partial JSONL outputs.
    const inputFingerprints = {};
    for (const [label, path] of Object.entries({ editions: editionsPath, works: worksPath, authors: authorsPath })) {
      const info = await stat(path);
      inputFingerprints[label] = { path, size: info.size, mtimeMs: info.mtimeMs };
    }
    await writeFile(join(dir, "out", "openlibrary-dump-scan-resume.json"), JSON.stringify({
      inputFingerprints, fromYear: 1720, toYear: 2026, maxEditions: 100, skipMatching: 0,
    }));
    await writeFile(report.output.editionsPath + ".partial", await readFile(report.output.editionsPath));
    await writeFile(report.output.worksPath + ".partial", await readFile(report.output.worksPath));
    await writeFile(report.output.authorsPath + ".partial", await readFile(report.output.authorsPath));
    const resumed = await scanOpenLibraryDumps({
      editions: editionsPath,
      works: worksPath,
      authors: authorsPath,
      fromYear: 1720,
      toYear: 2026,
      maxEditions: 100,
      skipMatching: 0,
      outDir: join(dir, "out"),
    });
    assert.equal(resumed.editions.selected, 3);
    assert.equal(resumed.editions.resumed, 3);
    assert.equal(resumed.linkedWorks.selected, 3);
    assert.equal(resumed.linkedWorks.unresolvedWorkKeys, 0);
    assert.equal(resumed.linkedAuthors.selected, 1);
    assert.equal(resumed.linkedAuthors.unresolvedAuthorKeys, 0);
    const resumedEditions = (await readFile(resumed.output.editionsPath, "utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(new Set(resumedEditions.map((record) => record.external_record_id)).size, 3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
