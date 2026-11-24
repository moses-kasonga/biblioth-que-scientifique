#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { normalizeOpenAlexPayload } from "./openalex-import-core.mjs";
import { normalizeHalPayload } from "./hal-import-core.mjs";
import { normalizeOpenLibraryPayload } from "./openlibrary-import-core.mjs";

const execFile = promisify(execFileCallback);
const periods = [
  { label: "1720-1899", fromYear: 1720, toYear: 1899 },
  { label: "1900-1949", fromYear: 1900, toYear: 1949 },
  { label: "1950-1999", fromYear: 1950, toYear: 1999 },
  { label: "2000-2026", fromYear: 2000, toYear: 2026 },
];

function parseArgs(argv) {
  const args = { limit: 25, outDir: "./historical-pilot", help: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--limit") args.limit = Number(argv[++i]);
    else if (argv[i] === "--out-dir") args.outDir = argv[++i] ?? args.outDir;
    else if (argv[i] === "--help" || argv[i] === "-h") args.help = true;
    else throw new Error("Argument inconnu : " + argv[i]);
  }
  if (!Number.isInteger(args.limit) || args.limit < 5 || args.limit > 100) throw new Error("--limit doit être compris entre 5 et 100.");
  return args;
}

async function run(script, args) {
  return execFile(process.execPath, [script, ...args], {
    timeout: 120_000,
    maxBuffer: 12 * 1024 * 1024,
    env: process.env,
  });
}

function summarize(records) {
  const languages = {};
  const issues = {};
  const years = [];
  const ids = records.map((r) => r.externalRecordId).filter(Boolean);
  const isbnValues = new Set();
  const doiValues = new Set();

  for (const record of records) {
    const language = record.language || "unknown";
    languages[language] = (languages[language] || 0) + 1;
    if (Number.isInteger(record.publicationYear)) years.push(record.publicationYear);
    for (const issue of record.issues || []) issues[issue] = (issues[issue] || 0) + 1;
    for (const isbn of record.isbns || []) isbnValues.add(isbn);
    for (const doi of record.dois || []) doiValues.add(doi);
  }

  return {
    selected: records.length,
    uniqueSourceIds: new Set(ids).size,
    duplicateSourceIds: ids.length - new Set(ids).size,
    publicationYearRange: years.length ? { min: Math.min(...years), max: Math.max(...years) } : null,
    languages,
    recordsWithoutTitle: records.filter((r) => !r.title).length,
    recordsWithoutContributor: records.filter((r) => !(r.authors?.length) && !(r.editors?.length)).length,
    recordsWithReviewIssues: records.filter((r) => (r.issues || []).length > 0).length,
    issueCounts: issues,
    recordsWithISBN: records.filter((r) => (r.isbns || []).length > 0).length,
    recordsWithDOI: records.filter((r) => (r.dois || []).length > 0).length,
    uniqueISBNValues: isbnValues.size,
    uniqueDOIValues: doiValues.size,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write("12 petits lots de couverture historique, 1720–2026 ; aucun accès à Neon.\\n");
    return;
  }
  await mkdir(args.outDir, { recursive: true });

  const config = {
    openalex: { fetcher: "scripts/fetch-openalex.mjs", normalize: normalizeOpenAlexPayload },
    hal: { fetcher: "scripts/fetch-hal.mjs", normalize: normalizeHalPayload },
    openlibrary: { fetcher: "scripts/fetch-openlibrary.mjs", normalize: normalizeOpenLibraryPayload },
  };
  const results = [];

  for (const period of periods) {
    for (const source of ["openalex", "hal", "openlibrary"]) {
      const file = args.outDir + "/" + source + "-" + period.label + ".json";
      const baseArgs = [
        "--limit", String(args.limit),
        "--from-year", String(period.fromYear),
        "--to-year", String(period.toYear),
        "--output", file,
      ];
      const fetchArgs = source === "openlibrary"
        ? [...baseArgs, "--query", "subject:science"]
        : baseArgs;

      // Respect Open Library's low-volume public Search API guidance.
      if (source === "openlibrary") await new Promise((resolve) => setTimeout(resolve, 1100));
      await run(config[source].fetcher, fetchArgs);

      const payload = JSON.parse(await readFile(file, "utf8"));
      const records = config[source].normalize(payload);
      const dryRun = await run("scripts/import-doab.mjs", [
        "--source", source,
        "--input", file,
        "--max-records", String(args.limit),
        "--dry-run",
      ]);
      const dryRunLog = args.outDir + "/" + source + "-" + period.label + "-dry-run.log";
      await writeFile(dryRunLog, dryRun.stdout + dryRun.stderr, "utf8");

      const matchingCount = source === "openalex"
        ? payload.meta?.count ?? null
        : source === "hal"
          ? payload.response?.numFound ?? null
          : payload.numFound ?? null;

      results.push({
        source,
        period,
        matchingCount,
        summary: summarize(records),
        rawBatch: file,
        dryRunLog,
      });
      process.stdout.write(JSON.stringify({
        source,
        period: period.label,
        matchingCount,
        selected: records.length,
        review: records.filter((r) => r.issues?.length).length,
      }) + "\\n");
    }
  }

  const isbnSets = {};
  const doiSets = {};
  for (const source of Object.keys(config)) {
    isbnSets[source] = new Set();
    doiSets[source] = new Set();
    for (const item of results.filter((r) => r.source === source)) {
      const payload = JSON.parse(await readFile(item.rawBatch, "utf8"));
      for (const record of config[source].normalize(payload)) {
        for (const isbn of record.isbns || []) isbnSets[source].add(isbn);
        for (const doi of record.dois || []) doiSets[source].add(doi);
      }
    }
  }

  const intersection = (a, b) => [...a].filter((value) => b.has(value)).sort();
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "dry-run-only; no database connection",
    recordsPerPeriodAndSource: args.limit,
    periods,
    results,
    crossSourceCandidateMatches: {
      openalex_hal_isbns: intersection(isbnSets.openalex, isbnSets.hal),
      openalex_hal_dois: intersection(doiSets.openalex, doiSets.hal),
      note: "Identifier intersections are candidate matches only; no auto-merge.",
    },
    openLibrary: {
      editionIdentifiersRemainUnresolved: true,
      bulkPolicy: "Use monthly data dumps for bulk; Search API is low-volume only.",
    },
  };
  const reportPath = args.outDir + "/historical-coverage-report.json";
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\\n", "utf8");
  process.stdout.write(JSON.stringify({
    report: reportPath,
    batches: results.length,
    totalRecords: results.reduce((sum, item) => sum + item.summary.selected, 0),
    mode: report.mode,
  }, null, 2) + "\\n");
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\\n");
  process.exitCode = 1;
});
