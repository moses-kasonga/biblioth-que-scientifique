# Pilote OpenAlex + HAL — 50 notices (24 novembre 2026)

## Périmètre et mode

Deux collecteurs officiels ont été exécutés depuis GitHub Actions sur la branche `app/minimal-vercel-foundation` :

- OpenAlex : `type:book`, années 1720–2026, première page, 25 notices.
- HAL : `docType_s:OUV`, années 1720–2026, tri `docid asc`, première page, 25 notices.

Les deux lots ont été normalisés et passés dans l'importateur commun avec `--dry-run`. Les commandes n'ont ouvert aucune connexion Neon. Aucun PDF, EPUB ou autre fichier intégral n'a été demandé.

Ce pilote est un test technique ciblé, pas un échantillon statistiquement représentatif des deux corpus : OpenAlex renvoie sa première page selon son classement par défaut, HAL commence par les identifiants de documents triés.

## Résultats du lot corrigé

| Contrôle | OpenAlex | HAL |
|---|---:|---:|
| Notices sélectionnées | 25 | 25 |
| Identifiants source distincts | 25 | 25 |
| Identifiants source répétés | 0 | 0 |
| Année minimale observée | 1965 | 2002 |
| Année maximale observée | 2014 | 2014 |
| Année absente ou hors périmètre | 0 | 0 |
| Langues | EN 24, indéterminée 1 | FR 16, EN 9 |
| Titres absents | 0 | 0 |
| Contributeurs absents | 0 | 0 |
| Notices signalées pour revue | 1 | 0 |
| Notices avec au moins un ISBN validé | 0 | 12 |
| Notices avec au moins un DOI validé | 15 | 1 |
| Valeurs ISBN répétées dans le lot | 0 | 0 |
| Valeurs DOI répétées dans le lot | 0 | 0 |

### Anomalie OpenAlex conservée pour revue

- ID source : `W4233654598`
- Titre : *Governing the Commons: The Evolution of Institutions for Collective Action*
- Année : 1990
- Cause : langue absente ou non prise en charge.
- Décision : conserver la langue à `null` et la notice en revue ; aucune langue n'est inventée.

### Correction HAL appliquée

Le premier lot avait signalé à tort une notice HAL parce que le champ `isbn_s` renvoyait deux ISBN valides dans une même chaîne séparée par une virgule. Le normaliseur les traitait comme un identifiant unique concaténé.

Le correctif sépare maintenant les ISBN multiples délimités par virgule ou point-virgule. Un test de régression couvre précisément ce format. Le lot relancé donne 12 notices avec ISBN validé et zéro anomalie de normalisation.

## Rapprochement OpenAlex ↔ HAL

Aucune valeur ISBN ni DOI commune n'a été détectée entre ces deux petits lots.

Cela signifie uniquement qu'aucune correspondance n'a été trouvée par ces identifiants dans les 50 notices examinées. Ce résultat ne prouve pas l'absence de doublons dans les catalogues complets : OpenAlex ne fournit aucun ISBN sur ces 25 notices et tous les livres ne possèdent pas nécessairement un DOI. Aucun rapprochement automatique ou fusion n'est effectué.

## Volumes annoncés par les API au moment du test

| Source | Filtre | Résultats correspondants annoncés |
|---|---|---:|
| OpenAlex | `type:book`, publication_year 1720–2026 | 6 684 271 |
| HAL | `docType_s:OUV`, producedDateY_i 1720–2026 | 127 209 |

Ces compteurs API ne sont pas directement comparables : les définitions de notice, les identifiants et les règles de couverture diffèrent. Ils ne représentent pas le nombre de livres uniques validés dans Bibliothèque Scientifique.

## État Neon après la migration 011

Migration appliquée à la seule branche de développement :

- Projet : `lucky-shape-21861035`
- Branche : `schema-development-2026-11-24`
- Migration : `011_register_openalex_hal.sql`
- Historique : migrations 001 à 011 enregistrées.
- Sources actives : `doab`, `openlibrary`, `openalex`, `hal`.

Contrôle postérieur au pilote, en lecture seule :

| Table | Lignes |
|---|---:|
| `bibliotheque.import_jobs` | 0 |
| `bibliotheque.source_records` | 0 |
| `bibliotheque.works` | 0 |
| `bibliotheque.digital_assets` | 0 |
| `bibliotheque.rights_statements` | 0 |

La migration n'a fait qu'enregistrer deux sources et leur historique. Aucune notice du pilote n'a été insérée dans le catalogue. La branche Neon de production, GitHub `main` et le projet Nexus Science parent n'ont pas été modifiés.

## Validation technique

- Pilote de 25 + 25 notices — [GitHub Actions](https://github.com/moses-kasonga/biblioth-que-scientifique/actions/runs/45396269178) — succès.
- Vérification TypeScript et build Next.js — [GitHub Actions](https://github.com/moses-kasonga/biblioth-que-scientifique/actions/runs/45396269093) — succès.
- Commit du correctif HAL : `09e2f14b9dab2120375cfb17b35a175aa2d0263e`.

L'artefact contenant les deux lots bruts, les sorties dry-run et le rapport JSON reste conservé par GitHub jusqu'au 1er décembre 2026 : [artefact du pilote](https://github.com/moses-kasonga/biblioth-que-scientifique/actions/runs/45396269178/artifacts/14921795481).

## Décision

Les connecteurs OpenAlex et HAL sont validés pour la collecte et la normalisation en mode test. Avant tout import réel, il reste à :

1. Examiner manuellement l'enregistrement OpenAlex sans langue.
2. Faire des échantillons séparés par période historique et par langue, car les premières pages ne couvrent ici que 1965–2014.
3. Étudier la couverture ISBN/DOI et les règles de rapprochement sur des lots plus grands.
4. Exécuter séparément le protocole PVI-001 après une éventuelle première insertion explicitement approuvée.

Aucune insertion réelle n'est autorisée par ce rapport.
