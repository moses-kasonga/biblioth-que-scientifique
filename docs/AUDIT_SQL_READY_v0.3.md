# BIBLIOTHÈQUE SCIENTIFIQUE
## Audit de cohérence et préparation à la génération SQL — Version 0.3

**Date : 24 novembre 2026**  
**Statut : spécification prête pour la génération des migrations SQL initiales ; déploiement de production non autorisé ni validé.**

---

## 1. Décision d’architecture

La bibliothèque demeure un module distinct pendant son développement sur Neon. Elle sera conçue pour pouvoir être intégrée ensuite à Nexus Science sans imposer une fusion immédiate des bases.

- **Neon** héberge actuellement la base de développement de la Bibliothèque scientifique.
- **Nexus Science** reste l’unique système d’identité des utilisateurs finaux : pas de comptes, mots de passe ni sessions propres à la bibliothèque.
- L’API serveur de la bibliothèque vérifie les jetons émis par Nexus Science. Les navigateurs et applications clientes ne reçoivent jamais de chaîne de connexion Neon.
- Les identifiants Nexus sont stockés en `TEXT` tant que le format et la stabilité du champ `sub` ne sont pas contractuellement confirmés. Aucun compte utilisateur local ni clé étrangère vers une table utilisateur inexistante ne sera créé.
- Le modèle SQL vise **PostgreSQL 17 ou supérieur** pour faciliter une future intégration dans l’environnement Nexus. Il ne doit dépendre d’aucune fonction propriétaire Neon ni d’une extension non indispensable.
- Les objets seront regroupés dans un schéma dédié, `bibliotheque`, plutôt que mélangés dans `public`. L’exposition éventuelle de ce schéma à une API Supabase sera une décision d’intégration séparée.

Le modèle bibliographique reprend la séparation conceptuelle entre œuvre, expression, manifestation/édition et exemplaire/ressource, en l’adaptant à une bibliothèque numérique. Cette séparation est cohérente avec le modèle IFLA LRM ; BIBFRAME propose également les niveaux Work, Instance et Item. La base de données ne prétendra pas être une implémentation complète d’IFLA LRM ou de BIBFRAME.

## 2. Corrections obligatoires apportées à la version 0.2

### 2.1 Œuvre, expression, édition et fichier

La chaîne de référence est désormais :

1. **Œuvre (`works`)** : création intellectuelle abstraite, indépendamment de sa langue ou de son édition.
2. **Expression (`work_expressions`)** : réalisation intellectuelle ou linguistique de l’œuvre, par exemple le texte original, une traduction ou une révision.
3. **Édition (`editions`)** : manifestation publiée ou diffusée. Une édition peut contenir plusieurs œuvres (anthologie, actes, encyclopédie) et plusieurs expressions d’une même œuvre (édition bilingue).
4. **Ressource numérique (`digital_assets`)** : fichier ou ressource en ligne rattaché à une édition précise, par exemple PDF, EPUB ou transcription numérique.

Deux tables d’association distinctes sont indispensables :

- `edition_works` : relie une édition aux œuvres qu’elle contient, une seule association par couple édition/œuvre.
- `edition_expressions` : précise quelles expressions de chaque œuvre sont présentes dans cette édition. Une œuvre peut donc avoir plusieurs expressions dans la même édition.

Cette séparation évite la faiblesse de l’ancienne relation `edition_expressions` utilisée seule : elle ne permettait pas de référencer proprement l’édition préférée d’une œuvre collective ou bilingue.

### 2.2 Table des matières

`edition_contents` est remplacée par `edition_toc_entries`.

Cette table représente à la fois :
- les entrées correspondant à une œuvre ou expression réellement cataloguée ;
- les sections structurelles qui ne constituent pas une œuvre indépendante, comme « Préface », « Chapitre 2 », « Annexes » ou « Index ».

Elle porte l’ordre, le parent éventuel, le titre affiché, les repères de pagination/localisation et, lorsqu’ils existent, les liens vers l’œuvre et l’expression. La cohérence de ces liens doit être vérifiée par des clés étrangères composites. Les cycles dans la hiérarchie sont interdits.

### 2.3 Auteurs et contributeurs deviennent des agents

Les tables `authors`, `author_identifiers` et `work_authors` deviennent respectivement `agents`, `agent_identifiers` et `work_agents`.

Un agent peut être une personne, une organisation, une collectivité, une réunion ou une juridiction. Les rôles sont portés par les tables de relation : créateur, auteur, éditeur scientifique, traducteur, compilateur, illustrateur, éditeur commercial, distributeur, etc. Les éditeurs commerciaux ne nécessitent donc pas un silo distinct `publishers` : ils peuvent être représentés comme agents reliés aux éditions par `edition_agents`.

`agent_names` permet de conserver plusieurs formes de nom, langues, graphies et formes préférées sans écraser les variantes.

### 2.4 Langues

La langue d’une expression est une relation plusieurs-à-plusieurs (`expression_languages`) et non un champ unique obligatoire. Cela couvre les ouvrages bilingues ou multilingues.

Les codes utilisent les balises BCP 47, par exemple `fr`, `en`, `pt-BR` et `pt-PT`. Le registre `languages` sert de référentiel extensible ; il ne doit pas limiter la bibliothèque à trois langues.

### 2.5 Sujets et hiérarchies

`subject_translations` devient `subject_labels`, et `subject_relations` sépare les relations hiérarchiques des libellés traduits.

Une simple colonne `parent_subject_id` aurait limité un sujet à un parent unique. La table de relations permet plusieurs relations contrôlées. Les cycles de la hiérarchie de type « plus large / plus précis » sont interdits par un contrôle transactionnel, pas par un `CHECK` ordinaire.

### 2.6 Identifiants bibliographiques

`identifier_schemes` décrit les schémas d’identification connus. `bibliographic_identifiers` conserve :
- la valeur originale ;
- la valeur normalisée utilisée pour les recherches et l’unicité ;
- le schéma (ISBN, DOI, OCLC, LCCN, OLID, etc.) ;
- une et une seule cible parmi œuvre, expression, édition ou ressource numérique.

Un ISBN identifie une publication/édition éligible, pas l’œuvre abstraite. Les contrôles spécifiques à chaque schéma (format, chiffre de contrôle, niveau de cible autorisé) doivent être réalisés au niveau adapté, avec tests. La valeur source ne doit jamais être remplacée par sa seule forme normalisée.

### 2.7 Droits : aucune autorisation implicite

