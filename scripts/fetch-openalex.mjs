#!/usr/bin/env node
import { writeFile } from "node:fs/promises";

function parseArgs(argv) {
  const args = { limit: 25, fromYear: 1720, toYear: 2026, search: "", cursor: "*", output: "./openalex-batch.json", openAccessOnly: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--limit") args.limit = Number(argv[++i]);
    else if (arg === "--from-year") args.fromYear = Number(argv[++i]);
    else if (arg === "--to-year") args.toYear = Number(argv[++i]);
    else if (arg === "--search") args.search = argv[++i] ?? "";
    else if (arg === "--cursor") args.cursor = argv[++i] ?? "*";
    else if (arg === "--output") args.output = argv[++i] ?? args.output;
    else if (arg === "--open-access-only") args.openAccessOnly = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error("Argument inconnu : " + arg);
  }
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 100) {
    throw new Error("--limit doit être compris entre 1 et 100 (maximum officiel per_page).");
  }
  if (!Number.isInteger(args.fromYear) || !Number.isInteger(args.toYear) ||
      args.fromYear < 1 || args.toYear > 2026 || args.fromYear > args.toYear) {
    throw new Error("La plage d'années doit être valide et ne pas dépasser 2026.");
  }
  if (args.search.length > 300) throw new Error("--search est limité à 300 caractères.");
  if (args.cursor !== "*" && !process.env.OPENALEX_API_KEY) {
    throw new Error("OPENALEX_API_KEY est requis pour reprendre une pagination cursor après la première page.");
  }
  return args;
}

function help() {
  process.stdout.write(
    "Collecte OpenAlex — métadonnées des livres (aucun fichier intégral)\n\n" +
    "node scripts/fetch-openalex.mjs --limit 25 --from-year 1720 --to-year 2026 --output ./openalex-batch.json\n" +
    "OPENALEX_API_KEY='...' node scripts/fetch-openalex.mjs --cursor 'NEXT_CURSOR' --limit 100\n\n" +
    "Le filtre type:book est appliqué. L'accès ouvert n'est pas exigé par défaut.\n"
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return help();

  const endpoint = new URL("https://api.openalex.org/works");
  let filter = "type:book,publication_year:" + args.fromYear + "-" + args.toYear;
  if (args.openAccessOnly) filter += ",open_access.is_oa:true";
  endpoint.searchParams.set("filter", filter);
  endpoint.searchParams.set("per_page", String(args.limit));
  endpoint.searchParams.set("cursor", args.cursor);
  endpoint.searchParams.set("select", "id,ids,doi,title,display_name,type,publication_year,publication_date,language,authorships,keywords,topics,primary_topic,updated_date,open_access");
  if (args.search.trim()) endpoint.searchParams.set("search", args.search.trim());
  if (process.env.OPENALEX_MAILTO?.trim()) endpoint.searchParams.set("mailto", process.env.OPENALEX_MAILTO.trim());

  const headers = { Accept: "application/json", "User-Agent": "BibliothequeScientifique-Nexus/0.1" };
  if (process.env.OPENALEX_API_KEY) headers.Authorization = "Bearer " + process.env.OPENALEX_API_KEY;
  const response = await fetch(endpoint, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("OpenAlex a répondu HTTP " + response.status + " " + response.statusText + ".");

  const payload = await response.json();
  if (!Array.isArray(payload?.results) || !payload?.meta) {
    throw new Error("Réponse OpenAlex inattendue : meta/results absents.");
  }

  const output = {
    source: "openalex",
    fetchedAt: new Date().toISOString(),
    request: { filter, search: args.search.trim() || null, perPage: args.limit, cursor: args.cursor },
    meta: payload.meta,
    results: payload.results,
  };
  await writeFile(args.output, JSON.stringify(output, null, 2) + "\n", "utf8");
  process.stdout.write(JSON.stringify({
    source: "openalex",
    output: args.output,
    selected: payload.results.length,
    totalMatching: payload.meta.count ?? null,
    nextCursorAvailable: Boolean(payload.meta.next_cursor),
    openAccessOnly: args.openAccessOnly,
    note: "Métadonnées uniquement ; aucun fichier PDF/EPUB n'est demandé ou téléchargé.",
  }, null, 2) + "\n");
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 1;
});
