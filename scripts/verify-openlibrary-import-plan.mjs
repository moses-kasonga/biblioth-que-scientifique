#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { resolve, basename } from "node:path";
import { pathToFileURL } from "node:url";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const ALLOWED = new Set([
  "upsert_source_record", "propose_agent", "propose_work", "propose_edition",
  "propose_source_record_link", "propose_edition_work_link", "propose_work_agent_link",
]);
const PHASE = {
  upsert_source_record: 0,
  propose_agent: 1, propose_work: 1, propose_edition: 1,
  propose_source_record_link: 2,
  propose_edition_work_link: 3, propose_work_agent_link: 3,
};

async function* jsonl(path) {
  const input = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  let lineNo = 0;
  for await (const line of input) {
    lineNo++;
    if (!line.trim()) continue;
    let item;
    try { item = JSON.parse(line); }
    catch { throw new Error("JSONL invalide à la ligne " + lineNo + " : " + path); }
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Chaque ligne doit être un objet JSON : " + path);
    yield item;
  }
}
function requireHash(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error("SHA-256 invalide : " + label);
}

export async function verifyOpenLibraryImportPlan(planDir) {
  const dir = resolve(planDir);
  let manifest;
  try { manifest = JSON.parse(await readFile(resolve(dir, "plan-manifest.json"), "utf8")); }
  catch (error) { throw new Error("Manifeste du plan absent ou invalide : " + error.message); }

  if (manifest.format !== "nexus-openlibrary-import-plan" || manifest.formatVersion !== 1) throw new Error("Format de plan non pris en charge.");
  if (manifest.execution_mode !== "dry-run-plan-only; no database connection and no catalogue writes") throw new Error("Le plan n'est pas explicitement en mode dry-run.");
  if (!manifest.transaction_policy || manifest.transaction_policy.each_batch_is_one_transaction !== true ||
      manifest.transaction_policy.writes_enabled !== false || manifest.transaction_policy.requires_separate_approved_executor !== true ||
      manifest.transaction_policy.resume_key !== "operation_id") throw new Error("Politique de transaction/reprise invalide.");
  if (!Number.isInteger(manifest.transaction_policy.batch_size_max) || manifest.transaction_policy.batch_size_max < 1 ||
      manifest.transaction_policy.batch_size_max > 5000) throw new Error("Taille maximale de lot invalide.");

  const safety = manifest.safety ?? {};
  for (const key of ["database_accessed", "canonical_entities_created", "source_records_written", "identifiers_inserted", "automatic_merges", "canonical_write_allowed_in_plan"]) {
    if (safety[key] !== false) throw new Error("Garantie de sécurité absente ou violée : " + key);
  }
  if (safety.review_required_records_get_no_canonical_candidate !== true ||
      safety.unresolved_or_review_blocked_links_are_deferred !== true ||
      safety.inferred_relationship_order_requires_review !== true) throw new Error("Les garanties de revue ne sont pas complètes.");

  const batches = manifest.batches;
  if (!Array.isArray(batches) || batches.length !== manifest.counts?.batches) throw new Error("Liste de lots et compteur incohérents.");
  const operations = [];
  const seenIds = new Set();
  let expectedSequence = 1;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const expectedName = "batch-" + String(i + 1).padStart(6, "0") + ".jsonl";
    if (batch.sequence !== i + 1 || batch.file !== expectedName || basename(batch.file) !== batch.file ||
        batch.transaction_boundary !== true) throw new Error("Métadonnées de lot invalides : " + expectedName);
    if (!Number.isInteger(batch.operations) || batch.operations < 1 ||
        batch.operations > manifest.transaction_policy.batch_size_max) throw new Error("Nombre d'opérations invalide : " + batch.file);
    requireHash(batch.sha256, batch.file);
    const content = await readFile(resolve(dir, batch.file), "utf8");
    if (sha(content) !== batch.sha256) throw new Error("Empreinte SHA-256 incorrecte : " + batch.file);
    const before = operations.length;
    for await (const operation of jsonl(resolve(dir, batch.file))) {
      if (!ALLOWED.has(operation.operation_type)) throw new Error("Type d'opération interdit : " + operation.operation_type);
      if (operation.sequence !== expectedSequence++) throw new Error("Séquence globale non continue.");
      if (!operation.identity || typeof operation.identity !== "object" || Array.isArray(operation.identity)) throw new Error("Identité d'opération absente.");
      const computedId = sha(JSON.stringify({ type: operation.operation_type, identity: operation.identity }));
      if (operation.operation_id !== computedId || operation.idempotency_key !== computedId) throw new Error("Identité/idempotency key incohérente.");
      if (seenIds.has(operation.operation_id)) throw new Error("Identifiant d'opération dupliqué.");
      seenIds.add(operation.operation_id);
      if (!Array.isArray(operation.depends_on) || operation.depends_on.some((x) => typeof x !== "string")) throw new Error("Dépendances invalides.");
      if (operation.data?.canonical_write_allowed !== false) throw new Error("Une opération n'est pas verrouillée en écriture canonique interdite.");
      if (operation.depends_on.some((id) => !seenIds.has(id) || id === operation.operation_id)) throw new Error("Dépendance absente, future ou cyclique.");
      if (operations.length && PHASE[operation.operation_type] < PHASE[operations.at(-1).operation_type]) throw new Error("Ordre des phases d'import invalide.");
      operations.push(operation);
    }
    const actualInBatch = operations.length - before;
    if (actualInBatch !== batch.operations || actualInBatch === 0) throw new Error("Compteur d'opérations invalide : " + batch.file);
    if (operations[before].operation_id !== batch.first_operation_id ||
        operations.at(-1).operation_id !== batch.last_operation_id) throw new Error("Bornes de lot incohérentes : " + batch.file);
  }

  const byId = new Map(operations.map((x) => [x.operation_id, x]));
  const sourceUpserts = new Map();
  const candidates = new Map();
  const counts = {
    source_record_upserts: 0, canonical_candidates: 0, source_record_link_candidates: 0,
    relationship_link_candidates: 0, review_records: 0, deferred_relationships: manifest.counts?.deferred_relationships,
    total_operations: operations.length, batches: batches.length,
  };

  for (const operation of operations) {
    if (operation.operation_type === "upsert_source_record") {
      const id = operation.identity;
      if (!id.source_code || !id.record_type || !id.external_record_id || !id.source_record_version) throw new Error("Identité de source incomplète.");
      if (!["new", "review_required"].includes(operation.data?.source_status)) throw new Error("Statut de source invalide.");
      if (!operation.data.payload || typeof operation.data.payload !== "object" || Array.isArray(operation.data.payload)) throw new Error("Payload source invalide.");
      requireHash(operation.data.payload_sha256, "payload source");
      if (sha(JSON.stringify(operation.data.payload)) !== operation.data.payload_sha256) throw new Error("Hash du payload source incorrect.");
      const key = JSON.stringify(id);
      if (sourceUpserts.has(key)) throw new Error("Upsert source dupliqué.");
      sourceUpserts.set(key, operation);
      if (operation.data.source_status === "review_required") counts.review_records++;
      counts.source_record_upserts++;
      continue;
    }

    if (["propose_agent", "propose_work", "propose_edition"].includes(operation.operation_type)) {
      const key = JSON.stringify(operation.identity);
      const source = sourceUpserts.get(key);
      if (!source || source.data.source_status === "review_required" || !operation.depends_on.includes(source.operation_id)) {
        throw new Error("Candidat canonique sans source éligible ou sans dépendance source.");
      }
      if (candidates.has(key)) throw new Error("Plusieurs propositions canoniques pour la même version source.");
      if (operation.operation_type === "propose_agent") {
        if (!operation.data.agent || !Array.isArray(operation.data.names) || !operation.data.names.length ||
            operation.data.agent.record_status !== "provisional" ||
            operation.data.names.some((x) => !x.name_text || !x.normalized_name)) throw new Error("Proposition Agent incompatible avec le schéma.");
      }
      if (operation.operation_type === "propose_work") {
        if (!operation.data.work || !operation.data.expression || !Array.isArray(operation.data.titles) ||
            !operation.data.titles.length || operation.data.work.record_status !== "provisional" ||
            operation.data.expression.record_status !== "provisional" ||
            operation.data.titles.some((x) => !x.title_text || !x.normalized_title)) throw new Error("Proposition Work/Expression incompatible avec le schéma.");
      }
      if (operation.operation_type === "propose_edition") {
        if (!operation.data.edition || !Array.isArray(operation.data.identifiers) ||
            operation.data.edition.record_status !== "provisional" ||
            operation.data.identifiers.some((x) => !x.scheme_code || !x.identifier_value || !x.normalized_value)) {
          throw new Error("Proposition Edition/identifiants incompatible avec le schéma.");
        }
      }
      candidates.set(key, operation);
      counts.canonical_candidates++;
      continue;
    }

    if (operation.operation_type === "propose_source_record_link") {
      if (operation.depends_on.length !== 2 || !operation.data.target_kind ||
          operation.data.link_type !== "describes" || operation.data.match_method !== "exact" ||
          operation.data.confidence !== 1) throw new Error("Proposition de provenance invalide.");
      const source = byId.get(operation.depends_on[0]), candidate = byId.get(operation.depends_on[1]);
      if (!source || source.operation_type !== "upsert_source_record" ||
          !candidate || !["propose_agent", "propose_work", "propose_edition"].includes(candidate.operation_type) ||
          source.data.source_status === "review_required") throw new Error("Provenance sans source/candidat valide.");
      if (JSON.stringify(source.identity) !== JSON.stringify(candidate.identity)) throw new Error("La provenance et le candidat ne ciblent pas la même notice source.");
      counts.source_record_link_candidates++;
      continue;
    }

    if (operation.operation_type === "propose_edition_work_link" || operation.operation_type === "propose_work_agent_link") {
      if (operation.depends_on.length !== 2 || !operation.data.table ||
          operation.data.match_method !== "exact" || operation.data.sequence_review_required !== (operation.data.sequence_no > 1)) {
        throw new Error("Proposition de relation invalide.");
      }
      const [left, right] = operation.depends_on.map((id) => byId.get(id));
      const expected = operation.operation_type === "propose_edition_work_link"
        ? ["propose_edition", "propose_work", "bibliotheque.edition_works"]
        : ["propose_work", "propose_agent", "bibliotheque.work_agents"];
      if (!left || !right || left.operation_type !== expected[0] || right.operation_type !== expected[1] ||
          operation.data.table !== expected[2]) throw new Error("Relation sans candidats canoniques compatibles.");
      counts.relationship_link_candidates++;
    }
  }

  for (const operation of operations) {
    if (operation.operation_type === "propose_source_record_link") {
      const candidate = byId.get(operation.depends_on[1]);
      if (!candidate || !candidates.has(JSON.stringify(candidate.identity))) throw new Error("Candidat de provenance absent.");
    }
    if (operation.operation_type === "propose_edition_work_link" || operation.operation_type === "propose_work_agent_link") {
      if (!operation.depends_on.every((id) => byId.has(id))) throw new Error("Endpoint de relation absent.");
    }
  }

  for (const key of ["source_record_upserts", "canonical_candidates", "source_record_link_candidates", "relationship_link_candidates", "review_records", "deferred_relationships", "total_operations", "batches"]) {
    if (!Number.isInteger(counts[key]) || manifest.counts?.[key] !== counts[key]) throw new Error("Compteur du manifeste incorrect : " + key);
  }
  return {
    valid: true, format: manifest.format, counts,
    checks: ["manifest", "batch_sha256", "jsonl", "operation_hashes", "idempotency", "dependency_order", "phase_order", "schema_mapping", "write_guards"],
    databaseAccessed: false,
  };
}

async function main() {
  const args = process.argv.slice(2);
  let planDir = "./openlibrary-import-plan";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--plan-dir") planDir = args[++i] ?? "";
    else if (args[i] === "--help" || args[i] === "-h") {
      process.stdout.write("Verify an Open Library transaction plan. No database access.\n\nnode scripts/verify-openlibrary-import-plan.mjs --plan-dir ./openlibrary-import-plan\n");
      return;
    } else throw new Error("Argument inconnu : " + args[i]);
  }
  if (!planDir) throw new Error("--plan-dir est obligatoire.");
  const result = await verifyOpenLibraryImportPlan(planDir);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  });
}
