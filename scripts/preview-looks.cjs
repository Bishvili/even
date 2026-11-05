#!/usr/bin/env node
"use strict";
// Screenshots each look in brand/looks.json without deploying anything. Usage: node scripts/preview-looks.cjs [out] [Name,Name]
// A look is a name, optional main colors and an optional logo file. What it leaves out stays as it is today.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const{chromium}=require("playwright");
const{serve}=require("./serve-app.cjs");
const{build,buildImages}=require("./build-assets.cjs");
const brand=require("../brand/brand.json"),looks=require("../brand/looks.json"),palette=require("../brand/palette.json");
const{resolve}=require("./brand-colors.cjs");
const connect=()=>localStorage.setItem("health:v1",JSON.stringify({moods:[],health:[],events:[],token:"key",deviceId:"device-1",syncOwnerEmail:"owner@example.com"}));
async function shoot(browser,base,scheme,folder){
 const context=await browser.newContext({colorScheme:scheme,viewport:{width:390,height:844},deviceScaleFactor:1,serviceWorkers:"block"}),page=await context.newPage();
 const snap=name=>page.screenshot({path:path.join(folder,scheme+"-"+name+".png")});
 await page.goto(base);await page.waitForSelector("#gate-action:not([hidden])");await snap("sign-in");
 await page.evaluate(connect);await page.reload();await page.waitForSelector(".bottom-nav");
 await page.click(".nav-item[data-go=settings]");await page.click("#demo-button");await page.waitForTimeout(300);
 for(const tab of["checkin","insights","data","settings"]){await page.click(".nav-item[data-go="+tab+"]");await page.waitForTimeout(300);await snap(tab);}
 await context.close();
}
async function main(out="previews",only=""){
 const wanted=only?only.split(",").map(name=>name.trim()):looks.map(look=>look.name);
 const browser=await chromium.launch();
 for(const look of looks.filter(look=>wanted.includes(look.name))){
  const folder=path.join(out,look.name),dir=fs.mkdtempSync(path.join(os.tmpdir(),"look-")),colors=look.colors||brand.colors;
  fs.mkdirSync(folder,{recursive:true});
  build({out:dir,brand:{...brand,name:look.name,colors},logoFile:look.logo||"brand/logo.svg"});
  await buildImages(dir,resolve(palette,colors));
  fs.copyFileSync(path.join(dir,"icon-512.png"),path.join(folder,"icon.png"));
  const server=await serve({connected:true,dir}),base="http://localhost:"+server.address().port;
  for(const scheme of["light","dark"])await shoot(browser,base,scheme,folder);
  server.close();fs.rmSync(dir,{recursive:true});
  console.log("Drew "+look.name);
 }
 await browser.close();
}
main(process.argv[2],process.argv[3]).then(()=>process.exit(0),error=>{console.error(error);process.exit(1);});
