import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";

export const dynamic = "force-dynamic";

const globalForCatalogue = globalThis as typeof globalThis & {
  cataloguePool?: Pool;
};

function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured for this deployment.");
  }

  if (!globalForCatalogue.cataloguePool) {
    const pool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 5_000,
      maxLifetimeSeconds: 300,
      application_name: "bibliotheque-scientifique-preview",
    });
    attachDatabasePool(pool);
    globalForCatalogue.cataloguePool = pool;
  }

  return globalForCatalogue.cataloguePool;
}

const MAX_PAGE_SIZE = 40;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
  const discipline = url.searchParams.get("discipline") ?? "all";
  const publicationType = url.searchParams.get("type") ?? "all";
  const fromYear = Number(url.searchParams.get("from") ?? 1720);
  const toYear = Number(url.searchParams.get("to") ?? 2026);
  const requestedLanguage = (url.searchParams.get("lang") ?? "fr").slice(0, 10);
  const language = ["fr", "en", "es", "pt"].includes(requestedLanguage) ? requestedLanguage : "fr";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(url.searchParams.get("limit") ?? 20) || 20));
  const offset = (page - 1) * limit;

  if (
    !Number.isInteger(fromYear) ||
    !Number.isInteger(toYear) ||
    fromYear < 1 ||
    toYear < fromYear ||
    toYear > 9999
  ) {
    return Response.json(
      { code: "INVALID_YEAR_RANGE", message: "The publication year range is invalid." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const allowedDisciplines = new Set([
    "natural", "math", "physics", "chemistry", "biology",
    "medicine", "computing", "earth", "engineering", "humanities"
  ]);
  const allowedTypes = new Set([
    "book", "monograph", "thesis", "proceedings", "report", "article", "other"
  ]);

  if (discipline !== "all" && !allowedDisciplines.has(discipline)) {
    return Response.json({ code: "INVALID_DISCIPLINE" }, { status: 400 });
  }
  if (publicationType !== "all" && !allowedTypes.has(publicationType)) {
    return Response.json({ code: "INVALID_PUBLICATION_TYPE" }, { status: 400 });
  }

  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT
         w.work_id,
         w.work_type,
         w.description,
         COALESCE(
           (SELECT min(e.publication_year_from)
            FROM bibliotheque.edition_works ew
            JOIN bibliotheque.editions e ON e.edition_id = ew.edition_id
            WHERE ew.work_id = w.work_id),
           w.creation_year_from
         ) AS publication_year_from,
         COALESCE(
           (SELECT max(e.publication_year_to)
            FROM bibliotheque.edition_works ew
            JOIN bibliotheque.editions e ON e.edition_id = ew.edition_id
            WHERE ew.work_id = w.work_id),
           w.creation_year_to
         ) AS publication_year_to,
         COALESCE(
           (
             SELECT jsonb_agg(jsonb_build_object(
               'title', et.title_text,
               'language', et.language_code,
               'preferred', et.is_preferred
             ) ORDER BY et.is_preferred DESC, et.sequence_no)
             FROM bibliotheque.expression_titles et
             JOIN bibliotheque.work_expressions we
               ON we.expression_id = et.expression_id
             WHERE we.work_id = w.work_id
           ),
           '[]'::jsonb
         ) AS titles,
         COALESCE(
           (
             SELECT jsonb_agg(jsonb_build_object(
               'code', wd.discipline_code,
               'label', dl.label,
               'primary', wd.is_primary
             ) ORDER BY wd.is_primary DESC, dl.label)
             FROM bibliotheque.work_disciplines wd
             JOIN bibliotheque.discipline_labels dl
               ON dl.discipline_code = wd.discipline_code
              AND dl.language_code = $1
             WHERE wd.work_id = w.work_id
           ),
           '[]'::jsonb
         ) AS disciplines,
         COALESCE(
           (
             SELECT jsonb_agg(jsonb_build_object(
               'code', wpt.publication_type_code,
               'label', ptl.label,
               'primary', wpt.is_primary
             ) ORDER BY wpt.is_primary DESC, ptl.label)
             FROM bibliotheque.work_publication_types wpt
             JOIN bibliotheque.publication_type_labels ptl
               ON ptl.publication_type_code = wpt.publication_type_code
              AND ptl.language_code = $1
             WHERE wpt.work_id = w.work_id
           ),
           '[]'::jsonb
         ) AS publication_types
       FROM bibliotheque.works w
       WHERE w.record_status IN ('active', 'provisional')
         AND (
           $2 = ''
           OR EXISTS (
             SELECT 1
             FROM bibliotheque.expression_titles et
             JOIN bibliotheque.work_expressions we
               ON we.expression_id = et.expression_id
             WHERE we.work_id = w.work_id
               AND et.title_text ILIKE '%' || $2 || '%'
           )
           OR EXISTS (
             SELECT 1
             FROM bibliotheque.work_agents wa
             JOIN bibliotheque.agent_names an ON an.agent_id = wa.agent_id
             WHERE wa.work_id = w.work_id
               AND an.name_text ILIKE '%' || $2 || '%'
           )
           OR EXISTS (
             SELECT 1
             FROM bibliotheque.work_subjects ws
             JOIN bibliotheque.subject_labels sl ON sl.subject_id = ws.subject_id
             WHERE ws.work_id = w.work_id
               AND sl.label_text ILIKE '%' || $2 || '%'
           )
           OR EXISTS (
             SELECT 1
             FROM bibliotheque.bibliographic_identifiers bi
             WHERE bi.work_id = w.work_id
               AND bi.identifier_value ILIKE '%' || $2 || '%'
           )
         )
         AND (
           $3 = 'all'
           OR EXISTS (
             SELECT 1 FROM bibliotheque.work_disciplines wd
             WHERE wd.work_id = w.work_id AND wd.discipline_code = $3
           )
         )
         AND (
           $4 = 'all'
           OR EXISTS (
             SELECT 1 FROM bibliotheque.work_publication_types wpt
             WHERE wpt.work_id = w.work_id AND wpt.publication_type_code = $4
           )
         )
         AND (
           EXISTS (
             SELECT 1
             FROM bibliotheque.edition_works ew
             JOIN bibliotheque.editions e ON e.edition_id = ew.edition_id
             WHERE ew.work_id = w.work_id
               AND COALESCE(e.publication_year_to, e.publication_year_from, 9999) >= $5
               AND COALESCE(e.publication_year_from, e.publication_year_to, 1) <= $6
           )
           OR (
             NOT EXISTS (
               SELECT 1
               FROM bibliotheque.edition_works ew
               JOIN bibliotheque.editions e ON e.edition_id = ew.edition_id
               WHERE ew.work_id = w.work_id
                 AND (e.publication_year_from IS NOT NULL OR e.publication_year_to IS NOT NULL)
             )
             AND COALESCE(w.creation_year_to, w.creation_year_from, 9999) >= $5
             AND COALESCE(w.creation_year_from, w.creation_year_to, 1) <= $6
           )
         )
       ORDER BY w.updated_at DESC, w.work_id
       LIMIT $7 OFFSET $8`,
      [
        language,
        query,
        discipline,
        publicationType,
        fromYear,
        toYear,
        limit,
        offset,
      ]
    );

    return Response.json(
      {
        data: result.rows,
        pagination: { page, limit, returned: result.rowCount ?? result.rows.length },
        available: true,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Catalogue query failed", error);
    return Response.json(
      {
        code: "CATALOGUE_UNAVAILABLE",
        message: "The catalogue could not be queried at this time.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
