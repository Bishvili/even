"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
require("../marks.js");
const{Marks}=globalThis,dir=path.join(__dirname,"..","brand/catalog"),icons=JSON.parse(fs.readFileSync(path.join(dir,"icons.json"),"utf8"));
const raw=icon=>Marks.neutral(fs.readFileSync(path.join(dir,icon.file),"utf8"));
test("every icon makes a header mark with no background and no fixed color",()=>{
 for(const icon of icons){const mark=Marks.mark(raw(icon));assert.doesNotMatch(mark,/<rect|%[chl]%|\{\{|\sid=/,icon.id);assert.match(mark,/currentColor|icon-line/,icon.id);}
});
test("every icon's pull mark starts hidden and undrawn, on its own horizon, with its colors as classes",()=>{
 for(const icon of icons){
  const mark=Marks.pull(raw(icon)),source=raw(icon);
  assert.doesNotMatch(mark,/%[chl]%/,icon.id);
  assert.ok(mark.includes('height="'+source.match(/data-horizon="(\d+)"/)[1]+'"'),icon.id);
  assert.ok(mark.includes('data-rise="'+source.match(/data-rise="(\d+)"/)[1]+'"'),icon.id);
  assert.match(mark,/clip-path="url\(#pull-horizon\)"><(g|path) data-pull="rise"|clip-path="url\(#pull-horizon\)"><(g|path) class="[^"]*" data-pull="rise"/,icon.id);
  for(const line of mark.match(/<\w+[^>]*data-pull="line"[^>]*>/g))assert.ok(line.includes('pathLength="1"')&&line.includes('stroke-dashoffset="1"')&&line.includes('fill="none"'),icon.id);
 }
});
test("the current logo's pull mark keeps its depth and horizon",()=>{
 const mark=Marks.pull(Marks.neutral(fs.readFileSync(path.join(__dirname,"..","brand/logo.svg"),"utf8")));
 assert.match(mark,/data-rise="170"/);assert.match(mark,/<rect width="512" height="346"\/>/);assert.match(mark,/class="icon-deep"/);assert.match(mark,/class="icon-sand"/);
});

const os=require("node:os"),vm=require("node:vm");
function loaded(saved={}){
 const{build}=require("../scripts/build-assets.cjs"),out=fs.mkdtempSync(path.join(os.tmpdir(),"look-"));
 try{
  build({out});
  const box={URLSearchParams,encodeURIComponent,location:{search:saved.search||""},localStorage:{get:saved,getItem(key){return Object.hasOwn(saved,key)?saved[key]:null;},setItem(key,value){saved[key]=value;},removeItem(key){delete saved[key];}}};
  box.globalThis=box;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,"..","marks.js"),"utf8"),box);
  vm.runInNewContext(fs.readFileSync(path.join(out,"looks.js"),"utf8"),box);
  return box.Look;
 }finally{fs.rmSync(out,{recursive:true});}
}
test("every one of the 729 looks can be worn, and anything else is the deployed look",()=>{
 const look=loaded();
 assert.equal(look.current(),null);
 const deployed=look.name();
 for(let n=1;n<=9;n++)for(let i=1;i<=9;i++)for(let p=1;p<=9;p++){
  const id="n"+n+".i"+i+".p"+p;look.wear(id);
  assert.equal(look.current(),id);assert.ok(look.name()&&look.pitch()&&look.tagline()&&look.installName());
 }
 for(const bad of ["n0.i1.p1","n1.i1","x",""]){look.wear(bad);assert.equal(look.current(),null);assert.equal(look.name(),deployed);}
});
test("a saved look comes back, a link only fills in for none, and a waiting choice outranks the account",()=>{
 assert.equal(loaded({"health-look":"n2.i3.p4"}).name(),"Fulcrum");
 assert.equal(loaded({search:"?look=n3.i3.p3"}).current(),"n3.i3.p3");
 assert.equal(loaded({"health-look":"n2.i2.p2",search:"?look=n3.i3.p3"}).current(),"n2.i2.p2");
 const store={},look=loaded(store);
 assert.equal(look.follow("n5.i5.p5"),true);assert.equal(look.current(),"n5.i5.p5");assert.equal(look.waiting(),null);
 look.wear("n2.i2.p2");look.restore();assert.equal(look.current(),"n5.i5.p5");
 look.save("n7.i7.p7");assert.deepEqual(JSON.parse(JSON.stringify(look.waiting())),{look:"n7.i7.p7"});
 assert.equal(look.follow("n5.i5.p5"),false);assert.equal(look.current(),"n7.i7.p7");
 look.sent();assert.equal(look.waiting(),null);
 assert.equal(look.follow(null),true);assert.equal(look.current(),null);
});

test("adopting a look leaves the build working and wearing it, for each starting pair",()=>{
 const{adopt}=require("../scripts/adopt-look.cjs"),{build}=require("../scripts/build-assets.cjs");
 const names=JSON.parse(fs.readFileSync(path.join(dir,"names.json"),"utf8")),repo=path.join(__dirname,"..");
 for(const item of names){
  const copy=fs.mkdtempSync(path.join(os.tmpdir(),"adopt-")),out=fs.mkdtempSync(path.join(os.tmpdir(),"adopted-"));
  try{
   fs.cpSync(path.join(repo,"brand"),path.join(copy,"brand"),{recursive:true});
   adopt(item.id,item.with.icon,item.with.palette,copy);
   const brand=JSON.parse(fs.readFileSync(path.join(copy,"brand/brand.json"),"utf8"));
   assert.equal(brand.name,item.name);
   build({out,brand,logoFile:path.relative(repo,path.join(copy,"brand/logo.svg"))});
   assert.match(fs.readFileSync(path.join(out,"index.html"),"utf8"),new RegExp("<title>"+item.name+"</title>"));
  }finally{fs.rmSync(copy,{recursive:true});fs.rmSync(out,{recursive:true});}
 }
});
