// ============================================
// FILTERS.JS — фильтры жилья и карта.
// Кнопки «Фильтры» и «Карта» стоят в шапке чата «Жильё». Фильтры работают на телефоне,
// по уже загруженным объявлениям: скрывают лишнее в ленте и на карте.
// ============================================
const FILTER_KEY = 'yy-filters';
const FILTER_DEFAULT = { q: '', min: '', max: '', from: '', to: '', guests: 0, sea: 0, amen: [], verified: false };
let adFilter = (function () {
    try { const f = JSON.parse(localStorage.getItem(FILTER_KEY) || 'null'); if (f && typeof f === 'object') return { ...FILTER_DEFAULT, ...f, amen: Array.isArray(f.amen) ? f.amen : [] }; } catch (e) {}
    return { ...FILTER_DEFAULT };
})();
function saveAdFilter() { try { localStorage.setItem(FILTER_KEY, JSON.stringify(adFilter)); } catch (e) {} }

const FSEA = [[0, 'Любое'], [300, 'до 300 м'], [1000, 'до 1 км'], [3000, 'до 3 км']];
const fnorm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').trim();

function adCapacity(ad) {
    const g = Number(ad.form && ad.form.guests);
    if (Number.isFinite(g) && g > 0) return g;
    for (const f of ad.facts || []) { const m = /до\s+(\d+)\s+гост/i.exec((f && f.t) || ''); if (m) return Number(m[1]); }
    return null;       // неизвестно — не отбрасываем
}
function filterNights(from, to) {
    const out = []; if (!from) return out;
    const end = to && to > from ? to : addDays(from, 1);
    for (let d = from; d < end && out.length < 400; d = addDays(d, 1)) out.push(d);
    return out;
}

function adPasses(ad, f = adFilter) {
    if (f.q && !fnorm(ad.location + ' ' + ad.title + ' ' + (ad.description || '')).includes(fnorm(f.q))) return false;
    const price = Number(ad.priceNum);
    if (f.min !== '' && !(price >= Number(f.min))) return false;
    if (f.max !== '' && !(price <= Number(f.max))) return false;
    if (f.from && ad.type !== 'sale' && ad.busy && ad.busy.length) {
        const busy = new Set(ad.busy);
        if (filterNights(f.from, f.to).some(d => busy.has(d))) return false;
    }
    if (f.guests) { const c = adCapacity(ad); if (c !== null && c < f.guests) return false; }
    if (f.sea) { if (!(ad.coords && ad.beach)) return false; if (distMeters(ad.coords, ad.beach) > f.sea) return false; }
    if (f.amen.length && !f.amen.every(a => (ad.amenities || []).includes(a))) return false;
    if (f.verified && !ad.isVerified) return false;
    return true;
}

function activeFilterCount(f = adFilter) {
    return (f.q ? 1 : 0) + (f.min !== '' || f.max !== '' ? 1 : 0) + (f.from ? 1 : 0) + (f.guests ? 1 : 0) + (f.sea ? 1 : 0) + (f.amen.length ? 1 : 0) + (f.verified ? 1 : 0);
}
function roomAds() { return adsForRoom(currentRoom)(getAllAds()); }
function filteredAds(f = adFilter) { return roomAds().filter(a => adPasses(a, f)); }

// ---------- лента ----------
function applyAdFilters() {
    const box = document.getElementById('chatMessages');
    if (!box || !isHousingRoom(currentRoom)) return;
    let shown = 0, total = 0;
    box.querySelectorAll('.chat-message-ad').forEach(el => {
        const ad = findAd(el.dataset.adId);
        const ok = !ad || adPasses(ad);
        el.classList.toggle('ad-off', !ok);
        total++; if (ok) shown++;
    });
    let empty = document.getElementById('filtEmpty');
    if (total && !shown) {
        if (!empty) { empty = document.createElement('div'); empty.id = 'filtEmpty'; empty.className = 'req-empty'; box.appendChild(empty); }
        empty.innerHTML = '<i class="fas fa-filter"></i><b>Ничего не найдено</b><span>Измените условия или сбросьте фильтры.</span><button type="button" class="ghost-btn" data-f="reset">Сбросить фильтры</button>';
    } else if (empty) empty.remove();
    paintFilterUI(shown, total);
}

