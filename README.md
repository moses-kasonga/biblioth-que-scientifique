# Bibliothèque scientifique

Projet de bibliothèque scientifique numérique destiné à être intégré à terme dans Nexus Science.

## Vision

Construire un catalogue scientifique international couvrant les publications de 1720 à 2026, avec une architecture multilingue dès la première version.

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

## État du projet

Le dépôt accueille la documentation et la préparation technique. Aucune migration SQL de production n'est incluse dans cette initialisation.

## Prochaines étapes

1. Finaliser et valider le dictionnaire de données.
2. Documenter l'architecture applicative et les conventions de développement.
3. Préparer les migrations SQL versionnées.
4. Tester les migrations sur une branche Neon non productive.
5. Configurer un projet Vercel distinct de celui de Nexus Science.