`rights_statements` distingue les règles de consultation, téléchargement et redistribution. Chaque droit peut être `allowed`, `prohibited`, `conditional`, `unknown` ou `not_applicable`.

**Règle de sécurité : `unknown` n’autorise jamais une opération.** Une autorisation de consulter ne signifie pas autorisation de télécharger ou de redistribuer.

Il n’y aura pas d’héritage automatique d’une autorisation de l’œuvre vers l’édition ou le fichier. Pour le lancement, une opération sur un fichier exige une permission explicite, vérifiée et encore valide qui couvre cette ressource et cette opération. Une ambiguïté, une contradiction ou une condition non satisfaite conduit au refus. La base conserve les déclarations et leurs preuves ; le service de droits applique la décision finale.

### 2.8 Coffre et progression de lecture

- `user_bookshelves` : un coffre par identifiant Nexus, avec `nexus_user_id TEXT UNIQUE NOT NULL`.
- `user_book_items` : une seule entrée par œuvre et par coffre. L’édition préférée, si elle est renseignée, doit réellement contenir cette œuvre via une clé étrangère composite vers `edition_works`.
- `user_collections` et `user_collection_items` : collections personnalisées. Une œuvre ne peut être ajoutée à une collection que si elle figure déjà dans le coffre correspondant.
- `user_reading_progress` : une progression par ressource numérique consultée, unique sur `(bookshelf_id, digital_asset_id)`. La position est conservée en `JSONB` avec un numéro de version de son format et un compteur de révision pour gérer les sauvegardes concurrentes de plusieurs appareils.
- `user_reading_history` : événements d’historique distincts de la position courante.

La progression est liée au fichier consulté, pas à une page globale de l’œuvre. Une position PDF et une position EPUB ne sont pas interchangeables.

## 3. Inventaire de tables cible

### Référentiels et catalogue

1. `languages`
2. `works`
3. `work_expressions`
4. `expression_languages`
5. `expression_titles`
6. `agents`
7. `agent_names`
8. `agent_identifiers`
9. `work_agents`
10. `expression_agents`
11. `subjects`
12. `subject_labels`
13. `subject_relations`
14. `work_subjects`
15. `editions`
16. `edition_works`
17. `edition_expressions`
18. `edition_agents`
19. `identifier_schemes`
20. `bibliographic_identifiers`
21. `digital_assets`
22. `rights_statements`
23. `work_relations`
24. `work_contents`
25. `edition_toc_entries`

### Sources et imports

26. `source_systems`
27. `source_records`
28. `source_record_links`
29. `import_jobs`
30. `import_records`

### Coffre personnel

31. `user_bookshelves`
32. `user_book_items`
33. `user_collections`
34. `user_collection_items`
35. `user_reading_progress`
36. `user_reading_history`

### Gouvernance

37. `catalog_role_assignments`
38. `catalog_audit_events`

`search_documents` et les index de recherche avancée sont réservés à une migration dédiée après définition des parcours de recherche et validation sur un jeu de données représentatif. Le modèle multilingue permet dès maintenant d’ajouter cette couche sans refondre les tables bibliographiques.

## 4. Règles d’intégrité à traduire dans le SQL

1. Toutes les tables métier possèdent une clé primaire stable de type `UUID` ; `gen_random_uuid()` peut fournir la valeur par défaut sur le socle PostgreSQL retenu.
2. Les dates techniques sont en `TIMESTAMPTZ`. Les dates bibliographiques incertaines sont conservées avec des bornes d’année (`year_from`, `year_to`) et un libellé source, plutôt qu’en inventant une date exacte.
3. Les valeurs contrôlées évolutives utilisent des codes et contraintes/référentiels, pas des types ENUM PostgreSQL difficiles à faire évoluer.
4. Les associations œuvre/expression/édition sont protégées par des clés étrangères composites pour garantir que l’expression appartient réellement à l’œuvre et que l’édition contient effectivement cette œuvre.
5. Les tables polymorphes autorisées (`bibliographic_identifiers`, `rights_statements`, `source_record_links`) ont un `CHECK` imposant exactement une cible non nulle (`num_nonnulls(...) = 1`) et une vraie clé étrangère sur chaque cible possible. Les liens de provenance peuvent aussi cibler un agent ou un sujet.
6. Les contraintes `CHECK` restent locales à la ligne. Elles ne servent pas à vérifier des cycles ou des données dans d’autres tables.
7. Les cycles sont bloqués pour `work_contents`, la hiérarchie des sujets et la hiérarchie de la table des matières par des contrôles transactionnels avec protection contre les écritures concurrentes.
8. Les clés de catalogue ne sont pas supprimées en cascade lorsqu’elles sont référencées par des ouvrages personnels ou des données de provenance. On préfère archiver/désactiver les notices. Les suppressions en cascade sont réservées aux véritables données enfants d’un coffre personnel.
9. Les imports sont idempotents : un même enregistrement source ne doit pas créer une nouvelle notice à chaque relance. La clé externe de source, sa version et l’empreinte du contenu sont conservées.
10. Toutes les contraintes de rôle, de langue, d’état, de politique d’accès et de progression sont accompagnées de tests positifs et négatifs.

## 5. Sécurité et séparation entre Nexus et la bibliothèque

La bibliothèque n’émet aucun jeton et ne gère aucun mot de passe.

### Contrat minimum de l’API

1. Le serveur reçoit le jeton de Nexus Science.
2. Il vérifie signature, émetteur (`iss`), audience (`aud`), expiration et autres contrôles requis avec la configuration officielle de Nexus.
3. Il extrait l’identifiant canonique et immuable du sujet (`sub`).
4. Il ouvre une transaction SQL et transmet l’identité vérifiée à la base dans le contexte de cette transaction.
5. La base applique les politiques de lignes aux tables personnelles.
6. La transaction se termine ; le contexte local d’identité est automatiquement nettoyé.

Pour Neon, le mécanisme SQL envisagé est un contexte transactionnel (`SET LOCAL` / `set_config(..., true)`) alimenté uniquement par le serveur après vérification du jeton. **Ce mécanisme n’authentifie pas le jeton à lui seul.** Il ne protège contre l’usurpation que si les identifiants de connexion DB restent privés côté serveur et qu’aucun client final ne peut se connecter directement avec le rôle applicatif.

Les politiques RLS seront activées sur toutes les tables personnelles. Le rôle d’exécution applicatif ne sera ni propriétaire des tables, ni superutilisateur, ni doté de `BYPASSRLS`. Les migrations utiliseront un rôle distinct. Les tests RLS devront être exécutés avec le véritable rôle applicatif à privilèges limités, pas uniquement en tant que propriétaire.

