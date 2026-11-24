# Capacité du catalogue et stratégie de croissance

**Décision validée le 24 novembre 2026**

## Objectif de lancement

La cible initiale est de **100 000 notices bibliographiques**. Il s'agit d'un objectif de constitution du catalogue, pas d'un volume déjà importé ni d'une garantie de disponibilité de 100 000 fichiers numériques.

## Capacité de conception

Le modèle de données et les services doivent être conçus pour accueillir **au moins 1 000 000 de notices**, puis continuer à croître sans refonte structurelle ni plafond artificiel fixé à 100 000.

## Principes de croissance

- Les volumes réels sont mesurés séparément : œuvres, expressions, éditions, notices de sources et ressources numériques.
- Une notice bibliographique peut exister sans fichier intégral accessible.
- Les fichiers consultables ou téléchargeables exigent une vérification distincte des droits applicables.
- Les imports doivent être progressifs, traçables, idempotents et reprenables.
- La déduplication utilise d'abord les identifiants forts ; les rapprochements ambigus sont soumis à revue.
- La recherche, les index et la pagination doivent être testés sur des volumes représentatifs et augmentés progressivement.
- Aucune limite métier de 100 000 lignes ne doit être codée dans le schéma, les API ou les tâches d'import.

## Jalons indicatifs

| Jalon | Cible de notices |
|---|---:|
| Lancement initial | 100 000 |
| Croissance 1 | 250 000 |
| Croissance 2 | 500 000 |
| Développement international | 1 000 000+ |

Ces jalons sont des objectifs de planification. Leur atteinte dépendra des sources réellement accessibles, de la qualité des métadonnées, des conditions d'utilisation, de la déduplication et des ressources d'exploitation.

## Mesure et reporting

Les tableaux de bord ne doivent jamais additionner ou confondre :
- œuvres intellectuelles ;
- expressions et traductions ;
- éditions et manifestations ;
- enregistrements importés depuis les sources ;
- fichiers numériques référencés ;
- fichiers dont la consultation est autorisée ;
- fichiers dont le téléchargement est autorisé.

## Conséquence technique

La base PostgreSQL ne reçoit pas de contrainte artificielle de capacité à 100 000 notices. La montée en charge est validée par tests de charge et plans d'exécution sur des jeux synthétiques représentatifs, puis sur les données importées. Les optimisations prématurées et les extensions non nécessaires sont évitées.
