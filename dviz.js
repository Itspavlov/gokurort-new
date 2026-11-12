// ============================================
// YuGi YuGi — «Курортный движ»
//  • лента карточек «найди компанию»: джипы, морская прогулка, волейбол, просто потусить;
//  • «Создать движ»: описание, время, место, до 5 фото; можно закрепить карточку из «Развлечений»;
//  • под карточкой — комментарии и кнопка «Я с вами».
// Работает поверх services.js (сжатие фото, api-хелперы).
// ============================================
const DV_PHOTOS = 5;
const DV_IDEAS = ['Джипы в горы', 'Морская прогулка', 'Волейбол на пляже', 'Просто потусить', 'Шашлыки у моря', 'Вечер на набережной'];
const DV_EMOJI = ['❤️', '🙌', '🔥', '👏', '😍', '😂', '😮', '😢'];
// Ключ Яндекса нужен только для поиска адреса; сами карты — Leaflet. Ограничьте ключ по домену в кабинете Яндекса.
const DV_YKEY = '677f374a-c483-4bb5-a09a-2f25fdcba35e';
let dvFeed = [];
let dvOpenId = null;       // открытая в шторке карточка
let dvCommId = null;       // карточка, чьи комментарии открыты

const dvEsc = (s) => escapeHtml(String(s == null ? '' : s));
const dvPrice = (a) => a && a.price ? Number(a.price).toLocaleString('ru-RU') + ' ₽' + (a.unit ? ' ' + a.unit : '') : '';
const dvAuthed = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() });
const dvGet = (path) => svApi(path, getToken() ? { headers: { Authorization: 'Bearer ' + getToken() } } : undefined);

// «сб, 12 июня · 10:00»
function dvWhen(w) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(w || '');
    if (!m) return '';
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' }) + ' · ' + m[4] + ':' + m[5];
}
const dvFmtCoords = (c) => c[0].toFixed(5) + ', ' + c[1].toFixed(5);

// ---------- карта ----------
// Карты (Яндекс, а если не загрузился — OpenStreetMap) подключает ymap.js; здесь только метка точки сбора.
function dvOpenMap(el, center, zoom, o) {
    o = o || {};
    return YM.open(el, { center, zoom, zoomControl: true }).then((map) => {
        if (!map) return null;
        let mk = null;
        const pin = '<div class="map-pin pin-meet"><i class="fas fa-flag"></i></div>';
        if (o.onClick) map.onClick(o.onClick);
        return {
            setPoint(c, z) {
                if (mk) mk.setCoords(c);
                else mk = map.addMarker({ coords: c, html: pin, size: [40, 40], draggable: !!o.draggable, onDrag: o.onDrag });
                if (z) map.setView(c, z);
            },
            clearPoint() { if (mk) { mk.remove(); mk = null; } },
            getZoom() { return map.getZoom(); }
        };
    });
}

// Поиск адреса. Сначала геокодер Яндекса (нужен ключ с продуктом «HTTP Геокодер»), если он не отвечает или ключ не подходит —
// OpenStreetMap (Nominatim, без ключа). Оба вызова идут из браузера человека.
function dvGeocode(q) {
    q = String(q || '').trim();
    if (!/архипо|осипов/i.test(q)) q = 'Архипо-Осиповка, ' + q;
    const ya = 'https://geocode-maps.yandex.ru/1.x/?apikey=' + DV_YKEY + '&format=json&results=1&lang=ru_RU&geocode=' + encodeURIComponent(q)
        + '&ll=' + MAP_DEFAULT[1] + ',' + MAP_DEFAULT[0] + '&spn=0.4,0.3&rspn=0';
    const osm = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=ru&countrycodes=ru&q=' + encodeURIComponent(q)
        + '&viewbox=' + (MAP_DEFAULT[1] - 0.3) + ',' + (MAP_DEFAULT[0] + 0.2) + ',' + (MAP_DEFAULT[1] + 0.3) + ',' + (MAP_DEFAULT[0] - 0.2);
    const viaYandex = () => fetch(ya).then((r) => { if (!r.ok) throw new Error('ya'); return r.json(); }).then((j) => {
        const m = j && j.response && j.response.GeoObjectCollection.featureMember[0];
        if (!m) return null;
        const pos = String(m.GeoObject.Point.pos).split(' ').map(Number);
        return { lat: pos[1], lng: pos[0], name: m.GeoObject.name };
    });
    const viaOsm = () => fetch(osm).then((r) => { if (!r.ok) throw new Error('osm'); return r.json(); }).then((j) => {
        const m = Array.isArray(j) && j[0];
        if (!m) return null;
        return { lat: Number(m.lat), lng: Number(m.lon), name: String(m.name || m.display_name || '').split(',')[0].trim() };
    });
    return viaYandex().then((r) => r || viaOsm(), () => viaOsm());
}

