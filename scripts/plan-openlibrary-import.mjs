#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { mkdir, rename, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyOpenLibraryPackage } from "./verify-openlibrary-package.mjs";

const sha = (v) => createHash("sha256").update(v).digest("hex");
const json = (v) => JSON.stringify(v);
const sourceIdentity = (r) => ({
  source_code: r.source_code ?? "openlibrary",
  record_type: r.record_type,
  external_record_id: r.external_record_id,
  source_record_version: r.source_record_version || "unknown",
});
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
    try { yield JSON.parse(line); }
    catch { throw new Error("JSONL invalide ligne " + n + " : " + path); }
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
function normalizeText(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}
function uniqueTexts(values, excluded = new Set()) {
  const seen = new Set(excluded);
  const out = [];
  for (const raw of Array.isArray(values) ? values : []) {
    const value = String(raw ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
    const key = normalizeText(value);
    if (!value || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}
function canonicalAgentType(value) {
  const key = String(value ?? "").trim().toLocaleLowerCase("en");
  if (["person", "family", "meeting", "jurisdiction", "other"].includes(key)) return key;
  if (["corporate", "corporate_body", "organization", "organisation"].includes(key)) return "corporate_body";
  return "other";
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
  const existing = await readdir(output);
  const stale = existing.filter((name) => /^batch-\d{6}\.jsonl$/.test(name) || name === "plan-manifest.json");
  const unexpected = existing.filter((name) => !stale.includes(name));
  if (unexpected.length) throw new Error("Le dossier de plan contient des fichiers inattendus : " + unexpected.join(", "));
  for (const name of stale) await rm(resolve(output, name), { force: true });

  const sourceManifestPath = resolve(input, "manifest.json");
  const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8"));
  const paths = Object.fromEntries(["editions", "works", "authors", "relationships"].map((k) => [k, resolve(input, sourceManifest.outputs[k].file)]));
  const review = { editions: new Set(), works: new Set(), authors: new Set() };
  const identities = { editions: new Map(), works: new Map(), authors: new Map() };

  for (const kind of ["editions", "works", "authors"]) {
    for await (const item of rows(paths[kind])) {
      const record = item.source_record;
      const id = record.external_record_id;
      identities[kind].set(id, sourceIdentity(record));
      if (item.review_required) review[kind].add(id);
    }
  }

  const counts = {
    source_record_upserts: 0,
    canonical_candidates: 0,
    source_record_link_candidates: 0,
    relationship_link_candidates: 0,
    review_records: review.editions.size + review.works.size + review.authors.size,
    deferred_relationships: 0,
    total_operations: 0,
    batches: 0,
  };
  const batches = [];
  let pending = [], sequence = 0;

  const flush = async () => {
    if (!pending.length) return;
    const filename = "batch-" + String(batches.length + 1).padStart(6, "0") + ".jsonl";
    const content = pending.map(json).join("\n") + "\n";
    await atomicWrite(resolve(output, filename), content);
    batches.push({
      sequence: batches.length + 1,
      file: filename,
      operations: pending.length,
      first_operation_id: pending[0].operation_id,
      last_operation_id: pending.at(-1).operation_id,
      sha256: sha(content),
      transaction_boundary: true,
    });
    pending = [];
  };
  const add = async (item) => {
    pending.push({ sequence: ++sequence, ...item });
    counts.total_operations++;
    if (pending.length >= batchSize) await flush();
  };

  // Stage 1: preserve every source payload and its source-level revision.
  for (const kind of ["authors", "works", "editions"]) {
    for await (const item of rows(paths[kind])) {
      const record = item.source_record;
      await add(op("upsert_source_record", sourceIdentity(record), {
        source_status: item.review_required ? "review_required" : "new",
        payload: record,
        payload_sha256: sha(json(record)),
        review_reasons: item.review_reasons,
        canonical_write_allowed: false,
      }));
      counts.source_record_upserts++;
    }
  }

  // Stage 2: propose canonical rows using the actual normalized catalogue model.
  const candidates = [
    ["authors", "propose_agent", (r) => {
      const preferred = String(r.preferred_name ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
      const names = [{ name_type: "preferred", name_text: preferred, normalized_name: normalizeText(preferred), is_preferred: true }];
      for (const alternate of uniqueTexts(r.alternate_names, new Set([normalizeText(preferred)]))) {
        names.push({ name_type: "variant", name_text: alternate, normalized_name: normalizeText(alternate), is_preferred: false });
      }
      return {
        agent: { agent_type: canonicalAgentType(r.entity_type), record_status: "provisional" },
        names,
        identifier_candidates_for_review: r.remote_ids && typeof r.remote_ids === "object" ? r.remote_ids : {},
        biographical_values_for_review: { birth_date: r.birth_date ?? null, death_date: r.death_date ?? null },
        canonical_write_allowed: false,
      };
    }],
    ["works", "propose_work", (r) => {
      const title = String(r.title ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
      return {
        work: { work_type: "other", description: null, creation_year_from: null, creation_year_to: null, creation_date_display: null, record_status: "provisional" },
        expression: { expression_type: "other", description: null, record_status: "provisional" },
        titles: [{ language_code: null, title_type: "preferred", title_text: title, normalized_title: normalizeText(title), is_preferred: true, sequence_no: 1 }],
        first_publish_year_for_review: r.first_publish_year ?? null,
        subject_labels_for_review: uniqueTexts(r.subjects),
        canonical_write_allowed: false,
      };
    }],
    ["editions", "propose_edition", (r) => {
      const title = String(r.title ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
      const year = Number.isInteger(r.publication_year) ? r.publication_year : null;
      const identifiers = [{ scheme_code: "olid", identifier_value: r.external_record_id, normalized_value: String(r.external_record_id).toUpperCase(), is_preferred: false }];
      for (const item of Array.isArray(r.isbn_identifiers) ? r.isbn_identifiers : []) {
        if (item?.normalizedValue) identifiers.push({ scheme_code: "isbn", identifier_value: String(item.sourceValue ?? item.normalizedValue), normalized_value: String(item.normalizedValue).replace(/[\s-]/g, "").toUpperCase(), is_preferred: false });
      }
      return {
        edition: {
          edition_type: "other",
          title_statement: title,
          edition_statement: null,
          publication_place_text: null,
          publication_year_from: year,
          publication_year_to: year,
          publication_date_display: year ? String(year) : null,
          extent_text: null,
          physical_details: null,
          format_note: null,
          record_status: "provisional",
        },
        identifiers,
        publisher_names_for_review: uniqueTexts(r.publisher_names),
        observed_language_codes_for_review: Array.isArray(r.language_codes) ? uniqueTexts(r.language_codes) : [],
        subject_labels_for_review: uniqueTexts(r.subjects),
        canonical_write_allowed: false,
      };
    }],
  ];

  for (const [kind, proposal, mapper] of candidates) {
    for await (const item of rows(paths[kind])) {
      if (item.review_required) continue;
      const identity = sourceIdentity(item.source_record);
      const sourceUpsert = op("upsert_source_record", identity, null).operation_id;
      await add(op(proposal, identity, mapper(item.source_record), [sourceUpsert]));
      counts.canonical_candidates++;
    }
  }

  // Stage 3: provenance-link proposals, dependent on both source and canonical proposals.
  for (const [kind, targetKind] of [
    ["authors", "agent"],
    ["works", "work"],
    ["editions", "edition"],
  ]) {
    const candidateType = kind === "authors" ? "propose_agent" : kind === "works" ? "propose_work" : "propose_edition";
    for await (const item of rows(paths[kind])) {
      if (item.review_required) continue;
      const identity = sourceIdentity(item.source_record);
      const sourceUpsert = op("upsert_source_record", identity, null).operation_id;
      const candidate = op(candidateType, identity, null).operation_id;
      const linkIdentity = { source: identity, target_kind: targetKind, link_type: "describes" };
      await add(op("propose_source_record_link", linkIdentity, {
        target_kind: targetKind,
        link_type: "describes",
        match_method: "exact",
        confidence: 1,
        canonical_write_allowed: false,
      }, [sourceUpsert, candidate]));
      counts.source_record_link_candidates++;
    }
  }

  // Stage 4: relationship proposals. Source-array ordering is flagged for review.
  const relationSequences = { edition_works: new Map(), work_agents: new Map() };
  for await (const relation of rows(paths.relationships)) {
    const ew = relation.relation === "edition_works";
    const kindFrom = ew ? "editions" : "works";
    const kindTo = ew ? "works" : "authors";
    const eligible = relation.resolved &&
      !review[kindFrom].has(relation.from_id) &&
      !review[kindTo].has(relation.to_id);
    if (!eligible) { counts.deferred_relationships++; continue; }
    const from = identities[kindFrom].get(relation.from_id);
    const to = identities[kindTo].get(relation.to_id);
    if (!from || !to) { counts.deferred_relationships++; continue; }
    const fromType = ew ? "propose_edition" : "propose_work";
    const toType = ew ? "propose_work" : "propose_agent";
    const sequenceMap = relationSequences[relation.relation];
    const sequenceNo = (sequenceMap.get(relation.from_id) ?? 0) + 1;
    sequenceMap.set(relation.from_id, sequenceNo);
    const linkIdentity = { relation: relation.relation, from, to };
    await add(op(ew ? "propose_edition_work_link" : "propose_work_agent_link", linkIdentity, ew
      ? {
          table: "bibliotheque.edition_works",
          content_role: relation.content_role ?? "main",
          sequence_no: sequenceNo,
          sequence_from_source_array: true,
          sequence_review_required: sequenceNo > 1,
          match_method: "exact",
          canonical_write_allowed: false,
        }
      : {
          table: "bibliotheque.work_agents",
          role_code: relation.role_code ?? "author",
          sequence_no: sequenceNo,
          sequence_from_source_array: true,
          sequence_review_required: sequenceNo > 1,
          match_method: "exact",
          canonical_write_allowed: false,
        }, [
          op(fromType, from, null).operation_id,
          op(toType, to, null).operation_id,
        ]));
    counts.relationship_link_candidates++;
  }

  await flush();
  counts.batches = batches.length;
  const planManifest = {
    format: "nexus-openlibrary-import-plan",
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    source_package: {
      format: sourceManifest.format,
      formatVersion: sourceManifest.formatVersion,
      counts: verified.counts,
      manifest_sha256: await fileHash(sourceManifestPath),
    },
    execution_mode: "dry-run-plan-only; no database connection and no catalogue writes",
    transaction_policy: {
      batch_size_max: batchSize,
      each_batch_is_one_transaction: true,
      resume_key: "operation_id",
      ordering: ["source_record_upserts", "canonical_candidates", "source_record_link_candidates", "relationship_link_candidates"],
      writes_enabled: false,
      requires_separate_approved_executor: true,
    },
    schema_mapping: {
      schema: "bibliotheque",
      work_titles: "work_expressions + expression_titles",
      agent_names: "agent_names",
      edition_identifiers: "bibliographic_identifiers",
      work_and_edition_source_ids: "bibliographic_identifiers (olid)",
      author_source_ids: "source_records only; no agent OLID identifier scheme is registered",
      publishers_and_subjects: "review queue only; never auto-created from free-text labels",
      language_codes: "review queue only until a specific expression is established",
    },
    safety: {
      database_accessed: false,
      canonical_entities_created: false,
      source_records_written: false,
      identifiers_inserted: false,
      automatic_merges: false,
      canonical_write_allowed_in_plan: false,
      review_required_records_get_no_canonical_candidate: true,
      unresolved_or_review_blocked_links_are_deferred: true,
      inferred_relationship_order_requires_review: true,
    },
    counts,
    batches,
  };
  await atomicWrite(resolve(output, "plan-manifest.json"), JSON.stringify(planManifest, null, 2) + "\n");
  return { manifest: planManifest, outputDir: output };
}

async function main() {
  const a = argsOf(process.argv.slice(2));
  if (a.help) {
    process.stdout.write(
      "Build a verified dry-run Open Library import plan for Bibliotheque Scientifique.\n\n" +
      "node scripts/plan-openlibrary-import.mjs --package-dir ./openlibrary-import-package --out-dir ./openlibrary-import-plan --batch-size 500\n\n" +
      "No database connection or catalogue writes. Validate with verify-openlibrary-import-plan.mjs.\n"
    );
    return;
  }
  const result = await planOpenLibraryImport(a);
  process.stdout.write(JSON.stringify({
    manifest: resolve(result.outputDir, "plan-manifest.json"),
    counts: result.manifest.counts,
    mode: result.manifest.execution_mode,
  }, null, 2) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    process.stderr.write((e instanceof Error ? e.message : String(e)) + "\n");
    process.exitCode = 1;
  });
}
