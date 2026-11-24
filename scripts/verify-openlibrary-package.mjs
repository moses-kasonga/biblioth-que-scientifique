#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { resolve, basename } from "node:path";
import { pathToFileURL } from "node:url";

const FILES = ["editions", "works", "authors", "relationships"];
const TYPES = { editions: "edition", works: "work", authors: "author" };

function parseArgs(argv) {
  const args = { packageDir: "./openlibrary-import-package", help: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--package-dir") args.packageDir = argv[++i] ?? "";
    else if (argv[i] === "--help" || argv[i] === "-h") args.help = true;
    else throw new Error("Argument inconnu : " + argv[i]);
  }
  if (!args.help && !args.packageDir) throw new Error("--package-dir est obligatoire.");
  return args;
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function* jsonl(path, label, stats) {
  const lines = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  let lineNo = 0;
  for await (const line of lines) {
    lineNo += 1;
    if (!line.trim()) continue;
    let value;
    try { value = JSON.parse(line); }
    catch { throw new Error(label + ": JSON invalide à la ligne " + lineNo + "."); }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(label + ": objet JSON attendu à la ligne " + lineNo + ".");
    }
    stats[label] = (stats[label] ?? 0) + 1;
    yield value;
  }
}

function requireReviewShape(item, label) {
  if (typeof item.review_required !== "boolean" || !Array.isArray(item.review_reasons)) {
    throw new Error(label + ": champs review_required/review_reasons invalides.");
  }
  if (item.review_required !== (item.review_reasons.length > 0)) {
    throw new Error(label + ": statut de revue incohérent avec ses motifs.");
  }
}

