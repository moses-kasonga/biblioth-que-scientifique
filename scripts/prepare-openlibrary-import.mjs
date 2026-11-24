#!/usr/bin/env node
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { once } from "node:events";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ID_PATTERNS = {
  edition: /^OL\d+M$/,
  work: /^OL\d+W$/,
  author: /^OL\d+A$/,
};

function parseArgs(argv) {
  const args = { inputDir: "./openlibrary-dump-scan", outDir: "./openlibrary-import-package", maxEditions: 100000, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input-dir") args.inputDir = argv[++i] ?? "";
    else if (arg === "--out-dir") args.outDir = argv[++i] ?? "";
    else if (arg === "--max-editions") args.maxEditions = Number(argv[++i]);
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error("Argument inconnu : " + arg);
  }
  if (args.help) return args;
  if (!args.inputDir || !args.outDir) throw new Error("--input-dir et --out-dir doivent être renseignés.");
  if (!Number.isInteger(args.maxEditions) || args.maxEditions < 1 || args.maxEditions > 1000000) {
    throw new Error("--max-editions doit être compris entre 1 et 1 000 000.");
  }
  return args;
}

async function* readJsonl(path, kind, stats) {
  const input = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    stats.lines += 1;
    let record;
    try { record = JSON.parse(line); }
    catch { stats.malformed += 1; continue; }
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      stats.malformed += 1;
      continue;
    }
    if (record.record_type !== kind || !ID_PATTERNS[kind].test(String(record.external_record_id ?? ""))) {
      stats.invalid += 1;
      continue;
    }
    yield record;
  }
}

function recordFingerprint(record) {
  return JSON.stringify(record);
}

function addUniqueRecord(map, conflicts, record, stats) {
  const id = record.external_record_id;
  const existing = map.get(id);
  if (!existing) {
    map.set(id, { record, fingerprint: recordFingerprint(record) });
    return;
  }
  stats.duplicateIds += 1;
  if (existing.fingerprint !== recordFingerprint(record)) {
    conflicts.add(id);
    stats.conflictingIds += 1;
  }
}

function addReason(reasons, reason) {
  if (!reasons.includes(reason)) reasons.push(reason);
}