Les rôles de bibliothèque (`catalog_admin`, `catalog_editor`, `catalog_importer`, `rights_reviewer`) sont des autorisations métier attribuées à un `nexus_user_id` vérifié. Ils ne créent pas de comptes locaux.

## 6. Recherche multilingue

Le schéma conserve les balises BCP 47 sur les expressions et libellés. La recherche doit choisir une configuration linguistique en fonction de la langue du document et de la requête ; un seul dictionnaire anglais ne convient pas à un catalogue français, anglais et portugais.

Pour le premier palier : recherche structurée sur titres, auteurs, identifiants, sujets et filtres, avec index B-tree ciblés. Une migration dédiée ajoutera le plein texte PostgreSQL (configurations linguistiques explicites, index GIN et documents de recherche dérivés) après définition des besoins de classement et tests sur des notices réelles. Les langues non encore configurées auront une stratégie de repli non destructrice (`simple`), pas une exclusion du catalogue.

Pas d’extension `pg_trgm`, `pgvector`, `unaccent` ou autre dans la migration initiale sans décision séparée, justification et vérification de disponibilité sur les deux environnements PostgreSQL.

## 7. Provenance et stratégie d’import

Chaque source est déclarée dans `source_systems` avec son URL, ses conditions d’utilisation, son mode de collecte autorisé et les règles d’attribution. `source_records` préserve l’identifiant externe, la version, la date de récupération, l’empreinte et le contenu bibliographique brut utile. `source_record_links` indique quelles notices internes sont décrites, étayées ou contredites par chaque enregistrement source.

Les imports ne fusionnent jamais automatiquement deux œuvres sur la seule base d’un titre ressemblant. La déduplication s’appuie d’abord sur les identifiants forts, puis sur une proposition de rapprochement avec revue en cas d’incertitude.

Pour Open Library, il faut respecter les recommandations du service : ses API publiques ne sont pas destinées à servir de backend pour un téléchargement massif des métadonnées ; privilégier les dumps proposés pour les traitements en volume et les API pour les consultations ciblées.

Les métadonnées bibliographiques peuvent être conservées même si aucun texte intégral n’est disponible. Un fichier ne sera ni copié, ni présenté comme téléchargeable sans preuve de droits applicable.

## 8. Types, index et suppression

- Identifiants primaires : `UUID`.
- Références externes Nexus : `TEXT` jusqu’à validation du contrat d’identité.
- Langues : codes BCP 47 en `TEXT` référencés par `languages`.
- Positions de lecture et charges sources : `JSONB` avec versionnement et limites de taille applicatives.
- Dates techniques : `TIMESTAMPTZ`.
- Tailles de fichiers : `BIGINT` avec contrôle de positivité.
- Pour les dates historiques : bornes d’année et texte source.

Les index sont planifiés à partir des requêtes et relations. PostgreSQL ne crée pas automatiquement un index sur toutes les colonnes référençantes d’une clé étrangère ; la matrice d’index doit donc inclure les colonnes utilisées pour les jointures, la suppression des dépendances et les parcours fréquents, sans indexer aveuglément chaque colonne.

Les index minimaux couvriront notamment :
- titres normalisés par langue ;
- identifiants normalisés par schéma avec unicité ;
- relations d’œuvres dans les deux directions utiles ;
- associations édition/œuvre et édition/expression ;
- ressources par édition et état d’accès ;
- liens de sujets dans les deux directions ;
- ordre des entrées de table des matières ;
- source + identifiant externe + version ;
- états des tâches d’import ;
- coffre par utilisateur et relations personnelles par coffre ;
- progression par ressource ;
- affectations de rôles actives ;
- audit par cible et date.

## 9. Ordre des migrations proposé

| Migration | Périmètre |
|---|---|
| `001` | Création du schéma `bibliotheque`, fonctions utilitaires minimales et conventions communes |
| `002` | Langues, schémas d’identifiants et référentiels contrôlés |
| `003` | Œuvres, expressions, agents, noms, contributeurs et sujets |
| `004` | Éditions, œuvres d’édition, expressions d’édition et table des matières |
| `005` | Relations, identifiants bibliographiques, ressources numériques et droits |
| `006` | Sources, provenance, imports et idempotence |
| `007` | Coffre personnel, collections, progression et historique |
| `008` | Rôles métier, audit, privilèges SQL, RLS et index de sécurité |
| `009` | Recherche plein texte et optimisation, après validation des parcours de recherche |

Chaque fichier de migration sera versionné, relisible, ordonné, sans `DROP ... CASCADE`, et exécuté dans un environnement isolé avant toute application sur une branche de production.

## 10. Matrice de tests obligatoire avant toute production

### Tests d’intégrité bibliographique

- Créer une œuvre avec plusieurs expressions et langues.
- Créer une édition avec plusieurs œuvres.
- Créer une édition bilingue avec deux expressions de la même œuvre.
- Refuser une expression qui n’appartient pas à l’œuvre déclarée.
- Refuser une édition préférée qui ne contient pas l’œuvre du coffre.
- Créer une anthologie ordonnée et une table des matières mêlant œuvres et sections structurelles.
- Refuser un cycle dans `work_contents`, les sujets et la table des matières.
- Autoriser plusieurs formes de nom et identifiants pour un même agent sans doublon normalisé.

### Tests d’identifiants, provenance et droits

- Refuser zéro cible ou plusieurs cibles dans une table polymorphe.
- Refuser un identifiant normalisé déjà attribué au même schéma.
- Valider les règles de format et de cible de l’ISBN, DOI et identifiants externes.
- Réimporter le même enregistrement source sans créer de doublon.
- Conserver la preuve, la date et la source d’une déclaration de droits.
- Refuser consultation/téléchargement/redistribution quand le droit est `unknown`, `prohibited`, expiré ou soumis à une condition non satisfaite.
- Vérifier qu’une permission sur une œuvre ne rend pas automatiquement son fichier téléchargeable.

### Tests d’isolation utilisateur

- Créer deux coffres avec deux identifiants Nexus distincts.
- Vérifier que l’utilisateur A ne peut ni lire, ni modifier, ni supprimer les données de B.
- Vérifier qu’une collection ne peut référencer un ouvrage absent du coffre correspondant.
- Vérifier qu’une progression est unique par coffre et ressource.
- Simuler deux appareils sauvegardant la même progression et vérifier le contrôle de révision.
- Exécuter ces tests avec le rôle applicatif réel, RLS activé, jamais uniquement avec le propriétaire des tables.

