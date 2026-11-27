#!/usr/bin/env node
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { once } from "node:events";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeIsbn, normalizeLanguage, parsePublicationYear } from "./doab-import-core.mjs";

const SCIENCE_SUBJECT = /(science|scientific|mathemat|math[eé]m|physic|physique|qu[ií]mic|chemistry|biolog|medicine|medical|m[eé]decine|ingenier|engineering|computer science|informatique|informatics|geolog|geoscience|astronom|statistics|statistique|social sciences|sciences sociales|economics|[eé]conomie)/i;

function parseArgs(argv) {
  const args = {
    editions: "",
    works: "",
    authors: "",
    fromYear: 1720,
    toYear: 2026,
    maxEditions: 100000,
    skipMatching: 0,
    outDir: "./openlibrary-dump-scan",
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--editions") args.editions = argv[++i] ?? "";
    else if (arg === "--works") args.works = argv[++i] ?? "";
    else if (arg === "--authors") args.authors = argv[++i] ?? "";
    else if (arg === "--from-year") args.fromYear = Number(argv[++i]);
    else if (arg === "--to-year") args.toYear = Number(argv[++i]);
    else if (arg === "--max-editions") args.maxEditions = Number(argv[++i]);
    else if (arg === "--skip-matching") args.skipMatching = Number(argv[++i]);
    else if (arg === "--out-dir") args.outDir = argv[++i] ?? args.outDir;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error("Argument inconnu : " + arg);
  }
  if (args.help) return args;
  if (!args.editions) throw new Error("--editions est obligatoire et doit pointer vers le dump officiel Editions.");
  if (!args.works) throw new Error("--works est obligatoire pour résoudre les relations Work/Edition.");
  if (!args.authors) throw new Error("--authors est obligatoire pour résoudre les auteurs des Works.");
  if (!Number.isInteger(args.fromYear) || !Number.isInteger(args.toYear) ||
      args.fromYear < 1 || args.toYear > 2026 || args.fromYear > args.toYear) {
    throw new Error("Plage d'années invalide : elle doit être comprise entre 1 et 2026.");
  }
  if (!Number.isInteger(args.maxEditions) || args.maxEditions < 1 || args.maxEditions > 1_000_000) {
    throw new Error("--max-editions doit être compris entre 1 et 1 000 000.");
  }
  if (!Number.isInteger(args.skipMatching) || args.skipMatching < 0) {
    throw new Error("--skip-matching doit être un entier positif ou nul.");
  }
  return args;
}

function splitDumpLine(line) {
  const fields = [];
  let start = 0;
  for (let i = 0; i < 4; i += 1) {
    const tab = line.indexOf("\t", start);
    if (tab < 0) return null;
    fields.push(line.slice(start, tab));
    start = tab + 1;
  }
  return {
    type: fields[0],
    key: fields[1],
    revision: fields[2],
    lastModified: fields[3],
    json: line.slice(start),
  };
}

function keyId(key, suffix) {
  const value = String(key ?? "").match(new RegExp("(OL[0-9]+" + suffix + ")$", "i"));
  return value ? value[1].toUpperCase() : null;
}

function authorKeysFromWork(raw) {
  const entries = Array.isArray(raw?.authors) ? raw.authors : [];
  return [...new Set(entries.map((item) =>
    keyId(item?.author?.key ?? item?.key ?? item, "A")
  ).filter(Boolean))];
}

function isScientific(record) {
  const subjects = Array.isArray(record?.subjects) ? record.subjects : [];
  const textFields = [
    record?.title,
    record?.subtitle,
    record?.description,
    ...(Array.isArray(record?.notes) ? record.notes : [record?.notes]),
    ...subjects,
    record?.lc_classifications,
    record?.dewey_decimal_class,
  ];
  const searchable = textFields.flat(Infinity).filter(Boolean).map(String);
  return searchable.some((value) => SCIENCE_SUBJECT.test(value));
}

function classifyEdition(record, year, fromYear, toYear) {
  if (year && (year < fromYear || year > toYear)) return "outside_year_window";
  if (!isScientific(record)) return "non_scientific";
  if (!year) return "review_missing_year";
  return "selected";
}

