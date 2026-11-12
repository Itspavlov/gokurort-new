// ============================================
// ROUTE.JS — карта у карточки жилья и маршрут до моря.
//  • плашка «Карта» под карточкой объявления открывает карту с домом и морем;
//  • переключатель «Пешком / На авто»: линия маршрута, время и расстояние;
//  • подсказка про такси.
// Маршрут строит открытый сервис routing.openstreetmap.de (пешком и на машине). Если он не ответил,
// показываем прямую линию и примерное время (пешком 80 м/мин, на авто ~28 км/ч по посёлку).
// Эта же панель стоит в блоке «Расположение» внутри объявления.
// ============================================
const TAXI_PRICE = 200;
const routeCache = {};

function routeEstimate(a, b, mode) {
    const d = distMeters(a, b) * 1.25;            // дороги не по прямой
    const min = mode === 'foot' ? Math.max(1, Math.round(d / 80)) : Math.max(2, Math.round(d / (28000 / 60)) + 1);
    return { dist: d, min, pts: [a, b], approx: true };
}

async function routeGet(a, b, mode) {
    const key = mode + '|' + a.join(',') + '|' + b.join(',');
    if (routeCache[key]) return routeCache[key];
    let res = null;
    try {
        const ctl = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = setTimeout(() => ctl && ctl.abort(), 6000);
        const url = 'https://routing.openstreetmap.de/routed-' + (mode === 'foot' ? 'foot' : 'car') + '/route/v1/driving/'
            + a[1] + ',' + a[0] + ';' + b[1] + ',' + b[0] + '?overview=full&geometries=geojson';
        const r = await fetch(url, ctl ? { signal: ctl.signal } : {});
        clearTimeout(timer);
        const d = await r.json();
        const rt = d && d.routes && d.routes[0];
        if (rt && rt.geometry && rt.geometry.coordinates && rt.geometry.coordinates.length > 1) {
            res = { dist: rt.distance, min: Math.max(1, Math.round(rt.duration / 60)), pts: rt.geometry.coordinates.map(c => [c[1], c[0]]), approx: false };
        }
    } catch (_) { res = null; }
    if (!res) return routeEstimate(a, b, mode);   // не запоминаем: в следующий раз попробуем ещё раз
    routeCache[key] = res;
    return res;
}

function routePanelHTML() {
    return `<div class="rt-panel">
        <div class="rt-tabs" role="tablist" aria-label="Как добраться до моря">
            <button type="button" class="on" data-rt-mode="foot" role="tab"><i class="fas fa-person-walking"></i> Пешком</button>
            <button type="button" data-rt-mode="car" role="tab"><i class="fas fa-car"></i> На авто</button>
        </div>
        <div class="rt-sum"><b class="rt-time">считаем маршрут…</b><span class="rt-dist"></span></div>
        <div class="rt-taxi"><i class="fas fa-taxi"></i><span>Такси до моря — около ${TAXI_PRICE} ₽</span></div>
        <a class="map-link rt-yx" target="_blank" rel="noopener"><i class="fas fa-diamond-turn-right"></i> Открыть маршрут в Яндекс Картах</a>
    </div>`;
}