function paintFilterUI(shown, total) {
    const n = activeFilterCount();
    const b = document.querySelector('#filtBtn .fbadge');
    if (b) { b.hidden = !n; b.textContent = String(n); }
    const sum = document.getElementById('filterSum');
    if (sum) {
        sum.hidden = !n;
        if (n) sum.innerHTML = `<span>Фильтры: ${n} · найдено ${shown} из ${total}</span><button type="button" data-f="reset">Сбросить</button>`;
    }
}

// ---------- окно фильтров ----------
function openFilterSheet() {
    const f = { ...adFilter, amen: [...adFilter.amen] };
    const e = escapeHtml;
    const chip = (on, attr, label) => `<button type="button" class="chip chip-toggle ${on ? 'on' : ''}" ${attr}>${label}</button>`;
    openSheet('Фильтры', `
        <label class="field"><span>Район или улица</span><input id="ffQ" maxlength="40" value="${e(f.q)}" placeholder="Например, Витязево"></label>
        <div class="f-row"><label class="field"><span>Цена от, ₽</span><input id="ffMin" type="number" inputmode="numeric" min="0" value="${e(f.min)}"></label>
            <label class="field"><span>до, ₽</span><input id="ffMax" type="number" inputmode="numeric" min="0" value="${e(f.max)}"></label></div>
        <div class="f-row"><label class="field"><span>Заезд</span><input id="ffFrom" type="date" value="${e(f.from)}"></label>
            <label class="field"><span>Выезд</span><input id="ffTo" type="date" value="${e(f.to)}"></label></div>
        <div class="f-h">Гостей</div>
        <div class="chip-row" id="ffGuests">${[[0, 'Любое'], [1, '1+'], [2, '2+'], [3, '3+'], [4, '4+'], [6, '6+']].map(([v, l]) => chip(f.guests === v, `data-v="${v}"`, l)).join('')}</div>
        <div class="f-h">До моря</div>
        <div class="chip-row" id="ffSea">${FSEA.map(([v, l]) => chip(f.sea === v, `data-v="${v}"`, l)).join('')}</div>
        <div class="f-h">Удобства</div>
        <div class="chip-row" id="ffAmen">${AMENITIES.map(a => chip(f.amen.includes(a.l), `data-a="${e(a.l)}"`, `<i class="fas ${a.i}"></i>${e(a.l)}`)).join('')}</div>
        <label class="pref-row" style="margin-top:14px"><span><b>Только проверенные хозяева</b></span><input type="checkbox" id="ffVer" ${f.verified ? 'checked' : ''}><i class="pref-sw"></i></label>
        <div class="watch-row"><button type="button" class="watch-btn" id="ffWatch"><i class="fas fa-bell"></i> Следить за этим поиском</button><button type="button" class="watch-link" id="ffSubs">Мои подписки</button></div>
        <div class="f-actions"><button type="button" class="ghost-btn" id="ffReset">Сбросить</button><button type="button" class="primary-btn" id="ffApply">Показать</button></div>`, (el) => {
        const read = () => {
            f.q = el.querySelector('#ffQ').value.trim();
            f.min = el.querySelector('#ffMin').value.trim(); f.max = el.querySelector('#ffMax').value.trim();
            f.from = el.querySelector('#ffFrom').value; f.to = el.querySelector('#ffTo').value;
            if (f.to && f.from && f.to <= f.from) f.to = '';
            f.verified = el.querySelector('#ffVer').checked;
        };
        const recount = () => { read(); const n = filteredAds(f).length; el.querySelector('#ffApply').textContent = 'Показать: ' + n; };
        const group = (sel, key) => el.querySelector(sel).addEventListener('click', (ev) => {
            const b = ev.target.closest('.chip'); if (!b) return;
            f[key] = Number(b.dataset.v);
            el.querySelectorAll(sel + ' .chip').forEach(x => x.classList.toggle('on', x === b));
            recount();
        });
        group('#ffGuests', 'guests'); group('#ffSea', 'sea');
        el.querySelector('#ffAmen').addEventListener('click', (ev) => {
            const b = ev.target.closest('.chip'); if (!b) return;
            const a = b.dataset.a, i = f.amen.indexOf(a);
            if (i >= 0) f.amen.splice(i, 1); else f.amen.push(a);
            b.classList.toggle('on', i < 0); recount();
        });
        el.addEventListener('input', recount); el.addEventListener('change', recount);
        el.querySelector('#ffReset').onclick = () => { adFilter = { ...FILTER_DEFAULT, amen: [] }; saveAdFilter(); closeSheet(); applyAdFilters(); refreshAdMap(); };
        el.querySelector('#ffApply').onclick = () => { read(); adFilter = f; saveAdFilter(); closeSheet(); applyAdFilters(); refreshAdMap(); };
        el.querySelector('#ffWatch').onclick = () => { read(); watchSearch(f); };
        el.querySelector('#ffSubs').onclick = () => openSearchSubs();
        recount();
    });
}

