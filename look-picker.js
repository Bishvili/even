// The Look card: try a name, an icon and a palette, and keep one. Light, dark or system applies straight away.
(function(){
 var app=globalThis.App,Look=globalThis.Look,Marks=globalThis.Marks,draft=null,built=false;
 function $(id){return document.getElementById(id);}
 function fresh(){
  var id=Look.current()||Look.saved()||Look.home(),parts=id.split(".");
  return {n:parts[0],i:parts[1],p:parts[2],typed:Look.savedName(),original:false};
 }
 function saved(){return Look.saved()||Look.home();}
 function idOf(){return draft.n+"."+draft.i+"."+draft.p;}
 function changed(){
  if(draft.original)return !!Look.saved();
  return idOf()!==saved()||(draft.n==="n0"&&draft.typed.trim()!==Look.savedName());
 }
 function find(list,id){return list.filter(function(item){return item.id===id;})[0];}
 function preview(){if(draft.original)Look.wear(null);else if(draft.n==="n0"&&!draft.typed.trim())Look.wear(Look.home().split(".")[0]+"."+draft.i+"."+draft.p);else Look.wear(idOf(),draft.typed);}
 function option(group,item,content){
  var label=document.createElement("label"),input=document.createElement("input"),box=document.createElement("span");
  label.className="look-option";input.type="radio";input.name="look-"+group;input.value=item.id;
  box.className="look-choice";content(box);
  label.appendChild(input);label.appendChild(box);
  return label;
 }
 function caption(box,text){var line=document.createElement("span");line.textContent=text;box.appendChild(line);}
 function build(){
  if(built)return;built=true;
  Look.catalog.names.concat([{id:"n0",name:"Custom"}]).forEach(function(item){$("look-names").appendChild(option("n",item,function(box){caption(box,item.name);}));});
  Look.catalog.icons.forEach(function(item){$("look-icons").appendChild(option("i",item,function(box){var art=document.createElement("span");art.className="look-art";art.setAttribute("data-icon",item.id);box.appendChild(art);caption(box,item.name);}));});
  Look.catalog.palettes.forEach(function(item){$("look-palettes").appendChild(option("p",item,function(box){var dots=document.createElement("span");dots.className="look-dots";[item.contrast,item.highlight,item.page.light].forEach(function(color){var dot=document.createElement("span");dot.style.background=color;dots.appendChild(dot);});box.appendChild(dots);caption(box,item.name);}));});
  $("look-custom").maxLength=Look.NAME_LIMIT;
  $("look-custom").addEventListener("input",function(){draft.typed=this.value;preview();show(true);});
  $("look-card").addEventListener("change",function(event){
   var input=event.target;if(input.type!=="radio")return;
   var group=input.name.slice(5);draft[group]=input.value;draft.original=false;
   var pair=group==="n"&&input.value!=="n0"?find(Look.catalog.names,input.value).with:null;
   if(pair){draft.i=pair.icon;draft.p=pair.palette;}
   show();preview();
   if(input.value==="n0")$("look-custom").focus();
  });
  Array.prototype.forEach.call(document.querySelectorAll(".look-tile"),function(tile){
   tile.addEventListener("click",function(){Look.setTheme(tile.getAttribute("data-mode"));show(true);});
  });
  $("look-save").addEventListener("click",saveLook);
  $("look-cancel").addEventListener("click",function(){Look.restore();draft=fresh();show();});
  $("look-original").addEventListener("click",function(){var parts=Look.home().split(".");draft={n:parts[0],i:parts[1],p:parts[2],typed:"",original:true};Look.wear(null);show();});
  $("look-add").addEventListener("click",function(){openHandoff();});
  $("look-sheet-close").addEventListener("click",function(){$("look-sheet").close();});
  $("look-dialog-close").addEventListener("click",function(){leave();$("look-dialog").close();});
  $("look-dialog").addEventListener("close",function(){$("look-home").appendChild($("look-card"));});
  $("gate-look").addEventListener("click",open);
 }
 function saveLook(){
  if(!draft.original&&draft.n==="n0"&&!draft.typed.trim()){app.data.toast("Enter a name first.");$("look-custom").focus();return;}
  var fromGate=$("look-dialog").open;
  if(draft.original)Look.save(null);else Look.save(idOf(),draft.typed);
  app.data.sendLook();
  draft=fresh();show();
  if($("look-dialog").open)$("look-dialog").close();
  // Safari reads the icon and label from the page, so it needs the page for this look before Add to Home Screen.
  if(navigator.standalone===false){location.replace(Look.url(Look.saved(),Look.savedName()));return;}
  if(fromGate){location.reload();return;}
  if(!Look.saved())app.data.toast("Original look saved.");
  else if(app.isIOS())openHandoff();
  else app.data.toast("Look saved.");
 }
 function openHandoff(){
  var url=location.origin+Look.url(Look.saved(),Look.savedName());
  $("look-safari").href=app.isInstalled()?"x-safari-"+url:url;
  $("look-sheet").showModal();
 }
 function show(keepScroll){
  ["n","i","p"].forEach(function(group){Array.prototype.forEach.call(document.querySelectorAll('input[name="look-'+group+'"]'),function(input){
   input.checked=!draft.original&&input.value===draft[group]||draft.original&&input.value===draft[group];
   if(input.checked&&!keepScroll){var box=input.parentNode,row=box.parentNode;row.scrollLeft=box.offsetLeft-row.offsetLeft-(row.clientWidth-box.offsetWidth)/2;}
  });});
  var icon=find(Look.catalog.icons,draft.i),palette=find(Look.catalog.palettes,draft.p),named=draft.n==="n0"?draft.typed.trim():find(Look.catalog.names,draft.n).installName,chosen=Look.theme();
  $("look-custom-row").hidden=draft.n!=="n0";
  if($("look-custom").value!==draft.typed)$("look-custom").value=draft.typed;
  Array.prototype.forEach.call(document.querySelectorAll(".look-tile"),function(tile){
   var mode=tile.getAttribute("data-mode"),stage=tile.querySelector(".look-tile-stage");
   stage.style.background=mode==="system"?"linear-gradient(135deg,"+palette.page.light+" 50%,"+palette.page.dark+" 50%)":palette.page[mode];
   tile.querySelector(".look-tile-icon").innerHTML=Marks.tile(icon.svg,palette);
   tile.querySelector(".look-tile-name").textContent=named;
   tile.setAttribute("aria-pressed",String(mode===chosen));
  });
  Array.prototype.forEach.call(document.querySelectorAll(".look-art"),function(art){art.innerHTML=Marks.tile(find(Look.catalog.icons,art.getAttribute("data-icon")).svg,palette);});
  $("look-actions").hidden=!changed();
  $("look-original").hidden=!Look.saved()||draft.original;
  $("look-add").hidden=!Look.saved()||!app.isIOS()||changed();
 }
 function render(){
  build();
  if(!draft||!changed()){draft=fresh();show();}
 }
 // The sign-in and Home Screen steps open the same card over the page.
 function open(){render();$("look-dialog-body").appendChild($("look-card"));$("look-dialog").showModal();show();}
 // Leaving without saving goes back to the saved look.
 function leave(){if(draft&&changed()){Look.restore();draft=fresh();show();}}
 globalThis.LookPicker={render:render,leave:leave,open:open};
 document.addEventListener("DOMContentLoaded",build);
 if(document.readyState!=="loading")build();
})();
