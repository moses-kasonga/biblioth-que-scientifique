# Couverture historique — OpenAlex, HAL et Open Library

**Date d'exécution :** 24 novembre 2026  
**Branche applicative :** `app/minimal-vercel-foundation`  
**Mode :** collecte externe + normalisation en `dry-run` ; aucune connexion à Neon  
**Fenêtres :** 1720–1899, 1900–1949, 1950–1999, 2000–2026

## Résultat global

| Source | Notices testées | Identifiants distincts | Doublons entre fenêtres | Résultats annoncés par l'API sur les 4 fenêtres |
|---|---:|---:|---:|---:|
| OpenAlex | 100 | 100 | 0 | 6 684 271 |
| HAL | 100 | 100 | 0 | 127 211 |
| Open Library | 100 | 100 | 0 | 578 430 |
| **Total** | **300** | **300** | **0** | **non additionnable** |

Les volumes sont des compteurs de recherche propres à chaque source et à chaque type de notice. Ils ne représentent pas 7,4 millions de livres uniques dans Bibliothèque Scientifique et ne sont pas directement comparables.

## Répartition par période

| Période | OpenAlex | HAL | Open Library |
|---|---:|---:|---:|
| 1720–1899 | 25 | 25 | 25 |
| 1900–1949 | 25 | 25 | 25 |
| 1950–1999 | 25 | 25 | 25 |
| 2000–2026 | 25 | 25 | 25 |

### Compteurs d'API observés

| Période | OpenAlex | HAL | Open Library |
|---|---:|---:|---:|
| 1720–1899 | 237 776 | 25 | 13 304 |
| 1900–1949 | 461 290 | 91 | 20 092 |
| 1950–1999 | 2 042 660 | 12 898 | 206 379 |
| 2000–2026 | 3 942 545 | 114 197 | 338 655 |

## Qualité des notices testées

| Contrôle | OpenAlex | HAL | Open Library |
|---|---:|---:|---:|
| Titres absents | 0 | 0 | 0 |
| Contributeurs absents | 1 | 0 | 8 |
| Années hors de la fenêtre | 0 | 0 | 0 |
| Notices avec une anomalie de normalisation/revue | 6 | 1 | 100 |
| Notices avec ISBN validé | 0 | 18 | 2 |
| Notices avec DOI validé | 56 | 2 | 0 |

Les 100 notices Open Library ne sont pas toutes des notices incomplètes : 92 sont des Works qui nécessitent encore une résolution explicite vers une Edition. Les 8 autres résultats identifiés au niveau Edition ont été traités sans fusion arbitraire ; certains restent à examiner pour auteur ou langue absent. Les ISBN agrégés d'un Work ne sont jamais attribués à une édition au hasard.

Côté OpenAlex, 6 notices demandent une revue, principalement parce que la langue n'est pas fournie. Côté HAL, une notice historique demande une revue linguistique. Le correctif HAL traite désormais les ISBN séparés par espace aussi bien que ceux séparés par virgule ou point-virgule.

Les périodes les plus anciennes sont effectivement couvertes : OpenAlex a renvoyé des années allant jusqu'à 1758, HAL jusqu'à 1854 et Open Library jusqu'à 1735 dans ce pilote.

## Doublons et rapprochement

Les 100 identifiants source sont distincts pour chacune des trois sources, y compris entre les quatre fenêtres de chaque source.

Aucune intersection ISBN/DOI n'a été trouvée entre les lots OpenAlex et HAL. Cela ne prouve pas qu'il n'existe aucun doublon réel : les ISBN sont absents du lot OpenAlex et les identifiants sont incomplets dans plusieurs notices. Aucun rapprochement automatique ni fusion n'est exécuté.

## Politique de collecte Open Library

La Search API est utilisée exclusivement pour ces petits échantillons. Open Library recommande ses dumps mensuels pour les importations massives. Les dumps Editions et Works doivent être traités en flux et conserver la relation entre une œuvre et ses éditions. La collecte à grande échelle ne doit pas être réalisée par des appels Search API.

## État de Neon — branche de développement uniquement

Projet Neon : `lucky-shape-21861035`  
Branche : `schema-development-2026-11-24`

Les migrations 001 à 012 sont enregistrées. Les sources DOAB, OpenAlex, HAL et Open Library sont actives.

| Table de données | Lignes après le pilote |
|---|---:|
| `bibliotheque.import_jobs` | 0 |
| `bibliotheque.source_records` | 0 |
| `bibliotheque.works` | 0 |
| `bibliotheque.digital_assets` | 0 |
| `bibliotheque.rights_statements` | 0 |

La migration 012 n'a fait que mettre à jour les notes de politique de collecte Open Library. Aucune notice du pilote n'a été écrite dans Neon.

## Validation technique et artefacts

- [Campagne historique — GitHub Actions](https://github.com/moses-kasonga/biblioth-que-scientifique/actions/runs/45398952735)
- [Artefact : 12 lots bruts, journaux et rapport JSON](https://github.com/moses-kasonga/biblioth-que-scientifique/actions/runs/45398952735/artifacts/14921434781)
- [Build et contrôle TypeScript](https://github.com/moses-kasonga/biblioth-que-scientifique/actions/runs/45398952843)

L'artefact est conservé par GitHub jusqu'au 1er décembre 2026.

## Décision de pipeline

1. OpenAlex et HAL ont une couverture historique vérifiée sur les quatre fenêtres.
2. Open Library est utilisable pour la découverte et l'enrichissement Work/Edition ; le vrai chargement massif doit passer par les dumps mensuels.
3. Les notices avec langue/auteur manquant ou relation Work/Edition non résolue restent en revue.
4. Le prochain chantier à fort rendement est le pipeline streaming des dumps Open Library et la résolution Work/Edition — pas l'insertion immédiate des 300 notices de test.

**Aucune insertion catalogue n'a été autorisée ou exécutée par ce pilote.**
