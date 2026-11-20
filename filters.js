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
    box.querySelectorAll('.chat-message-ad:not(.ad-skel)').forEach(el => {
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
        <div class="watch-plate">
            <label class="watch-top"><span><i class="fas fa-bell"></i> Следить за этим поиском</span><input type="checkbox" id="ffWatchSw"><i class="pref-sw"></i></label>
            <small>Мы пришлём уведомление, если найдётся что-то подходящее.</small>
            <button type="button" class="watch-link" id="ffSubs">Мои подписки</button>
        </div>
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
        // бегунок «Следить за этим поиском»: включил — подписка сохранена, выключил — удалена
        const sw = el.querySelector('#ffWatchSw');
        let watchId = '', watchSig = '';
        const sigNow = () => searchSig(searchPayload(f).filter);
        if (getToken() && typeof watchFind === 'function') watchFind(f).then(id => { if (id && sw.isConnected) { watchId = id; watchSig = sigNow(); sw.checked = true; } });
        sw.addEventListener('change', async () => {
            read();
            if (sw.checked) {
                if (!getToken()) { sw.checked = false; showToast('Войдите, чтобы следить за поиском'); return; }
                if (!activeFilterCount(f)) { sw.checked = false; showToast('Сначала задайте хотя бы один фильтр'); return; }
                sw.disabled = true;
                const id = await watchCreate(f);
                sw.disabled = false;
                if (!id) { sw.checked = false; return; }
                watchId = id; watchSig = sigNow();
                showToast('Готово! Сообщим, когда появится подходящее жильё');
            } else if (watchId) {
                sw.disabled = true;
                const ok = await watchRemove(watchId);
                sw.disabled = false;
                if (!ok) { sw.checked = true; showToast('Не удалось выключить'); return; }
                watchId = ''; watchSig = '';
            }
        });
        el.querySelector('#ffApply').onclick = async () => {
            read();
            // если условия поменяли после включения, подписка обновляется под них
            if (sw.checked && watchId && watchSig !== sigNow()) {
                await watchRemove(watchId);
                watchId = activeFilterCount(f) ? await watchCreate(f) : '';
            }
            adFilter = f; saveAdFilter(); closeSheet(); applyAdFilters(); refreshAdMap();
        };
        el.querySelector('#ffSubs').onclick = () => openSearchSubs();
        recount();
    });
}

// ---------- карта ----------
// Карта не знает про все объявления сразу. Она спрашивает у сервера только то, что попало в кадр:
// отдельные метки с ценой, а плотные места приходят кружками с числом (тап — приблизить).
// Поэтому работает одинаково быстро хоть с 50, хоть с 50 000 объявлений.
let adMap = null, adMapSel = null, adMapToken = null, adMapMoved = false;
let adMapMarks = new Map();          // ключ метки → { rec, sig }
let adMapSeen = new Map();           // id → короткие данные метки (для карточки внизу)
let adMapSig = '', adMapSeq = 0, adMapTimer = null, adMapAbort = null, adMapStat = { total: 0, noPoint: 0 };
const AD_TOWN = MAP_DEFAULT.slice();
const AD_MAP_PINS = 120;
function shortPrice(ad) {
    const n = Number(ad.priceNum) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',').replace(',0', '') + ' млн';
    if (n >= 10000) return Math.round(n / 1000) + ' тыс';
    return n.toLocaleString('ru-RU') + ' ₽';
}

// те же правила, что у подписки на поиск: сервер сам отберёт подходящие
function adMapServerFilter() {
    const f = adFilter, cat = (typeof housingCatByRoom === 'function' && typeof currentRoom === 'string') ? housingCatByRoom(currentRoom).id : 'all';
    const o = { q: f.q || '', min: f.min, max: f.max, from: f.from || '', to: f.to || '', guests: f.guests || 0, sea: f.sea || 0, amen: f.amen || [], verified: !!f.verified, cat: cat === 'all' ? '' : cat };
    return JSON.stringify(o);
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
        if (typeof recentMapGesture === 'function' && recentMapGesture()) return;   // щипок по карте не закрывает её
        if (b.dataset.m === 'close') closeAdMap();
        else if (b.dataset.m === 'filters') openFilterSheet();
        else if (b.dataset.m === 'open') {
            const id = b.dataset.id;
            if (findAd(id)) { closeAdMap(); openListing(id); }
            else fetchFullAd(id, (ok) => { if (ok) { closeAdMap(); openListing(id); } });   // объявления нет в ленте: догружаем одно
        }
    });
    const box = document.getElementById('adMapBox');
    adMapMoved = false; adMapMarks = new Map(); adMapSeen = new Map(); adMapStat = { total: 0, noPoint: 0 };
    box.addEventListener('pointerdown', () => { adMapMoved = true; }, { once: true });
    const token = adMapToken = {};
    // стартуем с посёлка: сразу нужный вид, без «наезда» с дальнего масштаба
    const own = getAllAds().filter(a => Array.isArray(a.coords) && nearTown(a.coords)).map(a => a.coords);
    const mid = own.length ? [own.reduce((x, p) => x + p[0], 0) / own.length, own.reduce((x, p) => x + p[1], 0) / own.length] : AD_TOWN.slice();
    YM.open(box, { center: mid, zoom: 14 }).then((map) => {
        if (!map) return;
        if (adMapToken !== token || !document.getElementById('adMapView')) { map.destroy(); return; }
        adMap = map;
        map.onClick(() => { adMapSel = null; paintAdMapCard(); markSelected(); });
        map.onMoveEnd(() => scheduleAdMapLoad(220));
        loadAdMapView();
        // блок карты получает размер не сразу (плавное появление): после этого подгоняем и перезапрашиваем кадр
        setTimeout(() => { if (adMap === map) { map.invalidate(); loadAdMapView(); } }, 200);
        setTimeout(() => { if (adMap === map && !adMapMoved) { map.invalidate(); loadAdMapView(); } }, 700);
    });
}

