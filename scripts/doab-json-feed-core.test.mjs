import test from "node:test";
import assert from "node:assert/strict";
import { readJsonArrayItems } from "./doab-json-feed-core.mjs";

function streamFromString(value, chunkSize = 7) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(value);
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      const next = bytes.slice(offset, offset + chunkSize);
      offset += chunkSize;
      controller.enqueue(next);
    },
  });
}

test("streams nested DOAB objects and preserves braces and escaped quotes in strings", async () => {
  const json = JSON.stringify({
    metadata: { generated: "test" },
    publications: [
      { id: 1, metadata: { title: "Physics {and} matter", quote: 'A "quoted" title' } },
      { id: 2, metadata: { title: "Second title" } },
    ],
    trailing: true,
  });
  const result = await readJsonArrayItems(streamFromString(json, 5), {
    limit: 1,
    arrayKey: "publications",
  });

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].id, 1);
  assert.equal(result.records[0].metadata.quote, 'A "quoted" title');
  assert.equal(result.scanned, 1);
  assert.equal(result.stopReason, "limit_reached");
});

test("filters selected languages while scanning until the requested number is reached", async () => {
  const json = JSON.stringify({
    publications: [
      { id: 1, metadata: { language: ["eng"] } },
      { id: 2, metadata: { language: ["pol"] } },
      { id: 3, metadata: { language: ["fra"] } },
    ],
  });
  const result = await readJsonArrayItems(streamFromString(json, 11), {
    limit: 2,
    acceptRecord: (record) => record.metadata.language[0] !== "pol",
  });

  assert.deepEqual(result.records.map((record) => record.id), [1, 3]);
  assert.equal(result.scanned, 3);
  assert.equal(result.rejected, 1);
  assert.equal(result.stopReason, "limit_reached");
});

test("preserves braces after escaped quotes and backslashes inside JSON strings", async () => {
  const quotedTitle = 'Quoted "closing } brace" title';
  const backslashPath = "C:\\books\\Nexus";
  const json = JSON.stringify({
    publications: [
      { id: 1, metadata: { title: quotedTitle, path: backslashPath } },
    ],
  });
  const result = await readJsonArrayItems(streamFromString(json, 3), {
    limit: 1,
    arrayKey: "publications",
  });

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].metadata.title, quotedTitle);
  assert.equal(result.records[0].metadata.path, backslashPath);
});

test("rejects a truncated JSON object", async () => {
  await assert.rejects(
    readJsonArrayItems(streamFromString('{"publications":[{"id":1,"title":"unfinished'), {
      limit: 2,
    }),
    /terminé au milieu/
  );
});

test("rejects malformed items inside the publications array", async () => {
  await assert.rejects(
    readJsonArrayItems(streamFromString('{"publications":[{"id":1},broken]}'), {
      limit: 2,
    }),
    /Élément inattendu/
  );
});

test("rejects invalid limits before consuming the stream", async () => {
  await assert.rejects(
    readJsonArrayItems(streamFromString('{"publications":[]}'), { limit: 0 }),
    /limit doit être un entier positif/
  );
});

test("supports resumable offsets after applying the language filter", async () => {
  const json = JSON.stringify({
    publications: [
      { id: 1, metadata: { language: ["eng"] } },
      { id: 2, metadata: { language: ["pol"] } },
      { id: 3, metadata: { language: ["fra"] } },
      { id: 4, metadata: { language: ["eng"] } },
    ],
  });
  const result = await readJsonArrayItems(streamFromString(json, 13), {
    skip: 1,
    limit: 2,
    acceptRecord: (record) => record.metadata.language[0] !== "pol",
  });

  assert.deepEqual(result.records.map((record) => record.id), [3, 4]);
  assert.equal(result.scanned, 4);
  assert.equal(result.rejected, 1);
  assert.equal(result.skippedByOffset, 1);
  assert.equal(result.stopReason, "limit_reached");
});

test("rejects negative stream offsets", async () => {
  await assert.rejects(
    readJsonArrayItems(streamFromString('{"publications":[]}'), { skip: -1 }),
    /skip doit être un entier positif ou nul/
  );
});