// ссылки «проложить маршрут»: из текущего положения человека до точки сбора
function dvRouteHTML(c) {
    const la = c[0], lo = c[1];
    return `<div class="dv-route">
        <a class="dv-rbtn main" href="https://yandex.ru/maps/?rtext=~${la}%2C${lo}&rtt=auto" target="_blank" rel="noopener"><i class="fas fa-route"></i> Маршрут · Яндекс</a>
        <a class="dv-rbtn" href="https://www.google.com/maps/dir/?api=1&destination=${la},${lo}" target="_blank" rel="noopener">Google</a>
        <a class="dv-rbtn" href="https://maps.apple.com/?daddr=${la},${lo}" target="_blank" rel="noopener">Apple</a></div>`;
}
// выбор точки на карте для других форм (развлечения): поиск адреса, «где я», тап по карте, метку можно двигать
function mapPickHTML(title, hintText) {
    return `<div class="form-h" style="margin:0 2px 8px">${title}</div>
        <div class="dv-mapsearch"><input id="mpAddr" maxlength="120" placeholder="Найти адрес или место" enterkeyhint="search" autocomplete="off">
            <button type="button" id="mpFind" aria-label="Найти"><i class="fas fa-magnifying-glass"></i></button>
            <button type="button" id="mpLoc" aria-label="Где я"><i class="fas fa-location-crosshairs"></i></button></div>
        <div class="dv-map" id="mpMap" data-noswipe></div>
        <div class="dv-maphint" id="mpHint" data-hint="${dvEsc(hintText)}"></div>`;
}
function mapPickInit(el, initial, onName) {
    let coords = initial && initial.length === 2 ? initial.slice() : null, pmap = null;
    const hint = el.querySelector('#mpHint');
    const round5 = (c) => [Math.round(c[0] * 1e5) / 1e5, Math.round(c[1] * 1e5) / 1e5];
    const paintHint = () => {
        hint.innerHTML = coords
            ? `<i class="fas fa-circle-check"></i> Точка отмечена · ${dvFmtCoords(coords)} <button type="button" data-unmark>Убрать</button>`
            : dvEsc(hint.dataset.hint);
    };
    const setPoint = (lat, lng, zoom) => {
        coords = round5([lat, lng]);
        if (pmap) pmap.setPoint(coords, zoom || Math.max(pmap.getZoom(), 16));
        paintHint();
    };
    dvOpenMap(el.querySelector('#mpMap'), coords || MAP_DEFAULT, coords ? 16 : 15, {
        draggable: true,
        onClick: (c) => { setPoint(c[0], c[1], Math.max(pmap ? pmap.getZoom() : 16, 16)); if (typeof haptic === 'function') haptic(8); },
        onDrag: (c) => { coords = round5(c); paintHint(); }
    }).then((m) => { pmap = m; if (m && coords) m.setPoint(coords, 16); });
    hint.addEventListener('click', (ev) => { if (!ev.target.closest('[data-unmark]')) return; coords = null; if (pmap) pmap.clearPoint(); paintHint(); });
    paintHint();
    const addr = el.querySelector('#mpAddr'), find = el.querySelector('#mpFind');
    const doFind = () => {
        const q = addr.value.trim();
        if (!q) return;
        find.disabled = true;
        dvGeocode(q).then((r) => {
            find.disabled = false;
            if (!r) { showToast('Не нашли такое место — отметьте точку на карте'); return; }
            setPoint(r.lat, r.lng, 17);
            if (onName) onName(r.name);
        }).catch(() => { find.disabled = false; showToast('Поиск адреса сейчас недоступен — отметьте точку на карте'); });
    };
    find.addEventListener('click', doFind);
    addr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); doFind(); } });
    el.querySelector('#mpLoc').addEventListener('click', () => {
        if (!navigator.geolocation) { showToast('Геолокация недоступна'); return; }
        navigator.geolocation.getCurrentPosition((pos) => setPoint(pos.coords.latitude, pos.coords.longitude, 17),
            () => showToast('Не удалось определить, где вы. Отметьте точку на карте'), { enableHighAccuracy: true, timeout: 8000 });
    });
    return { get: () => coords };
}
// окно «Карта» у карточки услуги: где причал или куда подойти, и ссылки на маршрут
function openServiceMap(s) {
    if (!s || !s.coords) { showToast('Автор не отметил точку на карте'); return; }
    const e = escapeHtml;
    openSheet('Карта · ' + e(s.title || 'услуга'), `
        ${s.place ? `<p class="sv-where"><i class="fas fa-flag"></i><span>${e(s.place)}</span></p>` : ''}
        <div class="dv-map" id="svViewMap" data-noswipe></div>${dvRouteHTML(s.coords)}`, (el) => {
        dvOpenMap(el.querySelector('#svViewMap'), s.coords, 16).then((m) => { if (m) m.setPoint(s.coords); });
    });
}
const dvPeople = (e) => e.max ? `${e.joins} из ${e.max}` : (e.joins ? String(e.joins) : '');

// ---------- экран ----------
let dvTab = 'dviz', dvSvcCat = '', dvSvcQ = '';

