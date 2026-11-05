#!/usr/bin/env node
"use strict";
// Loads the app as it ships: the public file list and the Worker's security headers, signed out.
// Fails on any uncaught error or security-policy violation. Usage: node scripts/smoke.cjs [chromium] [webkit]
const http=require("node:http"),fs=require("node:fs"),path=require("node:path");
const {chromium,webkit}=require("playwright");
const root=path.join(__dirname,"..");
const worker=fs.readFileSync(path.join(root,"worker/index.js"),"utf8");
const SECURITY=Function("return "+worker.match(/const SECURITY=(\{.*?\});/)[1])();
const{publicFiles}=require("./build-assets.cjs");
const TYPES={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".webmanifest":"application/manifest+json",".svg":"image/svg+xml",".png":"image/png"};
const FILES=publicFiles(fs.readFileSync(path.join(root,"sw.js"),"utf8"));

function serve(){
 const server=http.createServer((request,response)=>{
  const url=new URL(request.url,"http://localhost");
  if(url.pathname.startsWith("/api/")){
   response.writeHead(401,{...SECURITY,"Content-Type":"application/json"});
   return response.end(JSON.stringify({ok:false,error:"Sign in",code:"signed_out"}));
  }
  const file=url.pathname==="/"?"index.html":url.pathname.slice(1);
  if(!FILES.includes(file)){response.writeHead(404,SECURITY);return response.end();}
  response.writeHead(200,{...SECURITY,"Content-Type":TYPES[path.extname(file)],"Cache-Control":"no-cache"});
  response.end(fs.readFileSync(path.join(root,file)));
 });
 return new Promise(resolve=>server.listen(0,()=>resolve(server)));
}
async function run(type,base){
 const browser=await type.launch(),problems=[];
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:"allow"});
 const page=await context.newPage();
 page.on("dialog",dialog=>dialog.accept());
 page.on("pageerror",error=>problems.push("Error: "+error.message));
 page.on("console",message=>{if(message.type()==="error"&&/content security|refused to|security policy/i.test(message.text()))problems.push("Policy: "+message.text());});
 const tab=async name=>{await page.click(`.nav-item[data-go=${name}]`);await page.waitForTimeout(150);};
 await page.goto(base);
 await page.waitForSelector("#checkin-title");
 // The check-in is the first thing in reach on a small iPhone.
 await page.setViewportSize({width:375,height:667});
 await page.waitForTimeout(100);
 const reachable=await page.evaluate(()=>{const bar=document.querySelector(".bottom-nav").getBoundingClientRect().top;return [...document.querySelectorAll("[data-mood]")].every(b=>{const r=b.getBoundingClientRect();return r.top>=0&&r.bottom<=bar;});});
 if(!reachable)problems.push("Mood buttons aren't fully visible at 375x667 on first launch.");
 await page.setViewportSize({width:390,height:844});
 await page.click("[data-mood='3']");
 await page.waitForTimeout(100);
 const saveInView=await page.evaluate(()=>{const bar=document.querySelector(".bottom-nav").getBoundingClientRect().top,r=document.getElementById("save-mood").getBoundingClientRect();return r.top>=0&&r.bottom<=bar;});
 if(!saveInView)problems.push("Save isn't in view after choosing a mood.");
 for(const name of ["insights","data","settings","checkin"])await tab(name);
 await tab("settings");
 await page.click("#erase-local");
 if(!await page.evaluate(()=>document.getElementById("confirm-sheet").open))problems.push("The confirmation sheet didn't open.");
 await page.click("#confirm-sheet button[value='no']");
 await tab("data");
 await page.click("#login-button");
 if(!await page.evaluate(()=>document.getElementById("signin-sheet").open))problems.push("The sign-in sheet didn't open.");
 await page.click("#signin-cancel");
 for(const old of ["sync","sources"]){
  await page.evaluate(name=>EvenApp.navigate(name),old);
  if(!await page.evaluate(()=>document.getElementById("view-data").classList.contains("active")))problems.push("#"+old+" doesn't land on Data.");
 }
 await tab("settings");
 await page.click("#demo-button");
 await page.waitForTimeout(200);
 for(const name of ["insights","data","settings"])await tab(name);
 await tab("insights");
 const bars=await page.$$eval("#time-insights .bar-value",nodes=>nodes.map(n=>n.getAttribute("width")));
 if(bars.length&&new Set(bars).size<2)problems.push("Time of day bars are all the same length: "+bars.join(", "));
 // The offline app must stay the app after another page has been opened.
 // Playwright's WebKit can't navigate offline through a service worker, so this runs in Chromium.
 if(type===chromium){
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForTimeout(500);
  await page.goto(base+"/whitepaper.html");
  await page.waitForSelector("h1");
  await page.waitForTimeout(300);
  await context.setOffline(true);
  await page.goto(base+"/?do=none").catch(error=>problems.push("Offline launch failed: "+error.message));
  if(!await page.$("#checkin-title"))problems.push("Offline launch didn't open the app.");
 }
 await browser.close();
 return problems;
}
(async()=>{
 const names=process.argv.slice(2),server=await serve(),base="http://localhost:"+server.address().port;
 let failed=false;
 for(const name of names.length?names:["chromium"]){
  const problems=await run({chromium,webkit}[name],base);
  console.log(name+": "+(problems.length?problems.length+" problem(s)":"ok"));
  problems.forEach(problem=>{failed=true;console.log("  "+problem);});
 }
 server.close();
 process.exit(failed?1:0);
})().catch(error=>{console.error(error);process.exit(1);});
