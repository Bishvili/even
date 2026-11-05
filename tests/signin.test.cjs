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
async function setup(extra={},DB=d1()){
 const {createAuth}=await import("../worker/signin.mjs");
 const codes={};
 const {baseURL,...config}=extra;
 const env={...config,DB,PUBLIC_ORIGIN:"https://even.example",BETTER_AUTH_SECRET:"x".repeat(40),GOOGLE_CLIENT_ID:"id",GOOGLE_CLIENT_SECRET:"secret"};
 const auth=createAuth(env,{baseURL,isApproved:async email=>email==="in@example.com",deliverCode:(email,code)=>{codes[email]=code;}});
 const call=(route,body,cookie)=>auth.handler(new Request("https://even.example/api/signin/"+route,{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://even.example",...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)}));
 return {auth,call,codes,DB};
}
const ready=installed&&sqlite;
test("a code signs an approved email in, and is stored only as a hash",{skip:!ready},async()=>{
 const {auth,call,codes,DB}=await setup();
 assert.equal((await call("email-otp/send-verification-otp",{email:"in@example.com",type:"sign-in"})).status,200);
 assert.match(codes["in@example.com"],/^\d{6}$/);
 const stored=DB.raw.prepare("SELECT value FROM health_signin_verifications").all().map(r=>r.value).join();
 assert.ok(!stored.includes(codes["in@example.com"]));
 assert.notEqual((await call("sign-in/email-otp",{email:"in@example.com",otp:"000000"})).status,200);
 const signed=await call("sign-in/email-otp",{email:"in@example.com",otp:codes["in@example.com"]});
 assert.equal(signed.status,200);
 const cookie=signed.headers.get("set-cookie");
 assert.match(cookie,/health\.session_token/);
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
 assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM health_signin_users").get().n,0);
});
test("Google sign-in opens Google and returns to the Data tab",{skip:!ready},async()=>{
 const {call}=await setup();
 const r=await call("sign-in/social",{provider:"google",callbackURL:"https://even.example/#data",errorCallbackURL:"https://even.example/?auth=denied#data"});
 const body=await r.json();
 assert.equal(r.status,200,JSON.stringify(body));
 assert.match(body.url,/^https:\/\/accounts\.google\.com\//);
 assert.ok(body.url.includes(encodeURIComponent("https://even.example/api/signin/callback/google")));
 assert.match(body.url,/prompt=select_account/);
});

// Runs the whole relay against the real library, with Google's token endpoint answered here.
const RELAY="https://sync.example";
function google(email){
 const real=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{
  if(String(url).includes("oauth2.googleapis.com/token")){
   const part=value=>Buffer.from(JSON.stringify(value)).toString("base64url");
   const id_token=part({alg:"none"})+"."+part({sub:"google-1",email,email_verified:true,name:"Person",nonce:google.nonce})+".x";
   return new Response(JSON.stringify({access_token:"secret-access",id_token,token_type:"Bearer",expires_in:3600,scope:"openid email profile"}),{headers:{"Content-Type":"application/json"}});
  }
  return real(url,init);
 };
 return ()=>{globalThis.fetch=real;};
}
async function relayToApp(email){
 const DB=d1(),extra={GOOGLE_RELAY_ORIGIN:RELAY};
 const app=await setup(extra,DB),stable=await setup({...extra,baseURL:RELAY},DB),restore=google(email);
 try{
  const started=await app.call("sign-in/social",{provider:"google",callbackURL:"https://even.example/#data",errorCallbackURL:"https://even.example/?auth=denied#data"});
  const opened=new URL((await started.json()).url);
  assert.equal(opened.searchParams.get("redirect_uri"),RELAY+"/api/signin/callback/google");
  google.nonce=opened.searchParams.get("nonce")||undefined;
  const back=await stable.auth.handler(new Request(RELAY+"/api/signin/callback/google?code=abc&state="+encodeURIComponent(opened.searchParams.get("state"))));
  const handoff=back.headers.get("location");
  return {app,DB,back,handoff,finish:()=>app.auth.handler(new Request(handoff))};
 }finally{restore();}
}
test("the relay signs an approved Google account in on the app, and keeps no tokens",{skip:!ready},async()=>{
 const {DB,handoff,finish,back}=await relayToApp("in@example.com");
 assert.equal(back.status,302);
 assert.ok(handoff.startsWith("https://even.example/api/signin/callback/google/oauth-proxy?"),handoff);
 assert.ok(!handoff.includes("secret-access"),"tokens travel encrypted");
 assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM health_signin_sessions").get().n,0,"the relay's address makes no session");
 const done=await finish();
 assert.equal(done.status,302);
 assert.equal(done.headers.get("location"),"https://even.example/#data");
 assert.match(done.headers.get("set-cookie"),/health\.session_token/);
 const account=DB.raw.prepare("SELECT accessToken,idToken,refreshToken FROM health_signin_accounts").get();
 assert.deepEqual({...account},{accessToken:null,idToken:null,refreshToken:null});
});
test("the relay's handoff works once",{skip:!ready},async()=>{
 const {finish,DB}=await relayToApp("in@example.com");
 assert.equal((await finish()).status,302);
 const sessions=DB.raw.prepare("SELECT COUNT(*) AS n FROM health_signin_sessions").get().n;
 const again=await finish();
 assert.match(again.headers.get("location")||"",/error=/);
 assert.doesNotMatch(again.headers.get("set-cookie")||"",/health\.session_token=[^;]/);
 assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM health_signin_sessions").get().n,sessions);
});
test("the relay refuses an email that isn't approved, and leaves no account",{skip:!ready},async()=>{
 const {finish,DB}=await relayToApp("out@example.com");
 const done=await finish();
 assert.match(done.headers.get("location")||"",/auth=denied/);
 assert.doesNotMatch(done.headers.get("set-cookie")||"",/health\.session_token=[^;]/);
 assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM health_signin_users").get().n,0);
});
test("the relay refuses an expired handoff and one for an address that isn't trusted",{skip:!ready},async()=>{
 const {app,handoff}=await relayToApp("in@example.com");
 const real=Date.now;
 Date.now=()=>real()+61000;
 try{assert.match((await app.auth.handler(new Request(handoff))).headers.get("location")||"",/error=|auth=/);}finally{Date.now=real;}
 const bad=new URL(handoff);bad.searchParams.set("callbackURL","https://evil.example/");
 const refused=await app.auth.handler(new Request(bad));
 assert.ok(!(refused.headers.get("location")||"").startsWith("https://evil.example"));
 assert.doesNotMatch(refused.headers.get("set-cookie")||"",/health\.session_token=[^;]/);
});
test("Google saying no, or a made-up return, ends on the app with no session",{skip:!ready},async()=>{
 const DB=d1(),stable=await setup({GOOGLE_RELAY_ORIGIN:RELAY,baseURL:RELAY},DB);
 const made=await stable.auth.handler(new Request(RELAY+"/api/signin/callback/google?code=abc&state=made-up"));
 assert.ok((made.headers.get("location")||"").startsWith("https://even.example/?auth=failed"),made.headers.get("location"));
 assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM health_signin_sessions").get().n,0);
});
