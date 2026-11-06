// The look the app wears: a name, an icon and a palette from the catalogue, or none for the one it was built with.
(function(root){
 var DATA=JSON.parse("{{looksData}}"),KEY="health-look",NAME="health-look-name",WAITING="health-look-waiting",THEME="health-theme",current=null,deployedTitle=null;
 var THEMES=["light","dark","system"],NAME_LIMIT=24;
 function find(list,id){return list.filter(function(item){return item.id===id;})[0]||null;}
 function clean(text){return String(text||"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,NAME_LIMIT).trim();}
 // n0 is a name the person typed. It takes the rest of its words from the app as built.
 function parse(id,typed){
  var match=/^(n[0-9])\.(i[1-9])\.(p[1-9])$/.exec(id||"");
  if(!match)return null;
  var own=clean(typed),name=match[1]==="n0"?(own?{id:"n0",name:own,installName:own,tagline:DATA.deployed.tagline,pitch:DATA.deployed.pitch}:null):find(DATA.names,match[1]),icon=find(DATA.icons,match[2]),palette=find(DATA.palettes,match[3]);
  return name&&icon&&palette?{id:match[0],name:name,icon:icon,palette:palette}:null;
 }
 function stored(key){try{return localStorage.getItem(key);}catch(e){return null;}}
 function store(key,value){try{if(value===null||value===undefined)localStorage.removeItem(key);else localStorage.setItem(key,value);}catch(e){/* Without storage the choice lasts until the app closes. */}}
 function field(key){return current?current.name[key]:DATA.deployed[key];}
 function savedName(){return stored(NAME)||"";}
 function theme(){var value=stored(THEME);return THEMES.indexOf(value)>=0?value:"system";}
 function tileUrl(){
  var svg=current?current.icon.svg:DATA.deployed.icon,colors=current?current.palette:DATA.deployed.colors;
  return "data:image/svg+xml,"+encodeURIComponent(root.Marks.tile(svg,colors).replace("<svg ",'<svg xmlns="http://www.w3.org/2000/svg" '));
 }
 function head(){
  if(!root.document)return;
  var d=root.document,chosen=theme(),page=current?current.palette.page:DATA.deployed.page;
  if(deployedTitle===null)deployedTitle=d.title;
  if(current)d.documentElement.setAttribute("data-palette",current.palette.id);else d.documentElement.removeAttribute("data-palette");
  if(chosen==="system")d.documentElement.removeAttribute("data-theme");else d.documentElement.setAttribute("data-theme",chosen);
  d.title=current?current.name.name:deployedTitle;
  Array.prototype.forEach.call(d.querySelectorAll('meta[name="theme-color"]'),function(meta,index){meta.content=page[chosen==="system"?(index?"dark":"light"):chosen];});
  var link=d.querySelector('link[rel="icon"]');
  if(!link){link=d.createElement("link");link.rel="icon";d.head.appendChild(link);}
  link.href=tileUrl();
 }
 function body(){
  if(!root.document||!root.document.body)return;
  var d=root.document;
  Array.prototype.forEach.call(d.querySelectorAll("[data-brand]"),function(part){part.textContent=field(part.getAttribute("data-brand"));});
  Array.prototype.forEach.call(d.querySelectorAll("[data-brand-label]"),function(part){part.setAttribute("aria-label",part.getAttribute("data-brand-label").replace("%",field("name")));});
  var mark=current?root.Marks.mark(current.icon.svg):DATA.deployed.mark,pull=current?root.Marks.pull(current.icon.svg):DATA.deployed.pull;
  Array.prototype.forEach.call(d.querySelectorAll(".brand-icon,.signin-mark"),function(part){part.innerHTML=mark;});
  var gate=d.querySelector(".gate-mark");if(gate)gate.src=tileUrl();
  var indicator=d.getElementById("pull-indicator"),old=indicator&&indicator.querySelector("svg");
  if(old)old.outerHTML=pull;
 }
 // Shows a look without keeping it.
 function wear(id,typed){current=parse(id,typed);head();body();}
 function saved(){return parse(stored(KEY),savedName())?stored(KEY):null;}
 function keep(id,typed){var look=parse(id,typed);store(KEY,look?id:null);store(NAME,look&&id.indexOf("n0.")===0?clean(typed):null);}
 // Keeps a look on this device, to be sent to the account. Nothing means the one the app was built with.
 function save(id,typed){keep(id,typed);store(WAITING,"1");wear(id,typed);}
 // What the account holds, unless this device has a newer choice waiting to go.
 function follow(id,typed){
  if(stored(WAITING)||(id&&!parse(id,typed))||(id===saved()&&clean(typed)===savedName()))return false;
  keep(id,typed);wear(id,typed);return true;
 }
 function setTheme(value){store(THEME,value==="system"||THEMES.indexOf(value)<0?null:value);head();}
 // The address iOS reads an icon and label from.
 function url(id,typed){return id?"/?look="+id+(id.indexOf("n0.")===0?"&name="+encodeURIComponent(clean(typed)):""):"/";}
 function start(){
  var params=root.location?new URLSearchParams(root.location.search):null,given=params&&params.get("look"),typed=params&&params.get("name");
  // A new icon carries the look it was added with, and tells the account at sign-in.
  if(parse(given,typed)&&!saved()){keep(given,typed);store(WAITING,"1");}
  current=parse(stored(KEY),savedName());
  head();
  // In Safari, a chosen look needs its own address for Add to Home Screen to pick it up.
  if(root.navigator&&root.navigator.standalone===false&&saved()&&!given){root.location.replace(url(saved(),savedName())+root.location.hash);return;}
  if(root.document)root.document.addEventListener("DOMContentLoaded",body);
 }
 root.Look={name:function(){return field("name");},installName:function(){return field("installName");},tagline:function(){return field("tagline");},pitch:function(){return field("pitch");},
  catalog:DATA,NAME_LIMIT:NAME_LIMIT,parse:parse,wear:wear,saved:saved,savedName:savedName,save:save,follow:follow,url:url,theme:theme,setTheme:setTheme,current:function(){return current?current.id:null;},
  waiting:function(){return stored(WAITING)?{look:saved(),name:saved()&&savedName()||null}:null;},sent:function(){store(WAITING,null);},restore:function(){wear(saved(),savedName());},
  home:function(){return DATA.home;}};
 start();
})(globalThis);
