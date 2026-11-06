// The look the app wears: a name, an icon and a palette from the catalogue, or none for the one it was built with.
(function(root){
 var DATA=JSON.parse("{{looksData}}"),KEY="health-look",WAITING="health-look-waiting",current=null,deployedHead=null;
 function find(list,id){return list.filter(function(item){return item.id===id;})[0]||null;}
 function parse(id){
  var match=/^(n[1-9])\.(i[1-9])\.(p[1-9])$/.exec(id||"");
  if(!match)return null;
  var name=find(DATA.names,match[1]),icon=find(DATA.icons,match[2]),palette=find(DATA.palettes,match[3]);
  return name&&icon&&palette?{id:match[0],name:name,icon:icon,palette:palette}:null;
 }
 function stored(key){try{return localStorage.getItem(key);}catch(e){return null;}}
 function store(key,value){try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}catch(e){/* Without storage the look lasts until the app closes. */}}
 function field(key){return current?current.name[key]:DATA.deployed[key];}
 function head(){
  if(!root.document)return;
  var d=root.document,themes=d.querySelectorAll('meta[name="theme-color"]');
  if(!deployedHead)deployedHead={title:d.title,themes:Array.prototype.map.call(themes,function(meta){return meta.content;})};
  if(current)d.documentElement.setAttribute("data-palette",current.palette.id);else d.documentElement.removeAttribute("data-palette");
  d.title=current?current.name.name:deployedHead.title;
  Array.prototype.forEach.call(themes,function(meta,index){meta.content=current?current.palette.page[index?"dark":"light"]:deployedHead.themes[index];});
  var link=d.querySelector('link[rel="icon"]');
  if(!link){link=d.createElement("link");link.rel="icon";d.head.appendChild(link);}
  var svg=current?current.icon.svg:DATA.deployed.icon,colors=current?current.palette:DATA.deployed.colors;
  link.href="data:image/svg+xml,"+encodeURIComponent(root.Marks.tile(svg,colors).replace("<svg ",'<svg xmlns="http://www.w3.org/2000/svg" '));
 }
 function body(){
  if(!root.document||!root.document.body)return;
  var d=root.document;
  Array.prototype.forEach.call(d.querySelectorAll("[data-brand]"),function(part){part.textContent=field(part.getAttribute("data-brand"));});
  Array.prototype.forEach.call(d.querySelectorAll("[data-brand-label]"),function(part){part.setAttribute("aria-label",part.getAttribute("data-brand-label").replace("%",field("name")));});
  var mark=current?root.Marks.mark(current.icon.svg):DATA.deployed.mark,pull=current?root.Marks.pull(current.icon.svg):DATA.deployed.pull;
  Array.prototype.forEach.call(d.querySelectorAll(".brand-icon,.signin-mark"),function(part){part.innerHTML=mark;});
  var indicator=d.getElementById("pull-indicator"),old=indicator&&indicator.querySelector("svg");
  if(old)old.outerHTML=pull;
 }
 // Shows a look without keeping it.
 function wear(id){current=parse(id);head();body();}
 function saved(){return parse(stored(KEY))?stored(KEY):null;}
 // Keeps a look on this device, to be sent to the account. Nothing means the one the app was built with.
 function save(id){store(KEY,parse(id)?id:null);store(WAITING,"1");wear(id);}
 // What the account holds, unless this device has a newer choice waiting to go.
 function follow(id){if(stored(WAITING)||id===saved()||(id&&!parse(id)))return false;store(KEY,id||null);wear(id);return true;}
 function start(){
  var given=root.location&&new URLSearchParams(root.location.search).get("look");
  if(parse(given)&&!saved())store(KEY,given);
  current=parse(stored(KEY));
  head();
  if(root.document)root.document.addEventListener("DOMContentLoaded",body);
 }
 root.Look={name:function(){return field("name");},installName:function(){return field("installName");},tagline:function(){return field("tagline");},pitch:function(){return field("pitch");},
  catalog:DATA,parse:parse,wear:wear,saved:saved,save:save,follow:follow,current:function(){return current?current.id:null;},
  waiting:function(){return stored(WAITING)?{look:saved()}:null;},sent:function(){store(WAITING,null);},restore:function(){wear(saved());},
  home:function(){return DATA.home;},KEYS:[KEY,WAITING]};
 start();
})(globalThis);
