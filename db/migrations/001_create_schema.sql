-- Migration 001: create the dedicated application schema.
-- Target: PostgreSQL 17+
-- Scope: schema namespace only. No tables, roles, grants, extensions, or data.
-- Apply through the migration runner as the dedicated migration role.

BEGIN;

CREATE SCHEMA bibliotheque;

COMMENT ON SCHEMA bibliotheque IS
  'Catalogue scientifique numérique. Schéma isolé et portable pour une intégration future à Nexus Science.';

COMMIT;
