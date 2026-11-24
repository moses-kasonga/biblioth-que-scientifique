# PVI-001 — Protocole de validation des importations

- **Projet :** Bibliothèque Scientifique — Nexus Science
- **Version :** 1.0
- **Date de référence :** 24 novembre 2026
- **Périmètre :** imports de métadonnées dans le schéma `bibliotheque`
- **Statut :** protocole initial vérifié sur la branche Neon de développement

## 1. Objectif

Ce protocole définit les contrôles à exécuter après chaque lot d'importation documentaire. Un import techniquement terminé n'est pas automatiquement un lot bibliographiquement validé, et une notice créée n'est pas une notice publiée.

Les contrôles portent sur cinq garanties :

1. connaître le résultat du lot et le détail de chaque notice ;
2. repérer les identifiants ISBN/DOI associés à plusieurs œuvres ;
3. identifier les notices provisoires sans langue ou année exploitable ;
4. garantir la traçabilité entre chaque œuvre et sa notice source ;
5. empêcher l'importateur de créer des fichiers numériques ou des droits.

## 2. Règles d'exécution

- Exécuter les requêtes sur la **branche Neon de développement** prévue pour le lot, dans la base `neondb` et le schéma `bibliotheque`.
- Vérifier le projet et l'identifiant de branche dans la console Neon avant de commencer. **Ne jamais remplacer la branche de développement par `production`.**
- Les requêtes de ce document sont des lectures `SELECT`. Elles n'écrivent, ne corrigent et ne suppriment aucune donnée.
- Exécuter les contrôles avec un rôle d'audit disposant des lectures nécessaires. Le rôle applicatif `bibliotheque_reader` ou le rôle d'import `bibliotheque_importer` ne doit pas être élargi pour faciliter l'audit.
- Le contrôle des privilèges et le comptage des tables `digital_assets` et `rights_statements` peuvent nécessiter le rôle propriétaire ou un rôle d'audit autorisé. Ne pas utiliser le rôle propriétaire dans l'application ou dans le script d'import.
- Conserver le résultat des contrôles avec l'identifiant du lot, la source, la date, les nombres et les anomalies constatées.
- Les années sont évaluées dans le périmètre historique demandé, de **1720 à 2026 inclus**.

## 3. Contrôle 1 — Bilan du dernier lot

### 1A. Résumé du lot le plus récent

```sql
WITH latest_job AS (
    SELECT
        ij.import_job_id,
        ss.display_name AS source_name,
        ij.status,
        ij.records_seen,
        ij.records_created,
        ij.records_updated,
        ij.records_skipped,
        ij.records_failed,
        ij.started_at,
        ij.completed_at
    FROM bibliotheque.import_jobs ij
    LEFT JOIN bibliotheque.source_systems ss
        ON ss.source_system_id = ij.source_system_id
    ORDER BY ij.started_at DESC NULLS LAST, ij.created_at DESC
    LIMIT 1
),
detail AS (
    SELECT
        import_job_id,
        COUNT(*) FILTER (WHERE outcome = 'created') AS outcome_created,
        COUNT(*) FILTER (WHERE outcome = 'review_required') AS outcome_review_required,
        COUNT(*) FILTER (WHERE outcome = 'skipped') AS outcome_skipped,
        COUNT(*) FILTER (WHERE outcome = 'failed') AS outcome_failed,
        COUNT(*) AS outcome_rows
    FROM bibliotheque.import_records
    GROUP BY import_job_id
)
SELECT
    j.*,
    COALESCE(d.outcome_created, 0) AS detail_created,
    COALESCE(d.outcome_review_required, 0) AS detail_review_required,
    COALESCE(d.outcome_skipped, 0) AS detail_skipped,
    COALESCE(d.outcome_failed, 0) AS detail_failed,
    COALESCE(d.outcome_rows, 0) AS detail_rows
FROM latest_job j
LEFT JOIN detail d ON d.import_job_id = j.import_job_id;
```

### 1B. Détail des résultats individuels du dernier lot

```sql
WITH latest_job AS (
    SELECT import_job_id
    FROM bibliotheque.import_jobs
    ORDER BY started_at DESC NULLS LAST, created_at DESC
    LIMIT 1
)
SELECT
    ir.outcome,
    COUNT(*) AS records_count,
    COUNT(*) FILTER (WHERE ir.error_detail IS NOT NULL) AS records_with_detail
FROM bibliotheque.import_records ir
JOIN latest_job lj ON lj.import_job_id = ir.import_job_id
GROUP BY ir.outcome
ORDER BY ir.outcome;
```