function dvDockHTML() {
    if (dvTab === 'svc') return '<div class="dock-actions svc-dock"><button type="button" class="dv-svc-add" data-sv="new"><i class="fas fa-plus"></i> Разместить услугу</button></div>';
    return '<div class="dock-actions dv-create-dock"><button type="button" class="dock-btn main" id="dvCreate"><i class="fas fa-plus"></i> Создать движ</button></div>';
}
function dvPaneHTML() {
    if (dvTab === 'svc') {
        return `<div class="dv-svc" id="dvSvc">
            <div class="dv-svc-bar">
                <button type="button" class="dv-sbtn${dvSvcQ ? ' on' : ''}" id="dvSBtn" aria-label="Поиск" aria-expanded="${dvSvcQ ? 'true' : 'false'}"><i class="fas fa-magnifying-glass"></i></button>
                <div class="dv-cat"><button type="button" class="dv-cat-btn" id="dvCatBtn" aria-haspopup="listbox" aria-expanded="false"><span id="dvCatLbl"></span><i class="fas fa-chevron-down"></i></button><div class="dv-cat-menu" id="dvCatMenu" role="listbox" hidden></div></div>
            </div>
            <label class="dv-sq" id="dvSQ"${dvSvcQ ? '' : ' hidden'}><i class="fas fa-magnifying-glass"></i><input id="dvSvcQ" type="search" enterkeyhint="search" autocomplete="off" maxlength="40" placeholder="Катер, джипы, дельфины…" value="${dvEsc(dvSvcQ)}"></label>
            <div class="sv-grid" id="dvSvcGrid"></div></div>`;
    }
    return '<div class="dv-feed" id="dvFeed"><div class="dv-empty"><i class="fas fa-spinner fa-spin"></i><b>Загружаю…</b></div></div>';
}
function dvSetTab(tab) {
    dvTab = tab === 'svc' ? 'svc' : 'dviz';
    const scr = document.getElementById('group-screen');
    if (!scr) return;
    scr.querySelectorAll('.dv-tab').forEach(b => { const on = b.dataset.dvt === dvTab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    scr.querySelector('#dvPane').innerHTML = dvPaneHTML();
    scr.querySelector('#dvDock').innerHTML = dvDockHTML();
    scr.querySelector('#dvDock').classList.toggle('svc', dvTab === 'svc');
    if (dvTab === 'svc') { dvBindSvc(); dvPaintSvc(); dvLoadSvc(); }
    else { const f = scr.querySelector('#dvFeed'); f.addEventListener('click', onFeedClick); if (dvFeed.length) paintDviz(); loadDviz(); }
}
function openDvizScreen(tab) {
    if (typeof socket !== 'undefined' && socket && currentRoom) socket.emit('leave-room', currentRoom);
    currentRoom = null; currentDm = null; currentGroup = null;
    tabContents.forEach(section => section.style.display = 'none');
    let screen = document.getElementById('group-screen');
    if (!screen) {
        screen = document.createElement('section');
        screen.id = 'group-screen'; screen.className = 'group-screen';
        document.getElementById('appMain').appendChild(screen);
    }
    dvTab = tab === 'svc' ? 'svc' : 'dviz';
    screen.innerHTML = `
        <div class="chat-header room-head">
            <button class="chat-back-btn" onclick="closeGroup()" aria-label="Назад"><i class="fas fa-arrow-left"></i></button>
            <div class="chat-header-info">
                <div class="chat-header-title">Курортный движ</div>
                <div class="chat-header-subtitle">найди компанию на отдых</div>
            </div>
        </div>
        <div class="seek-bar dv-tabs"><div class="seek-tabs" role="tablist" aria-label="Раздел">
            <button type="button" role="tab" class="seek-tab dv-tab" data-dvt="dviz"><span>Движ</span><b>отдыхайте вместе</b></button>
            <button type="button" role="tab" class="seek-tab dv-tab" data-dvt="svc"><span>Готовые услуги</span><b>морские прогулки, экскурсии и др.</b></button>
        </div></div>
        <div class="dv-pane" id="dvPane"></div>
        <div class="cards-dock dv-dock" id="dvDock"></div>`;
    screen.style.display = 'flex';
    screen.querySelector('.dv-tabs').addEventListener('click', (ev) => { const b = ev.target.closest('.dv-tab'); if (b && b.dataset.dvt !== dvTab) dvSetTab(b.dataset.dvt); });
    screen.querySelector('#dvDock').addEventListener('click', (ev) => {
        if (ev.target.closest('#dvCreate')) openDvizForm();
    });
    dvSetTab(dvTab);
}

// ---------- «Готовые услуги» внутри движа ----------
function dvBindSvc() {
    const q = document.getElementById('dvSvcQ'), btn = document.getElementById('dvCatBtn'), menu = document.getElementById('dvCatMenu');
    if (!q || !btn || !menu) return;
    const sb = document.getElementById('dvSBtn'), sq = document.getElementById('dvSQ');
    sb.addEventListener('click', () => {
        const open = sq.hidden; sq.hidden = !open; sb.setAttribute('aria-expanded', String(open));
        if (open) q.focus(); else { q.value = ''; dvSvcQ = ''; sb.classList.remove('on'); dvPaintSvc(); }
    });
    q.addEventListener('input', () => { dvSvcQ = q.value.trim().toLowerCase(); sb.classList.toggle('on', !!dvSvcQ); dvPaintSvc(); });
    q.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); q.blur(); } });
    const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    btn.addEventListener('click', (ev) => { ev.stopPropagation(); const open = menu.hidden; menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); });
    menu.addEventListener('click', (ev) => {
        const it = ev.target.closest('[data-cat]'); if (!it) return;
        dvSvcCat = it.dataset.cat; close(); dvPaintSvc();
    });
    document.getElementById('dvSvc').addEventListener('click', (ev) => { if (!ev.target.closest('.dv-cat')) close(); });
}
function dvLoadSvc() {
    svApi('/api/services').then(({ d }) => { if (d && d.ok) serviceFeed = d.services || []; dvPaintSvc(); }).catch(() => dvPaintSvc());
}
function dvRefreshSvc() { if (dvTab === 'svc' && document.getElementById('dvSvc')) dvLoadSvc(); }
function dvPaintSvc() {
    const grid = document.getElementById('dvSvcGrid');
    if (!grid) return;
    const counts = {};
    serviceFeed.forEach(s => { const t = s.tag || 'other'; counts[t] = (counts[t] || 0) + 1; });
    const lbl = document.getElementById('dvCatLbl');
    if (lbl) lbl.textContent = dvSvcCat ? (SV_TAGS[dvSvcCat] || 'Категория') : 'Все категории';
    const menu = document.getElementById('dvCatMenu');
    if (menu) {
        const item = (t, label, icon, n) => `<button type="button" role="option" class="dv-cat-item ${dvSvcCat === t ? 'on' : ''}" data-cat="${t}" aria-selected="${dvSvcCat === t}"><i class="fas ${icon}"></i><span>${label}</span><b>${n || ''}</b></button>`;
        menu.innerHTML = item('', 'Все категории', 'fa-border-all', serviceFeed.length) + Object.entries(SV_TAGS).map(([t, l]) => item(t, l, SV_ICONS[t], counts[t])).join('');
    }
    const list = serviceFeed.filter(s => (!dvSvcCat || (s.tag || 'other') === dvSvcCat)
        && (!dvSvcQ || ((s.title || '') + ' ' + (SV_TAGS[s.tag] || '') + ' ' + (s.city || '')).toLowerCase().includes(dvSvcQ)));
    grid.innerHTML = list.length ? list.map(serviceFeedHTML).join('')
        : `<div class="dv-empty" style="grid-column:1/-1"><i class="fas fa-ship"></i><b>${serviceFeed.length ? 'Ничего не нашлось' : 'Пока нет готовых услуг'}</b><span>${serviceFeed.length ? 'Попробуйте другое слово или категорию.' : 'Катаете на катере или водите экскурсии? Разместите услугу кнопкой внизу.'}</span></div>`;
}

