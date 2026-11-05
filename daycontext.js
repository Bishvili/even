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
  var cutoff=new Date(now).getTime()-RULES.usualDays*DAY_MS,kept=values.filter(function(item){return Number.isFinite(item.value)&&new Date(item.date+"T12:00:00").getTime()>=cutoff;}).map(function(item){return item.value;});
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
 root.EvenDay={RULES:RULES,DAY_MS:DAY_MS,mean:mean,median:median,localDay:localDay,baseline:baseline,PARTS:PARTS,partOf:partOf,shortSleepLine:shortSleepLine,evidence:evidence,eventPairs:eventPairs};
})(globalThis);
