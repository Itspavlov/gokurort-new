// ============================================
// YuGi YuGi — карточки развлечений в профиле и раздел «Развлечения»
//  • «Мои развлечения» на вкладке «Мои публикации»: карточки с фото (до 4), ценой и описанием — морские прогулки, экскурсии, джипы…
//  • другой пользователь видит их в профиле хозяина (вкладка «Развлечения») и в разделе «Развлечения»
//  • в разделе есть быстрый поиск и категории, чтобы не листать всё подряд
//  • «Предлагаю / Сдаю»: если карточки или объявления уже есть — предложим опубликовать старое заново или создать новое
// ============================================
const SV_TAGS = { sea: 'Морские прогулки', tours: 'Экскурсии', active: 'Активный отдых', kids: 'Детям', show: 'Шоу и вечера', food: 'Гастро', other: 'Другое' };
const SV_ICONS = { sea: 'fa-ship', tours: 'fa-map-location-dot', active: 'fa-person-hiking', kids: 'fa-child-reaching', show: 'fa-masks-theater', food: 'fa-utensils', other: 'fa-star' };
const SV_UNITS = ['', 'за человека', 'за час', 'за день', 'за билет', 'за лодку / группу'];
const SV_MAX = 10, SV_PHOTOS = 4;
let serviceFeed = [];      // карточки в разделе «Услуги»
let myServices = [];       // мои карточки

const svApi = (path, opts) => fetch(SERVER_URL + path, opts).then(async (r) => { let d = null; try { d = await r.json(); } catch (_) {} return { status: r.status, d }; });
const svAuth = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() });
const svPrice = (s) => s.price ? Number(s.price).toLocaleString('ru-RU') + ' ₽' + (s.unit ? ' ' + s.unit : '') : 'Цена по договорённости';
const svWait = (sec) => { const h = Math.floor(sec / 3600), m = Math.ceil((sec % 3600) / 60); return h ? `${h} ч ${m} мин` : `${Math.max(1, m)} мин`; };

// ---------- карточки ----------
function serviceCardHTML(s, mine) {
    const e = escapeHtml;
    const thumb = s.thumb ? `<img src="${e(s.thumb)}" alt="" loading="lazy">` : '<i class="fas fa-image"></i>';
    const act = mine ? `<div class="sv-actions">
            <button type="button" data-sv="edit" data-id="${e(s.id)}"><i class="fas fa-pen"></i> Изменить</button>
            <button type="button" data-sv="bump" data-id="${e(s.id)}"><i class="fas fa-arrow-up"></i> Поднять</button>
            <button type="button" data-sv="del" data-id="${e(s.id)}" aria-label="Удалить"><i class="fas fa-trash"></i></button></div>` : '';
    return `<div class="sv-card" data-sid="${e(s.id)}">
        <div class="sv-main" data-sv="view" data-id="${e(s.id)}">
            <div class="sv-thumb">${thumb}${s.photoCount > 1 ? `<em>${s.photoCount}</em>` : ''}</div>
            <div class="sv-info">
                <b class="sv-title">${e(s.title)}</b>
                <span class="sv-price">${e(svPrice(s))}</span>
                <small class="sv-meta"><span>${e(SV_TAGS[s.tag] || '')}</span>${s.city ? `<span><i class="fas fa-location-dot"></i>${e(s.city)}</span>` : ''}</small>
            </div>
        </div>${act}</div>`;
}

// в ленте раздела: плитка 2 в ряд — фото на весь фон, сверху автор, снизу название, цена и кнопка «Написать»
function serviceFeedHTML(s) {
    const e = escapeHtml;
    const acc = typeof getAccount === 'function' ? getAccount() : null;
    const mine = !!(acc && acc.id === s.ownerId);
    const price = s.price ? Number(s.price).toLocaleString('ru-RU') + ' ₽' : 'Договорная';
    const btns = mine
        ? `<button type="button" data-sv="edit" data-id="${e(s.id)}" aria-label="Изменить"><i class="fas fa-pen"></i></button><button type="button" data-sv="bump" data-id="${e(s.id)}" aria-label="Поднять"><i class="fas fa-arrow-up"></i></button>`
        : `<button type="button" class="main" data-sv="write" data-id="${e(s.id)}" aria-label="Написать"><i class="fas fa-paper-plane"></i></button>`;
    const mapBtn = s.coords ? `<button type="button" class="sv-mapbtn" data-sv="map" data-id="${e(s.id)}"><i class="fas fa-map-location-dot"></i> Карта</button>` : '';
    return `<div class="sv-cell"><div class="sv-tile sv-g${(s.tag || 'other').length % 5}" data-sv="view" data-id="${e(s.id)}">
        <div class="sv-t-bg">${svSlidesHTML(s)}</div>
        <div class="sv-t-top"><span class="chat-avatar" data-avn="${avEsc(s.ownerName)}" style="background:${dmColor(s.ownerName)}">${avInner(s.ownerName)}</span>
            <span class="sv-t-by"><b>${e(mine ? 'Вы' : s.ownerName)}${s.verified ? ' <i class="fas fa-circle-check pf-check"></i>' : ''}</b><small>${fmtAgo(s.updated || s.created)}</small></span>
            ${s.photoCount > 1 ? `<em><i class="fas fa-images"></i><span><span class="cur">1</span>/${s.photoCount}</span></em>` : ''}</div>
        <div class="sv-t-bottom"><span class="sv-t-tag"><i class="fas ${SV_ICONS[s.tag] || 'fa-star'}"></i>${e(SV_TAGS[s.tag] || '')}</span></div>
        </div>
        <div class="sv-panel" data-sv="view" data-id="${e(s.id)}">
            <div class="sv-i-main"><b class="sv-t-title">${e(s.title)}</b>
                ${s.city ? `<small class="sv-t-city"><i class="fas fa-location-dot"></i>${e(s.city)}</small>` : ''}
                <span class="sv-t-price">${e(price)}${s.price && s.unit ? `<small>${e(s.unit)}</small>` : ''}</span></div>
            <span class="sv-t-btns">${btns}</span></div>${mapBtn}</div>`;
}