function normalizeEdition(row, raw) {
  const editionId = keyId(row.key, "M");
  const year = parsePublicationYear(raw.publish_date);
  const subjects = Array.isArray(raw.subjects) ? raw.subjects.map(String) : [];
  const workKeys = [...new Set(
    (Array.isArray(raw.works) ? raw.works : [])
      .map((item) => keyId(item?.key, "W"))
      .filter(Boolean)
  )];
  const languagesRaw = Array.isArray(raw.languages) ? raw.languages : [];
  const languages = [...new Set(
    languagesRaw
      .map((item) => normalizeLanguage(String(item?.key ?? "").split("/").pop()))
      .filter(Boolean)
  )];
  const isbnRaw = [
    ...(Array.isArray(raw.isbn_10) ? raw.isbn_10 : []),
    ...(Array.isArray(raw.isbn_13) ? raw.isbn_13 : []),
  ].map(String);
  const isbnIdentifiers = isbnRaw
    .map((sourceValue) => ({ sourceValue, normalizedValue: normalizeIsbn(sourceValue) }))
    .filter((item) => item.normalizedValue)
    .filter((item, index, all) =>
      all.findIndex((candidate) => candidate.normalizedValue === item.normalizedValue) === index
    );

  return {
    source_code: "openlibrary",
    record_type: "edition",
    external_record_id: editionId,
    source_record_version: row.revision || row.lastModified || "unknown",
    publication_year: year,
    title: String(raw.title ?? "").trim(),
    publisher_names: Array.isArray(raw.publishers) ? raw.publishers.map(String) : [],
    language_codes: languages,
    work_keys: workKeys,
    isbn_identifiers: isbnIdentifiers,
    subjects,
    raw_payload: raw,
  };
}

function normalizeWork(row, raw) {
  const workId = keyId(row.key, "W");
  return {
    source_code: "openlibrary",
    record_type: "work",
    external_record_id: workId,
    source_record_version: row.revision || row.lastModified || "unknown",
    title: String(raw.title ?? "").trim(),
    first_publish_year: parsePublicationYear(raw.first_publish_date),
    authors: Array.isArray(raw.authors) ? raw.authors : [],
    author_keys: authorKeysFromWork(raw),
    subjects: Array.isArray(raw.subjects) ? raw.subjects.map(String) : [],
    raw_payload: raw,
  };
}

async function* iterateDump(path) {
  const input = createReadStream(path);
  const stream = path.endsWith(".gz") ? input.pipe(createGunzip()) : input;
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of lines) yield line;
}

async function writeJsonLine(stream, record) {
  if (!stream.write(JSON.stringify(record) + "\n")) await once(stream, "drain");
}

