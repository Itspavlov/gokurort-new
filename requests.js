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
    const actions = r.mine
        ? (r.status === 'active' ? `<button type="button" data-act="found">Нашёл жильё</button><button type="button" data-act="edit">Изменить</button><button type="button" data-act="closed">Закрыть</button>` : '')
        : (r.status === 'active' ? `<button type="button" class="main" data-act="write"><i class="fas fa-paper-plane"></i> Предложить жильё</button>` : '');
    return `<div class="req-card${r.mine ? ' mine' : ''}" data-rid="${e(r.id)}">
        <div class="req-head"><div class="chat-avatar" style="background:${dmColor(r.ownerName)}">${e(Array.from(r.ownerName)[0] || '?')}</div>
            <div class="req-title"><b>${e(r.mine ? 'Вы ищете' : r.ownerName + ' ищет')} ${noun}</b><small>${fmtAgo ? fmtAgo(r.created) : ''}</small></div>${st}</div>
        ${lines ? `<div class="req-lines">${lines}</div>` : ''}
        ${r.text ? `<p class="req-text">${e(r.text)}</p>` : ''}
        ${actions ? `<div class="req-actions">${actions}</div>` : ''}</div>`;
}

function paintRequests() {
    const box = document.getElementById('reqBlock');
    if (!box) return;
    box.innerHTML = reqList.length
        ? reqList.map(r => reqCardHTML(r)).join('')
        : `<div class="req-empty"><i class="fas fa-magnifying-glass"></i><b>Пока нет запросов</b><span>Ищете жильё? Нажмите «Ищу жильё» — хозяева увидят запрос и предложат варианты.</span></div>`;
    const cnt = document.querySelector('.seek-tab[data-v="seek"] b');
    if (cnt) cnt.textContent = reqList.length ? reqList.length : '';
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
    if (reqView === 'seek') msgs.scrollTop = 0;
}

function setupSeekBar() {
    if (!document.getElementById('catChips') || document.getElementById('seekBar')) return;
    const wrap = document.querySelector('.cat-chips-wrap');
    const msgs = document.getElementById('chatMessages');
    if (!wrap || !msgs) return;
    wrap.insertAdjacentHTML('afterend', seekBarHTML());
    const welcome = msgs.querySelector('.chat-welcome');
    const box = document.createElement('div');
    box.id = 'reqBlock';
    if (welcome) welcome.insertAdjacentElement('afterend', box); else msgs.prepend(box);
    document.getElementById('seekBar').addEventListener('click', (ev) => {
        const tab = ev.target.closest('.seek-tab');
        if (tab) { reqView = tab.dataset.v; applyReqView(); return; }
        if (ev.target.closest('#seekAdd')) openRequestSheet();
    });
    box.addEventListener('click', onReqCardClick);
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
    const r = reqList.find(x => x.id === card.dataset.rid);
    if (!r) return;
    const act = btn.dataset.act;
    if (act === 'write') {
        const dates = r.dateFrom ? ' на ' + fmtShortDate(r.dateFrom) + (r.dateTo ? '–' + fmtShortDate(r.dateTo) : '') : '';
        startDm(r.ownerName, { id: 'req_' + r.id.slice(2, 30), title: 'Запрос: ' + (r.city || 'жильё') + dates },
            `Здравствуйте! Видел ваш запрос${r.city ? ' (' + r.city + ')' : ''}${dates}. Могу предложить жильё: `);
    } else if (act === 'edit') openRequestSheet(r);
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
                    showToast(reqEditing ? 'Запрос обновлён' : 'Запрос опубликован. Хозяева его увидят');
                    reqView = reqEditing ? reqView : 'seek';
                    applyReqView();
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
function paintMyRequests() {
    const box = document.getElementById('myReqBox');
    if (!box) return;
    box.innerHTML = myReqs.length ? myReqs.slice(0, 20).map(r => reqCardHTML(r)).join('') : '<p class="profile-foot" style="margin:6px 0 0">Здесь появятся ваши запросы на жильё.</p>';
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
    if (!root || !getToken()) return;
    const add = Array.from(root.querySelectorAll('.wide-btn')).find(b => /Добавить жильё/.test(b.textContent));
    if (add) {
        add.insertAdjacentHTML('beforebegin', '<div class="quota-line" id="quotaLine"></div>');
        loadQuota((q) => { const el = document.getElementById('quotaLine'); if (el) { el.textContent = quotaText(q); el.classList.toggle('full', q.left === 0); } });
        add.insertAdjacentHTML('afterend', `<div class="section-head" style="margin-top:22px"><h2 class="section-title">Мои запросы</h2></div><div id="myReqBox" class="req-mine"></div>
            <button class="ghost-btn wide-btn" onclick="openRequestSheet()" style="margin-top:10px"><i class="fas fa-magnifying-glass"></i> Ищу жильё</button>`);
        document.getElementById('myReqBox').addEventListener('click', (ev) => {
            const btn = ev.target.closest('button[data-act]'), card = ev.target.closest('.req-card');
            if (!btn || !card) return;
            const r = myReqs.find(x => x.id === card.dataset.rid); if (!r) return;
            if (btn.dataset.act === 'edit') openRequestSheet(r);
            else { reqList = myReqs; onReqCardClick(ev); }
        });
        paintMyRequests(); refreshMyRequests();
    }
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
    if (ev === 'request-changed') { clearTimeout(onSocialEvent._rt); onSocialEvent._rt = setTimeout(() => { if (document.getElementById('reqBlock')) loadRequests(); }, 400); return; }
    return _onSocialEventReq.apply(this, arguments);
};