// ---------- фото в плитке листаются прямо в ленте ----------
// Список приносит одну обложку; остальные фото подгружаются при первом касании.
const svPhotoCache = {};
function svSlidesHTML(s) {
    const e = escapeHtml, id = String(s.id);
    const cached = svPhotoCache[id];
    const n = cached ? cached.length : Math.max(Number(s.photoCount) || 0, s.thumb ? 1 : 0);
    if (!n) return `<i class="fas ${SV_ICONS[s.tag] || 'fa-star'} sv-t-ico"></i>`;
    const slide = (src) => src ? `<div class="sv-slide"><img src="${e(src)}" alt="" loading="lazy"></div>` : '<div class="sv-slide ph"></div>';
    let html = slide(cached ? cached[0] : s.thumb);
    for (let i = 1; i < n; i++) html += slide(cached ? cached[i] : '');
    return `<div class="sv-slides" data-svslides="${e(id)}" data-loaded="${cached || n <= 1 ? 1 : 0}">${html}</div>`;
}
function svLoadSlides(box) {
    if (!box || box.dataset.loaded === '1' || box.dataset.loading === '1') return;
    const id = box.dataset.svslides;
    box.dataset.loading = '1';
    svApi('/api/services/' + encodeURIComponent(id)).then(({ d }) => {
        const photos = d && d.ok && d.service && Array.isArray(d.service.photos) ? d.service.photos.filter(Boolean) : [];
        box.dataset.loading = '';
        if (!photos.length) return;
        svPhotoCache[id] = photos;
        document.querySelectorAll(`.sv-slides[data-svslides="${CSS.escape(id)}"]`).forEach(el => {
            const slides = el.querySelectorAll('.sv-slide');
            photos.forEach((src, i) => {
                const sl = slides[i];
                if (!sl || (i === 0 && sl.querySelector('img'))) return;
                sl.classList.remove('ph'); sl.innerHTML = `<img src="${escapeHtml(src)}" alt="">`;
            });
            el.dataset.loaded = '1';
        });
    }).catch(() => { box.dataset.loading = ''; });
}
document.addEventListener('pointerdown', (ev) => { const b = ev.target.closest && ev.target.closest('.sv-slides'); if (b) svLoadSlides(b); }, true);
document.addEventListener('scroll', (ev) => {
    const b = ev.target;
    if (!b || !b.classList || !b.classList.contains('sv-slides')) return;
    const i = Math.round(b.scrollLeft / Math.max(1, b.clientWidth)) + 1;
    const cur = b.closest('.sv-tile') && b.closest('.sv-tile').querySelector('.sv-t-top .cur');
    if (cur && cur.textContent !== String(i)) cur.textContent = i;
}, true);

// ---------- загрузка ----------
function loadMyServices(cb) {
    if (!getToken()) { myServices = []; cb && cb(); return; }
    svApi('/api/services?mine=1', { headers: { Authorization: 'Bearer ' + getToken() } }).then(({ d }) => {
        if (d && d.ok) myServices = d.services || [];
        cb && cb();
    }).catch(() => cb && cb());
}

const _loadRequestsSv = loadRequests;
loadRequests = function (cb) {
    if (reqSection() !== 'services') return _loadRequestsSv.apply(this, arguments);
    svApi('/api/services').then(({ d }) => { if (d && d.ok) serviceFeed = d.services || []; }).catch(() => {}).then(() => _loadRequestsSv(cb));
};

// ---------- просмотр карточки ----------
function openServiceView(id) {
    svApi('/api/services/' + encodeURIComponent(id)).then(({ d }) => {
        if (!d || !d.ok) { showToast((d && d.message) || 'Карточка недоступна'); return; }
        const s = d.service, e = escapeHtml;
        const acc = typeof getAccount === 'function' ? getAccount() : null;
        const mine = !!(acc && acc.id === s.ownerId);
        const gal = (s.photos || []).length ? `<div class="sv-gallery">${s.photos.map((p, i) => `<img src="${e(p)}" alt="Фото ${i + 1}">`).join('')}</div>` : '';
        openSheet(e(s.title), `
            ${gal}
            <div class="sv-view-price">${e(svPrice(s))}</div>
            <div class="sv-view-meta"><span class="sv-tag">${e(SV_TAGS[s.tag] || '')}</span>${s.city ? `<span><i class="fas fa-location-dot"></i>${e(s.city)}</span>` : ''}</div>
            ${(() => { const u = svUnpackText(s.text); return (u.facts.length ? `<div class="sv-facts">${u.facts.map(([k, v]) => `<div><small>${e(k)}</small><b>${e(v)}</b></div>`).join('')}</div>` : '') + (u.desc ? `<p class="sv-view-text">${e(u.desc)}</p>` : ''); })()}
            ${s.coords ? `<button type="button" class="ghost-btn wide-btn sv-viewmap" data-sv="map" data-id="${e(s.id)}"><i class="fas fa-map-location-dot"></i> Карта${s.place ? ' · ' + e(s.place) : ''}</button>` : ''}
            <button type="button" class="sv-owner" data-sv-owner><span class="chat-avatar" data-avn="${avEsc(s.ownerName)}" style="background:${dmColor(s.ownerName)}">${avInner(s.ownerName)}</span>
                <span><b>${e(mine ? 'Вы' : s.ownerName)}</b><small>Открыть профиль и другие развлечения</small></span><i class="fas fa-chevron-right"></i></button>
            ${mine ? `<div class="sv-view-btns"><button class="ghost-btn" data-sv="edit" data-id="${e(s.id)}"><i class="fas fa-pen"></i> Изменить</button><button class="primary-btn" data-sv="bump" data-id="${e(s.id)}"><i class="fas fa-arrow-up"></i> Поднять</button></div>`
                : `<button class="primary-btn wide-btn" data-sv="write" data-id="${e(s.id)}"><i class="fas fa-paper-plane"></i> Написать</button>`}
            <button type="button" class="ghost-btn wide-btn dv-from-sv" data-dv-create><i class="fas fa-champagne-glasses"></i> Создать поиск с этим развлечением</button>
            ${!mine && typeof sfReportBtn === 'function' ? `<div class="sf-row">${sfReportBtn({ kind: 'service', id: s.id, ownerId: s.ownerId, ownerName: s.ownerName, title: s.title })}</div>` : ''}`, (el) => {
            el.querySelector('[data-dv-create]').addEventListener('click', () => { closeSheet(); if (typeof openDvizForm === 'function') openDvizForm({ attach: s }); });
            el.querySelector('[data-sv-owner]').addEventListener('click', () => { closeSheet(); if (typeof openUserProfile === 'function') openUserProfile({ id: s.ownerId, name: s.ownerName }); });
            el._sv = s;
        });
    }).catch(() => showToast('Нет связи с сервером'));
}

