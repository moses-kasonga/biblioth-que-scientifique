import {
  mapDiscipline,
  normalizeLanguage,
  normalizeIsbn,
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

function openLibraryIdentifier(value) {
  const key = asText(value);
  const match = key.match(/(OL[0-9]+[WM])$/i);
  if (!match) return null;
  const id = match[1].toUpperCase();
  return { id, level: id.endsWith("M") ? "edition" : "work" };
}

export function mapOpenLibraryWork(raw) {
  const key = asText(raw?.key);
  const identifier = openLibraryIdentifier(key);
  const externalRecordId = identifier?.id ?? null;
  const title = asText(raw?.title);
  const publicationYear = parsePublicationYear(raw?.first_publish_year);
  const authors = [...new Set(list(raw?.author_name))];
  const rawLanguages = list(raw?.language);
  const language = normalizeLanguage(rawLanguages[0]);
  const subjects = [...new Set(list(raw?.subject))];
  const editionKeys = [...new Set(list(raw?.edition_key))];
  const candidateIsbns = [...new Set(list(raw?.isbn))];
  const editionResolved = identifier?.level === "edition" &&
    editionKeys.length === 1 && editionKeys[0].toUpperCase() === externalRecordId;
  const issues = editionResolved ? [] : ["work_level_record_requires_edition_resolution"];
  const isbnIdentifiers = editionResolved
    ? candidateIsbns
        .map((sourceValue) => ({ sourceValue, normalizedValue: normalizeIsbn(sourceValue) }))
        .filter((item) => item.normalizedValue)
        .filter((item, index, all) =>
          all.findIndex((candidate) => candidate.normalizedValue === item.normalizedValue) === index
        )
    : [];

  if (!externalRecordId) issues.push("missing_external_record_id");
  if (!title) issues.push("missing_title");
  if (!publicationYear) issues.push("missing_or_unparsed_publication_year");
  else if (publicationYear < 1720 || publicationYear > 2026) issues.push("publication_year_outside_project_scope");
  if (authors.length === 0) issues.push("missing_contributors");
  if (!language) issues.push("unsupported_or_missing_language");

  return {
    externalRecordId,
    recordVersion: null,
    recordUrl: externalRecordId
      ? "https://openlibrary.org/" + (editionResolved ? "books/" : "works/") + externalRecordId
      : null,
    title,
    authors,
    editors: [],
    publisher: editionResolved ? list(raw?.publisher)[0] ?? "" : "",
    publicationYear,
    publicationDateDisplay: publicationYear ? String(publicationYear) : null,
    language,
    rawLanguage: rawLanguages[0] ?? null,
    subjects,
    disciplines: mapDiscipline(subjects),
    // A single M-keyed result with one matching edition_key is edition-level.
    // Otherwise keep aggregated ISBNs as candidates without attaching them to one Edition.
    isbns: isbnIdentifiers.map((item) => item.normalizedValue),
    dois: [],
    isbnIdentifiers,
    doiIdentifiers: [],
    rawIdentifiers: editionResolved ? candidateIsbns : [],
    editionKeys,
    candidateIsbns,
    editionCount: Number.isInteger(raw?.edition_count) ? raw.edition_count : null,
    rightsEvidence: [],
    identifierLevel: identifier?.level ?? "unknown",
    issues: [
      ...new Set([
        ...issues,
        ...(editionResolved && candidateIsbns.length > 0 && isbnIdentifiers.length === 0
          ? ["bibliographic_identifiers_failed_validation"]
          : []),
      ]),
    ],
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