const _openGroupDv = openGroup;
// «Развлечения» переехали внутрь движа: вкладка «Готовые услуги»
openGroup = function (id) { return id === 'dating' ? openDvizScreen('dviz') : id === 'services' ? openDvizScreen('svc') : _openGroupDv.apply(this, arguments); };

function loadDviz() {
    dvGet('/api/dviz').then(({ d }) => {
        if (d && d.ok) dvFeed = d.events || [];
        paintDviz();
    }).catch(() => { const f = document.getElementById('dvFeed'); if (f && !dvFeed.length) f.innerHTML = '<div class="dv-empty"><i class="fas fa-wifi"></i><b>Нет связи с сервером</b></div>'; });
}

// значок и цвет для карточки без фото — по ключевым словам в названии
function dvArt(title) {
    const t = String(title || '').toLowerCase();
    const icon = /джип|внедорож|квадр|багги/.test(t) ? 'fa-truck-monster' : /море|морск|катер|яхт|лодк|парус|пляж/.test(t) ? 'fa-sailboat'
        : /волейбол|мяч|футбол|спорт/.test(t) ? 'fa-volleyball' : /шашлык|барбекю|мангал|костёр|костер/.test(t) ? 'fa-fire-burner'
        : /гор|поход|водопад|тропа|экскурс/.test(t) ? 'fa-mountain-sun' : 'fa-champagne-glasses';
    let h = 0; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) % 6;
    return { icon, g: h };
}

function dvCardHTML(e, i) {
    const acc = typeof getAccount === 'function' ? getAccount() : null;
    const mine = !!(acc && acc.id === e.ownerId);
    const cn = e.comments || 0, joins = e.joins || 0;
    const pres = reqPresenceHTML({ mine, ownerOnline: e.ownerOnline, ownerSeen: e.ownerSeen });
    const meta = [
        e.when ? `<span><i class="far fa-calendar"></i>${dvEsc(dvWhen(e.when))}</span>` : '',
        e.place ? `<span><i class="fas fa-location-dot"></i>${dvEsc(e.place)}</span>` : (e.coords ? '<span><i class="fas fa-map-location-dot"></i>Точка на карте</span>' : '')
    ].join('');
    // небольшие картинки под текстом: превью и счётчик остальных фото
    const more = Math.max(0, (e.photoCount || (e.thumb ? 1 : 0)) - 1);
    const pics = e.thumb ? `<div class="dvb-pics"><img src="${dvEsc(e.thumb)}" alt="" loading="lazy">${more ? `<span class="dvb-more">+${more}</span>` : ''}</div>` : '';
    const talk = [cn ? `<i class="far fa-comments"></i>${cn} ${plural(cn, 'обсуждает', 'обсуждают', 'обсуждают')}` : '<i class="far fa-comments"></i>пока без обсуждений',
        joins ? `<i class="fas fa-user-group"></i>${dvEsc(dvPeople(e))} ${e.max ? '' : plural(joins, 'идёт', 'идут', 'идут')}` : ''].filter(Boolean).join('<em></em>');
    const join = mine ? '<span class="dv2-own"><i class="fas fa-crown"></i> Ваш движ</span>'
        : `<button type="button" class="main dv2-join ${e.joined ? 'on' : ''}" data-dv="join">${e.joined ? 'Вы идёте <i class="fas fa-check"></i>' : 'Я с вами'}</button>`;
    // «облачко»: так видно, что это пишут обычные туристы, а не объявление
    return `<div class="dv2 cloud${mine ? ' mine' : ''}" data-id="${dvEsc(e.id)}">
        <div class="dv-bubble">
            <div class="rq-top"><div class="rq-ava" data-avn="${avEsc(e.ownerName)}" style="background:${dmColor(e.ownerName)}">${avInner(e.ownerName)}</div>
                <div class="rq-who"><b>${dvEsc(mine ? 'Вы' : e.ownerName)}${e.verified ? ' <i class="fas fa-circle-check pf-check"></i>' : ''}</b>${pres || `<small>${fmtAgo(e.created)}</small>`}</div></div>
            <div class="dvb-title">${dvEsc(e.title)}</div>
            ${e.text ? `<p class="dvb-text">${dvEsc(e.text)}</p>` : ''}
            ${meta ? `<div class="dvb-meta">${meta}</div>` : ''}
            ${pics}
            <div class="dvb-talk">${talk}</div>
        </div>
        <div class="dvb-under"><button type="button" class="dvb-comm" data-dv="comments"><i class="far fa-comment"></i> ${cn ? 'Комментарии · ' + cn : 'Комментировать'}</button>${join}</div></div>`;
}

function dvAttachHTML(a) {
    return `<div class="dv-attach" data-dv="service" data-sid="${dvEsc(a.id)}">
        <div class="dv-attach-img">${a.thumb ? `<img src="${dvEsc(a.thumb)}" alt="">` : '<i class="fas fa-ship"></i>'}</div>
        <div><small>Закреплено из «Развлечений»</small><b>${dvEsc(a.title)}</b>${dvPrice(a) ? `<span>${dvEsc(dvPrice(a))}</span>` : ''}</div></div>`;
}

function paintDviz() {
    const box = document.getElementById('dvFeed');
    if (!box) return;
    box.innerHTML = dvFeed.length ? dvFeed.map(dvCardHTML).join('')
        : `<div class="dv-empty"><i class="fas fa-champagne-glasses"></i><b>Пока тихо</b><span>Создайте движ: позовите компанию на джипы, морскую прогулку, волейбол или просто потусить.</span></div>`;
}

