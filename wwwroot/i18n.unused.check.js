
const fs = require("fs");
const path = require("path");

global.window = {};
eval(fs.readFileSync(path.join(__dirname, "i18n.js"), "utf8"));
const keys = window.i18n.keys;

const sources = ["index.html", "app.js"].map(f =>
  fs.readFileSync(path.join(__dirname, f), "utf8"));
sources.push(fs.readFileSync(path.join(__dirname, "..", "MainForm.cs"), "utf8"));
const haystack = sources.join("\n");

const unused = keys.filter(k => !haystack.includes('"' + k + '"'));

if (unused.length === 0) {
  console.log(`OK: все ${keys.length} ключей используются`);
} else {
  console.log(`НЕИСПОЛЬЗУЕМЫЕ КЛЮЧИ (${unused.length}):`);
  unused.forEach(k => console.log("  " + k));
}
