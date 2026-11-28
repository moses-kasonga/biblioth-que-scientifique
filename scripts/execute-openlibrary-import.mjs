#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { verifyOpenLibraryPackage } from "./verify-openlibrary-package.mjs";
import { verifyOpenLibraryImportPlan } from "./verify-openlibrary-import-plan.mjs";

const { Pool } = pg;
const EXPECTED_BRANCH = "br-lingering-mud-becn8dmd";
const sha = (v) => createHash("sha256").update(v).digest("hex");
const json = (v) => JSON.stringify(v);

async function* jsonl(path) {
  const rl = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  let line = 0;
  for await (const raw of rl) {
    line++;
    if (!raw.trim()) continue;
    let item;
    try { item = JSON.parse(raw); } catch { throw new Error("JSONL invalide ligne " + line + " : " + path); }
    yield item;
  }
}
async function atomicJson(path, value) {
  const tmp = path + ".tmp";
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", { flag: "w" });
  await rename(tmp, path);
}
function parseArgs(argv) {
  const a = { packageDir: "./openlibrary-import-package", planDir: "./openlibrary-import-plan", checkpoint: "./openlibrary-import-checkpoint.json", apply: false, branchId: "" };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--package-dir") a.packageDir = argv[++i] ?? "";
    else if (v === "--plan-dir") a.planDir = argv[++i] ?? "";
    else if (v === "--checkpoint") a.checkpoint = argv[++i] ?? "";
    else if (v === "--apply") a.apply = true;
    else if (v === "--target-branch-id") a.branchId = argv[++i] ?? "";
    else if (v === "--help" || v === "-h") a.help = true;
    else throw new Error("Argument inconnu : " + v);
  }
  return a;
}
function validateCheckpoint(value, planHash) {
  if (!value || value.format !== "nexus-openlibrary-import-checkpoint" || value.formatVersion !== 1 ||
      value.plan_sha256 !== planHash || typeof value.import_job_id !== "string" ||
      !Array.isArray(value.completed_batches) || !value.completed_batches.every(Number.isInteger)) {
    throw new Error("Checkpoint invalide ou associé à un autre plan. Aucun import lancé.");
  }
}

