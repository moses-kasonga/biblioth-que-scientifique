#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { normalizeDoabPayload, normalizeLanguage } from "./doab-import-core.mjs";
import { readJsonArrayItems } from "./doab-json-feed-core.mjs";

const FEED_URL = "https://memo.doabooks.org/file/oapen/DOAB.json";
const DEFAULT_LANGUAGES = new Set(["fr", "en", "es", "pt"]);

function parseArgs(argv) {
  const args = { output: "./doab-batch.json", limit: 25, offset: 0, allLanguages: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--output") args.output = argv[++i] ?? args.output;
    else if (arg === "--limit") args.limit = Number(argv[++i]);
    else if (arg === "--offset") args.offset = Number(argv[++i]);
    else if (arg === "--all-languages") args.allLanguages = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error("Argument inconnu : " + arg);
  }
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 500) {
    throw new Error("--limit doit être compris entre 1 et 500.");
  }
  if (!Number.isInteger(args.offset) || args.offset < 0 || args.offset > 1_000_000) {
    throw new Error("--offset doit être compris entre 0 et 1000000.");
  }
  return args;
}

function printHelp() {
  process.stdout.write(
    "Collecte ciblée depuis le flux JSON officiel DOAB (métadonnées CC0)\n\n" +
    "node scripts/fetch-doab-json-feed.mjs --limit 25 --offset 0 --output ./doab-batch.json\n" +
    "node scripts/fetch-doab-json-feed.mjs --limit 25 --offset 1000 --output ./doab-batch-1000.json\n" +
    "node scripts/fetch-doab-json-feed.mjs --limit 25 --all-languages\n\n" +
    "Le collecteur lit le flux en continu et s'arrête après le nombre demandé. --offset permet de reprendre après un lot précédent.\n" +
    "Par défaut, il privilégie FR/EN/ES/PT et conserve les notices sans langue pour revue.\n" +
    "Aucun PDF, EPUB ou bitstream n'est téléchargé ; aucune donnée Neon n'est écrite.\n"
  );
}

function hasAcceptedLanguage(rawRecord, allLanguages) {
  if (allLanguages) return true;
  const values = rawRecord?.metadata?.language;
  const languages = Array.isArray(values) ? values : values == null ? [] : [values];
  if (languages.length === 0) return true;
  return languages.some((value) => DEFAULT_LANGUAGES.has(normalizeLanguage(value)));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();

  const response = await fetch(FEED_URL, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "BibliothequeScientifique-Nexus/0.1 (+https://github.com/moses-kasonga/biblioth-que-scientifique)",
    },
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
    throw new Error(
      "Le flux JSON DOAB a répondu HTTP " + response.status + " " + response.statusText +
      (detail ? " — " + detail : "") + "."
    );
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("json")) {
    throw new Error("Le flux DOAB n'a pas renvoyé de JSON (Content-Type: " + contentType + ").");
  }
  if (!response.body) throw new Error("Le flux DOAB ne fournit pas de corps de réponse lisible.");

  const selection = await readJsonArrayItems(response.body, {
    arrayKey: "publications",
    limit: args.limit,
    skip: args.offset,
    maxScanned: Math.min(2_000_000, Math.max(100_000, args.offset + args.limit * 100 + 1_000)),
    acceptRecord: (record) => hasAcceptedLanguage(record, args.allLanguages),
  });
  if (selection.skippedByOffset !== args.offset) {
    throw new Error(
      "Le flux s'est arrêté avant l'offset demandé : " + selection.skippedByOffset +
      " notices admissibles sautées sur " + args.offset + "."
    );
  }
  if (selection.records.length === 0) {
    throw new Error("Aucune notice DOAB admissible après l'offset demandé.");
  }

  const payload = { publications: selection.records };
  const normalized = normalizeDoabPayload(payload);
  const withReviewIssues = normalized.filter((record) => record.issues.length > 0).length;
  const withTitles = normalized.filter((record) => Boolean(record.title)).length;

  if (withTitles === 0) {
    throw new Error("Le flux DOAB ne contient aucun titre exploitable dans le lot sélectionné.");
  }

  await writeFile(args.output, JSON.stringify(payload, null, 2) + "\n", "utf8");
  process.stdout.write(JSON.stringify({
    source: "doab",
    feed: FEED_URL,
    output: args.output,
    recordsSelected: selection.records.length,
    startOffset: args.offset,
    recordsSkippedByOffset: selection.skippedByOffset,
    recordsScanned: selection.scanned,
    recordsSkippedByLanguage: selection.rejected,
    recordsWithTitles: withTitles,
    recordsWithReviewIssues: withReviewIssues,
    requestedLimit: args.limit,
    languagePolicy: args.allLanguages ? "all languages" : "fr,en,es,pt; missing-language records retained for review",
    licenceOfMetadata: "CC0",
    bitstreamsRequested: false,
  }, null, 2) + "\n");
  process.stdout.write("Collecte terminée : aucune écriture dans Neon. Lancez le dry-run de l'importateur.\n");
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 1;
});
