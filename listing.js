// ============================================
// TELL — страница жилья (профиль хозяина):
// галерея, условия, расстояние до моря, карта,
// календарь свободных дат, звонок и сообщение
// ============================================

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

// Все удобства и их иконки (используются и в форме добавления)
const AMENITIES = [
    { l: 'Wi-Fi', i: 'fa-wifi' },
    { l: 'Кондиционер', i: 'fa-snowflake' },
    { l: 'Кухня', i: 'fa-utensils' },
    { l: 'Стиральная машина', i: 'fa-shirt' },
    { l: 'Телевизор', i: 'fa-tv' },
    { l: 'Балкон', i: 'fa-door-open' },
    { l: 'Парковка', i: 'fa-square-parking' },
    { l: 'Бассейн', i: 'fa-person-swimming' },
    { l: 'Мангал', i: 'fa-fire' },
    { l: 'Для детей', i: 'fa-child' },
    { l: 'С животными', i: 'fa-paw' }
];

function amenityIcon(label) {
    const f = AMENITIES.find(a => a.l === label);
    return f ? f.i : 'fa-check';
}

// ---------- ДАТЫ И РАССТОЯНИЯ ----------
function p2(n) { return String(n).padStart(2, '0'); }
function toISO(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
function fromISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); }
function addDays(iso, n) { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); }
function daysBetween(a, b) { return Math.round((fromISO(b) - fromISO(a)) / 86400000); }
function fmtDay(iso) { const d = fromISO(iso); return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()]; }
function fmtMoney(n) { return Math.round(n).toLocaleString('ru-RU') + ' ₽'; }

function nightsWord(n) {
    const last = n % 10, two = n % 100;
    if (two >= 11 && two <= 14) return 'ночей';
    if (last === 1) return 'ночь';
    if (last >= 2 && last <= 4) return 'ночи';
    return 'ночей';
}

function distMeters(a, b) {
    const R = 6371000, rad = x => x * Math.PI / 180;
    const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

function fmtDist(m) {
    if (m < 1000) return Math.max(10, Math.round(m / 10) * 10) + ' м';
    return (m / 1000).toFixed(1).replace('.', ',') + ' км';
}

function walkMinutes(m) { return Math.max(1, Math.round(m / 80)); }

function ratingWord(n) {
    const last = n % 10, two = n % 100;
    if (two >= 11 && two <= 14) return 'отзывов';
    if (last === 1) return 'отзыв';
    if (last >= 2 && last <= 4) return 'отзыва';
    return 'отзывов';
}

// ---------- КАЛЕНДАРЬ ----------
// opts: { busy: Set<ISO>, edit: bool, onChange(sel) }
function buildCalendar(host, opts) {
    const busy = opts.busy;
    const edit = !!opts.edit;
    const today = toISO(new Date());
    const view = new Date();
    view.setDate(1);
    view.setHours(12, 0, 0, 0);
    let sel = { start: null, end: null };

    function nightsFree(a, b) {
        for (let d = a; d < b; d = addDays(d, 1)) if (busy.has(d)) return false;
        return true;
    }

    function render() {
        const y = view.getFullYear(), m = view.getMonth();
        const lead = (new Date(y, m, 1, 12).getDay() + 6) % 7;      // неделя с понедельника
        const days = new Date(y, m + 1, 0).getDate();
        const now = new Date();
        const canPrev = y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth());

        let cells = '';
        for (let i = 0; i < lead; i++) cells += '<span class="cal-empty"></span>';
        for (let d = 1; d <= days; d++) {
            const iso = y + '-' + p2(m + 1) + '-' + p2(d);
            const past = iso < today;
            let cls = 'cal-day';
            if (past) cls += ' past';
            else if (busy.has(iso)) cls += ' busy';
            if (iso === today) cls += ' today';
            if (sel.start === iso) cls += ' sel-start';
            if (sel.end === iso) cls += ' sel-end';
            if (sel.start && sel.end && iso > sel.start && iso < sel.end) cls += ' in-range';
            cells += `<button type="button" class="${cls}" data-iso="${iso}" ${past ? 'disabled' : ''}>${d}</button>`;
        }

        const legend = edit
            ? '<span><i class="lg lg-busy"></i>Занято</span><span><i class="lg lg-free"></i>Свободно</span><em>Нажмите на дату, чтобы отметить её занятой</em>'
            : '<span><i class="lg lg-free"></i>Свободно</span><span><i class="lg lg-busy"></i>Занято</span><span><i class="lg lg-sel"></i>Ваш выбор</span>';

        host.innerHTML = `
            <div class="cal-head">
                <button type="button" class="cal-nav" data-nav="-1" ${canPrev ? '' : 'disabled'} aria-label="Предыдущий месяц"><i class="fas fa-chevron-left"></i></button>
                <div class="cal-title">${MONTHS[m]} ${y}</div>
                <button type="button" class="cal-nav" data-nav="1" aria-label="Следующий месяц"><i class="fas fa-chevron-right"></i></button>
            </div>
            <div class="cal-week"><span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Вс</span></div>
            <div class="cal-grid">${cells}</div>
            <div class="cal-legend">${legend}</div>`;
    }

    host.onclick = (e) => {
        const nav = e.target.closest('[data-nav]');
        if (nav) {
            if (!nav.disabled) { view.setMonth(view.getMonth() + Number(nav.dataset.nav)); render(); }
            return;
        }
        const btn = e.target.closest('.cal-day');
        if (!btn || btn.disabled) return;
        const iso = btn.dataset.iso;

        if (edit) {
            if (busy.has(iso)) busy.delete(iso); else busy.add(iso);
            render();
            if (opts.onChange) opts.onChange();
            return;
        }

        const isBusy = busy.has(iso);
        if (!sel.start || sel.end) {
            if (isBusy) { showToast('Эти даты уже заняты'); return; }
            sel = { start: iso, end: null };
        } else if (iso <= sel.start) {
            if (isBusy) { showToast('Эти даты уже заняты'); return; }
            sel = { start: iso, end: null };
        } else if (nightsFree(sel.start, iso)) {
            sel.end = iso;               // день выезда может быть занят следующим гостем
        } else if (!isBusy) {
            sel = { start: iso, end: null };
        } else {
            showToast('В выбранном периоде есть занятые даты');
            return;
        }
        render();
        if (opts.onChange) opts.onChange(sel);
    };

    render();
    return {
        getSel: () => sel,
        clear: () => { sel = { start: null, end: null }; render(); }
    };
}

