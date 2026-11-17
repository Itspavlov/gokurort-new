// ============================================
// PUBLICATIONS.JS — вкладка «Мои публикации».
// Всё, что человек опубликовал, в одном месте: жильё, работа, поездки,
// развлечения и курортный движ. Сверху чипсы-разделы, под ними список.
// Раньше эти списки лежали в профиле.
// ============================================
const PUB_CHIPS = [
    ['housing', 'Жильё', 'fa-house'],
    ['work', 'Работа', 'fa-briefcase'],
    ['trips', 'Поездки', 'fa-car-side'],
    ['services', 'Развлечения', 'fa-sailboat'],
    ['dviz', 'Поиски компаний', 'fa-champagne-glasses']
];
let pubChip = 'housing';
// у каждого раздела две вкладки: ads — объявления, req — запросы (у «Развлечений» вторая — поиски компании)
let pubTab = { housing: 'ads', work: 'ads', trips: 'ads', services: 'ads' };
try {
    let c = localStorage.getItem('yugi-pubchip');
    if (PUB_CHIPS.some(x => x[0] === c)) pubChip = c;
    const t = JSON.parse(localStorage.getItem('yugi-pubtab') || '{}');
    for (const k in pubTab) if (t[k] === 'ads' || t[k] === 'req') pubTab[k] = t[k];
} catch (_) {}
let pubQuota = null;

const pubAcc = () => (typeof getAccount === 'function' ? getAccount() : null);
const pubReqs = (sec) => (typeof myReqs !== 'undefined' ? myReqs : []).filter(r => (r.section || 'housing') === sec);
const pubDviz = () => { const a = pubAcc(); return (a && typeof dvFeed !== 'undefined') ? dvFeed.filter(e => e.ownerId === a.id) : []; };
const pubSv = () => (typeof myServices !== 'undefined' ? myServices : []);
const pubActive = (list) => list.filter(r => r.status === 'active');

// что лежит на вкладке: объявления или запросы раздела
function pubItems(sec, tab) {
    if (sec === 'housing') return tab === 'ads' ? myAdsAll() : pubReqs('housing');
    if (sec === 'work' || sec === 'trips') return pubReqs(sec).filter(r => (r.kind === 'offer') === (tab === 'ads'));
    if (sec === 'dviz') return pubDviz();
    return pubSv();
}
// число на вкладке: объявления считаем все, запросы — только активные
function pubCount(sec, tab) {
    const list = pubItems(sec, tab);
    return (sec === 'housing' && tab === 'ads') || sec === 'services' || sec === 'dviz' ? list.length : pubActive(list).length;
}

// сколько у человека опубликовано в каждом разделе (для цифр на чипсах)
function pubCounts() {
    return {
        housing: pubCount('housing', 'ads') + pubCount('housing', 'req'),
        work: pubCount('work', 'ads') + pubCount('work', 'req'),
        trips: pubCount('trips', 'ads') + pubCount('trips', 'req'),
        services: pubCount('services', 'ads'),
        dviz: pubCount('dviz', 'ads')
    };
}

// активная кнопка раздела встаёт в видимую часть ряда
function pubCenterChip() {
    const row = document.querySelector('#pubRoot .pub-chips'), on = row && row.querySelector('.cat-chip.on');
    if (!on) return;
    const to = on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2;
    row.scrollTo ? row.scrollTo({ left: Math.max(0, to), behavior: 'smooth' }) : (row.scrollLeft = Math.max(0, to));
}

function pubSetSection() { window._reqSecOverride = pubChip; }

function renderMyPubs() {
    const root = document.getElementById('pubRoot');
    if (!root) return;
    const acc = pubAcc();
    pubSetSection();
    if (!getToken() || !acc) {
        root.innerHTML = `<div class="pf-login"><span>Войдите, чтобы видеть свои объявления, запросы и карточки</span><button class="primary-btn" onclick="openAuthSheet(null,'login')">Войти</button></div>`;
        return;
    }
    root.innerHTML = `<div class="cat-chips-wrap pub-chips-wrap"><div class="cat-chips pub-chips" role="tablist" aria-label="Раздел">${PUB_CHIPS.map(([k, l, ic]) =>
        `<button type="button" role="tab" class="cat-chip ${pubChip === k ? 'on' : ''}" data-pc="${k}" aria-selected="${pubChip === k}"><i class="fas ${ic}"></i><span>${l}</span><b hidden></b></button>`).join('')}</div></div>
        <div id="pubBody" class="pub-body"></div>`;
    paintPubs();
    pubCenterChip();
    // подгружаем свежее; каждое обновление перерисовывает список
    if (typeof refreshMyRequests === 'function') refreshMyRequests();
    if (typeof loadMyServices === 'function') loadMyServices(paintPubs);
    if (typeof fetchRemoteAds === 'function') fetchRemoteAds();
    if (typeof loadDviz === 'function') loadDviz();
    if (typeof refreshMatchingRequests === 'function') refreshMatchingRequests();
    if (typeof loadQuota === 'function') loadQuota((q) => { pubQuota = q; paintPubs(); });
}

