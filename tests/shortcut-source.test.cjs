"use strict";
// Rules for the two Shortcut sources. Only an iPhone proves behavior, so these guard the contract with the Worker
// and the patterns iOS is known to need. CI checks the compiled property lists with scripts/check-shortcut-conditions.py.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.join(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const html=read("index.html"),app=read("app.js"),worker=read("worker/index.js");
const sync=read("shortcuts/sync.cherri"),helper=read("shortcuts/helper.cherri");
const TIMESTAMP="yyyy-MM-dd'T'HH:mm:ssZZZZZ";
const conditions=source=>[...source.matchAll(/^\s*if ([^\n]+)\{$/gm)].map(x=>x[1].trim());
const position=(text,needle)=>{const index=text.indexOf(needle);assert.ok(index>=0,"Missing "+needle);return index;};
const filters=Object.fromEntries([...sync.matchAll(/^#ref (\w+) (\S+)$/gm)].filter(m=>m[1]!=="onMyIPhone").map(m=>[m[1],JSON.parse(Buffer.from(m[2],"base64").toString())]));
const rows=name=>filters[name].Value.WFActionParameterFilterTemplates;

test("Health Sync keeps its stable name and has no install question",()=>{
 assert.match(sync,/^#define name Health Sync$/m);
 assert.doesNotMatch(sync,/^#define name.*v\d/m);
 assert.doesNotMatch(sync,/#question|prompt\(/);
 assert.doesNotMatch(sync,/\brun\("/);
 assert.match(html,/id="run-shortcut"[^>]*href="shortcuts:\/\/run-shortcut\?name=\{\{syncUrl\}\}"/);
 assert.doesNotMatch(html,/Bearer [a-f0-9]{64}/i);
});

test("the device key is read from its file, checked by the server, and saved only once accepted",()=>{
 assert.match(sync,/"WFGetFilePath":"device-key.txt","WFFileErrorIfNotFound":false,"WFShowFilePicker":false/);
 assert.equal((sync.match(/device-key\.txt/g)||[]).length,2);
 assert.doesNotMatch(sync,/\b(getFolderContents|getFileFromFolder|deleteFiles)\s*\(/);
 const saved=position(sync,"@credential = getText(savedKeyFile)"),handshake=position(sync,'jsonRequest("{appAddress}/api/shortcut/hello"');
 const refused=position(sync,'if connectionStatus != "connected"'),save=position(sync,"saveDeviceKey(@credential, keyFolder)"),events=position(sync,"const todayEvents = findEvents(todayEventsFilter)");
 assert.ok(saved<handshake&&handshake<refused&&refused<save&&save<events);
 assert.equal((sync.match(/^saveDeviceKey\(/gm)||[]).length,1);
 assert.match(sync,/alert\("Open the app, go to Data, and tap Run Health Sync to reconnect/);
 assert.match(sync,/Authorization": "\{@credential\}"/);
 assert.doesNotMatch(sync,/Bearer [a-f0-9]{64}/i);
});

test("every comparison is typed text or a number, never a Boolean",()=>{
 assert.deepEqual(conditions(sync),[
  'providedKeyCount == 0','savedKeyMatchCount == 0','connectionStatus != "connected"','syncCalendar == "on"','todayOffCount == 0','upcomingOffCount == 0','calendarStatus != "accepted"',
  'recentStepCount >= 1','syncRestingHR == "on"','syncHrv == "on"','syncWorkout == "on"','syncSleep == "on"',
  'syncSteps == "on"','stepsAvailable >= 1','@stepsSeen < 7','totalSteps >= 1','@stepsSeen >= 1','syncRestingHR == "on"','restingAvailable >= 1','@restingSeen < 7','restingFound >= 1','@restingSeen >= 1','syncHrv == "on"','hrvAvailable >= 1','@hrvSeen < 7','hrvFound >= 1','@hrvSeen >= 1',
  'syncWorkout == "on"','exerciseAvailable >= 1','@exerciseSeen < 7','exerciseValue >= 1','@exerciseSeen >= 1','syncSleep == "on"','sleepAvailable >= 1','historyState == "needed"','stageCount >= 1','bedCount >= 1',
  '@healthFields >= 1','healthStatus != "accepted"','updateStatus == "new_release"','syncAlarms == "on"','syncedState != "sent"'
 ]);
 for(const source of [sync,helper])assert.doesNotMatch(source,/if\s+@?\w+\s*(==|!=)\s*(true|false)/);
 for(const name of ["connectionStatus","calendarStatus","healthStatus","updateStatus"])
  assert.match(sync,new RegExp("const "+name+" = getText\\("+name+"Value\\)"));
});

test("a run makes five requests, each with one version, and learns about updates from the handshake",()=>{
 assert.equal((sync.match(/\b(?:jsonRequest|formRequest|downloadURL)\(/g)||[]).length,5);
 const versions=sync.match(/"shortcutVersion": "\d+\.\d+\.\d+"/g)||[];
 assert.equal(versions.length,4);
 assert.equal(new Set(versions).size,1);
 assert.doesNotMatch(sync,/\/api\/shortcut\/release\?/);
 assert.match(sync,/getValue\(handshake, "updateStatus"\)/);
 assert.match(sync,/showNotification\("A new version is ready in the app\.", "Health Sync"\)/);
});

test("the next week's events go up together as records with full timestamps",()=>{
 for(const [name,source] of [["startISO","startDate"],["endISO","endDate"],["upcomingStartISO","upcomingStart"],["upcomingEndISO","upcomingEnd"]])
  assert.ok(sync.includes(`const ${name} = formatTimestamp(${source}, "Custom", "None", "${TIMESTAMP}")`),name);
 assert.ok(sync.includes('@eventRecords = "{@eventRecords}␞{startISO}␟{endISO}␟{calendarName}␟{title}"'));
 assert.ok(sync.includes('@eventRecords = "{@eventRecords}␞{upcomingStartISO}␟{upcomingEndISO}␟{upcomingCalendar}␟{upcomingTitle}"'));
 assert.match(sync,/"kind": "calendar_days"/);
 assert.match(sync,/"events": "\{@eventRecords\}"/);
 assert.match(sync,/"utcOffset": "\{utcOffset\}"/);
 assert.doesNotMatch(sync,/"kind": "calendar"\s*,|calendar_complete/);
 assert.doesNotMatch(sync,/"category":/);
 assert.match(worker,/category=CATS\.includes\(x\.category\)\?x\.category:classifyCalendarTitle\(title\)/);
 assert.doesNotMatch(sync,/(?:alert|showNotification)\("[^"]*\{(?:title|upcomingTitle)\}/);
 assert.deepEqual([rows("todayEventsFilter")[0].Property,rows("todayEventsFilter")[0].Operator],["Start Date",1002]);
 assert.deepEqual([rows("upcomingEventsFilter")[0].Property,rows("upcomingEventsFilter")[0].Operator,rows("upcomingEventsFilter")[0].Values],["Start Date",1000,{Number:"9",Unit:16}]);
 for(const name of ["todayEventsFilter","upcomingEventsFilter"])assert.equal(filters[name].WFSerializationType,"WFContentPredicateTableTemplate");
});

test("Health goes up in one request, up to 7 days of each measure with their dates, and no average heart rate",()=>{
 for(const [field,variable] of [["steps","steps"],["restingHR","resting"],["hrv","hrv"],["workoutMin","exercise"]]){
  assert.ok(sync.includes(`"${field}Recent": "{@${variable}Field}"`),field);
 }
 assert.equal((sync.match(/"kind": "health"/g)||[]).length,1);
 assert.doesNotMatch(sync,/heartRate|"Heart Rate"/);
 assert.deepEqual(rows("recentTypesFilter").map(t=>t.Values.Enumeration.Value),["Steps","Resting Heart Rate","Heart Rate Variability","Exercise Minutes","Sleep"]);
 for(const [name,type] of [["stepsFilter","Steps"],["restingFilter","Resting Heart Rate"],["hrvFilter","Heart Rate Variability"],["exerciseFilter","Exercise Minutes"],["sleepFilter","Sleep"]]){
  assert.equal(filters[name].WFSerializationType,"WFContentPredicateTableTemplate",name);
  assert.equal(rows(name)[0].Values.Enumeration.Value,type,name);
 }
 assert.doesNotMatch(sync,/\): array \{"WFContentItemFilter"/);
 assert.ok(position(sync,'@healthFields = 0')<position(sync,'if @healthFields >= 1'));
 assert.match(sync,/showNotification\("Your Health data didn't sync\. \{healthError\}", "Health Sync"\)/);
});

test("the step total is sent as a plain number, with grouping separators removed",()=>{
 assert.match(sync,/sumValues\(variable values: 'Input'\)/);
 assert.match(sync,/const totalSteps = sumValues\(values\)/);
 const grouping=sync.match(/const normalizedSteps = replaceText\('([^']+)', "", totalStepsText, true, true\)/);
 assert.ok(grouping,"Missing grouping-separator removal");
 const clean=value=>value.replace(new RegExp(grouping[1],"g"),"");
 for(const [input,output] of [["12,345","12345"],["1,234,567","1234567"],["1 234 567","1234567"],["1234.5","1234.5"],["1,5","1,5"]])assert.equal(clean(input),output);
 const number=sync.match(/const stepsValue = replaceText\('([^']+)', "\$1", normalizedSteps, true, true\)/);
 assert.ok(number,"Missing step number extraction");
 const extract=value=>value.replace(new RegExp(number[1]),"$1");
 for(const [input,output] of [["12345","12345"],["12345 steps","12345"],["12345 count","12345"],["1234.5","1234.5"],["12345\nsteps","12345"],["",""]])assert.equal(extract(input),output);
 assert.ok(sync.includes('@stepsField = "{@stepsField}␞{stepDay}={stepsValue}"'));
});

test("sleep goes up as asleep intervals, with the sample count so the server knows when a night may be cut off",()=>{
 for(const [name,source] of [["sleepStartISO","sleepStart"],["sleepEndISO","sleepEnd"]])
  assert.ok(sync.includes(`const ${name} = formatTimestamp(${source}, "Custom", "None", "${TIMESTAMP}")`),name);
 assert.ok(sync.includes('@sleepIntervals = "{@sleepIntervals}␞{sleepStartISO}␟{sleepEndISO}"'));
  const limit=name=>sync.match(new RegExp(name+"\\(&variable filter: 'WFContentItemFilter'\\): array \\{[^}]*\"WFContentItemLimitNumber\":(\\d+)"))[1];
 const declared=[...sync.matchAll(/@sleepLimit = "(\d+)"/g)].map(m=>m[1]);
 assert.deepEqual(declared,[limit("findSamples"),limit("findSleepHistory")]);
 for(const field of ['"sleepIntervals": "{@sleepIntervals}"','"sleepSamples": "{@sleepCount}"','"sleepLimit": "{@sleepLimit}"'])assert.ok(sync.includes(field),field);
 assert.doesNotMatch(sync,/sleepMinutes|sleepStarts|sleepAge/);
});

test("alarms come after the uploads that matter most, and the run ends with one notification",()=>{
 const health=position(sync,'"kind": "health"'),alarms=position(sync,"const alarms = getAlarms()"),synced=position(sync,"/api/push/synced");
 assert.ok(health<alarms&&alarms<synced);
 assert.match(sync,/showNotification\("Sync finished\. Open the app to see it\.", "Health Sync"\)/);
 assert.doesNotMatch(sync,/Skipped \{|\bnothing\(\)/);
 assert.doesNotMatch(sync,/@(?:gmail|icloud)\.com/i);
});

test("the release helper holds no credentials, updates itself, and asks before publishing",()=>{
 assert.match(helper,/^#define name Release Helper$/m);
 assert.doesNotMatch(helper,/#question/);
 assert.match(helper,/^const helperVersion = "\d+\.\d+\.\d+"$/m);
 assert.match(helper,/\/api\/shortcut\/release-state\?helper=\{helperVersion\}/);
 assert.match(helper,/api\/shortcut\/build\/sync"/);
 assert.match(helper,/api\/shortcut\/build\/helper"/);
 assert.match(helper,/\/api\/shortcut\/publish/);
 assert.match(helper,/\/api\/shortcut\/helper-link/);
 assert.match(helper,/getShortcuts\(\)/);
 assert.doesNotMatch(helper,/searchShortcuts|api\.github\.com/);
 assert.doesNotMatch(helper,/github_pat_[A-Za-z0-9]{10}|ghp_[A-Za-z0-9]{10}|Bearer [a-f0-9]{64}/i);
 assert.deepEqual(conditions(helper),[
  'latestHelperLength >= 1','latestHelper != helperVersion','candidateText == "Health Sync"','@hasSync == 1','@helperLinkState == "share"','helperText == "Release Helper"',
  'sharedErrorLength >= 1','@state == "install"','@state == "building"','@state == "ahead"','@state == "current"','@state != "publish"',
  'decision != "Publish"','linkText == "Health Sync"','errorLength >= 1','@live == 0','checkState == "current"','@live == 1'
 ]);
 assert.ok(position(helper,'if latestHelper != helperVersion')<position(helper,'createKeyFolder(onMyIPhone)'));
 assert.ok(position(helper,"chooseFromList(")<position(helper,"/api/shortcut/publish"));
});

test("the build, deploy and publish read the versions and notes from the source",()=>{
 const sign=read(".github/workflows/shortcut-sign.yml"),deploy=read("scripts/deploy.sh"),publish=read(".github/workflows/publish-release.yml"),link=read(".github/workflows/helper-link.yml");
 for(const text of [sign,deploy,link])assert.match(text,/const helperVersion = /);
 assert.match(sign,/sync-version\.txt/);
 assert.match(sign,/helper-version\.txt/);
 assert.match(deploy,/config:shortcut:source/);
 assert.match(deploy,/config:helper:latest" --path shortcuts\/helper\.json/);
 assert.match(publish,/shortcuts\/release-notes\.txt/);
 const notes=read("shortcuts/release-notes.txt").trim();
 assert.ok(notes.length>0&&notes.length<=180,"Release notes must fit in 180 characters");
 const shared=JSON.parse(read("shortcuts/helper.json"));
 assert.match(shared.version,/^\d+\.\d+\.\d+$/);
 assert.match(shared.url,/^https:\/\/www\.icloud\.com\/shortcuts\/[a-f0-9]{32}$/);
});

test("API returns text outcomes and release requires verification",()=>{
 assert.match(worker,/state:"connected"/);
 assert.match(worker,/state:"accepted"/);
 assert.match(worker,/updateStatus:updateAvailable\?"new_release":"current"/);
 assert.match(worker,/release\.verified&&semverNewer\(release\.version,installed\)/);
 assert.match(worker,/WHERE owner_email=\?/);
});

test("the developer tools card starts onboarding on this repository",()=>{
 const link=new URL(html.match(/id="improve-site" href="([^"]+)"/)[1].replaceAll("&amp;","&"));
 assert.equal(link.origin+link.pathname,"https://claude.ai/code/new");
 assert.equal(link.searchParams.get("repo"),"Bishvili/health");
 assert.match(link.searchParams.get("q"),/onboarding section of AGENTS\.md/);
});

test("both Shortcuts use one address, one the Worker serves",()=>{
 const origin=read("shortcuts/sync.cherri").match(/const appAddress = "([^"]+)"/)[1];
 assert.ok(read("wrangler.jsonc").includes('"pattern": "'+new URL(origin).hostname+'"'));
 for(const file of ["shortcuts/sync.cherri","shortcuts/helper.cherri"]){
  const source=read(file);
  assert.equal(source.match(/const appAddress = "([^"]+)"/)[1],origin);
  assert.equal(source.split(origin).length,2,file);
 }
});

test("no comparison treats a Health measurement as a number, which iOS can't evaluate",()=>{
 assert.doesNotMatch(sync,/getSampleValue[\s\S]{0,40}\n\s*if /);
 assert.doesNotMatch(sync,/: number \{"WFContentItemPropertyName":"Value"\}/);
 assert.match(sync,/@alarm\['Repeat Days'\]/);
 assert.match(sync,/@alarm\['Label'\]/);
});

test("sleep counts every stage, and sends time in bed apart",()=>{
 assert.match(sync,/asleep\|core\|deep\|\\brem\\b/);
 assert.ok(sync.includes('"sleepInBed": "{@sleepInBed}"'));
});
