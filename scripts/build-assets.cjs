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
function fill(text,values,file){
 return text.replace(/\{\{(.*?)\}\}/g,(token,key)=>{
  if(!Object.hasOwn(values,key))throw Error("unknown token "+token+" in "+file);
  return values[key];
 });
}
function build({out=path.join(root,"dist"),brand=readJson("brand/brand.json"),stable=readJson("brand/stable.json")}={}){
 const values=tokenValues(brand,stable);
 fs.rmSync(out,{recursive:true,force:true});
 fs.mkdirSync(out,{recursive:true});
 for(const file of publicFiles(fs.readFileSync(path.join(root,"sw.js"),"utf8"))){
  const source=path.join(root,file),target=path.join(out,file);
  if(TEXT.has(path.extname(file)))fs.writeFileSync(target,fill(fs.readFileSync(source,"utf8"),values,file));
  else fs.copyFileSync(source,target);
 }
 return out;
}
if(require.main===module)build();
module.exports={publicFiles,build,tokenValues,fill};
