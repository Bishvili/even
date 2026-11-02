"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const sync = fs.readFileSync(path.join(root, "shortcuts/rage-tracker-sync.cherri"), "utf8");
const connection = fs.readFileSync(path.join(root, "shortcuts/rage-tracker-connection.cherri"), "utf8");
const worker = fs.readFileSync(path.join(root, "worker/index.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("the replaceable Shortcut always uses its stable unversioned name", () => {
 assert.match(sync, /^#define name Rage Tracker Sync$/m);
 assert.doesNotMatch(sync, /^#define name.*v2\./m);
 assert.match(connection, /^#define name Rage Tracker Connection$/m);
 assert.match(html, /shortcuts:\/\/run-shortcut\?name=Rage%20Tracker%20Sync/);
});

test("the private key is entered only in the persistent connection helper", () => {
 assert.doesNotMatch(sync, /#question authorization/);
 assert.match(connection, /#question authorization "Paste the full Authorization value/);
 assert.match(connection, /const credential = text\(authorization\)/);
 assert.match(connection, /output\(credential\)/);
 assert.match(sync, /const connectionOutput = run\("Rage Tracker Connection", "read"\)/);
 assert.match(sync, /const credential = getText\(connectionOutput\)/);
 assert.match(sync, /if credentialMatchCount == 0/);
 assert.doesNotMatch(connection, /Bearer [a-f0-9]{64}/i);
 assert.doesNotMatch(sync, /Bearer [a-f0-9]{64}/i);
});

test("both credential-free Cherri builders have independent routes", () => {
 assert.match(worker, /asset:connection\.cherri/);
 assert.match(worker, /asset:shortcut\.cherri/);
 assert.match(worker, /\/shortcut\/connection-builder/);
 assert.match(html, /id="shortcut-connection-preview"/);
 assert.match(html, /href="\/shortcut\/connection-builder"/);
});

test("the Health upload uses a grouping-normalized number, not the raw result", () => {
 assert.match(sync, /const totalSteps = statistic\("Sum", values\)/);
 assert.match(sync, /const normalizedSteps = replaceText/);
 assert.match(sync, /"steps": "\{normalizedSteps\}"/);
 assert.doesNotMatch(sync, /"steps": "\{totalSteps\}"/);
 assert.match(sync, /getValue\(healthResponse, "error"\)/);
});

test("the one-time connection is distinct from public RoutineHub releases", () => {
 assert.match(connection, /#define name Rage Tracker Connection/);
 assert.match(sync, /\/api\/shortcut\/release\?current=2\.3\.3/);
 assert.doesNotMatch(sync, /saveFile\(|getFile\(|createFolder\(/);
});