### Tests de migration et exploitation

- Construire la base depuis zéro avec toutes les migrations dans l’ordre.
- Rejouer les contrôles de cohérence et les tests négatifs.
- Vérifier restauration/dump et présence de toutes les contraintes.
- Contrôler les index et les plans sur un jeu synthétique représentatif.
- Vérifier qu’un échec d’import peut être repris sans duplication.
- Vérifier l’archivage d’une notice sans casser les coffres et les historiques.

## 11. État réel de Neon et limites de validation

Contrôle en lecture seule effectué le 24 novembre 2026 :

- Projet : `lucky-shape-21861035`.
- Branche : `production` (`br-misty-bar-bex3tbyd`), branche par défaut.
- Base : `neondb`, schéma observé : `public` uniquement.
- Aucun objet applicatif présent dans `public`.
- Compteur de données écrites retourné par Neon : `0 bytes`.
- La branche `production` est actuellement indiquée comme **non protégée**.

Aucune table, fonction, contrainte, extension, politique RLS, branche supplémentaire ou migration n’a été créée. Aucun SQL n’a été exécuté. La branche de production n’a pas été modifiée.

Avant les premières migrations, il faudra créer une branche de développement enfant de `production`, la protéger contre les opérations accidentelles selon les possibilités du plan, et faire passer toutes les migrations et tests sur cette branche. La branche `production` devra être protégée avant d’accueillir des données réelles.

## 12. Critère de sortie : prêt pour la génération SQL

La conception est maintenant suffisamment déterminée pour produire les fichiers SQL initiaux sans dépendre d’un choix de modèle bibliographique encore ouvert.

En revanche, **« prêt à générer le SQL » ne signifie pas « SQL validé pour la production »**. La validation finale exigera :

1. génération des migrations SQL versionnées ;
2. revue statique de chaque migration ;
3. création autorisée d’une branche Neon de développement ;
4. exécution des migrations sur cette branche ;
5. exécution complète de la matrice de tests, dont RLS sous rôle applicatif limité ;
6. revue des résultats et des plans d’exécution ;
7. approbation explicite avant toute application sur la branche `production`.

Les seules données encore nécessaires à l’intégration applicative — et non à la création des tables — sont le contrat exact du jeton Nexus (`iss`, `aud`, `sub` et source JWKS/configuration officielle) et le choix de l’API serveur qui consommera la base. Ils ne doivent pas être inventés ni remplacés par une authentification locale.

---

## Références techniques

- IFLA, *Library Reference Model* : https://www.ifla.org/wp-content/uploads/2019/05/assets/cataloguing/frbr-lrm/ifla-lrm-august-2017_rev201712.pdf
- Library of Congress, *Overview of the BIBFRAME 2.0 Model* : https://www.loc.gov/bibframe/docs/bibframe2-model.html
- IETF, BCP 47 (RFC 5646 et RFC 4647) : https://www.rfc-editor.org/info/bcp47/
- International ISBN Agency, *Domaine d’application de l’ISBN* : https://www.isbn-international.org/fr/content/domaine-dapplication-de-lisbn/25
- PostgreSQL 18, contraintes et clés étrangères : https://www.postgresql.org/docs/18/ddl-constraints.html
- PostgreSQL 18, sécurité au niveau des lignes : https://www.postgresql.org/docs/18/ddl-rowsecurity.html
- PostgreSQL 18, recherche plein texte : https://www.postgresql.org/docs/18/textsearch.html
- Open Library, recommandations d’utilisation de ses API : https://openlibrary.org/developers/api

## 13. Contrat de colonnes pour la génération SQL

Les noms ci-dessous constituent le contrat de schéma proposé. Les colonnes techniques `created_at` et `updated_at` sont ajoutées aux entités modifiables ; les tables d’association pures n’ont pas besoin de répétitions inutiles de ces colonnes. Les champs `id` utilisent `UUID` avec valeur générée côté base. Les valeurs de statut et de rôle seront des `TEXT` avec contraintes `CHECK` ou référentiels, afin de rester évolutives.

### 13.1 Référentiels, œuvres et expressions

**`languages`**
- `code TEXT PRIMARY KEY` — balise BCP 47.
- `name_native TEXT NOT NULL`, `name_english TEXT`, `is_active BOOLEAN NOT NULL DEFAULT TRUE`, `created_at TIMESTAMPTZ NOT NULL`.
- Validation syntaxique BCP 47 côté service d’ingestion ; le référentiel ne doit pas empêcher d’enregistrer temporairement une langue inconnue en quarantaine.

**`works`**
- `work_id UUID PRIMARY KEY`.
- `work_type TEXT NOT NULL` — valeurs initiales proposées : `monograph`, `collective`, `reference`, `series`, `component`, `other`.
- `description TEXT`, `creation_year_from INTEGER`, `creation_year_to INTEGER`, `creation_date_display TEXT`.
- `record_status TEXT NOT NULL DEFAULT 'active'` — `active`, `provisional`, `superseded`, `withdrawn`.
- `created_at`, `updated_at TIMESTAMPTZ NOT NULL`.
- Contrôle : année positive ; si les deux bornes existent, `creation_year_from <= creation_year_to`.

**`work_expressions`**
- `expression_id UUID PRIMARY KEY`, `work_id UUID NOT NULL REFERENCES works`.
- `expression_type TEXT NOT NULL` — `original`, `translation`, `revision`, `abridgment`, `adaptation`, `other`.
- `description TEXT`, `record_status TEXT NOT NULL DEFAULT 'active'`.
- `created_at`, `updated_at TIMESTAMPTZ NOT NULL`.
- `UNIQUE (work_id, expression_id)` est requis pour les clés étrangères composites aval.

**`expression_languages`**
- `expression_id UUID NOT NULL REFERENCES work_expressions`, `language_code TEXT NOT NULL REFERENCES languages`.
- `is_primary BOOLEAN NOT NULL DEFAULT FALSE`, `language_role TEXT NOT NULL DEFAULT 'content'`.
- `PRIMARY KEY (expression_id, language_code)`.
- Index unique partiel : une seule langue primaire par expression. Plusieurs langues de contenu peuvent être déclarées.