const pubEmpty = (text) => `<p class="pf-empty">${text}</p>`;

// кнопка размещения на каждой вкладке: data-pub — действие, подпись по-русски
const PUB_ACT = {
    housing: { ads: ['hoffer', 'Разместить объявление'], req: ['hseek', 'Разместить запрос'] },
    work: { ads: ['offer', 'Разместить объявление'], req: ['seek', 'Разместить запрос'] },
    trips: { ads: ['offer', 'Разместить объявление'], req: ['seek', 'Разместить запрос'] },
    services: { ads: ['svnew', 'Разместить объявление'] },
    dviz: { ads: ['dviz', 'Разместить запрос'] }
};
const PUB_EMPTY = {
    housing: { ads: ['fa-house', 'Объявлений пока нет', 'Сдаёте или продаёте жильё? Нажмите кнопку выше.'], req: ['fa-magnifying-glass-location', 'Запросов пока нет', 'Ищете жильё? Разместите запрос: хозяева сами предложат варианты.'] },
    work: { ads: ['fa-briefcase', 'Объявлений пока нет', 'Нужен сотрудник? Разместите вакансию кнопкой выше.'], req: ['fa-briefcase', 'Запросов пока нет', 'Ищете работу? Разместите запрос кнопкой выше.'] },
    trips: { ads: ['fa-car-side', 'Объявлений пока нет', 'Едете и есть свободные места? Разместите поездку кнопкой выше.'], req: ['fa-car-side', 'Запросов пока нет', 'Нужна поездка? Разместите запрос кнопкой выше.'] },
    services: { ads: ['fa-sailboat', 'Объявлений пока нет', 'Катаете на катере, водите экскурсии, возите на джипах? Добавьте объявление с фото: его увидят в разделе «Развлечения».'] },
    dviz: { ads: ['fa-champagne-glasses', 'Поисков компании пока нет', 'Зовёте компанию на прогулку, джипы или волейбол? Разместите запрос: желающие откликнутся и напишут.'] }
};

function pubTabsHTML(sec) {
    if (sec === 'services' || sec === 'dviz') return '';
    const lbl = ['Объявления', 'Запросы'];
    return `<div class="seek-tabs pub-tabs" role="tablist" aria-label="Что показать">${['ads', 'req'].map((t, i) =>
        `<button type="button" role="tab" class="seek-tab ${pubTab[sec] === t ? 'on' : ''}" data-pt="${t}" aria-selected="${pubTab[sec] === t}">${lbl[i]} <b>(${pubCount(sec, t)})</b></button>`).join('')}</div>`;
}

function pubActionHTML(sec, tab) {
    const [k, label] = PUB_ACT[sec][tab];
    if (k === 'svnew' && pubSv().length >= (typeof SV_MAX !== 'undefined' ? SV_MAX : 10)) return '<p class="auth-note pub-act">Достигнут предел карточек. Удалите ненужную, чтобы добавить новую.</p>';
    return `<button type="button" class="primary-btn wide-btn pub-act" ${k === 'svnew' ? 'data-sv="new"' : `data-pub="${k}"`}><i class="fas fa-plus"></i> ${label}</button>`;
}

function pubEmptyHTML(sec, tab) {
    const [ic, t, sub] = PUB_EMPTY[sec][tab];
    return `<div class="req-empty"><i class="fas ${ic}"></i><b>${t}</b><span>${sub}</span></div>`;
}

