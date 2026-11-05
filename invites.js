// Sharing the app and managing who can sign in. Shown to developer accounts.
(function(){
 var app=globalThis.App,SHARE_URL=location.origin+"/";
 function $(id){return document.getElementById(id);}
 function send(path,email){return fetch(path,{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:email})});}

 var ICONS={edit:'<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',send:'<path d="M21 3 10 14"/><path d="M21 3 14.5 21 10 14 3 9.5 21 3Z"/>',trash:'<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>'};
 function action(label,icon,handler){
  var button=document.createElement("button");
  button.type="button";button.className="icon-action";button.setAttribute("aria-label",label);button.title=label;
  button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+ICONS[icon]+'</svg>';
  button.addEventListener("click",handler);
  return button;
 }
 function resend(email,button){
  button.disabled=true;
  send(app.accountPath("testers/invite"),email).then(function(r){return r.json().then(function(data){
   app.toast(r.status===429?data.error:r.ok&&data.emailed?"Invitation sent to "+email+".":"The email didn’t send. Share the link instead.");
  });}).catch(function(){app.toast("The email didn’t send. Share the link instead.");}).finally(function(){button.disabled=false;});
 }
 function remove(email){
  app.askConfirm("Remove "+email+"? They’ll lose access, and their synced Health, calendar, alarm and check-in data will be deleted. This can’t be undone.","Remove").then(function(yes){
   if(!yes)return;
   send(app.accountPath("testers/remove"),email).then(function(r){if(!r.ok)throw Error();app.toast(email+" removed.");load();}).catch(function(){app.toast("Couldn’t remove that email.");});
  });
 }
 function openName(tester){
  var dialog=$("tester-name-dialog");
  dialog.dataset.email=tester.email;
  $("tester-name-email").textContent=tester.email;
  $("tester-name-input").value=tester.name||"";
  dialog.showModal();
 }
 function saveName(event){
  event.preventDefault();
  var dialog=$("tester-name-dialog"),save=$("tester-name-save");
  save.disabled=true;
  fetch(app.accountPath("testers/name"),{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:dialog.dataset.email,name:$("tester-name-input").value})})
   .then(function(r){if(!r.ok)throw Error();dialog.close();app.toast("Name saved.");load();})
   .catch(function(){app.toast("Couldn’t save that name. Check your connection and try again.");})
   .finally(function(){save.disabled=false;});
 }
 function renderList(testers){
  var list=$("tester-list");list.textContent="";
  testers.forEach(function(tester){
   var row=document.createElement("div"),who=document.createElement("div"),title=document.createElement("strong"),status=document.createElement("small"),actions=document.createElement("div");
   row.className="tester-row";who.className="tester-who";actions.className="tester-actions";
   title.textContent=tester.name||tester.email;
   status.textContent=(tester.name?tester.email+" · ":"")+(tester.signedIn?"Signed in":"Not signed in yet");
   who.appendChild(title);who.appendChild(status);
   actions.appendChild(action("Edit name for "+tester.email,"edit",function(){openName(tester);}));
   var invite=action("Resend invite to "+tester.email,"send",function(){resend(tester.email,invite);});
   actions.appendChild(invite);
   if(tester.removable)actions.appendChild(action("Remove "+tester.email,"trash",function(){remove(tester.email);}));
   row.appendChild(who);row.appendChild(actions);list.appendChild(row);
  });
 }
 function load(){
  return fetch(app.accountPath("testers"),{credentials:"same-origin",cache:"no-store",headers:{"Accept":"application/json"}})
   .then(function(r){if(!r.ok)throw Error();return r.json();})
   .then(function(data){renderList(data.testers||[]);})
   .catch(function(){app.toast("Couldn’t load testers. Reopen Settings to try again.");});
 }
 async function add(event){
  event.preventDefault();
  var input=$("tester-email"),nameInput=$("tester-new-name"),button=$("add-tester"),email=input.value.trim().toLowerCase();
  button.disabled=true;
  try{
   var r=await fetch(app.accountPath("testers"),{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:email,name:nameInput.value})});
   var result=await r.json();
   if(!r.ok)throw Error(result.error||"Couldn’t add that email.");
   input.value="";nameInput.value="";app.toast(result.emailed?"Invitation sent to "+email+".":email+" can sign in, but the email didn’t send. Share the link instead.");await load();
  }catch(e){app.toast(e.message);}
  button.disabled=false;
 }
 async function share(){
  var details={title:"{{name}}",text:"Try {{name}}, {{pitch}}.",url:SHARE_URL};
  try{
   if(navigator.share){await navigator.share(details);return;}
   await navigator.clipboard.writeText(SHARE_URL);app.toast("Link copied.");
  }catch(e){if(e.name!=="AbortError")app.toast("Couldn’t share the link.");}
 }
 $("tester-form").addEventListener("submit",add);
 $("tester-name-form").addEventListener("submit",saveName);
 $("tester-name-cancel").addEventListener("click",function(){$("tester-name-dialog").close();});
 $("share-app").addEventListener("click",share);
 // Only release accounts see testers, so the list loads once Developer tools appears.
 var card=$("release-card");
 new MutationObserver(function(){if(!card.hidden)load();}).observe(card,{attributes:true,attributeFilter:["hidden"]});
})();
