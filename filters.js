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
        recount();
    });
}

// ---------- карта ----------
let adMap = null, adMapLayer = null, adMapSel = null;
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
    if (typeof L === 'undefined') { box.innerHTML = '<div class="map-fallback"><i class="fas fa-map"></i>Карта загрузится при подключении к интернету</div>'; return; }
    adMap = L.map(box, { zoomControl: false, tap: false }).setView([44.8928, 37.299], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(adMap);
    adMapLayer = L.layerGroup().addTo(adMap);
    adMap.on('click', () => { adMapSel = null; paintAdMapCard(); markSelected(); });
    refreshAdMap(true);
    setTimeout(() => { if (adMap) adMap.invalidateSize(); }, 60);
}

function closeAdMap() {
    if (adMap) { try { adMap.remove(); } catch (e) {} }
    adMap = null; adMapLayer = null; adMapSel = null;
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

function refreshAdMap(fit) {
    if (!adMap || !adMapLayer) { const t = document.getElementById('adMapTitle'); if (t) paintMapTitle(); return; }
    adMapLayer.clearLayers();
    const list = filteredAds(), withPoint = list.filter(a => Array.isArray(a.coords));
    const pts = [];
    withPoint.forEach(ad => {
        const icon = L.divIcon({ className: 'map-pin-wrap', html: `<div class="ad-pin" data-id="${escapeHtml(String(ad.id))}">${escapeHtml(shortPrice(ad))}</div>`, iconSize: [64, 30], iconAnchor: [32, 30] });
        L.marker(ad.coords, { icon }).on('click', () => { adMapSel = ad.id; paintAdMapCard(); markSelected(); }).addTo(adMapLayer);
        pts.push(ad.coords);
    });
    if (adMapSel && !list.some(a => String(a.id) === String(adMapSel))) adMapSel = null;
    paintAdMapCard(); markSelected(); paintMapTitle(withPoint.length, list.length - withPoint.length);
    if (pts.length && fit !== false) adMap.fitBounds(pts, { padding: [50, 50], maxZoom: 15 });
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
