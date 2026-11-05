// The sign-in sheet: an emailed code, or Google when it's available.
(function(){
 var app=globalThis.EvenApp,email="";
 function $(id){return document.getElementById(id);}
 function fail(text){$("signin-error").textContent=text||"";$("signin-error").hidden=!text;}
 function step(codeStep){
  $("signin-email-form").hidden=codeStep;$("signin-code-form").hidden=!codeStep;
  $("signin-google").hidden=$("signin-or").hidden=codeStep||!googleOn;
  $(codeStep?"signin-code":"signin-email").focus();
 }
 var googleOn=false;
 function post(route,body){
  return fetch("/api/signin/"+route,{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
 }
 async function busy(button,work){
  fail("");button.disabled=true;
  try{
   if(!navigator.onLine)throw Error("Connect to the internet to sign in.");
   await work();
  }catch(e){fail(e.message||"Something went wrong. Try again.");}
  finally{button.disabled=false;}
 }
 function open(){
  fail("");$("signin-code").value="";
  $("signin-sheet").showModal();
  step(false);
  fetch("/api/signin/options",{cache:"no-store"}).then(function(r){return r.json();}).then(function(o){googleOn=o.google===true;$("signin-google").hidden=$("signin-or").hidden=!googleOn||!$("signin-code-form").hidden;}).catch(function(){});
 }
 $("signin-email-form").addEventListener("submit",function(ev){
  ev.preventDefault();
  busy($("signin-send"),async function(){
   email=$("signin-email").value.trim().toLowerCase();
   var r=await post("email-otp/send-verification-otp",{email:email,type:"sign-in"});
   var body=await r.json().catch(function(){return{};});
   // A code sent a moment ago is still good, so this moves on to entering it.
   if(!r.ok&&body.code!=="code_just_sent")throw Error(body.error||"Couldn’t send a code. Try again.");
   $("signin-code-note").textContent="If "+email+" has been invited, a code is on its way.";
   $("signin-code").value="";step(true);
  });
 });
 $("signin-code-form").addEventListener("submit",function(ev){
  ev.preventDefault();
  busy($("signin-verify"),async function(){
   var r=await post("sign-in/email-otp",{email:email,otp:$("signin-code").value.trim()});
   if(r.status===429)throw Error("Too many tries. Try again in a minute.");
   if(!r.ok)throw Error("That code didn’t work. Check it, or ask for a new one.");
   $("signin-sheet").close();
   await app.refreshAuth();
   app.toast("You’re signed in.");
  });
 });
 $("signin-back").addEventListener("click",function(){fail("");step(false);});
 $("signin-cancel").addEventListener("click",function(){$("signin-sheet").close();});
 $("signin-google").addEventListener("click",function(){
  busy($("signin-google"),async function(){
   var r=await post("sign-in/social",{provider:"google",callbackURL:location.origin+"/#data",errorCallbackURL:location.origin+"/?auth=denied#data"});
   var body=await r.json();
   if(!r.ok||!body.url)throw Error("Couldn’t open Google. Try your email instead.");
   window.location.assign(body.url);
  });
 });
 globalThis.EvenSignin={open:open};
})();
