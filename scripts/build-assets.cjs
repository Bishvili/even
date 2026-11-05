// Builds what the app serves into dist, filling the name tokens in every text file. The service worker's list is the one record of public files.
const fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,"..");
const TEXT=new Set([".html",".js",".css",".webmanifest",".svg"]);
const readJson=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));

function publicFiles(sw){
 const list=sw.match(/const SHELL=(\[.*?\]);/)[1];
 return [...new Set(JSON.parse(list).filter(path=>path!=="/").map(path=>path.slice(1)).concat("sw.js"))];
}
// The values land inside HTML, JSON and JavaScript strings, so anything that could break out of one stops the build.
function tokenValues(brand,stable){
 const values={...brand,...stable};
 for(const[key,value]of Object.entries(values)){
  if(typeof value!=="string"||!value.trim()||/["'\\<>&\u0000-\u001f]/.test(value))throw Error("brand value "+key+" can't be used: "+JSON.stringify(value));
 }
 if(values.installName.length>12)throw Error("installName is longer than the Home Screen shows");
 return {...values,syncUrl:encodeURIComponent(values.sync),helperUrl:encodeURIComponent(values.helper)};
}
// A color lands in CSS and in HTML attributes, and every one needs a value for each appearance.
function colorValues(palette){
 const values={};
 for(const[group,colors]of Object.entries(palette))for(const[role,color]of Object.entries(colors))for(const mode of["light","dark"]){
  if(!/^(#[0-9a-f]{3,8}|rgba?\([\d.,\s]+\))$/i.test(color[mode]||""))throw Error(group+" color "+role+" needs a "+mode+" value");
  if(group==="app")values["color."+role+"."+mode]=color[mode];
 }
 return values;
}
function tokens(colors,mode){return Object.entries(colors).map(([role,color])=>"--"+role+":"+color[mode]).join(";");}
const appColors=({app})=>":root{"+tokens(app,"light")+"}@media(prefers-color-scheme:dark){:root{"+tokens(app,"dark")+"}}\n";
const paperColors=({paper})=>{const dark=tokens(paper,"dark")+";color-scheme:dark";return ":root{"+tokens(paper,"light")+"}@media (prefers-color-scheme:dark){:root:not([data-theme=\"light\"]){"+dark+"}}:root[data-theme=\"dark\"]{"+dark+"}\n";};
function fill(text,values,file){
 return text.replace(/\{\{(.*?)\}\}/g,(token,key)=>{
  if(!Object.hasOwn(values,key))throw Error("unknown token "+token+" in "+file);
  return values[key];
 });
}
function build({out=path.join(root,"dist"),brand=readJson("brand/brand.json"),stable=readJson("brand/stable.json"),palette=readJson("brand/palette.json")}={}){
 const values={...tokenValues(brand,stable),...colorValues(palette)};
 const generated={"styles.css":appColors(palette),"whitepaper.css":paperColors(palette)};
 fs.rmSync(out,{recursive:true,force:true});
 fs.mkdirSync(out,{recursive:true});
 for(const file of publicFiles(fs.readFileSync(path.join(root,"sw.js"),"utf8"))){
  const source=path.join(root,file),target=path.join(out,file);
  if(TEXT.has(path.extname(file)))fs.writeFileSync(target,(generated[file]||"")+fill(fs.readFileSync(source,"utf8"),values,file));
  else fs.copyFileSync(source,target);
 }
 return out;
}
if(require.main===module)build();
module.exports={publicFiles,build,tokenValues,colorValues,fill};
