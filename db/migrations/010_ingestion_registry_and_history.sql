-- Migration 010: ingestion source registry and migration history.
-- Target: PostgreSQL 17+
-- Dependencies: 001-009.
-- Scope: record verified migration provenance and register approved discovery/import sources.
-- No catalogue records or digital files are imported by this migration.

BEGIN;

CREATE TABLE bibliotheque.schema_migrations (
  migration_id SMALLINT PRIMARY KEY,
  migration_file TEXT NOT NULL UNIQUE,
  git_blob_sha1 CHAR(40) NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verification_method TEXT NOT NULL DEFAULT 'verified_against_live_development_schema',
  notes TEXT,
  CONSTRAINT schema_migrations_id_positive CHECK (migration_id > 0),
  CONSTRAINT schema_migrations_file_nonempty CHECK (length(btrim(migration_file)) > 0),
  CONSTRAINT schema_migrations_sha1_check CHECK (git_blob_sha1 ~ '^[0-9a-f]{40}$'),
  CONSTRAINT schema_migrations_method_nonempty CHECK (length(btrim(verification_method)) > 0)
);

INSERT INTO bibliotheque.schema_migrations
  (migration_id, migration_file, git_blob_sha1, notes)
VALUES
  (1, '001_create_schema.sql', '4483ca2b53e4bc0c1915877dc454d9559ea478bf', 'Verified in isolated Neon development branch.'),
  (2, '002_reference_data.sql', 'ab4c6e177544d9d4c5673f3f5cc9133d4d49d210', 'Includes FR, EN, ES and PT language seeds.'),
  (3, '003_catalog_core.sql', '3e6de9709eeb062840c951073853f9fdee80b81e', 'Core works, expressions, agents and subjects.'),
  (4, '004_editions_and_toc.sql', '542e42cfcff3eb0828a1d995350480d5c5e14420', 'Editions, edition contents and table of contents.'),
  (5, '005_assets_rights_relations.sql', '135c6eb3b578c654ed71f726430685e528b3085b', 'Digital assets, bibliographic identifiers and rights statements.'),
  (6, '006_sources_and_imports.sql', '6a9e9df91bb9e0d3974c44b822f99414cbb631ef', 'Source records, provenance and import jobs.'),
  (7, '007_personal_library.sql', '4515074606fd33d84e9ae0b5788ea79c9b453bdc', 'Private user library and reading progress.'),
  (8, '008_security_and_governance.sql', '52400577c5f4483777ecf0f9c9ea1a7714853524', 'Security, audit, RLS and cycle guards.'),
  (9, '009_catalogue_facets.sql', '58f443f3af4e8997e4d51c76b4324bc9b7ee45e8', 'Multilingual publication type and discipline facets.')
ON CONFLICT (migration_id) DO UPDATE
SET migration_file = EXCLUDED.migration_file,
    git_blob_sha1 = EXCLUDED.git_blob_sha1,
    notes = EXCLUDED.notes,
    verified_at = now();

INSERT INTO bibliotheque.source_systems
  (source_code, display_name, base_url, terms_url, api_policy_url,
   attribution_text, bulk_access_method, permitted_use_note, is_active, policy_checked_at)
VALUES
  (
    'doab',
    'Directory of Open Access Books (DOAB)',
    'https://directory.doabooks.org/rest/search',
    'https://doabooks.org/en/librarians/doab-metadata',
    'https://doabooks.org/en/librarians/doab-metadata',
    'Metadata source: Directory of Open Access Books (DOAB). DOAB states that its directory metadata is available under CC0. This metadata licence does not grant additional rights to the underlying book files.',
    'Selective Export (CSV, optimized for sets up to 500 titles), monthly metadata feeds (MARCXML/KBART), or targeted REST API searches.',
    'Reuse DOAB directory metadata under its stated CC0 terms while retaining the DOAB record identifier, retrieval time, record version and original payload. Never infer a licence for a full-text file from the metadata licence or from the Open Access directory listing. File consultation, download and redistribution require item-level rights evidence.',
    TRUE,
    DATE '2026-11-24'
  ),
  (
    'openlibrary',
    'Open Library',
    'https://openlibrary.org/search.json',
    'https://openlibrary.org/developers/api',
    'https://openlibrary.org/developers/api',
    'Metadata source: Open Library. Consult its current API and data-dump terms before reuse.',
    'Monthly data dumps for bulk access; Web API reserved for low-volume, human-oriented lookup and discovery.',
    'Do not use the Open Library Web API as a bulk metadata backend. Respect its published rate limits, identify the application when making regular requests, cache results, and use the monthly data dumps or a partnership for bulk import.',
    TRUE,
    DATE '2026-11-24'
  )
ON CONFLICT (source_code) DO UPDATE
SET display_name = EXCLUDED.display_name,
    base_url = EXCLUDED.base_url,
    terms_url = EXCLUDED.terms_url,
    api_policy_url = EXCLUDED.api_policy_url,
    attribution_text = EXCLUDED.attribution_text,
    bulk_access_method = EXCLUDED.bulk_access_method,
    permitted_use_note = EXCLUDED.permitted_use_note,
    is_active = EXCLUDED.is_active,
    policy_checked_at = EXCLUDED.policy_checked_at;

COMMENT ON TABLE bibliotheque.schema_migrations IS
  'Registre des migrations vérifiées. git_blob_sha1 identifie exactement le fichier versionné ; les anciennes lignes peuvent avoir été vérifiées après application initiale.';

COMMENT ON TABLE bibliotheque.source_systems IS
  'Sources documentaires enregistrées avec leurs conditions de réutilisation. Les droits des métadonnées et ceux des fichiers sont évalués séparément.';

COMMIT;
