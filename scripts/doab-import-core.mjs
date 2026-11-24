const KNOWN_LANGUAGES = new Set(["fr", "en", "es", "pt"]);

export function normalizeText(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

function asString(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (typeof value === "object") {
    return asString(value.value ?? value.text ?? value.label ?? value.name ?? "");
  }
  return "";
}

function unwrapRecord(record) {
  return record?.indexableObject ?? record?.item ?? record?.record ?? record;
}

function collectRecords(payload) {
  if (Array.isArray(payload)) return payload;
  const candidates = [
    payload?.results,
    payload?.items,
    payload?.objects,
    payload?.records,
    payload?._embedded?.items,
    payload?._embedded?.objects,
    payload?._embedded?.searchResult?._embedded?.objects,
    payload?._embedded?.searchResult?._embedded?.items,
    payload?.searchResult?.objects,
    payload?.searchResult?.items,
    payload?.data?.items,
    payload?.data?.results,
  ];
  const found = candidates.find(Array.isArray);
  if (found) return found;
  if (payload && typeof payload === "object" && (payload.metadata || payload.uuid || payload.handle)) {
    return [payload];
  }
  throw new Error("Format DOAB non reconnu : aucun tableau de notices trouvé dans la réponse JSON.");
}

function metadataMap(record) {
  const raw = record?.metadata ?? record?.metadatas ?? record?.indexableObject?.metadata ?? [];
  const map = new Map();
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const key = asString(entry?.key ?? entry?.field ?? entry?.name);
      const value = asString(entry?.value ?? entry?.text);
      if (!key || !value) continue;
      const current = map.get(key) ?? [];
      current.push(value);
      map.set(key, current);
    }
  } else if (raw && typeof raw === "object") {
    for (const [key, rawValue] of Object.entries(raw)) {
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      const cleaned = values.map(asString).filter(Boolean);
      if (cleaned.length) map.set(key, cleaned);
    }
  }
  return map;
}

function valuesFor(map, keys) {
  for (const key of keys) {
    const exact = map.get(key);
    if (exact?.length) return exact;
    const lower = key.toLowerCase();
    for (const [candidate, values] of map.entries()) {
      if (candidate.toLowerCase() === lower && values.length) return values;
    }
  }
  return [];
}

function firstValue(map, keys) {
  return valuesFor(map, keys)[0] ?? "";
}

export function normalizeLanguage(value) {
  const raw = asString(value).trim().replaceAll("_", "-").toLowerCase();
  if (!raw) return null;
  const aliases = {
    eng: "en", english: "en",
    fra: "fr", fre: "fr", french: "fr", francais: "fr",
    spa: "es", spanish: "es", espanol: "es",
    por: "pt", portuguese: "pt", portugues: "pt",
  };
  const base = raw.split("-")[0];
  const mapped = aliases[raw] ?? aliases[base] ?? base;
  return KNOWN_LANGUAGES.has(mapped) ? mapped : null;
}

export function parsePublicationYear(value) {
  const match = asString(value).match(/(?:^|[^\d])((?:1[0-9]{3}|20[0-9]{2}|[1-9][0-9]{0,3}))(?:$|[^\d])/);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isInteger(year) && year > 0 && year <= 9999 ? year : null;
}

export function normalizeIsbn(value) {
  const normalized = asString(value).replace(/[^0-9Xx]/g, "").toUpperCase();
  if (/^\d{9}[\dX]$/.test(normalized)) {
    let sum = 0;
    for (let i = 0; i < 10; i += 1) {
      const digit = normalized[i] === "X" ? 10 : Number(normalized[i]);
      sum += (10 - i) * digit;
    }
    return sum % 11 === 0 ? normalized : null;
  }
  if (/^\d{13}$/.test(normalized)) {
    let sum = 0;
    for (let i = 0; i < 12; i += 1) {
      sum += Number(normalized[i]) * (i % 2 === 0 ? 1 : 3);
    }
    const check = (10 - (sum % 10)) % 10;
    return check === Number(normalized[12]) ? normalized : null;
  }
  return null;
}

export function normalizeDoi(value) {
  const normalized = asString(value)
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim()
    .toLowerCase();
  return /^10\.\d{4,9}\/\S+$/i.test(normalized) ? normalized : null;
}

