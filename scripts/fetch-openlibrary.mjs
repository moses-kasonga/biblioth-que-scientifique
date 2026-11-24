#!/usr/bin/env node
import { writeFile } from "node:fs/promises";

function parseArgs(argv) {
  const args = { limit: 25, fromYear: 1720, toYear: 2026, query: "subject:science", page: 1, output: "./openlibrary-batch.json", help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--limit") args.limit = Number(argv[++i]);
    else if (arg === "--from-year") args.fromYear = Number(argv[++i]);
    else if (arg === "--to-year") args.toYear = Number(argv[++i]);
    else if (arg === "--query") args.query = argv[++i] ?? args.query;
    else if (arg === "--page") args.page = Number(argv[++i]);
    else if (arg === "--output") args.output = argv[++i] ?? args.output;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error("Argument inconnu : " + arg);
  }
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 100) throw new Error("--limit doit être compris entre 1 et 100.");
  if (!Number.isInteger(args.page) || args.page < 1) throw new Error("--page doit être supérieur ou égal à 1.");
  if (!Number.isInteger(args.fromYear) || !Number.isInteger(args.toYear) || args.fromYear < 1 || args.toYear > 2026 || args.fromYear > args.toYear) throw new Error("La plage d'années doit être valide et ne pas dépasser 2026.");
  if (!args.query.trim() || args.query.length > 400) throw new Error("--query doit contenir 1 à 400 caractères.");
  return args;
}

function help() {
  process.stdout.write(
    "Open Library Search API — pilote à faible volume uniquement.\\n" +
    "Pour les imports massifs, utiliser les dumps mensuels officiels, pas l'API Search.\\n\\n" +
    "node scripts/fetch-openlibrary.mjs --query 'subject:science' --from-year 1720 --to-year 2026 --limit 25\\n"
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return help();

  const endpoint = new URL("https://openlibrary.org/search.json");
  endpoint.searchParams.set("q", "(" + args.query.trim() + ") AND first_publish_year:[" + args.fromYear + " TO " + args.toYear + "]");
  endpoint.searchParams.set("sort", "random");
  endpoint.searchParams.set("page", String(args.page));
  endpoint.searchParams.set("limit", String(args.limit));
  endpoint.searchParams.set("fields", "key,title,author_name,author_key,first_publish_year,edition_count,edition_key,isbn,publisher,language,subject");

  const headers = { Accept: "application/json", "User-Agent": "BibliothequeScientifiqueNexus/0.1" };
  if (process.env.OPENLIBRARY_CONTACT?.trim()) headers["User-Agent"] += " (contact: " + process.env.OPENLIBRARY_CONTACT.trim() + ")";

  const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error("Open Library a répondu HTTP " + response.status + " " + response.statusText + ".");
  const payload = await response.json();
  if (!Array.isArray(payload?.docs)) throw new Error("Réponse Open Library inattendue : docs absent.");

  const output = {
    source: "openlibrary",
    fetchedAt: new Date().toISOString(),
    request: {
      query: args.query.trim(),
      fromYear: args.fromYear,
      toYear: args.toYear,
      sort: "random",
      page: args.page,
      limit: args.limit,
      purpose: "low-volume discovery sample; not bulk harvesting",
    },
    numFound: payload.numFound ?? null,
    start: payload.start ?? null,
    docs: payload.docs,
  };
  await writeFile(args.output, JSON.stringify(output, null, 2) + "\n", "utf8");
  process.stdout.write(JSON.stringify({
    source: "openlibrary",
    output: args.output,
    selected: payload.docs.length,
    totalMatching: payload.numFound ?? null,
    note: "Échantillon de découverte limité ; utiliser les dumps officiels pour le bulk.",
  }, null, 2) + "\n");
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 1;
});