// ---------- ДИАЛОГИ (личные чаты с хозяевами) ----------
function getDialogs() {
    try { return JSON.parse(localStorage.getItem('tell-dialogs') || '[]'); } catch (e) { return []; }
}

function saveDialog(d) {
    const list = getDialogs().filter(x => x.roomId !== d.roomId);
    list.unshift(d);
    try { localStorage.setItem('tell-dialogs', JSON.stringify(list.slice(0, 30))); } catch (e) {}
}

// ---------- СТРАНИЦА ЖИЛЬЯ ----------
let listingMapInst = null;
let listingCal = null;
let listingAd = null;
let listingSel = { start: null, end: null };
let listingPhotos = [];

function openListing(adId) {
    const ad = findAd(adId);
    if (!ad) return;
    // в общем списке у объявлений с сервера только обложка: догружаем все фото
    if (ad.partial) { fetchFullAd(ad.id, (ok) => { if (ok) openListing(adId); }); return; }
    closeListingMap();

    listingAd = ad;
    listingSel = { start: null, end: null };

    const owner = getOwner(ad);
    const rent = ad.type !== 'sale';
    const photos = (ad.photos && ad.photos.length ? ad.photos : [ad.image]).filter(Boolean);
    listingPhotos = photos;
    const hasMap = Array.isArray(ad.coords) && ad.coords.length === 2;
    const e = escapeHtml;

    // галерея
    const gallery = photos.length
        ? `<div class="gallery-track" id="galleryTrack">${photos.map((src, i) =>
            `<img src="${src}" alt="Фото ${i + 1}" loading="${i ? 'lazy' : 'eager'}" onclick="openLightbox(${i})" onerror="this.style.visibility='hidden'">`).join('')}</div>`
        : '<div class="gallery-empty"><i class="fas fa-image"></i><span>Фото пока нет</span></div>';

    // хозяин
    const ownerAvatar = owner.avatar
        ? `<img src="${owner.avatar}" alt="">`
        : e((owner.name || '?')[0]);
    const ratingLine = owner.rating
        ? `<span class="owner-rating"><i class="fas fa-star"></i> ${String(owner.rating).replace('.', ',')}</span> · ${owner.reviews} ${ratingWord(owner.reviews)}`
        : 'Новый хозяин';
    const sinceLine = owner.since ? `На сайте с ${owner.since} года` : '';

    // условия
    const facts = (ad.facts || []).map(f => `<span class="chip"><i class="fas ${f.i}"></i>${e(f.t)}</span>`).join('');
    const amenities = (ad.amenities || []).map(a => `<span class="chip chip-soft"><i class="fas ${amenityIcon(a)}"></i>${e(a)}</span>`).join('');
    const terms = (ad.terms || []).map(t => `
        <div class="term-row">
            <div class="term-icon"><i class="fas ${t.i}"></i></div>
            <div><div class="term-label">${e(t.l)}</div><div class="term-value">${e(t.v)}</div></div>
        </div>`).join('');
    const rules = (ad.rules || []).map(r => `<li>${e(r)}</li>`).join('');

    // расстояние до моря
    let seaBlock = '';
    if (hasMap && ad.beach) {
        const m = distMeters(ad.coords, ad.beach);
        seaBlock = `
            <div class="sea-banner">
                <div class="sea-icon"><i class="fas fa-umbrella-beach"></i></div>
                <div><b>${fmtDist(m)} до моря</b><span>≈ ${walkMinutes(m)} мин пешком</span></div>
            </div>`;
    }

    // другие объявления хозяина
    const others = getAllAds().filter(a => a.id !== ad.id && getOwner(a).id === owner.id);
    const othersBlock = others.length ? `
        <section class="l-section">
            <h2 class="l-h">Ещё у этого хозяина</h2>
            <div class="featured-list featured-list-inner">${others.map(a => `
                <div class="ad-card" onclick="openListing('${a.id}')">
                    <div class="ad-card-img">${adImg(a)}</div>
                    <div class="ad-card-body">
                        <div class="ad-card-price">${e(a.price)}</div>
                        <div class="ad-card-title">${e(a.title)}</div>
                    </div>
                </div>`).join('')}</div>
        </section>` : '';

    const phoneDigits = (owner.phone || '').replace(/[^\d+]/g, '');
    const callBtn = phoneDigits
        ? `<a class="act-call" href="tel:${phoneDigits}"><i class="fas fa-phone"></i><span>Позвонить</span></a>`
        : `<button class="act-call" onclick="showToast('Хозяин не указал телефон')"><i class="fas fa-phone"></i><span>Позвонить</span></button>`;

    let screen = document.getElementById('listing-screen');
    if (!screen) {
        screen = document.createElement('section');
        screen.id = 'listing-screen';
        screen.className = 'listing-screen';
        document.body.appendChild(screen);
    }

    screen.innerHTML = `
        <div class="listing-scroll" id="listingScroll">
            <div class="listing-gallery">
                ${gallery}
                <button class="gallery-back" onclick="closeListing()" aria-label="Назад"><i class="fas fa-arrow-left"></i></button>
                ${photos.length > 1 ? `<div class="gallery-count" id="galleryCount">1 / ${photos.length}</div>` : ''}
                ${ad.isUrgent ? '<div class="ad-badge ad-badge-urgent gallery-badge">Срочно</div>' : ''}
            </div>

            <div class="listing-body">
                <div class="listing-price-row">
                    <div class="listing-price">${e(ad.price)}</div>
                    ${ad.isVerified ? '<span class="verified-chip"><i class="fas fa-circle-check"></i> Проверено</span>' : ''}
                </div>
                <h1 class="listing-title">${e(ad.title)}</h1>
                <div class="listing-loc"><i class="fas fa-map-marker-alt"></i>${e(ad.location)}</div>
                ${facts ? `<div class="chip-row">${facts}</div>` : ''}

                <section class="owner-card">
                    <div class="owner-avatar" style="background:${owner.color || '#E8643F'}">${ownerAvatar}</div>
                    <div class="owner-info">
                        <div class="owner-name">${e(owner.name || 'Хозяин')}</div>
                        <div class="owner-sub">${ratingLine}</div>
                        <div class="owner-sub">${[sinceLine, owner.response].filter(Boolean).map(e).join(' · ')}</div>
                    </div>
                </section>
                ${owner.about ? `<p class="owner-about">${e(owner.about)}</p>` : ''}

                <section class="l-section">
                    <h2 class="l-h">Описание</h2>
                    <p class="l-text">${e(ad.description || 'Описание не указано.')}</p>
                </section>

                ${amenities ? `<section class="l-section"><h2 class="l-h">${rent ? 'Удобства' : 'Что есть'}</h2><div class="chip-row">${amenities}</div></section>` : ''}

                ${terms ? `<section class="l-section"><h2 class="l-h">${rent ? 'Условия заселения' : 'Условия сделки'}</h2><div class="terms">${terms}</div></section>` : ''}

                ${rules ? `<section class="l-section"><h2 class="l-h">Правила</h2><ul class="rules">${rules}</ul></section>` : ''}

                ${hasMap ? `
                <section class="l-section">
                    <h2 class="l-h">Расположение</h2>
                    ${seaBlock}
                    <div class="listing-map" id="listingMap"></div>
                    <a class="map-link" target="_blank" rel="noopener" href="https://yandex.ru/maps/?pt=${ad.coords[1]},${ad.coords[0]}&z=16&l=map"><i class="fas fa-diamond-turn-right"></i> Открыть в Яндекс Картах</a>
                </section>` : ''}

                ${rent ? `
                <section class="l-section">
                    <h2 class="l-h">Свободные даты</h2>
                    <div class="cal" id="listingCal"></div>
                    <div class="cal-summary" id="calSummary">Выберите дату заезда и дату выезда</div>
                </section>` : ''}

                ${othersBlock}
            </div>
        </div>

        <div class="listing-actions">
            ${callBtn}
            <button class="act-write" onclick="openDM('${ad.id}')"><i class="fas fa-comment-dots"></i><span id="actWriteText">Написать</span></button>
        </div>
    `;

    screen.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // счётчик фото
    const track = document.getElementById('galleryTrack');
    const counter = document.getElementById('galleryCount');
    if (track && counter) {
        track.addEventListener('scroll', () => {
            const i = Math.round(track.scrollLeft / track.clientWidth);
            counter.textContent = (i + 1) + ' / ' + photos.length;
        }, { passive: true });
    }

    // календарь
    const calHost = document.getElementById('listingCal');
    if (calHost) {
        listingCal = buildCalendar(calHost, {
            busy: new Set(ad.busy || []),
            onChange: (sel) => { listingSel = sel || { start: null, end: null }; updateCalSummary(); }
        });
    }

    // карта
    if (hasMap) setTimeout(() => initListingMap(ad), 60);
}

