"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
require("../viewport.js");
const {barGap}=globalThis.EvenViewport;
test("a bar at the bottom stays put",()=>{assert.equal(barGap(844,844),0);});
test("a bar that drifted up moves back down",()=>{assert.equal(barGap(485,844),359);});
test("the keyboard covering the bar leaves it alone",()=>{assert.equal(barGap(844,485),0);});