// ---------- карта ----------
let adMap = null, adMapSel = null, adMapToken = null;
function shortPrice(ad) {
    const n = Number(ad.priceNum) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',').replace(',0', '') + ' млн';
    if (n >= 10000) return Math.round(n / 1000) + ' тыс';
    return n.toLocaleString('ru-RU') + ' ₽';
}

function openAdMap() {
    if (document.getElementById('adMapView')) return;
    const view = document.createElement('div');
    view.id = 'adMapView'; view.className = 'admap';
    view.innerHTML = `<div class="admap-top"><button type="button" class="chat-back-btn" data-m="close" aria-label="Закрыть карту"><i class="fas fa-xmark"></i></button>
        <div class="admap-title" id="adMapTitle">Жильё на карте</div>
        <button type="button" class="chat-header-btn" data-m="filters" aria-label="Фильтры"><i class="fas fa-sliders"></i></button></div>
        <div class="admap-map" id="adMapBox"></div><div class="admap-card" id="adMapCard" hidden></div>`;
    document.body.appendChild(view);
    view.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-m]'); if (!b) return;
        if (b.dataset.m === 'close') closeAdMap();
        else if (b.dataset.m === 'filters') openFilterSheet();
        else if (b.dataset.m === 'open') { const id = b.dataset.id; closeAdMap(); openListing(id); }
    });
    const box = document.getElementById('adMapBox');
    const token = adMapToken = {};
    // сразу ставим итоговый вид, без «наезда»: иначе карта сначала грузит квадрат плиток на дальнем зуме, потом приближается
    const first = filteredAds().filter(a => Array.isArray(a.coords)).map(a => a.coords);
    const mid = first.length ? [first.reduce((x, p) => x + p[0], 0) / first.length, first.reduce((x, p) => x + p[1], 0) / first.length] : [44.8928, 37.299];
    YM.open(box, { center: mid, zoom: first.length ? 13 : 11 }).then((map) => {
        if (!map) return;
        if (adMapToken !== token || !document.getElementById('adMapView')) { map.destroy(); return; }
        adMap = map;
        if (first.length) map.fitBounds(first, { padding: 50, maxZoom: 15, animate: false });
        map.onClick(() => { adMapSel = null; paintAdMapCard(); markSelected(); });
        view.classList.add('intro');
        refreshAdMap(false, true);
        setTimeout(() => { if (adMap === map) { map.invalidate(); startBoat(); } }, 160);
    });
}

document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && document.getElementById('adMapView') && !document.getElementById('sheet')) closeAdMap(); });

function closeAdMap() {
    stopBoat();
    if (adMap) { try { adMap.destroy(); } catch (e) {} }
    adMap = null; adMapSel = null; adMapToken = null;
    const v = document.getElementById('adMapView'); if (v) v.remove();
}

function markSelected() {
    document.querySelectorAll('#adMapBox .ad-pin').forEach(p => p.classList.toggle('sel', p.dataset.id === String(adMapSel)));
}

function paintAdMapCard() {
    const card = document.getElementById('adMapCard'); if (!card) return;
    const ad = adMapSel ? findAd(adMapSel) : null;
    if (!ad) { card.hidden = true; return; }
    const e = escapeHtml;
    const sea = ad.coords && ad.beach ? fmtDist(distMeters(ad.coords, ad.beach)) + ' до моря' : '';
    card.hidden = false;
    card.innerHTML = `<div class="admap-thumb">${ad.image ? `<img src="${e(ad.image)}" alt="">` : '<i class="fas fa-image"></i>'}</div>
        <div class="admap-info"><b>${e(ad.title)}</b><span class="admap-price">${e(ad.price || '')}</span><small>${e([ad.location, sea].filter(Boolean).join(' · '))}</small></div>
        <button type="button" class="primary-btn" data-m="open" data-id="${e(String(ad.id))}">Открыть</button>`;
}

