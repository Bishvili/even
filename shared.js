// Everything else a person makes in the app, kept in the account as simple records. Comparing with what the account last saw finds what to send, so no screen needs to know about syncing.
(function(root){
 var LOGS=["resets","tries","planLog","planMoves"],BATCH=100,WAIT_MS=1500,timer=null,sending=false;
 function logKey(item){return String((item.id?item.id+"|":"")+(item.at||item.ts||(item.date?item.date+"|"+item.minute:JSON.stringify(item)))).slice(0,160);}
 function typedPart(row,Items,hidden){
  var synced=Items.syncedKeys(row),out=null;
  Items.VALUES.forEach(function(key){if(row[key]!==undefined&&synced.indexOf(key)<0){out=out||{date:row.date};out[key]=row[key];}});
  if(out&&hidden)out.hidden=true;
  return out;
 }
 function records(state,Items){
  var list=[];
  LOGS.forEach(function(kind){state[kind].forEach(function(item){list.push({kind:kind,key:logKey(item),data:item});});});
  [[state.health,false],[state.hiddenHealth,true]].forEach(function(group){group[0].forEach(function(row){var part=typedPart(row,Items,group[1]);if(part)list.push({kind:"health",key:row.date,data:part});});});
  [[state.events,false],[state.hiddenEvents,true]].forEach(function(group){group[0].forEach(function(event){
   if(event.source==="shortcut"||event.demo)return;
   list.push({kind:"events",key:String(event.id).slice(0,160),data:group[1]?Object.assign({},event,{hidden:true}):event});
  });});
  return list;
 }
 function seenKey(record){return record.kind+":"+record.key;}
 function changes(state,Items){
  var now={},send=[],gone=[],seen=state.sharedSeen||{};
  records(state,Items).forEach(function(record){var text=JSON.stringify(record.data),id=seenKey(record);now[id]=text;if(seen[id]!==text)send.push(record);});
  Object.keys(seen).forEach(function(id){if(now[id]===undefined){var at=id.indexOf(":");gone.push({kind:id.slice(0,at),key:id.slice(at+1)});}});
  return {send:send,gone:gone,now:now};
 }
 function setHealth(state,part,Items){
  var from=part.hidden?"hiddenHealth":"health",other=part.hidden?"health":"hiddenHealth",row=state[from].concat(state[other]).filter(function(x){return x.date===part.date;})[0];
  if(!row){row={date:part.date,source:"manual",synced:[]};state[from].push(row);}
  Items.VALUES.forEach(function(key){if(typeof part[key]==="number"){row[key]=part[key];if(Array.isArray(row.synced))row.synced=row.synced.filter(function(x){return x!==key;});}});
 }
 function dropHealth(state,date,Items){
  ["health","hiddenHealth"].forEach(function(list){
   state[list]=state[list].filter(function(row){
    if(row.date!==date)return true;
    var synced=Items.syncedKeys(row);
    Items.VALUES.forEach(function(key){if(synced.indexOf(key)<0)delete row[key];});
    return synced.length>0;
   });
  });
 }
 function setEvent(state,event){
  var clean=Object.assign({},event),hidden=!!clean.hidden;delete clean.hidden;
  state.events=state.events.filter(function(x){return x.id!==clean.id;});
  state.hiddenEvents=state.hiddenEvents.filter(function(x){return x.id!==clean.id;});
  state[hidden?"hiddenEvents":"events"].push(clean);
 }
 // What arrived replaces what's here, unless this device has its own change still to send.
 function take(state,body,Items){
  var mine=changes(state,Items).now,seen=state.sharedSeen||{},changed=false;
  function untouched(id){return mine[id]===undefined||mine[id]===seen[id];}
  (body.items||[]).forEach(function(item){
   var id=seenKey(item),text=JSON.stringify(item.data);
   if(mine[id]===text){seen[id]=text;return;}
   if(!untouched(id))return;
   if(LOGS.indexOf(item.kind)>=0){state[item.kind]=state[item.kind].filter(function(x){return logKey(x)!==item.key;}).concat([item.data]);}
   else if(item.kind==="health")setHealth(state,item.data,Items);
   else if(item.kind==="events")setEvent(state,item.data);
   else return;
   seen[id]=text;changed=true;
  });
  (body.deleted||[]).forEach(function(item){
   var id=seenKey(item);
   if(!untouched(id))return;
   if(mine[id]===undefined){delete seen[id];return;}
   if(LOGS.indexOf(item.kind)>=0)state[item.kind]=state[item.kind].filter(function(x){return logKey(x)!==item.key;});
   else if(item.kind==="health")dropHealth(state,item.key,Items);
   else if(item.kind==="events"){state.events=state.events.filter(function(x){return x.id!==item.key;});state.hiddenEvents=state.hiddenEvents.filter(function(x){return x.id!==item.key;});}
   delete seen[id];changed=true;
  });
  state.sharedSeen=seen;
  if(body.cursor)state.sharedCursor=body.cursor;
  return changed;
 }
 async function sync(app,given){
  var state=app.state();
  if(sending||!state.token||!navigator.onLine)return;
  sending=true;
  try{
   if(given&&given.email===state.syncOwnerEmail&&take(state,given,root.Items))app.render();
   var found=changes(state,root.Items);
   for(var n=0;n<found.send.length;n+=BATCH){
    var batch=found.send.slice(n,n+BATCH),sent=await fetch("/api/shared",{method:"POST",headers:{"Authorization":"Bearer "+state.token,"Content-Type":"application/json"},body:JSON.stringify({items:batch}),cache:"no-store"});
    if(!sent.ok)throw Error("Not saved");
    batch.forEach(function(record){state.sharedSeen[seenKey(record)]=found.now[seenKey(record)];});
   }
   for(var i=0;i<found.gone.length;i+=BATCH){
    var drop=found.gone.slice(i,i+BATCH),done=await fetch("/api/shared",{method:"POST",headers:{"Authorization":"Bearer "+state.token,"Content-Type":"application/json"},body:JSON.stringify({deleted:drop}),cache:"no-store"});
    if(!done.ok)throw Error("Not saved");
    drop.forEach(function(item){delete state.sharedSeen[seenKey(item)];});
   }
   if(given||found.send.length||found.gone.length)app.persist();
  }catch(e){/* It goes with the next return to the app. */}
  finally{sending=false;}
 }
 function soon(app){if(timer)return;timer=setTimeout(function(){timer=null;sync(app);},WAIT_MS);}
 root.Shared={records:records,changes:changes,take:take,sync:sync,soon:soon};
})(globalThis);
