// The one model of a person's days: every number and definition that coaching, Insights and notification planning share.
// Pure: no page, no storage, and no clock except the time it is given.
(function(root){
 var RULES={
  usualDays:28,usualMinimum:7,
  evidenceDays:56,
  shortOfUsual:0.5,shortSleepFallback:6.5,
  sleepFallback:8,
  bedtimeNights:14,bedtimeMinimum:3,
  staleHours:20,
  nearEventMs:5400000,
  helpSamples:5,helpGap:0.4,
  stretchGapMin:10,stretchFloorMin:120,
  planLogDays:28,learnMinimumPlanned:8,learnAnsweredShare:0.25
 };
 var DAY_MS=86400000;
 function mean(values){return values.reduce(function(a,b){return a+b;},0)/values.length;}
 // The only median in the app.
 function median(values){var sorted=values.slice().sort(function(a,b){return a-b;});return sorted[Math.floor(sorted.length/2)];}
 function localDay(date){var d=new Date(date);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
 // A person's own usual level: the median of the last 28 days, once there are 7 values.
 function baseline(values,now){
  var latest=new Date(now).getTime(),cutoff=latest-RULES.usualDays*DAY_MS,kept=values.filter(function(item){var at=new Date(item.date+"T00:00:00").getTime();return Number.isFinite(item.value)&&at+DAY_MS/2>=cutoff&&at<=latest;}).map(function(item){return item.value;});
  return kept.length>=RULES.usualMinimum?median(kept):null;
 }
 // The only day-part table. Each part also has its own time to nudge before it starts.
 var PARTS=[{id:"morning",name:"Morning",from:300,nudge:450},{id:"midday",name:"Midday",from:660,nudge:630},{id:"afternoon",name:"Afternoon",from:840,nudge:810},{id:"evening",name:"Evening",from:1020,nudge:990}];
 function partOf(minutes){
  var at=((minutes%1440)+1440)%1440,part=PARTS[3];
  PARTS.forEach(function(p){if(at>=p.from)part=p;});
  return part;
 }
 function shortSleepLine(usualHours){return usualHours===null?RULES.shortSleepFallback:usualHours-RULES.shortOfUsual;}
 function evidence(moods,now){var cutoff=new Date(now).getTime()-RULES.evidenceDays*DAY_MS;return moods.filter(function(m){return Date.parse(m.ts)>=cutoff;});}
 // Each event's closest check-in before and after, under the same minimum and smallest difference as every other comparison.
 function eventPairs(moods,events,categories){
  var samples=moods.map(function(m){return{time:new Date(m.ts).getTime(),score:m.score};}).filter(function(m){return Number.isFinite(m.time)&&m.score>=1&&m.score<=5;});
  var valid=events.map(function(e){return{category:e.category,start:new Date(e.start).getTime(),end:new Date(e.end).getTime()};}).filter(function(e){return categories.indexOf(e.category)>=0&&Number.isFinite(e.start)&&Number.isFinite(e.end)&&e.end>e.start;});
  var paired=[],close=[];
  categories.filter(function(c){return c!=="Other";}).forEach(function(category){
   var before=[],after=[];
   valid.filter(function(e){return e.category===category;}).forEach(function(e){
    var pre=null,post=null;
    samples.forEach(function(m){
     if(m.time>=e.start-RULES.nearEventMs&&m.time<e.start&&(!pre||m.time>pre.time))pre=m;
     if(m.time>=e.end&&m.time<=e.end+RULES.nearEventMs&&(!post||m.time<post.time))post=m;
    });
    if(pre&&post){before.push(pre.score);after.push(post.score);}
   });
   if(before.length>=3&&before.length<RULES.helpSamples)close.push({category:category,count:before.length});
   if(before.length<RULES.helpSamples)return;
   var delta=mean(after)-mean(before);
   if(Math.abs(delta)>=RULES.helpGap)paired.push({category:category,count:before.length,before:mean(before),after:mean(after),delta:delta});
  });
  paired.sort(function(a,b){return Math.abs(b.delta)-Math.abs(a.delta);});
  return{paired:paired,close:close,eventCount:valid.length};
 }
 // How old the synced data is. Built from what the app already has, so it takes no extra request.
 function freshness(lastUpload,now){
  var at=lastUpload?Date.parse(lastUpload):NaN;
  if(!Number.isFinite(at))return{syncedAt:null,hours:null,stale:true};
  var hours=(new Date(now).getTime()-at)/3600000;
  return{syncedAt:new Date(at).toISOString(),hours:hours,stale:hours>RULES.staleHours};
 }
 var MEASURES=["sleepHours","steps","workoutMin","restingHR","hrv"];
 // All-day events and anything a day or longer say nothing about when a person is busy.
 function timedEvents(events){
  return(events||[]).filter(function(e){
   var start=new Date(e.start),length=Date.parse(e.end)-start.getTime();
   return !e.allDay&&length>0&&length<DAY_MS&&!(start.getHours()===0&&start.getMinutes()===0&&length>=DAY_MS-60000);
  });
 }
 // Overlapping events count once, and events close together make one stretch.
 function calendarFacts(events){
  var spans=events.map(function(e){return[Date.parse(e.start),Date.parse(e.end)];}).sort(function(a,b){return a[0]-b[0];}),busy=0,longest=0,stretches=[],current=null,merged=null;
  spans.forEach(function(s){
   if(merged&&s[0]<=merged[1])merged[1]=Math.max(merged[1],s[1]);
   else{if(merged)busy+=(merged[1]-merged[0])/60000;merged=[s[0],s[1]];}
   if(current&&s[0]-current[1]<=RULES.stretchGapMin*60000)current[1]=Math.max(current[1],s[1]);
   else{current=[s[0],s[1]];stretches.push(current);}
  });
  if(merged)busy+=(merged[1]-merged[0])/60000;
  stretches=stretches.filter(function(s){var minutes=(s[1]-s[0])/60000;if(minutes>longest)longest=minutes;return minutes>=RULES.stretchFloorMin;});
  return{status:"known",busyMinutes:busy,firstStart:spans.length?spans[0][0]:null,longestStretch:longest,stretches:stretches,events:events};
 }
 var last={};
 // What's known about each day. Coaching, Insights and the notification plan all read this, so they can't disagree.
 // A value is known, zero or missing. Missing stays out of both sides of every comparison.
 function build(inputs,now){
  var when=new Date(now),today=localDay(when);
  if(last.health===inputs.health&&last.events===inputs.events&&last.today===today)return Object.assign({},last.context,{fresh:freshness(inputs.lastUpload,when)});
  var days={},health=inputs.health||[],cutoff=when.getTime()-RULES.usualDays*DAY_MS,exercises=false,byDay={};
  health.forEach(function(h){if(h.workoutMin>0&&new Date(h.date+"T12:00:00").getTime()>=cutoff)exercises=true;});
  health.forEach(function(h){
   var entry={firstAlarmMin:Number.isFinite(h.firstAlarmMin)?h.firstAlarmMin:null},measured=false;
   MEASURES.forEach(function(key){
    var value=h[key]===null||h[key]===undefined?NaN:Number(h[key]);
    measured=measured||Number.isFinite(value);
    entry[key]=Number.isFinite(value)?{status:value===0?"zero":"known",value:value}:{status:"missing",value:null};
   });
   // Even Sync leaves out days without exercise. It's a real zero only for a day the sync covered, for someone who exercises, and never today, because it may still come.
   if(entry.workoutMin.status==="missing"&&measured&&exercises&&h.date!==today)entry.workoutMin={status:"zero",value:0};
   days[h.date]=entry;
  });
  timedEvents(inputs.events).forEach(function(e){var key=localDay(e.start);(byDay[key]=byDay[key]||[]).push(e);});
  Object.keys(byDay).forEach(function(key){days[key]=days[key]||{};days[key].calendar=calendarFacts(byDay[key]);});
  function usual(key){return baseline(health.map(function(h){return{date:h.date,value:h[key]===null||h[key]===undefined?NaN:Number(h[key])};}),when);}
  var context={days:days,usual:{sleepHours:usual("sleepHours"),steps:usual("steps"),restingHR:usual("restingHR"),hrv:usual("hrv"),busyMinutes:baseline(Object.keys(byDay).map(function(key){return{date:key,value:days[key].calendar.busyMinutes};}),when)},fresh:freshness(inputs.lastUpload,when)};
  last={health:inputs.health,events:inputs.events,today:today,context:context};
  return context;
 }
 root.EvenDay={build:build,freshness:freshness,timedEvents:timedEvents,calendarFacts:calendarFacts,RULES:RULES,DAY_MS:DAY_MS,mean:mean,median:median,localDay:localDay,baseline:baseline,PARTS:PARTS,partOf:partOf,shortSleepLine:shortSleepLine,evidence:evidence,eventPairs:eventPairs};
})(globalThis);
