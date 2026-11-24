-- Migration 012: document Open Library discovery API and bulk dump policy.
-- Apply only to Bibliothèque Scientifique's Neon development branch.
-- This changes source policy metadata only; it imports no catalogue records.

BEGIN;

UPDATE bibliotheque.source_systems
SET base_url = 'https://openlibrary.org/search.json',
    terms_url = 'https://openlibrary.org/developers/api',
    api_policy_url = 'https://openlibrary.org/developers/api',
    attribution_text = 'Source bibliographique : Open Library. Conserver les identifiants de Work et Edition séparément, ainsi que la date de collecte et le payload brut. Work et Edition décrivent des niveaux bibliographiques distincts.',
    bulk_access_method = 'API Search JSON uniquement pour de petits lots de découverte ; imports massifs par dumps mensuels officiels Editions et Works, traités en flux sans charger le dump entier en mémoire.',
    permitted_use_note = 'Open Library indique que son API publique est à faible volume et ne doit pas servir à la collecte en masse. Limiter l’API aux requêtes de découverte peu fréquentes, identifier le User-Agent et respecter les limites publiques. Pour les imports massifs, utiliser les dumps mensuels officiels ; résoudre Work et Edition séparément. Les ISBN agrégés d’un Work ne doivent jamais être affectés à une édition arbitraire.',
    policy_checked_at = DATE '2026-11-24'
WHERE source_code = 'openlibrary';

COMMIT;
