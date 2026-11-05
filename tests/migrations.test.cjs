"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const dir=path.join(__dirname,"..","db");
let sqlite;try{sqlite=require("node:sqlite");}catch(e){}
function shape(sql){
 const db=new sqlite.DatabaseSync(":memory:");
 db.exec(sql);
 const out={};
 for(const {type,name} of db.prepare("SELECT type,name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all()){
  out[type+":"+name]=type==="table"?db.prepare(`SELECT name FROM pragma_table_info('${name}')`).all().map(c=>c.name).sort():true;
 }
 return out;
}
test("the migrations, run on an empty database, rebuild the schema",{skip:!sqlite},()=>{
 const files=fs.readdirSync(path.join(dir,"migrations")).sort();
 assert.ok(files.every(f=>/^\d{4}_[a-z0-9_]+\.sql$/.test(f)),"migration names");
 const migrated=files.map(f=>fs.readFileSync(path.join(dir,"migrations",f),"utf8")).join("\n");
 assert.deepEqual(shape(migrated),shape(fs.readFileSync(path.join(dir,"schema.sql"),"utf8")));
});