**`expression_titles`**
- `expression_title_id UUID PRIMARY KEY`, `expression_id UUID NOT NULL`, `language_code TEXT REFERENCES languages`.
- `title_type TEXT NOT NULL` — `preferred`, `variant`, `parallel`, `translated`, `uniform`, `other`.
- `title_text TEXT NOT NULL`, `normalized_title TEXT NOT NULL`, `is_preferred BOOLEAN NOT NULL DEFAULT FALSE`, `sequence_no INTEGER NOT NULL DEFAULT 1`.
- `created_at TIMESTAMPTZ NOT NULL`.
- Index de recherche sur `(language_code, normalized_title)` ; index unique partiel garantissant au plus un titre préféré par expression et langue.

### 13.2 Agents et contribution intellectuelle

**`agents`**
- `agent_id UUID PRIMARY KEY`, `agent_type TEXT NOT NULL` — `person`, `corporate_body`, `family`, `meeting`, `jurisdiction`, `other`.
- `description TEXT`, `record_status TEXT NOT NULL DEFAULT 'active'`.
- `created_at`, `updated_at TIMESTAMPTZ NOT NULL`.

**`agent_names`**
- `agent_name_id UUID PRIMARY KEY`, `agent_id UUID NOT NULL REFERENCES agents`.
- `language_code TEXT REFERENCES languages`, `script_code TEXT`, `name_type TEXT NOT NULL` — `preferred`, `variant`, `authorized`, `transliterated`, `other`.
- `name_text TEXT NOT NULL`, `normalized_name TEXT NOT NULL`, `sort_name TEXT`, `is_preferred BOOLEAN NOT NULL DEFAULT FALSE`.
- Index sur `(normalized_name)` et index unique partiel pour la forme préférée par agent, langue et type de nom.

**`agent_identifiers`**
- `agent_identifier_id UUID PRIMARY KEY`, `agent_id UUID NOT NULL REFERENCES agents`.
- `scheme_code TEXT NOT NULL REFERENCES identifier_schemes`, `identifier_value TEXT NOT NULL`, `normalized_value TEXT NOT NULL`.
- `UNIQUE (scheme_code, normalized_value)` ; index sur `agent_id`.

**`work_agents`**
- `work_id UUID NOT NULL REFERENCES works`, `agent_id UUID NOT NULL REFERENCES agents`.
- `role_code TEXT NOT NULL`, `sequence_no INTEGER NOT NULL DEFAULT 1`, `contribution_note TEXT`.
- `PRIMARY KEY (work_id, agent_id, role_code)` ; index inverse `(agent_id, work_id)`.

**`expression_agents`**
- `expression_id UUID NOT NULL REFERENCES work_expressions`, `agent_id UUID NOT NULL REFERENCES agents`.
- `role_code TEXT NOT NULL`, `sequence_no INTEGER NOT NULL DEFAULT 1`, `contribution_note TEXT`.
- `PRIMARY KEY (expression_id, agent_id, role_code)` ; index inverse `(agent_id, expression_id)`.

**`edition_agents`**
- `edition_id UUID NOT NULL REFERENCES editions`, `agent_id UUID NOT NULL REFERENCES agents`.
- `role_code TEXT NOT NULL` — rôles initiaux : `publisher`, `distributor`, `manufacturer`, `printer`, `other`.
- `sequence_no INTEGER NOT NULL DEFAULT 1`, `place_text TEXT`.
- `PRIMARY KEY (edition_id, agent_id, role_code)` ; index sur `(agent_id, edition_id)`.

### 13.3 Sujets

**`subjects`**
- `subject_id UUID PRIMARY KEY`, `subject_type TEXT NOT NULL` — `concept`, `place`, `event`, `time_period`, `other`.
- `scope_note TEXT`, `record_status TEXT NOT NULL DEFAULT 'active'`.
- `created_at`, `updated_at TIMESTAMPTZ NOT NULL`.

**`subject_labels`**
- `subject_label_id UUID PRIMARY KEY`, `subject_id UUID NOT NULL REFERENCES subjects`.
- `language_code TEXT REFERENCES languages`, `label_type TEXT NOT NULL` — `preferred`, `variant`, `authorized`, `other`.
- `label_text TEXT NOT NULL`, `normalized_label TEXT NOT NULL`, `is_preferred BOOLEAN NOT NULL DEFAULT FALSE`.
- Index sur `(language_code, normalized_label)` ; au plus un libellé préféré par sujet et langue.

**`subject_relations`**
- `subject_relation_id UUID PRIMARY KEY`, `subject_id UUID NOT NULL REFERENCES subjects`, `related_subject_id UUID NOT NULL REFERENCES subjects`.
- `relation_type TEXT NOT NULL` — `broader_than`, `related_to`, `equivalent_to`.
- `created_at TIMESTAMPTZ NOT NULL`.
- `CHECK (subject_id <> related_subject_id)` ; unicité du triplet ; contrôle transactionnel des cycles pour `broader_than`.

**`work_subjects`**
- `work_id UUID NOT NULL REFERENCES works`, `subject_id UUID NOT NULL REFERENCES subjects`.
- `relevance_code TEXT`, `sequence_no INTEGER NOT NULL DEFAULT 1`.
- `PRIMARY KEY (work_id, subject_id)` ; index inverse `(subject_id, work_id)`.

### 13.4 Éditions, contenu et table des matières

**`editions`**
- `edition_id UUID PRIMARY KEY`.
- `edition_type TEXT NOT NULL` — `print`, `ebook`, `audiobook`, `braille`, `microform`, `manuscript`, `other`.
- `title_statement TEXT`, `edition_statement TEXT`, `publication_place_text TEXT`.
- `publication_year_from INTEGER`, `publication_year_to INTEGER`, `publication_date_display TEXT`.
- `extent_text TEXT`, `physical_details TEXT`, `format_note TEXT`.
- `record_status TEXT NOT NULL DEFAULT 'active'`.
- `created_at`, `updated_at TIMESTAMPTZ NOT NULL`.
- Contrôle des bornes d’année ; aucune borne supérieure figée à 2026 dans le SQL.

**`edition_works`**
- `edition_id UUID NOT NULL REFERENCES editions`, `work_id UUID NOT NULL REFERENCES works`.
- `content_role TEXT NOT NULL DEFAULT 'main'`, `sequence_no INTEGER NOT NULL DEFAULT 1`.
- `PRIMARY KEY (edition_id, work_id)` ; `UNIQUE (edition_id, sequence_no)` si l’ordre est requis et non nul.
- Index inverse `(work_id, edition_id)`.