// рядом с Архипо-Осиповкой (до 40 км)
const nearTown = (c) => Array.isArray(c) && distMeters(c, AD_TOWN) < 40000;

function scheduleAdMapLoad(ms, force) {
    clearTimeout(adMapTimer);
    adMapTimer = setTimeout(() => loadAdMapView(force), ms == null ? 0 : ms);
}

// без сервера (или он недоступен): то, что уже есть на телефоне, тем же способом — только из кадра
function localAdMapView(bbox) {
    const [s, w, n, e] = bbox;
    const all = filteredAds().filter(a => Array.isArray(a.coords));
    const inView = all.filter(a => a.coords[0] >= s && a.coords[0] <= n && a.coords[1] >= w && a.coords[1] <= e);
    return { ok: true, local: true, total: filteredAds().length, noPoint: filteredAds().length - all.length, inView: inView.length, clusters: [],
        pins: inView.slice(0, AD_MAP_PINS).map(a => ({ id: a.id, coords: a.coords, price: a.price, priceNum: a.priceNum, title: a.title })) };
}

async function loadAdMapView(force) {
    if (!adMap) return;
    const bb = adMap.getBounds();
    if (!bb || !bb.every(Number.isFinite)) return;
    const flt = adMapServerFilter(), q = `bbox=${bb.map(x => Math.round(x * 1e5) / 1e5).join(',')}&z=${adMap.getZoom()}&f=${encodeURIComponent(flt)}`;
    if (!force && q === adMapSig) return;       // кадр и фильтры те же — повторно не спрашиваем
    adMapSig = q;
    const my = ++adMapSeq;
    if (adMapAbort) { try { adMapAbort.abort(); } catch (e) {} }
    const ctl = adMapAbort = typeof AbortController === 'function' ? new AbortController() : null;
    let data = null;
    try {
        const res = await fetch(`${SERVER_URL}/api/listings/map?${q}`, ctl ? { signal: ctl.signal } : undefined);
        const d = await res.json();
        if (d && d.ok) data = d;
    } catch (e) { if (e && e.name === 'AbortError') return; }
    if (my !== adMapSeq || !adMap) return;      // пока ждали, кадр уже сменился
    if (!data) { adMapSig = ''; }
    if (!data) data = localAdMapView(bb);
    paintAdMapView(data);
}

function paintAdMapView(d) {
    if (!adMap) return;
    const e = escapeHtml, want = new Map();
    (d.clusters || []).forEach(c => {
        const key = 'c' + c.coords[0] + ',' + c.coords[1] + ':' + c.count;
        want.set(key, { key, coords: c.coords, size: [48, 48], anchor: [24, 24],
            html: `<div class="ad-cluster" data-k="${e(key)}"><span>${c.count > 999 ? Math.round(c.count / 100) / 10 + 'k' : c.count}</span></div>`,
            onClick: () => adMap && adMap.setView(c.coords, Math.min(adMap.getZoom() + 2, 18), true) });
    });
    (d.pins || []).forEach(p => {
        if (!Array.isArray(p.coords)) return;
        adMapSeen.set(String(p.id), p);
        const key = 'p' + p.id + ':' + (p.priceNum || 0);
        want.set(key, { key, coords: p.coords, size: [64, 30], anchor: [32, 30],
            html: `<div class="ad-pin show" data-id="${e(String(p.id))}">${e(shortPrice(p))}</div>`,
            onClick: () => { adMapSel = String(p.id); paintAdMapCard(); markSelected(); } });
    });
    // убираем только то, чего в новом кадре нет; остальное не трогаем, поэтому карта не мигает
    for (const [k, m] of adMapMarks) if (!want.has(k)) { try { m.rec.remove(); } catch (x) {} adMapMarks.delete(k); }
    for (const [k, w] of want) if (!adMapMarks.has(k)) adMapMarks.set(k, { rec: adMap.addMarker({ coords: w.coords, group: 'ads', size: w.size, anchor: w.anchor, html: w.html, onClick: w.onClick }) });
    adMapStat = { total: d.total || 0, noPoint: d.noPoint || 0 };
    paintAdMapCard(); markSelected(); paintMapTitle();
    const view = document.getElementById('adMapView'); if (view) view.classList.remove('intro');
}

