// Проставляет версии ?v= автоматически, чтобы их не нужно было поднимать руками.
//  - index.html: для каждого локального файла версия = хэш его содержимого (изменился файл — изменился адрес);
//  - assistant/*.js: внутренние импорты получают одну общую версию сборки.
// Запуск: node deploy/stamp.js <папка-сайта> <версия-сборки>
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const [root, build] = process.argv.slice(2);
if (!root || !build) { console.error('usage: stamp.js <root> <build>'); process.exit(2); }
const hash = (p) => crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 8);

const idx = path.join(root, 'index.html');
let html = fs.readFileSync(idx, 'utf8'), n = 0, missing = [];
html = html.replace(/((?:src|href)=")([^"?#:]+)\?v=[^"]*(")/g, (m, a, f, c) => {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) { missing.push(f); return m; }
    n++; return a + f + '?v=' + hash(p) + c;
});
fs.writeFileSync(idx, html);

let m2 = 0;
const dir = path.join(root, 'assistant');
if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    const p = path.join(dir, f), src = fs.readFileSync(p, 'utf8');
    const out = src.replace(/(\.\/[\w.\/-]+\.js)\?v=\w+/g, (m, a) => { m2++; return a + '?v=' + build; });
    if (out !== src) fs.writeFileSync(p, out);
}
console.log(`stamp: index.html ${n} ссылок, assistant ${m2} импортов, версия сборки ${build}` + (missing.length ? `; нет файлов: ${missing.join(', ')}` : ''));
if (missing.length) process.exit(1);
