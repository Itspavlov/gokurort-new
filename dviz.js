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
const DV_YMAPKEY = '7aafdf73-bf1e-4ec7-8d18-07b14be93c80';   // ключ «JavaScript API»: в кабинете Яндекса ограничьте его по HTTP-referer (yugiyugi.ru)
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
// Основная — Яндекс.Карты (JS API 3.0): названия улиц, подпись «Яндекс». Не загрузилась (нет связи, ключ без разрешения для сайта) —
// запасная карта на OpenStreetMap, тоже с улицами. Метка и клики приведены к одному виду: координаты везде [широта, долгота].
let dvYmaps = null;
function dvLoadYmaps() {
    if (dvYmaps) return dvYmaps;
    dvYmaps = new Promise((res, rej) => {
        const done = () => window.ymaps3.ready.then(() => res(window.ymaps3), rej);
        if (window.ymaps3) { done(); return; }
        const sc = document.createElement('script');
        sc.src = 'https://api-maps.yandex.ru/v3/?apikey=' + DV_YMAPKEY + '&lang=ru_RU';
        sc.onload = () => (window.ymaps3 ? done() : rej(new Error('ymaps')));
        sc.onerror = () => rej(new Error('ymaps'));
        document.head.appendChild(sc);
        setTimeout(() => rej(new Error('ymaps timeout')), 9000);
    }).catch((e) => { dvYmaps = null; throw e; });
    return dvYmaps;
}

async function dvYandexMap(el, center, zoom, o) {
    const y = await dvLoadYmaps();
    const map = new y.YMap(el, { location: { center: [center[1], center[0]], zoom } });
    map.addChild(new y.YMapDefaultSchemeLayer());
    map.addChild(new y.YMapDefaultFeaturesLayer());
    let marker = null;
    const pinEl = () => { const d = document.createElement('div'); d.className = 'dv-ympin'; d.innerHTML = '<i class="fas fa-flag"></i>'; return d; };
    if (o.onClick) map.addChild(new y.YMapListener({ layer: 'any', onClick: (obj, ev) => { if (ev && ev.coordinates) o.onClick([ev.coordinates[1], ev.coordinates[0]]); } }));
    return {
        engine: 'yandex',
        setPoint(c, z) {
            const ll = [c[1], c[0]];
            if (marker) marker.update({ coordinates: ll });
            else {
                marker = new y.YMapMarker({ coordinates: ll, draggable: !!o.draggable, onDragEnd: (cc) => o.onDrag && o.onDrag([cc[1], cc[0]]) }, pinEl());
                map.addChild(marker);
            }
            if (z) map.setLocation({ center: ll, zoom: z, duration: 300 });
        },
        clearPoint() { if (marker) { map.removeChild(marker); marker = null; } },
        getZoom() { return map.zoom || zoom; }
    };
}

function dvLeafletMap(el, center, zoom, o) {
    if (typeof L === 'undefined') {
        el.innerHTML = '<div class="map-fallback"><i class="fas fa-map"></i>Карта загрузится при подключении к интернету</div>';
        return null;
    }
    const map = L.map(el, { zoomControl: false, tap: false }).setView(center, zoom);
    if (map.attributionControl) map.attributionControl.setPrefix(false);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    setTimeout(() => map.invalidateSize(), 420);       // шторка выезжает с анимацией
    const icon = L.divIcon({ className: 'map-pin-wrap', html: '<div class="map-pin pin-meet"><i class="fas fa-flag"></i></div>', iconSize: [40, 40], iconAnchor: [20, 20] });
    let marker = null;
    if (o.onClick) map.on('click', (ev) => o.onClick([ev.latlng.lat, ev.latlng.lng]));
    return {
        engine: 'osm',
        setPoint(c, z) {
            if (marker) marker.setLatLng(c);
            else {
                marker = L.marker(c, { icon, draggable: !!o.draggable }).addTo(map);
                marker.on('dragend', () => { const p = marker.getLatLng(); o.onDrag && o.onDrag([p.lat, p.lng]); });
            }
            if (z) map.setView(c, z);
        },
        clearPoint() { if (marker) { map.removeLayer(marker); marker = null; } },
        getZoom() { return map.getZoom(); }
    };
}