function refreshAdMap(fit, initial) {
    if (!initial) endBoat(true);
    if (!adMap) { const t = document.getElementById('adMapTitle'); if (t) paintMapTitle(); return; }
    adMap.clearMarkers('ads');
    const list = filteredAds(), withPoint = list.filter(a => Array.isArray(a.coords));
    const pts = [];
    withPoint.forEach(ad => {
        adMap.addMarker({ coords: ad.coords, group: 'ads', size: [64, 30], anchor: [32, 30],
            html: `<div class="ad-pin" data-id="${escapeHtml(String(ad.id))}">${escapeHtml(shortPrice(ad))}</div>`,
            onClick: () => { adMapSel = ad.id; paintAdMapCard(); markSelected(); } });
        pts.push(ad.coords);
    });
    if (adMapSel && !list.some(a => String(a.id) === String(adMapSel))) adMapSel = null;
    paintAdMapCard(); markSelected(); paintMapTitle(withPoint.length, list.length - withPoint.length);
    if (pts.length && fit !== false) adMap.fitBounds(pts, { padding: 50, maxZoom: 15 });
}
function paintMapTitle(n, noPoint) {
    const t = document.getElementById('adMapTitle'); if (!t) return;
    if (n === undefined) { const l = filteredAds(); n = l.filter(a => Array.isArray(a.coords)).length; noPoint = l.length - n; }
    t.textContent = n ? `Жильё на карте: ${n}` : 'На карте ничего нет';
    t.title = noPoint ? `Ещё ${noPoint} без точки на карте` : '';
}

// ---------- кнопки в шапке чата «Жильё» ----------
function setupFilters() {
    if (!isHousingRoom(currentRoom)) return;
    const head = document.querySelector('#group-screen .room-head');
    if (!head || head.querySelector('#filtBtn')) { applyAdFilters(); return; }
    const help = head.querySelector('.chat-help-btn');
    const tools = document.createElement('div'); tools.className = 'head-tools';
    tools.innerHTML = '<button type="button" class="chat-header-btn" id="filtBtn" aria-label="Фильтры"><i class="fas fa-sliders"></i><span class="fbadge" hidden>0</span></button><button type="button" class="chat-header-btn" id="mapBtn" aria-label="Карта"><i class="fas fa-map-location-dot"></i></button>';
    if (help) tools.appendChild(help);
    head.appendChild(tools);
    tools.querySelector('#filtBtn').onclick = openFilterSheet;
    tools.querySelector('#mapBtn').onclick = openAdMap;
    const wrap = document.querySelector('#group-screen .cat-chips-wrap');
    if (wrap && !document.getElementById('filterSum')) {
        wrap.insertAdjacentHTML('afterend', '<div class="filter-sum" id="filterSum" hidden></div>');
        document.getElementById('filterSum').addEventListener('click', (ev) => { if (ev.target.closest('[data-f="reset"]')) resetAdFilters(); });
    }
    const msgs = document.getElementById('chatMessages');
    if (msgs) msgs.addEventListener('click', (ev) => { if (ev.target.closest('[data-f="reset"]')) resetAdFilters(); });
    applyAdFilters();
}
function resetAdFilters() { adFilter = { ...FILTER_DEFAULT, amen: [] }; saveAdFilter(); applyAdFilters(); refreshAdMap(); }

const _openGroupFilters = openGroup;
openGroup = function () { closeAdMap(); const r = _openGroupFilters.apply(this, arguments); setTimeout(setupFilters, 40); return r; };
const _closeGroupFilters = closeGroup;
closeGroup = function () { closeAdMap(); return _closeGroupFilters.apply(this, arguments); };
const _placeRemoteAdsF = placeRemoteAds;
placeRemoteAds = function () { const r = _placeRemoteAdsF.apply(this, arguments); applyAdFilters(); return r; };

// ============================================
// Катер плывёт к берегу (вид сверху), за ним пена и волны «ёлочкой»; причалил — появляются цены.
// Всё рисуется на холсте поверх карты. Касание карты пропускает анимацию.
// При «уменьшении движения» в системе анимации нет.
// ============================================
let boat = null;     // { raf, canvas, timers, skip }

function mapControls(on) {
    if (adMap) adMap.setInteractive(on);
}

