-- Migration 008: catalogue governance, audit and row-level security.
-- Target: PostgreSQL 17+
-- Dependencies: 007_personal_library.sql
--
-- SECURITY CONTRACT:
-- The trusted server validates the Nexus Science token first, then sets
-- bibliotheque.nexus_user_id transaction-locally (SET LOCAL / set_config(..., true)).
-- This GUC is NOT a token validator. End users must never receive DB credentials.
-- The runtime SQL role must not own these tables and must not have BYPASSRLS.

BEGIN;

CREATE TABLE bibliotheque.catalog_role_assignments (
  assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nexus_user_id TEXT NOT NULL,
  role_code TEXT NOT NULL,
  assigned_by_nexus_user_id TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  CONSTRAINT catalog_role_assignments_user_nonempty CHECK (length(btrim(nexus_user_id)) > 0),
  CONSTRAINT catalog_role_assignments_assigner_nonempty CHECK (length(btrim(assigned_by_nexus_user_id)) > 0),
  CONSTRAINT catalog_role_assignments_role_check CHECK (role_code IN ('catalog_admin', 'catalog_editor', 'catalog_importer', 'rights_reviewer')),
  CONSTRAINT catalog_role_assignments_dates_check CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE UNIQUE INDEX catalog_role_assignments_one_active_idx
  ON bibliotheque.catalog_role_assignments(nexus_user_id, role_code)
  WHERE is_active;
CREATE INDEX catalog_role_assignments_role_active_idx
  ON bibliotheque.catalog_role_assignments(role_code, is_active, starts_at, ends_at);

CREATE TABLE bibliotheque.catalog_audit_events (
  audit_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_nexus_user_id TEXT,
  action_code TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  before_values JSONB,
  after_values JSONB,
  request_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT catalog_audit_events_action_nonempty CHECK (length(btrim(action_code)) > 0),
  CONSTRAINT catalog_audit_events_target_type_check
    CHECK (target_type IN ('work', 'expression', 'edition', 'agent', 'subject', 'digital_asset', 'rights_statement', 'source_record', 'role_assignment', 'other')),
  CONSTRAINT catalog_audit_events_before_object_check
    CHECK (before_values IS NULL OR jsonb_typeof(before_values) = 'object'),
  CONSTRAINT catalog_audit_events_after_object_check
    CHECK (after_values IS NULL OR jsonb_typeof(after_values) = 'object')
);

CREATE INDEX catalog_audit_events_target_time_idx
  ON bibliotheque.catalog_audit_events(target_type, target_id, occurred_at DESC);
CREATE INDEX catalog_audit_events_actor_time_idx
  ON bibliotheque.catalog_audit_events(actor_nexus_user_id, occurred_at DESC);

CREATE FUNCTION bibliotheque.current_nexus_user_id()
RETURNS TEXT
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
  SELECT NULLIF(pg_catalog.current_setting('bibliotheque.nexus_user_id', true), '');
$function$;

COMMENT ON FUNCTION bibliotheque.current_nexus_user_id() IS
  'Retourne l’identifiant Nexus validé injecté transactionnellement par le serveur de confiance ; ne valide aucun jeton.';

ALTER TABLE bibliotheque.user_bookshelves ENABLE ROW LEVEL SECURITY;
ALTER TABLE bibliotheque.user_bookshelves FORCE ROW LEVEL SECURITY;
CREATE POLICY user_bookshelves_isolation
  ON bibliotheque.user_bookshelves
  FOR ALL
  USING (nexus_user_id = bibliotheque.current_nexus_user_id())
  WITH CHECK (nexus_user_id = bibliotheque.current_nexus_user_id());

ALTER TABLE bibliotheque.user_book_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bibliotheque.user_book_items FORCE ROW LEVEL SECURITY;
CREATE POLICY user_book_items_isolation
  ON bibliotheque.user_book_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM bibliotheque.user_bookshelves AS s
      WHERE s.bookshelf_id = user_book_items.bookshelf_id
        AND s.nexus_user_id = bibliotheque.current_nexus_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM bibliotheque.user_bookshelves AS s
      WHERE s.bookshelf_id = user_book_items.bookshelf_id
        AND s.nexus_user_id = bibliotheque.current_nexus_user_id()
    )
  );

ALTER TABLE bibliotheque.user_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE bibliotheque.user_collections FORCE ROW LEVEL SECURITY;
CREATE POLICY user_collections_isolation
  ON bibliotheque.user_collections
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM bibliotheque.user_bookshelves AS s
      WHERE s.bookshelf_id = user_collections.bookshelf_id
        AND s.nexus_user_id = bibliotheque.current_nexus_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM bibliotheque.user_bookshelves AS s
      WHERE s.bookshelf_id = user_collections.bookshelf_id
        AND s.nexus_user_id = bibliotheque.current_nexus_user_id()
    )
  );

ALTER TABLE bibliotheque.user_collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bibliotheque.user_collection_items FORCE ROW LEVEL SECURITY;
CREATE POLICY user_collection_items_isolation
  ON bibliotheque.user_collection_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM bibliotheque.user_bookshelves AS s
      WHERE s.bookshelf_id = user_collection_items.bookshelf_id
        AND s.nexus_user_id = bibliotheque.current_nexus_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM bibliotheque.user_bookshelves AS s
      WHERE s.bookshelf_id = user_collection_items.bookshelf_id
        AND s.nexus_user_id = bibliotheque.current_nexus_user_id()
    )
  );

ALTER TABLE bibliotheque.user_reading_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE bibliotheque.user_reading_progress FORCE ROW LEVEL SECURITY;
CREATE POLICY user_reading_progress_isolation
  ON bibliotheque.user_reading_progress
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM bibliotheque.user_bookshelves AS s
      WHERE s.bookshelf_id = user_reading_progress.bookshelf_id
        AND s.nexus_user_id = bibliotheque.current_nexus_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM bibliotheque.user_bookshelves AS s
      WHERE s.bookshelf_id = user_reading_progress.bookshelf_id
        AND s.nexus_user_id = bibliotheque.current_nexus_user_id()
    )
  );

ALTER TABLE bibliotheque.user_reading_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE bibliotheque.user_reading_history FORCE ROW LEVEL SECURITY;
CREATE POLICY user_reading_history_isolation
  ON bibliotheque.user_reading_history
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM bibliotheque.user_bookshelves AS s
      WHERE s.bookshelf_id = user_reading_history.bookshelf_id
        AND s.nexus_user_id = bibliotheque.current_nexus_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM bibliotheque.user_bookshelves AS s
      WHERE s.bookshelf_id = user_reading_history.bookshelf_id
        AND s.nexus_user_id = bibliotheque.current_nexus_user_id()
    )
  );

COMMENT ON TABLE bibliotheque.catalog_role_assignments IS
  'Rôles métier rattachés à un identifiant Nexus validé ; aucune identité locale.';
COMMENT ON TABLE bibliotheque.catalog_audit_events IS
  'Journal des opérations de gouvernance ; ne jamais y copier de jetons, secrets ou données privées de lecture.';

COMMIT;
