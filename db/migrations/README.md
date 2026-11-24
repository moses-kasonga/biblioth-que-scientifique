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
| `009_search.sql` | Recherche multilingue après validation des parcours |

La migration 001 ne crée que le namespace. Les migrations suivantes seront ajoutées après revue du contrat de colonnes et des contraintes composites du dossier d'audit v0.3.