**`edition_expressions`**
- `edition_id UUID NOT NULL`, `work_id UUID NOT NULL`, `expression_id UUID NOT NULL`.
- `PRIMARY KEY (edition_id, work_id, expression_id)`.
- FK `(edition_id, work_id)` vers `edition_works` et FK `(work_id, expression_id)` vers `work_expressions`.
- Cette double FK est une règle centrale : l’édition doit contenir l’œuvre et l’expression doit appartenir à cette œuvre.

**`edition_toc_entries`**
- `entry_id UUID PRIMARY KEY`, `edition_id UUID NOT NULL REFERENCES editions`.
- `parent_entry_id UUID`, `sequence_no INTEGER NOT NULL`, `entry_kind TEXT NOT NULL`.
- `title_text TEXT NOT NULL`, `language_code TEXT REFERENCES languages`.
- `work_id UUID`, `expression_id UUID`, `locator_start TEXT`, `locator_end TEXT`.
- `UNIQUE (edition_id, entry_id)` pour la référence parent dans la même édition.
- FK `(edition_id, parent_entry_id)` vers `(edition_id, entry_id)` ; si `work_id` est renseigné, FK vers `edition_works` ; si `expression_id` est renseigné, FK composite vers `edition_expressions`.
- Contrôle : `expression_id` ne peut être renseigné sans `work_id`. Les sections structurelles peuvent n’avoir ni œuvre ni expression. L’ordre des racines et celui des enfants ont chacun un index unique partiel adapté.
- Cycle de parenté interdit par contrôle transactionnel.

### 13.5 Identifiants, ressources et droits

**`identifier_schemes`**
- `scheme_code TEXT PRIMARY KEY`, `scheme_name TEXT NOT NULL`.
- `identifier_domain TEXT NOT NULL` — `agent` ou `bibliographic`.
- `normalization_rule TEXT NOT NULL`, `validation_rule TEXT`, `is_active BOOLEAN NOT NULL DEFAULT TRUE`.
- Les règles d’applicabilité de chaque schéma sont explicites : par exemple ISBN pour une édition, ORCID pour un agent. Elles sont vérifiées par un validateur dédié et testées ; ne pas déduire qu’un identifiant est valide sur la seule base de son apparence.

**`bibliographic_identifiers`**
- `bibliographic_identifier_id UUID PRIMARY KEY`, `scheme_code TEXT NOT NULL REFERENCES identifier_schemes`.
- `identifier_value TEXT NOT NULL`, `normalized_value TEXT NOT NULL`.
- `work_id UUID`, `expression_id UUID`, `edition_id UUID`, `digital_asset_id UUID`.
- `is_preferred BOOLEAN NOT NULL DEFAULT FALSE`, `created_at TIMESTAMPTZ NOT NULL`.
- `CHECK` exige exactement une cible non nulle ; chaque colonne cible a sa vraie FK.
- `UNIQUE (scheme_code, normalized_value)` ; index sur chacune des colonnes de cible utiles.

**`digital_assets`**
- `digital_asset_id UUID PRIMARY KEY`, `edition_id UUID NOT NULL REFERENCES editions`.
- `asset_type TEXT NOT NULL` — `full_text`, `excerpt`, `cover`, `audio`, `supplement`, `other`.
- `delivery_format TEXT`, `mime_type TEXT`, `language_code TEXT REFERENCES languages`.
- `provider_url TEXT`, `storage_bucket TEXT`, `storage_key TEXT`.
- `file_size_bytes BIGINT`, `checksum_sha256 TEXT`, `checksum_verified_at TIMESTAMPTZ`.
- `access_status TEXT NOT NULL DEFAULT 'metadata_only'` — `metadata_only`, `external_link`, `available`, `withdrawn`, `quarantined`.
- `created_at`, `updated_at TIMESTAMPTZ NOT NULL`.
- Contrôles : taille positive si présente ; checksum au format attendu ; une ressource stockée doit avoir une clé de stockage et une ressource distante doit avoir une URL.

**`rights_statements`**
- `rights_statement_id UUID PRIMARY KEY`.
- Cibles nullable : `work_id`, `expression_id`, `edition_id`, `digital_asset_id` ; exactement une est non nulle, avec FK.
- `consultation_policy TEXT NOT NULL`, `download_policy TEXT NOT NULL`, `redistribution_policy TEXT NOT NULL` ; valeurs : `allowed`, `prohibited`, `conditional`, `unknown`, `not_applicable`.
- `rights_basis TEXT NOT NULL`, `jurisdiction_code TEXT`, `conditions_text TEXT`.
- `evidence_uri TEXT`, `evidence_note TEXT`, `verified_by_nexus_user_id TEXT`, `verified_at TIMESTAMPTZ`.
- `valid_from TIMESTAMPTZ`, `valid_until TIMESTAMPTZ`, `created_at TIMESTAMPTZ NOT NULL`.
- Contrôles : période valide ; une déclaration `allowed` nécessite une vérification et une preuve ou justification documentée. `conditional` nécessite une description de condition. Aucun statut `unknown` ne peut conduire à une autorisation.

**`work_relations`**
- `work_relation_id UUID PRIMARY KEY`, `source_work_id UUID NOT NULL REFERENCES works`, `target_work_id UUID NOT NULL REFERENCES works`.
- `relation_type TEXT NOT NULL` — `continues`, `preceded_by`, `adaptation_of`, `inspired_by`, `translation_related_to`, `complements`, `related_to`, `other`.
- `relation_note TEXT`, `created_at TIMESTAMPTZ NOT NULL`.
- Refus des relations d’une œuvre vers elle-même ; unicité du couple source/cible/type.

**`work_contents`**
- `parent_work_id UUID NOT NULL REFERENCES works`, `child_work_id UUID NOT NULL REFERENCES works`.
- `component_role TEXT NOT NULL`, `sequence_no INTEGER NOT NULL DEFAULT 1`.
- `PRIMARY KEY (parent_work_id, child_work_id)` ; refus d’auto-composition et contrôle transactionnel anti-cycle.

### 13.6 Sources et imports

**`source_systems`**
- `source_system_id UUID PRIMARY KEY`, `source_code TEXT UNIQUE NOT NULL`, `display_name TEXT NOT NULL`.
- `base_url TEXT`, `terms_url TEXT`, `api_policy_url TEXT`, `attribution_text TEXT`.
- `bulk_access_method TEXT`, `permitted_use_note TEXT`, `is_active BOOLEAN NOT NULL DEFAULT TRUE`, `policy_checked_at TIMESTAMPTZ`.

