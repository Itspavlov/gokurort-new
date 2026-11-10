// ============================================
// REQUESTS.JS — «Ищут / Предлагают», запросы арендаторов и счётчик объявлений.
// Все ограничения (раз в 60 секунд, 3 объявления в сутки) проверяет сервер;
// здесь только показ таймера и счётчика.
// ============================================
let reqList = [];
let reqView = 'offer';               // seek | offer: вкладки сверху, «все» убрано
let reqCooldownUntil = 0;
let reqTicker = 0;
let reqEditing = null;

const REQ_NOUN = { apartment: 'квартиру', house: 'дом', hotel: 'отель', room: 'комнату', guest: 'гостевой дом' };
const REQ_CATS = [['', 'Любое жильё'], ['apartment', 'Квартира'], ['house', 'Дом'], ['hotel', 'Отель'], ['room', 'Комната'], ['guest', 'Гостевой дом']];
const REQ_STATUS = { active: 'Активен', found: 'Найдено', closed: 'Закрыт', expired: 'Истёк срок' };

// Разделы без жилья: «Ищу» и «Предлагаю» — простые карточки
const SEC = {
    work:   { seek: { head: 'Ищу работу', ph: 'Например: официант, опыт 2 года' }, offer: { head: 'Предлагаю работу', ph: 'Например: нужен повар на лето' }, price: 'Оплата, ₽', date: '', seats: '' },
    trips:  { seek: { head: 'Ищу поездку', ph: 'Например: ищу попутчиков Сочи → Адлер' }, offer: { head: 'Предлагаю поездку', ph: 'Например: еду в Краснодар, есть 2 места' }, price: 'Цена, ₽', date: 'Дата поездки', seats: 'Мест' },
    services: { seek: { head: 'Ищу развлечение', ph: 'Например: ищу компанию на морскую прогулку' }, offer: { head: 'Предлагаю развлечение', ph: 'Например: экскурсия на джипах, яхта на день' }, price: 'Цена, ₽', date: '', seats: '' }
};
const isHousingReq = (r) => !r || !r.section || r.section === 'housing';
// Раздел открытой комнаты: housing, work, trips или services
// на вкладке «Мои публикации» раздел задаёт выбранный чипс (window._reqSecOverride)
const reqSection = () => (window._reqSecOverride && SEC[window._reqSecOverride]) ? window._reqSecOverride : (typeof currentRoom === 'string' && SEC[currentRoom]) ? currentRoom : 'housing';

// Подписи вкладок (сверху, что смотреть) и кнопок (внизу, что создать) для каждого раздела
const SEEK_LABELS = {
    housing:  { tabs: ['Запросы', 'Готовые предложения'], subs: ['сейчас ищут', 'сейчас предлагают'], btns: ['Хочу снять', 'Сдать жильё'] },
    work:     { tabs: ['Соискатели', 'Вакансии'], subs: ['сейчас ищут', 'готовые предложения'], btns: ['Ищу работу', 'Предлагаю работу'] },
    trips:    { tabs: ['Пассажиры', 'Водители'], subs: ['сейчас ищут', 'готовые предложения'], btns: ['Ищу поездку', 'Предлагаю поездку'] },
    services: { tabs: ['Ищут развлечения', 'Предлагают развлечения'], subs: ['сейчас ищут', 'сейчас предлагают'], btns: ['Ищу развлечение', 'Предлагаю развлечение'] }
};
const SEEK_TIP = 'Ваша карточка появится в ленте, и хозяева увидят её и смогут предложить жильё. Мы подберём варианты под ваш запрос и пришлём уведомление, как только найдётся что-то подходящее.';
let seekTipTimer = null;
function hideSeekTip() { clearTimeout(seekTipTimer); const t = document.getElementById('seekTip'); if (t) t.remove(); }
// подсказка под вкладкой «Хочу снять»
function showSeekTip(anchor) {
    hideSeekTip();
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const tip = document.createElement('div');
    tip.id = 'seekTip'; tip.className = 'seek-tip'; tip.setAttribute('role', 'status');
    tip.innerHTML = `<b>Как это работает</b><span>${SEEK_TIP}</span>`;
    document.body.appendChild(tip);
    const w = Math.min(320, window.innerWidth - 24);
    tip.style.width = w + 'px';
    const left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), window.innerWidth - w - 12);
    tip.style.left = left + 'px';
    tip.style.top = (r.bottom + 10) + 'px';
    tip.style.setProperty('--ax', Math.round(r.left + r.width / 2 - left) + 'px');
    tip.addEventListener('click', hideSeekTip);
    seekTipTimer = setTimeout(hideSeekTip, 8000);
}
const secLabels = (sec) => SEEK_LABELS[sec || reqSection()] || SEEK_LABELS.housing;

