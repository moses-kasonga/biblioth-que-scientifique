# Pipeline d'import documentaire — DOAB

## Objectif

Le premier pilote utilise le Directory of Open Access Books (DOAB) pour constituer un petit lot de notices bibliographiques de livres en accès ouvert. Le pipeline importe les métadonnées et leur provenance ; il ne télécharge pas les fichiers des livres.

DOAB indique que les métadonnées de son répertoire sont disponibles sous CC0. Cette licence de métadonnées ne remplace pas la licence de chaque livre, ni les conditions qui s'appliquent au PDF ou à l'EPUB associé. Aucun droit sur un fichier n'est déduit de la seule présence du titre dans DOAB.

## Sources et limites

### DOAB — source pilote

- Métadonnées et identifiants : source principale du pilote.
- Le flux officiel JSON complet est disponible à `https://memo.doabooks.org/file/oapen/DOAB.json`. Il expose un tableau `publications` avec les métadonnées bibliographiques, le lien DOAB, ISBN, DOI, langue, éditeur, date, sujets et mentions de licence lorsque fournis.
- Les métadonnées du répertoire DOAB sont disponibles sous CC0. Cette licence ne s'étend pas aux contenus des livres.
- Pour les sélections ponctuelles, DOAB Selective Export est optimisé pour des ensembles jusqu'à 500 titres. Les flux complets comprennent MARCXML, KBART, ONIX, JSON et OAI-PMH.
- API REST : recherche ciblée et récupération de métadonnées en JSON ou XML. L'API peut refuser certaines plages d'adresses. Dans ce cas, utiliser le flux officiel JSON plutôt qu'un proxy ou un miroir non autorisé.
- Conserver l'identifiant externe, la version du record lorsqu'elle existe, l'horodatage de collecte, le JSON brut et son SHA-256.

Collecte du lot pilote depuis le flux JSON officiel :

```bash
node scripts/fetch-doab-json-feed.mjs --limit 25 --offset 0 --output ./doab-batch.json
node scripts/import-doab.mjs --input ./doab-batch.json --max-records 25 --dry-run
```

Le collecteur lit le JSON en continu et s'arrête dès qu'il a sélectionné le nombre de notices demandé ; il ne télécharge pas le flux entier sur disque. Le paramètre `--offset` permet de sauter des notices admissibles déjà parcourues et de préparer des lots suivants (par exemple `--offset 1000`). L'offset s'applique après le filtre de langues et doit être conservé dans le journal d'import ; le flux public pouvant évoluer, l'identifiant externe de chaque notice reste la clé de reprise et d'idempotence. Par défaut, il privilégie le français, l'anglais, l'espagnol et le portugais, tout en conservant les notices dont la langue est absente pour revue. Les notices dans d'autres langues sont ignorées, sauf avec `--all-languages`. Le maximum est de 500 notices par lot. Aucun `bitstream`, PDF ou EPUB n'est demandé ou téléchargé. La sortie locale est un petit fichier JSON rejouable. Le dry-run ne se connecte pas à Neon.

Le collecteur REST `fetch-doab-json.mjs` reste disponible pour les recherches ciblées lorsque l'API REST est accessible ; il demande explicitement `expand=metadata`. Pour le pilote automatisé, le flux JSON officiel est le parcours de référence.

### Open Library — enrichissement secondaire

L'API Web Open Library est destinée aux usages orientés utilisateur, aux recherches ciblées et à un volume modéré. Elle ne doit pas être utilisée comme backend d'importation massive. Pour une ingestion en masse, utiliser les dumps mensuels publiés ou une procédure de partenariat appropriée. Respecter les limites de requêtes, mettre en cache et identifier l'application lorsque des appels réguliers sont effectués.

## Modèle d'import

Pour chaque notice source :

1. Stocker le record JSON brut dans `source_records`, avec son identifiant externe, sa version et son empreinte SHA-256.
2. Normaliser titre, contributeurs, date, langue, sujets, ISBN et DOI.
3. Vérifier les chiffres de contrôle ISBN-10/ISBN-13 et la syntaxe DOI.
4. Proposer des disciplines uniquement lorsque les sujets source correspondent à des termes contrôlés.
5. Chercher une correspondance d'identifiant dans le catalogue existant.
6. Si un ISBN/DOI existe déjà, ajouter un lien de provenance `same_as` et marquer la notice pour revue ; ne jamais fusionner automatiquement.
7. Sinon créer une œuvre, une expression et une édition au statut `provisional`, puis relier les contributeurs, sujets et identifiants disponibles.
8. Créer les liens de provenance dans `source_record_links` et enregistrer le résultat dans `import_records`.

