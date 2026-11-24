#!/usr/bin/env node
import { writeFile } from "node:fs/promises";

function parseArgs(argv) {
  const args = { limit: 50, fromYear: 1720, toYear: 2026, query: "*:*", language: "", cursor: "*", output: "./hal-batch.json", help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--limit") args.limit = Number(argv[++i]);
    else if (arg === "--from-year") args.fromYear = Number(argv[++i]);
    else if (arg === "--to-year") args.toYear = Number(argv[++i]);
    else if (arg === "--query") args.query = argv[++i] ?? "*:*";
    else if (arg === "--language") args.language = (argv[++i] ?? "").toLowerCase();
    else if (arg === "--cursor") args.cursor = argv[++i] ?? "*";
    else if (arg === "--output") args.output = argv[++i] ?? args.output;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error("Argument inconnu : " + arg);
  }
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 500) {
    throw new Error("--limit doit être compris entre 1 et 500 pour rester dans les tailles de page recommandées.");
  }
  if (!Number.isInteger(args.fromYear) || !Number.isInteger(args.toYear) ||
      args.fromYear < 1 || args.toYear > 2026 || args.fromYear > args.toYear) {
    throw new Error("La plage d'années doit être valide et ne pas dépasser 2026.");
  }
  if (!args.query.trim() || args.query.length > 500) throw new Error("--query doit contenir 1 à 500 caractères Solr.");
  if (args.language && !["fr", "en", "es", "pt"].includes(args.language)) {
    throw new Error("--language doit être fr, en, es ou pt.");
  }
  return args;
}

function help() {
  process.stdout.write(
    "Collecte HAL — métadonnées de livres (docType_s:OUV)\n\n" +
    "node scripts/fetch-hal.mjs --limit 50 --from-year 1720 --to-year 2026 --output ./hal-batch.json\n" +
    "node scripts/fetch-hal.mjs --query 'title_t:physique' --language fr --limit 100\n" +
    "node scripts/fetch-hal.mjs --cursor 'NEXT_CURSOR' --limit 500\n\n" +
    "Le curseur HAL est trié par docid asc. Aucun fichier intégral n'est demandé.\n"
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return help();

  const endpoint = new URL("https://api.archives-ouvertes.fr/search/");
  endpoint.searchParams.set("q", args.query.trim());
  endpoint.searchParams.set("fq", "docType_s:OUV");
  endpoint.searchParams.append("fq", "producedDateY_i:[" + args.fromYear + " TO " + args.toYear + "]");
  if (args.language) endpoint.searchParams.append("fq", "language_s:" + args.language);
  endpoint.searchParams.set("wt", "json");
  endpoint.searchParams.set("rows", String(args.limit));
  endpoint.searchParams.set("fl", "docid,halId_s,title_s,authFullName_s,editorFullName_s,editor_s,publisher_s,producedDateY_i,producedDate_s,publicationDate_s,language_s,keyword_s,domain_s,domainAllCode_s,doiId_s,isbn_s,licence_s,license_s,uri_s,modifiedDate_s,modifiedDateY_i,docType_s");
  endpoint.searchParams.set("sort", "docid asc");
  endpoint.searchParams.set("cursorMark", args.cursor);

  const response = await fetch(endpoint, {
    headers: { Accept: "application/json", "User-Agent": "BibliothequeScientifique-Nexus/0.1" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("HAL a répondu HTTP " + response.status + " " + response.statusText + ".");

  const payload = await response.json();
  if (!Array.isArray(payload?.response?.docs)) {
    throw new Error("Réponse HAL inattendue : response.docs absent.");
  }

  const output = {
    source: "hal",
    fetchedAt: new Date().toISOString(),
    request: {
      query: args.query.trim(),
      filters: ["docType_s:OUV", "producedDateY_i:[" + args.fromYear + " TO " + args.toYear + "]"],
      language: args.language || null,
      rows: args.limit,
      cursorMark: args.cursor,
    },
    response: payload.response,
    nextCursorMark: payload.nextCursorMark ?? null,
  };
  await writeFile(args.output, JSON.stringify(output, null, 2) + "\n", "utf8");
  process.stdout.write(JSON.stringify({
    source: "hal",
    output: args.output,
    selected: payload.response.docs.length,
    totalMatching: payload.response.numFound ?? null,
    nextCursorAvailable: Boolean(payload.nextCursorMark && payload.nextCursorMark !== args.cursor),
    documentType: "OUV",
    note: "Métadonnées uniquement ; aucun fichier HAL n'est demandé ou téléchargé.",
  }, null, 2) + "\n");
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 1;
});
