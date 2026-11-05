#!/usr/bin/env node
"use strict";
// Sets the app version everywhere it appears. Usage: node scripts/bump-version.cjs 2.40.0
const fs=require("node:fs"),path=require("node:path");
const PLACES=[["app.js",/var VERSION = "\d+\.\d+\.\d+"/,v=>`var VERSION = "${v}"`],["sw.js",/even-shell-v\d+\.\d+\.\d+/,v=>`even-shell-v${v}`],["worker/index.js",/VERSION_NAME="\d+\.\d+\.\d+"/,v=>`VERSION_NAME="${v}"`],["index.html",/>\d+\.\d+\.\d+</,v=>`>${v}<`]];
function bump(version,root=path.join(__dirname,"..")){
 if(!/^\d+\.\d+\.\d+$/.test(version))throw Error("Give a version like 2.40.0");
 for(const[file,pattern,text]of PLACES){
  const full=path.join(root,file),source=fs.readFileSync(full,"utf8");
  if(!pattern.test(source))throw Error("No version found in "+file);
  fs.writeFileSync(full,source.replace(pattern,text(version)));
 }
}
if(require.main===module)bump(process.argv[2]);
module.exports={bump};
