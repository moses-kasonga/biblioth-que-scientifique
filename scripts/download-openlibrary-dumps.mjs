#!/usr/bin/env node
import https from "node:https";
import { createWriteStream, createReadStream } from "node:fs";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { resolve, basename } from "node:path";
import { pathToFileURL } from "node:url";

const DUMPS = {
  editions: "https://openlibrary.org/data/ol_dump_editions_latest.txt.gz",
  works: "https://openlibrary.org/data/ol_dump_works_latest.txt.gz",
  authors: "https://openlibrary.org/data/ol_dump_authors_latest.txt.gz",
};
const ALLOWED_HOST = (host) => host === "openlibrary.org" || host === "archive.org" || host.endsWith(".archive.org");

function parseArgs(argv) {
  const a = { outDir: "./openlibrary-dumps", only: Object.keys(DUMPS), fresh: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out-dir") a.outDir = argv[++i] ?? "";
    else if (argv[i] === "--only") a.only = (argv[++i] ?? "").split(",").map((v) => v.trim()).filter(Boolean);
    else if (argv[i] === "--fresh") a.fresh = true;
    else if (argv[i] === "--help" || argv[i] === "-h") a.help = true;
    else throw new Error("Argument inconnu : " + argv[i]);
  }
  if (!a.help) {
    if (!a.outDir) throw new Error("--out-dir est obligatoire.");
    if (!a.only.length || a.only.some((v) => !Object.hasOwn(DUMPS, v))) {
      throw new Error("--only accepte editions,works,authors.");
    }
  }
  return a;
}

function requestFollowingRedirects(url, headers = {}, redirects = 0) {
  return new Promise((resolvePromise, reject) => {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !ALLOWED_HOST(parsed.hostname)) {
      reject(new Error("Hôte de téléchargement non autorisé : " + parsed.hostname));
      return;
    }
    const req = https.get(parsed, { headers: { "user-agent": "NexusScience-BibliothequeImport/1.0", "accept-encoding": "identity", ...headers } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0)) {
        const location = res.headers.location;
        res.resume();
        if (!location || redirects >= 6) {
          reject(new Error("Redirection absente ou trop longue."));
          return;
        }
        const next = new URL(location, parsed).toString();
        requestFollowingRedirects(next, headers, redirects + 1).then(resolvePromise, reject);
        return;
      }
      resolvePromise(res);
    });
    req.setTimeout(120000, () => req.destroy(new Error("Délai de connexion dépassé.")));
    req.on("error", reject);
  });
}

async function hasGzipMagic(path) {
  let handle;
  try {
    handle = await open(path, "r");
    const b = Buffer.alloc(2);
    const { bytesRead } = await handle.read(b, 0, 2, 0);
    return bytesRead === 2 && b[0] === 0x1f && b[1] === 0x8b;
  } catch { return false; }
  finally { await handle?.close(); }
}

async function sha256File(path) {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(path)) h.update(chunk);
  return h.digest("hex");
}

async function downloadOne(kind, url, outDir, fresh) {
  const filename = "ol_dump_" + kind + "_latest.txt.gz";
  const finalPath = resolve(outDir, filename);
  const partialPath = finalPath + ".part";
  if (fresh) {
    await rm(partialPath, { force: true });
    await rm(finalPath, { force: true });
  }
  try {
    const existing = await stat(finalPath);
    if (existing.size > 0 && await hasGzipMagic(finalPath)) {
      return { kind, file: filename, bytes: existing.size, sha256: await sha256File(finalPath), reused_existing_file: true };
    }
  } catch {}
  let offset = 0;
  try { offset = (await stat(partialPath)).size; } catch {}
  const response = await requestFollowingRedirects(url, offset ? { range: "bytes=" + offset + "-" } : {});
  const status = response.statusCode ?? 0;
  let flags = "w";
  let totalBytes = null;
  if (status === 206) {
    const range = String(response.headers["content-range"] ?? "").match(/^bytes (\d+)-(\d+)\/(\d+|\*)$/);
    if (!range || Number(range[1]) !== offset) {
      response.destroy();
      throw new Error("Content-Range invalide pour reprise de " + filename + ".");
    }
    flags = "a";
    totalBytes = range[3] === "*" ? null : Number(range[3]);
  } else if (status === 200) {
    flags = "w";
    offset = 0;
    const length = Number(response.headers["content-length"]);
    totalBytes = Number.isFinite(length) && length > 0 ? length : null;
  } else if (status === 416) {
    response.resume();
    const match = String(response.headers["content-range"] ?? "").match(/^bytes \*\/(\d+)$/);
    const current = await stat(partialPath).catch(() => ({ size: 0 }));
    if (match && current.size === Number(match[1]) && await hasGzipMagic(partialPath)) {
      await rename(partialPath, finalPath);
      return { kind, file: filename, bytes: current.size, sha256: await sha256File(finalPath), resumed_complete_file: true };
    }
    throw new Error("Le serveur a refusé la reprise HTTP (416) pour " + filename + ".");
  } else {
    response.resume();
    throw new Error("Téléchargement " + filename + " refusé : HTTP " + status + ".");
  }
  try {
    await pipeline(response, createWriteStream(partialPath, { flags }));
  } catch (error) {
    throw new Error("Téléchargement interrompu pour " + filename + "; le fichier .part est conservé pour reprise. " + error.message);
  }
  const current = await stat(partialPath);
  if (!await hasGzipMagic(partialPath)) throw new Error("Le fichier reçu n'est pas un flux gzip valide : " + filename + ".");
  if (totalBytes !== null && current.size !== totalBytes) {
    throw new Error("Téléchargement incomplet pour " + filename + " : " + current.size + "/" + totalBytes + " octets. Relancez pour reprendre.");
  }
  await rename(partialPath, finalPath);
  return { kind, file: filename, bytes: current.size, sha256: await sha256File(finalPath), reused_existing_file: false };
}

export async function downloadOpenLibraryDumps({ outDir = "./openlibrary-dumps", only = Object.keys(DUMPS), fresh = false } = {}) {
  if (!Array.isArray(only) || !only.length || only.some((k) => !Object.hasOwn(DUMPS, k))) throw new Error("Sélection de dumps invalide.");
  const output = resolve(outDir);
  await mkdir(output, { recursive: true });
  const files = [];
  for (const kind of only) {
    process.stdout.write("Téléchargement officiel : " + kind + "\n");
    files.push(await downloadOne(kind, DUMPS[kind], output, fresh));
  }
  const manifest = {
    format: "nexus-openlibrary-dumps",
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "https://openlibrary.org/developers/dumps",
    download_urls: DUMPS,
    files,
    database_accessed: false,
  };
  const tmp = resolve(output, "dumps-manifest.json.tmp");
  await writeFile(tmp, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await rename(tmp, resolve(output, "dumps-manifest.json"));
  return manifest;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write("Download official Open Library monthly dumps with HTTP resume and SHA-256 verification.\n\n" +
      "node scripts/download-openlibrary-dumps.mjs --out-dir ./openlibrary-dumps\n" +
      "node scripts/download-openlibrary-dumps.mjs --only authors --out-dir ./openlibrary-dumps\n" +
      "Add --fresh to discard partial/existing files and start again.\n");
    return;
  }
  const result = await downloadOpenLibraryDumps(args);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n"); process.exitCode = 1; });
}
