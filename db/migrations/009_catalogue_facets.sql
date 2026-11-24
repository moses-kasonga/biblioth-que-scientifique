-- Migration 009: controlled catalogue facets for publication type and discipline.
-- Target: PostgreSQL 17+
-- Dependencies: 003_catalog_core.sql and 002_reference_data.sql
-- Scope: controlled classification data used by catalogue filters.
-- Full-text and ranked search remain deferred to a later migration.

BEGIN;

CREATE TABLE bibliotheque.publication_types (
  publication_type_code TEXT PRIMARY KEY,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT publication_types_code_check
    CHECK (publication_type_code IN ('book', 'monograph', 'thesis', 'proceedings', 'report', 'article', 'other'))
);

CREATE TABLE bibliotheque.publication_type_labels (
  publication_type_code TEXT NOT NULL
    REFERENCES bibliotheque.publication_types(publication_type_code) ON DELETE RESTRICT,
  language_code TEXT NOT NULL
    REFERENCES bibliotheque.languages(code) ON DELETE RESTRICT,
  label TEXT NOT NULL,
  normalized_label TEXT NOT NULL,
  PRIMARY KEY (publication_type_code, language_code),
  CONSTRAINT publication_type_labels_text_check
    CHECK (length(btrim(label)) > 0 AND length(btrim(normalized_label)) > 0)
);

CREATE TABLE bibliotheque.work_publication_types (
  work_id UUID NOT NULL
    REFERENCES bibliotheque.works(work_id) ON DELETE RESTRICT,
  publication_type_code TEXT NOT NULL
    REFERENCES bibliotheque.publication_types(publication_type_code) ON DELETE RESTRICT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (work_id, publication_type_code)
);

CREATE UNIQUE INDEX work_publication_types_one_primary_idx
  ON bibliotheque.work_publication_types(work_id)
  WHERE is_primary;

CREATE INDEX work_publication_types_type_work_idx
  ON bibliotheque.work_publication_types(publication_type_code, work_id);

CREATE TABLE bibliotheque.disciplines (
  discipline_code TEXT PRIMARY KEY,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT disciplines_code_nonempty_check
    CHECK (length(btrim(discipline_code)) > 0)
);

CREATE TABLE bibliotheque.discipline_labels (
  discipline_code TEXT NOT NULL
    REFERENCES bibliotheque.disciplines(discipline_code) ON DELETE RESTRICT,
  language_code TEXT NOT NULL
    REFERENCES bibliotheque.languages(code) ON DELETE RESTRICT,
  label TEXT NOT NULL,
  normalized_label TEXT NOT NULL,
  PRIMARY KEY (discipline_code, language_code),
  CONSTRAINT discipline_labels_text_check
    CHECK (length(btrim(label)) > 0 AND length(btrim(normalized_label)) > 0)
);

CREATE TABLE bibliotheque.work_disciplines (
  work_id UUID NOT NULL
    REFERENCES bibliotheque.works(work_id) ON DELETE RESTRICT,
  discipline_code TEXT NOT NULL
    REFERENCES bibliotheque.disciplines(discipline_code) ON DELETE RESTRICT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (work_id, discipline_code)
);

CREATE UNIQUE INDEX work_disciplines_one_primary_idx
  ON bibliotheque.work_disciplines(work_id)
  WHERE is_primary;

CREATE INDEX work_disciplines_discipline_work_idx
  ON bibliotheque.work_disciplines(discipline_code, work_id);

INSERT INTO bibliotheque.publication_types (publication_type_code)
VALUES
  ('book'),
  ('monograph'),
  ('thesis'),
  ('proceedings'),
  ('report'),
  ('article'),
  ('other');

INSERT INTO bibliotheque.publication_type_labels
  (publication_type_code, language_code, label, normalized_label)
