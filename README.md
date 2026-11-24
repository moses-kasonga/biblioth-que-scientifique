# Bibliothèque Scientifique — Nexus Science

Module de bibliothèque scientifique numérique de l’écosystème Nexus Science, développé séparément pour une intégration progressive.

## Vision

Construire un catalogue scientifique international couvrant les publications de 1720 à 2026 et au-delà, avec une architecture multilingue dès la première version. L'objectif initial est de constituer 100 000 notices bibliographiques, avec une architecture conçue pour dépasser 1 000 000 de notices et continuer à croître.

Langues initiales : français, anglais, espagnol et portugais. Le modèle doit permettre l'ajout d'autres langues.

## Architecture

- **GitHub** : code source, documentation, migrations et pipeline d'import versionnés.
- **Neon PostgreSQL** : base documentaire de ce module, avec une branche de développement isolée.
- **Vercel** : hébergement de l'application et de son API.
- **Nexus Science** : futur système central d'identité des utilisateurs, après validation du contrat d'identité. Aucun compte local n'est créé dans ce module.

## État technique vérifié — 24 novembre 2026

### Base Neon de développement

- Projet : \`bibliotheque-scientifique\`.
- Branche de travail : \`schema-development-2026-11-24\`.
- Schéma : \`bibliotheque\`.
- Migrations 001 à 010 appliquées et inscrites dans \`bibliotheque.schema_migrations\`.
- Structure vérifiée : 44 tables, 117 index et 456 contraintes.
- Référentiels initiaux : 4 langues, 7 types de publication et 10 disciplines, avec libellés FR/EN/ES/PT.
- Les tests temporaires ont confirmé le blocage des cycles dans les compositions d'œuvres, la hiérarchie des sujets et les tables des matières.
- La branche Neon \`production\` n'a pas été modifiée.

### Rôles et privilèges

- \`bibliotheque_reader\` : rôle de lecture utilisé par l'API Vercel Preview ; pas de droit d'insertion et pas de \`BYPASSRLS\`.
- \`bibliotheque_importer\` : rôle d'import restreint à des tables de catalogue et de provenance ; pas de superutilisateur, pas de \`BYPASSRLS\`, pas d'accès aux coffres personnels, pas d'écriture des droits ou des ressources numériques.
- Le rôle propriétaire \`neondb_owner\` est réservé à l'administration et aux migrations. Il n'est jamais utilisé par l'application.
- Les identifiants de connexion ne doivent jamais être versionnés.

### Application Vercel

- Branche GitHub de l'application : \`app/minimal-vercel-foundation\`.
- Framework : Next.js.
- \`GET /api/catalogue\` interroge réellement Neon avec le rôle en lecture seule.
- \`DATABASE_URL\` est un secret Vercel Preview limité à cette branche.
- Aucune variable de connexion Neon n'est définie pour Production.
- Les résultats restent vides tant que des notices bibliographiques réelles n'ont pas été importées.
- La mise en Production et la fusion vers \`main\` restent des décisions séparées, non exécutées.

## Pipeline documentaire

Le premier connecteur de métadonnées est DOAB. Les métadonnées du répertoire sont publiées sous CC0 ; cette licence ne doit pas être confondue avec les droits applicables au PDF/EPUB d'un livre.

Le pipeline :

- lit un fichier JSON exporté de DOAB ;
- conserve le record source et son empreinte SHA-256 ;
- normalise langues, dates, ISBN et DOI ;
- propose des disciplines contrôlées ;
- détecte les correspondances par identifiants sans fusion automatique ;
- crée des notices au statut \`provisional\` et enregistre leur provenance ;
- ne télécharge aucun fichier et ne crée aucun droit implicite.

Open Library reste une source secondaire pour des recherches ciblées. Ses dumps mensuels, et non son API Web, sont à privilégier pour les volumes importants.

Voir [la procédure d'import](docs/IMPORT_PIPELINE.md) et le [protocole de validation post-import PVI-001](docs/IMPORT_VALIDATION_PROTOCOL.md). Consulter aussi le [rapport du premier dry-run DOAB de 25 notices](docs/pilot-results/DOAB-DRY-RUN-2026-11-24.md).

### Récupération ciblée et dry-run

Récupérer une réponse JSON DOAB puis inspecter le lot :

```bash
node scripts/fetch-doab-json-feed.mjs --limit 25 --output ./doab-batch.json
node scripts/import-doab.mjs --input ./doab-batch.json --max-records 25 --dry-run
```

Le collecteur lit en continu le flux JSON officiel DOAB (métadonnées CC0), sélectionne jusqu'à 25 notices et ne demande ni ne télécharge aucun bitstream, PDF ou EPUB. Le dry-run est le comportement par défaut de l'importateur : il ne se connecte pas à Neon et n'écrit aucune donnée.

L'écriture \`--apply\` exige une variable locale \`DATABASE_IMPORT_URL\` correspondant au rôle \`bibliotheque_importer\` sur la branche de développement uniquement. Ne pas utiliser le secret de lecture Vercel, le rôle propriétaire ou la branche Production.

## Principes de sécurité et de qualité

- Ne jamais commiter de secrets, mots de passe ou URL de connexion contenant des identifiants.
- Ne jamais exécuter de migration de conception directement sur Neon \`production\`.
- Versionner les changements de schéma et les tester sur une branche Neon isolée.
- Les métadonnées d'une source et les droits des fichiers sont évalués séparément.
- \`unknown\` n'autorise jamais la consultation, le téléchargement ou la redistribution.
- Les identifiants bibliographiques sont validés et les doublons potentiels sont envoyés en revue.
- Les notices provisoires ne sont pas présentées comme validées.
- Aucune donnée bibliographique fictive n'est présentée comme réelle.
- Aucun compte local ou mot de passe n'est créé ; l'intégration d'identité passera par Nexus Science après validation du contrat de jeton.

## Développement local

Node.js 22+.

\`\`\`bash
npm install
npm test
npm run typecheck
npm run build
npm run start
\`\`\`

Le script \`prebuild\` exécute automatiquement les tests unitaires avant \`next build\`.

## Prochaines étapes

1. Tester l'importateur avec un petit export JSON réel de DOAB, d'abord en dry-run.
2. Examiner le mapping, les notices sans langue/date/contributeurs et les doublons.
3. Exécuter le pilote de 25 notices sur la seule branche Neon de développement, puis contrôler ses résultats.
4. Faire évoluer les conversions CSV/MARCXML/KBART après validation du mapping correspondant.
5. Préparer les imports de plus grande taille avec reprise, contrôle qualité et surveillance des droits.
6. Définir le contrat d'identité Nexus Science avant toute activation des fonctionnalités personnelles.

La base est connectée en développement ; aucune notice réelle n'a encore été importée. L'objectif de 100 000 notices est une cible de constitution du catalogue, pas un volume actuellement présent.
