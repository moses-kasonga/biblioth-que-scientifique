-- Migration 004: editions, edition contents and mixed table of contents.
-- Target: PostgreSQL 17+
-- Dependencies: 003_catalog_core.sql

BEGIN;

CREATE TABLE bibliotheque.editions (
  edition_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_type TEXT NOT NULL,
  title_statement TEXT,
  edition_statement TEXT,
  publication_place_text TEXT,
  publication_year_from INTEGER,
  publication_year_to INTEGER,
  publication_date_display TEXT,
  extent_text TEXT,
  physical_details TEXT,
  format_note TEXT,
  record_status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT editions_type_check CHECK (edition_type IN ('print', 'ebook', 'audiobook', 'braille', 'microform', 'manuscript', 'other')),
  CONSTRAINT editions_status_check CHECK (record_status IN ('active', 'provisional', 'superseded', 'withdrawn')),
  CONSTRAINT editions_year_range_check CHECK (
    (publication_year_from IS NULL OR publication_year_from > 0)
    AND (publication_year_to IS NULL OR publication_year_to > 0)
    AND (publication_year_from IS NULL OR publication_year_to IS NULL OR publication_year_from <= publication_year_to)
  )
);

CREATE TABLE bibliotheque.edition_works (
  edition_id UUID NOT NULL REFERENCES bibliotheque.editions(edition_id) ON DELETE RESTRICT,
  work_id UUID NOT NULL REFERENCES bibliotheque.works(work_id) ON DELETE RESTRICT,
  content_role TEXT NOT NULL DEFAULT 'main',
  sequence_no INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (edition_id, work_id),
  CONSTRAINT edition_works_role_check CHECK (content_role IN ('main', 'contribution', 'appendix', 'reference_entry', 'other')),
  CONSTRAINT edition_works_sequence_check CHECK (sequence_no > 0),
  CONSTRAINT edition_works_order_unique UNIQUE (edition_id, sequence_no)
);

CREATE INDEX edition_works_work_edition_idx
  ON bibliotheque.edition_works(work_id, edition_id);

CREATE TABLE bibliotheque.edition_expressions (
  edition_id UUID NOT NULL,
  work_id UUID NOT NULL,
  expression_id UUID NOT NULL,
  PRIMARY KEY (edition_id, work_id, expression_id),
  CONSTRAINT edition_expressions_edition_work_fk
    FOREIGN KEY (edition_id, work_id)
    REFERENCES bibliotheque.edition_works(edition_id, work_id) ON DELETE RESTRICT,
  CONSTRAINT edition_expressions_work_expression_fk
    FOREIGN KEY (work_id, expression_id)
    REFERENCES bibliotheque.work_expressions(work_id, expression_id) ON DELETE RESTRICT
);

CREATE INDEX edition_expressions_expression_idx
  ON bibliotheque.edition_expressions(work_id, expression_id, edition_id);

CREATE TABLE bibliotheque.edition_agents (
  edition_id UUID NOT NULL REFERENCES bibliotheque.editions(edition_id) ON DELETE RESTRICT,
  agent_id UUID NOT NULL REFERENCES bibliotheque.agents(agent_id) ON DELETE RESTRICT,
  role_code TEXT NOT NULL,
  sequence_no INTEGER NOT NULL DEFAULT 1,
  place_text TEXT,
  PRIMARY KEY (edition_id, agent_id, role_code),
  CONSTRAINT edition_agents_role_check CHECK (role_code IN ('publisher', 'distributor', 'manufacturer', 'printer', 'producer', 'other')),
  CONSTRAINT edition_agents_sequence_check CHECK (sequence_no > 0)
);

CREATE INDEX edition_agents_agent_edition_idx
  ON bibliotheque.edition_agents(agent_id, edition_id);

CREATE TABLE bibliotheque.edition_toc_entries (
  entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id UUID NOT NULL REFERENCES bibliotheque.editions(edition_id) ON DELETE RESTRICT,
  parent_entry_id UUID,
  sequence_no INTEGER NOT NULL,
  entry_kind TEXT NOT NULL,
  title_text TEXT NOT NULL,
  language_code TEXT REFERENCES bibliotheque.languages(code) ON DELETE RESTRICT,
  work_id UUID,
  expression_id UUID,
  locator_start TEXT,
  locator_end TEXT,
  CONSTRAINT edition_toc_entries_edition_entry_unique UNIQUE (edition_id, entry_id),
  CONSTRAINT edition_toc_entries_parent_fk
    FOREIGN KEY (edition_id, parent_entry_id)
    REFERENCES bibliotheque.edition_toc_entries(edition_id, entry_id) ON DELETE RESTRICT,
  CONSTRAINT edition_toc_entries_work_fk
    FOREIGN KEY (edition_id, work_id)
    REFERENCES bibliotheque.edition_works(edition_id, work_id) ON DELETE RESTRICT,
  CONSTRAINT edition_toc_entries_expression_fk
    FOREIGN KEY (edition_id, work_id, expression_id)
    REFERENCES bibliotheque.edition_expressions(edition_id, work_id, expression_id) ON DELETE RESTRICT,
  CONSTRAINT edition_toc_entries_kind_check CHECK (entry_kind IN ('work', 'expression', 'section', 'chapter', 'preface', 'appendix', 'index', 'other')),
  CONSTRAINT edition_toc_entries_title_check CHECK (length(btrim(title_text)) > 0),
  CONSTRAINT edition_toc_entries_sequence_check CHECK (sequence_no > 0),
  CONSTRAINT edition_toc_entries_expression_requires_work_check CHECK (expression_id IS NULL OR work_id IS NOT NULL)
);

CREATE UNIQUE INDEX edition_toc_roots_order_idx
  ON bibliotheque.edition_toc_entries(edition_id, sequence_no)
  WHERE parent_entry_id IS NULL;
CREATE UNIQUE INDEX edition_toc_children_order_idx
  ON bibliotheque.edition_toc_entries(edition_id, parent_entry_id, sequence_no)
  WHERE parent_entry_id IS NOT NULL;
CREATE INDEX edition_toc_work_idx
  ON bibliotheque.edition_toc_entries(work_id)
  WHERE work_id IS NOT NULL;

COMMENT ON TABLE bibliotheque.edition_toc_entries IS
  'Sommaire mixte : entrées bibliographiques liées à des œuvres et sections structurelles sans œuvre autonome.';

COMMIT;
