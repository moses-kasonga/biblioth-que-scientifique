#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { normalizeDoabPayload, normalizeText } from "./doab-import-core.mjs";

const DEFAULT_MAX = 25;
const MAX_BATCH = 500;

function parseArgs(argv) {
  const result = { input: null, apply: false, max: DEFAULT_MAX, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") result.input = argv[++i] ?? null;
    else if (arg === "--max-records") result.max = Number(argv[++i]);
    else if (arg === "--apply") result.apply = true;
    else if (arg === "--dry-run") result.apply = false;
    else if (arg === "--help" || arg === "-h") result.help = true;
    else throw new Error("Argument inconnu : " + arg);
  }
  if (!Number.isInteger(result.max) || result.max < 1 || result.max > MAX_BATCH) {
    throw new Error("--max-records doit être compris entre 1 et " + MAX_BATCH + ".");
  }
  return result;
}

function help() {
  process.stdout.write(
    "Import pilote DOAB\n\n" +
    "node scripts/import-doab.mjs --input ./doab-batch.json\n" +
    "DATABASE_IMPORT_URL='...' node scripts/import-doab.mjs --input ./doab-batch.json --apply\n\n" +
    "Dry-run par défaut. --apply nécessite le rôle Neon bibliotheque_importer.\n"
  );
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function saveImportRecord(client, jobId, sourceRecordId, outcome, detail = null) {
  if (!sourceRecordId) return;
  await client.query(
    `INSERT INTO bibliotheque.import_records
       (import_job_id, source_record_id, outcome, error_detail, processed_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (import_job_id, source_record_id)
     DO UPDATE SET outcome = EXCLUDED.outcome,
                   error_detail = EXCLUDED.error_detail,
                   processed_at = now()`,
    [jobId, sourceRecordId, outcome, detail]
  );
}

async function saveSourceLink(client, sourceRecordId, kind, id, linkType = "describes", method = "exact") {
  const targetColumns = {
    work: "work_id",
    expression: "expression_id",
    edition: "edition_id",
    agent: "agent_id",
    subject: "subject_id",
  };
  const column = targetColumns[kind];
  if (!column || !id) return;

  // Column names come only from the fixed whitelist above; all values remain parameterized.
  const sql =
    "INSERT INTO bibliotheque.source_record_links " +
    "(source_record_id, " + column + ", link_type, match_method, confidence) " +
    "VALUES ($1, $2, $3, $4, 1.0) ON CONFLICT DO NOTHING";
  await client.query(sql, [sourceRecordId, id, linkType, method]);
}

async function priorLinks(client, sourceSystemId, externalId, sourceRecordId) {
  const result = await client.query(
    `SELECT srl.work_id, srl.expression_id, srl.edition_id
     FROM bibliotheque.source_records sr
     JOIN bibliotheque.source_record_links srl
       ON srl.source_record_id = sr.source_record_id
     WHERE sr.source_system_id = $1
       AND sr.external_record_id = $2
       AND sr.source_record_id <> $3
       AND (srl.work_id IS NOT NULL OR srl.expression_id IS NOT NULL OR srl.edition_id IS NOT NULL)
     ORDER BY sr.retrieved_at DESC
     LIMIT 10`,
    [sourceSystemId, externalId, sourceRecordId]
  );
  return result.rows;
}

async function identifierMatches(client, record) {
  const candidates = [
    ...record.isbns.map((value) => ["isbn", value]),
    ...record.dois.map((value) => ["doi", value]),
  ];
  const matches = new Map();
  for (const [scheme, value] of candidates) {
    const result = await client.query(
      `SELECT bi.work_id, bi.edition_id, ew.work_id AS edition_work_id
       FROM bibliotheque.bibliographic_identifiers bi
       LEFT JOIN bibliotheque.edition_works ew ON ew.edition_id = bi.edition_id
       WHERE bi.scheme_code = $1 AND bi.normalized_value = $2
       LIMIT 2`,
      [scheme, value]
    );
    for (const row of result.rows) {
      const workId = row.work_id ?? row.edition_work_id ?? null;
      if (workId) matches.set(workId, { workId, editionId: row.edition_id ?? null });
    }
  }
  return [...matches.values()];
}

async function ensureAgent(client, name, type, language) {
  const normalized = normalizeText(name);
  if (!normalized) return null;
  const existing = await client.query(
    `SELECT agent_id FROM bibliotheque.agent_names
     WHERE normalized_name = $1 AND language_code IS NOT DISTINCT FROM $2
     LIMIT 2`,
    [normalized, language]
  );
  if (existing.rows.length === 1) return existing.rows[0].agent_id;

  const created = await client.query(
    `INSERT INTO bibliotheque.agents (agent_type, record_status)
     VALUES ($1, 'provisional') RETURNING agent_id`,
    [type]
  );
  const agentId = created.rows[0].agent_id;
  await client.query(
    `INSERT INTO bibliotheque.agent_names
       (agent_id, language_code, name_type, name_text, normalized_name, sort_name, is_preferred)
     VALUES ($1, $2, 'preferred', $3, $4, $3, TRUE)`,
    [agentId, language, name.trim(), normalized]
  );
  return agentId;
}

async function ensureSubject(client, label, language) {
  const normalized = normalizeText(label);
  if (!normalized) return null;
  const existing = await client.query(
    `SELECT subject_id FROM bibliotheque.subject_labels
     WHERE normalized_label = $1 AND language_code IS NOT DISTINCT FROM $2
     LIMIT 2`,
    [normalized, language]
  );
  if (existing.rows.length === 1) return existing.rows[0].subject_id;

  const created = await client.query(
    `INSERT INTO bibliotheque.subjects (subject_type, record_status)
     VALUES ('concept', 'provisional') RETURNING subject_id`
  );
  const subjectId = created.rows[0].subject_id;
  await client.query(
    `INSERT INTO bibliotheque.subject_labels
       (subject_id, language_code, label_type, label_text, normalized_label, is_preferred)
     VALUES ($1, $2, 'preferred', $3, $4, TRUE)`,
    [subjectId, language, label.trim(), normalized]
  );
  return subjectId;
}

async function importOne(pool, sourceSystemId, jobId, record) {
  const client = await pool.connect();
  let sourceRecordId = null;
  try {
    await client.query("BEGIN");
    if (!record.externalRecordId) throw new Error("Identifiant source DOAB absent.");

    const payloadHash = sha256(record.raw);
    const payload = JSON.stringify(record.raw);
    const version = record.recordVersion || payloadHash;
    const saved = await client.query(
      `INSERT INTO bibliotheque.source_records
         (source_system_id, external_record_id, source_record_version, payload,
          payload_sha256, record_language_code, record_status)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, 'new')
       ON CONFLICT (source_system_id, external_record_id, source_record_version)
       DO UPDATE SET payload = EXCLUDED.payload,
                     payload_sha256 = EXCLUDED.payload_sha256,
                     retrieved_at = now(),
                     record_language_code = EXCLUDED.record_language_code
       RETURNING source_record_id`,
      [sourceSystemId, record.externalRecordId, version, payload, payloadHash, record.language]
    );
    sourceRecordId = saved.rows[0].source_record_id;

    if (!record.title) {
      await client.query(
        "UPDATE bibliotheque.source_records SET record_status = 'review_required' WHERE source_record_id = $1",
        [sourceRecordId]
      );
      await saveImportRecord(client, jobId, sourceRecordId, "review_required", "Titre absent ; payload source conservé, aucun ouvrage créé.");
      await client.query("COMMIT");
      return "review_required";
    }

    const alreadyLinked = await client.query(
      `SELECT 1 FROM bibliotheque.source_record_links
       WHERE source_record_id = $1 LIMIT 1`,
      [sourceRecordId]
    );
    if (alreadyLinked.rows.length) {
      await client.query(
        "UPDATE bibliotheque.source_records SET record_status = 'linked' WHERE source_record_id = $1",
        [sourceRecordId]
      );
      await saveImportRecord(client, jobId, sourceRecordId, "skipped", "Cette version source est déjà liée ; relance idempotente.");
      await client.query("COMMIT");
      return "skipped";
    }

    const previous = await priorLinks(client, sourceSystemId, record.externalRecordId, sourceRecordId);
    if (previous.length) {
      for (const link of previous) {
        if (link.work_id) await saveSourceLink(client, sourceRecordId, "work", link.work_id, "supports");
        if (link.expression_id) await saveSourceLink(client, sourceRecordId, "expression", link.expression_id, "supports");
        if (link.edition_id) await saveSourceLink(client, sourceRecordId, "edition", link.edition_id, "supports");
      }
      await client.query(
        "UPDATE bibliotheque.source_records SET record_status = 'review_required' WHERE source_record_id = $1",
        [sourceRecordId]
      );
      await saveImportRecord(client, jobId, sourceRecordId, "review_required", "Nouvelle version d'un record déjà importé ; la notice canonique n'a pas été modifiée.");
      await client.query("COMMIT");
      return "review_required";
    }

    const matches = await identifierMatches(client, record);
    if (matches.length) {
      for (const match of matches) {
        await saveSourceLink(client, sourceRecordId, "work", match.workId, "same_as", "identifier");
        if (match.editionId) {
          await saveSourceLink(client, sourceRecordId, "edition", match.editionId, "same_as", "identifier");
        }
      }
      await client.query(
        "UPDATE bibliotheque.source_records SET record_status = 'review_required' WHERE source_record_id = $1",
        [sourceRecordId]
      );
      await saveImportRecord(client, jobId, sourceRecordId, "review_required", "ISBN/DOI déjà présent ; rapprochement suggéré, aucune fusion automatique.");
      await client.query("COMMIT");
      return "review_required";
    }

    const workType = record.editors.length && !record.authors.length ? "collective" : "monograph";
    const work = await client.query(
      `INSERT INTO bibliotheque.works (work_type, record_status)
       VALUES ($1, 'provisional') RETURNING work_id`,
      [workType]
    );
    const workId = work.rows[0].work_id;
    const expression = await client.query(
      `INSERT INTO bibliotheque.work_expressions
         (work_id, expression_type, record_status)
       VALUES ($1, 'original', 'provisional') RETURNING expression_id`,
      [workId]
    );
    const expressionId = expression.rows[0].expression_id;

    if (record.language) {
      await client.query(
        `INSERT INTO bibliotheque.expression_languages
           (expression_id, language_code, is_primary, language_role)
         VALUES ($1, $2, TRUE, 'content') ON CONFLICT DO NOTHING`,
        [expressionId, record.language]
      );
    }
    await client.query(
      `INSERT INTO bibliotheque.expression_titles
         (expression_id, language_code, title_type, title_text, normalized_title, is_preferred, sequence_no)
       VALUES ($1, $2, 'preferred', $3, $4, TRUE, 1)`,
      [expressionId, record.language, record.title, normalizeText(record.title)]
    );

    const edition = await client.query(
      `INSERT INTO bibliotheque.editions
         (edition_type, title_statement, publication_year_from,
          publication_year_to, publication_date_display, record_status)
       VALUES ('other', $1, $2, $2, $3, 'provisional')
       RETURNING edition_id`,
      [record.title, record.publicationYear, record.publicationDateDisplay]
    );
    const editionId = edition.rows[0].edition_id;
    await client.query(
      `INSERT INTO bibliotheque.edition_works (edition_id, work_id, content_role, sequence_no)
       VALUES ($1, $2, 'main', 1) ON CONFLICT DO NOTHING`,
      [editionId, workId]
    );
    await client.query(
      `INSERT INTO bibliotheque.edition_expressions (edition_id, work_id, expression_id)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [editionId, workId, expressionId]
    );

    for (const [index, author] of record.authors.entries()) {
      const agentId = await ensureAgent(client, author, "person", record.language);
      if (!agentId) continue;
      await client.query(
        `INSERT INTO bibliotheque.work_agents (work_id, agent_id, role_code, sequence_no)
         VALUES ($1, $2, 'author', $3) ON CONFLICT DO NOTHING`,
        [workId, agentId, index + 1]
      );
      await saveSourceLink(client, sourceRecordId, "agent", agentId);
    }
    for (const [index, editor] of record.editors.entries()) {
      const agentId = await ensureAgent(client, editor, "person", record.language);
      if (!agentId) continue;
      await client.query(
        `INSERT INTO bibliotheque.work_agents (work_id, agent_id, role_code, sequence_no)
         VALUES ($1, $2, 'editor', $3) ON CONFLICT DO NOTHING`,
        [workId, agentId, index + 1]
      );
      await saveSourceLink(client, sourceRecordId, "agent", agentId);
    }
    if (record.publisher) {
      const publisherId = await ensureAgent(client, record.publisher, "corporate_body", record.language);
      if (publisherId) {
        await client.query(
          `INSERT INTO bibliotheque.edition_agents (edition_id, agent_id, role_code, sequence_no)
           VALUES ($1, $2, 'publisher', 1) ON CONFLICT DO NOTHING`,
          [editionId, publisherId]
        );
        await saveSourceLink(client, sourceRecordId, "agent", publisherId);
      }
    }

    for (const isbn of record.isbns) {
      await client.query(
        `INSERT INTO bibliotheque.bibliographic_identifiers
           (scheme_code, identifier_value, normalized_value, edition_id, is_preferred)
         VALUES ('isbn', $1, $1, $2, TRUE)
         ON CONFLICT (scheme_code, normalized_value) DO NOTHING`,
        [isbn, editionId]
      );
    }
    for (const doi of record.dois) {
      await client.query(
        `INSERT INTO bibliotheque.bibliographic_identifiers
           (scheme_code, identifier_value, normalized_value, edition_id, is_preferred)
         VALUES ('doi', $1, $1, $2, TRUE)
         ON CONFLICT (scheme_code, normalized_value) DO NOTHING`,
        [doi, editionId]
      );
    }

    await client.query(
      `INSERT INTO bibliotheque.work_publication_types (work_id, publication_type_code, is_primary)
       VALUES ($1, 'book', TRUE) ON CONFLICT DO NOTHING`,
      [workId]
    );
    for (const [index, discipline] of record.disciplines.entries()) {
      await client.query(
        `INSERT INTO bibliotheque.work_disciplines (work_id, discipline_code, is_primary)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [workId, discipline, index === 0]
      );
    }
    for (const label of record.subjects.slice(0, 30)) {
      const subjectId = await ensureSubject(client, label, record.language);
      if (!subjectId) continue;
      await client.query(
        `INSERT INTO bibliotheque.work_subjects (work_id, subject_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [workId, subjectId]
      );
      await saveSourceLink(client, sourceRecordId, "subject", subjectId);
    }

    await saveSourceLink(client, sourceRecordId, "work", workId);
    await saveSourceLink(client, sourceRecordId, "expression", expressionId);
    await saveSourceLink(client, sourceRecordId, "edition", editionId);

    const outcome = record.issues.length ? "review_required" : "created";
    const detail = record.issues.length
      ? "Notice créée en statut provisional. Contrôles requis : " + record.issues.join(", ")
      : "Notice provisoire créée depuis DOAB ; les droits des fichiers restent à vérifier.";
    await client.query(
      "UPDATE bibliotheque.source_records SET record_status = $2 WHERE source_record_id = $1",
      [sourceRecordId, outcome === "created" ? "linked" : "review_required"]
    );
    await saveImportRecord(client, jobId, sourceRecordId, outcome, detail);
    await client.query("COMMIT");
    return outcome;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (sourceRecordId) {
      await client.query("BEGIN").catch(() => {});
      await saveImportRecord(
        client, jobId, sourceRecordId, "failed",
        error instanceof Error ? error.message.slice(0, 2000) : String(error)
      ).catch(() => {});
      await client.query("COMMIT").catch(() => {});
    }
    process.stderr.write("Import DOAB échoué pour " + (record.externalRecordId ?? "(sans ID)") + ": " +
      (error instanceof Error ? error.message : String(error)) + "\n");
    return "failed";
  } finally {
    client.release();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return help();
  if (!args.input) throw new Error("--input est obligatoire.");

  const payload = JSON.parse(await readFile(args.input, "utf8"));
  const records = normalizeDoabPayload(payload).slice(0, args.max);
  const seen = new Set();
  const unique = records.filter((record) => {
    if (!record.externalRecordId) return true;
    if (seen.has(record.externalRecordId)) return false;
    seen.add(record.externalRecordId);
    return true;
  });

  process.stdout.write(JSON.stringify({
    mode: args.apply ? "apply" : "dry-run",
    source: "doab",
    selected: unique.length,
    records: unique.map((record) => ({
      sourceId: record.externalRecordId,
      title: record.title,
      year: record.publicationYear,
      language: record.language,
      contributors: record.authors.length + record.editors.length,
      isbns: record.isbns.length,
      dois: record.dois.length,
      disciplines: record.disciplines,
      issues: record.issues,
    })),
  }, null, 2) + "\n");

  if (!args.apply) {
    process.stdout.write("Dry-run terminé : aucune connexion ni écriture Neon.\n");
    return;
  }
  const connectionString = process.env.DATABASE_IMPORT_URL;
  if (!connectionString) {
    throw new Error("DATABASE_IMPORT_URL est obligatoire avec --apply. Utilisez le rôle bibliotheque_importer.");
  }

  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString,
    max: 2,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 5000,
    application_name: "bibliotheque-scientifique-doab-import",
  });
  let jobId = null;

  try {
    const preflight = await pool.query(
      `SELECT current_user AS role_name, r.rolsuper, r.rolbypassrls,
              has_schema_privilege(current_user, 'bibliotheque', 'USAGE') AS schema_usage,
              has_table_privilege(current_user, 'bibliotheque.works', 'INSERT') AS can_insert_works,
              has_table_privilege(current_user, 'bibliotheque.user_bookshelves', 'SELECT') AS can_read_user_data,
              has_table_privilege(current_user, 'bibliotheque.rights_statements', 'INSERT') AS can_write_rights
       FROM pg_roles r WHERE r.rolname = current_user`
    );
    const access = preflight.rows[0];
    if (!access || access.role_name !== "bibliotheque_importer" ||
        access.rolsuper || access.rolbypassrls || !access.schema_usage ||
        !access.can_insert_works || access.can_read_user_data || access.can_write_rights) {
      throw new Error("Précontrôle refusé : le rôle doit être bibliotheque_importer, sans BYPASSRLS, sans accès aux coffres et sans écriture des droits.");
    }

    const history = await pool.query(
      "SELECT count(*)::int AS count FROM bibliotheque.schema_migrations WHERE migration_id BETWEEN 1 AND 10"
    );
    if (history.rows[0]?.count !== 10) {
      throw new Error("Le registre des migrations 001 à 010 est incomplet.");
    }
    const source = await pool.query(
      "SELECT source_system_id FROM bibliotheque.source_systems WHERE source_code = 'doab' AND is_active = TRUE"
    );
    if (!source.rows.length) throw new Error("Source DOAB inactive ou non enregistrée.");

    const job = await pool.query(
      `INSERT INTO bibliotheque.import_jobs (source_system_id, job_type, status, parameters)
       VALUES ($1, 'api_sync', 'running', $2::jsonb)
       RETURNING import_job_id`,
      [source.rows[0].source_system_id, JSON.stringify({
        importer: "scripts/import-doab.mjs",
        maxRecords: args.max,
        inputFile: args.input.split(/[\\\\/]/).pop(),
        execution: "manual-pilot",
      })]
    );
    jobId = job.rows[0].import_job_id;

    const totals = { created: 0, review_required: 0, skipped: 0, failed: 0 };
    for (const record of unique) {
      if (!record.externalRecordId) {
        totals.failed += 1;
        process.stderr.write("Notice ignorée : identifiant externe DOAB manquant.\n");
        continue;
      }
      const outcome = await importOne(pool, source.rows[0].source_system_id, jobId, record);
      totals[outcome] += 1;
    }

    const status = totals.failed ? "completed_with_errors" : "completed";
    await pool.query(
      `UPDATE bibliotheque.import_jobs
       SET status = $2, started_at = COALESCE(started_at, created_at),
           completed_at = now(), records_seen = $3,
           records_created = $4, records_updated = 0,
           records_skipped = $5, records_failed = $6
       WHERE import_job_id = $1`,
      [jobId, status, unique.length, totals.created,
        totals.skipped + totals.review_required, totals.failed]
    );
    process.stdout.write(JSON.stringify({ jobId, status, totals }, null, 2) + "\n");
  } catch (error) {
    if (jobId) {
      await pool.query(
        "UPDATE bibliotheque.import_jobs SET status = 'failed', completed_at = now() WHERE import_job_id = $1",
        [jobId]
      ).catch(() => {});
    }
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 1;
});
