"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const{build,publicFiles,tokenValues}=require("../scripts/build-assets.cjs");
const brand=JSON.parse(fs.readFileSync("brand/brand.json","utf8")),stable=JSON.parse(fs.readFileSync("brand/stable.json","utf8"));
const rehearsal={name:"Zzyzx Labs",installName:"Zzyzx",tagline:"A tagline.",pitch:"a pitch",support:"help@example.com",inviteFrom:"a@example.com",codeFrom:"b@example.com"};
const renamed={sync:"Zzyzx Sync",helper:"Zzyzx Helper",keyFolder:"Zzyzx"};
const text=file=>/\.(html|js|css|webmanifest|svg)$/.test(file);
// Old backups say which app wrote them, so these two checks stay whatever the app is called.
const LEGACY=/data\.app!=="Even"|backup\.app==="Even"/g;

test("renaming the app leaves the old name nowhere that ships",()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),"brand-"));
 try{
  build({out,brand:rehearsal,stable:renamed});
  for(const file of publicFiles(fs.readFileSync("sw.js","utf8")).filter(text)){
   const shipped=fs.readFileSync(path.join(out,file),"utf8");
   assert.doesNotMatch(shipped.replace(LEGACY,""),/\bEven\b/,file);
   assert.doesNotMatch(shipped,/\{\{/,file);
  }
  assert.match(fs.readFileSync(path.join(out,"index.html"),"utf8"),/<title>Zzyzx Labs<\/title>/);
  assert.match(fs.readFileSync(path.join(out,"index.html"),"utf8"),/name=Zzyzx%20Sync"/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(out,"manifest.webmanifest"),"utf8")).short_name,"Zzyzx");
 }finally{fs.rmSync(out,{recursive:true});}
});
test("the Worker's messages and emails take the name from the brand file",()=>{
 for(const file of ["worker/index.js","worker/signin.mjs"]){
  const code=fs.readFileSync(file,"utf8").split("\n").filter(line=>!line.trimStart().startsWith("//")).join("\n");
  assert.doesNotMatch(code,/\bEven\b/,file);
 }
});
test("a value that could break out of a page, or a token nobody defined, stops the build",()=>{
 for(const name of ['Ev"en',"Ev'en","<b>","a&b","a\\b",""])assert.throws(()=>tokenValues({...brand,name},stable),/can't be used/);
 assert.throws(()=>tokenValues({...brand,installName:"Thirteen long"},stable),/longer/);
 const{fill}=require("../scripts/build-assets.cjs");
 assert.throws(()=>fill("{{nope}}",{},"page"),/unknown token/);
});
test("the stable names match the Shortcuts they describe",()=>{
 assert.match(fs.readFileSync("shortcuts/even-sync.cherri","utf8"),new RegExp("^#define name "+stable.sync+"$","m"));
 assert.match(fs.readFileSync("shortcuts/even-release.cherri","utf8"),new RegExp("^#define name "+stable.helper+"$","m"));
});
test("every color comes from the palette, with a value for each appearance",()=>{
 const{colorValues}=require("../scripts/build-assets.cjs"),palette=JSON.parse(fs.readFileSync("brand/palette.json","utf8"));
 colorValues(palette);
 const broken=JSON.parse(JSON.stringify(palette));delete broken.app.text.dark;
 assert.throws(()=>colorValues(broken),/text needs a dark value/);
 for(const[file,group]of[["styles.css","app"],["whitepaper.css","paper"]]){
  const css=fs.readFileSync(file,"utf8");
  assert.doesNotMatch(css,/#[0-9a-f]{3,8}\b|rgba?\(/i,file);
  const own=new Set([...css.matchAll(/(--[\w-]+):/g)].map(match=>match[1].slice(2)));
  for(const[,name]of css.matchAll(/var\(--([\w-]+)\)/g))assert.ok(own.has(name)||palette[group][name],file+" uses --"+name);
  for(const role of Object.keys(palette[group]))assert.ok(css.includes("var(--"+role+")")||group==="app"&&fs.readFileSync("index.html","utf8").includes("color."+role+".")||role==="contrast"||role==="on-contrast",file+" never uses --"+role);
 }
});