function teardownBoat() {
    if (!boat) return;
    cancelAnimationFrame(boat.raf); boat.timers.forEach(clearTimeout);
    const box = document.getElementById('adMapBox');
    if (box && boat.skip) box.removeEventListener('pointerdown', boat.skip);
    if (boat.canvas) boat.canvas.remove();
    boat = null;
}
function stopBoat() { teardownBoat(); }
function endBoat(now) {
    teardownBoat();
    mapControls(true);
    const view = document.getElementById('adMapView'); if (!view) return;
    const pins = view.querySelectorAll('.ad-pin');
    pins.forEach(p => p.classList.add('show'));
    if (now) { view.classList.remove('intro'); pins.forEach(p => { p.style.transitionDelay = ''; }); }
}

function drawBoat(ctx, x, y, ang, alpha) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,25,45,.30)'; ctx.beginPath(); ctx.ellipse(5, 5, 9.5, 25, 0, 0, 7); ctx.fill();            // тень на воде
    const hull = () => { ctx.beginPath(); ctx.moveTo(0, -27); ctx.bezierCurveTo(10, -15, 10, 9, 7.5, 23); ctx.lineTo(-7.5, 23); ctx.bezierCurveTo(-10, 9, -10, -15, 0, -27); ctx.closePath(); };
    hull(); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#FF7A3D'; ctx.beginPath(); ctx.moveTo(0, -23); ctx.lineTo(1.6, -12); ctx.lineTo(-1.6, -12); ctx.closePath(); ctx.fill();   // полоса на носу
    ctx.fillStyle = '#dbe8ef'; ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(6, -8); ctx.lineTo(6.5, 14); ctx.lineTo(-6.5, 14); ctx.closePath(); ctx.fill();   // палуба
    ctx.fillStyle = '#2b6f96'; ctx.beginPath(); ctx.moveTo(-5, -6); ctx.lineTo(5, -6); ctx.lineTo(4, -1); ctx.lineTo(-4, -1); ctx.closePath(); ctx.fill();    // стекло
    ctx.fillStyle = '#9fb4c0'; ctx.fillRect(-4, 4, 8, 7);                                                                                                      // сиденья
    ctx.fillStyle = '#44525c'; ctx.fillRect(-3, 22, 6, 6);                                                                                                     // мотор
    ctx.restore();
}

