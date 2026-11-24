-- Migration 006: source registry, provenance and resumable import jobs.
-- Target: PostgreSQL 17+
-- Dependencies: 005_assets_rights_relations.sql

BEGIN;

CREATE TABLE bibliotheque.source_systems (
  source_system_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  base_url TEXT,
  terms_url TEXT,
  api_policy_url TEXT,
  attribution_text TEXT,
  bulk_access_method TEXT,
  permitted_use_note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  policy_checked_at TIMESTAMPTZ,
  CONSTRAINT source_systems_code_nonempty CHECK (length(btrim(source_code)) > 0),
  CONSTRAINT source_systems_name_nonempty CHECK (length(btrim(display_name)) > 0)
);

CREATE TABLE bibliotheque.source_records (
  source_record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system_id UUID NOT NULL REFERENCES bibliotheque.source_systems(source_system_id) ON DELETE RESTRICT,
  external_record_id TEXT NOT NULL,
  source_record_version TEXT NOT NULL DEFAULT 'unknown',
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB NOT NULL,
  payload_sha256 TEXT NOT NULL,
  record_language_code TEXT REFERENCES bibliotheque.languages(code) ON DELETE RESTRICT,
  record_status TEXT NOT NULL DEFAULT 'new',
  CONSTRAINT source_records_external_id_nonempty CHECK (length(btrim(external_record_id)) > 0),
  CONSTRAINT source_records_payload_hash_check CHECK (payload_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  CONSTRAINT source_records_status_check CHECK (record_status IN ('new', 'linked', 'review_required', 'rejected', 'superseded')),
  CONSTRAINT source_records_source_version_unique UNIQUE (source_system_id, external_record_id, source_record_version)
);

CREATE INDEX source_records_source_retrieved_idx
  ON bibliotheque.source_records(source_system_id, retrieved_at DESC);

CREATE TABLE bibliotheque.source_record_links (
  source_record_link_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_record_id UUID NOT NULL REFERENCES bibliotheque.source_records(source_record_id) ON DELETE RESTRICT,
  work_id UUID REFERENCES bibliotheque.works(work_id) ON DELETE RESTRICT,
  expression_id UUID REFERENCES bibliotheque.work_expressions(expression_id) ON DELETE RESTRICT,
  edition_id UUID REFERENCES bibliotheque.editions(edition_id) ON DELETE RESTRICT,
  digital_asset_id UUID REFERENCES bibliotheque.digital_assets(digital_asset_id) ON DELETE RESTRICT,
  agent_id UUID REFERENCES bibliotheque.agents(agent_id) ON DELETE RESTRICT,
  subject_id UUID REFERENCES bibliotheque.subjects(subject_id) ON DELETE RESTRICT,
  link_type TEXT NOT NULL,
  match_method TEXT NOT NULL,
  confidence NUMERIC(4,3),
  reviewed_by_nexus_user_id TEXT,
  reviewed_at TIMESTAMPTZ,
  CONSTRAINT source_record_links_one_target_check
    CHECK (num_nonnulls(work_id, expression_id, edition_id, digital_asset_id, agent_id, subject_id) = 1),
  CONSTRAINT source_record_links_type_check
    CHECK (link_type IN ('describes', 'supports', 'same_as', 'supersedes', 'contradicts', 'related_to')),
  CONSTRAINT source_record_links_method_check
    CHECK (match_method IN ('identifier', 'exact', 'fuzzy', 'manual')),
  CONSTRAINT source_record_links_confidence_check
    CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1)
);

CREATE INDEX source_record_links_source_idx ON bibliotheque.source_record_links(source_record_id);
CREATE INDEX source_record_links_work_idx ON bibliotheque.source_record_links(work_id) WHERE work_id IS NOT NULL;
CREATE INDEX source_record_links_expression_idx ON bibliotheque.source_record_links(expression_id) WHERE expression_id IS NOT NULL;
CREATE INDEX source_record_links_edition_idx ON bibliotheque.source_record_links(edition_id) WHERE edition_id IS NOT NULL;
CREATE INDEX source_record_links_asset_idx ON bibliotheque.source_record_links(digital_asset_id) WHERE digital_asset_id IS NOT NULL;
CREATE INDEX source_record_links_agent_idx ON bibliotheque.source_record_links(agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX source_record_links_subject_idx ON bibliotheque.source_record_links(subject_id) WHERE subject_id IS NOT NULL;

CREATE TABLE bibliotheque.import_jobs (
  import_job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system_id UUID NOT NULL REFERENCES bibliotheque.source_systems(source_system_id) ON DELETE RESTRICT,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  initiated_by_nexus_user_id TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  records_seen BIGINT NOT NULL DEFAULT 0,
  records_created BIGINT NOT NULL DEFAULT 0,
  records_updated BIGINT NOT NULL DEFAULT 0,
  records_skipped BIGINT NOT NULL DEFAULT 0,
  records_failed BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT import_jobs_type_check CHECK (job_type IN ('bulk_dump', 'api_sync', 'manual_upload', 'reconciliation', 'other')),
  CONSTRAINT import_jobs_status_check CHECK (status IN ('queued', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled')),
  CONSTRAINT import_jobs_counters_check CHECK (
    records_seen >= 0 AND records_created >= 0 AND records_updated >= 0
    AND records_skipped >= 0 AND records_failed >= 0
  ),
  CONSTRAINT import_jobs_dates_check CHECK (
    completed_at IS NULL OR (started_at IS NOT NULL AND completed_at >= started_at)
  ),
  CONSTRAINT import_jobs_parameters_object_check CHECK (jsonb_typeof(parameters) = 'object')
);

CREATE INDEX import_jobs_status_created_idx
  ON bibliotheque.import_jobs(status, created_at);

CREATE TABLE bibliotheque.import_records (
  import_record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id UUID NOT NULL REFERENCES bibliotheque.import_jobs(import_job_id) ON DELETE RESTRICT,
  source_record_id UUID NOT NULL REFERENCES bibliotheque.source_records(source_record_id) ON DELETE RESTRICT,
  outcome TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  error_code TEXT,
  error_detail TEXT,
  processed_at TIMESTAMPTZ,
  CONSTRAINT import_records_outcome_check CHECK (outcome IN ('created', 'updated', 'skipped', 'review_required', 'failed')),
  CONSTRAINT import_records_attempt_count_check CHECK (attempt_count > 0),
  CONSTRAINT import_records_job_source_unique UNIQUE (import_job_id, source_record_id)
);

CREATE INDEX import_records_job_outcome_idx
  ON bibliotheque.import_records(import_job_id, outcome);

COMMIT;