Une notice de qualité incomplète reste en revue ; elle n'est pas automatiquement publiée comme notice validée.

## Exécution locale

Node.js 22+ est requis.

### 1. Préparer un export JSON

Télécharger un petit export ciblé depuis DOAB et le sauvegarder dans un fichier local, par exemple `doab-batch.json`. Ne pas commiter ce fichier dans Git.

### 2. Effectuer le dry-run

```bash
node scripts/import-doab.mjs --input ./doab-batch.json --max-records 25
```

Le dry-run est le comportement par défaut. Il n'ouvre aucune connexion Neon et n'effectue aucune écriture. Il affiche les titres, années, langues, identifiants validés et problèmes détectés.

### 3. Précontrôle avant écriture

L'exécution `--apply` exige `DATABASE_IMPORT_URL` pointant vers la branche Neon de développement et le rôle `bibliotheque_importer`.

Ne pas utiliser :
- la connexion propriétaire `neondb_owner` ;
- la variable de lecture `DATABASE_URL` de l'application ;
- la branche Neon `production` ;
- une variable Vercel Production.

Le rôle `bibliotheque_importer` doit conserver les caractéristiques suivantes : pas de superutilisateur, pas de `BYPASSRLS`, pas d'accès aux coffres personnels, pas d'écriture des ressources numériques et pas d'écriture des déclarations de droits.

### 4. Lancer un lot pilote

Après vérification du fichier et du dry-run :

```bash
DATABASE_IMPORT_URL='postgresql://...' \\
  node scripts/import-doab.mjs \\
  --input ./doab-batch.json \\
  --max-records 25 \\
  --apply
```

La valeur de connexion est un secret local : ne jamais la coller dans le code, un terminal partagé, les journaux ou Git. Le pilote doit rester limité à 25 records par exécution. Une montée à 100 ou 500 records vient après examen du résultat et approbation du mapping.

## Ce que le pipeline ne fait volontairement pas

- Il ne télécharge ni ne stocke les PDF/EPUB.
- Il ne crée pas d'entrée dans `digital_assets`.
- Il ne crée ni ne valide de droit dans `rights_statements`.
- Il n'affirme pas que consultation, téléchargement ou redistribution sont permis.
- Il ne transforme pas automatiquement une notice provisoire en notice active.
- Il ne fusionne pas les notices en doublon.
- Il n'envoie pas de données utilisateur dans les records source.

Les droits d'un fichier devront être vérifiés à partir de la déclaration de licence de l'édition ou de la ressource elle-même, de sa portée, de sa juridiction et des preuves conservées. Une incertitude conduit au refus d'accès.

## Contrôles après import

Vérifier au minimum :

- le nombre de records source collectés ;
- le nombre de notices créées, ignorées, mises en revue et en échec ;
- les doublons d'identifiants ;
- les notices sans langue ou année interprétable ;
- les correspondances contributeurs et sujets ;
- l'absence de fichiers binaires et de droits implicites ;
- la provenance de chaque œuvre créée ;
- les recherches sur titres, auteurs, ISBN et DOI à travers l'API Preview.

Le pilote n'est pas un engagement de volume. L'import initial vers 100 000 notices sera préparé seulement après validation du mapping, de la qualité, de l'idempotence et des droits.


## Protocole de validation post-import

Les contrôles SQL exécutables, les seuils d'acceptation, les interprétations des compteurs et les règles de décision sont centralisés dans le **PVI-001 — Protocole de validation des importations** : [consulter le protocole](./IMPORT_VALIDATION_PROTOCOL.md).

Après chaque lot, exécuter ce protocole sur la même branche Neon de développement que celle utilisée pour l'import. Un statut de job terminé ou une insertion SQL réussie ne suffit pas à valider les notices. Les notices `review_required` restent en revue humaine et les notices créées restent `provisional` jusqu'à validation distincte.


### Paramètres du collecteur

- `--query` : expression de recherche DOAB obligatoire.
- `--limit` : nombre maximal demandé à l'API ; 25 par défaut, maximum 500.
- `--output` : chemin du fichier JSON local.
- Le collecteur développe uniquement les métadonnées (`expand=metadata)). Il ne demande jamais `expand=bitstreams`.