### Interprétation obligatoire des compteurs

L'importateur DOAB actuel utilise les résultats individuels suivants : `created`, `review_required`, `skipped` et `failed`.

- `records_seen` : nombre de notices uniques retenues pour l'exécution.
- `records_created` : nombre d'œuvres provisoires créées dans le catalogue. Ce total **inclut les œuvres créées avec le résultat `review_required`**.
- `records_skipped` : total qui inclut les notices `skipped` et `review_required` dans la version actuelle de l'importateur.
- `records_failed` : notices dont le traitement a échoué.
- `detail_review_required` : nombre de notices consignées en revue dans `import_records`. Elles ne doivent pas être publiées sans examen.
- `detail_created` : nombre de notices dont le traitement s'est terminé avec le résultat `created`, sans signalement de revue par le normaliseur.

Les compteurs du lot et les lignes de `import_records` ne sont pas nécessairement identiques : actuellement, une notice sans identifiant externe est comptée comme échec par le script, mais ne peut pas être inscrite dans `import_records` sans `source_record_id`. Toute différence doit être expliquée dans le rapport du lot. Elle ne doit pas être masquée en forçant artificiellement l'égalité des compteurs.

## 4. Contrôle 2 — Doublons d'identifiants normalisés

### 2A. Même ISBN/DOI associé à plusieurs œuvres

```sql
SELECT
    bi.scheme_code,
    bi.normalized_value,
    COUNT(DISTINCT COALESCE(bi.work_id, we.work_id, ew.work_id)) AS distinct_works,
    COUNT(*) AS identifier_rows
FROM bibliotheque.bibliographic_identifiers bi
LEFT JOIN bibliotheque.work_expressions we
    ON we.expression_id = bi.expression_id
LEFT JOIN bibliotheque.edition_works ew
    ON ew.edition_id = bi.edition_id
WHERE bi.normalized_value IS NOT NULL
  AND bi.scheme_code IN ('isbn', 'doi')
GROUP BY bi.scheme_code, bi.normalized_value
HAVING COUNT(DISTINCT COALESCE(bi.work_id, we.work_id, ew.work_id)) > 1
ORDER BY distinct_works DESC, identifier_rows DESC;
```

**Résultat attendu : aucune ligne.** Toute ligne retournée doit être examinée avant validation du lot. Une correspondance d'identifiant ne justifie jamais une fusion automatique d'œuvres.

Le modèle actuel impose également l'unicité de la paire `scheme_code` / `normalized_value`. Cette contrainte empêche la répétition physique d'un même identifiant normalisé dans la table ; le contrôle ci-dessus vérifie en plus qu'un identifiant n'est pas associé à plusieurs œuvres.

### 2B. Notices mises en revue à cause d'une correspondance d'identifiant

Le contrôle 2A ne remplace pas la revue des collisions détectées avant insertion. L'importateur actuel conserve ces cas en `review_required` et crée un lien `same_as` sans fusionner les notices.

```sql
WITH latest_job AS (
    SELECT import_job_id
    FROM bibliotheque.import_jobs
    ORDER BY started_at DESC NULLS LAST, created_at DESC
    LIMIT 1
)
SELECT
    ir.import_job_id,
    sr.external_record_id,
    ir.outcome,
    ir.error_detail,
    srl.work_id AS matched_work_id,
    srl.edition_id AS matched_edition_id
FROM bibliotheque.import_records ir
JOIN latest_job lj ON lj.import_job_id = ir.import_job_id
JOIN bibliotheque.source_records sr
    ON sr.source_record_id = ir.source_record_id
JOIN bibliotheque.source_record_links srl
    ON srl.source_record_id = sr.source_record_id
WHERE ir.outcome = 'review_required'
  AND srl.link_type = 'same_as'
ORDER BY sr.external_record_id;
```

Chaque correspondance doit être examinée par une personne habilitée. Le lien de rapprochement est une suggestion de revue, pas une fusion canonique.

## 5. Contrôle 3 — Langue et année de publication

