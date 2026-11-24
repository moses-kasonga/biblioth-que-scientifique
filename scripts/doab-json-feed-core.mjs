export async function readJsonArrayItems(readable, options = {}) {
  const {
    arrayKey = "publications",
    limit = 25,
    acceptRecord = () => true,
    maxScanned = 100_000,
    maxRecordChars = 10_000_000,
  } = options;

  if (!readable || typeof readable.getReader !== "function") {
    throw new TypeError("Un ReadableStream est requis.");
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("limit doit être un entier positif.");
  }
  if (!Number.isInteger(maxScanned) || maxScanned < limit) {
    throw new RangeError("maxScanned doit être supérieur ou égal à limit.");
  }

  const reader = readable.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const arrayPattern = new RegExp(
    '"' + arrayKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"\\s*:\\s*\\['
  );

  let preamble = "";
  let arrayFound = false;
  let inRecord = false;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let recordBuffer = "";
  let stopReason = null;
  let scanned = 0;
  let rejected = 0;
  const records = [];

  function consume(chunk) {
    let text = chunk;

    if (!arrayFound) {
      preamble += text;
      const match = arrayPattern.exec(preamble);
      if (!match) {
        if (preamble.length > 262_144) {
          throw new Error("Le tableau JSON '" + arrayKey + "' est introuvable près du début du flux.");
        }
        return;
      }
      text = preamble.slice(match.index + match[0].length);
      preamble = "";
      arrayFound = true;
    }

    for (let i = 0; i < text.length; i += 1) {
      const character = text[i];

      if (!inRecord) {
        if (character === "]") {
          stopReason = "array_closed";
          return;
        }
        if (character === "," || /\s/.test(character)) continue;
        if (character !== "{") {
          throw new Error("Élément inattendu dans le tableau JSON '" + arrayKey + "'.");
        }
        inRecord = true;
        depth = 1;
        inString = false;
        escaped = false;
        recordBuffer = "{";
        continue;
      }

      recordBuffer += character;
      if (recordBuffer.length > maxRecordChars) {
        throw new Error("Une notice DOAB dépasse la taille maximale autorisée.");
      }

      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }

      if (character === '"') {
        inString = true;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          const record = JSON.parse(recordBuffer);
          scanned += 1;
          if (acceptRecord(record)) records.push(record);
          else rejected += 1;

          inRecord = false;
          recordBuffer = "";

          if (records.length >= limit) {
            stopReason = "limit_reached";
            return;
          }
          if (scanned >= maxScanned) {
            stopReason = "scan_limit_reached";
            return;
          }
        }
      }
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      let chunk = "";
      if (value) chunk += decoder.decode(value, { stream: !done });
      if (done) chunk += decoder.decode();

      consume(chunk);

      if (stopReason) break;
      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }

  if (!arrayFound) {
    throw new Error("Le flux DOAB ne contient pas de tableau JSON '" + arrayKey + "'.");
  }
  if (inRecord) {
    throw new Error("Le flux JSON s'est terminé au milieu d'une notice DOAB.");
  }
  if (!stopReason) {
    throw new Error("Le flux JSON s'est terminé avant la fermeture du tableau '" + arrayKey + "'.");
  }

  return {
    records,
    scanned,
    rejected,
    stopReason,
  };
}