function writeAboutService(id, title, ownerName) {
    loginRequired(() => startDm(ownerName, { id: 'svc_' + id, title: 'Развлечение: ' + title }, `Здравствуйте! Интересует «${title}». `));
}

// ---------- сжатие фото ----------
function svShrink(src, maxSide, q) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
            const k = Math.min(1, maxSide / Math.max(img.width, img.height));
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            resolve(c.toDataURL('image/jpeg', q));
        };
        img.src = src;
    });
}
const svReadFile = (file) => new Promise((res, rej) => { const fr = new FileReader(); fr.onerror = rej; fr.onload = () => res(fr.result); fr.readAsDataURL(file); });
// фото на сервере: до 350 КБ (≈ 470 тыс. знаков в base64) — подбираем размер и качество
async function svPhoto(file) {
    const raw = await svReadFile(file);
    for (const [side, q] of [[1280, 0.78], [1024, 0.7], [800, 0.62], [640, 0.55]]) {
        const out = await svShrink(raw, side, q);
        if (out.length <= 440000) return out;
    }
    throw new Error('big');
}
async function svThumb(first) {
    for (const [side, q] of [[320, 0.7], [240, 0.6], [160, 0.55]]) {
        const out = await svShrink(first, side, q);
        if (out.length <= 78000) return out;
    }
    return '';
}

// ---------- категории: поля формы под каждую ----------
const SV_DUR = ['', '30 минут', '1 час', '1,5 часа', '2 часа', '3 часа', 'Полдня', 'Весь день'];
const SV_FIELDS = {
    sea: [
        { k: 'Судно', o: ['', 'Катер', 'Яхта', 'Катамаран', 'Лодка', 'Парусник', 'Теплоход'] },
        { k: 'Длительность', o: SV_DUR },
        { k: 'Вместимость', ph: 'до 8 человек' },
        { k: 'Что входит', ph: 'купание, дельфины, напитки' }],
    tours: [
        { k: 'Формат', o: ['', 'Групповая', 'Индивидуальная'] },
        { k: 'Транспорт', o: ['', 'Автобус', 'Джип', 'Пешком', 'Катер', 'Свой транспорт'] },
        { k: 'Длительность', o: SV_DUR },
        { k: 'Размер группы', ph: 'до 12 человек' },
        { k: 'Что входит', ph: 'трансфер, обед, билеты' }],
    active: [
        { k: 'Вид', o: ['', 'Джип-тур', 'Квадроциклы', 'Багги', 'Дайвинг', 'Парашют / параплан', 'Верховая езда', 'Рафтинг', 'SUP / серф', 'Верёвочный парк', 'Другое'] },
        { k: 'Длительность', o: SV_DUR },
        { k: 'Мест', ph: 'до 6 человек' },
        { k: 'Возраст', o: ['', 'Любой', 'от 6 лет', 'от 12 лет', 'от 16 лет', '18+'] },
        { k: 'Что взять', ph: 'сменная одежда, кепка' }],
    kids: [
        { k: 'Возраст', o: ['', '0–3 года', '3–6 лет', '6–12 лет', '12+', 'Любой'] },
        { k: 'Длительность', o: SV_DUR },
        { k: 'Группа', ph: 'до 10 детей' },
        { k: 'Родители', o: ['', 'Можно с родителями', 'Без родителей'] }],
    show: [
        { k: 'Когда', ph: 'Каждый вечер в 20:00' },
        { k: 'Длительность', o: SV_DUR },
        { k: 'Возраст', o: ['', '0+', '6+', '12+', '16+', '18+'] },
        { k: 'Что будет', ph: 'живая музыка, шоу-программа' }],
    food: [
        { k: 'Формат', o: ['', 'Дегустация', 'Мастер-класс', 'Ужин / банкет', 'Доставка', 'Другое'] },
        { k: 'Длительность', o: SV_DUR },
        { k: 'Гостей', ph: 'до 10 человек' },
        { k: 'Что входит', ph: 'вино, сыр, закуски' }],
    other: []
};
const SV_ALL_LABELS = Array.from(new Set([].concat(...Object.values(SV_FIELDS).map(a => a.map(f => f.k)))));
const SV_CHIP_SHORT = { sea: 'Море', tours: 'Экскурсии', active: 'Актив', kids: 'Детям', show: 'Шоу', food: 'Гастро', other: 'Другое' };

