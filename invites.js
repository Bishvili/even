// Sharing Even and managing who can sign in. Shown to developer accounts.
(function(){
 var app=globalThis.EvenApp,SHARE_URL="https://even.bishvili.workers.dev/";
 function $(id){return document.getElementById(id);}
 function send(path,email){return fetch(path,{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:email})});}

 function renderList(testers){
  var list=$("tester-list");list.textContent="";
  testers.forEach(function(email){
   var row=document.createElement("div"),name=document.createElement("span"),remove=document.createElement("button");
   row.className="calendar-row";name.textContent=email;
   remove.type="button";remove.className="small-action";remove.textContent="Remove";
   remove.addEventListener("click",function(){
    if(!confirm("Remove "+email+"? They’ll lose access to Sync."))return;
    send("/api/auth/testers/remove",email).then(function(r){if(!r.ok)throw Error();app.toast(email+" removed.");load();}).catch(function(){app.toast("Couldn’t remove that email.");});
   });
   row.appendChild(name);row.appendChild(remove);list.appendChild(row);
  });
 }
 function load(){
  return fetch("/api/auth/testers",{credentials:"same-origin",cache:"no-store",headers:{"Accept":"application/json"}})
   .then(function(r){if(!r.ok)throw Error();return r.json();})
   .then(function(data){renderList(data.testers||[]);})
   .catch(function(){});
 }
 async function add(event){
  event.preventDefault();
  var input=$("tester-email"),button=$("add-tester"),email=input.value.trim().toLowerCase();
  button.disabled=true;
  try{
   var r=await send("/api/auth/testers",email);
   var result=await r.json();
   if(!r.ok)throw Error(result.error||"Couldn’t add that email.");
   input.value="";app.toast(result.emailed?"Invitation sent to "+email+".":email+" can sign in, but the email didn’t send. Share the link instead.");await load();
  }catch(e){app.toast(e.message);}
  button.disabled=false;
 }
 async function share(){
  var details={title:"Even",text:"Try Even, a private way to understand your harder days.",url:SHARE_URL};
  try{
   if(navigator.share){await navigator.share(details);return;}
   await navigator.clipboard.writeText(SHARE_URL);app.toast("Link copied.");
  }catch(e){if(e.name!=="AbortError")app.toast("Couldn’t share the link.");}
 }
 $("tester-form").addEventListener("submit",add);
 $("share-even").addEventListener("click",share);
 document.addEventListener("visibilitychange",function(){if(!document.hidden)load();});
 load();
})();
