-- Migration 007: private user bookshelves, collections and reading state.
-- Target: PostgreSQL 17+
-- Dependencies: 006_sources_and_imports.sql
-- No local authentication is created. nexus_user_id is supplied only by the
-- trusted server after validating the central Nexus Science identity token.

BEGIN;

CREATE TABLE bibliotheque.user_bookshelves (
  bookshelf_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nexus_user_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_bookshelves_nexus_id_nonempty CHECK (length(btrim(nexus_user_id)) > 0)
);

CREATE TABLE bibliotheque.user_book_items (
  bookshelf_id UUID NOT NULL REFERENCES bibliotheque.user_bookshelves(bookshelf_id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES bibliotheque.works(work_id) ON DELETE RESTRICT,
  preferred_edition_id UUID,
  shelf_status TEXT NOT NULL DEFAULT 'to_read',
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  personal_rating SMALLINT,
  personal_note TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bookshelf_id, work_id),
  CONSTRAINT user_book_items_preferred_edition_fk
    FOREIGN KEY (preferred_edition_id, work_id)
    REFERENCES bibliotheque.edition_works(edition_id, work_id) ON DELETE RESTRICT,
  CONSTRAINT user_book_items_status_check CHECK (shelf_status IN ('to_read', 'reading', 'completed', 'on_hold', 'abandoned')),
  CONSTRAINT user_book_items_rating_check CHECK (personal_rating IS NULL OR personal_rating BETWEEN 1 AND 5)
);

CREATE INDEX user_book_items_work_idx ON bibliotheque.user_book_items(work_id);

CREATE TABLE bibliotheque.user_collections (
  collection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bookshelf_id UUID NOT NULL REFERENCES bibliotheque.user_bookshelves(bookshelf_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_collections_name_check CHECK (length(btrim(name)) > 0 AND length(btrim(normalized_name)) > 0),
  CONSTRAINT user_collections_shelf_collection_unique UNIQUE (bookshelf_id, collection_id),
  CONSTRAINT user_collections_name_unique UNIQUE (bookshelf_id, normalized_name)
);

CREATE TABLE bibliotheque.user_collection_items (
  bookshelf_id UUID NOT NULL,
  collection_id UUID NOT NULL,
  work_id UUID NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, work_id),
  CONSTRAINT user_collection_items_collection_fk
    FOREIGN KEY (bookshelf_id, collection_id)
    REFERENCES bibliotheque.user_collections(bookshelf_id, collection_id) ON DELETE CASCADE,
  CONSTRAINT user_collection_items_book_fk
    FOREIGN KEY (bookshelf_id, work_id)
    REFERENCES bibliotheque.user_book_items(bookshelf_id, work_id) ON DELETE CASCADE
);

CREATE INDEX user_collection_items_shelf_work_idx
  ON bibliotheque.user_collection_items(bookshelf_id, work_id);

CREATE TABLE bibliotheque.user_reading_progress (
  progress_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bookshelf_id UUID NOT NULL REFERENCES bibliotheque.user_bookshelves(bookshelf_id) ON DELETE CASCADE,
  digital_asset_id UUID NOT NULL REFERENCES bibliotheque.digital_assets(digital_asset_id) ON DELETE RESTRICT,
  position JSONB NOT NULL,
  position_schema_version INTEGER NOT NULL DEFAULT 1,
  progress_percent NUMERIC(5,2),
  last_locator TEXT,
  revision_number BIGINT NOT NULL DEFAULT 1,
  last_read_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_reading_progress_unique UNIQUE (bookshelf_id, digital_asset_id),
  CONSTRAINT user_reading_progress_position_object_check CHECK (jsonb_typeof(position) = 'object'),
  CONSTRAINT user_reading_progress_version_check CHECK (position_schema_version > 0),
  CONSTRAINT user_reading_progress_percent_check CHECK (progress_percent IS NULL OR progress_percent BETWEEN 0 AND 100),
  CONSTRAINT user_reading_progress_revision_check CHECK (revision_number > 0)
);

CREATE INDEX user_reading_progress_asset_idx
  ON bibliotheque.user_reading_progress(digital_asset_id);

CREATE TABLE bibliotheque.user_reading_history (
  reading_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bookshelf_id UUID NOT NULL REFERENCES bibliotheque.user_bookshelves(bookshelf_id) ON DELETE CASCADE,
  digital_asset_id UUID REFERENCES bibliotheque.digital_assets(digital_asset_id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  position_snapshot JSONB,
  event_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_reading_history_event_type_check CHECK (event_type IN ('opened', 'progress_saved', 'completed', 'reopened', 'downloaded', 'other')),
  CONSTRAINT user_reading_history_details_object_check CHECK (jsonb_typeof(event_details) = 'object'),
  CONSTRAINT user_reading_history_position_object_check CHECK (position_snapshot IS NULL OR jsonb_typeof(position_snapshot) = 'object')
);

CREATE INDEX user_reading_history_shelf_time_idx
  ON bibliotheque.user_reading_history(bookshelf_id, occurred_at DESC);
CREATE INDEX user_reading_history_shelf_asset_time_idx
  ON bibliotheque.user_reading_history(bookshelf_id, digital_asset_id, occurred_at DESC);

COMMENT ON TABLE bibliotheque.user_book_items IS
  'Une seule entrée par œuvre et par coffre ; l’édition préférée est optionnelle.';
COMMENT ON TABLE bibliotheque.user_reading_progress IS
  'Une position de lecture indépendante par ressource numérique et par coffre.';

COMMIT;
