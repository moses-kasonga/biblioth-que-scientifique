import test from "node:test";
import assert from "node:assert/strict";
import { validateDownloadSelection } from "./download-openlibrary-dumps.mjs";

test("accepts only the three official Open Library dump kinds", () => {
  assert.deepEqual(validateDownloadSelection(["editions", "works", "authors"]), ["editions", "works", "authors"]);
  assert.deepEqual(validateDownloadSelection(["authors"]), ["authors"]);
});

test("rejects empty, unknown, and duplicate dump selections", () => {
  for (const value of [[], ["unknown"], ["authors", "authors"], null]) {
    assert.throws(() => validateDownloadSelection(value), /Sélection de dumps invalide/);
  }
});