export async function scanOpenLibraryDumps(options) {
  const { editions, works, authors, fromYear, toYear, maxEditions, skipMatching, outDir } = options;
  await mkdir(outDir, { recursive: true });
  const editionsPath = resolve(outDir, "openlibrary-editions.jsonl");
  const worksPath = resolve(outDir, "openlibrary-works.jsonl");
  const authorsPath = resolve(outDir, "openlibrary-authors.jsonl");
  const editionsTemp = editionsPath + ".partial";
  const worksTemp = worksPath + ".partial";
  const authorsTemp = authorsPath + ".partial";
  const editionStream = createWriteStream(editionsTemp, { flags: "w" });
  const workStream = createWriteStream(worksTemp, { flags: "w" });
  const authorStream = createWriteStream(authorsTemp, { flags: "w" });
  const selectedWorkIds = new Set();
  const selectedAuthorIds = new Set();
  const editionStats = {
    scanned: 0,
    selected: 0,
    skippedBeforeSample: 0,
    missingYear: 0,
    outsideYearWindow: 0,
    nonScientific: 0,
    reviewMissingYear: 0,
    malformed: 0,
    missingEditionKey: 0,
    withoutWorkLink: 0,
    isbnValues: 0,
    validIsbnValues: 0,
    languages: {},
  };

  try {
    for await (const line of iterateDump(editions)) {
      const row = splitDumpLine(line);
      if (!row || row.type !== "/type/edition") continue;
      editionStats.scanned += 1;
      let raw;
      try { raw = JSON.parse(row.json); }
      catch { editionStats.malformed += 1; continue; }

      const year = parsePublicationYear(raw.publish_date);
      const classification = classifyEdition(raw, year, fromYear, toYear);
      if (classification === "outside_year_window") { editionStats.outsideYearWindow += 1; continue; }
      if (classification === "non_scientific") { editionStats.nonScientific += 1; continue; }
      if (classification === "review_missing_year") editionStats.reviewMissingYear += 1;
      if (!year) editionStats.missingYear += 1;

      if (editionStats.skippedBeforeSample < skipMatching) {
        editionStats.skippedBeforeSample += 1;
        continue;
      }
      const normalized = normalizeEdition(row, raw);
      if (!normalized.external_record_id) { editionStats.missingEditionKey += 1; continue; }

      if (!normalized.work_keys.length) editionStats.withoutWorkLink += 1;
      for (const workId of normalized.work_keys) selectedWorkIds.add(workId);
      for (const language of normalized.language_codes) {
        editionStats.languages[language] = (editionStats.languages[language] || 0) + 1;
      }
      editionStats.isbnValues += normalized.isbn_identifiers.length;
      editionStats.validIsbnValues += normalized.isbn_identifiers.length;
      await writeJsonLine(editionStream, normalized);
      editionStats.selected += 1;
      if (editionStats.selected >= maxEditions) break;
    }
  } finally {
    editionStream.end();
    await once(editionStream, "finish");
  }

  const workStats = { scanned: 0, selected: 0, malformed: 0, missingTitle: 0 };
  try {
    if (selectedWorkIds.size) {
      for await (const line of iterateDump(works)) {
        const row = splitDumpLine(line);
        if (!row || row.type !== "/type/work") continue;
        const id = keyId(row.key, "W");
        if (!id || !selectedWorkIds.has(id)) continue;
        workStats.scanned += 1;
        let raw;
        try { raw = JSON.parse(row.json); }
        catch { workStats.malformed += 1; continue; }
        const normalized = normalizeWork(row, raw);
        if (!normalized.title) workStats.missingTitle += 1;
        for (const authorId of normalized.author_keys) selectedAuthorIds.add(authorId);
        await writeJsonLine(workStream, normalized);
        selectedWorkIds.delete(id);
        workStats.selected += 1;
        if (!selectedWorkIds.size) break;
      }
    }
  } finally {
    workStream.end();
    await once(workStream, "finish");
  }

  const authorStats = { scanned: 0, selected: 0, malformed: 0, missingName: 0 };
  try {
    if (selectedAuthorIds.size) {
      for await (const line of iterateDump(authors)) {
        const row = splitDumpLine(line);
        if (!row || row.type !== "/type/author") continue;
        const id = keyId(row.key, "A");
        if (!id || !selectedAuthorIds.has(id)) continue;
        authorStats.scanned += 1;
        let raw;
        try { raw = JSON.parse(row.json); }
        catch { authorStats.malformed += 1; continue; }
        const authorRecord = {
          source_code: "openlibrary",
          record_type: "author",
          external_record_id: id,
          source_record_version: row.revision || row.lastModified || "unknown",
          preferred_name: String(raw.name ?? "").trim(),
          alternate_names: Array.isArray(raw.alternate_names) ? raw.alternate_names.map(String) : [],
          birth_date: String(raw.birth_date ?? "").trim() || null,
          death_date: String(raw.death_date ?? "").trim() || null,
          entity_type: String(raw.entity_type ?? "").trim() || null,
          remote_ids: raw.remote_ids && typeof raw.remote_ids === "object" ? raw.remote_ids : {},
          raw_payload: raw,
        };
        if (!authorRecord.preferred_name) authorStats.missingName += 1;
        await writeJsonLine(authorStream, authorRecord);
        selectedAuthorIds.delete(id);
        authorStats.selected += 1;
        if (!selectedAuthorIds.size) break;
      }
    }
  } finally {
    authorStream.end();
    await once(authorStream, "finish");
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "streaming extraction only; no Neon connection or write",
    source: "openlibrary",
    input: {
      editions: isAbsolute(editions) ? editions : resolve(editions),
      works: isAbsolute(works) ? works : resolve(works),
      authors: isAbsolute(authors) ? authors : resolve(authors),
    },
    selection: {
      fromYear,
      toYear,
      maxEditions,
      skipMatching,
      selectionRule: "title, subtitle, description, notes, subjects and classification fields are searched; missing publication years are retained for review, not asserted to be in-range",
    },
    editions: editionStats,
    linkedWorks: {
      ...workStats,
      referencedBySelectedEditions: workStats.selected + selectedWorkIds.size,
      unresolvedWorkKeys: selectedWorkIds.size,
    },
    linkedAuthors: {
      ...authorStats,
      referencedBySelectedWorks: authorStats.selected + selectedAuthorIds.size,
      unresolvedAuthorKeys: selectedAuthorIds.size,
    },
    output: { editionsPath, worksPath, authorsPath },
    note: "JSONL keeps Edition, Work and Author records separate and preserves each original payload. No catalogue entities are created.",
  };
  const reportPath = resolve(outDir, "openlibrary-dump-scan-report.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      "Streaming Open Library data dump scanner\\n\\n" +
      "node scripts/scan-openlibrary-dump.mjs --editions ol_dump_editions_latest.txt.gz --works ol_dump_works_latest.txt.gz --authors ol_dump_authors_latest.txt.gz --from-year 1720 --to-year 2026 --max-editions 100000\\n\\n" +
      "No database connection. Emits separate Edition, Work and Author JSONL batches.\\n"
    );
    return;
  }
  const report = await scanOpenLibraryDumps(args);
  process.stdout.write(JSON.stringify({
    report: resolve(args.outDir, "openlibrary-dump-scan-report.json"),
    selectedEditions: report.editions.selected,
    linkedWorks: report.linkedWorks.selected,
    unresolvedWorkKeys: report.linkedWorks.unresolvedWorkKeys,
    linkedAuthors: report.linkedAuthors.selected,
    unresolvedAuthorKeys: report.linkedAuthors.unresolvedAuthorKeys,
    mode: report.mode,
  }, null, 2) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  });
}
