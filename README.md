# Bibliothèque scientifique

Projet de bibliothèque scientifique numérique destiné à être intégré à terme dans Nexus Science.

## Vision

Construire un catalogue scientifique international couvrant les publications de 1720 à 2026, avec une architecture multilingue dès la première version. La cible initiale est de 100 000 notices bibliographiques, avec une architecture conçue pour dépasser 1 000 000 de notices et continuer à croître.

Langues initiales prévues : français, anglais et portugais. Le modèle doit permettre l'ajout d'autres langues.

## Architecture cible

- **GitHub** : code source, documentation et migrations versionnées.
- **Neon PostgreSQL** : base de données du projet Bibliothèque scientifique.
- **Vercel** : hébergement de l'application et de son API.
- **Nexus Science** : système central d'identité des utilisateurs lors de l'intégration, après validation du contrat d'identité.

## Principes de sécurité

- Ne jamais commiter de secrets, mots de passe ou URL de connexion contenant des identifiants.
- Ne pas exécuter de migration de conception directement sur Neon `production`.
- Versionner les changements de schéma et les tester sur une branche Neon isolée.
- Ne pas créer de système d'authentification indépendant pour la bibliothèque.
- Vérifier les droits d'accès aux ressources numériques indépendamment de leur disponibilité technique.

## Capacité du catalogue

- Objectif initial : 100 000 notices bibliographiques.
- Capacité de conception : 1 000 000 de notices et davantage, sans plafond artificiel.
- Les notices, œuvres, expressions, éditions et ressources numériques sont comptées séparément. Une notice ne garantit pas l'accès à un fichier intégral.

## État du projet

- Audit de cohérence SQL-ready v0.3 documenté.
- Branche GitHub de préparation : `docs/initial-foundation`.
- Migrations SQL 001 à 008 rédigées dans `db/migrations/`.
- Branche Neon isolée de développement créée depuis `production`.
- **Aucune migration SQL n'a encore été exécutée**, y compris sur la branche de développement.
- La recherche avancée (migration 009) reste différée jusqu'à validation des parcours et du classement.

## Prochaines étapes

1. Revue statique et validation syntaxique des migrations 001 à 008.
2. Préparer l'environnement de test et les rôles SQL séparés.
3. Exécuter les migrations sur la branche Neon de développement uniquement.
4. Exécuter les tests d'intégrité, de droits, de cycles et d'isolation RLS.
5. Corriger et documenter les résultats avant toute demande d'approbation de production.
6. Configurer un projet Vercel distinct de celui de Nexus Science.