// Детали карточки хранятся в тексте первыми строками «Название: значение», дальше — свободное описание.
function svPackText(tag, facts, desc) {
    const lines = (SV_FIELDS[tag] || []).map(f => facts[f.k] ? `${f.k}: ${String(facts[f.k]).replace(/\s+/g, ' ').trim()}` : '').filter(Boolean);
    return lines.concat(desc ? ['', desc] : []).join('\n').trim();
}
function svUnpackText(text) {
    const lines = String(text || '').split('\n'), facts = [];
    let i = 0;
    for (; i < lines.length; i++) {
        const m = /^([^:\n]{2,20}): (.+)$/.exec(lines[i]);
        if (!m || !SV_ALL_LABELS.includes(m[1])) break;
        facts.push([m[1], m[2]]);
    }
    return { facts, desc: lines.slice(i).join('\n').trim() };
}

// Подсказка категории по названию и описанию
const SV_KEYS = [
    ['sea', /катер|яхт|катамаран|лодк|парус|дельфин|морск\w* прогул|прогулк\w* по морю|теплоход|рыбалк/i],
    ['active', /джип|квадр|багги|дайвинг|парашют|параплан|рафтинг|верхом|лошад|конн|\bсап\b|sup|серф|кайт|гидроцикл|банан|тарзанк|верёвоч|веревоч|канатн|пейнтбол|картинг|эндуро|вело/i],
    ['kids', /детск|детям|малыш|аниматор|батут|игров\w* комнат|для детей/i],
    ['show', /шоу|концерт|дискотек|караоке|театр|представлен|стендап|stand-?up|живая музыка|вечеринк/i],
    ['food', /дегустац|ресторан|кафе|мастер-?класс|шашлык|вино|сыр|кухн|ужин|банкет|гастро|еда/i],
    ['tours', /экскурс|\bтур\b|водопад|дольмен|маршрут|трансфер|заповедник|винодельн|музей|поход|поездка|горы|в горы/i]
];
function svGuessText(str) {
    const t = String(str || '');
    for (const [tag, re] of SV_KEYS) if (re.test(t)) return tag;
    return '';
}

// Подсказка категории по фото: небольшая нейросеть MobileNet в самом телефоне, грузится только когда добавили первое фото.
const SV_IMGNET = {
    sea: ['speedboat', 'catamaran', 'trimaran', 'yawl', 'schooner', 'gondola', 'canoe', 'lifeboat', 'fireboat', 'liner', 'pirate', 'container ship', 'boathouse', 'dock', 'pier', 'breakwater', 'sandbar', 'seashore', 'paddlewheel', 'sea lion', 'grey whale', 'killer whale', 'jellyfish', 'coral reef', 'wreck'],
    active: ['jeep', 'go-kart', 'golfcart', 'mountain bike', 'moped', 'motor scooter', 'snowmobile', 'parachute', 'scuba diver', 'snorkel', 'sorrel', 'crash helmet', 'paddle', 'racer', 'half track', 'bicycle-built'],
    tours: ['valley', 'alp', 'cliff', 'promontory', 'volcano', 'lakeside', 'geyser', 'castle', 'monastery', 'church', 'palace', 'triumphal arch', 'obelisk', 'dome', 'mosque', 'lighthouse', 'viaduct', 'suspension bridge', 'fountain', 'minibus', 'school bus', 'trolleybus', 'backpack', 'stone wall'],
    kids: ['teddy', 'toyshop', 'jigsaw', 'balloon', 'carousel', 'pinwheel', 'bubble', 'crib', 'swing', 'pencil box'],
    show: ['stage', 'theater curtain', 'spotlight', 'microphone', 'drum', 'acoustic guitar', 'electric guitar', 'grand piano', 'saxophone', 'trombone', 'violin', 'cello', 'accordion', 'maraca', 'cinema', 'loudspeaker', 'maillot', 'bow tie', 'wig'],
    food: ['pizza', 'plate', 'espresso', 'wine bottle', 'red wine', 'cheeseburger', 'hotdog', 'burrito', 'consomme', 'hot pot', 'trifle', 'ice cream', 'bagel', 'pretzel', 'carbonara', 'restaurant', 'menu', 'soup bowl', 'frying pan', 'wok', 'cocktail shaker', 'beer glass', 'goblet', 'pitcher', 'coffee mug', 'teapot', 'dining table', 'strawberry', 'pomegranate', 'lemon', 'orange', 'grocery store', 'butcher shop', 'bakery', 'confectionery']
};
function svTagFromPredictions(preds) {
    const score = {};
    for (const p of preds || []) {
        const name = String(p.className || '').toLowerCase();
        for (const [tag, words] of Object.entries(SV_IMGNET)) if (words.some(w => name.includes(w))) { score[tag] = (score[tag] || 0) + p.probability; break; }
    }
    const top = Object.entries(score).sort((a, b) => b[1] - a[1]);
    if (!top.length || top[0][1] < 0.12) return '';
    if (top[1] && top[0][1] < top[1][1] * 1.3) return '';
    return top[0][0];
}
let svMLp = null;
function svLoadML() {
    if (svMLp) return svMLp;
    const add = (src) => new Promise((res, rej) => { const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = rej; document.head.appendChild(el); });
    svMLp = add('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js')
        .then(() => add('https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js'))
        .then(() => window.mobilenet.load({ version: 1, alpha: 0.5 }))
        .catch((err) => { svMLp = null; throw err; });
    return svMLp;
}
async function svGuessPhoto(dataUrl) {
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 25000));
    const run = (async () => {
        const model = await svLoadML();
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
        return svTagFromPredictions(await model.classify(img, 10));
    })();
    return Promise.race([run, timeout]);
}

