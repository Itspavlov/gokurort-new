// ============================================
// REQUESTS.JS — «Ищут / Предлагают», запросы арендаторов и счётчик объявлений.
// Все ограничения (раз в 60 секунд, 3 объявления в сутки) проверяет сервер;
// здесь только показ таймера и счётчика.
// ============================================
let reqList = [];
let reqView = 'all';                 // all | seek | offer
let reqCooldownUntil = 0;
let reqTicker = 0;
let reqEditing = null;

const REQ_NOUN = { apartment: 'квартиру', house: 'дом', hotel: 'отель', room: 'комнату', guest: 'гостевой дом' };
const REQ_CATS = [['', 'Любое жильё'], ['apartment', 'Квартира'], ['house', 'Дом'], ['hotel', 'Отель'], ['room', 'Комната'], ['guest', 'Гостевой дом']];
const REQ_STATUS = { active: 'Активен', found: 'Найдено жильё', closed: 'Закрыт', expired: 'Истёк срок' };

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
    const url = `${SERVER_URL}/api/requests?status=active${cat ? '&category=' + cat : ''}`;
    const h = getToken() ? { Authorization: 'Bearer ' + getToken() } : {};
    fetch(url, { headers: h }).then(r => r.json()).then(d => {
        if (!d || !d.ok) return;
        reqList = d.requests || [];
        if (getToken() && typeof d.cooldown === 'number') setCooldown(d.cooldown);
        paintRequests();
        cb && cb();
    }).catch(() => {});
}

