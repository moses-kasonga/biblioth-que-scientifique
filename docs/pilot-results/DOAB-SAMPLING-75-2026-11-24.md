# Échantillonnage DOAB — 75 notices (24 novembre 2026)

## Périmètre

Source : flux JSON bulk officiel DOAB, `https://memo.doabooks.org/file/oapen/DOAB.json`.

Cette opération porte uniquement sur les métadonnées. La licence CC0 concerne les métadonnées du flux, pas automatiquement les fichiers des ouvrages. Aucun PDF, EPUB ou bitstream n'a été demandé ou téléchargé.

Trois échantillons ont été collectés et passés dans l'importateur en mode `dry-run` sur la branche `app/minimal-vercel-foundation` :

| Lot | Offset des notices admissibles | Sélection | Notices brutes examinées | Exclues par filtre de langue | Notices avec anomalie de normalisation |
|---|---:|---:|---:|---:|---:|
| 1 | 0 | 25 | 35 | 10 | 1 |
| 2 | 25 | 25 | 66 | 16 | 0 |
| 3 | 1 000 | 25 | 1 452 | 427 | 0 |
| **Total** | — | **75** | — | — | **1** |

Le filtre linguistique conserve FR, EN, ES et PT ainsi que les notices sans langue pour revue.

## Résultats cumulés

| Contrôle | Résultat |
|---|---:|
| Notices sélectionnées | 75 |
| Identifiants de source DOAB distincts | 75 |
| Identifiants répétés entre les lots | 0 |
| Notices publiées en 2026 | 75 |
| Anglais | 65 |
| Espagnol | 5 |
| Français | 4 |
| Portugais | 1 |
| Notices avec au moins un ISBN exploitable | 75 |
| Notices avec au moins un DOI exploitable | 62 |
| Notices avec anomalie de normalisation signalée | 1 |

Disciplines contrôlées automatiquement : médecine (2), physique (2), mathématiques (2), biologie (1) et sciences naturelles (1). Les autres notices ne reçoivent pas de discipline contrôlée par déduction approximative ; leur classification reste à enrichir à partir de mappings vérifiés.

## Interprétation

Les trois échantillons — offsets 0, 25 et 1 000 — contiennent exclusivement des notices datées de 2026. Cela montre que les zones testées du flux sont dominées par les publications récentes. Cela ne démontre pas que l'ensemble du catalogue DOAB ne contient que des ouvrages de 2026, ni que DOAB couvre à lui seul la période historique 1720–2026.

Conséquence pour le projet : DOAB reste une source intéressante pour les livres scientifiques en accès ouvert et évalués par les pairs, mais il ne suffit pas comme source unique pour constituer le catalogue historique visé. Il faudra évaluer d'autres sources adaptées aux fonds anciens et contemporains, sans confondre notices bibliographiques, fichiers numériques disponibles et droits de réutilisation.

## Fiabilité du collecteur

Le premier essai à l'offset 1 000 a révélé un défaut dans la gestion des antislashs échappés JSON. Le lecteur pouvait mal interpréter certains caractères structurels dans une chaîne contenant des guillemets échappés.

Correction appliquée dans `scripts/doab-json-feed-core.mjs`, avec un test de régression dans `scripts/doab-json-feed-core.test.mjs` couvrant les guillemets échappés, les accolades dans une chaîne et les antislashs. Le nouvel essai à l'offset 1 000 a ensuite réussi.

Validation CI du commit `b6195ac63ea7df75816ee4d1a832c3b0014f56a6` :
- 16 tests réussis, 0 échec ;
- vérification TypeScript réussie ;
- build Next.js réussi ;
- collecte et importateur `dry-run` réussis pour le lot à l'offset 1 000.

## Sécurité et état de la base

L'importateur a tourné avec `--dry-run`. Les journaux confirment qu'il n'a ouvert aucune connexion Neon et n'a effectué aucune écriture.

Contrôle en lecture seule de la branche Neon de développement `schema-development-2026-11-24` après les trois lots :

| Table | Enregistrements |
|---|---:|
| `bibliotheque.import_jobs` | 0 |
| `bibliotheque.source_records` | 0 |
| `bibliotheque.works` | 0 |
| `bibliotheque.digital_assets` | 0 |
| `bibliotheque.rights_statements` | 0 |

Aucun changement n'a été appliqué à la branche Neon de production, à la branche GitHub `main`, ni au projet parent Nexus Science.

## Exécutions et artefacts

- Lot 1 — [GitHub Actions](https://github.com/moses-kasonga/biblioth-que-scientifique/actions/runs/45376921641) · [artefact](https://github.com/moses-kasonga/biblioth-que-scientifique/actions/runs/45376921641/artifacts/14910689847)
- Lot 2 — [GitHub Actions](https://github.com/moses-kasonga/biblioth-que-scientifique/actions/runs/45380288568) · [artefact](https://github.com/moses-kasonga/biblioth-que-scientifique/actions/runs/45380288568/artifacts/14913556130)
- Lot 3 — [GitHub Actions](https://github.com/moses-kasonga/biblioth-que-scientifique/actions/runs/45380830612) · [artefact](https://github.com/moses-kasonga/biblioth-que-scientifique/actions/runs/45380830612/artifacts/14912469222)
- Validation code — [GitHub Actions](https://github.com/moses-kasonga/biblioth-que-scientifique/actions/runs/45380830651)

Les artefacts temporaires de ces exécutions sont conservés par GitHub jusqu'au 1er décembre 2026.
