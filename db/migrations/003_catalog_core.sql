-- Migration 003: core catalogue entities, agents, contributions and subjects.
-- Target: PostgreSQL 17+
-- Dependencies: 001_create_schema.sql, 002_reference_data.sql
-- Cycle prevention for hierarchical relations is enforced by the catalogue
-- service in a serialized transaction; a row CHECK cannot detect graph cycles.

BEGIN;

CREATE TABLE bibliotheque.works (
  work_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_type TEXT NOT NULL,
  description TEXT,
  creation_year_from INTEGER,
  creation_year_to INTEGER,
  creation_date_display TEXT,
  record_status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT works_type_check CHECK (work_type IN ('monograph', 'collective', 'reference', 'series', 'component', 'other')),
  CONSTRAINT works_status_check CHECK (record_status IN ('active', 'provisional', 'superseded', 'withdrawn')),
  CONSTRAINT works_year_range_check CHECK (
    (creation_year_from IS NULL OR creation_year_from > 0)
    AND (creation_year_to IS NULL OR creation_year_to > 0)
    AND (creation_year_from IS NULL OR creation_year_to IS NULL OR creation_year_from <= creation_year_to)
  )
);

CREATE TABLE bibliotheque.work_expressions (
  expression_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES bibliotheque.works(work_id) ON DELETE RESTRICT,
  expression_type TEXT NOT NULL,
  description TEXT,
  record_status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT work_expressions_type_check CHECK (expression_type IN ('original', 'translation', 'revision', 'abridgment', 'adaptation', 'other')),
  CONSTRAINT work_expressions_status_check CHECK (record_status IN ('active', 'provisional', 'superseded', 'withdrawn')),
  CONSTRAINT work_expressions_work_expression_unique UNIQUE (work_id, expression_id)
);

CREATE INDEX work_expressions_work_idx ON bibliotheque.work_expressions(work_id);

CREATE TABLE bibliotheque.expression_languages (
  expression_id UUID NOT NULL REFERENCES bibliotheque.work_expressions(expression_id) ON DELETE RESTRICT,
  language_code TEXT NOT NULL REFERENCES bibliotheque.languages(code) ON DELETE RESTRICT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  language_role TEXT NOT NULL DEFAULT 'content',
  PRIMARY KEY (expression_id, language_code),
  CONSTRAINT expression_languages_role_check CHECK (language_role IN ('content', 'original', 'translation', 'parallel', 'summary', 'other'))
);

CREATE UNIQUE INDEX expression_languages_one_primary_idx
  ON bibliotheque.expression_languages(expression_id)
  WHERE is_primary;

CREATE TABLE bibliotheque.expression_titles (
  expression_title_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expression_id UUID NOT NULL REFERENCES bibliotheque.work_expressions(expression_id) ON DELETE RESTRICT,
  language_code TEXT REFERENCES bibliotheque.languages(code) ON DELETE RESTRICT,
  title_type TEXT NOT NULL,
  title_text TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  is_preferred BOOLEAN NOT NULL DEFAULT FALSE,
  sequence_no INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expression_titles_type_check CHECK (title_type IN ('preferred', 'variant', 'parallel', 'translated', 'uniform', 'other')),
  CONSTRAINT expression_titles_text_check CHECK (length(btrim(title_text)) > 0 AND length(btrim(normalized_title)) > 0),
  CONSTRAINT expression_titles_sequence_check CHECK (sequence_no > 0)
);

CREATE INDEX expression_titles_language_normalized_idx
  ON bibliotheque.expression_titles(language_code, normalized_title);
CREATE UNIQUE INDEX expression_titles_one_preferred_idx
  ON bibliotheque.expression_titles(expression_id, COALESCE(language_code, ''))
  WHERE is_preferred;

CREATE TABLE bibliotheque.agents (
  agent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type TEXT NOT NULL,
  description TEXT,
  record_status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agents_type_check CHECK (agent_type IN ('person', 'corporate_body', 'family', 'meeting', 'jurisdiction', 'other')),
  CONSTRAINT agents_status_check CHECK (record_status IN ('active', 'provisional', 'superseded', 'withdrawn'))
);

CREATE TABLE bibliotheque.agent_names (
  agent_name_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES bibliotheque.agents(agent_id) ON DELETE RESTRICT,
  language_code TEXT REFERENCES bibliotheque.languages(code) ON DELETE RESTRICT,
  script_code TEXT,
  name_type TEXT NOT NULL,
  name_text TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  sort_name TEXT,
  is_preferred BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT agent_names_type_check CHECK (name_type IN ('preferred', 'variant', 'authorized', 'transliterated', 'other')),
  CONSTRAINT agent_names_text_check CHECK (length(btrim(name_text)) > 0 AND length(btrim(normalized_name)) > 0)
);

CREATE INDEX agent_names_normalized_idx ON bibliotheque.agent_names(normalized_name);
CREATE UNIQUE INDEX agent_names_one_preferred_idx
  ON bibliotheque.agent_names(agent_id, COALESCE(language_code, ''), name_type)
  WHERE is_preferred;

