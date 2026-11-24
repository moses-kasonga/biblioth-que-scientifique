# Open Library — exécuteur source-records

L'exécuteur est volontairement limité à l'archivage des notices de provenance dans `bibliotheque.source_records`. Il **ne crée aucune œuvre, expression, édition, personne, relation canonique ni identifiant bibliographique**. Ces propositions restent à traiter par un workflow de validation éditoriale distinct.

## Pré-requis

- Node.js 22+
- Dépendances installées (`npm ci`)
- Dump Open Library préparé, paquet vérifié et plan généré
- Une chaîne PostgreSQL Neon de la branche de développement, jamais celle de production

## Pipeline

Télécharger les dumps mensuels officiels (plusieurs Go au total). Le téléchargement est séquentiel, reprend les fichiers partiels et écrit un manifeste SHA-256 :

```bash
npm run download:openlibrary
```

Pour tester uniquement le plus petit dump, sans télécharger les deux autres :

```bash
npm run download:openlibrary -- --only authors
```

Les fichiers sont placés dans `openlibrary-dumps/`. Le dump mensuel indiqué par Open Library peut être daté de plusieurs semaines ; le script suit les alias officiels `latest` et enregistre la destination redirigée dans le manifeste des fichiers téléchargés.

```bash
node scripts/scan-openlibrary-dump.mjs --editions ./openlibrary-dumps/ol_dump_editions_latest.txt.gz --works ./openlibrary-dumps/ol_dump_works_latest.txt.gz --authors ./openlibrary-dumps/ol_dump_authors_latest.txt.gz
node scripts/prepare-openlibrary-import.mjs --input-dir ./openlibrary-dump-scan --out-dir ./openlibrary-import-package --max-editions 100000
node scripts/verify-openlibrary-package.mjs --package-dir ./openlibrary-import-package
node scripts/plan-openlibrary-import.mjs --package-dir ./openlibrary-import-package --out-dir ./openlibrary-import-plan --batch-size 500
node scripts/verify-openlibrary-import-plan.mjs --plan-dir ./openlibrary-import-plan
```

## Simulation sans connexion

```bash
npm run execute:openlibrary
```

Le mode par défaut vérifie le paquet et le plan, puis affiche les volumes. Il ne se connecte pas à PostgreSQL.

## Exécution explicitement autorisée sur Neon dev

Définir `DATABASE_URL_UNPOOLED` (préféré pour un import) et la variable de confirmation ci-dessous dans l'environnement local, sans jamais les committer :

```bash
export NEXUS_IMPORT_ALLOWED_BRANCH_ID=br-bold-hall-be9s4awg
node scripts/execute-openlibrary-import.mjs --apply --target-branch-id br-bold-hall-be9s4awg
```

Avant toute écriture, le script vérifie aussi depuis PostgreSQL `current_setting('neon.branch_id', true)`, la base `neondb` et la source active `openlibrary`. Toute divergence arrête le traitement.

## Transactions, reprise et limites

- Chaque lot du plan est exécuté dans une transaction PostgreSQL.
- Les écritures source sont idempotentes sur (source, identifiant externe, version).
- Un checkpoint local est écrit atomiquement après chaque lot validé ; si le processus s'interrompt après un commit avant le checkpoint, la contrainte unique et `import_records` rendent la reprise sans doublon.
- Le job et ses résultats sont consignés dans `import_jobs` et `import_records`.
- Les propositions canoniques et les liens sont comptabilisés comme différés, jamais exécutés.
- Le dump complet n'est pas inclus dans Git. Aucun import massif ne doit être lancé avant validation du dry-run, des droits d'utilisation du dump et de la qualité du paquet.
- Ne pas fusionner vers `main` ni déployer Vercel production sans validation explicite.
