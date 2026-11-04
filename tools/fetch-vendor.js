// Скачивает библиотеки один раз и кладёт их в папку vendor/ вашего сайта,
// чтобы сайт не зависел от внешних серверов (cdnjs, cdn.socket.io, Google Fonts).
// Запуск (нужен интернет без блокировок, например с VPN):   node tools/fetch-vendor.js
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const tmp = path.join(root, '.vendor-tmp');
const out = path.join(root, 'vendor');

fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
fs.writeFileSync(path.join(tmp, 'package.json'), '{"private":true}');
console.log('Скачиваю пакеты...');
execSync('npm install --no-audit --no-fund --silent @fortawesome/fontawesome-free@6.5.1 leaflet@1.9.4 socket.io-client@4.7.5 @fontsource/manrope@5 @fontsource/unbounded@5',
    { cwd: tmp, stdio: 'inherit' });
const nm = path.join(tmp, 'node_modules');

fs.rmSync(out, { recursive: true, force: true });
const cp = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.cpSync(from, to, { recursive: true }); };

// Иконки
const fa = path.join(nm, '@fortawesome/fontawesome-free');
cp(path.join(fa, 'css/all.min.css'), path.join(out, 'fontawesome/css/all.min.css'));
for (const f of fs.readdirSync(path.join(fa, 'webfonts'))) if (f.endsWith('.woff2')) cp(path.join(fa, 'webfonts', f), path.join(out, 'fontawesome/webfonts', f));

// Карта
const lf = path.join(nm, 'leaflet/dist');
cp(path.join(lf, 'leaflet.js'), path.join(out, 'leaflet/leaflet.js'));
cp(path.join(lf, 'leaflet.css'), path.join(out, 'leaflet/leaflet.css'));
cp(path.join(lf, 'images'), path.join(out, 'leaflet/images'));

// Чат
cp(path.join(nm, 'socket.io-client/dist/socket.io.min.js'), path.join(out, 'socket.io.min.js'));

// Шрифты + свой CSS
const RANGE = {
    cyrillic: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116',
    latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
};
let css = '/* сгенерировано tools/fetch-vendor.js */\n';
for (const [pkg, fam, weights] of [['manrope', 'Manrope', [400, 500, 600, 700, 800]], ['unbounded', 'Unbounded', [500, 700]]]) {
    for (const w of weights) for (const sub of ['cyrillic', 'latin']) {
        const name = `${pkg}-${sub}-${w}-normal.woff2`;
        const src = path.join(nm, '@fontsource', pkg, 'files', name);
        if (!fs.existsSync(src)) throw new Error('Не найден шрифт ' + name);
        cp(src, path.join(out, 'fonts', name));
        css += `@font-face{font-family:'${fam}';font-style:normal;font-weight:${w};font-display:swap;src:url(fonts/${name}) format('woff2');unicode-range:${RANGE[sub]}}\n`;
    }
}
fs.writeFileSync(path.join(out, 'fonts.css'), css);

fs.rmSync(tmp, { recursive: true, force: true });

// Проверка, что всё на месте
const need = ['fontawesome/css/all.min.css', 'fontawesome/webfonts/fa-solid-900.woff2', 'leaflet/leaflet.js', 'leaflet/leaflet.css', 'leaflet/images/marker-icon.png', 'socket.io.min.js', 'fonts.css', 'fonts/manrope-cyrillic-400-normal.woff2'];
const miss = need.filter(f => !fs.existsSync(path.join(out, f)));
if (miss.length) { console.error('НЕ ХВАТАЕТ ФАЙЛОВ:', miss.join(', ')); process.exit(1); }
console.log('Готово. Папка vendor/ создана. Теперь можно делать git add / commit / push.');
