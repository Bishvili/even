// The questions that set up smart notifications. Answers stay in this device's settings.
(function(){
 function $(id){return document.getElementById(id);}
 function element(tag,className,text){var e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}
 var HARDEST=[["morning","Morning"],["midday","Midday"],["afternoon","Afternoon"],["evening","Evening"],["varies","It varies"]];
 var answers,options,step=0;

 function timeRow(label,name){
  var row=element("label","calendar-row"),input=element("input");
  input.type="time";input.value=answers[name];
  // Read when moving on, because the picker reports every turn of its wheels.
  input.addEventListener("blur",function(){if(input.value)answers[name]=input.value;});
  input.dataset.answer=name;
  row.appendChild(element("span","",label));row.appendChild(input);
  return row;
 }
 function switchRow(label,name){
  var row=element("label","calendar-row"),input=element("input");
  input.type="checkbox";input.setAttribute("role","switch");input.checked=answers[name];
  input.addEventListener("change",function(){answers[name]=input.checked;});
  row.appendChild(element("span","",label));row.appendChild(input);
  return row;
 }
 function choices(list,name,className){
  var group=element("div",className);group.setAttribute("role","group");
  list.forEach(function(item){
   var button=element("button","",item[1]);button.type="button";
   function mark(){var on=answers[name]===item[0];button.classList.toggle("selected",on);button.setAttribute("aria-pressed",String(on));}
   button.addEventListener("click",function(){answers[name]=item[0];group.querySelectorAll("button").forEach(function(b){b.classList.remove("selected");b.setAttribute("aria-pressed","false");});mark();});
   mark();group.appendChild(button);
  });
  return group;
 }
 var STEPS=[
  {title:"When does your day usually start?",body:function(box){box.appendChild(timeRow("Start of day","from"));}},
  {title:"When do you usually go to bed?",body:function(box){box.appendChild(timeRow("Bedtime","to"));},check:function(){
   if(answers.to>answers.from)return"";
   if(answers.from>="12:00")return"Choose a bedtime after the start of your day.";
   answers.to="23:30";return"";
  }},
  {title:"Which part of the day is usually hardest?",body:function(box){box.appendChild(choices(HARDEST,"hardest","intake-choices"));}},
  {title:"What would help?",hint:"Check-in reminders are always included.",body:function(box){box.appendChild(switchRow("Morning brief","brief"));box.appendChild(switchRow("Wind-down before bed","windDown"));box.appendChild(switchRow("A nudge before harder moments","stressNudges"));box.appendChild(switchRow("A reminder to sync","syncReminder"));}},
  {title:"How many notifications a day?",body:function(box){box.appendChild(choices([[1,"1"],[2,"2"],[3,"3"],[4,"4"]],"count","range-switch"));box.appendChild(switchRow("Send on weekends","weekends"));}},
  {title:"Here’s your day",hint:"Your answers stay on this device. Your account gets only the times and what each one is for.",body:function(box){options.preview(answers,box);}}
 ];
 function readTimes(){document.querySelectorAll("#intake-body [data-answer]").forEach(function(input){if(input.value)answers[input.dataset.answer]=input.value;});}
 function render(){
  var current=STEPS[step],last=step===STEPS.length-1,body=$("intake-body");
  $("intake-progress").textContent="Question "+(step+1)+" of "+(STEPS.length-1);
  $("intake-progress").hidden=last;
  $("intake-title").textContent=current.title;
  $("intake-hint").textContent=current.hint||"";$("intake-hint").hidden=!current.hint;
  $("intake-error").hidden=true;
  body.textContent="";current.body(body);
  $("intake-next").textContent=last?options.finishLabel:"Next";
  $("intake-back").textContent=step?"Back":options.skipLabel;
  $("intake-title").focus();
 }
 function next(){
  readTimes();
  var problem=STEPS[step].check?STEPS[step].check():"";
  if(problem){$("intake-error").textContent=problem;$("intake-error").hidden=false;return;}
  if(step<STEPS.length-1){step++;render();return;}
  $("intake-dialog").close();options.onFinish(answers);
 }
 function back(){
  readTimes();
  if(step){step--;render();return;}
  $("intake-dialog").close();options.onSkip();
 }
 $("intake-next").addEventListener("click",next);
 $("intake-back").addEventListener("click",back);
 globalThis.EvenIntake={open:function(initial,settingsFor){
  answers=Object.assign({},initial);options=settingsFor;step=0;
  $("intake-dialog").showModal();render();
 }};
})();
