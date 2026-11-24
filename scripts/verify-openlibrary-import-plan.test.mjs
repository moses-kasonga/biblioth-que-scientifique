import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verifyOpenLibraryImportPlan } from "./verify-openlibrary-import-plan.mjs";

test("fails closed for missing plan manifests",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"ol-plan-verify-"));
 try{await assert.rejects(()=>verifyOpenLibraryImportPlan(dir),/Manifeste du plan absent ou invalide/);}
 finally{await rm(dir,{recursive:true,force:true});}
});
