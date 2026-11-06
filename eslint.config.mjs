import js from "@eslint/js";
import globals from "globals";

const shared={
 "no-unused-vars":["error",{caughtErrors:"none"}],
 "no-control-regex":"off"
};
export default [
 js.configs.recommended,
 {files:["marks.js","looks.js","app.js","coach.js","reminders.js","onboarding.js","intake.js","refresh.js","invites.js","signin-sheet.js","backup.js","feedback.js","daycontext.js","items.js","data-list.js"],languageOptions:{sourceType:"script",globals:globals.browser},rules:shared},
 {files:["sw.js"],languageOptions:{sourceType:"script",globals:globals.serviceworker},rules:shared},
 {files:["worker/**"],languageOptions:{sourceType:"module",globals:globals.serviceworker},rules:shared}
];