Cette requête recherche les œuvres provisoires pour lesquelles aucune expression ne possède une langue référencée dans `languages`, ou aucune édition liée ne possède une année (ou plage d'années) qui recoupe 1720–2026.

```sql
SELECT
    w.work_id,
    w.record_status,
    (
        SELECT et.title_text
        FROM bibliotheque.work_expressions we
        JOIN bibliotheque.expression_titles et
            ON et.expression_id = we.expression_id
        WHERE we.work_id = w.work_id
        ORDER BY et.is_preferred DESC NULLS LAST,
                 et.sequence_no ASC NULLS LAST
        LIMIT 1
    ) AS title,
    NOT EXISTS (
        SELECT 1
        FROM bibliotheque.work_expressions we
        JOIN bibliotheque.expression_languages el
            ON el.expression_id = we.expression_id
        JOIN bibliotheque.languages l
            ON l.code = el.language_code
        WHERE we.work_id = w.work_id
    ) AS missing_valid_language,
    NOT EXISTS (
        SELECT 1
        FROM bibliotheque.edition_works ew
        JOIN bibliotheque.editions e
            ON e.edition_id = ew.edition_id
        WHERE ew.work_id = w.work_id
          AND COALESCE(e.publication_year_from, e.publication_year_to) <= 2026
          AND COALESCE(e.publication_year_to, e.publication_year_from) >= 1720
    ) AS missing_usable_publication_year
FROM bibliotheque.works w
WHERE w.record_status = 'provisional'
  AND (
      NOT EXISTS (
          SELECT 1
          FROM bibliotheque.work_expressions we
          JOIN bibliotheque.expression_languages el
              ON el.expression_id = we.expression_id
          JOIN bibliotheque.languages l
              ON l.code = el.language_code
          WHERE we.work_id = w.work_id
      )
      OR NOT EXISTS (
          SELECT 1
          FROM bibliotheque.edition_works ew
          JOIN bibliotheque.editions e
              ON e.edition_id = ew.edition_id
          WHERE ew.work_id = w.work_id
            AND COALESCE(e.publication_year_from, e.publication_year_to) <= 2026
            AND COALESCE(e.publication_year_to, e.publication_year_from) >= 1720
      )
  )
ORDER BY w.created_at;
```

Les résultats doivent rester au statut provisoire et être envoyés en revue. Une langue absente ou une date inconnue ne doit jamais être inventée pour satisfaire le contrôle.

## 6. Contrôle 4 — Provenance de chaque œuvre

L'importateur DOAB crée un lien direct `source_record_links.work_id` pour chaque œuvre qu'il crée. Le contrôle doit donc retourner zéro œuvre sans ce lien.

```sql
SELECT COUNT(*) AS works_without_direct_source_provenance
FROM bibliotheque.works w
WHERE NOT EXISTS (
    SELECT 1
    FROM bibliotheque.source_record_links srl
    WHERE srl.work_id = w.work_id
);
```

**Seuil d'acceptation : 0.** Si le résultat est supérieur à zéro, identifier les œuvres et leur source documentaire avant toute validation. Si une future procédure de catalogage manuel est autorisée sans record externe, elle devra définir une forme de provenance alternative explicite ; elle ne doit pas être confondue avec l'import automatique.

## 7. Contrôle 5 — Ressources numériques et droits

### 5A. Vérifier les privilèges de l'importateur

Le rôle `bibliotheque_importer` ne doit pas pouvoir insérer, modifier, supprimer ou tronquer des lignes dans les tables de ressources et de droits.

```sql
SELECT
    'digital_assets' AS table_name,
    has_table_privilege('bibliotheque_importer', 'bibliotheque.digital_assets', 'INSERT') AS can_insert,
    has_table_privilege('bibliotheque_importer', 'bibliotheque.digital_assets', 'UPDATE') AS can_update,
    has_table_privilege('bibliotheque_importer', 'bibliotheque.digital_assets', 'DELETE') AS can_delete,
    has_table_privilege('bibliotheque_importer', 'bibliotheque.digital_assets', 'TRUNCATE') AS can_truncate
UNION ALL
SELECT
    'rights_statements',
    has_table_privilege('bibliotheque_importer', 'bibliotheque.rights_statements', 'INSERT'),
    has_table_privilege('bibliotheque_importer', 'bibliotheque.rights_statements', 'UPDATE'),
    has_table_privilege('bibliotheque_importer', 'bibliotheque.rights_statements', 'DELETE'),
    has_table_privilege('bibliotheque_importer', 'bibliotheque.rights_statements', 'TRUNCATE');
```

**Seuil d'acceptation : `false` pour les quatre privilèges et pour les deux tables.** Exécuter ce contrôle avec un rôle capable d'inspecter les privilèges du rôle d'import.

### 5B. Photographier les volumes de ressources et de droits

```sql
SELECT
    (SELECT COUNT(*) FROM bibliotheque.digital_assets) AS total_digital_assets,
    (SELECT COUNT(*) FROM bibliotheque.rights_statements) AS total_rights_statements;
```

Pour le premier pilote sur une base vide, les deux totaux doivent rester à zéro. Pour les lots futurs, ces totaux peuvent légitimement devenir supérieurs à zéro à la suite d'une vérification documentaire manuelle distincte. Il faut alors comparer les mesures prises immédiatement avant et après le lot, dans une fenêtre sans opération manuelle concurrente.

Le critère permanent est le suivant : l'importateur ne reçoit aucun privilège d'écriture sur ces tables et le pipeline ne crée jamais de fichier numérique ni de déclaration de droits par déduction automatique des seules métadonnées.

## 8. Décision de validation du lot

Le lot peut être déclaré **techniquement terminé** lorsque le job est terminé et que les erreurs sont recensées.

Le lot ne peut être déclaré **bibliographiquement validé** qu'après les vérifications suivantes :

| Contrôle | Critère |
|---|---|
| Bilan du lot | Chaque écart de comptage est expliqué ; les échecs sont recensés |
| Notices en revue | Chaque `review_required` est affectée à une revue humaine ; aucune publication automatique |
| Doublons inter-œuvres | Aucune collision non résolue |
| Langue et année | Les lacunes sont conservées en provisoire et affectées à une revue |
| Provenance | `works_without_direct_source_provenance = 0` |
| Privilèges de l'importateur | Aucun INSERT, UPDATE, DELETE ou TRUNCATE sur `digital_assets` et `rights_statements` |
| Ressources et droits | Aucune création automatique pendant le lot ; tout ajout ultérieur passe par une procédure de vérification distincte |

Une notice avec résultat `created` reste une notice au statut `provisional` dans le catalogue. La réussite technique du pipeline ne vaut ni validation scientifique, ni validation juridique, ni autorisation de consultation, téléchargement ou redistribution d'un fichier.

## 9. Trace d'audit à conserver

Pour chaque exécution, conserver au minimum :

- l'identifiant `import_job_id`, la source et la branche Neon ciblée ;
- la version du code d'import et le SHA du commit Git ;
- le nom du fichier source et son empreinte SHA-256, sans déposer le fichier brut dans Git ;
- `records_seen`, `records_created`, `records_updated`, `records_skipped`, `records_failed` ;
- le détail des résultats `created`, `review_required`, `skipped`, `failed` ;
- les sorties des contrôles 2 à 5 ;
- les anomalies, décisions de revue, responsables et dates de résolution.

Ne jamais conserver un mot de passe, une URL de connexion avec identifiants ou un secret dans le rapport d'audit.

## 10. Vérification initiale du protocole

Le 24 novembre 2026, les requêtes de contrôle ont été exécutées en lecture seule sur la branche Neon de développement `schema-development-2026-11-24` (`br-bold-hall-be9s4awg`), base `neondb`.

Résultats constatés à cette date :

- aucun lot d'importation enregistré ;
- aucune collision ISBN/DOI ni notice provisoire à signaler ;
- zéro œuvre sans provenance directe ;
- `bibliotheque_importer` ne dispose d'aucun privilège INSERT, UPDATE ou DELETE sur `digital_assets` et `rights_statements` ;
- zéro ressource numérique et zéro déclaration de droits.

Cette vérification valide la compatibilité SQL des contrôles avec le schéma actuellement déployé et confirme l'état vide de départ. **Elle ne constitue pas la validation d'un import réel** : aucun lot de notices réelles n'a encore été exécuté. Les requêtes doivent être rejouées après le premier pilote DOAB.

---

**Document de référence :** `docs/IMPORT_VALIDATION_PROTOCOL.md`  
**Procédure d'exécution des imports :** [IMPORT_PIPELINE.md](./IMPORT_PIPELINE.md)