// ---------- карточки ----------
function reqCardHTML(r, opts = {}) {
    const e = escapeHtml;
    const noun = REQ_NOUN[r.category] || 'жильё';
    const lines = [
        (r.city || r.district) ? `<span><i class="fas fa-location-dot"></i>${e([r.city, r.district].filter(Boolean).join(', '))}</span>` : '',
        r.dateFrom ? `<span><i class="fas fa-calendar"></i>${fmtShortDate(r.dateFrom)}${r.dateTo ? '–' + fmtShortDate(r.dateTo) : ''}</span>` : '',
        r.guests ? `<span><i class="fas fa-user-group"></i>${r.guests} ${r.guests === 1 ? 'гость' : 'гостя'}</span>` : '',
        r.budget ? `<span><i class="fas fa-ruble-sign"></i>до ${Number(r.budget).toLocaleString('ru-RU')} ₽/сутки</span>` : ''
    ].join('');
    const st = r.status !== 'active' ? `<em class="req-status">${REQ_STATUS[r.status] || ''}</em>` : '';
    const found = r.mine && r.status === 'active'
        ? `<button type="button" class="main" data-act="options"><i class="fas fa-house-circle-check"></i> Варианты${r.matchCount ? ': ' + r.matchCount : ''}${r.offerCount ? ' · предложений ' + r.offerCount : ''}</button>` : '';
    const actions = r.mine
        ? (r.status === 'active' ? found + `<button type="button" data-act="notify" title="Сообщать, когда появится подходящее жильё"><i class="fas ${r.notify === false ? 'fa-bell-slash' : 'fa-bell'}"></i> ${r.notify === false ? 'Не сообщать' : 'Сообщать о новом'}</button><button type="button" data-act="found">Нашёл жильё</button><button type="button" data-act="edit">Изменить</button><button type="button" data-act="closed">Закрыть</button>` : '')
        : (r.status === 'active' ? `<button type="button" class="main" data-act="write"><i class="fas fa-paper-plane"></i> Предложить жильё</button>` : '');
    return `<div class="req-card${r.mine ? ' mine' : ''}" data-rid="${e(r.id)}">
        <div class="req-head"><div class="chat-avatar" style="background:${dmColor(r.ownerName)}">${e(Array.from(r.ownerName)[0] || '?')}</div>
            <div class="req-title"><b>${e(r.mine ? 'Вы ищете' : r.ownerName + ' ищет')} ${noun}</b><small>${fmtAgo ? fmtAgo(r.created) : ''}</small></div>${st}</div>
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
    const sorted = reqList.slice().sort((x, y) => x.created - y.created);
    let added = 0;
    for (const r of sorted) {
        const w = document.createElement('div');
        w.className = 'req-item'; w.dataset.ts = r.created; w.dataset.rid = r.id;
        w.innerHTML = reqCardHTML(r);
        const after = Array.from(msgs.children).find(c => !c.classList.contains('req-item') && itemTs(c) > r.created);
        if (after) msgs.insertBefore(w, after); else msgs.appendChild(w);
        added++;
    }
    const empty = document.getElementById('reqEmpty');
    if (empty) empty.hidden = reqList.length > 0;
    const cnt = document.querySelector('.seek-tab[data-v="seek"] b');
    if (cnt) cnt.textContent = reqList.length ? reqList.length : '';
    if (added && (nearBottom || reqView === 'seek')) msgs.scrollTop = msgs.scrollHeight;
}

// ---------- переключатель Все / Ищут / Предлагают ----------
function seekBarHTML() {
    const t = (v, l) => `<button type="button" role="tab" class="seek-tab ${reqView === v ? 'on' : ''}" data-v="${v}" aria-selected="${reqView === v}">${l}${v === 'seek' ? '<b></b>' : ''}</button>`;
    return `<div class="seek-bar" id="seekBar"><div class="seek-tabs" role="tablist">${t('all', 'Все')}${t('seek', 'Ищут')}${t('offer', 'Предлагают')}</div>
        <button type="button" class="seek-add" id="seekAdd"><i class="fas fa-plus"></i> Ищу жильё</button></div>`;
}

function applyReqView() {
    const msgs = document.getElementById('chatMessages');
    if (!msgs) return;
    msgs.classList.toggle('view-seek', reqView === 'seek');
    msgs.classList.toggle('view-offer', reqView === 'offer');
    document.querySelectorAll('.seek-tab').forEach(b => { const on = b.dataset.v === reqView; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    msgs.scrollTop = msgs.scrollHeight;
}

function setupSeekBar() {
    if (!document.getElementById('catChips') || document.getElementById('seekBar')) return;
    const wrap = document.querySelector('.cat-chips-wrap');
    const msgs = document.getElementById('chatMessages');
    if (!wrap || !msgs) return;
    wrap.insertAdjacentHTML('afterend', seekBarHTML());
    const welcome = msgs.querySelector('.chat-welcome');
    const box = msgs;
    msgs.insertAdjacentHTML('beforeend', '<div class="req-empty" id="reqEmpty" hidden><i class="fas fa-magnifying-glass"></i><b>Пока нет запросов</b><span>Ищете жильё? Нажмите «Ищу жильё»: хозяева увидят запрос и предложат варианты.</span></div>');
    document.getElementById('seekBar').addEventListener('click', (ev) => {
        const tab = ev.target.closest('.seek-tab');
        if (tab) { reqView = tab.dataset.v; applyReqView(); return; }
        if (ev.target.closest('#seekAdd')) openRequestSheet();
    });
    msgs.addEventListener('click', (ev) => { if (ev.target.closest('.req-card')) onReqCardClick(ev); });
    applyReqView();
    paintRequests();
    loadRequests();
}

const _openGroupForReq = openGroup;
openGroup = function () { const r = _openGroupForReq.apply(this, arguments); setTimeout(setupSeekBar, 0); return r; };

// ---------- действия на карточке ----------
function onReqCardClick(ev) {
    const btn = ev.target.closest('button[data-act]');
    const card = ev.target.closest('.req-card');
    if (!btn || !card) return;
    const r = reqList.find(x => x.id === card.dataset.rid) || myReqs.find(x => x.id === card.dataset.rid);
    if (!r) return;
    const act = btn.dataset.act;
    if (act === 'write') { openOfferSheet(r); return; }
    if (act === 'options') { openOptionsSheet(r); return; }
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
    loginRequired(() => {
        reqEditing = edit && edit.id ? edit : null;
        const e = escapeHtml, r = reqEditing || {};
        const catOpts = REQ_CATS.map(([v, l]) => `<option value="${v}" ${(r.category || (typeof currentRoom === 'string' && currentRoom.startsWith('housing-') && housingCatByRoom(currentRoom).id) || '') === v ? 'selected' : ''}>${l}</option>`).join('');
        openSheet(reqEditing ? 'Изменить запрос' : 'Ищу жильё', `
            <p class="auth-note" style="margin:0 4px 12px">Хозяева увидят запрос и предложат варианты. Запрос живёт 14 дней.</p>
            <label class="field"><span>Что ищете</span><select id="rqCat">${catOpts}</select></label>
            <label class="field"><span>Город</span><input id="rqCity" maxlength="60" placeholder="Например: Адлер" value="${e(r.city || '')}"></label>
            <label class="field"><span>Район (необязательно)</span><input id="rqDistrict" maxlength="60" value="${e(r.district || '')}"></label>
            <div class="rq-row"><label class="field"><span>Заезд</span><input id="rqFrom" type="date" min="${todayISO()}" value="${e(r.dateFrom || '')}"></label>
            <label class="field"><span>Выезд</span><input id="rqTo" type="date" min="${todayISO()}" value="${e(r.dateTo || '')}"></label></div>
            <div class="rq-row"><label class="field"><span>Гостей</span><input id="rqGuests" type="number" inputmode="numeric" min="1" max="30" value="${r.guests || ''}"></label>
            <label class="field"><span>Бюджет, ₽/сутки</span><input id="rqBudget" type="number" inputmode="numeric" min="1" value="${r.budget || ''}"></label></div>
            <label class="field"><span>Пожелания</span><textarea id="rqText" maxlength="300" rows="3" placeholder="Например: недалеко от моря, можно с животными">${e(r.text || '')}</textarea></label>
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
                const body = { category: v('#rqCat'), city: v('#rqCity'), district: v('#rqDistrict'), dateFrom: from, dateTo: to, guests: v('#rqGuests'), budget: v('#rqBudget'), text: v('#rqText') };
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
                    showToast(reqEditing ? 'Запрос обновлён' : (d.matches ? 'Мы нашли ' + d.matches + ' ' + plural(d.matches, 'вариант', 'варианта', 'вариантов') + ' под ваш запрос' : 'Запрос опубликован. Хозяева его увидят'));
                    reqView = reqEditing ? reqView : 'seek';
                    applyReqView();
                    loadRequests(refreshMyRequests);
                    // после публикации сразу показываем найденные варианты во всплывающем окне
                    if (!reqEditing && d.matches) setTimeout(() => openOptionsSheet(d.request), 350);
                    else if (!reqEditing) setTimeout(() => openNoMatchSheet(), 350);
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
function paintMyRequests() {
    const act = myReqs.filter(r => r.status === 'active');
    const cnt = document.getElementById('rowReqCount');
    if (cnt) { cnt.hidden = !act.length; cnt.textContent = String(act.length); }
    const box = document.getElementById('myReqBox');
    if (!box) return;
    if (!myReqs.length) { box.innerHTML = '<div class="req-empty"><i class="fas fa-magnifying-glass"></i><b>Запросов пока нет</b><span>Нажмите «Ищу жильё»: хозяева увидят запрос, а подходящее жильё мы найдём сами.</span></div>'; return; }
    const hist = myReqs.filter(r => r.status !== 'active');
    const row = (r) => `<div class="req-row">${reqCardHTML(r)}<button type="button" class="req-del" data-del="${escapeHtml(r.id)}" aria-label="Удалить запрос"><i class="fas fa-trash"></i><span>Удалить</span></button></div>`;
    box.innerHTML = (act.length ? '<div class="opt-sec">Активные</div>' + act.map(row).join('') : '')
        + (hist.length ? '<div class="opt-sec" style="margin-top:8px">История</div>' + hist.slice(0, 15).map(row).join('') : '');
}

function openMyRequests() {
    loginRequired(() => {
        openSheet('Мои запросы', `<div id="myReqBox" class="req-mine"><p class="opt-empty">Загружаю…</p></div>
            <button class="primary-btn wide-btn" id="myReqAdd" style="margin-top:12px"><i class="fas fa-magnifying-glass"></i> Ищу жильё</button>`, (el) => {
            paintMyRequests(); refreshMyRequests();
            el.querySelector('#myReqAdd').onclick = () => openRequestSheet();
            el.querySelector('#myReqBox').addEventListener('click', (ev) => {
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
            });
        });
    });
}

// ---------- счётчик объявлений («Сегодня опубликовано: 2 из 3») ----------
function loadQuota(cb) {
    if (!getToken()) return;
    fetch(`${SERVER_URL}/api/listings/quota`, { headers: { Authorization: 'Bearer ' + getToken() } }).then(r => r.json()).then(d => { if (d && d.ok) cb(d.quota); }).catch(() => {});
}
const quotaText = (q) => `Сегодня опубликовано: ${q.used} из ${q.limit}` + (q.left === 0 ? '. Новые — завтра, редактировать можно всегда' : '');

const _renderProfileReq = renderProfile;
renderProfile = function () {
    _renderProfileReq.apply(this, arguments);
    const root = document.getElementById('profileRoot');
    if (!root) return;
    if (!getToken()) { const r = document.getElementById('rowReq'); if (r) r.hidden = true; return; }
    const add = root.querySelector('.pf-add');
    if (add) {
        add.insertAdjacentHTML('beforebegin', '<div class="quota-line" id="quotaLineProf"></div>');
        loadQuota((q) => { const el = document.getElementById('quotaLineProf'); if (el) { el.textContent = quotaText(q); el.classList.toggle('full', q.left === 0); } });
    }
    paintMyRequests(); refreshMyRequests(); refreshMatchingRequests();
};

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
    const add = document.getElementById('seekAdd');
    const paint = () => {
        const w = cooldownLeft();
        const b = document.getElementById('seekAdd');
        if (b) b.innerHTML = w > 0 ? `<i class="fas fa-clock"></i> ${fmtCountdown(w)}` : '<i class="fas fa-plus"></i> Ищу жильё';
        if (w <= 0) clearInterval(reqTicker);
    };
    paint();
    if (cooldownLeft() > 0) reqTicker = setInterval(paint, 500);
}

// ---------- обновление в реальном времени ----------
const _onSocialEventReq = onSocialEvent;
onSocialEvent = function (ev, d) {
    if (ev === 'request-changed') { clearTimeout(onSocialEvent._rt); onSocialEvent._rt = setTimeout(() => { if (document.getElementById('seekBar')) loadRequests(); if (document.getElementById('myReqBox') || document.getElementById('rowReq')) refreshMyRequests(); if (document.getElementById('matchReqBox') || document.getElementById('rowMatch')) refreshMatchingRequests(); }, 400); return; }
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
            box.innerHTML = `<div class="opt-sec">Предложения хозяев</div>${offHTML}<div class="opt-sec" style="margin-top:14px">Подходящее жильё: ${rest.length}</div>${matHTML}`;
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
