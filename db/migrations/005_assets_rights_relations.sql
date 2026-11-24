-- Migration 005: bibliographic identifiers, digital assets, rights and work relations.
-- Target: PostgreSQL 17+
-- Dependencies: 004_editions_and_toc.sql
-- Rights are declarations, not an automatic grant. Unknown or conflicting
-- rights must never authorize consultation, download or redistribution.

BEGIN;

CREATE TABLE bibliotheque.bibliographic_identifiers (
  bibliographic_identifier_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_code TEXT NOT NULL REFERENCES bibliotheque.identifier_schemes(scheme_code) ON DELETE RESTRICT,
  identifier_value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  work_id UUID REFERENCES bibliotheque.works(work_id) ON DELETE RESTRICT,
  expression_id UUID REFERENCES bibliotheque.work_expressions(expression_id) ON DELETE RESTRICT,
  edition_id UUID REFERENCES bibliotheque.editions(edition_id) ON DELETE RESTRICT,
  digital_asset_id UUID REFERENCES bibliotheque.digital_assets(digital_asset_id) ON DELETE RESTRICT,
  is_preferred BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bibliographic_identifiers_one_target_check
    CHECK (num_nonnulls(work_id, expression_id, edition_id, digital_asset_id) = 1),
  CONSTRAINT bibliographic_identifiers_value_check
    CHECK (length(btrim(identifier_value)) > 0 AND length(btrim(normalized_value)) > 0),
  CONSTRAINT bibliographic_identifiers_scheme_value_unique UNIQUE (scheme_code, normalized_value)
);

CREATE INDEX bibliographic_identifiers_work_idx ON bibliotheque.bibliographic_identifiers(work_id) WHERE work_id IS NOT NULL;
CREATE INDEX bibliographic_identifiers_expression_idx ON bibliotheque.bibliographic_identifiers(expression_id) WHERE expression_id IS NOT NULL;
CREATE INDEX bibliographic_identifiers_edition_idx ON bibliotheque.bibliographic_identifiers(edition_id) WHERE edition_id IS NOT NULL;
CREATE INDEX bibliographic_identifiers_asset_idx ON bibliotheque.bibliographic_identifiers(digital_asset_id) WHERE digital_asset_id IS NOT NULL;

CREATE TABLE bibliotheque.digital_assets (
  digital_asset_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id UUID NOT NULL REFERENCES bibliotheque.editions(edition_id) ON DELETE RESTRICT,
  asset_type TEXT NOT NULL,
  delivery_format TEXT,
  mime_type TEXT,
  language_code TEXT REFERENCES bibliotheque.languages(code) ON DELETE RESTRICT,
  provider_url TEXT,
  storage_bucket TEXT,
  storage_key TEXT,
  file_size_bytes BIGINT,
  checksum_sha256 TEXT,
  checksum_verified_at TIMESTAMPTZ,
  access_status TEXT NOT NULL DEFAULT 'metadata_only',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT digital_assets_type_check CHECK (asset_type IN ('full_text', 'excerpt', 'cover', 'audio', 'supplement', 'other')),
  CONSTRAINT digital_assets_access_status_check CHECK (access_status IN ('metadata_only', 'external_link', 'available', 'withdrawn', 'quarantined')),
  CONSTRAINT digital_assets_size_check CHECK (file_size_bytes IS NULL OR file_size_bytes > 0),
  CONSTRAINT digital_assets_checksum_check CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  CONSTRAINT digital_assets_storage_pair_check CHECK ((storage_bucket IS NULL) = (storage_key IS NULL)),
  CONSTRAINT digital_assets_external_link_check CHECK (access_status <> 'external_link' OR provider_url IS NOT NULL),
  CONSTRAINT digital_assets_available_location_check CHECK (
    access_status NOT IN ('available', 'external_link')
    OR provider_url IS NOT NULL
    OR (storage_bucket IS NOT NULL AND storage_key IS NOT NULL)
  )
);

CREATE INDEX digital_assets_edition_status_idx
  ON bibliotheque.digital_assets(edition_id, access_status);

