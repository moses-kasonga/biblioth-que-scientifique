import {
  mapDiscipline,
  normalizeDoi,
  normalizeIsbn,
  normalizeLanguage,
  parsePublicationYear,
} from "./doab-import-core.mjs";

function asText(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (typeof value === "object") return asText(value.display_name ?? value.name ?? value.value ?? value.label ?? "");
  return "";
}

function unique(values) {
  return [...new Set(values.map(asText).filter(Boolean))];
}

function openAlexWorkId(value) {
  const id = asText(value);
  const match = id.match(/(?:^|\/)(W[0-9A-Z]+)$/i);
  return match ? match[1].toUpperCase() : (/^W[0-9A-Z]+$/i.test(id) ? id.toUpperCase() : null);
}

function normalizeIdentifiers(values, normalizer) {
  return unique(values)
    .map((sourceValue) => ({ sourceValue, normalizedValue: normalizer(sourceValue) }))
    .filter((item) => item.normalizedValue)
    .filter((item, index, all) =>
      all.findIndex((candidate) => candidate.normalizedValue === item.normalizedValue) === index
    );
}

export function mapOpenAlexWork(raw) {
  const externalRecordId = openAlexWorkId(raw?.id ?? raw?.ids?.openalex);
  const title = asText(raw?.display_name ?? raw?.title);
  const year = parsePublicationYear(raw?.publication_year ?? raw?.publication_date);
  const language = normalizeLanguage(raw?.language);
  const authors = [];
  const editors = [];

  for (const authorship of Array.isArray(raw?.authorships) ? raw.authorships : []) {
    const name = asText(authorship?.author?.display_name ?? authorship?.raw_author_name);
    if (!name) continue;
    const roles = Array.isArray(authorship?.contributor_roles) ? authorship.contributor_roles : [];
    const isEditor = roles.some((role) => {
      const label = asText(role?.display_name).toLowerCase();
      const id = asText(role?.id).toLowerCase();
      return label === "editor" || id.endsWith("/editor");
    });
    (isEditor ? editors : authors).push(name);
  }

  const topics = [...(Array.isArray(raw?.topics) ? raw.topics : []), raw?.primary_topic];
  const subjects = unique([
    ...(Array.isArray(raw?.keywords) ? raw.keywords : []),
    ...topics.map((topic) => topic?.display_name),
    ...topics.map((topic) => topic?.subfield?.display_name),
    ...topics.map((topic) => topic?.field?.display_name),
  ]);

  const doiValues = [raw?.doi, raw?.ids?.doi].filter(Boolean);
  const isbnValues = [
    ...(Array.isArray(raw?.ids?.isbn) ? raw.ids.isbn : [raw?.ids?.isbn]),
    ...(Array.isArray(raw?.biblio?.isbn) ? raw.biblio.isbn : [raw?.biblio?.isbn]),
  ].filter(Boolean);
  const doiIdentifiers = normalizeIdentifiers(doiValues, normalizeDoi);
  const isbnIdentifiers = normalizeIdentifiers(isbnValues, normalizeIsbn);
  const recordType = asText(raw?.type).toLowerCase();

  const issues = [];
  if (!externalRecordId) issues.push("missing_external_record_id");
  if (!title) issues.push("missing_title");
  if (recordType && recordType !== "book") issues.push("unsupported_work_type");
  if (!language) issues.push("unsupported_or_missing_language");
  if (!year) issues.push("missing_or_unparsed_publication_year");
  else if (year < 1720 || year > 2026) issues.push("publication_year_outside_project_scope");
  if (authors.length === 0 && editors.length === 0) issues.push("missing_contributors");
  if ((doiValues.length > 0 && doiIdentifiers.length === 0) ||
      (isbnValues.length > 0 && isbnIdentifiers.length === 0)) {
    issues.push("bibliographic_identifiers_failed_validation");
  }

  const openAccess = raw?.open_access;
  const rightsEvidence = openAccess && typeof openAccess === "object"
    ? ["open_access.is_oa=" + String(Boolean(openAccess.is_oa))]
    : [];

  return {
    externalRecordId,
    recordVersion: asText(raw?.updated_date) || null,
    recordUrl: externalRecordId ? "https://openalex.org/works/" + externalRecordId : null,
    title,
    authors: unique(authors),
    editors: unique(editors),
    publisher: "",
    publicationYear: year,
    publicationDateDisplay: asText(raw?.publication_date) || null,
    language,
    rawLanguage: asText(raw?.language) || null,
    subjects,
    disciplines: mapDiscipline(subjects),
    isbns: isbnIdentifiers.map((item) => item.normalizedValue),
    dois: doiIdentifiers.map((item) => item.normalizedValue),
    isbnIdentifiers,
    doiIdentifiers,
    rawIdentifiers: [...unique(doiValues), ...unique(isbnValues)],
    rightsEvidence,
    issues: [...new Set(issues)],
    raw,
  };
}

export function normalizeOpenAlexPayload(payload) {
  const records = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload?.records)
        ? payload.records
        : payload && typeof payload === "object" && payload.id
          ? [payload]
          : null;

  if (!records) throw new Error("Format OpenAlex non reconnu : le tableau results est absent.");
  return records.map(mapOpenAlexWork);
}
