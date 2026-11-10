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
    ['dviz', 'Курортный движ', 'fa-champagne-glasses']
];
let pubChip = 'housing';
try { const c = localStorage.getItem('yugi-pubchip'); if (PUB_CHIPS.some(x => x[0] === c)) pubChip = c; } catch (_) {}
let pubQuota = null;

const pubAcc = () => (typeof getAccount === 'function' ? getAccount() : null);
const pubReqs = (sec) => (typeof myReqs !== 'undefined' ? myReqs : []).filter(r => (r.section || 'housing') === sec);
const pubDviz = () => { const a = pubAcc(); return (a && typeof dvFeed !== 'undefined') ? dvFeed.filter(e => e.ownerId === a.id) : []; };

// сколько у человека опубликовано в каждом разделе (для цифр на чипсах)
function pubCounts() {
    const act = (sec) => pubReqs(sec).filter(r => r.status === 'active').length;
    return {
        housing: myAdsAll().length + act('housing'),
        work: act('work'),
        trips: act('trips'),
        services: (typeof myServices !== 'undefined' ? myServices.length : 0) + act('services'),
        dviz: pubDviz().length
    };
}

function pubSetSection() { window._reqSecOverride = pubChip === 'dviz' ? '' : pubChip; }

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
    // подгружаем свежее; каждое обновление перерисовывает список
    if (typeof refreshMyRequests === 'function') refreshMyRequests();
    if (typeof loadMyServices === 'function') loadMyServices(paintPubs);
    if (typeof fetchRemoteAds === 'function') fetchRemoteAds();
    if (typeof loadDviz === 'function') loadDviz();
    if (typeof refreshMatchingRequests === 'function') refreshMatchingRequests();
    if (typeof loadQuota === 'function') loadQuota((q) => { pubQuota = q; paintPubs(); });
    if (pubChip === 'housing') setTimeout(() => { if (typeof hostProfileTip === 'function' && root.offsetParent !== null) hostProfileTip(); }, 900);
}

const pubHead = (title, n) => `<div class="section-head pf-head"><h2 class="section-title">${title}${n ? ': ' + n : ''}</h2></div>`;
const pubEmpty = (text) => `<p class="pf-empty">${text}</p>`;

function pubAdsHTML() {
    const e = escapeHtml, mine = myAdsAll();
    const rows = mine.map(ad => `
        <div class="my-ad">
            <div class="my-ad-thumb" onclick="openListing('${ad.id}')">${ad.image ? `<img src="${ad.image}" alt="">` : '<i class="fas fa-image"></i>'}</div>
            <div class="my-ad-info" onclick="openListing('${ad.id}')">
                <div class="my-ad-title">${e(ad.title)}</div>
                <div class="my-ad-price">${e(ad.price)}</div>
            </div>
            <div class="my-ad-actions">
                <button onclick="openAdForm('${ad.id}')" aria-label="Изменить"><i class="fas fa-pen"></i></button>
                <button onclick="deleteMyAd('${ad.id}')" aria-label="Удалить"><i class="fas fa-trash"></i></button>
            </div>
        </div>`).join('');
    const q = pubQuota ? `<div class="quota-line${pubQuota.left === 0 ? ' full' : ''}">${escapeHtml(quotaText(pubQuota))}</div>` : '';
    return pubHead('Мои объявления', mine.length)
        + (mine.length ? `<div class="my-ads">${rows}</div>` : pubEmpty('Сдаёте или продаёте жильё? Добавьте объявление: оно появится в чате выбранного типа.'))
        + q + '<button class="primary-btn wide-btn pub-add" onclick="openAdForm()"><i class="fas fa-plus"></i> Добавить жильё</button>';
}

function pubReqListHTML(sec) {
    const list = pubReqs(sec);
    if (!list.length) return '';
    const act = list.filter(r => r.status === 'active'), hist = list.filter(r => r.status !== 'active');
    const row = (typeof myReqRow === 'function') ? myReqRow : () => '';
    return (act.length ? '<div class="opt-sec">Активные</div>' + act.map(row).join('') : '')
        + (hist.length ? '<div class="opt-sec" style="margin-top:8px">История</div>' + hist.slice(0, 15).map(row).join('') : '');
}

