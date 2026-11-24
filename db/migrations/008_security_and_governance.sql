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


-- Transaction-scoped graph guards. Advisory locks serialize concurrent writes
-- to each graph so two simultaneous edges cannot jointly introduce a cycle.
CREATE FUNCTION bibliotheque.prevent_work_contents_cycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, bibliotheque
AS $function$
DECLARE
  creates_cycle BOOLEAN;
  exclude_old_edge BOOLEAN := FALSE;
  old_parent_work_id UUID;
  old_child_work_id UUID;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('bibliotheque.work_contents.graph', 0)
  );

  IF TG_OP = 'UPDATE' THEN
    exclude_old_edge := TRUE;
    old_parent_work_id := OLD.parent_work_id;
    old_child_work_id := OLD.child_work_id;
  END IF;

  WITH RECURSIVE reachable(node_id) AS (
    SELECT NEW.child_work_id
    UNION
    SELECT wc.child_work_id
    FROM bibliotheque.work_contents AS wc
    JOIN reachable AS r ON wc.parent_work_id = r.node_id
    WHERE NOT exclude_old_edge
       OR (wc.parent_work_id, wc.child_work_id)
          IS DISTINCT FROM (old_parent_work_id, old_child_work_id)
  )
  SELECT EXISTS (
    SELECT 1 FROM reachable WHERE node_id = NEW.parent_work_id
  ) INTO creates_cycle;

  IF creates_cycle THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'work_contents cycle detected';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER work_contents_prevent_cycle
BEFORE INSERT OR UPDATE OF parent_work_id, child_work_id
ON bibliotheque.work_contents
FOR EACH ROW EXECUTE FUNCTION bibliotheque.prevent_work_contents_cycle();

CREATE FUNCTION bibliotheque.prevent_subject_hierarchy_cycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, bibliotheque
AS $function$
DECLARE
  creates_cycle BOOLEAN;
  exclude_old_edge BOOLEAN := FALSE;
  old_subject_id UUID;
  old_related_subject_id UUID;
  old_relation_type TEXT;
BEGIN
  IF NEW.relation_type <> 'broader_than' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('bibliotheque.subject_hierarchy.graph', 0)
  );

  IF TG_OP = 'UPDATE' THEN
    exclude_old_edge := TRUE;
    old_subject_id := OLD.subject_id;
    old_related_subject_id := OLD.related_subject_id;
    old_relation_type := OLD.relation_type;
  END IF;

  WITH RECURSIVE reachable(node_id) AS (
    SELECT NEW.related_subject_id
    UNION
    SELECT sr.related_subject_id
    FROM bibliotheque.subject_relations AS sr
    JOIN reachable AS r ON sr.subject_id = r.node_id
    WHERE sr.relation_type = 'broader_than'
      AND (
        NOT exclude_old_edge
        OR (sr.subject_id, sr.related_subject_id, sr.relation_type)
           IS DISTINCT FROM (old_subject_id, old_related_subject_id, old_relation_type)
      )
  )
  SELECT EXISTS (
    SELECT 1 FROM reachable WHERE node_id = NEW.subject_id
  ) INTO creates_cycle;

  IF creates_cycle THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'subject hierarchy cycle detected';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER subject_relations_prevent_hierarchy_cycle
BEFORE INSERT OR UPDATE OF subject_id, related_subject_id, relation_type
ON bibliotheque.subject_relations
FOR EACH ROW EXECUTE FUNCTION bibliotheque.prevent_subject_hierarchy_cycle();

CREATE FUNCTION bibliotheque.prevent_edition_toc_cycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, bibliotheque
AS $function$
DECLARE
  creates_cycle BOOLEAN;
  exclude_old_edge BOOLEAN := FALSE;
  old_edition_id UUID;
  old_entry_id UUID;
  old_parent_entry_id UUID;
BEGIN
  IF NEW.parent_entry_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_entry_id = NEW.entry_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'edition table-of-contents entry cannot parent itself';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('bibliotheque.edition_toc:' || NEW.edition_id::text, 0)
  );

  IF TG_OP = 'UPDATE' THEN
    exclude_old_edge := TRUE;
    old_edition_id := OLD.edition_id;
    old_entry_id := OLD.entry_id;
    old_parent_entry_id := OLD.parent_entry_id;
  END IF;

  WITH RECURSIVE reachable(node_id) AS (
    SELECT NEW.entry_id
    UNION
    SELECT toc.entry_id
    FROM bibliotheque.edition_toc_entries AS toc
    JOIN reachable AS r
      ON toc.edition_id = NEW.edition_id
     AND toc.parent_entry_id = r.node_id
    WHERE NOT exclude_old_edge
       OR (toc.edition_id, toc.entry_id, toc.parent_entry_id)
          IS DISTINCT FROM (old_edition_id, old_entry_id, old_parent_entry_id)
  )
  SELECT EXISTS (
    SELECT 1 FROM reachable WHERE node_id = NEW.parent_entry_id
  ) INTO creates_cycle;

  IF creates_cycle THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'edition table-of-contents cycle detected';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER edition_toc_entries_prevent_cycle
BEFORE INSERT OR UPDATE OF edition_id, entry_id, parent_entry_id
ON bibliotheque.edition_toc_entries
FOR EACH ROW EXECUTE FUNCTION bibliotheque.prevent_edition_toc_cycle();

REVOKE ALL ON FUNCTION bibliotheque.prevent_work_contents_cycle() FROM PUBLIC;
REVOKE ALL ON FUNCTION bibliotheque.prevent_subject_hierarchy_cycle() FROM PUBLIC;
REVOKE ALL ON FUNCTION bibliotheque.prevent_edition_toc_cycle() FROM PUBLIC;

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
