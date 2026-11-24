#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { normalizeDoabPayload } from "./doab-import-core.mjs";

function parseArgs(argv) {
  const args = { query: "", output: "./doab-batch.json", help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--query") args.query = argv[++i] ?? "";
    else if (arg === "--output") args.output = argv[++i] ?? args.output;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error("Argument inconnu : " + arg);
  }
  if (!args.help && !args.query.trim()) {
    throw new Error("--query est obligatoire, par exemple --query 'mathematics AND physics'.");
  }
  if (args.query.length > 500) throw new Error("La requête DOAB est limitée à 500 caractères.");
  return args;
}

function printHelp() {
  process.stdout.write(
    "Récupération ciblée de métadonnées DOAB (JSON uniquement)\n\n" +
    "node scripts/fetch-doab-json.mjs --query 'mathematics AND physics' --output ./doab-batch.json\n\n" +
    "Une seule requête ciblée est envoyée. Aucun fichier PDF/EPUB n'est téléchargé.\n"
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();

  const endpoint = new URL("https://directory.doabooks.org/rest/search");
  endpoint.searchParams.set("query", args.query.trim());

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "BibliothequeScientifique-Nexus/0.1",
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error("DOAB a répondu HTTP " + response.status + " " + response.statusText + ".");
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("json")) {
    throw new Error("DOAB n'a pas renvoyé de JSON (Content-Type: " + contentType + ").");
  }

  const payload = await response.json();
  const records = normalizeDoabPayload(payload);
  if (records.length === 0) {
    throw new Error("La requête DOAB n'a renvoyé aucune notice exploitable.");
  }

  await writeFile(args.output, JSON.stringify(payload, null, 2) + "\n", "utf8");
  const incomplete = records.filter((record) => record.issues.length > 0).length;
  process.stdout.write(JSON.stringify({
    source: "doab",
    output: args.output,
    recordsFetched: records.length,
    recordsWithReviewIssues: incomplete,
    query: args.query.trim(),
    contentType,
  }, null, 2) + "\n");
  process.stdout.write("Aucune donnée n'a été importée dans Neon. Lancez ensuite le dry-run de l'importateur.\n");
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 1;
});
