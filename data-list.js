// The Data list: every item the app holds, searched, filtered and paged here on the device, and changed one at a time or several at once.
(function(root){
 var $=function(id){return document.getElementById(id);};
 var TYPES=["Meeting","Work","Exercise","Social","Family","Rest","Commute","Other"];
 var FROM={shortcut:"{{sync}}",manual:"Added by hand",import:"Imported"};
 var WHY={you:"Set by you",rule:"Set by your rule for this title",title:"Worked out from the title",calendar:"From the calendar’s purpose"};
 var WHEN={upcoming:"Coming up",week:"Past 7 days",month:"Past 30 days"};
 var filters={view:"shown",query:"",kind:"",from:"",when:"",type:"",setByYou:false};
 var pageNumber=1,selecting=false,selected={},shown=[],open=null,timer=null;
 function data(){return root.App&&root.App.data;}
 function esc(text){return data().esc(text);}
 function plural(n,one,many){return n+" "+(n===1?one:many);}
 function now(){return new Date();}
 function items(){return globalThis.Items.allItems(data().state());}
 function find(key){return items().find(function(item){return item.key===key;});}
 function isSynced(item){return item.raw.source==="shortcut";}
 function canHide(item){return isSynced(item)?!!data().state().token:true;}
 function healthSummary(h){
  var bits=[];
  if(h.sleepHours!==undefined)bits.push(Math.round(h.sleepHours*10)/10+(h.sleepInBed?"h in bed":"h sleep"));
  if(h.steps!==undefined)bits.push(h.steps.toLocaleString()+" steps");
  if(h.workoutMin!==undefined)bits.push(h.workoutMin>0?h.workoutMin+" min exercise":"No exercise recorded");
  if(h.restingHR!==undefined)bits.push(Math.round(h.restingHR)+" bpm resting");
  if(h.hrv!==undefined)bits.push(Math.round(h.hrv)+" ms HRV");
  return bits.join(" · ")||"Health day";
 }
 function chips(item){
  var list=[];
  if(item.kind==="event")list.push(item.raw.category);
  if(item.source!=="synced")list.push(item.source==="imported"?"Imported":"Added by hand");
  if(item.kind==="event"&&item.raw.categoryFrom==="you")list.push("Set by you");
  if(item.hidden)list.push("Hidden");
  return list.map(function(text){return '<span class="item-chip">'+esc(text)+"</span>";}).join("");
 }
 function title(item){return item.kind==="event"?(item.raw.title||"Calendar event"):"Health · "+new Date(item.at).toLocaleDateString("en-US",{month:"short",day:"numeric"});}
 function detail(item){return item.kind==="event"?data().formatTime(item.raw.start):healthSummary(item.raw);}
 function row(item){
  var mark=selecting?'<input type="checkbox" class="item-check" data-check="'+esc(item.key)+'"'+(selected[item.key]?" checked":"")+' aria-label="Select '+esc(title(item))+'">':"";
  var action=!selecting&&canHide(item)?'<button type="button" class="icon-action" aria-label="'+(item.hidden?"Show ":"Hide ")+esc(title(item))+'" title="'+(item.hidden?"Show":"Hide")+'" data-seen="'+esc(item.key)+'">'+(item.hidden?data().EYE:data().EYE_OFF)+"</button>":"";
  return '<div class="entry item-row'+(item.hidden?" item-hidden":"")+'">'+(selecting?'<label class="item-pick">'+mark+"</label>":"")+'<button type="button" class="item-open" data-open="'+esc(item.key)+'"><strong>'+esc(title(item))+"</strong><span class=\"item-meta\"><small>"+esc(detail(item))+'</small><span class="item-chips">'+chips(item)+"</span></span></button>"+action+"</div>";
 }
 function activeChips(){
  var list=[];
  if(filters.kind)list.push(["kind",filters.kind==="health"?"Health days":"Calendar events"]);
  if(filters.from)list.push(["from",{synced:"From {{sync}}",typed:"Added by hand",imported:"Imported"}[filters.from]]);
  if(filters.when)list.push(["when",WHEN[filters.when]]);
  if(filters.type)list.push(["type",filters.type]);
  if(filters.setByYou)list.push(["setByYou","Set by you"]);
  return list.map(function(chip){return '<button type="button" class="filter-chip" data-clear="'+chip[0]+'" aria-label="Remove filter '+esc(chip[1])+'">'+esc(chip[1])+' <span aria-hidden="true">×</span></button>';}).join("");
 }
 function render(){
  if(!data())return;
  var all=items(),time=now();
  selected=globalThis.Items.pruneSelection(selected,all);
  shown=globalThis.Items.select(all,filters,time);
  var current=globalThis.Items.page(shown,pageNumber);pageNumber=current.page;
  $("context-count").textContent=plural(all.length,"item","items");
  $("list-chips").innerHTML=activeChips();
  $("list-chips").hidden=!$("list-chips").innerHTML;
  $("list-select").textContent=selecting?"Done":"Select";
  $("list-select").hidden=!all.length;
  if(!all.length)$("context-list").innerHTML=data().blank(data().state().token?"Nothing here yet. Run {{sync}}, or add a day or event below.":"Nothing here yet. Sign in to bring in your data, or add a day or event below.");
  else if(!shown.length)$("context-list").innerHTML='<div class="empty">Nothing matches. <button type="button" class="text-action" id="list-reset">Clear search and filters</button></div>';
  else $("context-list").innerHTML=globalThis.Items.grouped(current.items,time).map(function(group){return '<h3 class="item-day">'+esc(group.label)+"</h3>"+group.items.map(row).join("");}).join("");
  $("list-pager").hidden=current.pages<2;
  $("list-page").textContent="Page "+current.page+" of "+current.pages+" · "+current.from+"–"+current.to+" of "+current.total;
  $("list-prev").disabled=current.page<=1;$("list-next").disabled=current.page>=current.pages;
  renderSelection();status();renderRules();
 }
 function picked(){return items().filter(function(item){return selected[item.key];});}
 function renderSelection(){
  var bar=$("list-actions"),tools=$("list-select-tools");
  bar.hidden=!selecting;tools.hidden=!selecting;
  if(!selecting)return;
  var list=picked(),count=list.length;
  $("list-selected").textContent=count+" selected";
  $("list-select-all").textContent="Select all "+plural(shown.length,"result","results");
  var anyShown=list.some(function(item){return !item.hidden;});
  $("list-hide").textContent=count&&!anyShown?"Show":"Hide";
  var local=list.length&&list.every(function(item){return item.hidden&&!isSynced(item);});
  $("list-delete").hidden=!local;
 }
 function status(){
  var line=$("changes-status"),retry=$("changes-retry"),count=data().state().pendingChanges.length;
  line.hidden=!count;retry.hidden=!count||!navigator.onLine;
  line.textContent=!count?"":navigator.onLine?plural(count,"change","changes")+" waiting to sync.":plural(count,"change","changes")+" waiting. They’ll sync when you’re online.";
 }
 function renderRules(){
  var rules=data().state().titleRules||[],card=$("rules-card");
  card.hidden=!rules.length;
  var events=data().state().events.concat(data().state().hiddenEvents);
  $("rules-list").innerHTML=rules.map(function(rule){
   var count=events.filter(function(e){return globalThis.Items.normalizeTitle(e.title)===globalThis.Items.normalizeTitle(rule.title);}).length;
   return '<div class="calendar-row"><span>'+esc(rule.title)+" → "+esc(rule.category)+'<small class="muted"> · '+plural(count,"event","events")+'</small></span><button type="button" class="text-action" data-unrule="'+esc(rule.title)+'" aria-label="Delete the type for '+esc(rule.title)+'">Delete</button></div>';
  }).join("");
 }
 function resetPage(){pageNumber=1;}
 function changeFor(item,hide){return {op:hide?"hide":"show",kind:item.kind,id:item.id};}
 function setSeen(list,hide){
  if(!list.length)return;
  var count=list.length;
  data().apply(list.map(function(item){return changeFor(item,hide);}));
  data().toastUndo(plural(count,"item","items")+(hide?" hidden":" shown"),function(){data().apply(list.map(function(item){return changeFor(item,!hide);}));});
 }
 function openType(list){
  var sheet=$("type-sheet"),titles=[];
  list.forEach(function(item){var t=item.raw.title;if(t&&titles.indexOf(t)<0)titles.push(t);});
  sheet.dataset.keys=JSON.stringify(list.map(function(item){return item.key;}));
  var first=list.length?list[0].raw.category:"Other";
  $("type-options").innerHTML=TYPES.map(function(type){return '<label class="type-option"><input type="radio" name="event-type" value="'+type+'"'+(type===first?" checked":"")+"> "+type+"</label>";}).join("");
  var offer=titles.length>0&&titles.length<=3&&list.every(isSynced);
  $("type-rule-row").hidden=!offer;
  $("type-rule").checked=titles.length===1;
  $("type-rule-text").textContent=titles.length===1?"Use this for future events titled “"+titles[0]+"”":"Use this for future events with these "+plural(titles.length,"title","titles");
  sheet.showModal();
 }
 function saveType(){
  var sheet=$("type-sheet"),keys=JSON.parse(sheet.dataset.keys||"[]"),choice=sheet.querySelector('input[name="event-type"]:checked');
  if(!choice)return;
  var list=keys.map(find).filter(Boolean),rule=!$("type-rule-row").hidden&&$("type-rule").checked,changes=[],undo=[],titles={};
  list.forEach(function(item){
   undo.push(item.raw.categoryFrom==="you"?{op:"type",id:item.id,category:item.raw.category}:{op:"untype",id:item.id,category:item.raw.category,from:item.raw.categoryFrom||null});
   changes.push({op:"type",id:item.id,category:choice.value});
   if(item.raw.title)titles[item.raw.title]=true;
  });
  if(rule)Object.keys(titles).forEach(function(t){changes.push({op:"rule",title:t,category:choice.value});undo.push({op:"unrule",title:t});});
  sheet.close();closeDetail();
  data().apply(changes);
  data().toastUndo(plural(list.length,"event","events")+" changed to "+choice.value+".",function(){data().apply(undo);});
 }
 function removeLocal(list){
  data().askConfirm("Delete "+plural(list.length,"item","items")+" from this iPhone? They aren’t in your account. This can’t be undone.","Delete").then(function(yes){
   if(!yes)return;
   data().removeLocal(list);selected={};closeDetail();
  });
 }
 function closeDetail(){var sheet=$("item-sheet");if(sheet.open)sheet.close();open=null;}
 function openDetail(item){
  open=item.key;
  var r=item.raw,facts=[];
  if(item.kind==="event"){
   facts.push(["When",data().formatDate(r.start)+" "+data().formatTime(r.start)]);
   facts.push(["Type",r.category]);
   if(WHY[r.categoryFrom])facts.push(["Why this type",WHY[r.categoryFrom]]);
   facts.push(["From",FROM[r.source]||FROM.manual]);
  }else{
   facts.push(["Day",data().formatDate(r.date+"T12:00:00")]);
   facts.push(["Numbers",healthSummary(r)]);
   facts.push(["From",FROM[r.source]||FROM.manual]);
  }
  facts.push(["In insights",item.hidden?"Left out":"Included"]);
  $("item-title").textContent=title(item);
  $("item-facts").innerHTML=facts.map(function(f){return "<dt>"+esc(f[0])+"</dt><dd>"+esc(f[1])+"</dd>";}).join("");
  var typed=item.kind==="health"?globalThis.Items.typedKeys(r):[];
  var names={sleepHours:"Sleep (hours)",steps:"Steps",hrv:"HRV (ms)",restingHR:"Resting heart rate",workoutMin:"Exercise (min)"};
  $("item-typed").hidden=!typed.length;
  $("item-typed").innerHTML=typed.length?'<h3 class="plan-heading">Typed by you</h3>'+typed.map(function(key){return '<div class="calendar-row"><label for="typed-'+key+'">'+names[key]+'</label><input id="typed-'+key+'" type="number" inputmode="decimal" min="0" step="any" value="'+esc(r[key])+'" data-typed="'+key+'"><button type="button" class="text-action" data-untyped="'+key+'">Remove</button></div>';}).join(""):"";
  $("item-seen").textContent=item.hidden?"Show":"Hide";
  $("item-seen").hidden=!canHide(item);
  $("item-type").hidden=item.kind!=="event";
  $("item-delete").hidden=!(item.hidden&&!isSynced(item));
  var sheet=$("item-sheet");if(!sheet.open)sheet.showModal();
 }
 function bind(){
  var input=$("list-search");
  input.addEventListener("input",function(){clearTimeout(timer);$("list-search-clear").hidden=!input.value;timer=setTimeout(function(){filters.query=input.value;resetPage();render();},150);});
  $("list-search-clear").addEventListener("click",function(){input.value="";filters.query="";$("list-search-clear").hidden=true;resetPage();render();input.focus();});
  document.querySelectorAll('input[name="list-view"]').forEach(function(radio){radio.addEventListener("change",function(){filters.view=radio.value;resetPage();render();});});
  $("list-filter").addEventListener("click",function(){$("filter-from").value=filters.from;$("filter-when").value=filters.when;$("filter-type").value=filters.type;$("filter-you").checked=filters.setByYou;$("filter-sheet").showModal();});
  $("filter-apply").addEventListener("click",function(){filters.from=$("filter-from").value;filters.when=$("filter-when").value;filters.type=$("filter-type").value;filters.setByYou=$("filter-you").checked;$("filter-sheet").close();resetPage();render();});
  $("filter-clear").addEventListener("click",function(){filters.from=filters.when=filters.type=filters.kind="";filters.setByYou=false;$("filter-sheet").close();resetPage();render();});
  $("list-chips").addEventListener("click",function(ev){var b=ev.target.closest("[data-clear]");if(!b)return;filters[b.dataset.clear]=b.dataset.clear==="setByYou"?false:"";resetPage();render();});
  $("health-count-button").addEventListener("click",function(){filters.kind=filters.kind==="health"?"":"health";resetPage();render();});
  $("calendar-count-button").addEventListener("click",function(){filters.kind=filters.kind==="event"?"":"event";resetPage();render();});
  function turn(step){pageNumber+=step;render();var h=$("data-context-title");h.scrollIntoView({block:"start"});h.focus({preventScroll:true});}
  $("list-prev").addEventListener("click",function(){turn(-1);});$("list-next").addEventListener("click",function(){turn(1);});
  $("list-select").addEventListener("click",function(){selecting=!selecting;if(!selecting)selected={};render();});
  $("list-select-page").addEventListener("click",function(){globalThis.Items.page(shown,pageNumber).items.forEach(function(item){selected[item.key]=true;});render();});
  $("list-select-all").addEventListener("click",function(){shown.forEach(function(item){selected[item.key]=true;});render();});
  $("list-select-none").addEventListener("click",function(){selected={};render();});
  $("list-hide").addEventListener("click",function(){
   var list=picked();if(!list.length){data().toast("Select something first.");return;}
   var hide=list.some(function(item){return !item.hidden;});
   var moving=list.filter(function(item){return item.hidden!==hide&&canHide(item);});
   setSeen(moving,hide);selected={};render();
  });
  $("list-type").addEventListener("click",function(){
   var list=picked();if(!list.length){data().toast("Select something first.");return;}
   if(list.some(function(item){return item.kind!=="event";})){data().toast("Health days don’t have a type. Deselect them to change types.");return;}
   openType(list);
  });
  $("list-delete").addEventListener("click",function(){removeLocal(picked());});
  $("context-list").addEventListener("click",function(ev){
   if(ev.target.closest("#list-reset")){filters={view:filters.view,query:"",kind:"",from:"",when:"",type:"",setByYou:false};input.value="";$("list-search-clear").hidden=true;resetPage();render();return;}
   var check=ev.target.closest("[data-check]");
   if(check){if(check.checked)selected[check.dataset.check]=true;else delete selected[check.dataset.check];renderSelection();return;}
   var seen=ev.target.closest("[data-seen]");
   if(seen){var it=find(seen.dataset.seen);if(it)setSeen([it],!it.hidden);return;}
   var openIt=ev.target.closest("[data-open]");
   if(!openIt)return;
   if(selecting){var key=openIt.dataset.open;if(selected[key])delete selected[key];else selected[key]=true;render();return;}
   var item=find(openIt.dataset.open);if(item)openDetail(item);
  });
  $("item-close").addEventListener("click",closeDetail);
  $("item-seen").addEventListener("click",function(){var item=find(open);if(item){closeDetail();setSeen([item],!item.hidden);}});
  $("item-type").addEventListener("click",function(){var item=find(open);if(item)openType([item]);});
  $("item-delete").addEventListener("click",function(){var item=find(open);if(item)removeLocal([item]);});
  $("item-typed").addEventListener("click",function(ev){var b=ev.target.closest("[data-untyped]"),item=find(open);if(b&&item){data().editTyped(item.raw.date,b.dataset.untyped,null);var next=find(open);if(next)openDetail(next);else closeDetail();}});
  $("item-typed").addEventListener("change",function(ev){var field=ev.target.closest("[data-typed]"),item=find(open);if(field&&item&&field.value!=="")data().editTyped(item.raw.date,field.dataset.typed,Number(field.value));});
  $("type-save").addEventListener("click",saveType);
  $("type-cancel").addEventListener("click",function(){$("type-sheet").close();});
  $("rules-list").addEventListener("click",function(ev){var b=ev.target.closest("[data-unrule]");if(b)data().apply([{op:"unrule",title:b.dataset.unrule}]);});
  $("changes-retry").addEventListener("click",function(){data().sendChanges();});
 }
 root.DataList={
  render:render,status:status,
  leave:function(){if(selecting){selecting=false;selected={};render();}}
 };
 bind();render();
})(globalThis);
