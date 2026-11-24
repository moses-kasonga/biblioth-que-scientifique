import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planOpenLibraryImport } from "./plan-openlibrary-import.mjs";
const hash = (v) => createHash("sha256").update(v).digest("hex");
const line = (v) => JSON.stringify(v) + "\n";
async function fixture(dir) {
  await mkdir(dir, { recursive: true });
  const rows = {
    editions: line({ source_record: { source_code:"openlibrary",record_type:"edition",external_record_id:"OL100M",source_record_version:"7",title:"Physics",publication_year:1920,publisher_names:["Press"],language_codes:["en"],isbn_identifiers:[],raw_payload:{title:"Physics"} },work_external_ids:["OL10W"],review_required:false,review_reasons:[] }) +
      line({ source_record:{source_code:"openlibrary",record_type:"edition",external_record_id:"OL101M",source_record_version:"2",title:"Unresolved",publication_year:1930,raw_payload:{title:"Unresolved"}},work_external_ids:["OL404W"],review_required:true,review_reasons:["unresolved_or_conflicting_work_reference"] }),
    works: line({ source_record:{source_code:"openlibrary",record_type:"work",external_record_id:"OL10W",source_record_version:"4",title:"Physics work",first_publish_year:1919,subjects:["Physics"],raw_payload:{title:"Physics work"}},author_external_ids:["OL1A"],review_required:false,review_reasons:[] }),
    authors: line({ source_record:{source_code:"openlibrary",record_type:"author",external_record_id:"OL1A",source_record_version:"3",preferred_name:"Ada Author",alternate_names:["A. Author"],entity_type:"person",raw_payload:{name:"Ada Author"}},review_required:false,review_reasons:[] }),
    relationships: line({from_type:"edition",from_id:"OL100M",to_type:"work",to_id:"OL10W",relation:"edition_works",content_role:"main",resolved:true,review_required:false}) +
      line({from_type:"edition",from_id:"OL101M",to_type:"work",to_id:"OL404W",relation:"edition_works",content_role:"main",resolved:false,review_required:true}) +
      line({from_type:"work",from_id:"OL10W",to_type:"agent",to_id:"OL1A",relation:"work_agents",role_code:"author",resolved:true,review_required:false}),
  };
  const names={editions:"editions-prepared.jsonl",works:"works-prepared.jsonl",authors:"authors-prepared.jsonl",relationships:"relationships-prepared.jsonl"};
  const outputs={};
  for(const [k,v] of Object.entries(rows)){await writeFile(join(dir,names[k]),v);outputs[k]={file:names[k],sha256:hash(v)};}
  await writeFile(join(dir,"manifest.json"),JSON.stringify({format:"nexus-openlibrary-import-package",formatVersion:1,executionMode:"preparation-only; no database connection and no catalogue writes",counts:{editions:2,works:1,authors:1,relationships:3},quality:{unresolvedEditionWorkLinks:1,unresolvedWorkAuthorLinks:0},outputs,safety:{canonicalEntitiesCreated:false,sourceRecordsWritten:false,automaticMerges:false}})+"\n");
}
test("plans ordered resumable batches and blocks review records and links",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"ol-plan-"));
 try{
  const input=join(dir,"pkg"),out=join(dir,"plan");await fixture(input);
  const {manifest,outputDir}=await planOpenLibraryImport({packageDir:input,outDir:out,batchSize:3});
  assert.equal(manifest.safety.database_accessed,false);
  assert.deepEqual([manifest.counts.source_record_upserts,manifest.counts.canonical_candidates,manifest.counts.relationship_links,manifest.counts.deferred_relationships],[4,3,2,1]);
  assert.equal(manifest.counts.review_records,1);
  const files=(await readdir(outputDir)).filter(x=>x.endsWith(".jsonl")).sort(),ops=[];
  for(const f of files){const content=await readFile(join(outputDir,f),"utf8");const batch=content.trim().split("\n").map(JSON.parse);assert.equal(hash(content),manifest.batches.find(x=>x.file===f).sha256);ops.push(...batch);}
  assert.deepEqual(ops.map(x=>x.sequence),Array.from({length:9},(_,i)=>i+1));
  assert.equal(new Set(ops.map(x=>x.idempotency_key)).size,ops.length);
  assert.ok(ops.every(x=>x.data.canonical_write_allowed!==true));
  assert.ok(!ops.some(x=>x.operation_type==="propose_edition"&&x.identity.external_record_id==="OL101M"));
  const link=ops.find(x=>x.operation_type==="link_edition_work");
  const candidateIds=new Set(ops.filter(x=>["propose_edition","propose_work"].includes(x.operation_type)).map(x=>x.operation_id));
  assert.ok(link.depends_on.every(x=>candidateIds.has(x)));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("operation identities remain deterministic between repeated plans",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"ol-repeat-"));
 try{
  const input=join(dir,"pkg");await fixture(input);
  const a=await planOpenLibraryImport({packageDir:input,outDir:join(dir,"a"),batchSize:4});
  const b=await planOpenLibraryImport({packageDir:input,outDir:join(dir,"b"),batchSize:4});
  async function ids(folder){return (await Promise.all((await readdir(folder)).filter(f=>f.endsWith(".jsonl")).sort().map(async f=>(await readFile(join(folder,f),"utf8")).trim().split("\n").map(JSON.parse)))).flat().map(x=>x.idempotency_key);}
  assert.deepEqual(await ids(a.outputDir),await ids(b.outputDir));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("refuses corrupted package checksums",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"ol-bad-"));
 try{const input=join(dir,"pkg");await fixture(input);await writeFile(join(input,"editions-prepared.jsonl"),"{}\n");await assert.rejects(()=>planOpenLibraryImport({packageDir:input,outDir:join(dir,"out")}),/Empreinte SHA-256 incorrecte/);}
 finally{await rm(dir,{recursive:true,force:true});}
});