const reqAuthHeaders = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() });
const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const fmtShortDate = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${Number(d)}.${m}`; };
const fmtCountdown = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
const cooldownLeft = () => Math.max(0, Math.ceil((reqCooldownUntil - Date.now()) / 1000));
const setCooldown = (sec) => { reqCooldownUntil = Date.now() + Math.max(0, sec) * 1000; tickCooldown(); };

// ---------- загрузка ----------
function loadRequests(cb) {
    const room = typeof currentRoom === 'string' ? currentRoom : '';
    const cat = (typeof housingCatByRoom === 'function' && room.startsWith('housing-') && housingCatByRoom(room)) ? housingCatByRoom(room).id : '';
    const url = `${SERVER_URL}/api/requests?status=active&section=${reqSection()}${cat ? '&category=' + cat : ''}`;
    const h = getToken() ? { Authorization: 'Bearer ' + getToken() } : {};
    fetch(url, { headers: h }).then(r => r.json()).then(d => {
        if (!d || !d.ok) return;
        reqList = d.requests || [];
        if (getToken() && typeof d.cooldown === 'number') setCooldown(d.cooldown);
        paintRequests();
        cb && cb();
    }).catch(() => {});
}


// ---------- аватар и «в сети» владельца карточки ----------
function seenText(ts) {
    const min = Math.floor((Date.now() - ts) / 60000);
    if (min < 1) return 'был в сети только что';
    if (min < 60) return 'был в сети ' + min + ' мин назад';
    const h = Math.floor(min / 60);
    if (h < 24) return 'был в сети ' + h + ' ' + plural(h, 'час', 'часа', 'часов') + ' назад';
    const d = Math.floor(h / 24);
    if (d < 30) return 'был в сети ' + d + ' ' + plural(d, 'день', 'дня', 'дней') + ' назад';
    return 'был в сети давно';
}
function reqPresenceHTML(r) {
    const live = r.mine || r.ownerOnline || (r.ownerSeen && Date.now() - r.ownerSeen < 120000);
    if (live) return '<div class="rq-pres on"><i></i>онлайн</div>';
    if (r.ownerSeen) return `<div class="rq-pres"><i></i>${seenText(r.ownerSeen)}</div>`;
    return '';
}
function reqAvatarHTML(r) {
    const e = escapeHtml;
    let src = r.mine ? ((typeof getProfile === 'function' && getProfile().avatar) || '') : avatarUrl(r.ownerAvatar);
    if (src && !/^(avatars\/|data:image\/)/.test(src)) src = '';
    return `<div class="rq-ava" style="background:${dmColor(r.ownerName)}">${src ? `<img src="${e(src)}" alt="">` : e(Array.from(r.ownerName)[0] || '?')}</div>`;
}

// ---------- карточки ----------
function cardHTML(r) {
    const e = escapeHtml, sec = SEC[r.section];
    const seek = r.kind !== 'offer';
    const lines = [
        r.city ? `<span><i class="fas fa-location-dot"></i>${e(r.city)}</span>` : '',
        r.dateFrom ? `<span><i class="fas fa-calendar"></i>${fmtShortDate(r.dateFrom)}</span>` : '',
        r.guests ? `<span><i class="fas fa-user-group"></i>${r.guests} ${sec && sec.seats ? 'мест' : 'чел.'}</span>` : '',
        r.budget ? `<span><i class="fas fa-ruble-sign"></i>${seek && r.section !== 'work' ? 'до ' : ''}${Number(r.budget).toLocaleString('ru-RU')} ₽</span>` : ''
    ].join('');
    const st = r.status !== 'active' ? `<em class="req-status">${REQ_STATUS[r.status] || ''}</em>` : `<em class="req-kind ${seek ? 'seek' : 'offer'}">${seek ? 'Ищет' : 'Предлагает'}</em>`;
    const actions = r.status !== 'active' ? '' : (r.mine
        ? `<button type="button" data-act="edit">Изменить</button><button type="button" data-act="closed">Закрыть</button>`
        : `<button type="button" class="main" data-act="write-dm"><i class="fas fa-paper-plane"></i> Написать</button>`);
    return `<div class="req-card rq2 card-${seek ? 'seek' : 'offer'}${r.mine ? ' mine' : ''}" data-rid="${e(r.id)}">
        <div class="rq-top">${reqAvatarHTML(r)}<div class="rq-who"><b>${e(r.mine ? 'Вы' : r.ownerName)}</b><small>${fmtAgo ? fmtAgo(r.created) : ''}</small></div>${st}</div>
        <div class="rq-title">${e(r.title || '')}</div>
        ${reqPresenceHTML(r)}
        ${lines ? `<div class="req-lines">${lines}</div>` : ''}
        ${r.text ? `<p class="req-text">${e(r.text)}</p>` : ''}
        ${actions ? `<div class="req-actions">${actions}</div>` : ''}</div>`;
}

function reqCardHTML(r, opts = {}) {
    if (!isHousingReq(r)) return cardHTML(r);
    const e = escapeHtml;
    const noun = REQ_NOUN[r.category] || 'жильё';
    const lines = [
        (r.city || r.district) ? `<span><i class="fas fa-location-dot"></i>${e([r.city, r.district].filter(Boolean).join(', '))}</span>` : '',
        r.dateFrom ? `<span><i class="fas fa-calendar"></i>${fmtShortDate(r.dateFrom)}${r.dateTo ? '–' + fmtShortDate(r.dateTo) : ''}</span>` : '',
        r.guests ? `<span><i class="fas fa-user-group"></i>${r.guests} ${plural(r.guests, 'гость', 'гостя', 'гостей')}</span>` : '',
        r.budget ? `<span><i class="fas fa-ruble-sign"></i>до ${Number(r.budget).toLocaleString('ru-RU')} ₽/сутки</span>` : '',
        r.pets ? `<span><i class="fas fa-paw"></i>с животными</span>` : ''
    ].join('');
    const st = r.status !== 'active' ? `<em class="req-status">${REQ_STATUS[r.status] || ''}</em>` : '';
    // отправить запрос в личную группу: знакомые с подходящим жильём смогут сразу предложить его
    const grp = `<button type="button" class="grp" data-act="group" title="Отправить запрос в мою группу" aria-label="Отправить запрос в мою группу"><i class="fas fa-user-group"></i> В группу</button>`;
    const found = r.mine && r.status === 'active'
        ? `<button type="button" class="main" data-act="options"><i class="fas fa-house-circle-check"></i> Варианты${r.matchCount ? ': ' + r.matchCount : ''}${r.similarCount ? (r.matchCount ? ' · ' : ': ') + 'другие типы ' + r.similarCount : ''}${r.offerCount ? ' · предложений ' + r.offerCount : ''}</button>` : '';
    const actions = r.mine
        ? (r.status === 'active' ? found + grp + `<button type="button" data-act="notify" title="Сообщать, когда появится подходящее жильё"><i class="fas ${r.notify === false ? 'fa-bell-slash' : 'fa-bell'}"></i> ${r.notify === false ? 'Не сообщать' : 'Сообщать о новом'}</button><button type="button" data-act="found">Нашёл жильё</button><button type="button" data-act="edit">Изменить</button><button type="button" data-act="closed">Закрыть</button>` : '')
        : (r.status === 'active' ? `<button type="button" class="main" data-act="write"><i class="fas fa-paper-plane"></i> Предложить жильё</button>` + grp : '');
    return `<div class="req-card rq2${r.mine ? ' mine' : ''}" data-rid="${e(r.id)}">
        <div class="rq-top">${reqAvatarHTML(r)}<div class="rq-who"><b>${e(r.mine ? 'Вы' : r.ownerName)}</b><small>${fmtAgo ? fmtAgo(r.created) : ''}</small></div>${st}</div>
        <div class="rq-title">${r.mine ? 'Ваш запрос' : 'Запрос'} на ${noun}</div>
        ${reqPresenceHTML(r)}
        ${lines ? `<div class="req-lines">${lines}</div>` : ''}
        ${r.text ? `<p class="req-text">${e(r.text)}</p>` : ''}
        ${actions ? `<div class="req-actions">${actions}</div>` : ''}</div>`;
}

// Время элемента ленты: у карточек запросов data-ts, у сообщений — из id вида msg_<время>_...
function itemTs(el) {
    if (el.dataset && el.dataset.ts) return Number(el.dataset.ts);
    const m = /^msg_(\d{10,})_/.exec((el.dataset && el.dataset.id) || '');
    return m ? Number(m[1]) : 0;
}

// Запросы встают в ленту по времени, как сообщения: новые внизу
function paintRequests() {
    const msgs = document.getElementById('chatMessages');
    if (!msgs) return;
    const nearBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 120;
    msgs.querySelectorAll('.req-item').forEach(n => n.remove());
    // карточки запросов и (в разделе «Услуги») карточки услуг встают в ленту по времени вместе
    const items = reqList.map(r => ({ ts: r.created, kind: r.kind === 'offer' ? 'offer' : 'seek', rid: r.id, html: reqCardHTML(r) }));
    if (reqSection() === 'services' && typeof serviceFeed !== 'undefined') {
        serviceFeed.forEach(sv => items.push({ ts: sv.updated || sv.created, kind: 'offer', sid: sv.id, tag: sv.tag || 'other', html: serviceFeedHTML(sv) }));
    }
    items.sort((x, y) => x.ts - y.ts);
    let added = 0;
    for (const it of items) {
        const w = document.createElement('div');
        w.className = 'req-item'; w.dataset.ts = it.ts; w.dataset.kind = it.kind;
        if (it.rid) w.dataset.rid = it.rid; else { w.dataset.sid = it.sid; w.dataset.tag = it.tag; w.classList.add('sv-item'); }
        w.innerHTML = it.html;
        const after = Array.from(msgs.children).find(c => !c.classList.contains('req-item') && itemTs(c) > it.ts);
        if (after) msgs.insertBefore(w, after); else msgs.appendChild(w);
        added++;
    }
    updateDockState();
    if (added && (nearBottom || reqView !== 'all')) msgs.scrollTop = msgs.scrollHeight;
}

// Счётчики на вкладках и подсказка, когда в выбранной вкладке пусто
function updateDockState() {
    const msgs = document.getElementById('chatMessages');
    if (!msgs) return;
    const seeks = msgs.querySelectorAll('.req-item[data-kind="seek"]').length;
    const offers = msgs.querySelectorAll('.req-item[data-kind="offer"], .chat-message-ad').length;
    const set = (v, txt, n) => { const b = document.querySelector(`.seek-tab[data-v="${v}"] b`); if (b) b.textContent = txt + ' ' + n; };
    const SB = secLabels().subs; set('seek', SB[0], seeks); set('offer', SB[1], offers);
    const empty = document.getElementById('reqEmpty');
    if (!empty) return;
    const shown = reqView === 'seek' ? seeks : reqView === 'offer' ? offers : seeks + offers;
    empty.hidden = shown > 0;
    if (!shown) {
        const housing = reqSection() === 'housing', L = secLabels();
        empty.innerHTML = reqView === 'offer'
            ? `<i class="fas fa-circle-plus"></i><b>Пока нет предложений</b><span>${housing ? 'Сдаёте жильё? Нажмите «' + L.btns[1] + '» внизу.' : 'Нажмите «' + L.btns[1] + '» внизу и добавьте карточку.'}</span>`
            : `<i class="fas fa-magnifying-glass"></i><b>Пока никто не ищет</b><span>${housing ? 'Ищете жильё? Нажмите «' + L.btns[0] + '» внизу: хозяева увидят запрос и предложат варианты.' : 'Нажмите «' + L.btns[0] + '» внизу и добавьте карточку.'}</span>`;
    }
}

// ---------- вкладки сверху (что смотреть) и кнопки внизу (что создать) ----------
// Вкладки стоят под чипсами типов, а внизу только две кнопки создания.
function seekBarHTML(room) {
    const L = secLabels(SEC[room] ? room : 'housing');
    if (reqView !== 'seek') reqView = 'offer';
    const t = (v, l) => `<button type="button" role="tab" class="seek-tab${l.length > 18 ? ' sm' : ''} ${reqView === v ? 'on' : ''}" data-v="${v}" aria-selected="${reqView === v}"><span>${l}</span><b>${L.subs[v === 'seek' ? 0 : 1]} 0</b></button>`;
    // кнопка «Фильтры» (только жильё) стоит справа от вкладок
    const filt = (typeof isHousingRoom === 'function' && isHousingRoom(room)) ? '<button type="button" class="seek-filter" id="filtBtn" aria-label="Фильтры"><i class="fas fa-sliders"></i><span class="fbadge" hidden>0</span></button>' : '';
    return `<div class="seek-bar" id="seekBar"><div class="seek-tabs" role="tablist">${t('seek', L.tabs[0])}${t('offer', L.tabs[1])}</div>${filt}</div>`;
}
const dockBtnHTML = (icon, label) => `<i class="fas ${icon}"></i> ${label}`;
function cardsDockHTML(room) {
    const L = secLabels(SEC[room] ? room : 'housing');
    const long = (s) => s.length > 17 ? ' nogly' : '';
    return `<div class="cards-dock" id="cardsDock">
        <div class="dock-actions">
            <button type="button" class="dock-btn seek${long(L.btns[0])}" id="dockSeek" aria-label="${L.btns[0]}: разместить запрос">${dockBtnHTML('fa-magnifying-glass', L.btns[0])}</button>
            <button type="button" class="dock-btn main${long(L.btns[1])}" id="dockOffer" aria-label="${L.btns[1]}: разместить предложение">${dockBtnHTML('fa-plus', L.btns[1])}</button>
        </div></div>`;
}

function applyReqView() {
    const msgs = document.getElementById('chatMessages');
    if (!msgs) return;
    msgs.classList.toggle('view-seek', reqView === 'seek');
    msgs.classList.toggle('view-offer', reqView === 'offer');
    document.querySelectorAll('.seek-tab').forEach(b => { const on = b.dataset.v === reqView; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    updateDockState();
    msgs.scrollTop = msgs.scrollHeight;
}

function setupCards() {
    const dock = document.getElementById('cardsDock');
    const msgs = document.getElementById('chatMessages');
    if (!dock || !msgs || dock.dataset.on) return;
    dock.dataset.on = '1';
    msgs.insertAdjacentHTML('beforeend', '<div class="req-empty" id="reqEmpty" hidden></div>');
    const bar = document.getElementById('seekBar');
    if (bar) bar.addEventListener('click', (ev) => {
        const tab = ev.target.closest('.seek-tab');
        if (!tab) return;
        reqView = tab.dataset.v; applyReqView();
        if (tab.dataset.v === 'seek' && reqSection() === 'housing') showSeekTip(tab); else hideSeekTip();
    });
    dock.addEventListener('click', (ev) => {
        if (ev.target.closest('#dockSeek')) { reqSection() === 'housing' ? openRequestSheet() : openCardFlow('seek'); return; }
        if (ev.target.closest('#dockOffer')) {
            const sec = reqSection();
            if (sec === 'housing') openAdForm();                 // у хозяина с объявлениями спросит: поднять старое или создать новое
            else if (sec === 'services') openServiceFlow();
            else openCardFlow('offer');
        }
    });
    msgs.addEventListener('click', (ev) => { if (ev.target.closest('.req-card')) onReqCardClick(ev); });
    applyReqView();
    paintRequests();
    loadRequests();
    tickCooldown();
    // кнопка «?» с подсказками есть в каждом разделе, а в первый раз подсказки показываются сами
    const head = document.querySelector('#group-screen .room-head');
    if (head && !head.querySelector('.chat-help-btn')) head.insertAdjacentHTML('beforeend', '<button type="button" class="chat-header-btn chat-help-btn" onclick="cardsTour(true)" aria-label="Подсказки"><i class="fas fa-question"></i></button>');
    if (reqSection() !== 'housing') setTimeout(() => cardsTour(false), 900);
}

// ---------- подсказки у вкладок и кнопок ----------
const CARD_TIPS = {
    housing: { seek: 'Ищете жильё? Укажите город, даты, гостей и бюджет: хозяева увидят запрос и предложат варианты.', offer: 'Сдаёте или продаёте жильё? Опубликуйте объявление. Если оно уже было, можно поднять его наверх списка.' },
    work:    { seek: 'Ищете работу? Напишите, кем и где хотите работать: работодатели ответят в личные сообщения.', offer: 'Нужен сотрудник? Разместите вакансию. Прежние можно опубликовать заново.' },
    trips:   { seek: 'Нужна поездка или попутчик? Укажите откуда, дату и сколько мест нужно.', offer: 'Едете и есть свободные места? Предложите поездку или трансфер, пассажиры напишут вам.' },
    services:{ seek: 'Ищете, чем заняться? Напишите, что хотите: морскую прогулку, экскурсию, джип-тур.', offer: 'Проводите экскурсии, катаете на катере, возите на джипах? Добавьте карточку с фото. Прежние можно поднять.' }
};
function cardsTour(force) {
    const sec = reqSection(), t = CARD_TIPS[sec];
    if (!t) return;
    const L = secLabels(sec);
    runTour('cards-' + sec, [
        { sel: '.seek-tabs', title: L.tabs[0] + ' и ' + L.tabs[1].toLowerCase(), text: 'Сверху выберите, какие объявления смотреть: тех, кто ищет, или тех, кто предлагает.' },
        { sel: '#dockSeek', title: 'Кнопка «' + L.btns[0] + '»', text: t.seek },
        { sel: '#dockOffer', title: 'Кнопка «' + L.btns[1] + '»', text: t.offer }
    ], force);
}

const _openGroupForReq = openGroup;
openGroup = function () { const r = _openGroupForReq.apply(this, arguments); setTimeout(setupCards, 0); return r; };

// ---------- действия на карточке ----------
function onReqCardClick(ev) {
    const tx = ev.target.closest('.req-card .req-text');
    if (tx) { tx.classList.toggle('open'); return; }
    const btn = ev.target.closest('button[data-act]');
    const card = ev.target.closest('.req-card');
    if (!btn || !card) return;
    const r = reqList.find(x => x.id === card.dataset.rid) || myReqs.find(x => x.id === card.dataset.rid);
    if (!r) return;
    const act = btn.dataset.act;
    if (act === 'group') { addReqToGroup(r.id); return; }
    if (act === 'write') { openOfferSheet(r); return; }
    if (act === 'options') { openOptionsSheet(r); return; }
    if (act === 'write-dm' && !isHousingReq(r)) {
        startDm(r.ownerName, { id: 'req_' + r.id.slice(2, 30), title: (r.kind === 'offer' ? 'Предложение: ' : 'Запрос: ') + (r.title || '') },
            `Здравствуйте! По вашей карточке «${r.title || ''}»: `);
        return;
    }
    if (act === 'write-dm') {
        const dates = r.dateFrom ? ' на ' + fmtShortDate(r.dateFrom) + (r.dateTo ? '–' + fmtShortDate(r.dateTo) : '') : '';
        startDm(r.ownerName, { id: 'req_' + r.id.slice(2, 30), title: 'Запрос: ' + (r.city || 'жильё') + dates },
            `Здравствуйте! Видел ваш запрос${r.city ? ' (' + r.city + ')' : ''}${dates}. Могу предложить жильё: `);
    } else if (act === 'edit') openRequestSheet(r);
    else if (act === 'notify') {
        const on = r.notify === false;
        apiPost(`/api/requests/${encodeURIComponent(r.id)}/notify`, { on }).then(d => {
            if (!d.ok) { showToast(d.message || 'Не удалось изменить'); return; }
            showToast(on ? 'Сообщим, когда появится подходящее жильё' : 'Уведомления по этому запросу выключены');
            loadRequests(refreshMyRequests);
        }).catch(() => showToast('Нет связи с сервером'));
    }
    else if (act === 'found' || act === 'closed') {
        fetch(`${SERVER_URL}/api/requests/${encodeURIComponent(r.id)}/status`, { method: 'POST', headers: reqAuthHeaders(), body: JSON.stringify({ status: act }) })
            .then(x => x.json()).then(d => {
                if (!d.ok) { showToast(d.message || 'Не удалось изменить'); return; }
                showToast(act === 'found' ? 'Отлично! Запрос отмечен как найденный' : 'Запрос закрыт');
                loadRequests(refreshMyRequests);
            }).catch(() => showToast('Нет связи с сервером'));
    }
}

// ---------- форма запроса ----------
function openRequestSheet(edit) {
    if (edit && edit.id && !isHousingReq(edit)) { openCardSheet(edit.kind, edit); return; }
    loginRequired(() => {
        reqEditing = edit && edit.id ? edit : null;
        const e = escapeHtml, r = reqEditing || {};
        const catOpts = REQ_CATS.map(([v, l]) => `<option value="${v}" ${(r.category || (typeof currentRoom === 'string' && currentRoom.startsWith('housing-') && housingCatByRoom(currentRoom).id) || '') === v ? 'selected' : ''}>${l}</option>`).join('');
        openSheet(reqEditing ? 'Изменить запрос' : 'Хочу снять жильё', `
            <p class="seek-note"><i class="fas fa-circle-info"></i><span>${SEEK_TIP} Запрос живёт 14 дней.</span></p>
            <label class="field"><span>Что ищете</span><select id="rqCat">${catOpts}</select></label>
            <label class="field"><span>Город</span><input id="rqCity" maxlength="60" placeholder="Например: Адлер" value="${e(r.city || '')}"></label>
            <label class="field"><span>Район (необязательно)</span><input id="rqDistrict" maxlength="60" value="${e(r.district || '')}"></label>
            <div class="rq-row"><label class="field"><span>Заезд</span><input id="rqFrom" type="date" min="${todayISO()}" value="${e(r.dateFrom || '')}"></label>
            <label class="field"><span>Выезд</span><input id="rqTo" type="date" min="${todayISO()}" value="${e(r.dateTo || '')}"></label></div>
            <div class="rq-row"><label class="field"><span>Гостей</span><input id="rqGuests" type="number" inputmode="numeric" min="1" max="30" value="${r.guests || ''}"></label>
            <label class="field"><span>Бюджет, ₽/сутки</span><input id="rqBudget" type="number" inputmode="numeric" min="1" value="${r.budget || ''}"></label></div>
            <label class="rq-pets"><input type="checkbox" id="rqPets" ${r.pets ? 'checked' : ''}><span><i class="fas fa-paw"></i> Еду с животными</span></label>
            <label class="field"><span>Пожелания</span><textarea id="rqText" maxlength="300" rows="3" placeholder="Например: недалеко от моря, рядом магазин">${e(r.text || '')}</textarea></label>
            <div class="auth-error" id="rqErr"></div>
            <button class="primary-btn wide-btn" id="rqSend"></button>`, (el) => {
            const btn = el.querySelector('#rqSend'), err = el.querySelector('#rqErr');
            const label = () => {
                const w = reqEditing ? 0 : cooldownLeft();
                btn.disabled = w > 0;
                btn.innerHTML = w > 0 ? `Следующий запрос через ${fmtCountdown(w)}` : (reqEditing ? '<i class="fas fa-check"></i> Сохранить' : '<i class="fas fa-paper-plane"></i> Опубликовать запрос');
            };
            label();
            const t = setInterval(() => { if (!document.body.contains(btn)) { clearInterval(t); return; } label(); }, 500);
            btn.addEventListener('click', () => {
                const v = (id) => el.querySelector(id).value.trim();
                const from = v('#rqFrom'), to = v('#rqTo');
                if (to && !from) { err.textContent = 'Укажите дату заезда'; return; }
                if (from && to && to < from) { err.textContent = 'Выезд раньше заезда'; return; }
                err.textContent = '';
                btn.disabled = true;
                const body = { category: v('#rqCat'), city: v('#rqCity'), district: v('#rqDistrict'), dateFrom: from, dateTo: to, guests: v('#rqGuests'), budget: v('#rqBudget'), pets: el.querySelector('#rqPets').checked, text: v('#rqText') };
                const url = reqEditing ? `${SERVER_URL}/api/requests/${encodeURIComponent(reqEditing.id)}` : `${SERVER_URL}/api/requests`;
                fetch(url, { method: 'POST', headers: reqAuthHeaders(), body: JSON.stringify(body) }).then(async (x) => {
                    let d = null; try { d = await x.json(); } catch (_) {}
                    if (x.status === 401) { clearSession(); err.textContent = 'Сессия истекла. Войдите снова.'; return; }
                    if (!d || !d.ok) {
                        if (d && d.code === 'REQUEST_WAIT') setCooldown(d.wait || 60);
                        err.textContent = (d && d.message) || 'Не удалось отправить';
                        label();
                        return;
                    }
                    if (!reqEditing) setCooldown(d.cooldown || 60);
                    closeSheet();
                    showToast(reqEditing ? 'Запрос обновлён' : (d.matches ? 'Мы нашли ' + d.matches + ' ' + plural(d.matches, 'вариант', 'варианта', 'вариантов') + ' под ваш запрос' : (d.similar ? 'Точных вариантов нет, но есть ' + d.similar + ' в других типах жилья' : 'Запрос опубликован. Хозяева его увидят')));
                    reqView = reqEditing ? reqView : 'seek';
                    applyReqView();
                    loadRequests(refreshMyRequests);
                    // после публикации сразу показываем найденные варианты во всплывающем окне
                    if (!reqEditing && (d.matches || d.similar)) setTimeout(() => openOptionsSheet(d.request), 350);
                    else if (!reqEditing) setTimeout(() => openNoMatchSheet(), 350);
                }).catch(() => { err.textContent = 'Нет связи с сервером'; label(); });
            });
        });
    });
}


// ---------- форма карточки «Ищу / Предлагаю» для работы, поездок и вещей ----------
function openCardSheet(kind, edit, prefill) {
    loginRequired(() => {
        const r = edit && edit.id ? edit : null;
        const section = r ? r.section : reqSection();
        const sec = SEC[section];
        if (!sec) return;
        kind = kind === 'offer' ? 'offer' : 'seek';
        const cfg = sec[kind], e = escapeHtml, v0 = r || (prefill ? { ...prefill, dateFrom: prefill.dateFrom && prefill.dateFrom >= todayISO() ? prefill.dateFrom : '' } : {});
        openSheet(r ? 'Изменить карточку' : cfg.head, `
            <p class="auth-note" style="margin:0 4px 12px">Карточка живёт 14 дней. Откликнуться можно только личным сообщением — переписки в разделе нет.</p>
            <label class="field"><span>Заголовок</span><input id="cdTitle" maxlength="80" placeholder="${e(cfg.ph)}" value="${e(v0.title || '')}"></label>
            <label class="field"><span>Город или место (необязательно)</span><input id="cdCity" maxlength="60" value="${e(v0.city || '')}"></label>
            ${sec.date ? `<div class="rq-row"><label class="field"><span>${sec.date}</span><input id="cdDate" type="date" min="${todayISO()}" value="${e(v0.dateFrom || '')}"></label>
            <label class="field"><span>${sec.seats}</span><input id="cdSeats" type="number" inputmode="numeric" min="1" max="30" value="${v0.guests || ''}"></label></div>` : ''}
            <label class="field"><span>${sec.price}</span><input id="cdPrice" type="number" inputmode="numeric" min="1" value="${v0.budget || ''}"></label>
            <label class="field"><span>Подробности</span><textarea id="cdText" maxlength="300" rows="3">${e(v0.text || '')}</textarea></label>
            <div class="auth-error" id="cdErr"></div>
            <button class="primary-btn wide-btn" id="cdSend"></button>`, (el) => {
            const btn = el.querySelector('#cdSend'), err = el.querySelector('#cdErr');
            const label = () => {
                const w = r ? 0 : cooldownLeft();
                btn.disabled = w > 0;
                btn.innerHTML = w > 0 ? `Следующая карточка через ${fmtCountdown(w)}` : (r ? '<i class="fas fa-check"></i> Сохранить' : '<i class="fas fa-paper-plane"></i> Опубликовать');
            };
            label();
            const t = setInterval(() => { if (!document.body.contains(btn)) { clearInterval(t); return; } label(); }, 500);
            btn.addEventListener('click', () => {
                const v = (id) => { const n = el.querySelector(id); return n ? n.value.trim() : ''; };
                if (!v('#cdTitle')) { err.textContent = 'Напишите заголовок'; return; }
                err.textContent = '';
                btn.disabled = true;
                const body = { section, kind, title: v('#cdTitle'), city: v('#cdCity'), dateFrom: v('#cdDate'), guests: v('#cdSeats'), budget: v('#cdPrice'), text: v('#cdText') };
                const url = r ? `${SERVER_URL}/api/requests/${encodeURIComponent(r.id)}` : `${SERVER_URL}/api/requests`;
                fetch(url, { method: 'POST', headers: reqAuthHeaders(), body: JSON.stringify(body) }).then(async (x) => {
                    let d = null; try { d = await x.json(); } catch (_) {}
                    if (x.status === 401) { clearSession(); err.textContent = 'Сессия истекла. Войдите снова.'; return; }
                    if (!d || !d.ok) {
                        if (d && d.code === 'REQUEST_WAIT') setCooldown(d.wait || 60);
                        err.textContent = (d && d.message) || 'Не удалось отправить';
                        label();
                        return;
                    }
                    if (!r) setCooldown(d.cooldown || 60);
                    closeSheet();
                    showToast(r ? 'Карточка обновлена' : 'Карточка опубликована');
                    if (!r) { reqView = kind === 'offer' ? 'offer' : 'seek'; applyReqView(); }
                    loadRequests(refreshMyRequests);
                }).catch(() => { err.textContent = 'Нет связи с сервером'; label(); });
            });
        });
    });
}

// ---------- мои запросы (в профиле) ----------
let myReqs = [];
function refreshMyRequests() {
    if (!getToken()) { myReqs = []; paintMyRequests(); return; }
    fetch(`${SERVER_URL}/api/requests?mine=1&status=all`, { headers: { Authorization: 'Bearer ' + getToken() } }).then(r => r.json()).then(d => {
        if (d && d.ok) { myReqs = d.requests; if (typeof d.cooldown === 'number') setCooldown(d.cooldown); paintMyRequests(); }
    }).catch(() => {});
}
// строка «моей карточки»: карточка и кнопка удаления под ней (используется в окне запросов и на вкладке «Мои публикации»)
const myReqRow = (r) => `<div class="req-row">${reqCardHTML(r)}<button type="button" class="req-del" data-del="${escapeHtml(r.id)}" aria-label="Удалить запрос"><i class="fas fa-trash"></i><span>Удалить</span></button></div>`;
function paintMyRequests() {
    const act = myReqs.filter(r => r.status === 'active');
    const cnt = document.getElementById('rowReqCount');
    if (cnt) { cnt.hidden = !act.length; cnt.textContent = String(act.length); }
    if (typeof paintPubs === 'function') paintPubs();
    const box = document.getElementById('myReqBox');
    if (!box) return;
    if (!myReqs.length) { box.innerHTML = '<div class="req-empty"><i class="fas fa-magnifying-glass"></i><b>Запросов пока нет</b><span>Нажмите «Хочу снять» в разделе «Жильё»: хозяева увидят запрос, а подходящее жильё мы найдём сами.</span></div>'; return; }
    const hist = myReqs.filter(r => r.status !== 'active');
    const row = myReqRow;
    box.innerHTML = (act.length ? '<div class="opt-sec">Активные</div>' + act.map(row).join('') : '')
        + (hist.length ? '<div class="opt-sec" style="margin-top:8px">История</div>' + hist.slice(0, 15).map(row).join('') : '');
}

function onMyReqBoxClick(ev) {
        const del = ev.target.closest('.req-del');
        if (del) {
            if (!del.classList.contains('sure')) {      // первое нажатие — просим подтвердить
                del.classList.add('sure'); del.querySelector('span').textContent = 'Точно?';
                setTimeout(() => { if (del.isConnected) { del.classList.remove('sure'); del.querySelector('span').textContent = 'Удалить'; } }, 3000);
                return;
            }
            del.disabled = true;
            fetch(`${SERVER_URL}/api/requests/${encodeURIComponent(del.dataset.del)}`, { method: 'DELETE', headers: reqAuthHeaders() }).then(r => r.json()).then(d => {
                if (!d.ok) { del.disabled = false; showToast(d.message || 'Не удалось удалить'); return; }
                myReqs = myReqs.filter(x => x.id !== del.dataset.del);
                paintMyRequests(); showToast('Запрос удалён'); loadRequests();
            }).catch(() => { del.disabled = false; showToast('Нет связи с сервером'); });
            return;
        }
        const btn = ev.target.closest('button[data-act]'), card = ev.target.closest('.req-card');
        if (!btn || !card) return;
        const r = myReqs.find(x => x.id === card.dataset.rid); if (!r) return;
        if (btn.dataset.act === 'edit') openRequestSheet(r); else onReqCardClick(ev);
}

function openMyRequests() {
    loginRequired(() => {
        openSheet('Мои запросы', `<div id="myReqBox" class="req-mine"><p class="opt-empty">Загружаю…</p></div>
            <button class="primary-btn wide-btn" id="myReqAdd" style="margin-top:12px"><i class="fas fa-magnifying-glass"></i> Хочу снять</button>`, (el) => {
            paintMyRequests(); refreshMyRequests();
            el.querySelector('#myReqAdd').onclick = () => openRequestSheet();
            el.querySelector('#myReqBox').addEventListener('click', onMyReqBoxClick);
        });
    });
}

// ---------- счётчик объявлений («Сегодня опубликовано: 2 из 3») ----------
function loadQuota(cb) {
    if (!getToken()) return;
    fetch(`${SERVER_URL}/api/listings/quota`, { headers: { Authorization: 'Bearer ' + getToken() } }).then(r => r.json()).then(d => { if (d && d.ok) cb(d.quota); }).catch(() => {});
}
const quotaText = (q) => `Сегодня опубликовано: ${q.used} из ${q.limit}` + (q.left === 0 ? '. Новые — завтра, редактировать можно всегда' : '');

const _openAdFormQuota = openAdForm;
openAdForm = function () {
    _openAdFormQuota.apply(this, arguments);
    const sp = document.querySelector('#form-screen .form-save-space');
    if (sp && getToken()) {
        sp.insertAdjacentHTML('beforebegin', '<div class="quota-line" id="quotaLineForm"></div>');
        loadQuota((q) => { const el = document.getElementById('quotaLineForm'); if (el) { el.textContent = quotaText(q) + (q.left > 0 ? '. Правка не расходует лимит' : ''); el.classList.toggle('full', q.left === 0); } });
    }
};

// ---------- таймер ----------
function tickCooldown() {
    clearInterval(reqTicker);
    const paint = () => {
        const w = cooldownLeft();
        const housing = reqSection() === 'housing';
        const seek = document.getElementById('dockSeek'), offer = document.getElementById('dockOffer'), L = secLabels();
        if (seek) seek.innerHTML = w > 0 ? `<i class="fas fa-clock"></i> ${fmtCountdown(w)}` : dockBtnHTML('fa-magnifying-glass', L.btns[0]);
        // у жилья «Сдаю» — обычное объявление, у него своего таймера нет
        if (offer) offer.innerHTML = (w > 0 && !housing) ? `<i class="fas fa-clock"></i> ${fmtCountdown(w)}` : dockBtnHTML('fa-plus', L.btns[1]);
        if (w <= 0) clearInterval(reqTicker);
    };
    paint();
    if (cooldownLeft() > 0) reqTicker = setInterval(paint, 500);
}

// ---------- обновление в реальном времени ----------
const _onSocialEventReq = onSocialEvent;
onSocialEvent = function (ev, d) {
    if (ev === 'request-changed') { clearTimeout(onSocialEvent._rt); onSocialEvent._rt = setTimeout(() => { if (document.getElementById('cardsDock')) loadRequests(); if (document.getElementById('myReqBox') || document.getElementById('pubBody')) refreshMyRequests(); if (document.getElementById('matchReqBox') || document.getElementById('rowMatch')) refreshMatchingRequests(); }, 400); return; }
    return _onSocialEventReq.apply(this, arguments);
};


// ============================================
// АВТОПОДБОР: варианты для арендатора и «Подходящие арендаторы» для хозяина
// ============================================
const plural = (n, a, b, c) => { const m = n % 100, k = n % 10; return (m > 10 && m < 15) ? c : k === 1 ? a : (k > 1 && k < 5) ? b : c; };
const apiGet = (path) => fetch(SERVER_URL + path, { headers: { Authorization: 'Bearer ' + getToken() } }).then(r => r.json());
const apiPost = (path, body) => fetch(SERVER_URL + path, { method: 'POST', headers: reqAuthHeaders(), body: JSON.stringify(body || {}) }).then(r => r.json());

function listingMiniHTML(l, btns) {
    const e = escapeHtml;
    return `<div class="opt-card" data-lid="${e(l.id)}"><div class="opt-thumb" style="${l.thumb ? 'background-image:url(' + e(l.thumb) + ')' : ''}"></div>
        <div class="opt-info"><b>${e(l.title)}</b><small>${e(l.price || '')}${l.location ? ' · ' + e(l.location) : ''}</small>
        <div class="opt-btns">${btns}</div></div></div>`;
}

// --- арендатор: предложения хозяев и подходящее жильё ---
function openOptionsSheet(r) {
    openSheet('Варианты под ваш запрос', '<div id="optBox"><p class="opt-empty">Загружаю…</p></div>', (el) => {
        const box = el.querySelector('#optBox');
        Promise.all([apiGet(`/api/requests/${encodeURIComponent(r.id)}/offers`), apiGet(`/api/requests/${encodeURIComponent(r.id)}/matches`)]).then(([o, m]) => {
            if (!o.ok || !m.ok) { box.innerHTML = '<p class="opt-empty">Не удалось загрузить</p>'; return; }
            const offered = new Set(o.offers.map(x => x.listing.id));
            const offHTML = o.offers.length ? o.offers.map(x => listingMiniHTML(x.listing,
                `<button class="main" data-a="view">Посмотреть</button><button data-a="dm" data-owner="${escapeHtml(x.ownerName)}">Начать диалог</button><button data-a="no" data-oid="${escapeHtml(x.id)}">Не подходит</button>`)).join('') : '<p class="opt-empty">Предложений от хозяев пока нет</p>';
            const rest = m.listings.filter(l => !offered.has(l.id));
            const matHTML = rest.length ? rest.map(l => listingMiniHTML(l, `<button class="main" data-a="view">Посмотреть</button><button data-a="dm" data-owner="${escapeHtml(l.owner.name)}">Написать</button>`)).join('') : '<p class="opt-empty">Подходящего жилья пока нет. Как только хозяева опубликуют объявление, оно появится здесь</p>';
            const catName = Object.fromEntries(REQ_CATS);
            const alike = (m.similar || []).filter(l => !offered.has(l.id));
            const alikeHTML = alike.length ? `<div class="opt-sec" style="margin-top:14px">Другие типы жилья: ${alike.length}</div>
                <p class="opt-note">Подходят по цене, числу гостей, датам${r.pets ? ' и животным' : ''}. Не совпадает только тип${r.category ? ': вы искали «' + escapeHtml(catName[r.category] || '') + '»' : ''}.</p>` +
                alike.map(l => listingMiniHTML({ ...l, price: (catName[l.category] ? catName[l.category] + ' · ' : '') + (l.price || '') }, `<button class="main" data-a="view">Посмотреть</button><button data-a="dm" data-owner="${escapeHtml(l.owner.name)}">Написать</button>`)).join('') : '';
            box.innerHTML = `<div class="opt-sec">Предложения хозяев</div>${offHTML}<div class="opt-sec" style="margin-top:14px">Подходящее жильё: ${rest.length}</div>${matHTML}${alikeHTML}`;
        }).catch(() => { box.innerHTML = '<p class="opt-empty">Нет связи с сервером</p>'; });
        el.addEventListener('click', (ev) => {
            const b = ev.target.closest('button[data-a]'); if (!b) return;
            const card = b.closest('.opt-card'); const lid = card.dataset.lid;
            if (b.dataset.a === 'view') { closeSheet(); if (typeof openListing === 'function') openListing(lid); }
            else if (b.dataset.a === 'dm') {
                const title = card.querySelector('b').textContent;
                closeSheet(); startDm(b.dataset.owner, { id: lid, title }, 'Здравствуйте! Интересует «' + title + '»' + (r.dateFrom ? ' на ' + fmtShortDate(r.dateFrom) + (r.dateTo ? '–' + fmtShortDate(r.dateTo) : '') : '') + '. ');
            } else if (b.dataset.a === 'no') {
                b.disabled = true;
                apiPost(`/api/requests/${encodeURIComponent(r.id)}/offers/${encodeURIComponent(b.dataset.oid)}/reject`).then(d => {
                    if (d.ok) { card.remove(); loadRequests(refreshMyRequests); } else { b.disabled = false; showToast(d.message || 'Не удалось'); }
                }).catch(() => { b.disabled = false; });
            }
        });
    });
}

// --- хозяин: предложить своё жильё под запрос ---
function openOfferSheet(r) {
    loginRequired(() => {
        openSheet('Предложить жильё', '<div id="offBox"><p class="opt-empty">Проверяю ваши объявления…</p></div>', (el) => {
            const box = el.querySelector('#offBox');
            const dm = () => { closeSheet(); startDm(r.ownerName, { id: 'req_' + r.id.slice(2, 30), title: 'Запрос: ' + (r.city || 'жильё') }, 'Здравствуйте! Видел ваш запрос' + (r.city ? ' (' + r.city + ')' : '') + '. '); };
            apiGet('/api/requests/matching').then((d) => {
                const hit = d.ok && d.requests.find(x => x.id === r.id);
                const list = hit ? hit.myMatches.map(m => `<div class="opt-card" data-lid="${escapeHtml(m.id)}"><div class="opt-info"><b>${escapeHtml(m.title)}</b><small>${escapeHtml(m.price || '')}</small>
                    <div class="opt-btns"><button class="main" data-a="offer" ${m.offered ? 'disabled' : ''}>${m.offered ? 'Уже предложено' : 'Предложить'}</button></div></div></div>`).join('') : '';
                box.innerHTML = (hit ? `<p class="auth-note" style="margin:0 4px 12px">Эти ваши объекты подходят под запрос: свободны на даты и укладываются в бюджет.</p>${list}`
                    : '<p class="opt-empty">Под этот запрос у вас нет подходящего жилья: оно занято на эти даты, дороже бюджета или другого типа. Можно просто написать человеку.</p>')
                    + '<button class="ghost-btn wide-btn" data-a="dm" style="margin-top:6px"><i class="fas fa-paper-plane"></i> Просто написать</button>';
            }).catch(() => { box.innerHTML = '<p class="opt-empty">Нет связи с сервером</p><button class="ghost-btn wide-btn" data-a="dm">Просто написать</button>'; });
            el.addEventListener('click', (ev) => {
                const b = ev.target.closest('button[data-a]'); if (!b) return;
                if (b.dataset.a === 'dm') { dm(); return; }
                b.disabled = true;
                apiPost(`/api/requests/${encodeURIComponent(r.id)}/offers`, { listingId: b.closest('.opt-card').dataset.lid }).then(d => {
                    if (d.ok) { b.textContent = 'Отправлено'; showToast('Предложение отправлено. Арендатор получил уведомление'); refreshMatchingRequests(); }
                    else { b.disabled = false; showToast(d.message || 'Не удалось отправить'); }
                }).catch(() => { b.disabled = false; showToast('Нет связи с сервером'); });
            });
        });
    });
}

// --- профиль хозяина: «Подходящие арендаторы» (отдельное окно) ---
let matchReqs = [];
function paintMatchRow() {
    const row = document.getElementById('rowMatch'), cnt = document.getElementById('rowMatchCount');
    if (row) row.hidden = !matchReqs.length;
    if (cnt) { cnt.hidden = !matchReqs.length; cnt.textContent = String(matchReqs.length); }
}
function refreshMatchingRequests() {
    if (!getToken()) { matchReqs = []; paintMatchRow(); return; }
    apiGet('/api/requests/matching').then(d => {
        matchReqs = d.ok ? d.requests : [];
        paintMatchRow();
        const box = document.getElementById('matchReqBox');
        if (box) {
            box.innerHTML = matchReqs.length ? matchReqs.slice(0, 10).map(r => `<div class="req-item-s">${reqCardHTML({ ...r, mine: false })}</div>`).join('') : '<p class="opt-empty">Сейчас нет запросов под ваше жильё.</p>';
            box.querySelectorAll('.req-card').forEach(c => { const x = matchReqs.find(q => q.id === c.dataset.rid); if (x) c._r = x; });
        }
    }).catch(() => {});
}
function openMatchingSheet() {
    openSheet('Подходящие арендаторы', '<p class="auth-note" style="margin:0 4px 12px">Эти люди ищут жильё, которое подходит под ваши объявления.</p><div id="matchReqBox" class="req-mine"><p class="opt-empty">Загружаю…</p></div>', (el) => {
        el.querySelector('#matchReqBox').addEventListener('click', (ev) => {
            const btn = ev.target.closest('button[data-act="write"]'), card = ev.target.closest('.req-card');
            if (btn && card && card._r) openOfferSheet(card._r);
        });
        refreshMatchingRequests();
    });
}

function openNoMatchSheet() {
    openSheet('Запрос опубликован', `<p class="opt-empty" style="padding:6px 4px 14px">Подходящего жилья в базе пока нет. Хозяева видят ваш запрос и могут предложить варианты: они появятся в карточке запроса, в кнопке «Варианты».</p>
        <button class="primary-btn wide-btn" id="nmOk">Понятно</button>`, (el) => { el.querySelector('#nmOk').onclick = closeSheet; });
}