// ---------- редактор ----------
function openServiceEditor(edit, after) {
    loginRequired(async () => {
        if (edit && edit.id && edit.photoCount && !edit.photos) {      // из списка пришло без фото — берём полную
            const { d } = await svApi('/api/services/' + encodeURIComponent(edit.id)).catch(() => ({}));
            if (!d || !d.ok) { showToast('Не удалось загрузить карточку'); return; }
            edit = d.service;
        }
        const s = Object.assign({}, edit || {}), e = escapeHtml;
        const photos = (s.photos || []).slice();
        const un = svUnpackText(s.text);
        const facts = {}; un.facts.forEach(([k, v]) => { facts[k] = v; });
        s.text = un.desc;
        openSheet(edit ? 'Изменить развлечение' : 'Новое развлечение', `
            <div class="form-h" style="margin:0 2px 8px">Что вы предлагаете?</div>
            <div class="sv-cats" id="svCats">${Object.keys(SV_TAGS).map(k => `<button type="button" class="sv-cat ${s.tag === k ? 'on' : ''}" data-tag="${k}"><i class="fas ${SV_ICONS[k]}"></i><span>${SV_CHIP_SHORT[k]}</span></button>`).join('')}</div>
            <div class="sv-suggest" id="svSuggest" hidden></div>
            <div class="form-h" style="margin:0 2px 8px">Фото · до ${SV_PHOTOS}</div>
            <div class="photo-grid sv-photo-grid" id="svPhotos"></div>
            <input type="file" id="svFile" accept="image/*" multiple hidden>
            <label class="field"><span>Название</span><input id="svTitle" maxlength="80" placeholder="Морская прогулка на катере" value="${e(s.title || '')}"></label>
            <div class="sv-extra" id="svExtra"></div>
            <div class="rq-row"><label class="field"><span>Цена, ₽</span><input id="svPrice" type="number" inputmode="numeric" min="1" value="${s.price || ''}" placeholder="Можно пусто"></label>
            <label class="field"><span>Как считать</span><select id="svUnit">${SV_UNITS.map(u => `<option value="${e(u)}" ${(s.unit || '') === u ? 'selected' : ''}>${u || '—'}</option>`).join('')}</select></label></div>
            <label class="field"><span>Город или место</span><input id="svCity" maxlength="60" value="${e(s.city || '')}" placeholder="Например: Архипо-Осиповка, причал"></label>
            <label class="field"><span>Куда подойти</span><input id="svPlace" maxlength="120" value="${e(s.place || '')}" placeholder="Например: причал №3, у синего катера"></label>
            ${mapPickHTML('Точка на карте: причал или место встречи', 'Нажмите на карту, чтобы отметить причал или место, куда подходить. Люди увидят карту под вашей карточкой и смогут проложить маршрут.')}
            <label class="field"><span>Описание</span><textarea id="svText" rows="4" maxlength="600" placeholder="Что входит, сколько длится, как договориться">${e(s.text || '')}</textarea></label>
            <div class="auth-error" id="svErr"></div>
            <button class="primary-btn wide-btn" id="svSave" type="button"><i class="fas fa-check"></i> ${edit ? 'Сохранить' : 'Опубликовать'}</button>`, (el) => {
            const grid = el.querySelector('#svPhotos'), file = el.querySelector('#svFile'), err = el.querySelector('#svErr'), btn = el.querySelector('#svSave');
            const paint = () => {
                grid.innerHTML = photos.map((src, i) => `<div class="photo-tile ${i === 0 ? 'cover' : ''}"><img src="${e(src)}" alt=""><button type="button" data-del="${i}" aria-label="Убрать фото"><i class="fas fa-xmark"></i></button></div>`).join('')
                    + (photos.length < SV_PHOTOS ? '<button type="button" class="photo-add"><i class="fas fa-camera"></i><span>Добавить</span></button>' : '');
            };
            paint();
            const picker = mapPickInit(el, s.coords, (name) => { const pl = el.querySelector('#svPlace'); if (pl && !pl.value.trim()) pl.value = name; });
            let tag = s.tag || '', userPicked = !!edit, guessSeq = 0;
            const extra = el.querySelector('#svExtra'), cats = el.querySelector('#svCats'), sug = el.querySelector('#svSuggest');
            const readFacts = () => { extra.querySelectorAll('[data-f]').forEach(inp => { facts[inp.dataset.f] = inp.value.trim(); }); };
            const paintExtra = () => {
                const list = SV_FIELDS[tag] || [];
                if (!tag) { extra.innerHTML = '<p class="sv-extra-note">Выберите категорию — появятся нужные поля: длительность, вместимость, возраст и другое.</p>'; return; }
                if (!list.length) { extra.innerHTML = ''; return; }
                extra.innerHTML = `<div class="form-h" style="margin:2px 2px 8px">${e(SV_TAGS[tag])} · подробности</div><div class="sv-extra-grid">` + list.map(f => {
                    const val = facts[f.k] || '';
                    return f.o
                        ? `<label class="field"><span>${e(f.k)}</span><select data-f="${e(f.k)}">${f.o.map(o => `<option value="${e(o)}" ${val === o ? 'selected' : ''}>${o || '—'}</option>`).join('')}</select></label>`
                        : `<label class="field"><span>${e(f.k)}</span><input data-f="${e(f.k)}" maxlength="60" value="${e(val)}" placeholder="${e(f.ph || '')}"></label>`;
                }).join('') + '</div>';
            };
            const setTag = (t, picked) => {
                readFacts();
                tag = t; if (picked) userPicked = true;
                cats.querySelectorAll('.sv-cat').forEach(b => b.classList.toggle('on', b.dataset.tag === tag));
                paintExtra(); showSuggest('');
            };
            const showSuggest = (t, why) => {
                if (!t || t === tag) { sug.hidden = true; sug.innerHTML = ''; return; }
                sug.hidden = false;
                sug.innerHTML = `<i class="fas fa-wand-magic-sparkles"></i><span>${why === 'photo' ? 'По фото похоже на' : 'Похоже на'} «${e(SV_TAGS[t])}»</span><button type="button" data-pick="${t}">Выбрать</button>`;
            };
            cats.addEventListener('click', (ev) => { const b = ev.target.closest('.sv-cat'); if (b) setTag(b.dataset.tag, true); });
            sug.addEventListener('click', (ev) => { const b = ev.target.closest('[data-pick]'); if (b) setTag(b.dataset.pick, true); });
            paintExtra();
            const textGuess = () => { if (userPicked && tag) return; const g = svGuessText(el.querySelector('#svTitle').value + ' ' + el.querySelector('#svText').value); if (g) showSuggest(g, 'text'); };
            let tg = 0; const onType = () => { clearTimeout(tg); tg = setTimeout(textGuess, 500); };
            el.querySelector('#svTitle').addEventListener('input', onType);
            el.querySelector('#svText').addEventListener('input', onType);
            const photoGuess = async () => {
                if (!photos[0] || (userPicked && tag)) return;
                const seq = ++guessSeq;
                sug.hidden = false; sug.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Определяю категорию по фото…</span>';
                let g = '';
                try { g = await svGuessPhoto(photos[0]); } catch (_) {}
                if (seq !== guessSeq) return;
                if (g) showSuggest(g, 'photo'); else { sug.hidden = true; sug.innerHTML = ''; }
            };
            grid.addEventListener('click', (ev) => {
                const del = ev.target.closest('[data-del]');
                if (del) { photos.splice(Number(del.dataset.del), 1); paint(); return; }
                if (ev.target.closest('.photo-add')) file.click();
            });
            file.addEventListener('change', async () => {
                const list = Array.from(file.files || []).slice(0, SV_PHOTOS - photos.length);
                file.value = '';
                for (const f of list) {
                    try { photos.push(await svPhoto(f)); } catch (_) { err.textContent = 'Не удалось обработать фото'; }
                }
                paint();
                if (list.length && photos.length === list.length) photoGuess();
            });
            btn.addEventListener('click', async () => {
                const v = (id) => el.querySelector(id).value.trim();
                if (!v('#svTitle')) { err.textContent = 'Напишите название'; return; }
                if (!tag) { err.textContent = 'Выберите категорию'; el.querySelector('#svCats').scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
                readFacts();
                const fullText = svPackText(tag, facts, v('#svText'));
                if (fullText.length > 800) { err.textContent = 'Слишком длинно: сократите описание'; return; }
                err.textContent = ''; btn.disabled = true;
                let thumb = '';
                try { if (photos[0]) thumb = await svThumb(photos[0]); } catch (_) {}
                const body = { id: s.id, title: v('#svTitle'), tag, price: v('#svPrice'), unit: el.querySelector('#svUnit').value, city: v('#svCity'), place: v('#svPlace'), coords: picker.get() || null, text: fullText, photos, thumb };
                try {
                    const { status, d } = await svApi('/api/services', { method: 'POST', headers: svAuth(), body: JSON.stringify(body) });
                    if (status === 401) { clearSession(); err.textContent = 'Сессия истекла. Войдите снова.'; btn.disabled = false; return; }
                    if (!d || !d.ok) { err.textContent = (d && d.message) || 'Не удалось сохранить'; btn.disabled = false; return; }
                    closeSheet();
                    showToast(edit ? 'Карточка обновлена' : 'Карточка опубликована');
                    afterServiceChange();
                    after && after(d.service);
                    if (!edit && typeof pubShowService === 'function') setTimeout(() => pubShowService(d.service), 120);
                } catch (_) { err.textContent = 'Нет связи с сервером'; btn.disabled = false; }
            });
        });
    });
}

function afterServiceChange() {
    loadMyServices(() => { mountMyServices(); });
    if (typeof dvRefreshSvc === 'function') dvRefreshSvc();
    if (typeof reqSection === 'function' && reqSection() === 'services' && document.getElementById('chatMessages')) loadRequests();
}

// ---------- действия ----------
function bumpService(id) {
    svApi('/api/services/' + encodeURIComponent(id) + '/bump', { method: 'POST', headers: svAuth(), body: '{}' }).then(({ d }) => {
        if (d && d.ok) { closeSheet(); showToast('Карточка поднята наверх'); afterServiceChange(); return; }
        showToast(d && d.code === 'BUMP_WAIT' && d.wait ? `Поднять можно раз в 6 часов. Через ${svWait(d.wait)}` : ((d && d.message) || 'Не удалось поднять'));
    }).catch(() => showToast('Нет связи с сервером'));
}
function deleteService(id) {
    if (!confirm('Удалить карточку развлечения?')) return;
    svApi('/api/services/' + encodeURIComponent(id), { method: 'DELETE', headers: svAuth() }).then(({ d }) => {
        if (d && d.ok) { closeSheet(); showToast('Карточка удалена'); afterServiceChange(); }
        else showToast((d && d.message) || 'Не удалось удалить');
    }).catch(() => showToast('Нет связи с сервером'));
}

// ---------- «Мои развлечения» теперь на вкладке «Мои публикации» ----------
function mountMyServices() { if (typeof paintPubs === 'function') paintPubs(); }

// ---------- «Предлагаю / Сдаю»: старое или новое ----------
function chooserRow(thumb, title, sub, btns) {
    const e = escapeHtml;
    return `<div class="rp-row"><div class="rp-thumb">${thumb ? `<img src="${e(thumb)}" alt="">` : '<i class="fas fa-image"></i>'}</div>
        <div class="rp-info"><b>${e(title)}</b><small>${e(sub)}</small></div><div class="rp-btns">${btns}</div></div>`;
}

function openServiceFlow() {
    loginRequired(() => loadMyServices(() => {
        if (!myServices.length) { openServiceEditor(); return; }
        const rows = myServices.slice(0, SV_MAX).map(s => chooserRow(s.thumb, s.title, svPrice(s),
            `<button type="button" class="rp-main" data-sv="bump" data-id="${escapeHtml(s.id)}">Поднять</button><button type="button" data-sv="edit" data-id="${escapeHtml(s.id)}" aria-label="Изменить"><i class="fas fa-pen"></i></button>`)).join('');
        openSheet('Предлагаю развлечение', `
            <p class="auth-note" style="margin:0 4px 12px">У вас уже есть развлечения. Опубликуйте одну из них заново — она встанет наверх раздела, — или создайте новую.</p>
            <div class="rp-list">${rows}</div>
            ${myServices.length < SV_MAX ? '<button type="button" class="primary-btn wide-btn" data-sv="new"><i class="fas fa-plus"></i> Создать новую карточку</button>' : '<p class="auth-note" style="margin:8px 4px 0">Достигнут предел: 10 карточек. Удалите ненужную во вкладке «Мои публикации».</p>'}`);
    }));
}

// Работа и поездки: старые карточки из «Моих запросов»
function openCardFlow(kind) {
    kind = kind === 'offer' ? 'offer' : 'seek';
    if (!getToken()) { openCardSheet(kind); return; }
    svApi('/api/requests?mine=1&status=all', { headers: { Authorization: 'Bearer ' + getToken() } }).then(({ d }) => {
        const sec = reqSection();
        const old = d && d.ok ? (d.requests || []).filter(r => r.section === sec && r.kind === kind).sort((a, b) => b.created - a.created).slice(0, 4) : [];
        if (!old.length) { openCardSheet(kind); return; }
        window._cardFlow = old;
        const rows = old.map(r => {
            const live = r.status === 'active';
            return chooserRow('', r.title || 'Без названия', live ? 'Сейчас опубликована' : 'Не активна',
                live ? `<button type="button" class="rp-main" data-cf="edit" data-id="${escapeHtml(r.id)}">Изменить</button>`
                     : `<button type="button" class="rp-main" data-cf="again" data-id="${escapeHtml(r.id)}">Опубликовать снова</button>`);
        }).join('');
        openSheet(SEC[sec][kind].head, `
            <p class="auth-note" style="margin:0 4px 12px">Ваши прежние карточки. Опубликуйте старую заново или создайте новую.</p>
            <div class="rp-list">${rows}</div>
            <button type="button" class="primary-btn wide-btn" data-cf="new" data-kind="${kind}"><i class="fas fa-plus"></i> Создать новую карточку</button>`);
    }).catch(() => openCardSheet(kind));
}

// Жильё: поднять своё объявление или создать новое
const _openAdFormSv = openAdForm;
openAdForm = function (editId) {
    if (editId) return _openAdFormSv.apply(this, arguments);
    const acc = typeof getAccount === 'function' ? getAccount() : null;
    if (!acc) return _openAdFormSv.apply(this, arguments);
    const mine = myAdsAll().filter(a => a.mine && isRemoteAdId(a.id));
    if (!mine.length) return _openAdFormSv.apply(this, arguments);
    const rows = mine.slice(0, 6).map(a => chooserRow(a.image || (a.photos && a.photos[0]) || '', a.title, a.price || '',
        `<button type="button" class="rp-main" data-ad-bump="${escapeHtml(String(a.id))}">Поднять</button><button type="button" data-ad-edit="${escapeHtml(String(a.id))}" aria-label="Изменить"><i class="fas fa-pen"></i></button>`)).join('');
    openSheet('Сдать жильё', `
        <p class="auth-note" style="margin:0 4px 12px">Вы уже публиковали жильё. Опубликуйте его заново — объявление встанет наверх, — или добавьте новое.</p>
        <div class="rp-list">${rows}</div>
        <button type="button" class="primary-btn wide-btn" data-ad-new><i class="fas fa-plus"></i> Добавить новое жильё</button>`);
};

function bumpListing(id) {
    svApi('/api/listings/' + encodeURIComponent(id) + '/bump', { method: 'POST', headers: svAuth(), body: '{}' }).then(({ d }) => {
        if (d && d.ok) { closeSheet(); showToast('Объявление поднято наверх'); if (typeof fetchRemoteAds === 'function') fetchRemoteAds(); return; }
        showToast(d && d.code === 'BUMP_WAIT' && d.wait ? `Поднять можно раз в 6 часов. Через ${svWait(d.wait)}` : ((d && d.message) || 'Не удалось поднять'));
    }).catch(() => showToast('Нет связи с сервером'));
}

// ---------- общий обработчик нажатий ----------
document.addEventListener('click', (ev) => {
    const t = ev.target;
    const sv = t.closest('[data-sv]');
    if (sv) {
        const id = sv.dataset.id, act = sv.dataset.sv;
        const known = () => myServices.find(x => x.id === id) || serviceFeed.find(x => x.id === id);
        if (act === 'view') openServiceView(id);
        else if (act === 'new') { closeSheet(); openServiceEditor(); }
        else if (act === 'edit') { const s = known(); closeSheet(); openServiceEditor(s || { id, photoCount: 1 }); }
        else if (act === 'map') {
            const s = known();
            if (s && s.coords) { closeSheet(); setTimeout(() => openServiceMap(s), 60); }
            else svApi('/api/services/' + encodeURIComponent(id)).then(({ d }) => { if (d && d.ok) { closeSheet(); setTimeout(() => openServiceMap(d.service), 60); } });
        }
        else if (act === 'bump') bumpService(id);
        else if (act === 'del') deleteService(id);
        else if (act === 'write') {
            const s = known();
            if (s) { closeSheet(); writeAboutService(id, s.title, s.ownerName); }
            else svApi('/api/services/' + encodeURIComponent(id)).then(({ d }) => { if (d && d.ok) { closeSheet(); writeAboutService(id, d.service.title, d.service.ownerName); } });
        }
        return;
    }
    const cf = t.closest('[data-cf]');
    if (cf) {
        const r = (window._cardFlow || []).find(x => x.id === cf.dataset.id);
        closeSheet();
        if (cf.dataset.cf === 'new') openCardSheet(cf.dataset.kind);
        else if (cf.dataset.cf === 'edit' && r) openCardSheet(r.kind, r);
        else if (cf.dataset.cf === 'again' && r) openCardSheet(r.kind, null, r);
        return;
    }
    const b = t.closest('[data-ad-bump]'); if (b) { bumpListing(b.dataset.adBump); return; }
    const ed = t.closest('[data-ad-edit]'); if (ed) { closeSheet(); _openAdFormSv(ed.dataset.adEdit); return; }
    if (t.closest('[data-ad-new]')) { closeSheet(); _openAdFormSv(); }
});

// ============================================
// Быстрый поиск в разделе «Развлечения»: строка и категории над лентой.
// Фильтр работает по тому, что уже загружено, поэтому отвечает сразу.
// ============================================
let entTag = '', entQ = '';

function entBarHTML() {
    const e = escapeHtml;
    const chip = (t, label, icon) => `<button type="button" role="tab" class="cat-chip ent-chip ${entTag === t ? 'on' : ''}" data-t="${t}" aria-selected="${entTag === t}"><i class="fas ${icon}"></i><span>${label}</span><b></b></button>`;
    return `<div class="ent-bar" id="entBar">
        <label class="ent-search"><i class="fas fa-magnifying-glass"></i>
            <input id="entQ" type="search" enterkeyhint="search" autocomplete="off" maxlength="40" placeholder="Поиск: катер, джипы, дельфины…" value="${e(entQ)}">
            <button type="button" id="entClear" aria-label="Очистить" ${entQ ? '' : 'hidden'}><i class="fas fa-xmark"></i></button></label>
        <div class="cat-chips ent-chips" role="tablist" aria-label="Категория">${chip('', 'Все', 'fa-border-all')}${Object.entries(SV_TAGS).map(([t, l]) => chip(t, l, SV_ICONS[t])).join('')}</div></div>`;
}

function setupEntBar() {
    if (typeof currentRoom !== 'string' || currentRoom !== 'services') return;
    const scr = document.getElementById('group-screen');
    if (!scr || document.getElementById('entBar')) return;
    const head = scr.querySelector('.room-head');
    if (!head) return;
    head.insertAdjacentHTML('afterend', entBarHTML());
    const bar = document.getElementById('entBar'), q = bar.querySelector('#entQ'), clr = bar.querySelector('#entClear');
    q.addEventListener('input', () => { entQ = q.value.trim().toLowerCase(); clr.hidden = !entQ; applyEntFilter(); });
    q.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); q.blur(); } });
    clr.addEventListener('click', () => { q.value = ''; entQ = ''; clr.hidden = true; applyEntFilter(); q.focus(); });
    bar.querySelector('.ent-chips').addEventListener('click', (ev) => {
        const c = ev.target.closest('.ent-chip'); if (!c) return;
        entTag = c.dataset.t;
        bar.querySelectorAll('.ent-chip').forEach(x => { const on = x === c; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); });
        applyEntFilter();
    });
    applyEntFilter();
}

