# Migrations SQL

Les migrations sont des fichiers SQL immuables, numérotés et appliqués dans l'ordre.

## Règles

- Cible de compatibilité : PostgreSQL 17+.
- Les migrations sont versionnées dans ce dépôt et relues avant exécution.
- Toute migration est d'abord testée sur une branche Neon enfant de `production`.
- Aucune migration de conception n'est exécutée directement sur `production`.
- Utiliser une connexion PostgreSQL directe (non poolée) pour les migrations.
- Ne jamais stocker de mot de passe, de chaîne de connexion ou de secret dans Git.
- Ne pas utiliser `DROP ... CASCADE`.
- Séparer les rôles propriétaires, migration et exécution API ; leur création/configuration relève d'une procédure d'environnement distincte.
- Une migration doit être atomique avec `BEGIN` / `COMMIT` lorsque les opérations PostgreSQL le permettent.
- Après exécution, inspecter les objets créés et exécuter les tests positifs et négatifs associés.

## Ordre prévu

| Fichier | Contenu |
|---|---|
| `001_create_schema.sql` | Création du schéma `bibliotheque` |
| `002_reference_data.sql` | Langues, schémas d'identifiants et référentiels |
| `003_catalog_core.sql` | Œuvres, expressions, agents, contributions et sujets |
| `004_editions_and_toc.sql` | Éditions, œuvres d'édition, expressions et table des matières |
| `005_assets_rights_relations.sql` | Ressources numériques, identifiants, relations et droits |
| `006_sources_and_imports.sql` | Sources, provenance et imports idempotents |
| `007_personal_library.sql` | Coffres, collections, progression et historique |
| `008_security_and_governance.sql` | Rôles métier, audit, privilèges et RLS |
| `009_catalogue_facets.sql` | Référentiels multilingues de types de publication et disciplines |
| `010_ingestion_registry_and_history.sql` | Historique vérifiable des migrations et registre des sources documentaires |
| `011_search.sql` | Recherche multilingue et classement, après validation des parcours |

Les migrations 001 à 010 sont actuellement versionnées sur la branche GitHub `docs/initial-foundation`. Elles couvrent le schéma, les référentiels, le catalogue, les éditions et sommaires, les ressources et droits, les sources et imports, le coffre personnel, la gouvernance et les politiques RLS.

La migration 008 contient aussi des déclencheurs anti-cycle pour les compositions d'œuvres, la hiérarchie des sujets et les tables des matières. La migration 009 de classification ajoute les types de publication et disciplines utilisés par les filtres du catalogue, avec leurs libellés FR/EN/ES/PT. La migration 011 dédiée à la recherche plein texte et au classement reste différée jusqu'à validation des parcours et des critères.

**Les migrations 001 à 010 ont été exécutées et vérifiées sur la branche Neon isolée `schema-development-2026-11-24`.** La branche `production` n'a pas été modifiée. Les contrôles de structure, des rôles, de RLS et des protections anti-cycle sont consignés dans l'historique de développement.