**`source_records`**
- `source_record_id UUID PRIMARY KEY`, `source_system_id UUID NOT NULL REFERENCES source_systems`.
- `external_record_id TEXT NOT NULL`, `source_record_version TEXT NOT NULL DEFAULT 'unknown'`.
- `retrieved_at TIMESTAMPTZ NOT NULL`, `payload JSONB NOT NULL`, `payload_sha256 TEXT NOT NULL`.
- `record_language_code TEXT REFERENCES languages`, `record_status TEXT NOT NULL DEFAULT 'new'`.
- `UNIQUE (source_system_id, external_record_id, source_record_version)`.

**`source_record_links`**
- `source_record_link_id UUID PRIMARY KEY`, `source_record_id UUID NOT NULL REFERENCES source_records`.
- Cibles nullable : `work_id`, `expression_id`, `edition_id`, `digital_asset_id`, `agent_id`, `subject_id` ; exactement une cible non nulle, avec FK.
- `link_type TEXT NOT NULL` — `describes`, `supports`, `same_as`, `supersedes`, `contradicts`, `related_to`.
- `match_method TEXT NOT NULL` — `identifier`, `exact`, `fuzzy`, `manual`.
- `confidence NUMERIC(4,3)`, `reviewed_by_nexus_user_id TEXT`, `reviewed_at TIMESTAMPTZ`.
- Unicité du lien source/cible/type ; contrôle de `confidence` dans `[0,1]`.

**`import_jobs`**
- `import_job_id UUID PRIMARY KEY`, `source_system_id UUID NOT NULL REFERENCES source_systems`.
- `job_type TEXT NOT NULL`, `status TEXT NOT NULL`, `parameters JSONB NOT NULL DEFAULT '{}'::jsonb`.
- `initiated_by_nexus_user_id TEXT`, `started_at TIMESTAMPTZ`, `completed_at TIMESTAMPTZ`.
- `records_seen BIGINT NOT NULL DEFAULT 0`, `records_created BIGINT NOT NULL DEFAULT 0`, `records_updated BIGINT NOT NULL DEFAULT 0`, `records_skipped BIGINT NOT NULL DEFAULT 0`, `records_failed BIGINT NOT NULL DEFAULT 0`.
- Contrôles : compteurs non négatifs ; dates de fin cohérentes avec l’état.

**`import_records`**
- `import_record_id UUID PRIMARY KEY`, `import_job_id UUID NOT NULL REFERENCES import_jobs`, `source_record_id UUID NOT NULL REFERENCES source_records`.
- `outcome TEXT NOT NULL`, `attempt_count INTEGER NOT NULL DEFAULT 1`, `error_code TEXT`, `error_detail TEXT`, `processed_at TIMESTAMPTZ`.
- `UNIQUE (import_job_id, source_record_id)` ; index sur `import_job_id, outcome` pour reprise des échecs.

### 13.7 Coffre personnel et gouvernance

**`user_bookshelves`**
- `bookshelf_id UUID PRIMARY KEY`, `nexus_user_id TEXT NOT NULL UNIQUE`.
- `created_at`, `updated_at TIMESTAMPTZ NOT NULL`.
- Aucun mot de passe, e-mail ou jeton Nexus n’est stocké ici.

**`user_book_items`**
- `bookshelf_id UUID NOT NULL REFERENCES user_bookshelves`, `work_id UUID NOT NULL REFERENCES works`.
- `preferred_edition_id UUID`, `shelf_status TEXT NOT NULL DEFAULT 'to_read'`.
- `is_favorite BOOLEAN NOT NULL DEFAULT FALSE`, `personal_rating SMALLINT`, `personal_note TEXT`.
- `added_at TIMESTAMPTZ NOT NULL`, `updated_at TIMESTAMPTZ NOT NULL`.
- `PRIMARY KEY (bookshelf_id, work_id)` ; FK `(preferred_edition_id, work_id)` vers `edition_works` ; note personnelle et notation restent privées.

**`user_collections`**
- `collection_id UUID PRIMARY KEY`, `bookshelf_id UUID NOT NULL REFERENCES user_bookshelves`.
- `name TEXT NOT NULL`, `normalized_name TEXT NOT NULL`, `description TEXT`, `sort_order INTEGER NOT NULL DEFAULT 0`.
- `created_at`, `updated_at TIMESTAMPTZ NOT NULL`.
- `UNIQUE (bookshelf_id, collection_id)` et unicité du nom normalisé au sein du coffre. Les collections sont privées en V1 ; le partage est hors périmètre.

**`user_collection_items`**
- `bookshelf_id UUID NOT NULL`, `collection_id UUID NOT NULL`, `work_id UUID NOT NULL`.
- `sort_order INTEGER NOT NULL DEFAULT 0`, `added_at TIMESTAMPTZ NOT NULL`.
- `PRIMARY KEY (collection_id, work_id)`.
- FK `(bookshelf_id, collection_id)` vers `user_collections` et FK `(bookshelf_id, work_id)` vers `user_book_items` afin d’empêcher les liens croisés entre utilisateurs ou vers des œuvres non présentes dans le coffre.

**`user_reading_progress`**
- `progress_id UUID PRIMARY KEY`, `bookshelf_id UUID NOT NULL REFERENCES user_bookshelves`, `digital_asset_id UUID NOT NULL REFERENCES digital_assets`.
- `position JSONB NOT NULL`, `position_schema_version INTEGER NOT NULL DEFAULT 1`.
- `progress_percent NUMERIC(5,2)`, `last_locator TEXT`, `revision_number BIGINT NOT NULL DEFAULT 1`.
- `last_read_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ NOT NULL`.
- `UNIQUE (bookshelf_id, digital_asset_id)` ; pourcentage entre 0 et 100 si renseigné ; le service met à jour avec contrôle optimiste de `revision_number`.

**`user_reading_history`**
- `reading_event_id UUID PRIMARY KEY`, `bookshelf_id UUID NOT NULL REFERENCES user_bookshelves`, `digital_asset_id UUID REFERENCES digital_assets`.
- `event_type TEXT NOT NULL`, `position_snapshot JSONB`, `event_details JSONB NOT NULL DEFAULT '{}'::jsonb`.
- `occurred_at TIMESTAMPTZ NOT NULL`.
- Index `(bookshelf_id, occurred_at DESC)` et `(bookshelf_id, digital_asset_id, occurred_at DESC)` ; politique de rétention et effacement utilisateur définie avant mise en service.

