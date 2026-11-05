// Builds what the app serves into dist: text files with their name and color tokens filled, and every image drawn from the logo. The service worker's list is the one record of public files.
const fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,"..");
const FROM={"icon.svg":"brand/logo.svg"};
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
  if(!TEXT.has(path.extname(file)))continue;
  fs.writeFileSync(path.join(out,file),(generated[file]||"")+fill(fs.readFileSync(path.join(root,FROM[file]||file),"utf8"),values,file));
 }
 return out;
}
// Every image the service worker lists, named for what it is: icon-180.png, launch-390x844-3-dark.png.
function imageSpec(file,logo,palette){
 const icon=file.match(/^icon-(\d+)\.png$/);
 // iOS shows anything transparent as black, so an icon fills its square.
 if(icon){
  const size=+icon[1],placed=logo.replace("<svg ",'<svg width="'+size+'" height="'+size+'" ');
  return {width:size,height:size,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="'+size+'" height="'+size+'" viewBox="0 0 '+size+" "+size+'"><rect width="'+size+'" height="'+size+'" fill="'+palette.app.contrast.light+'"/>'+placed+"</svg>"};
 }
 const launch=file.match(/^launch-(\d+)x(\d+)-(\d)-(light|dark)\.png$/);
 if(!launch)throw Error("no way to draw "+file);
 const[w,h,scale]=launch.slice(1,4).map(Number),width=w*scale,height=h*scale,size=96*scale;
 const placed=logo.replace("<svg ",'<svg x="'+(width-size)/2+'" y="'+(height-size)/2+'" width="'+size+'" height="'+size+'" ');
 return {width,height,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+" "+height+'"><rect width="'+width+'" height="'+height+'" fill="'+palette.app.page[launch[4]]+'"/><rect x="'+(width-size)/2+'" y="'+(height-size)/2+'" width="'+size+'" height="'+size+'" fill="'+palette.app.contrast.light+'"/>'+placed+"</svg>"};
}
// Browser checks draw with the browser they already have. A deploy has the library, and stops if it can't draw.
async function renderer(){
 try{
  const{Resvg}=require("@resvg/resvg-js");
  return {draw:async({svg,width})=>new Resvg(svg,{fitTo:{mode:"width",value:width}}).render().asPng(),close(){}};
 }catch(error){if(error.code!=="MODULE_NOT_FOUND")throw error;}
 const{chromium}=require("playwright"),browser=await chromium.launch(),page=await browser.newPage();
 return {draw:async({svg,width,height})=>{
  await page.setViewportSize({width,height});
  await page.setContent('<!doctype html><body style="margin:0;background:transparent">'+svg.replace("<svg ",'<svg style="display:block;width:'+width+"px;height:"+height+'px" '));
  return page.screenshot({omitBackground:true});
 },close:()=>browser.close()};
}
async function buildImages(out=path.join(root,"dist"),palette=readJson("brand/palette.json")){
 const logo=fs.readFileSync(path.join(out,"icon.svg"),"utf8"),files=publicFiles(fs.readFileSync(path.join(root,"sw.js"),"utf8")).filter(file=>file.endsWith(".png"));
 const pen=await renderer();
 try{for(const file of files)fs.writeFileSync(path.join(out,file),await pen.draw(imageSpec(file,logo,palette)));}
 finally{await pen.close();}
}
if(require.main===module){build();buildImages().catch(error=>{console.error(error);process.exitCode=1;});}
module.exports={publicFiles,build,buildImages,imageSpec,tokenValues,colorValues,fill};
