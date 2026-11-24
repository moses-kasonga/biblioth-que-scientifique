import {
  mapDiscipline,
  normalizeLanguage,
  parsePublicationYear,
} from "./doab-import-core.mjs";

function asText(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (typeof value === "object") return asText(value.value ?? value.text ?? value.name ?? value.label ?? "");
  return "";
}

function list(value) {
  if (value == null) return [];
  const items = Array.isArray(value) ? value : [value];
  return items.map(asText).filter(Boolean);
}

function openLibraryWorkId(value) {
  const key = asText(value);
  const match = key.match(/(?:^|\/)works\/(OL[0-9]+W)$/i);
  return match ? match[1].toUpperCase() : (/^OL[0-9]+W$/i.test(key) ? key.toUpperCase() : null);
}

export function mapOpenLibraryWork(raw) {
  const key = asText(raw?.key);
  const externalRecordId = openLibraryWorkId(key);
  const title = asText(raw?.title);
  const publicationYear = parsePublicationYear(raw?.first_publish_year);
  const authors = [...new Set(list(raw?.author_name))];
  const rawLanguages = list(raw?.language);
  const language = normalizeLanguage(rawLanguages[0]);
  const subjects = [...new Set(list(raw?.subject))];
  const editionKeys = [...new Set(list(raw?.edition_key))];
  const candidateIsbns = [...new Set(list(raw?.isbn))];
  const issues = ["work_level_record_requires_edition_resolution"];

  if (!externalRecordId) issues.push("missing_external_record_id");
  if (!title) issues.push("missing_title");
  if (!publicationYear) issues.push("missing_or_unparsed_publication_year");
  else if (publicationYear < 1720 || publicationYear > 2026) issues.push("publication_year_outside_project_scope");
  if (authors.length === 0) issues.push("missing_contributors");
  if (!language) issues.push("unsupported_or_missing_language");

  return {
    externalRecordId,
    recordVersion: null,
    recordUrl: externalRecordId ? "https://openlibrary.org/works/" + externalRecordId : null,
    title,
    authors,
    editors: [],
    publisher: "",
    publicationYear,
    publicationDateDisplay: publicationYear ? String(publicationYear) : null,
    language,
    rawLanguage: rawLanguages[0] ?? null,
    subjects,
    disciplines: mapDiscipline(subjects),
    // Work-level Search API rows can aggregate identifiers from multiple Editions.
    // Never attach those ISBNs to an invented single Edition.
    isbns: [],
    dois: [],
    isbnIdentifiers: [],
    doiIdentifiers: [],
    rawIdentifiers: [],
    editionKeys,
    candidateIsbns,
    editionCount: Number.isInteger(raw?.edition_count) ? raw.edition_count : null,
    rightsEvidence: [],
    issues: [...new Set(issues)],
    raw,
  };
}

export function normalizeOpenLibraryPayload(payload) {
  const records = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.docs)
      ? payload.docs
      : Array.isArray(payload?.records)
        ? payload.records
        : null;
  if (!records) throw new Error("Format Open Library non reconnu : docs absent.");
  return records.map(mapOpenLibraryWork);
}
