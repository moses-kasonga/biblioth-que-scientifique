# Open Library bulk-ingestion runbook

This workflow prepares and validates a reviewable import plan for the Bibliotheque Scientifique catalogue. It does not write to Neon.

## Scope and source policy

- Use the official monthly Open Library dumps for bulk extraction. The public Search API is for low-volume discovery, not mass harvesting.
- Keep Edition, Work and Author records separate. Preserve the source identifier, source revision and original JSON payload.
- Restrict the initial selection to scientific/research subjects and publication years 1720–2026. The first planned batch may contain up to 100,000 Editions.
- Import bibliographic metadata only. Do not download, copy, proxy or redistribute book files as part of this workflow.
- Rights for metadata and rights for full-text assets are separate questions. Any later asset-ingestion flow requires item-level rights evidence.

## Commands

Run from the repository root with Node.js 22+:

    node scripts/scan-openlibrary-dump.mjs --editions ./dumps/ol_dump_editions_latest.txt.gz --works ./dumps/ol_dump_works_latest.txt.gz --authors ./dumps/ol_dump_authors_latest.txt.gz --from-year 1720 --to-year 2026 --max-editions 100000 --out-dir ./openlibrary-dump-scan

    node scripts/prepare-openlibrary-import.mjs --input-dir ./openlibrary-dump-scan --out-dir ./openlibrary-import-package --max-editions 100000

    node scripts/verify-openlibrary-package.mjs --package-dir ./openlibrary-import-package

    node scripts/plan-openlibrary-import.mjs --package-dir ./openlibrary-import-package --out-dir ./openlibrary-import-plan --batch-size 500

    node scripts/verify-openlibrary-import-plan.mjs --plan-dir ./openlibrary-import-plan

The scanner, package builder, package verifier, planner and plan verifier are offline tools. They do not read environment variables, connect to Neon, or mutate catalogue records.

## Actual catalogue mapping

The plan targets the bibliotheque schema and mirrors its normalized model:

- Authors become provisional Agent proposals with preferred and alternate names. Remote identifiers and biographical fields remain review candidates.
- Works become provisional Work + Expression proposals. The title is stored under expression_titles, not on works.
- Editions become provisional Edition proposals with the Edition title statement, publication year, Open Library ID and ISBN candidates.
- Edition-to-Work and Work-to-Agent associations are emitted as relationship proposals.
- Source-to-catalogue links are emitted as provenance proposals.
- Publisher names, free-text subject labels, language observations, inferred sequence order and unsupported identifiers remain visible for human review. They are not silently inserted into controlled reference tables.

work_type, edition_type and expression_type use conservative other values where the source does not establish a more precise classification. first_publish_year is not written into a Work creation-year field. Edition language codes are not assigned to an Expression until the exact Expression is known.

## Batch integrity and resume model

Each JSONL file is one transaction boundary. Each operation carries a SHA-256-derived stable operation ID and idempotency key. Dependencies point only to earlier operations. The manifest records each batch checksum, sequence, operation count and boundary IDs.

Before execution, verify every batch again. A future executor must:
1. verify the plan and the exact approved Neon branch;
2. create one import job and checkpoint each committed batch;
3. process each batch in one database transaction;
4. use operation IDs for idempotent resume;
5. record per-source outcomes in import_records;
6. refuse review-required records and any operation whose schema or dependency checks fail;
7. require an explicit approval switch and a development-only branch allow-list.

No database executor is enabled by this change. A generated plan is not an authorization to execute it.