export function mapDiscipline(subjects = []) {
  const text = normalizeText(subjects.join(" "));
  const rules = [
    ["math", /\b(math|mathematics|mathematical|mathematiques)\b/],
    ["physics", /\b(physics|physique|física|fisica)\b/],
    ["chemistry", /\b(chemistry|chemical|chimie|quimica)\b/],
    ["biology", /\b(biology|biological|biologie|biologia)\b/],
    ["medicine", /\b(medicine|medical|health sciences|medecine|medicina)\b/],
    ["computing", /\b(computer science|computing|informatics|informatique)\b/],
    ["earth", /\b(earth science|geology|geoscience|sciences de la terre)\b/],
    ["engineering", /\b(engineering|ingenierie|engenharia)\b/],
    ["humanities", /\b(humanities|social sciences|human sciences|sciences humaines)\b/],
    ["natural", /\b(natural sciences|sciences naturelles|ciencias naturales|ciencias naturais)\b/],
  ];
  return rules.filter(([, pattern]) => pattern.test(text)).map(([code]) => code);
}

export function mapDoabRecord(rawRecord) {
  const record = unwrapRecord(rawRecord);
  const metadata = metadataMap(record);
  const title = firstValue(metadata, ["dc.title", "title", "name"]);
  const handle = firstValue(metadata, ["handle", "dc.identifier.uri"])
    || asString(record?.handle ?? record?.handleUrl ?? record?.uuid ?? record?.id);
  const uuid = asString(record?.uuid ?? record?.id);
  const externalRecordId = handle || uuid;
  const authors = valuesFor(metadata, ["dc.contributor.author", "dc.creator", "creator"]);
  const editors = valuesFor(metadata, ["dc.contributor.editor"]);
  const publishers = valuesFor(metadata, ["dc.publisher", "publisher"]);
  const languageValues = valuesFor(metadata, ["dc.language.iso", "dc.language", "language"]);
  const language = normalizeLanguage(languageValues[0]);
  const publicationDate = firstValue(metadata, ["dc.date.issued", "dateIssued", "publicationDate"]);
  const subjects = [
    ...valuesFor(metadata, ["dc.subject", "subject"]),
    ...valuesFor(metadata, ["dc.subject.classification"]),
  ].filter(Boolean);
  const isbnRaw = valuesFor(metadata, ["dc.identifier.isbn", "identifier.isbn"]);
  const doiRaw = valuesFor(metadata, ["dc.identifier.doi", "identifier.doi"]);
  const rights = [
    ...valuesFor(metadata, ["dc.rights.uri", "dc.rights.license"]),
    ...valuesFor(metadata, ["dc.rights", "rights"]),
  ];
  const recordVersion = asString(record?.lastModified ?? record?.last_modified ?? record?.updatedAt)
    || asString(record?.version)
    || null;
  const recordUrl = handle
    ? (handle.startsWith("http") ? handle : "https://hdl.handle.net/" + handle.replace(/^\/+/, ""))
    : null;
  const normalizedIsbns = [...new Set(isbnRaw.map(normalizeIsbn).filter(Boolean))];
  const normalizedDois = [...new Set(doiRaw.map(normalizeDoi).filter(Boolean))];

  const issues = [];
  if (!externalRecordId) issues.push("missing_external_record_id");
  if (!title) issues.push("missing_title");
  if (!language) issues.push("unsupported_or_missing_language");
  if (!parsePublicationYear(publicationDate)) issues.push("missing_or_unparsed_publication_year");
  if (authors.length === 0 && editors.length === 0) issues.push("missing_contributors");
  if ((isbnRaw.length > 0 && normalizedIsbns.length === 0) || (doiRaw.length > 0 && normalizedDois.length === 0)) {
    issues.push("bibliographic_identifiers_failed_validation");
  }

  return {
    externalRecordId,
    recordVersion,
    recordUrl,
    title,
    authors: [...new Set(authors)],
    editors: [...new Set(editors)],
    publisher: publishers[0] ?? "",
    publicationYear: parsePublicationYear(publicationDate),
    publicationDateDisplay: publicationDate || null,
    language,
    rawLanguage: languageValues[0] ?? null,
    subjects: [...new Set(subjects)],
    disciplines: mapDiscipline(subjects),
    isbns: normalizedIsbns,
    dois: normalizedDois,
    rawIdentifiers: [...isbnRaw, ...doiRaw],
    rightsEvidence: [...new Set(rights)],
    issues,
    raw: rawRecord,
  };
}

export function normalizeDoabPayload(payload) {
  const rows = collectRecords(payload);
  return rows.map(mapDoabRecord);
}