// все карточки «Моих публикаций» одного вида и размера, как у «Развлечений»: фото слева, справа название, цена, подпись; внизу кнопки
function pubCardHTML(o) {
    const e = escapeHtml;
    const thumb = o.img ? `<img src="${e(o.img)}" alt="" loading="lazy">` : `<i class="fas ${o.icon || 'fa-image'}"></i>`;
    return `<div class="sv-card pub-card${o.cls ? ' ' + o.cls : ''}"${o.attrs || ''}>
        <div class="sv-main"${o.open ? ` onclick="${o.open}"` : ''}>
            <div class="sv-thumb">${thumb}</div>
            <div class="sv-info">
                <b class="sv-title">${e(o.title)}</b>
                <span class="sv-price">${e(o.price || '')}</span>
                <small class="sv-meta">${o.meta || ''}</small>
            </div>
        </div>
        <div class="sv-actions">${o.actions}</div></div>`;
}

function pubAdsHTML() {
    const e = escapeHtml, mine = myAdsAll();
    // «Скрыто» — объявление лежит только на этом устройстве и ещё не опубликовано для всех; «Активно» — его видят все
    const localIds = new Set(getMyAds().map(a => String(a.id)));
    return mine.map(ad => {
        const hid = localIds.has(String(ad.id));
        return pubCardHTML({
            img: ad.image, icon: 'fa-image', title: ad.title, price: ad.price,
            open: `openListing('${ad.id}')`,
            meta: `<span class="ad-status ${hid ? 'off' : 'on'}">${hid ? 'Скрыто' : 'Активно'}</span>${ad.location ? `<span><i class="fas fa-location-dot"></i>${e(ad.location)}</span>` : ''}`,
            actions: `<button type="button" onclick="openAdForm('${ad.id}')"><i class="fas fa-pen"></i> Изменить</button><button type="button" onclick="deleteMyAd('${ad.id}')" data-del-ad aria-label="Удалить"><i class="fas fa-trash"></i></button>`
        });
    }).join('');
}

// запрос или объявление в Работе/Поездках/Жилье: та же карточка; кнопки обрабатывает onReqCardClick
function pubReqCardHTML(r) {
    const e = escapeHtml, housing = typeof isHousingReq === 'function' && isHousingReq(r);
    const seek = r.kind !== 'offer';
    const icon = r.section === 'work' ? 'fa-briefcase' : r.section === 'trips' ? 'fa-car-side' : 'fa-magnifying-glass-location';
    // картинка: первое фото поездки или иллюстрация вакансии
    let img = '';
    const ph = (Array.isArray(r.photos) ? r.photos : []).filter(id => typeof MEDIA_ID_RE !== 'undefined' && MEDIA_ID_RE.test(String(id)));
    if (ph.length && typeof carUrl === 'function') img = carUrl(ph[0]);
    else if (r.section === 'work' && r.art && typeof artKnown === 'function' && artKnown(r.art) && typeof artSrc === 'function') img = artSrc(r.art);
    const title = r.title || (housing ? 'Запрос на жильё' : 'Без названия');
    const price = r.budget ? (seek && r.section !== 'work' ? 'до ' : '') + Number(r.budget).toLocaleString('ru-RU') + ' ₽' : '';
    const st = r.status !== 'active' ? ((typeof REQ_STATUS !== 'undefined' && REQ_STATUS[r.status]) || '') : (seek ? 'Ищет' : 'Предлагает');
    const place = [r.city, housing ? r.district : ''].filter(Boolean).join(', ');
    const meta = `<span class="req-kind ${r.status !== 'active' ? 'off' : (seek ? 'seek' : 'offer')}">${e(st)}</span>${place ? `<span><i class="fas fa-location-dot"></i>${e(place)}</span>` : ''}`;
    let act = '';
    if (r.status === 'active') {
        act = (housing ? `<button type="button" data-act="options"><i class="fas fa-house-circle-check"></i> Варианты${r.matchCount ? ': ' + r.matchCount : ''}</button>` : '')
            + `<button type="button" data-act="edit"><i class="fas fa-pen"></i> Изменить</button>`
            + (housing ? '' : `<button type="button" data-act="closed">Закрыть</button>`);
    }
    act += `<button type="button" class="req-del-btn" data-act="delete" aria-label="Удалить"><i class="fas fa-trash"></i><span hidden>Удалить</span></button>`;
    return pubCardHTML({ img, icon, title, price, meta, actions: act, cls: 'req-card pub-rq', attrs: ` data-rid="${e(r.id)}"` });
}

function pubReqListHTML(list) {
    const act = pubActive(list), hist = list.filter(r => r.status !== 'active');
    const row = pubReqCardHTML;
    return (act.length ? '<div class="opt-sec">Активные</div>' + act.map(row).join('') : '')
        + (hist.length ? '<div class="opt-sec" style="margin-top:8px">История</div>' + hist.slice(0, 15).map(row).join('') : '');
}

