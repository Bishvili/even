"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const sync = fs.readFileSync(path.join(root, "shortcuts/even-sync.cherri"), "utf8");
const worker = fs.readFileSync(path.join(root, "worker/index.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("the replaceable Shortcut always uses its stable unversioned name", () => {
 assert.match(sync, /^#define name Even Sync$/m);
 assert.doesNotMatch(sync, /^#define name.*v2\./m);
 assert.match(html, /shortcuts:\/\/run-shortcut\?name=Even%20Sync/);
});

test("the device key is read from a file and has no install question or helper", () => {
 assert.doesNotMatch(sync, /#question/);
 assert.doesNotMatch(sync, /\brun\("/);
 assert.match(sync, /"WFGetFilePath":"even-device-key.txt","WFFileErrorIfNotFound":false,"WFShowFilePicker":false/);
 assert.match(sync, /const keyFolder = createKeyFolder\(onMyIPhone\)/);
 assert.match(sync, /readSavedDeviceKey\(keyFolder\)/);
 assert.match(sync, /if savedKeyMatchCount == 0/);
 assert.doesNotMatch(sync, /Bearer [a-f0-9]{64}/i);
 assert.equal(fs.existsSync(path.join(root, "shortcuts/even-connection.cherri")), false);
});

test("only a key the server accepted is saved", () => {
 const retryFailure = sync.indexOf('if connectionStatus != "connected"');
 const save = sync.indexOf("saveDeviceKey(@credential, keyFolder)");
 const events = sync.indexOf("const events = findEvents(todayEventsFilter)");
 assert.ok(retryFailure >= 0 && retryFailure < save && save < events);
 assert.equal((sync.match(/^saveDeviceKey\(/gm) || []).length, 1);
});

test("the interface reads as a finished product", () => {
 const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
 assert.doesNotMatch(worker, /shortcut\.cherri|\/shortcut\/builder/);
 for (const copy of [html, app]) {
  assert.doesNotMatch(copy, /Cherri|builder|corrected|handshake|prototype|candidate|Cloudflare/i);
 }
});

test("the Health upload uses a grouping-normalized number, not the raw result", () => {
 assert.match(sync, /sumValues\(variable values: 'Input'\)/);
 assert.match(sync, /const totalSteps = sumValues\(values\)/);
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
 assert.match(sync, /\/api\/shortcut\/release\?current=2\.6\.0/);
});