document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && document.getElementById('adMapView') && !document.getElementById('sheet')) closeAdMap(); });

function closeAdMap() {
    stopBoat();
    clearTimeout(adMapTimer); adMapSeq++;
    if (adMapAbort) { try { adMapAbort.abort(); } catch (e) {} adMapAbort = null; }
    if (adMap) { try { adMap.destroy(); } catch (e) {} }
    adMap = null; adMapSel = null; adMapToken = null; adMapMoved = false; adMapMarks = new Map(); adMapSeen = new Map(); adMapSig = '';
    const v = document.getElementById('adMapView'); if (v) v.remove();
}

function markSelected() {
    document.querySelectorAll('#adMapBox .ad-pin').forEach(p => p.classList.toggle('sel', p.dataset.id === String(adMapSel)));
}

function paintAdMapCard() {
    const card = document.getElementById('adMapCard'); if (!card) return;
    const ad = adMapSel ? (findAd(adMapSel) || adMapSeen.get(String(adMapSel))) : null;
    if (!ad) { card.hidden = true; return; }
    const e = escapeHtml;
    const sea = ad.coords && ad.beach ? fmtDist(distMeters(ad.coords, ad.beach)) + ' до моря' : '';
    card.hidden = false;
    card.innerHTML = `<div class="admap-thumb">${ad.image ? `<img src="${e(ad.image)}" alt="">` : '<i class="fas fa-image"></i>'}</div>
        <div class="admap-info"><b>${e(ad.title)}</b><span class="admap-price">${e(ad.price || '')}</span><small>${e([ad.location, sea].filter(Boolean).join(' · '))}</small></div>
        <button type="button" class="primary-btn" data-m="open" data-id="${e(String(ad.id))}">Открыть</button>`;
    // объявления нет в ленте (она может быть длинной): догружаем лёгкую карточку ради фото и адреса
    if (!findAd(adMapSel) && !ad._lite) {
        const id = String(adMapSel); ad._lite = true;
        fetch(`${SERVER_URL}/api/listings/${encodeURIComponent(id)}?lite=1`).then(r => r.json()).then(r => {
            if (!r || !r.ok || !r.listing) return;
            const full = normalizeRemoteAd(r.listing); full._lite = true;
            adMapSeen.set(id, full);
            if (String(adMapSel) === id) paintAdMapCard();
        }).catch(() => {});
    }
}

// сменили фильтры: перерисовываем кадр уже по ним
function refreshAdMap() {
    if (!adMap) return;
    adMapSel = null;
    loadAdMapView(true);
}
function paintMapTitle() {
    const t = document.getElementById('adMapTitle'); if (!t) return;
    const n = Math.max(0, adMapStat.total - adMapStat.noPoint), noPoint = adMapStat.noPoint;
    t.textContent = n ? `Жильё на карте: ${n.toLocaleString('ru-RU')}` : 'На карте ничего нет';
    t.title = noPoint ? `Ещё ${noPoint} без точки на карте` : '';
}

// ---------- кнопки в шапке чата «Жильё» ----------
function setupFilters() {
    if (!isHousingRoom(currentRoom)) return;
    const head = document.querySelector('#group-screen .room-head');
    if (!head || head.querySelector('#roomPubBtn')) { applyAdFilters(); return; }
    const help = head.querySelector('.chat-help-btn');
    const tools = document.createElement('div'); tools.className = 'head-tools';
    tools.innerHTML = '<button type="button" class="chat-header-btn room-pub-btn" id="roomPubBtn" aria-label="Мои публикации"><i class="fas fa-clipboard-list"></i><span>Мои публикации</span></button><button type="button" class="chat-header-btn" id="mapBtn" aria-label="Карта"><i class="fas fa-map-location-dot"></i></button>';
    if (help) tools.appendChild(help);
    head.appendChild(tools);
    tools.querySelector('#roomPubBtn').onclick = () => { if (typeof closeGroup === 'function') closeGroup(); if (typeof pubGoto === 'function') pubGoto('housing', 'ads'); else switchTab('mypubs'); };
    const fb = document.getElementById('filtBtn'); if (fb) fb.onclick = openFilterSheet;
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
const _afterRemoteF = afterRemoteAdsChanged;
afterRemoteAdsChanged = function () { const r = _afterRemoteF.apply(this, arguments); if (adMap) scheduleAdMapLoad(300, true); return r; };
const _placeRemoteAdsF = placeRemoteAds;
placeRemoteAds = function () { const r = _placeRemoteAdsF.apply(this, arguments); applyAdFilters(); return r; };

// ============================================
// Карта объявлений: цены на метках появляются сразу (анимацию катера убрали).
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

function startBoat() {
    // без анимации катера: сразу показываем цены на карте
    if (!adMap || !document.getElementById('adMapView')) return;
    endBoat(true);
}