// panel — блок из routePanelHTML, map — открытая карта (YM.open), ad — объявление с coords и beach
// map может быть функцией (карта подгрузится позже) или null: текст со временем показываем и без карты
function routePanelInit(panel, mapOrFn, ad) {
    const getMap = typeof mapOrFn === 'function' ? mapOrFn : () => mapOrFn;
    let line = null, mode = 'foot', token = 0, last = null;
    const timeEl = panel.querySelector('.rt-time'), distEl = panel.querySelector('.rt-dist'), yx = panel.querySelector('.rt-yx');
    const draw = () => {
        const map = getMap();
        if (!map || !last) return;
        if (line) { try { line.remove(); } catch (_) {} line = null; }
        try {
            line = map.addLine(last.r.pts, { color: last.m === 'foot' ? '#2DD4DA' : '#FFB35C', width: 5, dash: false });
            map.fitBounds(last.r.pts.length > 2 ? last.r.pts : [ad.coords, ad.beach], { padding: 50, maxZoom: 17, animate: true });
        } catch (_) {}
    };
    const show = async (m) => {
        mode = m;
        const my = ++token;
        panel.querySelectorAll('[data-rt-mode]').forEach(b => { const on = b.dataset.rtMode === m; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
        panel.classList.toggle('car', m === 'car');
        timeEl.textContent = 'считаем маршрут…'; distEl.textContent = '';
        yx.href = 'https://yandex.ru/maps/?rtext=' + ad.coords[0] + ',' + ad.coords[1] + '~' + ad.beach[0] + ',' + ad.beach[1] + '&rtt=' + (m === 'foot' ? 'pd' : 'auto');
        const r = await routeGet(ad.coords, ad.beach, m);
        if (my !== token || !panel.isConnected) return;
        last = { r, m };
        draw();
        const ico = m === 'foot' ? 'пешком' : 'на авто';
        timeEl.textContent = (r.approx ? '≈ ' : '') + r.min + ' мин ' + ico;
        distEl.textContent = fmtDist(r.dist) + ' до моря' + (r.approx ? ' · примерно, по прямой' : '');
    };
    panel.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-rt-mode]');
        if (b && b.dataset.rtMode !== mode) show(b.dataset.rtMode);
    });
    show('foot');
    return { show, redraw: draw };
}

// окно «Карта» под карточкой объявления
function openRouteMap(id) {
    const ad = typeof findAd === 'function' ? findAd(id) : null;
    if (!ad || !Array.isArray(ad.coords)) { showToast('У этого объявления нет точки на карте'); return; }
    const e = escapeHtml;
    const sea = Array.isArray(ad.beach);
    openSheet('Карта · ' + e(ad.title || 'жильё'), `
        ${ad.location ? `<p class="sv-where"><i class="fas fa-location-dot"></i><span>${e(ad.location)}</span></p>` : ''}
        <div class="dv-map rt-map" id="rtMap" data-noswipe></div>
        ${sea ? routePanelHTML() : '<p class="auth-note">Хозяин не отметил, где море.</p>'}
        <a class="map-link" target="_blank" rel="noopener" href="https://yandex.ru/maps/?pt=${ad.coords[1]},${ad.coords[0]}&z=16&l=map"><i class="fas fa-map"></i> Открыть в Яндекс Картах</a>
        <button type="button" class="ghost-btn wide-btn" data-rt-open="${e(String(ad.id))}" style="margin-top:10px"><i class="fas fa-house"></i> Открыть объявление</button>`, (el) => {
        const o = el.querySelector('[data-rt-open]');
        if (o) o.onclick = () => { closeSheet(); openListing(o.dataset.rtOpen); };
        let mapRef = null;
        const rp = sea ? routePanelInit(el.querySelector('.rt-panel'), () => mapRef, ad) : null;
        YM.open(el.querySelector('#rtMap'), { center: ad.coords, zoom: 16, zoomControl: true }).then((map) => {
            if (!map) return;
            if (!el.isConnected) { map.destroy(); return; }
            mapRef = map;
            map.addMarker({ coords: ad.coords, html: mapPin('pin-home', 'fa-home'), size: [40, 40] });
            if (sea) map.addMarker({ coords: ad.beach, html: mapPin('pin-sea', 'fa-umbrella-beach'), size: [40, 40] });
            if (rp) rp.redraw();
            setTimeout(() => map.invalidate(), 250);
        });
    });
}

// плашка «Карта» под карточкой: время до моря пешком прямо на кнопке
function adMapBtnHTML(ad) {
    if (!ad || !Array.isArray(ad.coords)) return '';
    const m = Array.isArray(ad.beach) ? distMeters(ad.coords, ad.beach) : 0;
    const sub = m ? ` · до моря ${walkMinutes(m * 1.25)} мин` : '';
    return `<button type="button" class="ad-mapbtn" onclick="event.stopPropagation();openRouteMap('${escapeHtml(String(ad.id))}')"><i class="fas fa-map-location-dot"></i> Карта${sub}</button>`;
}
