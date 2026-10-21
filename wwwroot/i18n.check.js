
const fs = require("fs");
const path = require("path");

global.window = {};
eval(fs.readFileSync(path.join(__dirname, "i18n.js"), "utf8"));
const { keys, dict, supported } = window.i18n;

let bad = 0;

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const re = /data-i18n(?:-title|-placeholder|-aria-label)?="([^"]+)"/g;
let m, total = 0;
while ((m = re.exec(html)) !== null) {
  total++;
  if (!keys.includes(m[1])) {
    console.log(`НЕТ КЛЮЧА: ${m[1]}`);
    bad++;
  }
}

for (const lang of supported) {
  const langKeys = Object.keys(dict[lang]);
  for (const k of keys) {
    if (!langKeys.includes(k)) {
      console.log(`НЕТ ПЕРЕВОДА [${lang}]: ${k}`);
      bad++;
    }
  }
  for (const k of langKeys) {
    if (!keys.includes(k)) {
      console.log(`ЛИШНИЙ КЛЮЧ [${lang}]: ${k}`);
      bad++;
    }
  }
}

console.log(bad === 0
  ? `OK: ${total} атрибутов перевода, ${keys.length} ключей × ${supported.length} языков`
  : `ОШИБКИ: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