async function writeJsonlAtomic(path, records) {
  const temporaryPath = path + ".tmp";
  const output = createWriteStream(temporaryPath, { encoding: "utf8", flags: "w" });
  try {
    for await (const record of records) {
      if (!output.write(JSON.stringify(record) + "\n")) await once(output, "drain");
    }
    output.end();
    await once(output, "finish");
    await rename(temporaryPath, path);
  } catch (error) {
    output.destroy();
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function prepareOpenLibraryImport({ inputDir, outDir, maxEditions = 100000 }) {
  if (!Number.isInteger(maxEditions) || maxEditions < 1 || maxEditions > 1000000) {
    throw new Error("maxEditions doit être compris entre 1 et 1 000 000.");
  }
  const input = resolve(inputDir);
  const output = resolve(outDir);
  const inputPaths = {
    editions: resolve(input, "openlibrary-editions.jsonl"),
    works: resolve(input, "openlibrary-works.jsonl"),
    authors: resolve(input, "openlibrary-authors.jsonl"),
  };
  const outputPaths = {
    editions: resolve(output, "editions-prepared.jsonl"),
    works: resolve(output, "works-prepared.jsonl"),
    authors: resolve(output, "authors-prepared.jsonl"),
    relationships: resolve(output, "relationships-prepared.jsonl"),
    manifest: resolve(output, "manifest.json"),
  };
  await mkdir(output, { recursive: true });

  const stats = {
    editionsInput: { lines: 0, malformed: 0, invalid: 0, duplicateIds: 0, conflictingIds: 0, selected: 0 },
    worksInput: { lines: 0, malformed: 0, invalid: 0, duplicateIds: 0, conflictingIds: 0, selected: 0 },
    authorsInput: { lines: 0, malformed: 0, invalid: 0, duplicateIds: 0, conflictingIds: 0, selected: 0 },
    duplicateIsbnValues: 0,
    editionsReviewRequired: 0,
    worksReviewRequired: 0,
    authorsReviewRequired: 0,
    unresolvedEditionWorkLinks: 0,
    unresolvedWorkAuthorLinks: 0,
  };

  const editions = new Map();
  const works = new Map();
  const authors = new Map();
  const editionConflicts = new Set();
  const workConflicts = new Set();
  const authorConflicts = new Set();
  const wantedWorkIds = new Set();
  const wantedAuthorIds = new Set();

  for await (const record of readJsonl(inputPaths.editions, "edition", stats.editionsInput)) {
    if (editions.size >= maxEditions && !editions.has(record.external_record_id)) break;
    addUniqueRecord(editions, editionConflicts, record, stats.editionsInput);
  }
  stats.editionsInput.selected = editions.size;
  for (const { record } of editions.values()) {
    for (const id of Array.isArray(record.work_keys) ? record.work_keys : []) {
      if (ID_PATTERNS.work.test(String(id))) wantedWorkIds.add(id);
    }
  }

  for await (const record of readJsonl(inputPaths.works, "work", stats.worksInput)) {
    if (!wantedWorkIds.has(record.external_record_id)) continue;
    addUniqueRecord(works, workConflicts, record, stats.worksInput);
  }
  stats.worksInput.selected = works.size;
  for (const { record } of works.values()) {
    for (const id of Array.isArray(record.author_keys) ? record.author_keys : []) {
      if (ID_PATTERNS.author.test(String(id))) wantedAuthorIds.add(id);
    }
  }

  for await (const record of readJsonl(inputPaths.authors, "author", stats.authorsInput)) {
    if (!wantedAuthorIds.has(record.external_record_id)) continue;
    addUniqueRecord(authors, authorConflicts, record, stats.authorsInput);
  }
  stats.authorsInput.selected = authors.size;

  const isbnOwners = new Map();
  for (const [editionId, entry] of editions) {
    if (editionConflicts.has(editionId)) continue;
    const identifiers = Array.isArray(entry.record.isbn_identifiers) ? entry.record.isbn_identifiers : [];
    for (const identifier of identifiers) {
      const value = String(identifier.normalizedValue ?? "").trim();
      if (!value) continue;
      if (!isbnOwners.has(value)) isbnOwners.set(value, new Set());
      isbnOwners.get(value).add(editionId);
    }
  }
  const duplicateIsbnEditions = new Set();
  for (const owners of isbnOwners.values()) {
    if (owners.size < 2) continue;
    stats.duplicateIsbnValues += 1;
    for (const editionId of owners) duplicateIsbnEditions.add(editionId);
  }

  let relationshipCount = 0;
  await rm(outputPaths.manifest, { force: true });

  async function* preparedEditions() {
    for (const [editionId, entry] of editions) {
      const record = entry.record;
      const reasons = [];
      if (editionConflicts.has(editionId)) addReason(reasons, "duplicate_source_record_id_conflicting_payloads");
      if (!record.title?.trim()) addReason(reasons, "missing_edition_title");
      if (!Number.isInteger(record.publication_year)) addReason(reasons, "missing_or_unparsed_publication_year");
      if (!record.source_record_version || record.source_record_version === "unknown") addReason(reasons, "unknown_source_record_version");
      if (duplicateIsbnEditions.has(editionId)) addReason(reasons, "isbn_shared_by_multiple_editions");
      const workIds = [...new Set((Array.isArray(record.work_keys) ? record.work_keys : []).filter((id) => ID_PATTERNS.work.test(String(id))))];
      if (!workIds.length) addReason(reasons, "edition_has_no_work_link");
      if (workIds.some((workId) => !works.has(workId) || workConflicts.has(workId))) addReason(reasons, "unresolved_or_conflicting_work_reference");
      if (reasons.length) stats.editionsReviewRequired += 1;
      yield { source_record: record, work_external_ids: workIds, review_required: reasons.length > 0, review_reasons: reasons };
    }
  }

  async function* preparedWorks() {
    for (const [workId, entry] of works) {
      const record = entry.record;
      const reasons = [];
      if (workConflicts.has(workId)) addReason(reasons, "duplicate_source_record_id_conflicting_payloads");
      if (!record.title?.trim()) addReason(reasons, "missing_work_title");
      if (!record.source_record_version || record.source_record_version === "unknown") addReason(reasons, "unknown_source_record_version");
      const authorIds = [...new Set((Array.isArray(record.author_keys) ? record.author_keys : []).filter((id) => ID_PATTERNS.author.test(String(id))))];
      if (!authorIds.length) addReason(reasons, "work_has_no_author_link");
      if (authorIds.some((authorId) => !authors.has(authorId) || authorConflicts.has(authorId))) addReason(reasons, "unresolved_or_conflicting_author_reference");
      if (reasons.length) stats.worksReviewRequired += 1;
      yield { source_record: record, author_external_ids: authorIds, review_required: reasons.length > 0, review_reasons: reasons };
    }
  }

  async function* preparedAuthors() {
    for (const [authorId, entry] of authors) {
      const record = entry.record;
      const reasons = [];
      if (authorConflicts.has(authorId)) addReason(reasons, "duplicate_source_record_id_conflicting_payloads");
      if (!record.preferred_name?.trim()) addReason(reasons, "missing_author_preferred_name");
      if (!record.source_record_version || record.source_record_version === "unknown") addReason(reasons, "unknown_source_record_version");
      if (reasons.length) stats.authorsReviewRequired += 1;
      yield { source_record: record, review_required: reasons.length > 0, review_reasons: reasons };
    }
  }

  async function* preparedRelationships() {
    for (const [editionId, entry] of editions) {
      const workIds = [...new Set((Array.isArray(entry.record.work_keys) ? entry.record.work_keys : []).filter((id) => ID_PATTERNS.work.test(String(id))))];
      for (const workId of workIds) {
        const resolved = works.has(workId) && !workConflicts.has(workId);
        if (!resolved) stats.unresolvedEditionWorkLinks += 1;
        relationshipCount += 1;
        yield {
          from_type: "edition", from_id: editionId, to_type: "work", to_id: workId,
          relation: "edition_works", content_role: "main", match_method: "exact",
          resolved, review_required: !resolved,
        };
      }
    }
    for (const [workId, entry] of works) {
      const authorIds = [...new Set((Array.isArray(entry.record.author_keys) ? entry.record.author_keys : []).filter((id) => ID_PATTERNS.author.test(String(id))))];
      for (const authorId of authorIds) {
        const resolved = authors.has(authorId) && !authorConflicts.has(authorId);
        if (!resolved) stats.unresolvedWorkAuthorLinks += 1;
        relationshipCount += 1;
        yield {
          from_type: "work", from_id: workId, to_type: "agent", to_id: authorId,
          relation: "work_agents", role_code: "author", match_method: "exact",
          resolved, review_required: !resolved,
        };
      }
    }
  }

  await writeJsonlAtomic(outputPaths.editions, preparedEditions());
  await writeJsonlAtomic(outputPaths.works, preparedWorks());
  await writeJsonlAtomic(outputPaths.authors, preparedAuthors());
  await writeJsonlAtomic(outputPaths.relationships, preparedRelationships());

  const manifest = {
    format: "nexus-openlibrary-import-package",
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    executionMode: "preparation-only; no database connection and no catalogue writes",
    source: "openlibrary",
    limits: { maxEditions },
    counts: { editions: editions.size, works: works.size, authors: authors.size, relationships: relationshipCount },
    quality: stats,
    outputs: {},
    safety: {
      canonicalEntitiesCreated: false,
      sourceRecordsWritten: false,
      identifiersInserted: false,
      automaticMerges: false,
      duplicateIdentifiersRequireReview: true,
    },
    nextStep: "Review mapping and quality results, then implement a separately gated transactional importer for the development branch.",
  };
  for (const [name, path] of Object.entries({
    editions: outputPaths.editions, works: outputPaths.works,
    authors: outputPaths.authors, relationships: outputPaths.relationships,
  })) {
    manifest.outputs[name] = { file: path.split(/[\\/]/).pop(), sha256: await sha256File(path) };
  }
  const manifestTmp = outputPaths.manifest + ".tmp";
  await writeFile(manifestTmp, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await rename(manifestTmp, outputPaths.manifest);
  return { manifest, outputPaths };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      "Prepare a reviewable Open Library import package\n\n" +
      "node scripts/prepare-openlibrary-import.mjs --input-dir ./openlibrary-dump-scan --out-dir ./openlibrary-import-package --max-editions 100000\n\n" +
      "Reads scanner JSONL outputs, resolves Work/Edition/Author relationships and flags conflicts. No database access.\n"
    );
    return;
  }
  const { manifest, outputPaths } = await prepareOpenLibraryImport(args);
  process.stdout.write(JSON.stringify({
    manifest: outputPaths.manifest, counts: manifest.counts,
    quality: manifest.quality, mode: manifest.executionMode,
  }, null, 2) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  });
}