CREATE TABLE bibliotheque.rights_statements (
  rights_statement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID REFERENCES bibliotheque.works(work_id) ON DELETE RESTRICT,
  expression_id UUID REFERENCES bibliotheque.work_expressions(expression_id) ON DELETE RESTRICT,
  edition_id UUID REFERENCES bibliotheque.editions(edition_id) ON DELETE RESTRICT,
  digital_asset_id UUID REFERENCES bibliotheque.digital_assets(digital_asset_id) ON DELETE RESTRICT,
  consultation_policy TEXT NOT NULL,
  download_policy TEXT NOT NULL,
  redistribution_policy TEXT NOT NULL,
  rights_basis TEXT NOT NULL,
  jurisdiction_code TEXT,
  conditions_text TEXT,
  evidence_uri TEXT,
  evidence_note TEXT,
  verified_by_nexus_user_id TEXT,
  verified_at TIMESTAMPTZ,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rights_statements_one_target_check
    CHECK (num_nonnulls(work_id, expression_id, edition_id, digital_asset_id) = 1),
  CONSTRAINT rights_statements_consultation_check
    CHECK (consultation_policy IN ('allowed', 'prohibited', 'conditional', 'unknown', 'not_applicable')),
  CONSTRAINT rights_statements_download_check
    CHECK (download_policy IN ('allowed', 'prohibited', 'conditional', 'unknown', 'not_applicable')),
  CONSTRAINT rights_statements_redistribution_check
    CHECK (redistribution_policy IN ('allowed', 'prohibited', 'conditional', 'unknown', 'not_applicable')),
  CONSTRAINT rights_statements_basis_check CHECK (length(btrim(rights_basis)) > 0),
  CONSTRAINT rights_statements_validity_check CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from),
  CONSTRAINT rights_statements_allowed_evidence_check CHECK (
    (consultation_policy <> 'allowed' AND download_policy <> 'allowed' AND redistribution_policy <> 'allowed')
    OR (verified_at IS NOT NULL AND (evidence_uri IS NOT NULL OR evidence_note IS NOT NULL))
  ),
  CONSTRAINT rights_statements_conditional_detail_check CHECK (
    (consultation_policy <> 'conditional' AND download_policy <> 'conditional' AND redistribution_policy <> 'conditional')
    OR (conditions_text IS NOT NULL AND length(btrim(conditions_text)) > 0)
  )
);

CREATE INDEX rights_statements_work_idx ON bibliotheque.rights_statements(work_id) WHERE work_id IS NOT NULL;
CREATE INDEX rights_statements_expression_idx ON bibliotheque.rights_statements(expression_id) WHERE expression_id IS NOT NULL;
CREATE INDEX rights_statements_edition_idx ON bibliotheque.rights_statements(edition_id) WHERE edition_id IS NOT NULL;
CREATE INDEX rights_statements_asset_idx ON bibliotheque.rights_statements(digital_asset_id) WHERE digital_asset_id IS NOT NULL;

CREATE TABLE bibliotheque.work_relations (
  work_relation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_work_id UUID NOT NULL REFERENCES bibliotheque.works(work_id) ON DELETE RESTRICT,
  target_work_id UUID NOT NULL REFERENCES bibliotheque.works(work_id) ON DELETE RESTRICT,
  relation_type TEXT NOT NULL,
  relation_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT work_relations_not_self_check CHECK (source_work_id <> target_work_id),
  CONSTRAINT work_relations_type_check CHECK (relation_type IN ('continues', 'preceded_by', 'adaptation_of', 'inspired_by', 'translation_related_to', 'complements', 'related_to', 'other')),
  CONSTRAINT work_relations_unique UNIQUE (source_work_id, target_work_id, relation_type)
);

CREATE INDEX work_relations_target_source_idx
  ON bibliotheque.work_relations(target_work_id, source_work_id);

CREATE TABLE bibliotheque.work_contents (
  parent_work_id UUID NOT NULL REFERENCES bibliotheque.works(work_id) ON DELETE RESTRICT,
  child_work_id UUID NOT NULL REFERENCES bibliotheque.works(work_id) ON DELETE RESTRICT,
  component_role TEXT NOT NULL,
  sequence_no INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (parent_work_id, child_work_id),
  CONSTRAINT work_contents_not_self_check CHECK (parent_work_id <> child_work_id),
  CONSTRAINT work_contents_role_check CHECK (component_role IN ('chapter', 'part', 'volume', 'article', 'contribution', 'appendix', 'other')),
  CONSTRAINT work_contents_sequence_check CHECK (sequence_no > 0)
);

CREATE INDEX work_contents_child_parent_idx
  ON bibliotheque.work_contents(child_work_id, parent_work_id);

COMMENT ON TABLE bibliotheque.rights_statements IS
  'Déclarations de droits documentées. La décision d’accès est prise par le service ; unknown n’autorise jamais une opération.';
COMMENT ON TABLE bibliotheque.digital_assets IS
  'Métadonnées et pointeurs de ressources numériques ; les fichiers binaires sont stockés hors de la base catalogue.';

COMMIT;
