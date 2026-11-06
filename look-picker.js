// Settings → Look: try a name, an icon and a palette, and keep one.
(function(){
 var app=globalThis.App,Look=globalThis.Look,Marks=globalThis.Marks,draft=null,built=false;
 function $(id){return document.getElementById(id);}
 function split(id){var parts=id.split(".");return {n:parts[0],i:parts[1],p:parts[2]};}
 function chosen(){return Look.saved()||Look.home();}
 function idOf(){return draft.n+"."+draft.i+"."+draft.p;}
 function changed(){return idOf()!==chosen();}
 function find(list,id){return list.filter(function(item){return item.id===id;})[0];}
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
  Look.catalog.names.forEach(function(item){$("look-names").appendChild(option("n",item,function(box){caption(box,item.name);}));});
  Look.catalog.icons.forEach(function(item){$("look-icons").appendChild(option("i",item,function(box){var art=document.createElement("span");art.className="look-art";art.setAttribute("data-icon",item.id);box.appendChild(art);caption(box,item.name);}));});
  Look.catalog.palettes.forEach(function(item){$("look-palettes").appendChild(option("p",item,function(box){var dots=document.createElement("span");dots.className="look-dots";[item.contrast,item.highlight,item.page.light].forEach(function(color){var dot=document.createElement("span");dot.style.background=color;dots.appendChild(dot);});box.appendChild(dots);caption(box,item.name);}));});
  $("look-card").addEventListener("change",function(event){
   var input=event.target;if(input.type!=="radio")return;
   var group=input.name.slice(5);draft[group]=input.value;
   if(group==="n"){var pair=find(Look.catalog.names,input.value).with;draft.i=pair.icon;draft.p=pair.palette;}
   show();Look.wear(idOf());
  });
  $("look-save").addEventListener("click",function(){
   var id=idOf();Look.save(id);app.data.sendLook();show();
   if(app.isIOS())openHandoff(id);else app.data.toast("Look saved.");
  });
  $("look-cancel").addEventListener("click",function(){draft=split(chosen());Look.restore();show();});
  $("look-original").addEventListener("click",function(){Look.save(null);app.data.sendLook();draft=split(Look.home());show();app.data.toast("Original look restored.");});
  $("look-add").addEventListener("click",function(){openHandoff(Look.saved()||Look.home());});
  $("look-sheet-close").addEventListener("click",function(){$("look-sheet").close();});
  $("look-backup").addEventListener("click",function(){$("look-sheet").close();$("gate-backup").click();});
 }
 function openHandoff(id){
  var url=location.origin+"/?look="+id;
  $("look-safari").href=app.isInstalled()?"x-safari-"+url:url;
  $("look-sheet").showModal();
 }
 function show(){
  ["n","i","p"].forEach(function(group){Array.prototype.forEach.call(document.querySelectorAll('input[name="look-'+group+'"]'),function(input){input.checked=input.value===draft[group];if(input.checked){var box=input.parentNode,row=box.parentNode;row.scrollLeft=box.offsetLeft-row.offsetLeft-(row.clientWidth-box.offsetWidth)/2;}});});
  var icon=find(Look.catalog.icons,draft.i),palette=find(Look.catalog.palettes,draft.p),name=find(Look.catalog.names,draft.n);
  Array.prototype.forEach.call(document.querySelectorAll(".look-tile"),function(tile){
   tile.style.background=palette.page[tile.getAttribute("data-mode")];
   tile.style.color=tile.getAttribute("data-mode")==="dark"?palette.page.light:palette.contrast;
   tile.querySelector(".look-tile-icon").innerHTML=Marks.tile(icon.svg,palette);
   tile.querySelector(".look-tile-name").textContent=name.installName;
  });
  Array.prototype.forEach.call(document.querySelectorAll(".look-art"),function(art){art.innerHTML=Marks.tile(find(Look.catalog.icons,art.getAttribute("data-icon")).svg,palette);});
  $("look-actions").hidden=!changed();
  $("look-original").hidden=!Look.saved();
  $("look-add").hidden=!Look.saved()||!app.isIOS();
 }
 function render(){
  var on=app.data.state().syncOwnerEmail&&app.data.state().token;
  $("look-card").hidden=!on;
  if(!on)return;
  build();
  if(!draft||!changed()){draft=split(Look.current()||chosen());show();}
 }
 // Leaving without saving goes back to the saved look.
 function leave(){if(draft&&changed()){draft=split(chosen());Look.restore();show();}}
 globalThis.LookPicker={render:render,leave:leave};
})();