function paintPubs() {
    const body = document.getElementById('pubBody');
    if (!body) return;
    const chips = document.querySelectorAll('#pubRoot .cat-chip[data-pc]');
    const counts = pubCounts();
    chips.forEach(c => { const b = c.querySelector('b'), n = counts[c.dataset.pc] || 0; if (b) { b.hidden = !n; b.textContent = String(n); } });
    const sec = pubChip, tab = pubTab[sec] || 'ads';
    let list = pubItems(sec, tab);
    let inner = '', shown = list.length;
    if (sec === 'housing' && tab === 'ads') {
        shown = myAdsAll().length;
        if (shown) inner = `<div class="sv-list">${pubAdsHTML()}</div>`;
    } else if (sec === 'services') {
        inner = shown ? `<div class="sv-list">${list.map(s => serviceCardHTML(s, true)).join('')}</div>` : '';
        // прежние запросы раздела (если остались) не теряем: они лежат под карточками
        const old = pubReqs('services');
        if (old.length) { inner += `<div class="sv-list" id="pubReqs">${pubReqListHTML(old)}</div>`; shown = shown || old.length; }
    } else if (sec === 'dviz') {
        inner = shown ? `<div class="dv-feed pub-dv" id="pubDv">${list.map(dvCardHTML).join('')}</div>` : '';
    } else {
        inner = shown ? `<div class="sv-list" id="pubReqs">${pubReqListHTML(list)}</div>` : '';
    }
    let h = pubTabsHTML(sec) + pubActionHTML(sec, tab) + (shown ? inner : pubEmptyHTML(sec, tab));
    if (sec === 'housing' && tab === 'ads') {
        if (pubQuota) h += `<div class="quota-line pub-quota${pubQuota.left === 0 ? ' full' : ''}"><i class="fas fa-calendar-plus"></i><span>${escapeHtml(quotaText(pubQuota))}</span></div>`;
        const hasMatch = typeof matchReqs !== 'undefined' && matchReqs.length;
        h += `<div class="pf-menu pub-match"><button type="button" class="pf-row" id="rowMatch" onclick="openMatchingSheet()" ${hasMatch ? '' : 'hidden'}><i class="fas fa-users"></i><span>Подходящие арендаторы</span><em id="rowMatchCount" ${hasMatch ? '' : 'hidden'}>${hasMatch ? matchReqs.length : 0}</em><i class="fas fa-chevron-right pf-go"></i></button></div>`;
    }
    body.innerHTML = h;
}