function applyEntFilter() {
    const msgs = document.getElementById('chatMessages');
    if (!msgs || currentRoom !== 'services') return;
    const items = Array.from(msgs.querySelectorAll('.req-item'));
    const counts = {};
    items.forEach(it => { if (it.dataset.tag) counts[it.dataset.tag] = (counts[it.dataset.tag] || 0) + 1; });
    document.querySelectorAll('#entBar .ent-chip').forEach(c => {
        const n = c.dataset.t ? (counts[c.dataset.t] || 0) : Object.values(counts).reduce((a, b) => a + b, 0);
        const b = c.querySelector('b'); if (b) b.textContent = n || '';
    });
    const active = !!(entTag || entQ);
    let shown = 0;
    items.forEach(it => {
        const okTag = !entTag || it.dataset.tag === entTag;
        const okQ = !entQ || it.textContent.toLowerCase().includes(entQ);
        const ok = okTag && okQ;
        it.classList.toggle('ent-off', !ok);
        if (ok) shown++;
    });
    let none = document.getElementById('entNone');
    if (active && !shown) {
        if (!none) { none = document.createElement('div'); none.id = 'entNone'; none.className = 'req-empty'; msgs.appendChild(none); }
        none.innerHTML = '<i class="fas fa-magnifying-glass"></i><b>Ничего не нашлось</b><span>Попробуйте другое слово или категорию «Все».</span>';
    } else if (none) none.remove();
    const empty = document.getElementById('reqEmpty'); if (empty && active) empty.hidden = true;
}

const _paintRequestsEnt = paintRequests;
paintRequests = function () { const r = _paintRequestsEnt.apply(this, arguments); applyEntFilter(); return r; };
const _openGroupEnt = openGroup;
openGroup = function (id) {
    if (id !== 'services') { entTag = ''; entQ = ''; }
    const r = _openGroupEnt.apply(this, arguments);
    if (id === 'services') setTimeout(setupEntBar, 80);
    return r;
};
