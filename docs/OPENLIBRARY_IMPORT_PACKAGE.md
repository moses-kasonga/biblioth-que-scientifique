# Préparation contrôlée de l'import Open Library

## But

Le scanner \`scan-openlibrary-dump.mjs\` extrait les notices en conservant les niveaux bibliographiques séparés. Le préparateur \`prepare-openlibrary-import.mjs\` résout ensuite les références entre Editions, Works et Auteurs et fabrique un paquet contrôlable avant qu'un futur importateur transactionnel touche la base.

Cette étape est **strictement hors base de données** : aucune connexion Neon n'est ouverte, aucune entité canonique n'est créée et aucun record n'est inséré.

## Exécution

Après le scanner officiel :

\`\`\`bash
node scripts/scan-openlibrary-dump.mjs \\
  --editions ./ol_dump_editions_latest.txt.gz \\
  --works ./ol_dump_works_latest.txt.gz \\
  --authors ./ol_dump_authors_latest.txt.gz \\
  --from-year 1720 --to-year 2026 \\
  --max-editions 100000 \\
  --out-dir ./openlibrary-dump-scan

npm run prepare:openlibrary -- \\
  --input-dir ./openlibrary-dump-scan \\
  --out-dir ./openlibrary-import-package \\
  --max-editions 100000
\`\`\`

Le préparateur attend les trois JSONL produits par le scanner. Il conserve par défaut un lot de 100 000 Editions au maximum ; réduire cette valeur sur une machine aux ressources limitées.

## Fichiers produits

- \`editions-prepared.jsonl\` : notice source Edition, références vers les Works, statut de revue et motifs.
- \`works-prepared.jsonl\` : notice source Work, références vers les Auteurs, statut de revue et motifs.
- \`authors-prepared.jsonl\` : notice source Auteur, noms alternatifs et identifiants distants conservés dans le payload source.
- \`relationships-prepared.jsonl\` : liens explicites Edition → Work et Work → Auteur, avec indicateur de résolution.
- \`manifest.json\` : compteurs, anomalies, empreintes SHA-256 des quatre fichiers et garde-fous d'exécution.

Le manifeste est écrit en dernier. Les fichiers JSONL sont d'abord écrits sous un nom temporaire puis renommés ; si une préparation est interrompue, l'absence de manifeste indique que le paquet ne doit pas être consommé.

## Contrôles obligatoires

1. Une même Work liée à plusieurs Editions est représentée une seule fois dans \`works-prepared.jsonl\` et par plusieurs liens dans \`relationships-prepared.jsonl\`.
2. Une référence Work ou Auteur manquante reste explicitement non résolue ; elle ne produit pas d'entité fictive.
3. Plusieurs payloads différents portant le même identifiant externe provoquent \`duplicate_source_record_id_conflicting_payloads\` et une revue humaine. Aucun choix arbitraire de version n'est fait.
4. Un ISBN porté par plusieurs Editions distinctes est signalé sur chacune avec \`isbn_shared_by_multiple_editions\`. Cela peut être une anomalie source ou un cas à interpréter ; aucune fusion n'est automatique.
5. Les titres absents, les dates non interprétables et les versions source inconnues entraînent une revue.
6. Le payload Open Library reste attaché au record source. Le préparateur ne déduit aucun droit de consultation, de téléchargement ou de redistribution d'un livre.

## Limite volontaire

Ce paquet n'est pas un fichier SQL et ne doit pas être envoyé directement à PostgreSQL. La prochaine étape distincte sera un importateur transactionnel utilisant les vraies clés de provenance, les tables \`bibliotheque.source_records\`, \`bibliotheque.source_record_links\`, \`bibliotheque.import_jobs\` et \`bibliotheque.import_records\`, ainsi que les entités Work/Edition/Agent. Il devra être idempotent, reprendre par lots et ne jamais créer de doublons canoniques en cas de relance.

Toute première écriture restera conditionnée à un essai explicite sur la branche Neon de développement, avec un rôle limité et un lot pilote approuvé. La branche de production reste hors périmètre.
