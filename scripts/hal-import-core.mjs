import {
  mapDiscipline,
  normalizeDoi,
  normalizeIsbn,
  normalizeLanguage,
  parsePublicationYear,
} from "./doab-import-core.mjs";

function values(value) {
  if (value == null) return [];
  const input = Array.isArray(value) ? value : [value];
  return input.flatMap((item) => {
    if (item == null) return [];
    if (typeof item === "string" || typeof item === "number") return [String(item).trim()].filter(Boolean);
    if (typeof item === "object") {
      const candidate = item.value ?? item.text ?? item.name ?? item.label;
      return candidate == null ? [] : values(candidate);
    }
    return [];
  });
}

function unique(items) {
  return [...new Set(items.map((item) => String(item).trim()).filter(Boolean))];
}

function first(record, keys) {
  for (const key of keys) {
    const found = values(record?.[key]);
    if (found.length) return found[0];
  }
  return "";
}

function normalizeIdentifiers(items, normalizer) {
  return unique(items)
    .map((sourceValue) => ({ sourceValue, normalizedValue: normalizer(sourceValue) }))
    .filter((item) => item.normalizedValue)
    .filter((item, index, all) =>
      all.findIndex((candidate) => candidate.normalizedValue === item.normalizedValue) === index
    );
}

export function mapHalRecord(raw) {
  const externalRecordId = first(raw, ["halId_s", "docid"]);
  const titleValues = values(raw?.title_s);
  const title = titleValues[0] ?? "";
  const publicationDate = first(raw, ["publicationDate_s", "producedDate_s"]);
  const year = parsePublicationYear(raw?.producedDateY_i ?? publicationDate);
  const rawLanguage = first(raw, ["language_s"]);
  const language = normalizeLanguage(rawLanguage);
  const authors = values(raw?.authFullName_s);
  const editors = [];
  const publishers = values(raw?.publisher_s);
  const subjectValues = unique([
    ...values(raw?.keyword_s),
    ...values(raw?.domainAllCode_s),
    ...values(raw?.domain_s),
  ]);
  const doiValues = values(raw?.doiId_s);
  const isbnValues = values(raw?.isbn_s);
  const doiIdentifiers = normalizeIdentifiers(doiValues, normalizeDoi);
  const isbnIdentifiers = normalizeIdentifiers(isbnValues, normalizeIsbn);
  const docType = first(raw, ["docType_s"]).toUpperCase();

  const issues = [];
  if (!externalRecordId) issues.push("missing_external_record_id");
  if (!title) issues.push("missing_title");
  if (docType && docType !== "OUV") issues.push("unsupported_document_type");
  if (!language) issues.push("unsupported_or_missing_language");
  if (!year) issues.push("missing_or_unparsed_publication_year");
  else if (year < 1720 || year > 2026) issues.push("publication_year_outside_project_scope");
  if (authors.length === 0 && editors.length === 0) issues.push("missing_contributors");
  if ((doiValues.length > 0 && doiIdentifiers.length === 0) ||
      (isbnValues.length > 0 && isbnIdentifiers.length === 0)) {
    issues.push("bibliographic_identifiers_failed_validation");
  }

  const rightsEvidence = unique([...values(raw?.licence_s), ...values(raw?.license_s)]);
  const recordUrl = first(raw, ["uri_s"]) ||
    (externalRecordId.startsWith("hal-") ? "https://hal.science/" + externalRecordId : null);

  return {
    externalRecordId,
    recordVersion: null,
    recordUrl,
    title,
    authors: unique(authors),
    editors: unique(editors),
    publisher: publishers[0] ?? "",
    publicationYear: year,
    publicationDateDisplay: publicationDate || (year ? String(year) : null),
    language,
    rawLanguage: rawLanguage || null,
    subjects: subjectValues,
    disciplines: mapDiscipline(subjectValues),
    isbns: isbnIdentifiers.map((item) => item.normalizedValue),
    dois: doiIdentifiers.map((item) => item.normalizedValue),
    isbnIdentifiers,
    doiIdentifiers,
    rawIdentifiers: [...unique(isbnValues), ...unique(doiValues)],
    rightsEvidence,
    issues: [...new Set(issues)],
    raw,
  };
}

export function normalizeHalPayload(payload) {
  const records = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.response?.docs)
      ? payload.response.docs
      : Array.isArray(payload?.records)
        ? payload.records
        : null;

  if (!records) throw new Error("Format HAL non reconnu : response.docs est absent.");
  return records.map(mapHalRecord);
}
