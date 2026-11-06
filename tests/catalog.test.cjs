"use strict";
// The nine names, icons and palettes a look can be made from. Each must build, read well and stay within the rules a logo follows.
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const{build,tokenValues}=require("../scripts/build-assets.cjs"),{resolve,checkReadable}=require("../scripts/brand-colors.cjs");
const read=file=>JSON.parse(fs.readFileSync(path.join("brand/catalog",file),"utf8"));
const names=read("names.json"),icons=read("icons.json"),palettes=read("palettes.json");
const brand=JSON.parse(fs.readFileSync("brand/brand.json","utf8")),stable=JSON.parse(fs.readFileSync("brand/stable.json","utf8")),written=JSON.parse(fs.readFileSync("brand/palette.json","utf8"));
const svgOf=icon=>fs.readFileSync(path.join("brand/catalog",icon.file),"utf8");
const hue=color=>{
 const[r,g,b]=[1,3,5].map(at=>parseInt(color.slice(at,at+2),16)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
 if(!d)return null;
 return 60*(max===r?((g-b)/d+6)%6:max===g?(b-r)/d+2:(r-g)/d+4);
};
const apart=(a,b)=>{const gap=Math.abs(a-b)%360;return Math.min(gap,360-gap);};

test("there are nine of each, with their own ids and no repeated names",()=>{
 for(const[list,letter]of[[names,"n"],[icons,"i"],[palettes,"p"]]){
  assert.deepEqual(list.map(item=>item.id),Array.from({length:9},(_,at)=>letter+(at+1)));
 }
 assert.equal(new Set(names.map(item=>item.name.toLowerCase())).size,9);
 assert.equal(new Set(palettes.map(item=>item.name.toLowerCase())).size,9);
 assert.equal(new Set(icons.map(item=>item.file)).size,9);
});
test("what is in use today is one of each, so a person can always go back",()=>{
 const{name,installName,tagline,pitch,colors}=brand;
 assert.ok(names.some(item=>item.name===name&&item.installName===installName&&item.tagline===tagline&&item.pitch===pitch),"the name, label, tagline and pitch");
 assert.ok(palettes.some(item=>JSON.stringify(item.colors)===JSON.stringify(colors)),"the three main colors");
 assert.ok(icons.some(icon=>svgOf(icon)===fs.readFileSync("brand/logo.svg","utf8")),"the logo");
});
test("every name can be shipped: safe to place in a page, a label that fits, a pitch that follows 'Try Name,'",()=>{
 for(const item of names){
  const{id,with:pair,...own}=item;
  assert.doesNotThrow(()=>tokenValues({...brand,...own},stable),item.name);
  assert.match(item.pitch,/^[a-z]/,item.name+" pitch starts lowercase");
  assert.ok(item.tagline.length<=48,item.name+" tagline is short");
  assert.ok(icons.some(icon=>icon.id===pair.icon)&&palettes.some(palette=>palette.id===pair.palette),item.name+" is drawn with icons and palettes that exist");
 }
});
test("every palette is readable in both appearances, and its pages are tinted like its ground",()=>{
 for(const palette of palettes){
  const resolved=resolve(written,palette.colors);
  assert.doesNotThrow(()=>checkReadable(resolved),palette.name);
  const{app}=resolved,tile=app.contrast.light;
  // The icon sits on the tile, and its two colors have to stand out from it.
  const{contrast}=require("../scripts/brand-colors.cjs");
  assert.ok(contrast(app.highlight.light,tile)>=3,palette.name+" accent on the icon tile");
  assert.ok(contrast(app["on-contrast"].light,tile)>=3,palette.name+" line on the icon tile");
  if(JSON.stringify(palette.colors)===JSON.stringify(written.main))continue;
  const ground=hue(palette.colors.ground),page=hue(app.page.light);
  if(ground!==null&&page!==null)assert.ok(apart(page,ground)<25,palette.name+" page is tinted "+Math.round(page)+" degrees, ground is "+Math.round(ground));
 }
});
test("every icon follows what a logo may be, and the parts that move while pulling to refresh",()=>{
 for(const icon of icons){
  const svg=svgOf(icon);
  assert.match(svg,/^<svg [^>]*viewBox="0 0 512 512"/,icon.id);
  assert.match(svg,/^<svg [^>]*>\s*<rect width="512" height="512" rx="\d+" fill="\{\{color\.contrast\.light\}\}"\/>/,icon.id+" starts with its background");
  assert.doesNotMatch(svg,/<(script|text|image|use|style|foreignObject)\b|href=|style=|on\w+=/i,icon.id);
  assert.doesNotMatch(svg,/\sid=/,icon.id+" has an id, which would clash where several icons share a page");
  const tokens=[...svg.matchAll(/\{\{(.*?)\}\}/g)].map(match=>match[1]);
  for(const token of tokens)assert.ok(["color.contrast.light","color.highlight.light","color.on-contrast.light"].includes(token),icon.id+" uses "+token);
  assert.doesNotMatch(svg.replace(/\{\{.*?\}\}/g,""),/#[0-9a-f]{3,8}\b|rgba?\(/i,icon.id+" has no color of its own");
  if(icon.id==="i1")continue;
  // A part marked "rise" comes up from below the horizon, and a part marked "line" draws itself.
  const horizon=Number(svg.match(/data-horizon="(\d+)"/)?.[1]),rise=Number(svg.match(/data-rise="(\d+)"/)?.[1]);
  assert.ok(horizon>=256&&horizon<=400&&rise>0&&rise<=300,icon.id+" says where its horizon is and how far its rising part starts below it");
  assert.match(svg,/data-pull="rise"/,icon.id);
  assert.match(svg,/data-pull="line"/,icon.id);
 }
});
test("every look in the starter pairings builds, with its icon as the mark in the header",()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),"catalog-"));
 try{
  for(const item of names){
   const{id,with:pair,...own}=item,icon=icons.find(entry=>entry.id===pair.icon),palette=palettes.find(entry=>entry.id===pair.palette);
   build({out,brand:{...brand,...own,colors:palette.colors},logoFile:path.join("brand/catalog",icon.file)});
   const page=fs.readFileSync(path.join(out,"index.html"),"utf8");
   assert.match(page,/class="brand-icon" aria-hidden="true"><svg viewBox="0 0 512 512"/,item.name);
   assert.ok(page.includes("<title>"+item.name+"</title>"),item.name);
   assert.doesNotMatch(page,/\{\{/,item.name);
   assert.equal(JSON.parse(fs.readFileSync(path.join(out,"manifest.webmanifest"),"utf8")).short_name,item.installName);
  }
 }finally{fs.rmSync(out,{recursive:true,force:true});}
});
test("the two overview sheets show what the catalogue holds now",()=>{
 const{sheets}=require("../scripts/catalog-sheets.cjs");
 for(const[file,svg]of Object.entries(sheets())){
  assert.equal(fs.readFileSync(path.join("brand/catalog",file),"utf8"),svg,file+" is out of date: run node scripts/catalog-sheets.cjs");
 }
});
test("every icon draws, and is not blank",{skip:!fs.existsSync("node_modules/@resvg/resvg-js")},()=>{
 const{Resvg}=require("@resvg/resvg-js"),{colorValues,fill}=require("../scripts/build-assets.cjs");
 const values=colorValues(resolve(written,written.main));
 for(const icon of icons){
  const image=new Resvg(fill(svgOf(icon),values,icon.file),{fitTo:{mode:"width",value:180}}).render(),pixels=image.pixels;
  assert.equal(image.width,180);
  assert.ok(new Set(Array.from({length:pixels.length/4},(_,at)=>pixels.readUInt32LE(at*4))).size>=3,icon.id+" has more than a flat tile");
 }
});