function startBoat() {
    const view = document.getElementById('adMapView'), box = document.getElementById('adMapBox');
    if (!adMap || !view || !box) return;
    const ads = filteredAds().filter(a => Array.isArray(a.coords));
    const calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!ads.length || calm) { endBoat(true); return; }
    const map = adMap, W = box.clientWidth || 360, H = box.clientHeight || 640;
    mapControls(false);

    // цель — середина береговых точек; море — со стороны «от жилья к берегу»
    const withBeach = ads.filter(a => Array.isArray(a.beach));
    const mean = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
    const targetLL = withBeach.length ? mean(withBeach.map(a => a.beach)) : mean(ads.map(a => a.coords));
    let T = map.project(targetLL);
    T = { x: Math.max(48, Math.min(W - 48, T.x)), y: Math.max(120, Math.min(H - 170, T.y)) };
    let sx = 0, sy = 0;
    withBeach.forEach(a => { const h = map.project(a.coords), b = map.project(a.beach); sx += b.x - h.x; sy += b.y - h.y; });
    let len = Math.hypot(sx, sy);
    if (len < 2) { sx = -0.4; sy = 1; len = Math.hypot(sx, sy); }
    sx /= len; sy /= len;
    const tx = sx > 0 ? (W - T.x) / sx : sx < 0 ? (0 - T.x) / sx : Infinity, ty = sy > 0 ? (H - T.y) / sy : sy < 0 ? (0 - T.y) / sy : Infinity;
    const run = Math.max(200, Math.min(tx, ty) + 70);
    const S = { x: T.x + sx * run, y: T.y + sy * run };
    // лёгкая дуга: катер не идёт по линейке
    const mx = (S.x + T.x) / 2 - sy * run * 0.16, my = (S.y + T.y) / 2 + sx * run * 0.16;
    const bez = (p) => { const u = 1 - p; return { x: u * u * S.x + 2 * u * p * mx + p * p * T.x, y: u * u * S.y + 2 * u * p * my + p * p * T.y }; };

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const canvas = document.createElement('canvas');
    canvas.className = 'boat-fx'; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    box.appendChild(canvas);
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);

    const parts = [], rings = [];
    const rnd = (a, b) => a + Math.random() * (b - a);
    const TAN = Math.tan(19.5 * Math.PI / 180);
    const finish = () => {
        if (!boat || boat.arrived) return;
        boat.arrived = performance.now();
        rings.push({ x: T.x, y: T.y, t: boat.arrived, life: 1500 }, { x: T.x, y: T.y, t: boat.arrived + 260, life: 1500 });
        boat.timers.push(setTimeout(() => {
            mapControls(true);
            const pins = [...view.querySelectorAll('.ad-pin')];
            pins.forEach((p, i) => { p.style.transitionDelay = (i * 70) + 'ms'; p.classList.add('show'); });
            boat.timers.push(setTimeout(() => endBoat(true), Math.max(pins.length * 70 + 700, 2600)));
        }, 450));
    };
    const skip = () => { if (boat) endBoat(true); };
    boat = { raf: 0, canvas, timers: [], skip, arrived: 0 };
    box.addEventListener('pointerdown', skip, { once: true });

    const DUR = 4200, t0 = performance.now();
    let last = t0, prev = bez(0), pos = prev, ang = Math.atan2(T.x - S.x, -(T.y - S.y));
    const tick = (now) => {
        if (!boat) return;
        const dt = Math.min(64, now - last) / 1000; last = now;
        const p = Math.min(1, (now - t0) / DUR), e = 1 - Math.pow(1 - p, 2.4);      // замедляется у берега
        pos = bez(e);
        const vx = pos.x - prev.x, vy = pos.y - prev.y, step = Math.hypot(vx, vy), speed = dt ? step / dt : 0;
        if (step > 0.05) ang = Math.atan2(vx, -vy);
        const dx = Math.sin(ang), dy = -Math.cos(ang), px = -dy, py = dx;           // вперёд и вбок
        if (p < 1 && speed > 3) {
            // пена за кормой + «ёлочка» разбегающихся волн
            // частицы ставятся по всему пройденному за кадр отрезку: след получается сплошным при любой частоте кадров
            const n = Math.min(22, Math.max(1, Math.ceil(step / 1.5)));
            const u = Math.max(speed, 30) * TAN;
            for (let k = 0; k < n; k++) {
                const f = (k + Math.random()) / n, cx = prev.x + vx * f, cy = prev.y + vy * f, side = rnd(-3.5, 3.5);
                parts.push({ x: cx - dx * 23 + px * side, y: cy - dy * 23 + py * side, vx: px * rnd(-7, 7), vy: py * rnd(-7, 7), r0: rnd(1.4, 2.6), r1: rnd(5, 9), a: rnd(.32, .6), life: rnd(1.4, 2.4), age: 0 });
                if (k % 2 === 0) for (const sgn of [-1, 1]) {
                    parts.push({ x: cx - dx * 8 + px * sgn * 5, y: cy - dy * 8 + py * sgn * 5, vx: px * sgn * u + rnd(-3, 3), vy: py * sgn * u + rnd(-3, 3), r0: 2, r1: 7.5, a: .13, life: 3, age: 0, soft: true });
                }
            }
        }
        prev = pos;

        ctx.clearRect(0, 0, W, H);
        for (let i = parts.length - 1; i >= 0; i--) {
            const q = parts[i]; q.age += dt;
            if (q.age >= q.life) { parts.splice(i, 1); continue; }
            q.x += q.vx * dt; q.y += q.vy * dt;
            const k = q.age / q.life, r = q.r0 + (q.r1 - q.r0) * k, al = q.a * Math.pow(1 - k, q.soft ? 1.3 : 1.7);
            ctx.fillStyle = `rgba(255,255,255,${al.toFixed(3)})`;
            ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 6.2832); ctx.fill();
        }
        for (let i = rings.length - 1; i >= 0; i--) {
            const g = rings[i], k = (now - g.t) / g.life;
            if (k < 0) continue;
            if (k >= 1) { rings.splice(i, 1); continue; }
            ctx.strokeStyle = `rgba(255,255,255,${(.8 * (1 - k)).toFixed(3)})`; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(g.x, g.y, 8 + k * 46, 0, 6.2832); ctx.stroke();
        }
        const fade = boat.arrived ? Math.max(0, 1 - (now - boat.arrived) / 600) : 1;
        if (fade > 0) drawBoat(ctx, pos.x, pos.y, ang, fade);
        if (p >= 1) finish();
        boat.raf = requestAnimationFrame(tick);
    };
    boat.raf = requestAnimationFrame(tick);
}
