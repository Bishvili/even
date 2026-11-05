"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const{build,publicFiles,tokenValues}=require("../scripts/build-assets.cjs");
const brand=JSON.parse(fs.readFileSync("brand/brand.json","utf8")),stable=JSON.parse(fs.readFileSync("brand/stable.json","utf8"));
// Also catches the name inside an encoded link, where it has no word boundary.
const current=new RegExp("(^|[^A-Za-z])"+brand.name+"([^A-Za-z]|$)","m");
const rehearsal={name:"Zzyzx Labs",installName:"Zzyzx",tagline:"A tagline.",pitch:"a pitch",support:"help@example.com",inviteFrom:"a@example.com",codeFrom:"b@example.com",colors:{primary:"#2B4FA8",highlight:"#E7B8D0",ground:"#1B1F3A"}};
const renamed={sync:"Zzyzx Sync",helper:"Zzyzx Helper",keyFolder:"Zzyzx",keyFile:"key.txt"};
const text=file=>/\.(html|js|css|webmanifest|svg)$/.test(file);

test("renaming the app leaves the old name nowhere that ships",()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),"brand-"));
 try{
  build({out,brand:rehearsal,stable:renamed});
  const css=fs.readFileSync(path.join(out,"styles.css"),"utf8");
  assert.match(css,/--primary:#2B4FA8/);
  assert.doesNotMatch(css,/#28685B|#10262A/i);
  for(const file of publicFiles(fs.readFileSync("sw.js","utf8")).filter(text)){
   const shipped=fs.readFileSync(path.join(out,file),"utf8");
   assert.doesNotMatch(decodeURIComponent(shipped.replace(/%(?![0-9a-f]{2})/gi,"%25")),current,file);
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
  assert.doesNotMatch(code,current,file);
 }
});
test("a value that could break out of a page, or a token nobody defined, stops the build",()=>{
 for(const name of ['Ev"en',"Ev'en","<b>","a&b","a\\b",""])assert.throws(()=>tokenValues({...brand,name},stable),/can't be used/);
 assert.throws(()=>tokenValues({...brand,installName:"Thirteen long"},stable),/longer/);
 const{fill}=require("../scripts/build-assets.cjs");
 assert.throws(()=>fill("{{nope}}",{},"page"),/unknown token/);
});
test("the stable names match the Shortcuts they describe",()=>{
 assert.match(fs.readFileSync("shortcuts/sync.cherri","utf8"),new RegExp("^#define name "+stable.sync+"$","m"));
 assert.match(fs.readFileSync("shortcuts/helper.cherri","utf8"),new RegExp("^#define name "+stable.helper+"$","m"));
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
test("every listed image can be drawn, at its real size, from the logo",()=>{
 const{imageSpec}=require("../scripts/build-assets.cjs"),palette=JSON.parse(fs.readFileSync("brand/palette.json","utf8"));
 const logo=fs.readFileSync("brand/logo.svg","utf8"),files=publicFiles(fs.readFileSync("sw.js","utf8")).filter(file=>file.endsWith(".png"));
 assert.equal(files.length,25);
 assert.equal(imageSpec("icon-180.png",logo,palette).width,180);
 const launch=imageSpec("launch-390x844-3-dark.png",logo,palette);
 assert.equal(launch.width,1170);
 assert.equal(launch.height,2532);
 assert.match(launch.svg,/height="2532"/);
 assert.ok(launch.svg.includes(palette.app.page.dark));
 for(const file of files)imageSpec(file,logo,palette);
 assert.ok(!fs.existsSync("icon-180.png"),"images are built, not stored");
});
test("the deploy's library draws an image at its real size",{skip:!fs.existsSync("node_modules/@resvg/resvg-js")},async()=>{
 const{build,buildImages}=require("../scripts/build-assets.cjs"),out=fs.mkdtempSync(path.join(os.tmpdir(),"images-"));
 try{
  build({out});await buildImages(out);
  const size=file=>{const png=fs.readFileSync(path.join(out,file));return[png.readUInt32BE(16),png.readUInt32BE(20)];};
  assert.deepEqual(size("icon-180.png"),[180,180]);
  assert.deepEqual(size("launch-390x844-3-dark.png"),[1170,2532]);
 }finally{fs.rmSync(out,{recursive:true});}
});
test("a few main colors make the whole palette, and the ones it was written for change nothing",()=>{
 const{resolve,checkReadable}=require("../scripts/brand-colors.cjs"),palette=JSON.parse(fs.readFileSync("brand/palette.json","utf8"));
 const same=resolve(palette,palette.main);
 assert.deepEqual(same.app,palette.app);
 assert.deepEqual(same.paper,palette.paper);
 checkReadable(same);
 const blue=resolve(palette,rehearsal.colors);
 assert.equal(blue.app.primary.light,"#2B4FA8");
 assert.equal(blue.app.highlight.light,"#E7B8D0");
 assert.equal(blue.app.danger.light,palette.app.danger.light,"warnings keep their meaning");
 assert.match(blue.app.backdrop.light,/^rgba\(.*,0\.45\)$|^rgba\(.*,\.45\)$/);
 assert.throws(()=>checkReadable(resolve(palette,{...palette.main,primary:"#F0F0F0"})),/too faint/);
});
test("each palette role belongs to a family or is left alone on purpose",()=>{
 const palette=JSON.parse(fs.readFileSync("brand/palette.json","utf8")),roles=new Set([...Object.keys(palette.app),...Object.keys(palette.paper)]);
 const fixed=new Set(["danger","danger-bg","warning","warning-bg","warning-line","status-ok","status-waiting","on-accent"]);
 for(const members of Object.values(palette.families))for(const role of members)assert.ok(roles.has(role),role);
 for(const role of roles)assert.ok(fixed.has(role)||Object.values(palette.families).some(members=>members.includes(role)),role);
});
test("any logo works: its mark drops the background, and a new one shows still while pulling",()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),"logo-")),file="scripts/.logo-test.svg";
 try{
  const{build:make}=require("../scripts/build-assets.cjs");
  make({out});
  const today=fs.readFileSync(path.join(out,"index.html"),"utf8");
  assert.match(today,/id="pull-sun"/);
  assert.match(today,/class="brand-icon" aria-hidden="true"><svg viewBox="0 0 512 512"><path d="M146 300a110 110 0 0 1 220 0Z" fill="currentColor"\/>/);
  fs.writeFileSync(file,'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#123456"/><circle cx="50" cy="50" r="30" fill="#ABCDEF"/></svg>');
  make({out,logoFile:file});
  const next=fs.readFileSync(path.join(out,"index.html"),"utf8");
  assert.doesNotMatch(next,/id="pull-sun"/);
  assert.match(next,/class="brand-icon" aria-hidden="true"><svg viewBox="0 0 100 100"><circle/);
 }finally{fs.rmSync(out,{recursive:true});fs.rmSync(file,{force:true});}
});
test("every look to try can be built and read",()=>{
 const looks=JSON.parse(fs.readFileSync("brand/looks.json","utf8")),out=fs.mkdtempSync(path.join(os.tmpdir(),"looks-"));
 try{for(const look of looks)build({out,brand:{...brand,name:look.name,colors:look.colors||brand.colors}});}
 finally{fs.rmSync(out,{recursive:true});}
});