CREATE TABLE bibliotheque.agent_identifiers (
  agent_identifier_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES bibliotheque.agents(agent_id) ON DELETE RESTRICT,
  scheme_code TEXT NOT NULL REFERENCES bibliotheque.identifier_schemes(scheme_code) ON DELETE RESTRICT,
  identifier_value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  CONSTRAINT agent_identifiers_value_check CHECK (length(btrim(identifier_value)) > 0 AND length(btrim(normalized_value)) > 0),
  CONSTRAINT agent_identifiers_scheme_value_unique UNIQUE (scheme_code, normalized_value)
);

CREATE INDEX agent_identifiers_agent_idx ON bibliotheque.agent_identifiers(agent_id);

CREATE TABLE bibliotheque.work_agents (
  work_id UUID NOT NULL REFERENCES bibliotheque.works(work_id) ON DELETE RESTRICT,
  agent_id UUID NOT NULL REFERENCES bibliotheque.agents(agent_id) ON DELETE RESTRICT,
  role_code TEXT NOT NULL,
  sequence_no INTEGER NOT NULL DEFAULT 1,
  contribution_note TEXT,
  PRIMARY KEY (work_id, agent_id, role_code),
  CONSTRAINT work_agents_role_check CHECK (role_code IN ('author', 'creator', 'compiler', 'editor', 'contributor', 'cartographer', 'other')),
  CONSTRAINT work_agents_sequence_check CHECK (sequence_no > 0)
);

CREATE INDEX work_agents_agent_work_idx ON bibliotheque.work_agents(agent_id, work_id);

CREATE TABLE bibliotheque.expression_agents (
  expression_id UUID NOT NULL REFERENCES bibliotheque.work_expressions(expression_id) ON DELETE RESTRICT,
  agent_id UUID NOT NULL REFERENCES bibliotheque.agents(agent_id) ON DELETE RESTRICT,
  role_code TEXT NOT NULL,
  sequence_no INTEGER NOT NULL DEFAULT 1,
  contribution_note TEXT,
  PRIMARY KEY (expression_id, agent_id, role_code),
  CONSTRAINT expression_agents_role_check CHECK (role_code IN ('translator', 'reviser', 'abridger', 'adapter', 'annotator', 'narrator', 'contributor', 'other')),
  CONSTRAINT expression_agents_sequence_check CHECK (sequence_no > 0)
);

CREATE INDEX expression_agents_agent_expression_idx ON bibliotheque.expression_agents(agent_id, expression_id);

CREATE TABLE bibliotheque.subjects (
  subject_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type TEXT NOT NULL,
  scope_note TEXT,
  record_status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subjects_type_check CHECK (subject_type IN ('concept', 'place', 'event', 'time_period', 'other')),
  CONSTRAINT subjects_status_check CHECK (record_status IN ('active', 'provisional', 'superseded', 'withdrawn'))
);

CREATE TABLE bibliotheque.subject_labels (
  subject_label_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES bibliotheque.subjects(subject_id) ON DELETE RESTRICT,
  language_code TEXT REFERENCES bibliotheque.languages(code) ON DELETE RESTRICT,
  label_type TEXT NOT NULL,
  label_text TEXT NOT NULL,
  normalized_label TEXT NOT NULL,
  is_preferred BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT subject_labels_type_check CHECK (label_type IN ('preferred', 'variant', 'authorized', 'other')),
  CONSTRAINT subject_labels_text_check CHECK (length(btrim(label_text)) > 0 AND length(btrim(normalized_label)) > 0)
);

CREATE INDEX subject_labels_language_normalized_idx
  ON bibliotheque.subject_labels(language_code, normalized_label);
CREATE UNIQUE INDEX subject_labels_one_preferred_idx
  ON bibliotheque.subject_labels(subject_id, COALESCE(language_code, ''))
  WHERE is_preferred;

CREATE TABLE bibliotheque.subject_relations (
  subject_relation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES bibliotheque.subjects(subject_id) ON DELETE RESTRICT,
  related_subject_id UUID NOT NULL REFERENCES bibliotheque.subjects(subject_id) ON DELETE RESTRICT,
  relation_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subject_relations_not_self_check CHECK (subject_id <> related_subject_id),
  CONSTRAINT subject_relations_type_check CHECK (relation_type IN ('broader_than', 'related_to', 'equivalent_to')),
  CONSTRAINT subject_relations_unique UNIQUE (subject_id, related_subject_id, relation_type)
);

CREATE INDEX subject_relations_reverse_idx
  ON bibliotheque.subject_relations(related_subject_id, subject_id);

CREATE TABLE bibliotheque.work_subjects (
  work_id UUID NOT NULL REFERENCES bibliotheque.works(work_id) ON DELETE RESTRICT,
  subject_id UUID NOT NULL REFERENCES bibliotheque.subjects(subject_id) ON DELETE RESTRICT,
  relevance_code TEXT,
  sequence_no INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (work_id, subject_id),
  CONSTRAINT work_subjects_sequence_check CHECK (sequence_no > 0)
);

CREATE INDEX work_subjects_subject_work_idx ON bibliotheque.work_subjects(subject_id, work_id);

COMMIT;
