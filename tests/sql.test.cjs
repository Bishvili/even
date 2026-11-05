"use strict";
// Prepares every statement the Worker runs against the real schema, so a query can't outlive a column it names.
const test=require("node:test"),assert=require("node:assert"),fs=require("node:fs"),path=require("node:path");
let sqlite=null;try{sqlite=require("node:sqlite");}catch(e){/* Older Node has no built-in SQLite, and CI has it. */}
test("every statement in the Worker fits the schema",{skip:!sqlite},()=>{
 const root=path.join(__dirname,".."),db=new sqlite.DatabaseSync(":memory:");
 for(const file of fs.readdirSync(path.join(root,"db","migrations")).sort())db.exec(fs.readFileSync(path.join(root,"db","migrations",file),"utf8"));
 const source=fs.readFileSync(path.join(root,"worker","index.js"),"utf8"),statements=[...source.matchAll(/\.prepare\("((?:[^"\\]|\\.)+)"\)/g)].map(m=>m[1]);
 assert.ok(statements.length>50);
 const broken=[];
 for(const sql of statements){try{db.prepare(sql);}catch(e){broken.push(e.message+": "+sql.slice(0,90));}}
 assert.deepEqual(broken,[]);
});