// карта в блоке el; o: { draggable, onClick(c), onDrag(c) }. Возвращает Promise с управлением картой (или null, если карт нет совсем)
function dvOpenMap(el, center, zoom, o) {
    o = o || {};
    return dvYandexMap(el, center, zoom, o).catch(() => { el.innerHTML = ''; return dvLeafletMap(el, center, zoom, o); });
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
const dvPeople = (e) => e.max ? `${e.joins} из ${e.max}` : (e.joins ? String(e.joins) : '');

// ---------- экран ----------
function openDvizScreen() {
    if (typeof socket !== 'undefined' && socket && currentRoom) socket.emit('leave-room', currentRoom);
    currentRoom = null; currentDm = null; currentGroup = null;
    tabContents.forEach(section => section.style.display = 'none');
    let screen = document.getElementById('group-screen');
    if (!screen) {
        screen = document.createElement('section');
        screen.id = 'group-screen'; screen.className = 'group-screen';
        document.getElementById('appMain').appendChild(screen);
    }
    screen.innerHTML = `
        <div class="chat-header room-head">
            <button class="chat-back-btn" onclick="closeGroup()" aria-label="Назад"><i class="fas fa-arrow-left"></i></button>
            <div class="chat-header-info">
                <div class="chat-header-title">Курортный движ</div>
                <div class="chat-header-subtitle">найди компанию на отдых</div>
            </div>
        </div>
        <div class="dv-feed" id="dvFeed"><div class="dv-empty"><i class="fas fa-spinner fa-spin"></i><b>Загружаю…</b></div></div>
        <div class="cards-dock"><div class="dock-actions"><button type="button" class="dock-btn main" id="dvCreate"><i class="fas fa-plus"></i> Создать движ</button></div></div>`;
    screen.style.display = 'flex';
    screen.querySelector('#dvCreate').onclick = () => openDvizForm();
    screen.querySelector('#dvFeed').addEventListener('click', onFeedClick);
    loadDviz();
}

const _openGroupDv = openGroup;
openGroup = function (id) { return id === 'dating' ? openDvizScreen() : _openGroupDv.apply(this, arguments); };

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
    const art = dvArt(e.title);
    let h = 0; for (const ch of String(e.id)) h = (h * 31 + ch.charCodeAt(0)) % 3;
    const people = dvPeople(e);
    const cn = e.comments || 0;
    // облачка идут в шахматном порядке: слева, справа, слева…; носик смотрит на аватарку автора под облачком
    return `<article class="dv-card ${(i || 0) % 2 ? 'R' : 'L'} dv-c${h}" data-id="${dvEsc(e.id)}">
        <div class="dv-bubble">
            <div class="dv-bin">
                <div class="dv-pic">${e.thumb ? `<img src="${dvEsc(e.thumb)}" alt="" loading="lazy">` : `<i class="fas ${art.icon} dv-wm"></i>`}</div>
                <div class="dv-txt">
                    <span class="dv-ic"><i class="fas fa-user-group"></i></span>
                    <h3 class="dv-title">${dvEsc(e.title)}</h3>
                    <div class="dv-meta">
                        ${e.when ? `<span><i class="far fa-calendar"></i>${dvEsc(dvWhen(e.when))}</span>` : ''}
                        ${e.place ? `<span><i class="fas fa-location-dot"></i>${dvEsc(e.place)}</span>` : ''}
                        ${e.coords && !e.place ? '<span><i class="fas fa-map-location-dot"></i>Точка на карте</span>' : ''}
                    </div>
                    <div class="dv-act">
                        <span class="dv-ppl"><i class="fas fa-user-group"></i> ${people ? dvEsc(people) : 'пока никого'}</span>
                        ${mine ? '<span class="dv-ownl">Ваш движ</span>' : `<button type="button" class="dv-join ${e.joined ? 'on' : ''}" data-dv="join">${e.joined ? 'Вы идёте <i class="fas fa-check"></i>' : 'Я с вами'}</button>`}
                    </div>
                </div>
            </div>
            <i class="dv-tail"></i>
        </div>
        <div class="dv-under">
            <span class="dv-ava chat-avatar" style="background:${dmColor(e.ownerName)}">${dvEsc(Array.from(e.ownerName)[0] || '?')}</span>
            <span class="dv-who2"><b>${dvEsc(mine ? 'Вы' : e.ownerName)}${e.verified ? ' <i class="fas fa-circle-check pf-check"></i>' : ''}</b><small>${fmtAgo(e.created)}</small></span>
            <button type="button" class="dv-cm" data-dv="comments"><i class="far fa-comment"></i> ${cn ? cn + ' ' + plural(cn, 'комментарий', 'комментария', 'комментариев') : 'Обсудить'}</button>
        </div></article>`;
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
    const card = ev.target.closest('.dv-card');
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
        return `<div class="dv-comment" data-cid="${dvEsc(c.id)}"><div class="chat-avatar" style="background:${dmColor(c.name)}">${dvEsc(Array.from(c.name)[0] || '?')}</div>
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
            <span class="chat-avatar" style="background:${acc ? dmColor(acc.name) : 'rgba(128,128,128,.4)'}">${acc ? dvEsc(Array.from(acc.name)[0] || '?') : '<i class="fas fa-user"></i>'}</span>
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
            <button type="button" class="sv-owner" data-dv-owner><span class="chat-avatar" style="background:${dmColor(e.ownerName)}">${dvEsc(Array.from(e.ownerName)[0] || '?')}</span>
                <span><b>${dvEsc(mine ? 'Вы' : e.ownerName)}</b><small>Организатор · открыть профиль</small></span><i class="fas fa-chevron-right"></i></button>
            <div class="dv-going" id="dvGoing"></div>
            <div class="dv-actions" id="dvActions"></div>
            <button type="button" class="dv-commbtn" data-dv-comm><i class="far fa-comment"></i><span>Комментарии <b id="dvCN">${e.comments || 0}</b></span><i class="fas fa-chevron-up"></i></button>`, (el) => {
            const paintTop = (ev) => {
                const g = el.querySelector('#dvGoing');
                const jl = ev.joinList || [];
                g.innerHTML = jl.length ? `<div class="dv-going-h">Идут (${jl.length}${ev.max ? ' из ' + ev.max : ''})</div><div class="dv-chips">${jl.map(j => `<span class="dv-chip"><i style="background:${dmColor(j.name)}">${dvEsc(Array.from(j.name)[0] || '?')}</i>${dvEsc(j.name)}</span>`).join('')}</div>` : '';
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
                    if (document.getElementById('dvFeed')) loadDviz(); else openDvizScreen();
                } catch (_) { err.textContent = 'Нет связи с сервером'; btn.disabled = false; }
            });
        });
    });
}
