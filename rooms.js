// ============================================
// ROOMS.JS — чаты жилья по типам (чипсы сверху) и всплывающие подсказки-тултипы.
// Подключается раньше app.js; всё, что здесь, вызывается уже после загрузки страницы.
// ============================================

const HOUSING_CATS = [
    { id: 'all',       room: 'housing',           label: 'Все',      one: 'Все типы',     icon: 'fa-border-all' },
    { id: 'apartment', room: 'housing-apartment', label: 'Квартиры', one: 'Квартира',     icon: 'fa-building' },
    { id: 'house',     room: 'housing-house',     label: 'Дома',     one: 'Дом',          icon: 'fa-house' },
    { id: 'hotel',     room: 'housing-hotel',     label: 'Отели',    one: 'Отель',        icon: 'fa-hotel' },
    { id: 'room',      room: 'housing-room',      label: 'Комнаты',  one: 'Комната',      icon: 'fa-door-open' },
    { id: 'guest',     room: 'housing-guest',     label: 'Гостевые', one: 'Гостевой дом', icon: 'fa-bed' }
];
const AD_CATS = HOUSING_CATS.filter(c => c.id !== 'all');

function isHousingRoom(room) { return room === 'housing' || (typeof room === 'string' && room.startsWith('housing-')); }
function housingCatByRoom(room) { return HOUSING_CATS.find(c => c.room === room) || HOUSING_CATS[0]; }

// Категория объявления. У старых объявлений её нет — угадываем по названию.
function adCategory(ad) {
    if (ad && AD_CATS.some(c => c.id === ad.category)) return ad.category;
    const t = String((ad && ad.title) || '').toLowerCase();
    if (/гостев|хостел/.test(t)) return 'guest';
    if (/отел|гостиниц/.test(t)) return 'hotel';
    if (/(^|\s)комнат(у|а|ы)(\s|$)/.test(t)) return 'room';
    if (/квартир|студи|апарт/.test(t)) return 'apartment';
    if (/дом|коттедж|вилл|дач/.test(t)) return 'house';
    return 'apartment';
}

// Объявления, которые должны стоять в данном чате жилья
function adsForRoom(room) {
    const cat = housingCatByRoom(room);
    return (list) => cat.id === 'all' ? list : list.filter(a => adCategory(a) === cat.id);
}

function housingCounts() {
    const c = { all: 0 };
    AD_CATS.forEach(x => c[x.id] = 0);
    (typeof getAllAds === 'function' ? getAllAds() : []).forEach(a => { c.all++; c[adCategory(a)]++; });
    return c;
}

function housingChipsHTML(room) {
    const counts = housingCounts();
    return `<div class="cat-chips-wrap"><div class="cat-chips" id="catChips" role="tablist" aria-label="Тип жилья">${HOUSING_CATS.map(c => `
        <button type="button" role="tab" class="cat-chip ${c.room === room ? 'on' : ''}" aria-selected="${c.room === room}" data-room="${c.room}" onclick="openHousingRoom('${c.room}')">
            <i class="fas ${c.icon}"></i><span>${c.label}</span>${counts[c.id] ? `<b>${counts[c.id]}</b>` : ''}
        </button>`).join('')}</div></div>`;
}

function openHousingRoom(room) {
    if (room === currentRoom) return;
    closeTip();
    openGroup(room);
}

// Цифры на чипсах обновляются, когда с сервера приходят объявления
function refreshHousingChips() {
    const wrap = document.getElementById('catChips');
    if (!wrap || !isHousingRoom(currentRoom)) return;
    const counts = housingCounts();
    wrap.querySelectorAll('.cat-chip').forEach(btn => {
        const c = housingCatByRoom(btn.dataset.room);
        let b = btn.querySelector('b');
        if (counts[c.id]) { if (!b) { b = document.createElement('b'); btn.appendChild(b); } b.textContent = counts[c.id]; }
        else if (b) b.remove();
    });
}

function centerActiveChip() {
    const on = document.querySelector('#catChips .cat-chip.on');
    const wrap = document.getElementById('catChips');
    if (on && wrap) wrap.scrollLeft = on.offsetLeft - (wrap.clientWidth - on.offsetWidth) / 2;
}