VALUES
  ('book', 'fr', 'Livre', 'livre'),
  ('book', 'en', 'Book', 'book'),
  ('book', 'es', 'Libro', 'libro'),
  ('book', 'pt', 'Livro', 'livro'),
  ('monograph', 'fr', 'Monographie', 'monographie'),
  ('monograph', 'en', 'Monograph', 'monograph'),
  ('monograph', 'es', 'Monografía', 'monografia'),
  ('monograph', 'pt', 'Monografia', 'monografia'),
  ('thesis', 'fr', 'Thèse', 'these'),
  ('thesis', 'en', 'Thesis', 'thesis'),
  ('thesis', 'es', 'Tesis', 'tesis'),
  ('thesis', 'pt', 'Tese', 'tese'),
  ('proceedings', 'fr', 'Actes de congrès', 'actes de congres'),
  ('proceedings', 'en', 'Conference proceedings', 'conference proceedings'),
  ('proceedings', 'es', 'Actas de congreso', 'actas de congreso'),
  ('proceedings', 'pt', 'Atas de congresso', 'atas de congresso'),
  ('report', 'fr', 'Rapport scientifique', 'rapport scientifique'),
  ('report', 'en', 'Scientific report', 'scientific report'),
  ('report', 'es', 'Informe científico', 'informe cientifico'),
  ('report', 'pt', 'Relatório científico', 'relatorio cientifico'),
  ('article', 'fr', 'Article', 'article'),
  ('article', 'en', 'Article', 'article'),
  ('article', 'es', 'Artículo', 'articulo'),
  ('article', 'pt', 'Artigo', 'artigo'),
  ('other', 'fr', 'Autre', 'autre'),
  ('other', 'en', 'Other', 'other'),
  ('other', 'es', 'Otro', 'otro'),
  ('other', 'pt', 'Outro', 'outro');

INSERT INTO bibliotheque.disciplines (discipline_code)
VALUES
  ('natural'),
  ('math'),
  ('physics'),
  ('chemistry'),
  ('biology'),
  ('medicine'),
  ('computing'),
  ('earth'),
  ('engineering'),
  ('humanities');

INSERT INTO bibliotheque.discipline_labels
  (discipline_code, language_code, label, normalized_label)
VALUES
  ('natural', 'fr', 'Sciences naturelles', 'sciences naturelles'),
  ('natural', 'en', 'Natural sciences', 'natural sciences'),
  ('natural', 'es', 'Ciencias naturales', 'ciencias naturales'),
  ('natural', 'pt', 'Ciências naturais', 'ciencias naturais'),
  ('math', 'fr', 'Mathématiques', 'mathematiques'),
  ('math', 'en', 'Mathematics', 'mathematics'),
  ('math', 'es', 'Matemáticas', 'matematicas'),
  ('math', 'pt', 'Matemática', 'matematica'),
  ('physics', 'fr', 'Physique', 'physique'),
  ('physics', 'en', 'Physics', 'physics'),
  ('physics', 'es', 'Física', 'fisica'),
  ('physics', 'pt', 'Física', 'fisica'),
  ('chemistry', 'fr', 'Chimie', 'chimie'),
  ('chemistry', 'en', 'Chemistry', 'chemistry'),
  ('chemistry', 'es', 'Química', 'quimica'),
  ('chemistry', 'pt', 'Química', 'quimica'),
  ('biology', 'fr', 'Biologie', 'biologie'),
  ('biology', 'en', 'Biology', 'biology'),
  ('biology', 'es', 'Biología', 'biologia'),
  ('biology', 'pt', 'Biologia', 'biologia'),
  ('medicine', 'fr', 'Médecine', 'medecine'),
  ('medicine', 'en', 'Medicine', 'medicine'),
  ('medicine', 'es', 'Medicina', 'medicina'),
  ('medicine', 'pt', 'Medicina', 'medicina'),
  ('computing', 'fr', 'Informatique', 'informatique'),
  ('computing', 'en', 'Computer science', 'computer science'),
  ('computing', 'es', 'Informática', 'informatica'),
  ('computing', 'pt', 'Informática', 'informatica'),
  ('earth', 'fr', 'Sciences de la Terre', 'sciences de la terre'),
  ('earth', 'en', 'Earth sciences', 'earth sciences'),
  ('earth', 'es', 'Ciencias de la Tierra', 'ciencias de la tierra'),
  ('earth', 'pt', 'Ciências da Terra', 'ciencias da terra'),
  ('engineering', 'fr', 'Ingénierie', 'ingenierie'),
  ('engineering', 'en', 'Engineering', 'engineering'),
  ('engineering', 'es', 'Ingeniería', 'ingenieria'),
  ('engineering', 'pt', 'Engenharia', 'engenharia'),
  ('humanities', 'fr', 'Sciences humaines et sociales', 'sciences humaines et sociales'),
  ('humanities', 'en', 'Humanities and social sciences', 'humanities and social sciences'),
  ('humanities', 'es', 'Humanidades y ciencias sociales', 'humanidades y ciencias sociales'),
  ('humanities', 'pt', 'Ciências humanas e sociais', 'ciencias humanas e sociais');

COMMENT ON TABLE bibliotheque.publication_types IS
  'Types de publication utilisés pour les filtres du catalogue ; distincts du type structurel work_type et du format physique edition_type.';

COMMENT ON TABLE bibliotheque.disciplines IS
  'Disciplines scientifiques contrôlées utilisées pour classer et filtrer les œuvres.';

COMMIT;