export async function verifyOpenLibraryPackage(packageDir) {
  const dir = resolve(packageDir);
  const manifestPath = resolve(dir, "manifest.json");
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); }
  catch (error) { throw new Error("Manifeste absent ou invalide : " + error.message); }
  if (manifest.format !== "nexus-openlibrary-import-package" || manifest.formatVersion !== 1) {
    throw new Error("Format de paquet Open Library non pris en charge.");
  }
  if (manifest.executionMode !== "preparation-only; no database connection and no catalogue writes") {
    throw new Error("Mode d'exécution du paquet inattendu.");
  }
  if (!manifest.safety || manifest.safety.canonicalEntitiesCreated !== false ||
      manifest.safety.sourceRecordsWritten !== false || manifest.safety.automaticMerges !== false) {
    throw new Error("Les garanties de préparation sans écriture ne sont pas présentes.");
  }

  const paths = {};
  for (const name of FILES) {
    const entry = manifest.outputs?.[name];
    if (!entry || typeof entry.file !== "string" || basename(entry.file) !== entry.file ||
        !/^[a-z0-9-]+\.jsonl$/i.test(entry.file) || !/^[a-f0-9]{64}$/i.test(entry.sha256 ?? "")) {
      throw new Error("Entrée de manifeste invalide pour " + name + ".");
    }
    paths[name] = resolve(dir, entry.file);
    const actual = await sha256File(paths[name]);
    if (actual !== entry.sha256.toLowerCase()) throw new Error("Empreinte SHA-256 incorrecte : " + entry.file + ".");
  }

  const counts = { editions: 0, works: 0, authors: 0, relationships: 0 };
  const ids = { editions: new Set(), works: new Set(), authors: new Set() };
  const conflictedIds = { editions: new Set(), works: new Set(), authors: new Set() };
  const expectedEditionWorks = new Set();
  const expectedWorkAuthors = new Set();
  const actualRelations = new Set();
  const unresolved = { editionWork: 0, workAuthor: 0 };
  const stats = {};

  for (const name of ["editions", "works", "authors"]) {
    for await (const item of jsonl(paths[name], name, stats)) {
      requireReviewShape(item, name + " ligne " + (counts[name] + 1));
      const record = item.source_record;
      if (!record || record.record_type !== TYPES[name] || typeof record.external_record_id !== "string" || !record.external_record_id) {
        throw new Error(name + ": notice source ou identifiant externe invalide.");
      }
      const id = record.external_record_id;
      if (ids[name].has(id)) throw new Error(name + ": identifiant source répété " + id + ".");
      ids[name].add(id);
      if (item.review_reasons.includes("duplicate_source_record_id_conflicting_payloads")) conflictedIds[name].add(id);
      counts[name] += 1;
      if (name === "editions") {
        if (!Array.isArray(item.work_external_ids)) throw new Error("Edition " + id + ": liste Work absente.");
        for (const workId of item.work_external_ids) expectedEditionWorks.add(id + "\u0000" + workId);
      }
      if (name === "works") {
        if (!Array.isArray(item.author_external_ids)) throw new Error("Work " + id + ": liste Auteur absente.");
        for (const authorId of item.author_external_ids) expectedWorkAuthors.add(id + "\u0000" + authorId);
      }
    }
  }

  for await (const relation of jsonl(paths.relationships, "relationships", stats)) {
    counts.relationships += 1;
    if (typeof relation.from_id !== "string" || typeof relation.to_id !== "string" ||
        typeof relation.resolved !== "boolean" || typeof relation.review_required !== "boolean") {
      throw new Error("Relation : identifiants ou indicateurs invalides.");
    }
    if (relation.resolved === relation.review_required) throw new Error("Relation : resolved et review_required doivent être opposés.");
    if (relation.relation === "edition_works" && relation.from_type === "edition" && relation.to_type === "work") {
      const key = relation.from_id + "\u0000" + relation.to_id;
      if (actualRelations.has("ew:" + key)) throw new Error("Lien Edition–Work dupliqué.");
      actualRelations.add("ew:" + key);
      const resolved = ids.editions.has(relation.from_id) && !conflictedIds.editions.has(relation.from_id) &&
        ids.works.has(relation.to_id) && !conflictedIds.works.has(relation.to_id);
      if (relation.resolved !== resolved) throw new Error("Résolution Edition–Work incorrecte : " + relation.from_id + " → " + relation.to_id + ".");
      if (!resolved) unresolved.editionWork += 1;
    } else if (relation.relation === "work_agents" && relation.from_type === "work" && relation.to_type === "agent") {
      const key = relation.from_id + "\u0000" + relation.to_id;
      if (actualRelations.has("wa:" + key)) throw new Error("Lien Work–Auteur dupliqué.");
      actualRelations.add("wa:" + key);
      const resolved = ids.works.has(relation.from_id) && !conflictedIds.works.has(relation.from_id) &&
        ids.authors.has(relation.to_id) && !conflictedIds.authors.has(relation.to_id);
      if (relation.resolved !== resolved) throw new Error("Résolution Work–Auteur incorrecte : " + relation.from_id + " → " + relation.to_id + ".");
      if (!resolved) unresolved.workAuthor += 1;
    } else {
      throw new Error("Type de relation non autorisé dans le paquet.");
    }
  }

  for (const key of expectedEditionWorks) if (!actualRelations.has("ew:" + key)) throw new Error("Lien Edition–Work attendu absent.");
  for (const key of expectedWorkAuthors) if (!actualRelations.has("wa:" + key)) throw new Error("Lien Work–Auteur attendu absent.");
  if (actualRelations.size !== expectedEditionWorks.size + expectedWorkAuthors.size) {
    throw new Error("Le nombre de liens ne correspond pas aux relations attendues.");
  }

  for (const name of ["editions", "works", "authors", "relationships"]) {
    if (manifest.counts?.[name] !== counts[name]) throw new Error("Compteur manifest/counts incorrect pour " + name + ".");
  }
  if (manifest.quality?.unresolvedEditionWorkLinks !== unresolved.editionWork ||
      manifest.quality?.unresolvedWorkAuthorLinks !== unresolved.workAuthor) {
    throw new Error("Les compteurs de liens non résolus ne correspondent pas au manifeste.");
  }
  return {
    valid: true, format: manifest.format, counts, unresolved,
    checks: ["manifest", "sha256", "jsonl", "source_ids", "review_flags", "relationship_closure", "manifest_counts"],
    databaseAccessed: false,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write("Verify an Open Library import package before any database importer.\n\nnode scripts/verify-openlibrary-package.mjs --package-dir ./openlibrary-import-package\n\nNo database access.\n");
    return;
  }
  const result = await verifyOpenLibraryPackage(args.packageDir);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  });
}
