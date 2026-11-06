#!/usr/bin/env node
"use strict";
// Makes a catalogue look the app's own: its name fields, colors and logo. Usage: node scripts/adopt-look.cjs n5 i4 p2
const fs=require("node:fs"),path=require("node:path"),{spawnSync}=require("node:child_process");
function adopt(n,i,p,root=path.join(__dirname,"..")){
 const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
 const find=(file,id)=>{const item=read("brand/catalog/"+file).find(entry=>entry.id===id);if(!item)throw Error("No "+id+" in "+file);return item;};
 const name=find("names.json",n),icon=find("icons.json",i),palette=find("palettes.json",p);
 const brand={...read("brand/brand.json"),name:name.name,installName:name.installName,tagline:name.tagline,pitch:name.pitch,colors:palette.colors};
 fs.writeFileSync(path.join(root,"brand/brand.json"),JSON.stringify(brand,null,2)+"\n");
 fs.copyFileSync(path.join(root,"brand/catalog",icon.file),path.join(root,"brand/logo.svg"));
 return {name,icon,palette};
}
if(require.main===module){
 const[n,i,p]=process.argv.slice(2);
 if(!n||!i||!p){console.error("Usage: node scripts/adopt-look.cjs n5 i4 p2");process.exit(1);}
 const look=adopt(n,i,p);
 console.log("The app is now "+look.name.name+", with the "+look.icon.name+" icon and the "+look.palette.name+" palette.");
 const run=spawnSync(process.execPath,["--test","tests/brand.test.cjs","tests/catalog.test.cjs"],{cwd:path.join(__dirname,".."),stdio:"inherit"});
 console.log("Left to do: bump the version, push, check the live site, and retire the picker (#72, Step 7).");
 process.exit(run.status||0);
}
module.exports={adopt};
