// The Data list's rules, apart from the screen: how a pull meets what a person typed, and how the list searches, filters, groups and pages.
(function(root){
 var MEASURES=["sleepHours","steps","hrv","restingHR","workoutMin"];
 var VALUES=MEASURES.concat(["bedtimeMin","sleepInBed","firstAlarmMin"]);
 var PAGE_SIZE=25;
 function syncedKeys(row){
  if(Array.isArray(row.synced))return row.synced;
  return row.source==="shortcut"?VALUES.filter(function(key){return row[key]!==undefined;}):[];
 }
 function hasMeasure(row){return MEASURES.some(function(key){return row[key]!==undefined;});}
 // A pull replaces only numbers that came from the account. A number typed by hand is never replaced or dropped.
 function mergeHealth(rows,server,complete,oldestDay){
  var byDate={},kept=[];
  rows.forEach(function(row){
   if(!complete&&oldestDay&&row.date<oldestDay){kept.push(row);return;}
   var next=Object.assign({},row);
   syncedKeys(row).forEach(function(key){delete next[key];});
   next.synced=[];byDate[row.date]=next;
  });
  server.forEach(function(day){
   var row=byDate[day.date]||{date:day.date,synced:[]};
   VALUES.forEach(function(key){if(day[key]!==undefined&&row[key]===undefined){row[key]=day[key];row.synced.push(key);}});
   byDate[day.date]=row;
  });
  return kept.concat(Object.keys(byDate).map(function(date){
   var row=byDate[date];row.source=row.synced.length?"shortcut":"manual";return row;
  }).filter(hasMeasure));
 }
 function typedKeys(row){var synced=syncedKeys(row);return MEASURES.filter(function(key){return row[key]!==undefined&&synced.indexOf(key)<0;});}
 function folded(text){return String(text||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();}
 var DAY=86400000;
 function localDay(value){var d=new Date(value);return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
 function dayKey(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
 function dayLabel(value,now){
  var diff=Math.round((localDay(value)-localDay(now))/DAY);
  if(diff===0)return "Today";if(diff===1)return "Tomorrow";if(diff===-1)return "Yesterday";
  return new Date(value).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
 }
 function sourceOf(item){return item.source==="shortcut"?"synced":item.source==="import"?"imported":"typed";}
 // One row, whichever kind it is, with the words a search can match.
 function toItem(kind,raw,hidden){
  var at=kind==="event"?raw.start:raw.date+"T12:00:00",d=new Date(at),id=kind==="event"?raw.id:raw.date;
  var words=[kind==="event"?raw.title:"health",kind==="event"?raw.category:"",kind==="event"?"event calendar":"health day",sourceOf(raw),hidden?"hidden":"shown",
   raw.categoryFrom==="you"?"set by you":"",raw.sleepHours!==undefined?"sleep":"",raw.steps!==undefined?"steps":"",raw.hrv!==undefined?"hrv":"",raw.restingHR!==undefined?"resting heart rate":"",raw.workoutMin!==undefined?"exercise":""];
  if(!isNaN(d.getTime()))words.push(dayKey(d),d.toLocaleDateString("en-US",{month:"short",day:"numeric"}),d.toLocaleDateString("en-US",{month:"long",day:"numeric"}),d.toLocaleDateString("en-US",{weekday:"long"}));
  return {key:kind+":"+id,kind:kind,id:id,at:at,time:d.getTime(),hidden:!!hidden,raw:raw,source:sourceOf(raw),words:folded(words.join(" "))};
 }
 function allItems(state){
  var make=function(kind,list,hidden){return (list||[]).map(function(raw){return toItem(kind,raw,hidden);}).filter(function(item){return !isNaN(item.time);});};
  return make("health",state.health,false).concat(make("event",state.events,false),make("health",state.hiddenHealth,true),make("event",state.hiddenEvents,true));
 }
 function matches(item,query,now){
  var terms=folded(query).split(/\s+/).filter(Boolean);
  if(!terms.length)return true;
  var words=item.words+" "+folded(dayLabel(item.at,now));
  return terms.every(function(term){return words.indexOf(term)>=0;});
 }
 // Search and filters together. Coming up runs soonest first, and everything else newest first.
 function select(items,options,now){
  var o=options||{},at=now.getTime(),list=items.filter(function(item){
   if(o.view==="shown"&&item.hidden)return false;
   if(o.view==="hidden"&&!item.hidden)return false;
   if(o.kind&&item.kind!==o.kind)return false;
   if(o.from&&item.source!==o.from)return false;
   if(o.type&&!(item.kind==="event"&&item.raw.category===o.type))return false;
   if(o.setByYou&&!(item.kind==="event"&&item.raw.categoryFrom==="you"))return false;
   if(o.when==="upcoming"&&item.time<at)return false;
   if(o.when==="week"&&(item.time>at||item.time<at-7*DAY))return false;
   if(o.when==="month"&&(item.time>at||item.time<at-30*DAY))return false;
   return matches(item,o.query,now);
  });
  return list.sort(function(a,b){return o.when==="upcoming"?a.time-b.time:b.time-a.time;});
 }
 function page(list,number){
  var pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE)),current=Math.min(Math.max(1,number||1),pages),start=(current-1)*PAGE_SIZE;
  return {items:list.slice(start,start+PAGE_SIZE),page:current,pages:pages,from:list.length?start+1:0,to:Math.min(start+PAGE_SIZE,list.length),total:list.length};
 }
 function grouped(list,now){
  var groups=[];
  list.forEach(function(item){var label=dayLabel(item.at,now),last=groups[groups.length-1];if(last&&last.label===label)last.items.push(item);else groups.push({label:label,items:[item]});});
  return groups;
 }
 function pruneSelection(selected,items){var live={};items.forEach(function(item){live[item.key]=true;});var next={};Object.keys(selected).forEach(function(key){if(live[key])next[key]=true;});return next;}
 function normalizeTitle(title){return String(title||"").normalize("NFC").trim().replace(/\s+/g," ").toLowerCase();}
 var api={MEASURES:MEASURES,VALUES:VALUES,PAGE_SIZE:PAGE_SIZE,mergeHealth:mergeHealth,typedKeys:typedKeys,syncedKeys:syncedKeys,allItems:allItems,select:select,page:page,grouped:grouped,dayLabel:dayLabel,pruneSelection:pruneSelection,normalizeTitle:normalizeTitle};
 root.Items=api;
})(globalThis);
