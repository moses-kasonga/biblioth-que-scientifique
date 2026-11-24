-- Migration 002: multilingual and identifier reference data.
-- Target: PostgreSQL 17+
-- Dependencies: 001_create_schema.sql
-- Notes: BCP 47 syntax is validated by the ingestion service. This table is
-- intentionally extensible; unknown but valid tags are queued for review.

BEGIN;

CREATE TABLE bibliotheque.languages (
  code TEXT PRIMARY KEY,
  name_native TEXT NOT NULL,
  name_english TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT languages_code_nonempty CHECK (length(btrim(code)) > 0),
  CONSTRAINT languages_name_native_nonempty CHECK (length(btrim(name_native)) > 0)
);

COMMENT ON TABLE bibliotheque.languages IS
  'Référentiel extensible de langues utilisant des balises BCP 47.';
COMMENT ON COLUMN bibliotheque.languages.code IS
  'Balise BCP 47, par exemple fr, en, pt-BR ou pt-PT. Validation syntaxique dans le service.';

INSERT INTO bibliotheque.languages (code, name_native, name_english)
VALUES
  ('fr', 'Français', 'French'),
  ('en', 'English', 'English'),
  ('es', 'Español', 'Spanish'),
  ('pt', 'Português', 'Portuguese');

CREATE TABLE bibliotheque.identifier_schemes (
  scheme_code TEXT PRIMARY KEY,
  scheme_name TEXT NOT NULL,
  identifier_domain TEXT NOT NULL,
  normalization_rule TEXT NOT NULL,
  validation_rule TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT identifier_schemes_code_nonempty CHECK (length(btrim(scheme_code)) > 0),
  CONSTRAINT identifier_schemes_name_nonempty CHECK (length(btrim(scheme_name)) > 0),
  CONSTRAINT identifier_schemes_domain_check
    CHECK (identifier_domain IN ('agent', 'bibliographic'))
);

COMMENT ON TABLE bibliotheque.identifier_schemes IS
  'Schémas d’identifiants externes et règles déclaratives de normalisation/validation.';
COMMENT ON COLUMN bibliotheque.identifier_schemes.normalization_rule IS
  'Description stable de la normalisation appliquée par le service, pas du SQL dynamique.';

INSERT INTO bibliotheque.identifier_schemes
  (scheme_code, scheme_name, identifier_domain, normalization_rule, validation_rule)
VALUES
  ('isbn', 'International Standard Book Number', 'bibliographic',
   'Retirer espaces et tirets ; conserver les chiffres et le X final éventuel.',
   'Valider ISBN-10/ISBN-13, chiffre de contrôle et applicabilité à une édition.'),
  ('doi', 'Digital Object Identifier', 'bibliographic',
   'Normaliser le préfixe DOI sans modifier la valeur source ; comparaison insensible à la casse.',
   'Valider la syntaxe DOI et la cible bibliographique autorisée.'),
  ('oclc', 'OCLC Control Number', 'bibliographic',
   'Retirer les préfixes de présentation et espaces selon la règle du fournisseur.',
   'Valider le format selon la documentation OCLC.'),
  ('lccn', 'Library of Congress Control Number', 'bibliographic',
   'Appliquer la normalisation officielle LCCN en conservant la valeur source.',
   'Valider le format selon la documentation Library of Congress.'),
  ('olid', 'Open Library Identifier', 'bibliographic',
   'Normaliser le préfixe de type d’objet et la casse selon le format OLID.',
   'Valider le préfixe et le format OLID.'),
  ('orcid', 'ORCID iD', 'agent',
   'Retirer URL de présentation et séparateurs ; normaliser en forme canonique.',
   'Valider le format ORCID et son chiffre de contrôle.'),
  ('isni', 'International Standard Name Identifier', 'agent',
   'Retirer séparateurs ; normaliser en forme canonique.',
   'Valider le format ISNI et son chiffre de contrôle.'),
  ('viaf', 'Virtual International Authority File ID', 'agent',
   'Conserver l’identifiant VIAF canonique sans URL de présentation.',
   'Valider selon le format publié par VIAF.');

COMMIT;
