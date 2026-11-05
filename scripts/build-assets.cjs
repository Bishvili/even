// Copies what the app serves into dist. The service worker's list is the one record of public files.
const fs=require("node:fs");
function publicFiles(sw){
 const list=sw.match(/const SHELL=(\[.*?\]);/)[1];
 return [...new Set(JSON.parse(list).filter(path=>path!=="/").map(path=>path.slice(1)).concat("sw.js"))];
}
if(require.main===module){
 fs.rmSync("dist",{recursive:true,force:true});
 fs.mkdirSync("dist");
 for(const file of publicFiles(fs.readFileSync("sw.js","utf8")))fs.copyFileSync(file,"dist/"+file);
}
module.exports={publicFiles};
