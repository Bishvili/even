#!/usr/bin/env node
"use strict";
// Loads the app as it ships: the public file list and the Worker's security headers, signed out.
// Fails on any uncaught error or security-policy violation. Usage: node scripts/smoke.cjs [chromium] [webkit]
const {serve,SECURITY}=require("./serve-app.cjs");
const {chromium,webkit}=require("playwright");
const connect=()=>localStorage.setItem("health:v1",JSON.stringify({moods:[],health:[],events:[],token:"key",deviceId:"device-1",syncOwnerEmail:"owner@example.com",pairedAt:1}));
async function run(type,base){
 const browser=await type.launch(),problems=[];
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:"allow"});
 const page=await context.newPage();
 // Playwright's WebKit stops responding when asked for a push subscription, so push is off there. Chromium covers it.
 if(type!==chromium)await page.addInitScript(()=>{delete window.PushManager;});
 page.on("dialog",dialog=>dialog.accept());
 page.on("pageerror",error=>problems.push("Error: "+error.message));
 page.on("console",message=>{if(message.type()==="error"&&/content security|refused to|security policy/i.test(message.text()))problems.push("Policy: "+message.text());});
 const tab=async name=>{await page.click(`.nav-item[data-go=${name}]`);await page.waitForTimeout(150);};
 // A new device starts with the first-run steps, with the main action in view on a small iPhone.
 await page.setViewportSize({width:375,height:667});
 await page.goto(base);
 await page.waitForSelector("#gate-action:not([hidden])");
 const actionInView=await page.evaluate(()=>{const r=document.getElementById("gate-action").getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;});
 if(!actionInView)problems.push("Sign in isn't in view at 375x667 on first launch.");
 await page.click("#gate-action");
 if(!await page.evaluate(()=>document.getElementById("signin-sheet").open))problems.push("The sign-in sheet didn't open.");
 await page.click("#signin-cancel");
 const phone=await browser.newContext({viewport:{width:375,height:667},userAgent:"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",serviceWorkers:"block"});
 const phonePage=await phone.newPage();
 phonePage.on("pageerror",error=>problems.push("Error: "+error.message));
 await phonePage.goto(base);
 if(!/Home Screen/.test(await phonePage.textContent("#gate-title")))problems.push("A new iPhone doesn't start with the Home Screen step.");
 await phone.close();
 await page.evaluate(connect);
 await page.reload();
 await page.waitForSelector("#checkin-title");
 if(!await page.evaluate(()=>document.getElementById("gate").hidden))problems.push("A connected device is still held at the first-run steps.");
 await page.setViewportSize({width:375,height:667});
 await page.waitForTimeout(100);
 const reachable=await page.evaluate(()=>{const bar=document.querySelector(".bottom-nav").getBoundingClientRect().top;return [...document.querySelectorAll("[data-mood]")].every(b=>{const r=b.getBoundingClientRect();return r.top>=0&&r.bottom<=bar;});});
 if(!reachable)problems.push("Mood buttons aren't fully visible at 375x667.");
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
 await page.click(".nav-item[data-go=checkin]");
 if(!/^0 personal entries$/.test(await page.textContent("#entries-count")))problems.push("The entry count reads wrong.");
 await page.click("[data-mood='3']");await page.click("#save-mood");await page.waitForTimeout(100);
 if(!/^1 personal entry$/.test(await page.textContent("#entries-count")))problems.push("The entry count reads wrong after one check-in.");
 const checkCache=type===chromium;
 await page.evaluate(async withCache=>{localStorage.setItem("health-setup",JSON.stringify({skipped:{signin:1}}));localStorage.setItem("health-reminder","{}");if(withCache)await(await caches.open("health-brief")).put("/brief",new Response("x"));},checkCache);
 await tab("settings");await page.click("#erase-local");await page.click("#confirm-yes");await page.waitForTimeout(400);
 const left=await Promise.race([page.evaluate(async withCache=>({keys:Object.keys(localStorage),caches:withCache?await caches.keys():[]}),checkCache),new Promise((_,fail)=>setTimeout(()=>fail(Error("The page stopped responding after erase.")),20000))]);
 if(left.keys.join()!=="health:v1"||left.caches.includes("health-brief"))problems.push("Erase left something behind: "+JSON.stringify(left));
 if(!await page.evaluate(()=>!document.getElementById("gate").hidden))problems.push("Erasing didn't return to the first-run steps.");
 await page.evaluate(connect);
 await page.reload();
 await page.waitForSelector(".bottom-nav");
 for(const old of ["sync","sources"]){
  await page.evaluate(name=>App.navigate(name),old);
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
 const names=process.argv.slice(2),server=await serve({connected:true}),base="http://localhost:"+server.address().port;
 let failed=false;
 for(const name of names.length?names:["chromium"]){
  const problems=await run({chromium,webkit}[name],base);
  console.log(name+": "+(problems.length?problems.length+" problem(s)":"ok"));
  problems.forEach(problem=>{failed=true;console.log("  "+problem);});
 }
 server.close();
 process.exit(failed?1:0);
})().catch(error=>{console.error(error);process.exit(1);});
