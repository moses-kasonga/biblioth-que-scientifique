#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { mkdir, rename, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyOpenLibraryPackage } from "./verify-openlibrary-package.mjs";

const sha = (v) => createHash("sha256").update(v).digest("hex");
const json = (v) => JSON.stringify(v);
const canonicalIdentity = (r) => ({ source_code: r.source_code ?? "openlibrary", record_type: r.record_type, external_record_id: r.external_record_id });
const sourceIdentity = (r) => ({ ...canonicalIdentity(r), source_record_version: r.source_record_version || "unknown" });
const op = (type, identity, data, depends_on = []) => {
  const key = sha(json({ type, identity }));
  return { operation_id: key, idempotency_key: key, operation_type: type, identity, depends_on, data };
};
async function* rows(path) {
  const rl = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  let n = 0;
  for await (const line of rl) {
    n++;
    if (!line.trim()) continue;
    try { yield JSON.parse(line); } catch { throw new Error("JSONL invalide ligne " + n + " : " + path); }
  }
}
async function fileHash(path) {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(path)) h.update(chunk);
  return h.digest("hex");
}
async function atomicWrite(path, content) {
  const tmp = path + ".tmp";
  await writeFile(tmp, content, "utf8");
  await rename(tmp, path);
}
function argsOf(argv) {
  const a = { packageDir: "./openlibrary-import-package", outDir: "./openlibrary-import-plan", batchSize: 500, help: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--package-dir") a.packageDir = argv[++i] ?? "";
    else if (argv[i] === "--out-dir") a.outDir = argv[++i] ?? "";
    else if (argv[i] === "--batch-size") a.batchSize = Number(argv[++i]);
    else if (argv[i] === "--help" || argv[i] === "-h") a.help = true;
    else throw new Error("Argument inconnu : " + argv[i]);
  }
  if (!a.help && (!a.packageDir || !a.outDir)) throw new Error("--package-dir et --out-dir sont obligatoires.");
  if (!a.help && (!Number.isInteger(a.batchSize) || a.batchSize < 1 || a.batchSize > 5000)) throw new Error("--batch-size doit être entre 1 et 5 000.");
  return a;
}