// ============================================
// ПОДСКАЗКИ (тултипы)
// ============================================
let tipEl = null, tipSpot = null, tipAnchor = null;

function tipSeen(key) { try { return localStorage.getItem('yy-tour-' + key) === '1'; } catch (e) { return false; } }
function tipMark(key) { try { localStorage.setItem('yy-tour-' + key, '1'); } catch (e) {} }
function resetTips() {
    try { Object.keys(localStorage).filter(k => k.startsWith('yy-tour-')).forEach(k => localStorage.removeItem(k)); } catch (e) {}
    showToast('Подсказки покажутся снова');
}

function closeTip() {
    if (tipEl) { tipEl.remove(); tipEl = null; }
    if (tipSpot) { tipSpot.remove(); tipSpot = null; }
    tipAnchor = null;
    window.removeEventListener('resize', placeTip);
}

function placeTip() {
    if (!tipEl || !tipAnchor || !document.body.contains(tipAnchor)) return;
    const r = tipAnchor.getBoundingClientRect();
    const pad = 6;
    if (tipSpot) Object.assign(tipSpot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    const W = window.innerWidth, H = window.innerHeight, m = 12;
    const w = Math.min(310, W - m * 2);
    tipEl.style.width = w + 'px';
    const h = tipEl.offsetHeight;
    const below = r.bottom + 14 + h + m <= H || r.top - 14 - h < m;
    const top = below ? Math.min(r.bottom + 14, H - h - m) : r.top - 14 - h;
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(m, Math.min(left, W - w - m));
    tipEl.style.top = Math.max(m, top) + 'px';
    tipEl.style.left = left + 'px';
    tipEl.classList.toggle('above', !below);
    const ax = Math.max(22, Math.min(r.left + r.width / 2 - left, w - 22));
    tipEl.style.setProperty('--ax', ax + 'px');
}

// step: { sel | el, title, text, next, action: {label, fn}, index, total }
function showTip(step, onNext, onClose) {
    closeTip();
    const anchor = step.el || document.querySelector(step.sel);
    if (!anchor) return false;
    tipAnchor = anchor;
    tipSpot = document.createElement('div');
    tipSpot.className = 'tip-spot';
    document.body.appendChild(tipSpot);
    tipEl = document.createElement('div');
    tipEl.className = 'tip';
    tipEl.setAttribute('role', 'dialog');
    tipEl.setAttribute('aria-label', step.title || 'Подсказка');

    const close = document.createElement('button');
    close.type = 'button'; close.className = 'tip-x'; close.setAttribute('aria-label', 'Закрыть подсказку');
    close.innerHTML = '<i class="fas fa-xmark"></i>';
    close.onclick = () => { closeTip(); if (onClose) onClose(); };
    const t = document.createElement('div'); t.className = 'tip-title'; t.textContent = step.title || '';
    const p = document.createElement('div'); p.className = 'tip-text'; p.textContent = step.text || '';
    const foot = document.createElement('div'); foot.className = 'tip-foot';
    if (step.total > 1) { const c = document.createElement('span'); c.className = 'tip-count'; c.textContent = step.index + ' из ' + step.total; foot.appendChild(c); }
    if (step.action) {
        const a = document.createElement('button'); a.type = 'button'; a.className = 'tip-btn ghost'; a.textContent = step.action.label;
        a.onclick = () => { closeTip(); if (onClose) onClose(); step.action.fn(); };
        foot.appendChild(a);
    }
    const n = document.createElement('button'); n.type = 'button'; n.className = 'tip-btn'; n.textContent = step.next || 'Понятно';
    n.onclick = () => { if (onNext) onNext(); else closeTip(); };
    foot.appendChild(n);
    tipEl.append(close, t, p, foot);
    document.body.appendChild(tipEl);

    const sc = anchor.closest('.chat-messages');
    if (sc && anchor.classList.contains('chat-message')) anchor.scrollIntoView({ block: 'center' });
    window.addEventListener('resize', placeTip);
    placeTip();
    requestAnimationFrame(() => { if (tipEl) tipEl.classList.add('in'); });
    return true;
}

// Тур из нескольких подсказок. Показывается один раз; force — по кнопке «?».
function runTour(id, steps, force) {
    if (!force && tipSeen(id)) return;
    const list = steps.filter(s => s.el || document.querySelector(s.sel));
    if (!list.length) return;
    let i = 0;
    const finish = () => { tipMark(id); closeTip(); };
    const go = () => {
        const s = list[i];
        const last = i === list.length - 1;
        const ok = showTip(Object.assign({}, s, { index: i + 1, total: list.length, next: last ? 'Понятно' : 'Дальше' }),
            () => { if (last) finish(); else { i++; go(); } }, finish);
        if (!ok) finish();
    };
    go();
}

// ---------- подсказки чата жилья (для всех) ----------
function housingTour(force) {
    runTour('housing2', [
        { sel: '#catChips', title: 'Выберите тип жилья', text: 'У каждого типа своя лента: только квартиры, только дома и так далее. «Все» — всё жильё сразу. Цифра — сколько объявлений.' },
        { sel: '.chat-message-ad', title: 'Это объявление', text: 'Нажмите на карточку: откроются фото, карта и свободные даты. Сердечко на фото добавляет в избранное, цифра с камерой — число фото, зонтик — расстояние до моря. Ниже значки удобств: Wi-Fi, парковка, бассейн.' },
        { sel: '#dockSeek', title: 'Кнопка «Ищу»', text: 'Ищете жильё? Укажите город, даты, гостей и бюджет: хозяева увидят запрос и предложат варианты. Переписки в разделе нет, договариваться можно в личных сообщениях.' },
        { sel: '#dockOffer', title: 'Кнопка «Предоставляю»', text: 'Сдаёте или продаёте жильё? Опубликуйте объявление. Если оно уже было, можно поднять его наверх списка или создать новое.' },
        { sel: '.seek-tabs', title: 'Ищут и Предлагают', text: 'Фильтр ленты: только запросы или только предложения. Повторное нажатие снимает фильтр.' },
        { sel: '.chat-help-btn', title: 'Вы хозяин?', text: 'Размещайте жильё во вкладке «Профиль»: при публикации вы выбираете тип, и объявление попадает в нужный чат. Подсказки всегда под этой кнопкой.',
          action: { label: 'В профиль', fn: () => goToProfileFromChat() } }
    ], force);
}

// ---------- подсказки для хозяев ----------
function hostProfileTip() {
    runTour('host-profile', [
        { sel: '#profileRoot .wide-btn', title: 'Разместить жильё', text: 'Нажмите, выберите тип (квартира, дом, отель, комната, гостевой дом), добавьте фото, цену и свободные даты. Объявление появится в чате этого типа и в общем чате «Все». Публиковать могут проверенные хозяева — заявку отправите прямо из формы.' }
    ]);
}

function hostFormTip() {
    runTour('host-form', [
        { sel: '#fmCat', title: 'Выберите тип жилья', text: 'От этого зависит, в каком чате увидят ваше объявление: гостевые дома — в «Гостевые», комнаты — в «Комнаты». Ошибиться не страшно: тип можно изменить потом.' },
        { sel: '#fmType', title: 'Сдаю или продаю', text: 'Для аренды появятся удобства, условия заселения и календарь свободных дат. Для продажи — только цена и описание.' }
    ]);
}

// ---------- первый запуск: что где находится ----------
function homeTour() {
    const run = () => {
        if (document.getElementById('group-screen')?.style.display === 'flex' || document.querySelector('.sheet-overlay, .listing-screen.open')) return;
        runTour('home', [
            { sel: '.gc-housing', title: 'Чаты по темам', text: 'Нажмите на плитку — откроется чат. В «Жильё» сверху выбираете тип: квартиры, дома, отели, комнаты, гостевые.' },
            { sel: '.bottom-nav-inner', title: 'Нижняя панель', text: 'Главная — чаты по темам. Сообщения — личные диалоги с хозяевами. Контакты — пригласить друзей. Профиль — аккаунт, уведомления и ваши объявления.' }
        ]);
    };
    setTimeout(run, 1500);
}
window.addEventListener('load', homeTour);
