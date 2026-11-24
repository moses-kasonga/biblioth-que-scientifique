# Résultat du premier dry-run DOAB — 24 novembre 2026

## Statut

**Collecte réelle réussie ; dry-run réussi ; aucune écriture Neon.**

- Dépôt : `moses-kasonga/biblioth-que-scientifique`
- Branche : `app/minimal-vercel-foundation`
- Commit vérifié : `f747a498b90ee17110df380e28125969c265c60f`
- Workflow : [DOAB metadata pilot](https://github.com/moses-kasonga/biblioth-que-scientifique/actions/runs/45376921641)
- Artefact du lot et du rapport : [doab-pilot-45376921641](https://github.com/moses-kasonga/biblioth-que-scientifique/actions/runs/45376921641/artifacts/14910689847) (conservation GitHub Actions : 7 jours)
- Source : `https://memo.doabooks.org/file/oapen/DOAB.json`
- Offset : 0
- Limite demandée : 25 notices
- Politique linguistique : FR/EN/ES/PT ; les notices sans langue restent admissibles pour revue ; les autres langues sont ignorées dans le mode par défaut.

## Résultats de collecte

| Indicateur | Résultat |
|---|---:|
| Notices sélectionnées | 25 |
| Enregistrements parcourus | 35 |
| Écartés par le filtre de langue | 10 |
| Notices avec titre | 25 |
| Notices avec auteur ou éditeur | 25 |
| Notices avec au moins un ISBN valide | 25 |
| Notices avec au moins un DOI normalisé valide | 22 |
| Notices avec mention de licence source | 25 |
| Notices avec anomalie de normalisation | 1 |
| Années de publication dans ce lot | 2026 uniquement |

Répartition linguistique après normalisation :

| Langue | Notices |
|---|---:|
| Anglais | 20 |
| Espagnol | 3 |
| Français | 1 |
| Portugais | 1 |

Les 25 notices ont un identifiant DOAB externe distinct. Aucun ISBN ou DOI normalisé répété entre les notices de ce lot n'a été détecté lors du contrôle local du fichier.

## Anomalie à examiner

Une seule notice a été marquée avec `bibliographic_identifiers_failed_validation` :

- **Titre :** *Territorialización de los Objetivos de Desarrollo Sostenible. Gobernanza, participación ciudadana y políticas públicas*
- **Identifiant DOAB :** `20.500.12854/186715`
- **Valeur DOI source :** `0.64092/XSFN3189`
- **Anomalie :** le DOI source ne respecte pas le préfixe DOI attendu ; il n'est donc pas normalisé ni inséré comme identifiant canonique.
- **Décision :** conserver le payload source, créer au besoin une notice provisoire en revue, ne pas inventer ou corriger automatiquement le DOI.

Deux notices supplémentaires n'ont pas de DOI source ; ce n'est pas une anomalie en soi. Les 25 notices possèdent au moins un ISBN validé.

## Couverture disciplinaire

Les sujets sont présents dans les 25 records. Le mapping de disciplines actuel n'a classé explicitement que deux notices (`medicine` et `physics`). Ce mapping est volontairement conservateur : il ne faut pas déduire une discipline à partir de codes de classification non documentés ou ambigus.

Avant un lot d'ampleur, compléter le dictionnaire de correspondance entre les classifications DOAB et les dix disciplines contrôlées, avec des tests et une table de correspondance versionnée. L'absence de discipline n'empêche pas la conservation des sujets source ; elle doit rester visible et ne pas être remplacée par une classification inventée.

## Limite temporelle et suite

Les 25 premières notices admissibles du flux sont toutes datées de 2026. Ce lot valide le chemin technique, mais **ne démontre pas encore la couverture historique 1720–2026**.

Le collecteur prend maintenant en charge `--offset` pour prélever les lots suivants dans l'ordre du flux, après le filtre de langue, par exemple :

```bash
node scripts/fetch-doab-json-feed.mjs \
  --limit 25 \
  --offset 1000 \
  --output ./doab-batch-1000.json
```

Le flux public peut évoluer ; un offset n'est donc pas une clé de reprise absolue. Les identifiants externes DOAB et les versions de records restent les clés de provenance et d'idempotence. Il faut examiner plusieurs offsets avant de définir un échantillonnage de couverture historique. DOAB n'est pas, à lui seul, une garantie de présence de toutes les publications scientifiques publiées depuis 1720.

## Validation CI

Le commit indiqué ci-dessus a terminé avec succès :

- collecte DOAB depuis le flux JSON officiel ;
- dry-run de l'importateur ;
- tests Node : **15 réussis, 0 échec** ;
- vérification TypeScript ;
- compilation Next.js.

## Périmètre des changements

Le workflow n'a aucun secret de connexion Neon et n'utilise pas la base. Il ne fait que collecter des métadonnées, exécuter le mode dry-run et conserver un artefact temporaire.

Aucune notice n'a été insérée dans Neon à cette étape. Aucune ligne de `import_jobs`, `source_records`, `works`, `digital_assets` ou `rights_statements` n'a été créée par ce dry-run.

La licence CC0 concerne les métadonnées du répertoire DOAB, pas les fichiers des livres. Les champs de licence observés sont conservés comme éléments de preuve source ; ils ne déclenchent aucun droit d'accès, de téléchargement ou de redistribution.
