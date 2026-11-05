"use strict";
// Serves the app as it ships: the public file list and the Worker's security headers. Any request to the API answers signed out.
const http=require("node:http"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,"..");
const worker=fs.readFileSync(path.join(root,"worker/index.js"),"utf8");
const SECURITY=Function("return "+worker.match(/const SECURITY=(\{.*?\});/)[1])();
const{publicFiles,build,buildImages}=require("./build-assets.cjs");
const dist=build(),images=buildImages(dist);
const TYPES={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".webmanifest":"application/manifest+json",".svg":"image/svg+xml",".png":"image/png"};
const FILES=publicFiles(fs.readFileSync(path.join(root,"sw.js"),"utf8"));

async function serve({connected=false}={}){
 await images;
 const server=http.createServer((request,response)=>{
  const url=new URL(request.url,"http://localhost");
  // A connected device's session, so the app opens past the first-run steps.
  if(connected&&url.pathname==="/api/session"){
   response.writeHead(200,{...SECURITY,"Content-Type":"application/json"});
   return response.end(JSON.stringify({ok:true,status:{deviceId:"device-1",credentialValid:true},release:{},calendars:[],settings:{},moods:{email:"owner@example.com",moods:[],deleted:[]}}));
  }
  if(url.pathname.startsWith("/api/")){
   response.writeHead(401,{...SECURITY,"Content-Type":"application/json"});
   return response.end(JSON.stringify({ok:false,error:"Sign in",code:"signed_out"}));
  }
  const file=url.pathname==="/"?"index.html":url.pathname.slice(1);
  if(!FILES.includes(file)){response.writeHead(404,SECURITY);return response.end();}
  response.writeHead(200,{...SECURITY,"Content-Type":TYPES[path.extname(file)],"Cache-Control":"no-cache"});
  response.end(fs.readFileSync(path.join(dist,file)));
 });
 return new Promise(resolve=>server.listen(0,()=>resolve(server)));
}
module.exports={serve,SECURITY};