export async function planOpenLibraryImport({ packageDir, outDir, batchSize = 500 }) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5000) throw new Error("batchSize doit être entre 1 et 5 000.");
  const verified = await verifyOpenLibraryPackage(packageDir);
  if (!verified.valid || verified.databaseAccessed !== false) throw new Error("Paquet non vérifié en mode sans base.");
  const input = resolve(packageDir), output = resolve(outDir);
  await mkdir(output, { recursive: true });
  const sourceManifestPath = resolve(input, "manifest.json");
  const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8"));
  const paths = Object.fromEntries(["editions", "works", "authors", "relationships"].map((k) => [k, resolve(input, sourceManifest.outputs[k].file)]));
  const review = { editions: new Set(), works: new Set(), authors: new Set() };
  const identities = { editions: new Map(), works: new Map(), authors: new Map() };
  for (const kind of ["editions", "works", "authors"]) {
    for await (const item of rows(paths[kind])) {
      const id = item.source_record.external_record_id;
      identities[kind].set(id, sourceIdentity(item.source_record));
      if (item.review_required) review[kind].add(id);
    }
  }
  const counts = { source_record_upserts: 0, canonical_candidates: 0, relationship_links: 0, review_records: review.editions.size + review.works.size + review.authors.size, deferred_relationships: 0, total_operations: 0, batches: 0 };
  const batches = [];
  let pending = [], sequence = 0;
  const flush = async () => {
    if (!pending.length) return;
    const filename = "batch-" + String(batches.length + 1).padStart(6, "0") + ".jsonl";
    const content = pending.map(json).join("\n") + "\n";
    await atomicWrite(resolve(output, filename), content);
    batches.push({ sequence: batches.length + 1, file: filename, operations: pending.length, first_operation_id: pending[0].operation_id, last_operation_id: pending.at(-1).operation_id, sha256: sha(content), transaction_boundary: true });
    pending = [];
  };
  const add = async (item) => {
    pending.push({ sequence: ++sequence, ...item });
    counts.total_operations++;
    if (pending.length >= batchSize) await flush();
  };

  // Persist source provenance first; keep normalized fields and original raw payload together.
  for (const kind of ["authors", "works", "editions"]) {
    for await (const item of rows(paths[kind])) {
      const record = item.source_record;
      await add(op("upsert_source_record", sourceIdentity(record), {
        source_status: item.review_required ? "review_required" : "new",
        payload: record,
        payload_sha256: sha(json(record)),
        review_reasons: item.review_reasons,
      }));
      counts.source_record_upserts++;
    }
  }
  // Canonical operations are proposals only. The later executor must explicitly approve writes.
  for (const [kind, proposal, mapper] of [
    ["authors", "propose_agent", (r) => ({ agent_type: r.entity_type === "corporate" ? "corporate_body" : "person", preferred_name: r.preferred_name, alternate_names: r.alternate_names ?? [], birth_date: r.birth_date ?? null, death_date: r.death_date ?? null, remote_ids: r.remote_ids ?? {} })],
    ["works", "propose_work", (r) => ({ title: r.title, first_publish_year: r.first_publish_year ?? null, subjects: r.subjects ?? [] })],
    ["editions", "propose_edition", (r) => ({ title: r.title, publication_year: r.publication_year, publisher_names: r.publisher_names ?? [], language_codes: r.language_codes ?? [], isbn_identifiers: r.isbn_identifiers ?? [] })],
  ]) {
    for await (const item of rows(paths[kind])) {
      if (item.review_required) continue;
      const record = item.source_record, identity = canonicalIdentity(record);
      const sourceUpsert = op("upsert_source_record", sourceIdentity(record), null).operation_id;
      await add(op(proposal, identity, { ...mapper(record), canonical_write_allowed: false }, [sourceUpsert]));
      counts.canonical_candidates++;
    }
  }
  // Relationship links require both canonical endpoints to be review-free.
  for await (const relation of rows(paths.relationships)) {
    const ew = relation.relation === "edition_works";
    const eligible = relation.resolved && (ew
      ? !review.editions.has(relation.from_id) && !review.works.has(relation.to_id)
      : !review.works.has(relation.from_id) && !review.authors.has(relation.to_id));
    if (!eligible) { counts.deferred_relationships++; continue; }
    const from = identities[ew ? "editions" : "works"].get(relation.from_id);
    const to = identities[ew ? "works" : "authors"].get(relation.to_id);
    if (!from || !to) { counts.deferred_relationships++; continue; }
    const fromType = ew ? "propose_edition" : "propose_work";
    const toType = ew ? "propose_work" : "propose_agent";
    const linkIdentity = { relation: relation.relation, from_id: relation.from_id, to_id: relation.to_id };
    await add(op(ew ? "link_edition_work" : "link_work_author", linkIdentity, {
      role: ew ? relation.content_role ?? "main" : relation.role_code ?? "author",
      match_method: "exact",
      canonical_write_allowed: false,
    }, [op(fromType, canonicalIdentity({ ...from, source_record_version: undefined }), null).operation_id,
      op(toType, canonicalIdentity({ ...to, source_record_version: undefined }), null).operation_id]));
    counts.relationship_links++;
  }
  await flush();
  counts.batches = batches.length;
  const planManifest = {
    format: "nexus-openlibrary-import-plan", formatVersion: 1,
    source_package: { format: sourceManifest.format, formatVersion: sourceManifest.formatVersion, counts: verified.counts, manifest_sha256: await fileHash(sourceManifestPath) },
    execution_mode: "dry-run-plan-only; no database connection and no catalogue writes",
    transaction_policy: { batch_size_max: batchSize, each_batch_is_one_transaction: true, resume_key: "operation_id", ordering: ["source_record_upserts", "canonical_candidates", "relationship_links"] },
    safety: { database_accessed: false, canonical_entities_created: false, source_records_written: false, identifiers_inserted: false, automatic_merges: false, canonical_write_allowed_in_plan: false, review_required_records_get_no_canonical_candidate: true, unresolved_or_review_blocked_links_are_deferred: true },
    counts, batches,
  };
  await atomicWrite(resolve(output, "plan-manifest.json"), JSON.stringify(planManifest, null, 2) + "\n");
  return { manifest: planManifest, outputDir: output };
}
async function main() {
  const a = argsOf(process.argv.slice(2));
  if (a.help) { process.stdout.write("Build resumable dry-run Open Library transaction batches.\n\nnode scripts/plan-openlibrary-import.mjs --package-dir ./openlibrary-import-package --out-dir ./openlibrary-import-plan --batch-size 500\n\nNo database connection or catalogue writes.\n"); return; }
  const result = await planOpenLibraryImport(a);
  process.stdout.write(JSON.stringify({ manifest: resolve(result.outputDir, "plan-manifest.json"), counts: result.manifest.counts, mode: result.manifest.execution_mode }, null, 2) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { process.stderr.write((e instanceof Error ? e.message : String(e)) + "\n"); process.exitCode = 1; });
