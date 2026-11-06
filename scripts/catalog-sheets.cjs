#!/usr/bin/env node
"use strict";
// Draws the catalogue's two overview sheets as SVG, from the files in brand/catalog. Usage: node scripts/catalog-sheets.cjs
// overview.svg shows the nine looks as Home Screen tiles. icons-on-palettes.svg shows every icon on every palette.
const fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,"..");
const{colorValues,fill}=require("./build-assets.cjs"),{resolve}=require("./brand-colors.cjs");
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
const names=read("brand/catalog/names.json"),icons=read("brand/catalog/icons.json"),palettes=read("brand/catalog/palettes.json"),written=read("brand/palette.json");
const SERIF="Georgia, 'Times New Roman', serif",SANS="-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const escape=text=>text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const text=(x,y,size,color,body,{family=SANS,weight=400,anchor="start"}={})=>'<text x="'+x+'" y="'+y+'" font-family="'+family+'" font-size="'+size+'" font-weight="'+weight+'" fill="'+color+'" text-anchor="'+anchor+'">'+escape(body)+"</text>";
const find=(list,id)=>list.find(item=>item.id===id);
// An icon on its palette, as the Home Screen shows it. The icon's own first shape is its rounded tile.
function tile(icon,palette,x,y,size){
 const logo=fill(fs.readFileSync(path.join(root,"brand/catalog",icon.file),"utf8"),colorValues(resolve(written,palette.colors)),icon.file);
 const placed=logo.replace(/^<svg[^>]*>/,'<svg x="'+x+'" y="'+y+'" width="'+size+'" height="'+size+'" viewBox="0 0 512 512">');
 return '<rect x="'+x+'" y="'+y+'" width="'+size+'" height="'+size+'" rx="'+Math.round(size*0.2237)+'" fill="#000" filter="url(#lift)"/>'+placed;
}
const swatch=(x,y,color)=>'<rect x="'+x+'" y="'+y+'" width="20" height="20" rx="5" fill="'+color+'" stroke="#000" stroke-opacity=".14"/>';
const sheet=(width,height,body)=>'<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+" "+height+'"><defs><filter id="lift" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000" flood-opacity=".28"/></filter></defs><rect width="'+width+'" height="'+height+'" fill="#eceae6"/>'+body+"</svg>\n";

function overview(){
 const body=[text(20,40,22,"#1d2528","Nine looks",{family:SERIF,weight:700}),text(20,64,14,"#5b6a6e","Each is a name, an icon and a palette that start together. Any name can be paired with any icon and palette.")];
 names.forEach((item,at)=>{
  const x=20+(at%3)*400,y=88+Math.floor(at/3)*148,icon=find(icons,item.with.icon),palette=find(palettes,item.with.palette),{primary,highlight,ground}=palette.colors;
  body.push('<rect x="'+x+'" y="'+y+'" width="380" height="132" rx="18" fill="#fff" stroke="#e3e0da"/>',
   tile(icon,palette,x+16,y+14,84),text(x+58,y+114,11,"#1d2528",item.installName,{weight:600,anchor:"middle"}),
   text(x+118,y+42,19,"#1d2528",item.name,{family:SERIF,weight:700}),text(x+118,y+64,12,"#4a585c",item.tagline),
   swatch(x+118,y+78,primary),swatch(x+146,y+78,highlight),swatch(x+174,y+78,ground),text(x+210,y+93,12,"#6b7a7e",icon.name+" · "+palette.name));
 });
 return sheet(1220,540,body.join(""));
}
function matrix(){
 const left=116,size=72,pitch=84,top=108,body=[text(20,40,22,"#1d2528","Every icon on every palette",{family:SERIF,weight:700}),text(20,64,14,"#5b6a6e","The Home Screen icon uses the palette's ground, highlight and light line.")];
 palettes.forEach((palette,column)=>body.push(text(left+column*pitch+size/2,94,12,"#1d2528",palette.name,{weight:600,anchor:"middle"})));
 icons.forEach((icon,row)=>{
  body.push(text(20,top+row*pitch+size/2+4,12,"#1d2528",icon.name,{weight:600}));
  palettes.forEach((palette,column)=>body.push(tile(icon,palette,left+column*pitch,top+row*pitch,size)));
 });
 return sheet(left+9*pitch+8,top+9*pitch+12,body.join(""));
}
const sheets=()=>({"overview.svg":overview(),"icons-on-palettes.svg":matrix()});
if(require.main===module)for(const[file,svg]of Object.entries(sheets()))fs.writeFileSync(path.join(root,"brand/catalog",file),svg);
module.exports={sheets};