**`catalog_role_assignments`**
- `assignment_id UUID PRIMARY KEY`, `nexus_user_id TEXT NOT NULL`, `role_code TEXT NOT NULL`.
- `assigned_by_nexus_user_id TEXT NOT NULL`, `is_active BOOLEAN NOT NULL DEFAULT TRUE`.
- `starts_at TIMESTAMPTZ NOT NULL`, `ends_at TIMESTAMPTZ`.
- Unicité partielle d’une attribution active par couple utilisateur/rôle ; seuls les administrateurs de catalogue peuvent attribuer ou retirer les rôles.

**`catalog_audit_events`**
- `audit_event_id UUID PRIMARY KEY`, `actor_nexus_user_id TEXT`, `action_code TEXT NOT NULL`.
- `target_type TEXT NOT NULL`, `target_id UUID`, `before_values JSONB`, `after_values JSONB`.
- `request_id TEXT`, `occurred_at TIMESTAMPTZ NOT NULL`.
- Journal réservé aux actions de gestion du catalogue et des droits. Aucun jeton, secret, mot de passe, contenu privé de lecture ou donnée personnelle superflue n’y est copié. Les événements ne sont pas supprimés en cascade.

## 14. Paramètres fixés et paramètres volontairement différés

### Fixés pour le SQL initial

- schéma `bibliotheque` ; PostgreSQL 17+ ; identifiants UUID ; timestamps avec fuseau ; aucune extension obligatoire ; modèle œuvre/expression/édition/ressource ; métadonnées multilingues BCP 47 ; agents génériques ; éditions collectives et bilingues ; table des matières mixte ; provenance idempotente ; droits prudents ; coffre par identifiant Nexus ; progression par ressource ; RLS des tables personnelles ; index de base et migrations versionnées.

### Différés sans bloquer le catalogue relationnel

- le moteur exact de recherche plein texte et son classement ;
- recherche sémantique/vectorielle ;
- partage public ou entre utilisateurs des collections ;
- synchronisation temps réel ;
- stockage des fichiers et choix du fournisseur ;
- contrat précis `iss` / `aud` / `sub` / JWKS de Nexus, qui conditionne le middleware API et la configuration finale de RLS, pas le modèle bibliographique lui-même ;
- éventuelle migration physique de Neon vers Supabase.

Ces sujets sont différés volontairement pour éviter d’introduire une dépendance ou une extension avant que le besoin, les permissions et le fournisseur soient établis.

## 15. Invariants supplémentaires à ne pas perdre pendant la rédaction du SQL

1. **Rôles contrôlés.** Les `role_code` seront limités par des `CHECK` adaptés à chaque table : rôles de création au niveau œuvre (`author`, `creator`, `compiler`, `editor`, `contributor`, etc.), rôles de réalisation au niveau expression (`translator`, `reviser`, `abridger`, `adapter`, `annotator`, `narrator`, etc.) et rôles de publication au niveau édition (`publisher`, `distributor`, `manufacturer`, `printer`, `producer`, `other`). Il ne faut pas accepter n’importe quelle chaîne fournie par un import externe.
2. **États contrôlés.** Les valeurs `record_status`, `access_status`, `job_type`, `import_records.outcome`, `event_type`, les politiques de droits et les types de relations disposent chacune d’un jeu de valeurs explicitement défini dans le SQL. Les états ne doivent pas être dispersés sous des orthographes différentes.
3. **Notices incomplètes.** Une notice peut être `provisional` pendant un import et ne pas avoir encore tous ses agents, expressions ou identifiants. La mise en état `active` doit passer par une validation applicative qui vérifie les éléments bibliographiques minimaux. Ne pas imposer de fausses valeurs pour satisfaire des `NOT NULL` non justifiés.
4. **Langues inconnues.** Si une source fournit un code de langue non reconnu, l’import place la notice en attente de résolution ; il ne doit pas convertir silencieusement la langue en français ou en anglais. Le service peut ajouter le code BCP 47 valide au référentiel après vérification.
5. **Suppression.** Les UUID des œuvres, expressions, éditions et agents sont immuables. Une fusion de doublons se fait par relation de remplacement/succession et audit, pas en réutilisant l’identifiant de la notice survivante ni en supprimant en cascade les liens des utilisateurs.
6. **Fichiers.** Les fichiers eux-mêmes ne sont pas placés dans des colonnes `BYTEA` du catalogue. La base conserve les métadonnées, l’empreinte, l’emplacement de stockage ou l’URL fournisseur ; le service de fichiers vérifie droits, antivirus/validation de format et autorisation avant de signer ou délivrer une URL.
7. **RLS et fonctions auxiliaires.** Les fonctions utilisées dans les politiques RLS doivent être minimales, qualifiées par schéma, avec `search_path` fixé et `EXECUTE` retiré à `PUBLIC` lorsque nécessaire. Une fonction `SECURITY DEFINER` éventuelle doit appartenir à un rôle propriétaire contrôlé, et ne doit jamais être un moyen de contourner les vérifications du serveur Nexus.
8. **Rôles SQL.** Le propriétaire des objets, le rôle de migration et le rôle d’exécution API sont séparés. La création et la configuration des rôles Neon seront un script d’environnement distinct des migrations de tables ; aucun secret de rôle ne sera commité dans Git.
9. **Atomicité.** Les migrations de structure sont exécutées dans une transaction quand PostgreSQL le permet. Les opérations qui ne sont pas transactionnelles, si elles sont nécessaires, sont isolées dans une migration explicitement documentée avec procédure de reprise.
10. **Compatibilité.** Pas de type ou fonction exclusivement Neon, pas de trigger dépendant de l’API Neon, pas d’extension non disponible dans PostgreSQL 17. Une migration future vers Supabase devra principalement adapter le pont d’identité et les rôles/politiques d’accès, pas réécrire le catalogue.

## 16. Décision finale de préparation

**GO pour la rédaction des migrations SQL initiales sur une branche de développement isolée.** Le modèle relationnel, les relations composites essentielles, les cibles polymorphes, la politique de droits, l’identité externe, les règles de confidentialité et la séquence de migrations sont définis.

**NO-GO pour l’exécution sur `production` ou pour annoncer la base prête à recevoir des utilisateurs.** Il manque encore les migrations SQL effectivement écrites, leur exécution sur une branche enfant, les tests d’intégrité/RLS et la revue des résultats. Ce sont des étapes de validation technique, pas des décisions de modèle encore ouvertes.