"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const sync = fs.readFileSync(path.join(root, "shortcuts/rage-tracker-sync.cherri"), "utf8");
const worker = fs.readFileSync(path.join(root, "worker/index.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("the replaceable Shortcut always uses its stable unversioned name", () => {
 assert.match(sync, /^#define name Rage Tracker Sync$/m);
 assert.doesNotMatch(sync, /^#define name.*v2\./m);
 assert.match(html, /shortcuts:\/\/run-shortcut\?name=Rage%20Tracker%20Sync/);
});

test("the device key is read from a file and has no install question or helper", () => {
 assert.doesNotMatch(sync, /#question/);
 assert.doesNotMatch(sync, /\brun\("/);
 assert.match(sync, /"WFGetFilePath":"rage-tracker-device-key.txt","WFFileErrorIfNotFound":false,"WFShowFilePicker":false/);
 const folder = JSON.parse(Buffer.from(sync.match(/^#ref shortcutsFolder (\S+)$/m)[1], "base64").toString());
 assert.equal(folder.fileLocation.WFFileLocationType, "Shortcuts");
 assert.match(sync, /if savedKeyMatchCount == 0/);
 assert.doesNotMatch(sync, /Bearer [a-f0-9]{64}/i);
 assert.equal(fs.existsSync(path.join(root, "shortcuts/rage-tracker-connection.cherri")), false);
});

test("only a key the server accepted is saved", () => {
 const retryFailure = sync.indexOf('if retryStatus != "connected"');
 const save = sync.indexOf("saveDeviceKey(@credential, shortcutsFolder)");
 const events = sync.indexOf("const events = findTodayEvents()");
 assert.ok(retryFailure >= 0 && retryFailure < save && save < events);
 assert.equal((sync.match(/^saveDeviceKey\(/gm) || []).length, 1);
});

test("one Cherri builder route is available", () => {
 assert.match(worker, /asset:shortcut\.cherri/);
 assert.doesNotMatch(worker, /connection\.cherri|connection-builder/);
 assert.doesNotMatch(html, /Rage Tracker Connection|connection-builder/);
});

test("the Health upload uses a grouping-normalized number, not the raw result", () => {
 assert.match(sync, /const totalSteps = statistic\("Sum", values\)/);
 assert.match(sync, /const normalizedSteps = replaceText/);
 assert.match(sync, /"steps": "\{stepsValue\}"/);
 assert.doesNotMatch(sync, /"steps": "\{(?:totalSteps|normalizedSteps)\}"/);
 assert.match(sync, /getValue\(healthResponse, "error"\)/);
});

test("the sent step value is only a number, whatever the text form includes", () => {
 const pattern = sync.match(/const stepsValue = replaceText\('([^']+)', "\$1", normalizedSteps, true, true\)/);
 assert.ok(pattern, "Missing step number extraction");
 const clean = value => value.replace(new RegExp(pattern[1]), "$1");
 assert.equal(clean("12345"), "12345");
 assert.equal(clean("12345 steps"), "12345");
 assert.equal(clean("12345 count"), "12345");
 assert.equal(clean("1234.5"), "1234.5");
 assert.equal(clean("12345\nsteps"), "12345");
 assert.equal(clean(""), "");
});

test("the compiled step-cleanup pattern removes only grouping separators", () => {
 const pattern=sync.match(/replaceText\('([^']+)', "", totalStepsText, true, true\)/);
 assert.ok(pattern, "Missing regex-based step normalization");
 const clean=value=>value.replace(new RegExp(pattern[1],"g"),"");
 assert.equal(clean("12,345"),"12345");
 assert.equal(clean("1,234,567"),"1234567");
 assert.equal(clean("1 234 567"),"1234567");
 assert.equal(clean("1234.5"),"1234.5");
 assert.equal(clean("1,5"),"1,5");
});

test("updates are checked against the current version", () => {
 assert.match(sync, /\/api\/shortcut\/release\?current=2\.3\.3/);
});