function updateCalSummary() {
    const box = document.getElementById('calSummary');
    const btn = document.getElementById('actWriteText');
    if (!box || !listingAd) return;
    const { start, end } = listingSel;
    if (start && end) {
        const n = daysBetween(start, end);
        const total = (listingAd.priceNum || 0) * n;
        box.innerHTML = `<b>${fmtDay(start)} — ${fmtDay(end)}</b> · ${n} ${nightsWord(n)}` +
            (total ? `<span class="cal-total">≈ ${fmtMoney(total)}</span>` : '');
        box.classList.add('ready');
        if (btn) btn.textContent = 'Написать · ' + fmtDay(start) + ' — ' + fmtDay(end);
    } else if (start) {
        box.textContent = 'Заезд ' + fmtDay(start) + '. Теперь выберите дату выезда';
        box.classList.remove('ready');
        if (btn) btn.textContent = 'Написать';
    } else {
        box.textContent = 'Выберите дату заезда и дату выезда';
        box.classList.remove('ready');
        if (btn) btn.textContent = 'Написать';
    }
}

// ---------- КАРТА ----------
// Подложка: «схема» (тёмная или светлая в тон темы, CARTO на данных OpenStreetMap) или «спутник» (Esri).
function mapTiles(mode) {
    if (mode === 'sat') return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles © Esri' });
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    return L.tileLayer('https://{s}.basemaps.cartocdn.com/' + (dark ? 'dark_all' : 'rastertiles/voyager') + '/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 20, attribution: '© OpenStreetMap © CARTO' });
}

function initListingMap(ad) {
    const el = document.getElementById('listingMap');
    if (!el) return;
    if (typeof L === 'undefined') {
        el.innerHTML = '<div class="map-fallback"><i class="fas fa-map"></i>Карта загрузится при подключении к интернету</div>';
        return;
    }

    const map = L.map(el, {
        zoomControl: false,
        dragging: false,
        touchZoom: false,
        doubleClickZoom: false,
        scrollWheelZoom: false,
        tap: false
    }).setView(ad.coords, 16);

    if (map.attributionControl) map.attributionControl.setPrefix(false);   // без подписи Leaflet и флага
    mapTiles('scheme').addTo(map);

    const pin = (cls, icon) => L.divIcon({
        className: 'map-pin-wrap',
        html: `<div class="map-pin ${cls}"><i class="fas ${icon}"></i></div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    });

    L.marker(ad.coords, { icon: pin('pin-home', 'fa-home') }).addTo(map);

    if (ad.beach) {
        L.marker(ad.beach, { icon: pin('pin-sea', 'fa-umbrella-beach') }).addTo(map);
        L.polyline([ad.coords, ad.beach], { color: '#2DD4DA', weight: 3, dashArray: '2 8', lineCap: 'round' }).addTo(map);
        map.fitBounds([ad.coords, ad.beach], { padding: [50, 50], maxZoom: 17 });
    }

    // карта «спит», пока по ней не тапнули — чтобы не мешала листать страницу
    const hint = document.createElement('div');
    hint.className = 'map-hint';
    hint.textContent = 'Нажмите, чтобы двигать карту';
    el.appendChild(hint);
    el.addEventListener('click', function wake() {
        map.dragging.enable();
        map.touchZoom.enable();
        map.doubleClickZoom.enable();
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        hint.remove();
        el.removeEventListener('click', wake);
    });

    listingMapInst = map;
    setTimeout(() => map.invalidateSize(), 250);
}

function closeListingMap() {
    if (listingMapInst) { listingMapInst.remove(); listingMapInst = null; }
}

// ---------- ПРОСМОТР ФОТО НА ВЕСЬ ЭКРАН ----------
function openLightbox(index) {
    closeLightbox();
    const box = document.createElement('div');
    box.id = 'lightbox';
    box.className = 'lightbox';
    box.innerHTML = `
        <button class="lightbox-close" onclick="closeLightbox()" aria-label="Закрыть"><i class="fas fa-xmark"></i></button>
        <div class="lightbox-track" id="lightboxTrack">
            ${listingPhotos.map(src => `<div class="lightbox-slide"><img src="${src}" alt=""></div>`).join('')}
        </div>
        <div class="lightbox-count" id="lightboxCount">${index + 1} / ${listingPhotos.length}</div>`;
    document.body.appendChild(box);

    const track = document.getElementById('lightboxTrack');
    track.scrollLeft = index * track.clientWidth;
    track.addEventListener('scroll', () => {
        const i = Math.round(track.scrollLeft / track.clientWidth);
        document.getElementById('lightboxCount').textContent = (i + 1) + ' / ' + listingPhotos.length;
    }, { passive: true });
}

function closeLightbox() {
    const box = document.getElementById('lightbox');
    if (box) box.remove();
}

// ---------- ЗАКРЫТЬ СТРАНИЦУ ----------
function closeListing() {
    closeLightbox();
    closeListingMap();
    const screen = document.getElementById('listing-screen');
    if (screen) { screen.style.display = 'none'; screen.innerHTML = ''; }
    document.body.style.overflow = '';
    listingAd = null;
    listingCal = null;
}

// ---------- НАПИСАТЬ ХОЗЯИНУ (личные сообщения, нужен аккаунт) ----------
function openDM(adId) {
    const ad = findAd(adId);
    if (!ad) return;
    const owner = getOwner(ad);
    if (owner.id === 'me') { showToast('Это ваше собственное объявление'); return; }

    let prefill = 'Здравствуйте! Интересует «' + ad.title + '»';
    const { start, end } = listingSel;
    if (start && end) {
        const n = daysBetween(start, end);
        prefill += ', даты: ' + fmtDay(start) + ' — ' + fmtDay(end) + ' (' + n + ' ' + nightsWord(n) + ')';
    }
    prefill += '. Свободно?';

    startDm(owner.name || 'Хозяин', ad, prefill);
}