function onFeedClick(ev) {
    const card = ev.target.closest('.dv-card, .dv2');
    if (!card) return;
    const id = card.dataset.id;
    const act = ev.target.closest('[data-dv]');
    if (act && act.dataset.dv === 'join') { dvToggleJoin(id); return; }
    if (act && act.dataset.dv === 'comments') { openDvizComments(id); return; }
    if (act && act.dataset.dv === 'service') { openServiceView(act.dataset.sid); return; }
    openDvizView(id);
}

// ---------- отклик ----------
function dvToggleJoin(id, after) {
    loginRequired(() => {
        svApi('/api/dviz/' + encodeURIComponent(id) + '/join', { method: 'POST', headers: dvAuthed(), body: '{}' }).then(({ status, d }) => {
            if (status === 401) { clearSession(); showToast('Сессия истекла. Войдите снова.'); return; }
            if (!d || !d.ok) { showToast((d && d.message) || 'Не получилось'); return; }
            if (typeof haptic === 'function') haptic(10);
            showToast(d.joined ? 'Вы идёте! Автор получил уведомление' : 'Отклик снят');
            const e = dvFeed.find(x => x.id === id);
            if (e) { e.joined = d.joined; e.joins = d.joins; paintDviz(); }
            after && after();
        }).catch(() => showToast('Нет связи с сервером'));
    });
}

// ---------- комментарии ----------
function dvCommentsHTML(e) {
    const acc = typeof getAccount === 'function' ? getAccount() : null;
    const list = e.commentList || [];
    return list.length ? list.map(c => {
        const can = acc && (acc.id === c.userId || acc.id === e.ownerId);
        return `<div class="dv-comment" data-cid="${dvEsc(c.id)}"><div class="chat-avatar" data-avn="${avEsc(c.name)}" style="background:${dmColor(c.name)}">${avInner(c.name)}</div>
            <div class="dv-cbody"><div class="dv-chead"><b>${dvEsc(c.name)}${c.userId === e.ownerId ? ' <em>автор</em>' : ''}</b><small>${fmtAgo(c.time)}</small>${can ? `<button type="button" data-cdel="${dvEsc(c.id)}" aria-label="Удалить комментарий"><i class="fas fa-trash"></i></button>` : ''}</div>
            <p>${dvEsc(c.text)}</p></div></div>`;
    }).join('') : '<div class="dv-nocomm"><i class="far fa-comment"></i><b>Комментариев пока нет</b><span>Спросите, что взять с собой и где встречаться.</span></div>';
}

function closeDvizComments() {
    const el = document.getElementById('dvComm');
    if (el) el.remove();
    dvCommId = null;
}

