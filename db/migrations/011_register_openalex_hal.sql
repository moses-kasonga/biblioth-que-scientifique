-- Migration 011: register OpenAlex and HAL as metadata discovery sources.
-- Apply only to the isolated Neon development branch after review.
-- This registers source metadata and policies; it does not import catalogue records.

BEGIN;

INSERT INTO bibliotheque.source_systems
  (source_code, display_name, base_url, terms_url, api_policy_url,
   attribution_text, bulk_access_method, permitted_use_note, is_active, policy_checked_at)
VALUES
  (
    'openalex',
    'OpenAlex',
    'https://api.openalex.org/works',
    'https://openalex.org/terms',
    'https://help.openalex.org/api/',
    'Source bibliographique : OpenAlex. La documentation OpenAlex indique que les données de son corpus sont publiées sous CC0. Conserver l’identifiant OpenAlex, la date de collecte et le payload d’origine.',
    'API REST /works, filtres type:book et publication_year, pages de 1 à 100 notices ; curseur pour les extractions profondes.',
    'Collecter les notices de type book sans exiger open_access.is_oa=true. La présence d’une location ou d’un indicateur Open Access ne constitue pas, à elle seule, une autorisation de télécharger ou redistribuer un fichier tiers. Les droits des ressources restent évalués séparément.',
    TRUE,
    DATE '2026-11-24'
  ),
  (
    'hal',
    'HAL — Archive ouverte',
    'https://api.archives-ouvertes.fr/search/',
    'https://api.archives-ouvertes.fr/docs/search',
    'https://api.archives-ouvertes.fr/docs/search',
    'Source bibliographique : HAL. Conserver l’identifiant HAL, l’URI de la notice, la date de collecte et les mentions de licence présentes dans la notice.',
    'API de recherche Solr JSON, filtre docType_s:OUV, pagination cursorMark triée par docid asc.',
    'Les métadonnées de notice et les fichiers déposés sont deux objets distincts. Conserver les champs de licence comme éléments de preuve, sans inférer une licence globale à partir du dépôt ou de la disponibilité d’un fichier. Vérifier les conditions HAL et les droits au niveau de chaque ressource avant tout accès ou réutilisation.',
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

COMMIT;