// ---------- нажатия ----------
document.addEventListener('click', (ev) => {
    const root = document.getElementById('pubRoot');
    if (!root || !root.contains(ev.target)) return;
    const chip = ev.target.closest('.cat-chip[data-pc]');
    if (chip) {
        pubChip = chip.dataset.pc;
        try { localStorage.setItem('yugi-pubchip', pubChip); } catch (_) {}
        pubSetSection();
        root.querySelectorAll('.cat-chip[data-pc]').forEach(c => { const on = c === chip; c.classList.toggle('on', on); c.setAttribute('aria-selected', String(on)); });
        paintPubs();
        pubCenterChip();
        window.scrollTo({ top: 0 });
        return;
    }
    const pt = ev.target.closest('[data-pt]');
    if (pt) {
        pubTab[pubChip] = pt.dataset.pt === 'req' ? 'req' : 'ads';
        try { localStorage.setItem('yugi-pubtab', JSON.stringify(pubTab)); } catch (_) {}
        paintPubs();
        return;
    }
    const act = ev.target.closest('[data-pub]');
    if (act) {
        const k = act.dataset.pub;
        pubSetSection();
        if (k === 'hoffer') openAdForm();
        else if (k === 'hseek') openRequestSheet();
        else if (k === 'seek') openCardFlow('seek');
        else if (k === 'offer') openCardFlow('offer');
        else if (k === 'dviz') openDvizForm();
        return;
    }
    if (ev.target.closest('#pubReqs')) {
        const del = ev.target.closest('.pub-rq [data-act="delete"]');
        if (del) {          // первое нажатие просит подтвердить, второе удаляет
            if (!del.classList.contains('sure')) {
                del.classList.add('sure'); del.innerHTML = '<i class="fas fa-trash"></i> Точно?';
                setTimeout(() => { if (del.isConnected) { del.classList.remove('sure'); del.innerHTML = '<i class="fas fa-trash"></i><span hidden>Удалить</span>'; } }, 3000);
                return;
            }
            const rid = del.closest('.pub-rq').dataset.rid;
            del.disabled = true;
            fetch(`${SERVER_URL}/api/requests/${encodeURIComponent(rid)}`, { method: 'DELETE', headers: reqAuthHeaders() }).then(r => r.json()).then(d => {
                if (!d.ok) { del.disabled = false; showToast(d.message || 'Не удалось удалить'); return; }
                myReqs = myReqs.filter(x => x.id !== rid);
                paintMyRequests(); showToast('Удалено'); if (typeof loadRequests === 'function') loadRequests();
            }).catch(() => { del.disabled = false; showToast('Нет связи с сервером'); });
            return;
        }
        const b = ev.target.closest('.pub-rq button[data-act]');
        if (b) {
            const rr = myReqs.find(x => x.id === b.closest('.pub-rq').dataset.rid);
            if (rr && b.dataset.act === 'edit') { if (typeof isHousingReq === 'function' && isHousingReq(rr)) openRequestSheet(rr); else onReqCardClick(ev); return; }
            onReqCardClick(ev);
        }
        return;
    }
    if (ev.target.closest('#pubDv')) onFeedClick(ev);
});
// ---------- обновления из других модулей ----------
if (typeof renderProfile === 'function') {
    const _rpPub = renderProfile;
    renderProfile = function () { const r = _rpPub.apply(this, arguments); if (document.getElementById('pubBody')) paintPubs(); return r; };
}
if (typeof fetchRemoteAds === 'function') {
    const _fraPub = fetchRemoteAds;
    fetchRemoteAds = async function () { const r = await _fraPub.apply(this, arguments); paintPubs(); return r; };
}
if (typeof paintDviz === 'function') {
    const _pdPub = paintDviz;
    paintDviz = function () { const r = _pdPub.apply(this, arguments); if (document.getElementById('pubBody') && pubChip === 'dviz') paintPubs(); return r; };
}
// как только открыт чат раздела, раздел снова берётся из самого чата
if (typeof openGroup === 'function') {
    const _ogPub = openGroup;
    openGroup = function () { window._reqSecOverride = ''; return _ogPub.apply(this, arguments); };
}

// ============================================
// После «Опубликовать»: форма закрывается, человек выходит из поиска/«Моих публикаций» и видит ленту,
// где появилась его карточка: нужная комната, нужная вкладка, карточка подсвечена.
// ============================================
function pubFlash(sel, tries) {
    tries = tries || 0;
    const el = document.querySelector(sel);
    if (!el) { if (tries < 12) setTimeout(() => pubFlash(sel, tries + 1), 300); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('pub-new');
    setTimeout(() => el.classList.remove('pub-new'), 2600);
}

// o: { section: 'housing'|'work'|'trips', kind: 'seek'|'offer', rid, adId, room }
function pubShowInFeed(o) {
    window._reqSecOverride = '';
    const room = o.room || (o.section === 'housing' ? 'housing' : o.section);
    const grp = document.getElementById('group-screen');
    const here = typeof currentRoom === 'string' && grp && grp.offsetParent !== null && document.getElementById('chatMessages')
        && (room === currentRoom || (o.section === 'housing' && !o.adId && typeof isHousingRoom === 'function' && isHousingRoom(currentRoom)));
    const q = o.adId ? '.chat-message-ad[data-ad-id="' + String(o.adId).replace(/"/g, '') + '"]' : '.req-item[data-rid="' + String(o.rid || '').replace(/"/g, '') + '"]';
    const go = () => {
        reqView = o.kind === 'seek' ? 'seek' : 'offer';
        if (typeof applyReqView === 'function') applyReqView();
        pubFlash(q);
    };
    if (here) { if (typeof loadRequests === 'function') loadRequests(go); else go(); return; }
    if (typeof closeAdForm === 'function' && document.getElementById('form-screen') && document.getElementById('form-screen').style.display !== 'none') closeAdForm();
    if (typeof openGroup === 'function') openGroup(room);
    setTimeout(() => { if (typeof loadRequests === 'function') loadRequests(go); else go(); }, 450);
}

// новая услуга: показываем ленту «Готовые услуги» и плитку автора
function pubShowService(s) {
    window._reqSecOverride = '';
    if (typeof openDvizScreen === 'function') openDvizScreen('svc');
    if (s && s.id) pubFlash('.sv-tile[data-id="' + String(s.id).replace(/"/g, '') + '"]');
}