// Окно комментариев снизу, как в Instagram: список, под ним ряд смайлов и строка ввода
function openDvizComments(id) {
    closeDvizComments();
    dvCommId = id;
    const acc = typeof getAccount === 'function' ? getAccount() : null;
    const el = document.createElement('div');
    el.id = 'dvComm'; el.className = 'sheet-overlay dv-comm-overlay';
    el.innerHTML = `<div class="sheet-panel dv-comm-panel">
        <div class="sheet-grab"></div>
        <div class="dv-comm-head"><div class="sheet-title">Комментарии <span id="dvCCount"></span></div>
            <button type="button" data-cclose aria-label="Закрыть"><i class="fas fa-xmark"></i></button></div>
        <div class="dv-comments dv-clist" id="dvCList"><div class="dv-nocomm"><i class="fas fa-spinner fa-spin"></i></div></div>
        <div class="dv-emoji" id="dvEmoji">${DV_EMOJI.map(m => `<button type="button" tabindex="-1">${m}</button>`).join('')}</div>
        <form class="dv-write" id="dvWrite">
            <span class="chat-avatar"${acc ? ` data-avn="${avEsc(acc.name)}"` : ''} style="background:${acc ? dmColor(acc.name) : 'rgba(128,128,128,.4)'}">${acc ? avInner(acc.name) : '<i class="fas fa-user"></i>'}</span>
            <input id="dvText" maxlength="400" placeholder="Добавьте комментарий…" autocomplete="off" enterkeyhint="send">
            <button type="submit" aria-label="Отправить" disabled><i class="fas fa-paper-plane"></i></button>
        </form></div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('open'));
    const panel = el.querySelector('.dv-comm-panel'), inp = el.querySelector('#dvText'), send = el.querySelector('#dvWrite button');
    const close = () => {
        el.style.transition = 'opacity .2s'; el.style.opacity = '0';
        panel.style.transition = 'transform .22s ease-out'; panel.style.transform = 'translateY(100%)';
        setTimeout(() => { if (document.getElementById('dvComm') === el) closeDvizComments(); }, 200);
    };
    el.addEventListener('click', (ev) => {
        if (ev.target === el || ev.target.closest('[data-cclose]')) { close(); return; }
        const cdel = ev.target.closest('[data-cdel]');
        if (cdel) {
            svApi('/api/dviz/' + encodeURIComponent(id) + '/comments/' + encodeURIComponent(cdel.dataset.cdel), { method: 'DELETE', headers: dvAuthed() })
                .then(({ d }) => { if (d && d.ok) dvRefreshOpen(); else showToast((d && d.message) || 'Не удалось удалить'); })
                .catch(() => showToast('Нет связи с сервером'));
        }
    });
    // смахнуть вниз за ручку или заголовок
    let y0 = 0, dy = 0, drag = false;
    const head = el.querySelectorAll('.sheet-grab, .dv-comm-head');
    head.forEach(h => {
        h.addEventListener('touchstart', (e) => { if (e.touches.length !== 1 || e.target.closest('button')) return; drag = true; y0 = e.touches[0].clientY; dy = 0; panel.style.transition = 'none'; }, { passive: true });
        h.addEventListener('touchmove', (e) => { if (!drag) return; dy = Math.max(0, e.touches[0].clientY - y0); panel.style.transform = 'translateY(' + dy + 'px)'; if (e.cancelable) e.preventDefault(); }, { passive: false });
        const end = () => { if (!drag) return; drag = false; if (dy > 90) close(); else { panel.style.transition = 'transform .2s'; panel.style.transform = ''; } };
        h.addEventListener('touchend', end); h.addEventListener('touchcancel', end);
    });
    // смайл — в позицию курсора; фокус из строки ввода не уходим, чтобы клавиатура не закрывалась
    el.querySelector('#dvEmoji').addEventListener('pointerdown', (ev) => ev.preventDefault());
    el.querySelector('#dvEmoji').addEventListener('click', (ev) => {
        const b = ev.target.closest('button'); if (!b) return;
        if (typeof haptic === 'function') haptic(8);
        const s0 = inp.selectionStart == null ? inp.value.length : inp.selectionStart, s1 = inp.selectionEnd == null ? s0 : inp.selectionEnd;
        if ((inp.value.length - (s1 - s0) + b.textContent.length) > 400) return;
        inp.value = inp.value.slice(0, s0) + b.textContent + inp.value.slice(s1);
        const pos = s0 + b.textContent.length;
        try { inp.setSelectionRange(pos, pos); } catch (_) {}
        inp.focus();
        send.disabled = !inp.value.trim();
    });
    inp.addEventListener('input', () => { send.disabled = !inp.value.trim(); });
    el.querySelector('#dvWrite').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const text = inp.value.trim();
        if (!text) return;
        loginRequired(() => {
            inp.disabled = true; send.disabled = true;
            svApi('/api/dviz/' + encodeURIComponent(id) + '/comments', { method: 'POST', headers: dvAuthed(), body: JSON.stringify({ text }) }).then(({ status, d }) => {
                inp.disabled = false;
                if (status === 401) { clearSession(); showToast('Сессия истекла. Войдите снова.'); send.disabled = !inp.value.trim(); return; }
                if (!d || !d.ok) { showToast((d && d.message) || 'Не удалось отправить'); send.disabled = !inp.value.trim(); return; }
                inp.value = ''; send.disabled = true;
                inp.focus();
                dvRefreshOpen(true);
            }).catch(() => { inp.disabled = false; send.disabled = !inp.value.trim(); showToast('Нет связи с сервером'); });
        });
    });
    dvRefreshOpen();
}

// ---------- просмотр: фото, описание, карта, участники ----------
function openDvizView(id) {
    dvGet('/api/dviz/' + encodeURIComponent(id)).then(({ d }) => {
        if (!d || !d.ok) { showToast((d && d.message) || 'Движ недоступен'); loadDviz(); return; }
        const e = d.event;
        const acc = typeof getAccount === 'function' ? getAccount() : null;
        const mine = !!(acc && acc.id === e.ownerId);
        dvOpenId = e.id;
        const gal = (e.photos || []).length ? `<div class="sv-gallery dv-gallery">${e.photos.map((p, i) => `<img src="${dvEsc(p)}" alt="Фото ${i + 1}">`).join('')}</div>` : '';
        openSheet(dvEsc(e.title), `
            ${gal}
            <div class="dv-meta big">
                ${e.when ? `<span><i class="fas fa-clock"></i>${dvEsc(dvWhen(e.when))}</span>` : ''}
                ${e.place ? `<span><i class="fas fa-location-dot"></i>${dvEsc(e.place)}</span>` : ''}
                ${dvPeople(e) ? `<span><i class="fas fa-user-group"></i>${dvEsc(dvPeople(e))}</span>` : ''}
            </div>
            ${e.text ? `<p class="sv-view-text">${dvEsc(e.text)}</p>` : ''}
            ${e.coords ? `<div class="form-h" style="margin:12px 2px 8px">Точка сбора</div>
                <div class="dv-map" id="dvViewMap" data-noswipe></div>${dvRouteHTML(e.coords)}` : ''}
            ${e.attached ? dvAttachHTML(e.attached) : ''}
            <button type="button" class="sv-owner" data-dv-owner><span class="chat-avatar" data-avn="${avEsc(e.ownerName)}" style="background:${dmColor(e.ownerName)}">${avInner(e.ownerName)}</span>
                <span><b>${dvEsc(mine ? 'Вы' : e.ownerName)}</b><small>Организатор · открыть профиль</small></span><i class="fas fa-chevron-right"></i></button>
            <div class="dv-going" id="dvGoing"></div>
            <div class="dv-actions" id="dvActions"></div>
            <button type="button" class="dv-commbtn" data-dv-comm><i class="far fa-comment"></i><span>Комментарии <b id="dvCN">${e.comments || 0}</b></span><i class="fas fa-chevron-up"></i></button>`, (el) => {
            const paintTop = (ev) => {
                const g = el.querySelector('#dvGoing');
                const jl = ev.joinList || [];
                g.innerHTML = jl.length ? `<div class="dv-going-h">Идут (${jl.length}${ev.max ? ' из ' + ev.max : ''})</div><div class="dv-chips">${jl.map(j => `<span class="dv-chip"><i data-avn="${avEsc(j.name)}" style="background:${dmColor(j.name)}">${avInner(j.name)}</i>${dvEsc(j.name)}</span>`).join('')}</div>` : '';
                el.querySelector('#dvActions').innerHTML = mine
                    ? '<button type="button" class="ghost-btn wide-btn dv-del" data-dv-del><i class="fas fa-trash"></i> Удалить движ</button>'
                    : `<button type="button" class="primary-btn wide-btn" data-dv-join>${ev.joined ? '<i class="fas fa-check"></i> Вы идёте — отменить' : '<i class="fas fa-hand"></i> Я с вами'}</button>`;
                const n = el.querySelector('#dvCN'); if (n) n.textContent = ev.comments || 0;
            };
            paintTop(e);
            el._dv = { id: e.id, paintTop, owner: e.ownerId, e };
            if (e.coords) {
                dvOpenMap(el.querySelector('#dvViewMap'), e.coords, 16).then((m) => { if (m) m.setPoint(e.coords); });
            }
            el.querySelector('[data-dv-owner]').onclick = () => { closeSheet(); if (typeof openUserProfile === 'function') openUserProfile({ id: e.ownerId, name: e.ownerName }); };
            const att = el.querySelector('[data-dv="service"]');
            if (att) att.onclick = () => openServiceView(att.dataset.sid);
            el.addEventListener('click', (ev) => {
                if (ev.target.closest('[data-dv-join]')) { dvToggleJoin(e.id, () => dvRefreshOpen()); return; }
                if (ev.target.closest('[data-dv-del]')) { dvDelete(e.id); return; }
                if (ev.target.closest('[data-dv-comm]')) { openDvizComments(e.id); return; }
            });
        });
    }).catch(() => showToast('Нет связи с сервером'));
}

// обновить открытые окна (шторка движа, комментарии) и ленту без полной перерисовки
function dvRefreshOpen(scrollDown) {
    const sheet = document.getElementById('sheet');
    const st = sheet && sheet._dv;
    const id = dvCommId || (st && st.id);
    if (!id) return;
    dvGet('/api/dviz/' + encodeURIComponent(id)).then(({ d }) => {
        if (!d || !d.ok) return;
        const e = d.event;
        if (st && st.id === e.id) st.paintTop(e);
        const box = document.getElementById('dvCList');
        if (box && dvCommId === e.id) {
            const keep = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
            box.innerHTML = dvCommentsHTML(e);
            const cnt = document.getElementById('dvCCount'); if (cnt) cnt.textContent = e.comments ? e.comments : '';
            if (scrollDown || keep) box.scrollTop = box.scrollHeight;
        }
        const f = dvFeed.find(x => x.id === e.id);
        if (f) { f.comments = e.comments; f.joins = e.joins; f.joined = e.joined; paintDviz(); }
    }).catch(() => {});
}

function dvDelete(id) {
    if (!confirm('Удалить этот движ вместе с комментариями?')) return;
    svApi('/api/dviz/' + encodeURIComponent(id), { method: 'DELETE', headers: dvAuthed() }).then(({ d }) => {
        if (d && d.ok) { closeSheet(); closeDvizComments(); showToast('Движ удалён'); loadDviz(); }
        else showToast((d && d.message) || 'Не удалось удалить');
    }).catch(() => showToast('Нет связи с сервером'));
}

// сервер сообщает: кто-то создал, удалил или прокомментировал движ
function onDvizChanged(d) {
    if (document.getElementById('dvFeed')) loadDviz();
    if (d && ((dvOpenId && d.id === dvOpenId) || (dvCommId && d.id === dvCommId))) {
        if (d.removed) { closeSheet(); closeDvizComments(); showToast('Этот движ удалён'); } else dvRefreshOpen();
    }
}

// ---------- создать движ ----------
function openDvizForm(opts) {
    opts = opts || {};
    loginRequired(() => {
        let attach = opts.attach ? { id: opts.attach.id, title: opts.attach.title, price: opts.attach.price, unit: opts.attach.unit, thumb: opts.attach.thumb, ownerName: opts.attach.ownerName } : null;
        const photos = [];
        const e = dvEsc;
        const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        const minNow = now.toISOString().slice(0, 16);
        openSheet('Создать движ', `
            <p class="auth-note" style="margin:0 4px 12px">Позовите компанию: джипы, морская прогулка, волейбол или просто потусить. Желающие откликнутся и напишут в комментариях.</p>
            <div id="dvAttachBox"></div>
            <div class="dv-ideas" id="dvIdeas">${DV_IDEAS.map(t => `<button type="button">${e(t)}</button>`).join('')}</div>
            <label class="field"><span>Что за движ</span><input id="dvTitle" maxlength="80" placeholder="Например: Едем на джипах к водопадам" value="${e(opts.title || (attach ? 'Идём: ' + attach.title : ''))}"></label>
            <label class="field"><span>Описание</span><textarea id="dvText" rows="4" maxlength="1000" placeholder="Кого ищете, что берут с собой, сколько стоит, как добраться">${e(opts.text || '')}</textarea></label>
            <label class="field"><span>Когда</span><input id="dvWhen" type="datetime-local" min="${minNow}"></label>
            <label class="field"><span>Место встречи</span><input id="dvPlace" maxlength="120" placeholder="Например: у фонтана на набережной"></label>
            <div class="form-h" style="margin:0 2px 8px">Точка сбора на карте</div>
            <div class="dv-mapsearch"><input id="dvAddr" maxlength="120" placeholder="Найти адрес или место" enterkeyhint="search" autocomplete="off">
                <button type="button" id="dvFind" aria-label="Найти"><i class="fas fa-magnifying-glass"></i></button>
                <button type="button" id="dvLoc" aria-label="Где я"><i class="fas fa-location-crosshairs"></i></button></div>
            <div class="dv-map" id="dvPickMap" data-noswipe></div>
            <div class="dv-maphint" id="dvMapHint"></div>
            <label class="field"><span>Сколько человек нужно</span><input id="dvMax" type="number" inputmode="numeric" min="2" max="99" placeholder="Можно пусто"></label>
            <div class="form-h" style="margin:0 2px 8px">Фото · до ${DV_PHOTOS}</div>
            <div class="photo-grid sv-photo-grid" id="dvPhotos"></div>
            <input type="file" id="dvFile" accept="image/*" multiple hidden>
            <div class="auth-error" id="dvErr"></div>
            <button class="primary-btn wide-btn" id="dvSave" type="button"><i class="fas fa-champagne-glasses"></i> Опубликовать движ</button>`, (el) => {
            const grid = el.querySelector('#dvPhotos'), file = el.querySelector('#dvFile'), err = el.querySelector('#dvErr'), btn = el.querySelector('#dvSave');
            const paintAttach = () => {
                el.querySelector('#dvAttachBox').innerHTML = attach ? `<div class="dv-attach pinned">
                    <div class="dv-attach-img">${attach.thumb ? `<img src="${e(attach.thumb)}" alt="">` : '<i class="fas fa-ship"></i>'}</div>
                    <div><small><i class="fas fa-thumbtack"></i> Закреплено из «Развлечений»</small><b>${e(attach.title)}</b>${dvPrice(attach) ? `<span>${e(dvPrice(attach))}</span>` : ''}</div>
                    <button type="button" aria-label="Открепить" data-unpin><i class="fas fa-xmark"></i></button></div>` : '';
            };
            paintAttach();
            // ---- карта: тап по карте ставит метку, метку можно двигать ----
            let coords = null, pmap = null;
            const hint = el.querySelector('#dvMapHint');
            const round5 = (c) => [Math.round(c[0] * 1e5) / 1e5, Math.round(c[1] * 1e5) / 1e5];
            const paintHint = () => {
                hint.innerHTML = coords
                    ? `<i class="fas fa-circle-check"></i> Точка отмечена · ${dvFmtCoords(coords)} <button type="button" data-unmark>Убрать</button>`
                    : 'Нажмите на карту — отметьте, где встречаетесь. Люди увидят точное место и смогут проложить маршрут.';
            };
            const setPoint = (lat, lng, zoom) => {
                coords = round5([lat, lng]);
                if (pmap) pmap.setPoint(coords, zoom || Math.max(pmap.getZoom(), 16));
                paintHint();
            };
            dvOpenMap(el.querySelector('#dvPickMap'), MAP_DEFAULT, 15, {
                draggable: true,
                onClick: (c) => { setPoint(c[0], c[1], Math.max(pmap ? pmap.getZoom() : 16, 16)); if (typeof haptic === 'function') haptic(8); },
                onDrag: (c) => { coords = round5(c); paintHint(); }
            }).then((m) => { pmap = m; if (m && coords) m.setPoint(coords, 16); });
            hint.addEventListener('click', (ev) => {
                if (!ev.target.closest('[data-unmark]')) return;
                coords = null; if (pmap) pmap.clearPoint(); paintHint();
            });
            paintHint();
            const addr = el.querySelector('#dvAddr'), find = el.querySelector('#dvFind');
            const doFind = () => {
                const q = addr.value.trim();
                if (!q) return;
                find.disabled = true;
                dvGeocode(q).then((r) => {
                    find.disabled = false;
                    if (!r) { showToast('Не нашли такое место — отметьте точку на карте'); return; }
                    setPoint(r.lat, r.lng, 17);
                    const pl = el.querySelector('#dvPlace'); if (pl && !pl.value.trim()) pl.value = r.name;
                }).catch(() => { find.disabled = false; showToast('Поиск адреса сейчас недоступен — отметьте точку на карте'); });
            };
            find.addEventListener('click', doFind);
            addr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); doFind(); } });
            el.querySelector('#dvLoc').addEventListener('click', () => {
                if (!navigator.geolocation) { showToast('Геолокация недоступна'); return; }
                navigator.geolocation.getCurrentPosition((pos) => setPoint(pos.coords.latitude, pos.coords.longitude, 17),
                    () => showToast('Не удалось определить, где вы. Отметьте точку на карте'), { enableHighAccuracy: true, timeout: 8000 });
            });
            el.querySelector('#dvAttachBox').addEventListener('click', (ev) => { if (ev.target.closest('[data-unpin]')) { attach = null; paintAttach(); } });
            el.querySelector('#dvIdeas').addEventListener('click', (ev) => {
                const b = ev.target.closest('button'); if (!b) return;
                const t = el.querySelector('#dvTitle'); t.value = b.textContent; t.focus();
            });
            const paint = () => {
                grid.innerHTML = photos.map((src, i) => `<div class="photo-tile ${i === 0 ? 'cover' : ''}"><img src="${e(src)}" alt=""><button type="button" data-del="${i}" aria-label="Убрать фото"><i class="fas fa-xmark"></i></button></div>`).join('')
                    + (photos.length < DV_PHOTOS ? '<button type="button" class="photo-add"><i class="fas fa-camera"></i><span>Добавить</span></button>' : '');
            };
            paint();
            grid.addEventListener('click', (ev) => {
                const del = ev.target.closest('[data-del]');
                if (del) { photos.splice(Number(del.dataset.del), 1); paint(); return; }
                if (ev.target.closest('.photo-add')) file.click();
            });
            file.addEventListener('change', async () => {
                const list = Array.from(file.files || []).slice(0, DV_PHOTOS - photos.length);
                file.value = '';
                for (const f of list) { try { photos.push(await svPhoto(f)); } catch (_) { err.textContent = 'Не удалось обработать фото'; } }
                paint();
            });
            btn.addEventListener('click', async () => {
                const v = (id) => el.querySelector(id).value.trim();
                if (!v('#dvTitle')) { err.textContent = 'Напишите, что за движ'; return; }
                err.textContent = ''; btn.disabled = true;
                let thumb = '';
                try { if (photos[0]) thumb = await svThumb(photos[0]); } catch (_) {}
                const body = { title: v('#dvTitle'), text: v('#dvText'), when: v('#dvWhen'), max: v('#dvMax'), place: v('#dvPlace'), photos, thumb, coords: coords || undefined, attach: attach ? { id: attach.id } : undefined };
                try {
                    const { status, d } = await svApi('/api/dviz', { method: 'POST', headers: dvAuthed(), body: JSON.stringify(body) });
                    if (status === 401) { clearSession(); err.textContent = 'Сессия истекла. Войдите снова.'; btn.disabled = false; return; }
                    if (!d || !d.ok) { err.textContent = (d && d.message) || 'Не удалось опубликовать'; btn.disabled = false; return; }
                    closeSheet();
                    showToast('Движ опубликован!');
                    window._reqSecOverride = '';
                    if (document.getElementById('dvFeed')) { loadDviz(); const f = document.getElementById('dvFeed'); if (f) f.scrollTop = 0; } else openDvizScreen('dviz');
                } catch (_) { err.textContent = 'Нет связи с сервером'; btn.disabled = false; }
            });
        });
    });
}
