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
 root.EvenDay={RULES:RULES,DAY_MS:DAY_MS,mean:mean,median:median,localDay:localDay};
})(globalThis);