function paintPubs() {
    const body = document.getElementById('pubBody');
    if (!body) return;
    const chips = document.querySelectorAll('#pubRoot .cat-chip[data-pc]');
    const counts = pubCounts();
    chips.forEach(c => { const b = c.querySelector('b'), n = counts[c.dataset.pc] || 0; if (b) { b.hidden = !n; b.textContent = String(n); } });
    const L = (typeof secLabels === 'function') ? secLabels(pubChip === 'dviz' ? 'housing' : pubChip) : null;
    let h = '';
    if (pubChip === 'housing') {
        const hasMatch = typeof matchReqs !== 'undefined' && matchReqs.length;
        h += pubAdsHTML();
        h += `<div class="pf-menu pub-match"><button type="button" class="pf-row" id="rowMatch" onclick="openMatchingSheet()" ${hasMatch ? '' : 'hidden'}><i class="fas fa-users"></i><span>Подходящие арендаторы</span><em id="rowMatchCount" ${hasMatch ? '' : 'hidden'}>${hasMatch ? matchReqs.length : 0}</em><i class="fas fa-chevron-right pf-go"></i></button></div>`;
        h += pubHead('Мои запросы', pubReqs('housing').filter(r => r.status === 'active').length);
        h += pubReqs('housing').length ? `<div class="req-mine" id="pubReqs">${pubReqListHTML('housing')}</div>` : pubEmpty('Ищете жильё? Нажмите «Хочу снять»: хозяева увидят запрос и предложат варианты.');
        h += '<button class="ghost-btn wide-btn pub-add" data-pub="hseek"><i class="fas fa-magnifying-glass"></i> Хочу снять</button>';
    } else if (pubChip === 'work' || pubChip === 'trips') {
        h += `<div class="pub-two"><button type="button" class="ghost-btn" data-pub="seek"><i class="fas fa-magnifying-glass"></i> ${L.btns[0]}</button><button type="button" class="primary-btn" data-pub="offer"><i class="fas fa-plus"></i> ${L.btns[1]}</button></div>`;
        const has = pubReqs(pubChip).length;
        h += has ? `<div class="req-mine" id="pubReqs">${pubReqListHTML(pubChip)}</div>`
            : `<div class="req-empty"><i class="fas ${pubChip === 'work' ? 'fa-briefcase' : 'fa-car-side'}"></i><b>Публикаций пока нет</b><span>${pubChip === 'work' ? 'Ищете работу или нужен сотрудник? Нажмите кнопку выше.' : 'Нужна поездка или есть свободные места? Нажмите кнопку выше.'}</span></div>`;
    } else if (pubChip === 'services') {
        const sv = typeof myServices !== 'undefined' ? myServices : [];
        h += pubHead('Мои развлечения', sv.length);
        h += sv.length ? `<div class="sv-list">${sv.map(s => serviceCardHTML(s, true)).join('')}</div>`
            : pubEmpty('Катаете на катере, водите экскурсии или возите на джипах? Добавьте развлечение с фото: его увидят в разделе «Развлечения».');
        if (!sv.length || sv.length < (typeof SV_MAX !== 'undefined' ? SV_MAX : 10)) h += '<button type="button" class="primary-btn wide-btn pub-add" data-sv="new"><i class="fas fa-plus"></i> Добавить развлечение</button>';
        if (pubReqs('services').length) h += pubHead('Мои запросы', 0) + `<div class="req-mine" id="pubReqs">${pubReqListHTML('services')}</div>`;
    } else {
        const ev = pubDviz();
        h += pubHead('Мой курортный движ', ev.length);
        h += ev.length ? `<div class="dv-feed pub-dv" id="pubDv">${ev.map(dvCardHTML).join('')}</div>` : pubEmpty('Зовёте компанию на джипы, прогулку или волейбол? Создайте движ: желающие откликнутся и напишут.');
        h += '<button type="button" class="primary-btn wide-btn pub-add" data-pub="dviz"><i class="fas fa-plus"></i> Создать движ</button>';
    }
    // не сбрасываем прокрутку при перерисовке
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
        window.scrollTo({ top: 0 });
        if (pubChip === 'housing') setTimeout(() => { if (typeof hostProfileTip === 'function' && root.offsetParent !== null) hostProfileTip(); }, 600);
        return;
    }
    const act = ev.target.closest('[data-pub]');
    if (act) {
        const k = act.dataset.pub;
        pubSetSection();
        if (k === 'hseek') openRequestSheet();
        else if (k === 'seek') openCardFlow('seek');
        else if (k === 'offer') openCardFlow('offer');
        else if (k === 'dviz') openDvizForm();
        return;
    }
    if (ev.target.closest('#pubReqs')) {
        if (ev.target.closest('.req-card .req-text') && !ev.target.closest('button')) { onReqCardClick(ev); return; }
        onMyReqBoxClick(ev);
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