export async function runOpenLibraryExecutor(args) {
  const pkg = await verifyOpenLibraryPackage(args.packageDir);
  const plan = await verifyOpenLibraryImportPlan(args.planDir);
  if (!pkg.valid || !plan.valid) throw new Error("Paquet ou plan non vérifié.");
  const planPath = resolve(args.planDir, "plan-manifest.json");
  const manifest = JSON.parse(await readFile(planPath, "utf8"));
  if (manifest.schema_mapping?.schema !== "bibliotheque" ||
      manifest.safety?.canonical_write_allowed_in_plan !== false ||
      manifest.transaction_policy?.writes_enabled !== false) {
    throw new Error("Le plan ne respecte pas les garanties de sécurité attendues.");
  }
  const planHash = sha(await readFile(planPath));
  const checkpointPath = resolve(args.checkpoint);
  let checkpoint;
  try {
    checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
    validateCheckpoint(checkpoint, planHash);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }

  if (!args.apply) {
    return { mode: "dry-run", verified: true, package_counts: pkg.counts, plan_counts: plan.counts,
      batches: manifest.batches.length, source_record_operations: manifest.counts.source_record_upserts,
      canonical_operations_deferred: manifest.counts.canonical_candidates + manifest.counts.source_record_link_candidates + manifest.counts.relationship_link_candidates,
      database_accessed: false };
  }
  if (args.branchId !== EXPECTED_BRANCH || process.env.NEXUS_IMPORT_ALLOWED_BRANCH_ID !== EXPECTED_BRANCH) {
    throw new Error("Écriture refusée : --target-branch-id et NEXUS_IMPORT_ALLOWED_BRANCH_ID doivent désigner la branche Neon de développement autorisée.");
  }
  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL_UNPOOLED (recommandé) ou DATABASE_URL est requis.");
  const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000, ssl: { rejectUnauthorized: true } });
  let jobId = checkpoint?.import_job_id;
  const completed = new Set(checkpoint?.completed_batches ?? []);
  const totals = { source_records_created: 0, source_records_updated: 0, source_records_unchanged: 0, review_required: 0, deferred_canonical_operations: 0, batches_committed: 0 };
  try {
    const identity = await pool.query("SELECT current_database() AS database_name, current_setting('neon.branch_id', true) AS neon_branch_id");
    if (identity.rows[0]?.database_name !== "neondb" || identity.rows[0]?.neon_branch_id !== EXPECTED_BRANCH) {
      throw new Error("Cible Neon non conforme : l'identifiant réel de branche ne correspond pas à la branche de développement autorisée.");
    }
    const source = await pool.query("SELECT source_system_id FROM bibliotheque.source_systems WHERE source_code = 'openlibrary' AND is_active = true");
    if (source.rowCount !== 1) throw new Error("Source Open Library absente ou inactive.");
    if (!jobId) {
      const created = await pool.query(
        "INSERT INTO bibliotheque.import_jobs (source_system_id, job_type, status, parameters, started_at) VALUES ($1, 'bulk_dump', 'running', $2::jsonb, now()) RETURNING import_job_id",
        [source.rows[0].source_system_id, JSON.stringify({ source: "openlibrary", plan_sha256: planHash, mode: "source-records-only", target_branch_id: EXPECTED_BRANCH })]
      );
      jobId = created.rows[0].import_job_id;
      checkpoint = { format: "nexus-openlibrary-import-checkpoint", formatVersion: 1, plan_sha256: planHash, import_job_id: jobId, completed_batches: [] };
      await atomicJson(checkpointPath, checkpoint);
    } else {
      const existing = await pool.query("SELECT status FROM bibliotheque.import_jobs WHERE import_job_id = $1 AND source_system_id = $2", [jobId, source.rows[0].source_system_id]);
      if (existing.rowCount !== 1 || ["completed", "cancelled"].includes(existing.rows[0].status)) throw new Error("Job de reprise absent, terminé ou non compatible.");
      await pool.query("UPDATE bibliotheque.import_jobs SET status = 'running', completed_at = NULL WHERE import_job_id = $1", [jobId]);
    }

    for (const batch of manifest.batches) {
      if (completed.has(batch.sequence)) continue;
      const batchPath = resolve(args.planDir, batch.file);
      const operations = [];
      for await (const op of jsonl(batchPath)) operations.push(op);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const operation of operations) {
          if (operation.operation_type !== "upsert_source_record") {
            totals.deferred_canonical_operations++;
            continue;
          }
          const d = operation.data;
          if (!d || d.canonical_write_allowed !== false || !d.payload || !operation.identity ||
              operation.identity.source_code !== "openlibrary" ||
              !/^(OL\\d+M|OL\\d+W|OL\\d+A)$/.test(operation.identity.external_record_id ?? "") ||
              !["edition", "work", "author"].includes(operation.identity.record_type) ||
              !String(operation.identity.external_record_id).endsWith(({ edition: "M", work: "W", author: "A" })[operation.identity.record_type]) ||
              sha(json(d.payload)) !== d.payload_sha256) {
            throw new Error("Opération source invalide, empreinte payload incorrecte ou non autorisée.");
          }
          const { external_record_id, source_record_version } = operation.identity;
          const upsert = await client.query(
            `INSERT INTO bibliotheque.source_records
              (source_system_id, external_record_id, source_record_version, payload, payload_sha256, record_status)
             VALUES ($1, $2, $3, $4::jsonb, $5, $6)
             ON CONFLICT (source_system_id, external_record_id, source_record_version)
             DO UPDATE SET payload = EXCLUDED.payload, payload_sha256 = EXCLUDED.payload_sha256,
               record_status = CASE WHEN EXCLUDED.record_status = 'review_required' THEN 'review_required' ELSE bibliotheque.source_records.record_status END
             WHERE bibliotheque.source_records.payload_sha256 IS DISTINCT FROM EXCLUDED.payload_sha256
                OR (EXCLUDED.record_status = 'review_required' AND bibliotheque.source_records.record_status <> 'review_required')
             RETURNING source_record_id, (xmax = 0) AS inserted`,
            [source.rows[0].source_system_id, external_record_id, source_record_version || "unknown",
              JSON.stringify(d.payload), d.payload_sha256, d.source_status === "review_required" ? "review_required" : "new"]
          );
          let sourceRecordId, outcome;
          if (upsert.rowCount) {
            sourceRecordId = upsert.rows[0].source_record_id;
            outcome = upsert.rows[0].inserted ? "created" : "updated";
          } else {
            const existingRecord = await client.query(
              "SELECT source_record_id, record_status FROM bibliotheque.source_records WHERE source_system_id = $1 AND external_record_id = $2 AND source_record_version = $3",
              [source.rows[0].source_system_id, external_record_id, source_record_version || "unknown"]
            );
            sourceRecordId = existingRecord.rows[0].source_record_id;
            outcome = d.source_status === "review_required" || existingRecord.rows[0].record_status === "review_required" ? "review_required" : "skipped";
          }
          await client.query(
            `INSERT INTO bibliotheque.import_records (import_job_id, source_record_id, outcome, processed_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (import_job_id, source_record_id) DO NOTHING`,
            [jobId, sourceRecordId, outcome]
          );
          if (outcome === "created") totals.source_records_created++;
          else if (outcome === "updated") totals.source_records_updated++;
          else if (outcome === "review_required") totals.review_required++;
          else totals.source_records_unchanged++;
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally { client.release(); }
      completed.add(batch.sequence);
      checkpoint.completed_batches = [...completed].sort((a,b)=>a-b);
      await atomicJson(checkpointPath, checkpoint);
      totals.batches_committed++;
    }
    const counters = await pool.query(
      `SELECT count(*)::bigint AS seen,
        count(*) FILTER (WHERE outcome='created')::bigint AS created,
        count(*) FILTER (WHERE outcome='updated')::bigint AS updated,
        count(*) FILTER (WHERE outcome='skipped')::bigint AS skipped,
        count(*) FILTER (WHERE outcome='failed')::bigint AS failed
       FROM bibliotheque.import_records WHERE import_job_id = $1`, [jobId]);
    await pool.query(
      "UPDATE bibliotheque.import_jobs SET status = 'completed', completed_at = now(), records_seen = $2, records_created = $3, records_updated = $4, records_skipped = $5, records_failed = $6 WHERE import_job_id = $1",
      [jobId, ...Object.values(counters.rows[0])]
    );
    return { mode: "applied", import_job_id: jobId, ...totals, database: "neondb", target_branch_id: EXPECTED_BRANCH,
      canonical_catalogue_writes: 0, resumable: true };
  } catch (error) {
    if (jobId) await pool.query("UPDATE bibliotheque.import_jobs SET status = 'failed', completed_at = now() WHERE import_job_id = $1", [jobId]).catch(() => {});
    throw error;
  } finally { await pool.end(); }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write("Open Library source-record executor. Dry-run by default.\n\n" +
      "Dry-run: node scripts/execute-openlibrary-import.mjs\n" +
      "Apply: NEXUS_IMPORT_ALLOWED_BRANCH_ID=br-lingering-mud-becn8dmd node scripts/execute-openlibrary-import.mjs --apply --target-branch-id br-lingering-mud-becn8dmd\n" +
      "Resumes from the checkpoint; imports source records only. Canonical catalogue proposals are never executed.\n");
    return;
  }
  const result = await runOpenLibraryExecutor(args);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n"); process.exitCode = 1; });
}
