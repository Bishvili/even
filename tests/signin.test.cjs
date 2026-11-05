"use strict";
// Runs the real sign-in library against a real SQLite database, wherever its package is installed.
const test=require("node:test"),assert=require("node:assert"),fs=require("node:fs"),path=require("node:path");
let installed=true;try{require.resolve("better-auth");}catch(e){installed=false;}
let sqlite=null;try{sqlite=require("node:sqlite");}catch(e){}

function d1(){
 const db=new sqlite.DatabaseSync(":memory:");
 const schema=fs.readFileSync(path.join(__dirname,"..","db","migrations","0005_signin.sql"),"utf8");
 db.exec(schema);
 const clean=value=>value===undefined?null:value;
 function statement(sql,args=[]){
  return {
   bind:(...values)=>statement(sql,values),
   all:async()=>({results:db.prepare(sql).all(...args.map(clean)),success:true,meta:{}}),
   raw:async()=>db.prepare(sql).all(...args.map(clean)).map(Object.values),
   first:async()=>db.prepare(sql).get(...args.map(clean))||null,
   run:async()=>{const r=db.prepare(sql).run(...args.map(clean));return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}
  };
 }
 return {prepare:sql=>statement(sql),batch:async list=>Promise.all(list.map(s=>s.run())),exec:async sql=>{db.exec(sql);return{};},raw:db};
}
async function setup(){
 const {createAuth}=await import("../worker/signin.mjs");
 const DB=d1(),codes={};
 const env={DB,PUBLIC_ORIGIN:"https://even.example",BETTER_AUTH_SECRET:"x".repeat(40)};
 const auth=createAuth(env,{isApproved:async email=>email==="in@example.com",deliverCode:(email,code)=>{codes[email]=code;}});
 const call=(route,body,cookie)=>auth.handler(new Request("https://even.example/api/signin/"+route,{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://even.example",...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)}));
 return {auth,call,codes,DB};
}
const ready=installed&&sqlite;
test("a code signs an approved email in, and is stored only as a hash",{skip:!ready},async()=>{
 const {auth,call,codes,DB}=await setup();
 assert.equal((await call("email-otp/send-verification-otp",{email:"in@example.com",type:"sign-in"})).status,200);
 assert.match(codes["in@example.com"],/^\d{6}$/);
 const stored=DB.raw.prepare("SELECT value FROM even_signin_verifications").all().map(r=>r.value).join();
 assert.ok(!stored.includes(codes["in@example.com"]));
 assert.notEqual((await call("sign-in/email-otp",{email:"in@example.com",otp:"000000"})).status,200);
 const signed=await call("sign-in/email-otp",{email:"in@example.com",otp:codes["in@example.com"]});
 assert.equal(signed.status,200);
 const cookie=signed.headers.get("set-cookie");
 assert.match(cookie,/even\.session_token/);
 const session=await auth.api.getSession({headers:new Headers({Cookie:cookie.split(";")[0]})});
 assert.equal(session.user.email,"in@example.com");
});
test("an email that isn't approved can't create an account",{skip:!ready},async()=>{
 const {call,codes,DB}=await setup();
 await call("email-otp/send-verification-otp",{email:"out@example.com",type:"sign-in"});
 if(codes["out@example.com"]){
  const r=await call("sign-in/email-otp",{email:"out@example.com",otp:codes["out@example.com"]});
  assert.notEqual(r.status,200);
 }
 assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM even_signin_users").get().n,0);
});
