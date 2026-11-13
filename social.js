// ============================================
// SOCIAL.JS — аккаунты, личные сообщения, реакции и ответы
// Подключается после app.js, listing.js и profile.js.
// ============================================

// ---------- АККАУНТ ----------
function getToken() {
    try { return localStorage.getItem('tell-token') || ''; } catch (e) { return ''; }
}

function getAccount() {
    try {
        const a = JSON.parse(localStorage.getItem('tell-account') || 'null');
        return a && a.id && a.name && getToken() ? a : null;
    } catch (e) { return null; }
}

function setSession(token, user) {
    try {
        localStorage.setItem('tell-token', token);
        localStorage.setItem('tell-account', JSON.stringify(user));
        localStorage.setItem('tell-username', user.name); // в общем чате вы — это ваш аккаунт
    } catch (e) {}
}

function clearSession() {
    try { localStorage.removeItem('tell-token'); localStorage.removeItem('tell-account'); } catch (e) {}
}

// Переподключаем сокет, чтобы сервер увидел новый токен
function reconnectSocket() {
    if (!socket) return;
    socket.disconnect();
    socket.connect();
}

async function authRequest(mode, name, password) {
    let res;
    try {
        res = await fetch(`${SERVER_URL}/api/auth/${mode}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mode === 'register' ? Object.assign({ name, password, consent: true, consentVersion: (window.YUGI_LEGAL && window.YUGI_LEGAL.version) || '1' }, typeof pendingRef === 'function' && pendingRef() ? { ref: pendingRef() } : {}) : { name, password })
        });
    } catch (e) {
        return { ok: false, message: 'Нет связи с сервером. Проверьте интернет.' };
    }
    try { return await res.json(); } catch (e) { return { ok: false, message: 'Сервер ответил неожиданно. Попробуйте позже.' }; }
}

function openAuthSheet(onDone, mode = 'login') {
    const e = escapeHtml;
    const body = `
        <div class="auth-tabs">
            <button type="button" class="auth-tab ${mode === 'login' ? 'active' : ''}" data-mode="login">Вход</button>
            <button type="button" class="auth-tab ${mode === 'register' ? 'active' : ''}" data-mode="register">Регистрация</button>
        </div>
        <label class="field"><span>Имя</span><input id="authName" maxlength="24" autocomplete="username" placeholder="Как вас видят другие" value="${e(getAccount() ? '' : (localStorage.getItem('tell-username') || '').startsWith('Гость_') ? '' : (localStorage.getItem('tell-username') || ''))}"></label>
        <label class="field"><span>Пароль</span><input id="authPass" type="password" maxlength="72" autocomplete="current-password" placeholder="Не короче 8 символов"></label>
        <label class="sf-consent" id="authConsent" hidden><input type="checkbox" id="authAgree"><span>Я принимаю <a href="terms.html" target="_blank" rel="noopener">пользовательское соглашение</a> и <a href="privacy.html" target="_blank" rel="noopener">политику конфиденциальности</a> и даю согласие на обработку моих данных</span></label>
        <div class="auth-error" id="authError"></div>
        <button class="primary-btn wide-btn" id="authSubmit"></button>
        <p class="auth-note">Аккаунт нужен для личных сообщений и чтобы никто не писал под вашим именем. Восстановления пароля пока нет — запомните его.</p>`;
    openSheet('Аккаунт YuGi YuGi', body, (el) => {
        let m = mode;
        const submit = el.querySelector('#authSubmit');
        const err = el.querySelector('#authError');
        const paint = () => {
            el.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === m));
            submit.textContent = m === 'login' ? 'Войти' : 'Создать аккаунт';
            el.querySelector('#authPass').setAttribute('autocomplete', m === 'login' ? 'current-password' : 'new-password');
            el.querySelector('#authConsent').hidden = m !== 'register';
            err.textContent = '';
        };
        el.querySelectorAll('.auth-tab').forEach(t => t.addEventListener('click', () => { m = t.dataset.mode; paint(); }));
        paint();
        const go = async () => {
            const name = el.querySelector('#authName').value.trim();
            const pass = el.querySelector('#authPass').value;
            if (!name || !pass) { err.textContent = 'Введите имя и пароль'; return; }
            if (m === 'register' && !el.querySelector('#authAgree').checked) {
                err.textContent = 'Отметьте согласие с соглашением и политикой';
                const box = el.querySelector('#authConsent'); box.classList.add('sf-shake'); setTimeout(() => box.classList.remove('sf-shake'), 500);
                return;
            }
            submit.disabled = true; submit.textContent = 'Подождите...';
            const r = await authRequest(m, name, pass);
            submit.disabled = false;
            if (!r || !r.ok) { err.textContent = (r && r.message) || 'Не получилось'; paint(); err.textContent = (r && r.message) || 'Не получилось'; return; }
            setSession(r.token, r.user);
            if (m === 'register' && typeof clearRef === 'function') clearRef();     // ссылка друга сработала один раз
            closeSheet();
            reconnectSocket();
            showToast(m === 'login' ? 'Вы вошли как ' + r.user.name : 'Аккаунт создан. Добро пожаловать, ' + r.user.name + '!');
            fetchRemoteAds();
            if (typeof renderProfile === 'function') renderProfile();
            if (typeof renderDialogs === 'function') renderDialogs();
            if (typeof renderMyPubs === 'function') renderMyPubs();
            if (onDone) onDone();
        };
        submit.addEventListener('click', go);
        el.querySelector('#authPass').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') go(); });
    });
}

function ensureLogin(cb) {
    if (getAccount()) { cb(); return; }
    openAuthSheet(cb, 'login');
}

async function doLogout() {
    const token = getToken();
    clearSession();
    try { fetch(`${SERVER_URL}/api/auth/logout`, { method: 'POST', headers: { Authorization: 'Bearer ' + token } }); } catch (e) {}
    reconnectSocket();
    showToast('Вы вышли из аккаунта');
    fetchRemoteAds();
    if (typeof renderProfile === 'function') renderProfile();
    if (typeof renderDialogs === 'function') renderDialogs();
    if (typeof renderMyPubs === 'function') renderMyPubs();
}

function accountCardHTML() {
    const a = getAccount();
    if (a) {
        return `<div class="account-card">
            <div class="account-line"><i class="fas fa-circle-check"></i><span>Вы вошли как <b>${escapeHtml(a.name)}</b>${a.verified ? ' <span class="verified-pill"><i class="fas fa-check"></i> проверенный хозяин</span>' : ''}</span></div>
            <button class="ghost-btn" onclick="doLogout()">Выйти</button>
        </div>`;
    }
    return `<div class="account-card">
        <div class="account-line"><i class="fas fa-user-lock"></i><span>Войдите, чтобы писать хозяевам лично и занять своё имя</span></div>
        <button class="primary-btn" onclick="openAuthSheet(null,'login')">Войти</button>
    </div>`;
}

// Сервер сообщает, кто мы: если токен устарел — выходим
function handleServerHello(info) {
    const local = getAccount();
    if (local && !(info && info.user)) {
        clearSession();
        showToast('Сессия истекла. Войдите снова.');
        if (typeof renderProfile === 'function') renderProfile();
    } else if (local) {
        // статус «проверенный хозяин» выдаёт сервер — берём оттуда
        const v = !!(info.user && info.user.verified);
        if (!!local.verified !== v) {
            try { localStorage.setItem('tell-account', JSON.stringify({ ...local, verified: v })); } catch (e) {}
            if (v) showToast('Вы — проверенный хозяин. Можно размещать жильё!');
            if (typeof renderProfile === 'function') renderProfile();
        }
        if (v) migrateLocalAds();
    }
}

// Размещать жильё могут только проверенные хозяева
function ensureVerifiedHost(cb) {
    ensureLogin(() => {
        const a = getAccount();
        if (a && a.verified) { cb(); return; }
        openVerifySheet();
    });
}

function openVerifySheet() {
    openSheet('Только для проверенных хозяев', `
        <p class="auth-note" style="margin:0 0 12px">Чтобы в «Жилье» не появлялись случайные и мошеннические объявления, размещать их могут только проверенные хозяева. Расскажите о себе — мы свяжемся и подтвердим аккаунт.</p>
        <label class="field"><span>О себе и жилье</span><textarea id="verNote" rows="3" maxlength="500" placeholder="Что сдаёте, где, как с вами связаться"></textarea></label>
        <div class="auth-error" id="verError"></div>
        <button class="primary-btn wide-btn" id="verSend">Подать заявку на проверку</button>`, (el) => {
        const err = el.querySelector('#verError'), btn = el.querySelector('#verSend');
        btn.addEventListener('click', async () => {
            const note = el.querySelector('#verNote').value.trim();
            if (note.length < 5) { err.textContent = 'Напишите пару слов о себе и жилье'; return; }
            btn.disabled = true; btn.textContent = 'Отправляю...';
            try {
                const res = await fetch(`${SERVER_URL}/api/auth/verify-request`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
                    body: JSON.stringify({ note })
                });
                const data = await res.json().catch(() => null);
                if (res.ok && data && data.ok) { closeSheet(); showToast(data.already ? 'Вы уже проверены. Обновите страницу.' : 'Заявка отправлена. Мы свяжемся с вами.'); return; }
                err.textContent = (data && data.message) || (res.status === 429 ? 'Слишком часто. Попробуйте позже.' : 'Не удалось отправить');
            } catch (e) { err.textContent = 'Нет связи с сервером'; }
            btn.disabled = false; btn.textContent = 'Подать заявку на проверку';
        });
    });
}

// ---------- СОКЕТ: ожидание и запросы с подтверждением ----------
function whenSocketReady(cb, failCb) {
    connectSocket();
    if (socket && socket.connected) { cb(); return; }
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; if (failCb) failCb(); else showToast('Сервер недоступен. Попробуйте позже.'); } }, 15000);
    socket.once('connect', () => { if (!done) { done = true; clearTimeout(timer); cb(); } });
}

function socketAsk(event, data, cb) {
    let answered = false;
    const timer = setTimeout(() => { if (!answered) { answered = true; cb({ ok: false, message: 'Сервер не отвечает. Попробуйте позже.' }); } }, 10000);
    const handler = (res) => { if (answered) return; answered = true; clearTimeout(timer); cb(res || { ok: false }); };
    if (data === undefined) socket.emit(event, handler); else socket.emit(event, data, handler);
}

// ---------- ЛИЧНЫЕ СООБЩЕНИЯ ----------
let currentDm = null;

function startDm(ownerName, ad, prefill) {
    ensureLogin(() => {
        if (ad && typeof closeListing === 'function') closeListing();
        whenSocketReady(() => {
            socketAsk('dm-open', { ownerName, adId: String(ad.id), adTitle: ad.title }, (res) => {
                if (!res.ok) { showToast(res.message || 'Не удалось открыть диалог'); return; }
                openDmChat(res.conv, prefill);
            });
        });
    });
}

function openDmById(convId) {
    ensureLogin(() => whenSocketReady(() => {
        socketAsk('dm-history', { convId }, (res) => {
            if (!res.ok) { showToast(res.message || 'Диалог не найден'); return; }
            openDmChat(res.conv, '', res.messages);
        });
    }));
}

function dmColor(name) {
    const colors = ['#E8643F', '#12A8A8', '#D98A1E', '#7C5CFF', '#3E7BFF', '#C2417A'];
    return colors[Math.abs(hashCode(name || '')) % colors.length];
}

function renderDmMessage(m) {
    const me = getAccount();
    const mine = me && m.from && m.from.id === me.id;
    const time = formatTime(m.time);
    const id = escapeHtml(String(m.id));
    if (mine) {
        return `<div class="chat-message chat-message-mine" data-id="${id}"><div class="chat-bubble-wrap"><div class="chat-bubble chat-bubble-mine"><div>${escapeHtml(m.text)}</div></div><div class="chat-time-mine">${time}</div></div></div>`;
    }
    const nm = (m.from && m.from.name) || '?';
    return `<div class="chat-message" data-id="${id}"><div class="chat-avatar" data-avn="${avEsc(nm)}" style="background:${dmColor(nm)}">${avInner(nm)}</div><div class="chat-bubble-wrap"><div class="chat-bubble-header"><span class="chat-user-name">${escapeHtml(nm)}</span><span class="chat-time">${time}</span></div><div class="chat-bubble"><div>${escapeHtml(m.text)}</div></div></div></div>`;
}

function openDmChat(conv, prefill, messages) {
    if (socket && currentRoom) socket.emit('leave-room', currentRoom);
    currentRoom = null;
    currentGroup = null;
    clearReply();
    currentDm = { convId: conv.id, with: conv.with };

    tabContents.forEach(section => section.style.display = 'none');
    let screen = document.getElementById('group-screen');
    if (!screen) {
        screen = document.createElement('section');
        screen.id = 'group-screen';
        screen.className = 'group-screen';
        document.getElementById('appMain').appendChild(screen);
    }
    const e = escapeHtml;
    screen.innerHTML = `
        <div class="chat-header">
            <button class="chat-back-btn" onclick="closeDmChat()"><i class="fas fa-arrow-left"></i></button>
            <div class="chat-header-info">
                <div class="chat-header-title">${e(conv.with)}</div>
                <div class="chat-header-subtitle" id="chatStatus">${e(conv.adTitle || 'личный чат')}</div>
            </div>
        </div>
        <div class="chat-messages" id="chatMessages">
            <div class="chat-welcome">
                <div class="chat-welcome-icon"><i class="fas fa-lock"></i></div>
                <div class="chat-welcome-title">Личный чат</div>
                <div class="chat-welcome-text">Один диалог по всем карточкам: жильё, развлечения, движ, запросы.${conv.adTitle ? ' Сейчас: ' + e(conv.adTitle) + '.' : ''} Видите только вы и ${e(conv.with)}.</div>
            </div>
        </div>
        <div class="chat-input-wrapper">
            <input type="text" class="chat-input" id="chatInput" maxlength="1000" placeholder="Написать сообщение..." onkeydown="if(event.key==='Enter'){event.preventDefault();sendDm();}">
            <button class="chat-send-btn" onclick="sendDm()"><i class="fas fa-paper-plane"></i></button>
        </div>`;
    screen.style.display = 'flex';
    if (prefill) document.getElementById('chatInput').value = prefill;

    const paint = (list) => {
        const box = document.getElementById('chatMessages');
        if (!box || !currentDm || currentDm.convId !== conv.id) return;
        box.querySelectorAll('.chat-message').forEach(el => el.remove());
        box.insertAdjacentHTML('beforeend', list.map(renderDmMessage).join(''));
        scrollChatToBottom();
    };
    if (messages) paint(messages);
    else socketAsk('dm-history', { convId: conv.id }, (res) => { if (res.ok) paint(res.messages); else showToast(res.message || 'Не удалось загрузить историю'); });
    setTimeout(() => scrollChatToBottom(), 150);
    attachChatGestures();
}

function closeDmChat() {
    if (document.activeElement) document.activeElement.blur();
    currentDm = null;
    const screen = document.getElementById('group-screen');
    if (screen) screen.style.display = 'none';
    switchTab('messages', false);
}

function sendDm() {
    if (!currentDm) return;
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;
    if (!socket || !socket.connected) { showToast('Сервер недоступен. Проверьте интернет.'); return; }
    const convId = currentDm.convId;
    input.value = '';
    const clientId = newClientId();
    const replyTo = replyDraft && String(replyDraft.id).startsWith('dmm_') ? replyDraft.id : undefined;
    clearReply();
    const attempt = (retry) => socketAsk('dm-send', { convId, text, clientId, replyTo }, (res) => {
        if (res.ok) return;
        if (!retry && !res.code) return attempt(true);  // нет ответа: повтор с тем же clientId — дубля не будет
        input.value = text;
        showToast(res.message || 'Не удалось отправить');
    });
    attempt(false);
}

function onDmMessage(m) {
    if (!m || !m.convId) return;
    const box = document.getElementById('chatMessages');
    if (currentDm && currentDm.convId === m.convId && box) {
        if (!box.querySelector(`.chat-message[data-id="${CSS.escape(String(m.id))}"]`)) {
            box.insertAdjacentHTML('beforeend', renderDmMessage(m));
            scrollChatToBottomSmooth();
        }
        return;
    }
    const dlg = document.getElementById('dialogsRoot');
    if (dlg && dlg.offsetParent !== null) renderDialogs();
}

// ============================================
// ГРУППЫ («Моя группа»)
// ============================================
let currentGroup = null;   // открытая группа: { id, name, code, isOwner, members, messages }
let groupsCache = [];
const adState = {};        // adId -> { counts, mine }

function loginRequired(cb) { ensureLogin(() => whenSocketReady(cb)); }

function refreshGroupsCache(cb) {
    if (!getAccount()) { groupsCache = []; if (cb) cb([]); return; }
    whenSocketReady(() => socketAsk('group-list', undefined, (res) => {
        groupsCache = res.ok ? res.groups : [];
        if (cb) cb(groupsCache);
    }), () => { if (cb) cb([]); });
}

function groupReqHTML(q) {
    const e = escapeHtml;
    const noun = (typeof REQ_NOUN !== 'undefined' && REQ_NOUN[q.category]) || 'жильё';
    const lines = [
        q.dateFrom ? `<span><i class="fas fa-calendar"></i>${fmtShortDate(q.dateFrom)}${q.dateTo ? '–' + fmtShortDate(q.dateTo) : ''}</span>` : '',
        q.guests ? `<span><i class="fas fa-user-group"></i>${q.guests} ${plural(q.guests, 'гость', 'гостя', 'гостей')}</span>` : '',
        q.budget ? `<span><i class="fas fa-ruble-sign"></i>до ${Number(q.budget).toLocaleString('ru-RU')} ₽/сутки</span>` : ''
    ].join('');
    const offerBtn = (q.section || 'housing') === 'housing' ? '<button type="button" class="main" data-greq="offer"><i class="fas fa-paper-plane"></i> Предложить жильё</button>' : '';
    return `<div class="group-req"><div class="gr-h"><i class="fas fa-magnifying-glass"></i> ${(q.section || 'housing') === 'housing' ? 'Запрос на ' + e(noun) : e(q.title || 'Запрос')}</div>
        <div class="gr-who">${e(q.ownerName || '')}${q.city ? ' · ' + e(q.city) : ''}</div>
        ${lines ? `<div class="gr-lines">${lines}</div>` : ''}
        ${q.text ? `<p class="gr-text">${e(q.text)}</p>` : ''}${offerBtn}</div>`;
}

function renderGroupMessage(m) {
    const me = getAccount();
    const mine = me && m.from && m.from.id === me.id;
    const id = escapeHtml(String(m.id));
    const nm = (m.from && m.from.name) || '?';
    const reply = renderReplyHTML(m);
    const ad = m.ad ? `<div class="group-ad" data-ad="${escapeHtml(String(m.ad.id))}">
            <div class="group-ad-title"><i class="fas fa-house-chimney"></i> ${escapeHtml(m.ad.title)}</div>
            ${m.ad.price ? `<div class="group-ad-price">${escapeHtml(m.ad.price)}</div>` : ''}
            ${m.ad.location ? `<div class="group-ad-loc"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(m.ad.location)}</div>` : ''}
            <div class="group-ad-open">Открыть объявление <i class="fas fa-chevron-right"></i></div>
        </div>` : '';
    const rq = m.req ? groupReqHTML(m.req) : '';
    const text = m.text ? `<div>${escapeHtml(m.text)}</div>` : '';
    const chips = `<div class="chat-reactions" data-for="${id}">${renderReactionChips(m)}</div>`;
    const time = formatTime(m.time);
    if (mine) {
        return `<div class="chat-message chat-message-mine" data-id="${id}"><div class="chat-bubble-wrap"><div class="chat-bubble chat-bubble-mine">${reply}${ad}${rq}${text}</div>${chips}<div class="chat-time-mine">${time}</div></div></div>`;
    }
    return `<div class="chat-message" data-id="${id}"><div class="chat-avatar" data-avn="${avEsc(nm)}" style="background:${dmColor(nm)}">${avInner(nm)}</div><div class="chat-bubble-wrap"><div class="chat-bubble-header"><span class="chat-user-name">${escapeHtml(nm)}</span><span class="chat-time">${time}</span></div><div class="chat-bubble">${reply}${ad}${rq}${text}</div>${chips}</div></div>`;
}

function openGroupChat(group, messages) {
    if (socket && currentRoom) socket.emit('leave-room', currentRoom);
    currentRoom = null; currentDm = null;
    clearReply(); closeMsgMenu();
    currentGroup = { id: group.id, name: group.name, code: group.code, isOwner: group.isOwner, members: group.members || [], messages: messages || [] };

    tabContents.forEach(section => section.style.display = 'none');
    let screen = document.getElementById('group-screen');
    if (!screen) {
        screen = document.createElement('section');
        screen.id = 'group-screen';
        screen.className = 'group-screen';
        document.getElementById('appMain').appendChild(screen);
    }
    const e = escapeHtml;
    screen.innerHTML = `
        <div class="chat-header">
            <button class="chat-back-btn" onclick="closeGroupChat()"><i class="fas fa-arrow-left"></i></button>
            <div class="chat-header-info" onclick="openGroupMenu()" style="cursor:pointer">
                <div class="chat-header-title">${e(group.name)}</div>
                <div class="chat-header-subtitle" id="chatStatus">${currentGroup.members.length} ${memberWord(currentGroup.members.length)}</div>
            </div>
            <button class="chat-header-btn" onclick="openGroupMenu()" aria-label="Участники"><i class="fas fa-user-group"></i></button>
        </div>
        <div class="chat-messages" id="chatMessages">
            <div class="chat-welcome">
                <div class="chat-welcome-icon"><i class="fas fa-users"></i></div>
                <div class="chat-welcome-title">Ваша группа</div>
                <div class="chat-welcome-text">Скидывайте сюда объявления (удерживайте объявление в чате «Жильё» → «Добавить в мою группу»), ставьте реакции и выбирайте вместе.</div>
            </div>
        </div>
        <div class="chat-input-wrapper">
            <input type="text" class="chat-input" id="chatInput" maxlength="1000" placeholder="Написать группе..." onkeydown="if(event.key==='Enter'){event.preventDefault();sendGroupMessage();}">
            <button class="chat-send-btn" onclick="sendGroupMessage()"><i class="fas fa-paper-plane"></i></button>
        </div>`;
    screen.style.display = 'flex';
    attachChatGestures();
    paintGroup();
    setTimeout(() => scrollChatToBottom(), 150);
}

function memberWord(n) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'участник';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'участника';
    return 'участников';
}

function paintGroup() {
    const box = document.getElementById('chatMessages');
    if (!box || !currentGroup) return;
    box.querySelectorAll('.chat-message').forEach(el => el.remove());
    box.insertAdjacentHTML('beforeend', currentGroup.messages.map(renderGroupMessage).join(''));
    scrollChatToBottom();
}

function openGroupById(groupId) {
    loginRequired(() => socketAsk('group-open', { groupId }, (res) => {
        if (!res.ok) { showToast(res.message || 'Группа не найдена'); return; }
        openGroupChat(res.group, res.messages);
    }));
}

function closeGroupChat() {
    if (document.activeElement) document.activeElement.blur();
    clearReply(); closeMsgMenu();
    currentGroup = null;
    const screen = document.getElementById('group-screen');
    if (screen) screen.style.display = 'none';
    switchTab('messages', false);
}

function sendGroupMessage() {
    if (!currentGroup) return;
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;
    if (!socket || !socket.connected) { showToast('Сервер недоступен. Проверьте интернет.'); return; }
    const payload = { groupId: currentGroup.id, text, clientId: newClientId() };
    if (replyDraft && !String(replyDraft.id).startsWith('ad_')) payload.replyTo = replyDraft.id;
    input.value = '';
    clearReply();
    const attempt = (retry) => socketAsk('group-send', payload, (res) => {
        if (res.ok) return;
        if (!retry && !res.code) return attempt(true);
        input.value = text;
        showToast(res.message || 'Не удалось отправить');
    });
    attempt(false);
}

function refreshCurrentGroup(cb) {
    if (!currentGroup) return;
    const gid = currentGroup.id;
    socketAsk('group-open', { groupId: gid }, (res) => {
        if (!res.ok || !currentGroup || currentGroup.id !== gid) return;
        currentGroup.members = res.group.members;
        currentGroup.isOwner = res.group.isOwner;
        const st = document.getElementById('chatStatus');
        if (st) st.textContent = currentGroup.members.length + ' ' + memberWord(currentGroup.members.length);
        if (cb) cb();
    });
}

// ---------- создание группы и приглашение ----------
function openCreateGroupSheet(afterCreate) {
    loginRequired(() => {
        openSheet('Новая группа', `
            <p class="auth-note" style="margin:0 4px 14px">Добавьте тех, с кем планируете отдыхать, и выбирайте жильё и развлечения вместе.</p>
            <label class="field"><span>Название группы</span><input id="grpName" maxlength="40" placeholder="Например: Отпуск с друзьями"></label>
            <div class="auth-error" id="grpErr"></div>
            <button class="primary-btn wide-btn" id="grpCreate"><i class="fas fa-user-plus"></i> Создать и пригласить</button>`, (el) => {
            const go = () => {
                const name = el.querySelector('#grpName').value.trim();
                const err = el.querySelector('#grpErr');
                if (name.length < 2) { err.textContent = 'Название: от 2 символов'; return; }
                const btn = el.querySelector('#grpCreate'); btn.disabled = true;
                socketAsk('group-create', { name }, (res) => {
                    btn.disabled = false;
                    if (!res.ok) { err.textContent = res.message || 'Не удалось создать'; return; }
                    closeSheet();
                    refreshGroupsCache();
                    openInviteSheet(res.group, afterCreate);
                });
            };
            el.querySelector('#grpCreate').addEventListener('click', go);
            el.querySelector('#grpName').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') go(); });
            setTimeout(() => el.querySelector('#grpName').focus(), 300);
        });
    });
}

function inviteLink(code) {
    return location.origin + location.pathname + '?join=' + encodeURIComponent(code);
}

function openInviteSheet(group, afterDone) {
    const e = escapeHtml;
    const membersHTML = (list) => list.map(m => `<div class="member-row"><div class="chat-avatar" data-avn="${avEsc(m.name)}" style="background:${dmColor(m.name)}">${avInner(m.name)}</div><span>${e(m.name)}</span>${m.owner ? '<em>создатель</em>' : ''}</div>`).join('');
    openSheet('Пригласить в «' + e(group.name) + '»', `
        <div class="members" id="invMembers">${membersHTML(group.members)}</div>
        <label class="field"><span>Имя друга в YuGi YuGi</span><input id="invName" maxlength="24" placeholder="Как он зарегистрирован"></label>
        <div class="auth-error" id="invErr"></div>
        <button class="primary-btn wide-btn" id="invAdd"><i class="fas fa-user-plus"></i> Добавить</button>
        <button class="ghost-btn wide-btn" id="invShare" style="margin-top:10px"><i class="fas fa-share-nodes"></i> Поделиться ссылкой</button>
        <button class="ghost-btn wide-btn" id="invDone" style="margin-top:10px">Готово — открыть чат</button>
        <p class="auth-note">Друг должен зарегистрироваться в YuGi YuGi. Ссылка-приглашение работает после входа в аккаунт.</p>`, (el) => {
        const err = el.querySelector('#invErr');
        el.querySelector('#invAdd').addEventListener('click', () => {
            const name = el.querySelector('#invName').value.trim();
            if (!name) { err.textContent = 'Введите имя'; return; }
            socketAsk('group-invite', { groupId: group.id, name }, (res) => {
                if (!res.ok) { err.textContent = res.message || 'Не удалось добавить'; return; }
                err.textContent = '';
                group.members.push({ id: res.added.id, name: res.added.name });
                el.querySelector('#invMembers').innerHTML = membersHTML(group.members);
                el.querySelector('#invName').value = '';
                showToast(res.added.name + ' добавлен(а) в группу');
            });
        });
        el.querySelector('#invShare').addEventListener('click', async () => {
            const url = inviteLink(group.code);
            const text = 'Присоединяйся к группе «' + group.name + '» в YuGi YuGi — выберем жильё вместе';
            try {
                if (navigator.share) { await navigator.share({ title: 'YuGi YuGi', text, url }); return; }
            } catch (ex) { if (ex && ex.name === 'AbortError') return; }
            try { await navigator.clipboard.writeText(text + '\n' + url); showToast('Ссылка скопирована'); }
            catch (ex) { showToast(url); }
        });
        el.querySelector('#invDone').addEventListener('click', () => {
            closeSheet();
            if (typeof afterDone === 'function') afterDone(group);
            else openGroupById(group.id);
        });
    });
}

function openGroupMenu() {
    if (!currentGroup) return;
    const g = currentGroup, e = escapeHtml;
    const rows = g.members.map(m => `<div class="member-row"><div class="chat-avatar" data-avn="${avEsc(m.name)}" style="background:${dmColor(m.name)}">${avInner(m.name)}</div><span>${e(m.name)}</span>${m.owner ? '<em>создатель</em>' : ''}</div>`).join('');
    openSheet(e(g.name), `
        <div class="members">${rows}</div>
        <button class="primary-btn wide-btn" id="gmInvite"><i class="fas fa-user-plus"></i> Пригласить</button>
        <button class="ghost-btn wide-btn" id="gmLeave" style="margin-top:10px"><i class="fas fa-right-from-bracket"></i> Выйти из группы</button>`, (el) => {
        el.querySelector('#gmInvite').addEventListener('click', () => {
            closeSheet();
            openInviteSheet({ id: g.id, name: g.name, code: g.code, members: g.members }, () => { refreshCurrentGroup(); });
        });
        el.querySelector('#gmLeave').addEventListener('click', () => {
            if (!confirm('Выйти из группы «' + g.name + '»?')) return;
            socketAsk('group-leave', { groupId: g.id }, (res) => {
                if (!res.ok) { showToast(res.message || 'Не получилось'); return; }
                closeSheet();
                closeGroupChat();
                showToast('Вы вышли из группы');
            });
        });
    });
}

// ---------- «Добавить в мою группу» ----------
function addAdToGroup(adId) {
    const ad = findAd(adId);
    if (!ad) { showToast('Объявление не найдено'); return; }
    loginRequired(() => refreshGroupsCache((list) => {
        const send = (g) => socketAsk('group-send', {
            groupId: g.id, clientId: newClientId(),
            ad: { id: String(ad.id), title: ad.title, price: ad.price || '', location: ad.location || '' }
        }, (res) => {
            if (!res.ok) { showToast(res.message || 'Не удалось добавить'); return; }
            closeSheet();
            showToast('Добавлено в группу «' + g.name + '»');
        });
        if (!list.length) {
            openSheet('У вас пока нет группы', `
                <p class="auth-note" style="margin:0 4px 14px">Создайте группу и добавьте друзей — объявление сразу попадёт туда.</p>
                <button class="primary-btn wide-btn" id="noGrpCreate"><i class="fas fa-user-plus"></i> Создать группу</button>`, (el) => {
                el.querySelector('#noGrpCreate').addEventListener('click', () => {
                    closeSheet();
                    openCreateGroupSheet((group) => {
                        send({ id: group.id, name: group.name });
                        openGroupById(group.id);
                    });
                });
            });
        } else if (list.length === 1) {
            send(list[0]);
        } else {
            openSheet('В какую группу добавить?', list.map(g => `<button class="group-pick" data-id="${escapeHtml(g.id)}"><i class="fas fa-users"></i><span>${escapeHtml(g.name)}</span><em>${g.members} ${memberWord(g.members)}</em></button>`).join(''), (el) => {
                el.querySelectorAll('.group-pick').forEach(b => b.addEventListener('click', () => {
                    const g = list.find(x => x.id === b.dataset.id);
                    if (g) send(g);
                }));
            });
        }
    }));
}

// ---------- «В группу» на карточке запроса ----------
// В группу уходит только id запроса, остальное сервер берёт из самого запроса. Знакомые видят карточку и жмут «Предложить жильё».
function addReqToGroup(rid) {
    loginRequired(() => refreshGroupsCache((list) => {
        const send = (g) => socketAsk('group-send', { groupId: g.id, clientId: newClientId(), req: { id: rid } }, (res) => {
            if (!res.ok) { showToast(res.message || 'Не удалось отправить'); return; }
            closeSheet();
            showToast('Запрос отправлен в группу «' + g.name + '»');
        });
        const rows = list.map(g => `<button class="group-pick" data-id="${escapeHtml(g.id)}"><i class="fas fa-users"></i><span>${escapeHtml(g.name)}</span><em>${g.members} ${memberWord(g.members)}</em></button>`).join('');
        openSheet('Отправить запрос в группу', `
            <p class="auth-note" style="margin:0 4px 12px">${list.length ? 'Выберите группу: участники увидят запрос и смогут предложить своё жильё.' : 'Создайте группу и добавьте знакомых с жильём: они увидят запрос и смогут предложить свой вариант.'}</p>
            ${rows}<button class="group-pick new" id="reqGrpNew"><i class="fas fa-user-plus"></i><span>Новая группа</span></button>`, (el) => {
            el.querySelectorAll('.group-pick[data-id]').forEach(b => b.addEventListener('click', () => { const g = list.find(x => x.id === b.dataset.id); if (g) send(g); }));
            el.querySelector('#reqGrpNew').addEventListener('click', () => {
                closeSheet();
                openCreateGroupSheet((group) => { send({ id: group.id, name: group.name }); openGroupById(group.id); });
            });
        });
    }));
}

// ============================================
// ВКЛАДКА «СООБЩЕНИЯ»: Моя группа + личные чаты
// ============================================
function renderDialogs() {
    const root = document.getElementById('dialogsRoot');
    if (!root) return;

    const banner = (hasGroups) => `
        <div class="my-group-card slim">
            <span class="my-group-icon"><i class="fas fa-users"></i></span>
            <div class="slim-text">Моя группа<small>Друзья и совместный отдых</small></div>
            ${getAccount()
                ? `<button class="primary-btn" onclick="openCreateGroupSheet()"><i class="fas fa-plus"></i> ${hasGroups ? 'Ещё' : 'Создать'}</button>`
                : `<button class="primary-btn" onclick="openAuthSheet(null,'login')">Войти</button>`}
        </div>`;

    if (!getAccount()) {
        root.innerHTML = banner(false) + `
            <div class="placeholder fade-in">
                <span class="placeholder-icon"><i class="fas fa-lock"></i></span>
                <h2 class="placeholder-title">Личные сообщения</h2>
                <p class="placeholder-text">Войдите в аккаунт, чтобы писать хозяевам лично. Эти диалоги видите только вы и собеседник.</p>
            </div>`;
        return;
    }
    root.innerHTML = banner(false) + '<div class="placeholder fade-in"><p class="placeholder-text">Загружаю...</p></div>';
    const fail = () => { root.innerHTML = banner(false) + '<div class="placeholder"><p class="placeholder-text">Сервер недоступен</p></div>'; };

    whenSocketReady(() => {
        socketAsk('group-list', undefined, (gr) => {
            socketAsk('dm-list', undefined, (dr) => {
                const groups = gr.ok ? gr.groups : [];
                groupsCache = groups;
                const dms = dr.ok ? dr.convs : [];
                const groupRows = groups.map(g => `
                    <div class="dialog-row" onclick="openGroupById('${escapeHtml(g.id)}')">
                        <div class="chat-avatar dialog-avatar group-avatar"><i class="fas fa-users"></i></div>
                        <div class="dialog-info">
                            <div class="dialog-name">${escapeHtml(g.name)}</div>
                            <div class="dialog-ad">${escapeHtml(g.last ? (g.last.from ? g.last.from + ': ' : '') + g.last.text : g.members + ' ' + memberWord(g.members))}</div>
                        </div>
                        <div class="dialog-time">${g.last ? fmtAgo(g.last.time) : ''}</div>
                    </div>`).join('');
                const dmRows = dms.map(c => `
                    <div class="swipe-row" data-conv="${escapeHtml(c.id)}">
                    <button type="button" class="swipe-del" data-del="${escapeHtml(c.id)}"><i class="fas fa-trash"></i> Удалить</button>
                    <div class="dialog-row swipe-fg" onclick="openDmById('${escapeHtml(c.id)}')">
                        <div class="chat-avatar dialog-avatar" data-avn="${avEsc(c.with || '?')}" style="background:${dmColor(c.with)}">${avInner(c.with || '?')}</div>
                        <div class="dialog-info">
                            <div class="dialog-name">${escapeHtml(c.with)}</div>
                            <div class="dialog-ad ${c.unread ? 'unread' : ''}">${escapeHtml(c.last ? (c.last.mine ? 'Вы: ' : '') + c.last.text : (c.adTitle || ''))}</div>
                        </div>
                        <div class="dialog-side"><div class="dialog-time">${c.last ? fmtAgo(c.last.time) : ''}</div>${c.unread ? `<span class="dlg-unread">${c.unread > 99 ? '99+' : c.unread}</span>` : (c.blockedByMe ? '<i class="fas fa-ban dlg-ban" title="Заблокирован"></i>' : '')}</div>
                    </div></div>`).join('');
                root.innerHTML = banner(groups.length > 0) +
                    (groups.length ? `<div class="section-head"><h2 class="section-title">Мои группы</h2></div><div class="dialogs">${groupRows}</div>` : '') +
                    `<div class="section-head"><h2 class="section-title">Личные сообщения</h2></div>` +
                    (dms.length ? `<div class="dialogs">${dmRows}</div>` : `
                        <div class="placeholder fade-in">
                            <span class="placeholder-icon"><i class="fas fa-inbox"></i></span>
                            <h2 class="placeholder-title">Пока пусто</h2>
                            <p class="placeholder-text">Откройте объявление в разделе «Жильё» и нажмите «Написать» — диалог появится здесь.</p>
                        </div>`);
            });
        });
    }, fail);
}

// Свайп влево по диалогу открывает красную кнопку «Удалить» (удаляется только у вас)
(function attachDialogSwipe() {
    const root = document.getElementById('dialogsRoot');
    if (!root || root.dataset.swipe) return;
    root.dataset.swipe = '1';
    const W = 88;
    let row = null, fg = null, sx = 0, sy = 0, state = 0, baseX = 0, dx = 0, moved = false;
    const closeAll = (except) => root.querySelectorAll('.swipe-row.open').forEach(r => {
        if (r !== except) { r.classList.remove('open', 'swiping'); r.style.setProperty('--sw', '0px'); const f = r.querySelector('.swipe-fg'); if (f) { f.style.transition = 'transform .18s ease-out'; f.style.transform = ''; } }
    });
    root.addEventListener('pointerdown', (ev) => {
        if (ev.button > 0) return;
        moved = false;
        if (ev.target.closest('.swipe-del')) { row = null; return; }
        const r = ev.target.closest('.swipe-row');
        if (!r) { closeAll(null); row = null; return; }
        closeAll(r);
        row = r; fg = r.querySelector('.swipe-fg');
        sx = ev.clientX; sy = ev.clientY; state = 0; moved = false;
        baseX = r.classList.contains('open') ? -W : 0; dx = baseX;
        fg.style.transition = '';
    });
    root.addEventListener('pointermove', (ev) => {
        if (!row) return;
        const mx = ev.clientX - sx, my = ev.clientY - sy;
        if (state === 0) {
            if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { state = -1; return; }
            if (Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(my) * 1.5) { state = 1; try { root.setPointerCapture(ev.pointerId); } catch (e) {} }
            else return;
        }
        if (state !== 1) return;
        moved = true;
        row.classList.add('swiping');
        dx = Math.max(-W, Math.min(0, baseX + mx));
        fg.style.transform = `translateX(${dx}px)`;
        row.style.setProperty('--sw', -dx + 'px');
    });
    const end = () => {
        if (row && state === 1) {
            const open = dx < -W / 2;
            row.classList.toggle('open', open);
            row.classList.remove('swiping');
            fg.style.transition = 'transform .18s ease-out';
            fg.style.transform = open ? `translateX(${-W}px)` : '';
            row.style.setProperty('--sw', open ? W + 'px' : '0px');
        }
        row = null;
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    root.addEventListener('click', (ev) => {
        const del = ev.target.closest('.swipe-del');
        if (del) {
            ev.stopPropagation(); ev.preventDefault();
            if (!confirm('Удалить переписку? У собеседника она останется.')) { closeAll(null); return; }
            socketAsk('dm-delete', { convId: del.dataset.del }, (res) => {
                if (!res || !res.ok) { showToast((res && res.message) || 'Не удалось удалить'); return; }
                const r = del.closest('.swipe-row'); if (r) r.remove();
                showToast('Диалог удалён');
                renderDialogs();
            });
            return;
        }
        // после свайпа или при открытой кнопке клик по строке не открывает диалог
        const r = ev.target.closest('.swipe-row');
        if (moved || (r && r.classList.contains('open'))) {
            ev.stopPropagation(); ev.preventDefault();
            moved = false;
            if (r && r.classList.contains('open') && state !== 1) closeAll(null);
        }
    }, true);
})();

// ============================================
// ОТВЕТ, РЕАКЦИИ, МЕНЮ СООБЩЕНИЯ
// ============================================
let replyDraft = null;

function clearReply() {
    replyDraft = null;
    const bar = document.getElementById('replyBar');
    if (bar) bar.remove();
}

function setReply(draft) {
    replyDraft = draft;
    const wrap = document.querySelector('#group-screen .chat-input-wrapper');
    if (!wrap) return;
    let bar = document.getElementById('replyBar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'replyBar';
        bar.className = 'reply-bar';
        wrap.parentNode.insertBefore(bar, wrap);
    }
    bar.innerHTML = `<i class="fas fa-reply"></i><div class="reply-bar-text"><b>${escapeHtml(draft.user)}</b><span>${escapeHtml(draft.text)}</span></div><button type="button" aria-label="Отменить ответ"><i class="fas fa-xmark"></i></button>`;
    bar.querySelector('button').addEventListener('click', clearReply);
    const inp = document.getElementById('chatInput');
    if (inp) inp.focus();
}

function paintAdChips(adId) {
    const st = adState[adId] || { counts: {}, mine: [] };
    const holder = document.querySelector(`.chat-reactions[data-for="${CSS.escape('ad_' + adId)}"]`);
    if (holder) holder.innerHTML = renderReactionChips({ id: 'ad_' + adId, reactions: st.counts, mine: st.mine });
}

function toggleReaction(id, emoji) {
    id = String(id);
    if (serverProtocol < 2) { showToast('Реакции заработают после обновления сервера'); return; }
    if (!socket || !socket.connected) { showToast('Сервер недоступен'); return; }

    if (id.startsWith('ad_')) {                       // реакция на объявление
        const adId = id.slice(3);
        socketAsk('ad-react', { adId, emoji, user: getUserName() }, (res) => {
            if (!res.ok) { showToast(res.message || 'Не получилось'); return; }
            adState[adId] = { counts: res.reactions || {}, mine: res.mine || [] };
            paintAdChips(adId);
        });
    } else if (currentDm) {                           // реакция в личном чате
        const convId = currentDm.convId;
        socketAsk('dm-react', { convId, id, emoji }, (res) => {
            if (!res.ok) { showToast(res.message || 'Не получилось'); return; }
            paintDmReactions(id, res.reactions || {}, res.mine || []);
        });
    } else if (currentGroup) {                        // реакция в группе
        socketAsk('group-react', { groupId: currentGroup.id, id, emoji }, (res) => {
            if (!res.ok) { showToast(res.message || 'Не получилось'); return; }
            const m = currentGroup && currentGroup.messages.find(x => x.id === id);
            if (m) { m.reactions = res.reactions || {}; m.mine = res.mine || []; }
            const holder = document.querySelector(`.chat-reactions[data-for="${CSS.escape(id)}"]`);
            if (holder && m) holder.innerHTML = renderReactionChips(m);
        });
    } else if (currentRoom) {                         // реакция в общем чате
        socketAsk('react', { room: currentRoom, id, emoji, user: getUserName() }, (res) => {
            if (!res.ok) { showToast(res.message || 'Не получилось'); return; }
            myReacts[id] = res.mine || [];
            applyReactions(id, res.reactions || {});
        });
    }
}

function fetchAdReactions() {
    const ids = [...document.querySelectorAll('.chat-message-ad[data-ad-id]')].map(el => el.dataset.adId);
    if (!ids.length || serverProtocol < 2) return;
    socketAsk('ad-reactions', { ids, user: getUserName() }, (res) => {
        if (!res.ok) return;
        Object.keys(res.ads || {}).forEach(id => { adState[id] = res.ads[id]; paintAdChips(id); });
    });
}

// обработка событий в реальном времени
function onSocialEvent(ev, d) {
    if (!d) return;
    if (ev === 'listing-changed') {
        clearTimeout(onSocialEvent._t);
        onSocialEvent._t = setTimeout(fetchRemoteAds, 400);
    } else if (ev === 'ad-reaction-update') {
        const st = adState[d.adId] || { counts: {}, mine: [] };
        st.counts = d.reactions || {};
        adState[d.adId] = st;
        paintAdChips(d.adId);
    } else if (ev === 'group-message') {
        if (currentGroup && currentGroup.id === d.groupId) {
            if (!currentGroup.messages.some(m => m.id === d.id)) {
                currentGroup.messages.push(d);
                const box = document.getElementById('chatMessages');
                if (box) { box.insertAdjacentHTML('beforeend', renderGroupMessage(d)); scrollChatToBottomSmooth(); }
            }
        } else {
            const dlg = document.getElementById('dialogsRoot');
            if (dlg && dlg.offsetParent !== null) renderDialogs();
        }
    } else if (ev === 'group-reaction') {
        if (currentGroup && currentGroup.id === d.groupId) {
            const m = currentGroup.messages.find(x => x.id === d.id);
            if (m) {
                m.reactions = d.reactions || {};
                const holder = document.querySelector(`.chat-reactions[data-for="${CSS.escape(String(d.id))}"]`);
                if (holder) holder.innerHTML = renderReactionChips(m);
            }
        }
    } else if (ev === 'group-members') {
        if (currentGroup && currentGroup.id === d.groupId) {
            refreshCurrentGroup();
            if (d.added) showToast(d.added.name + ' теперь в группе');
            if (d.left) showToast(d.left.name + ' вышел(а) из группы');
        }
    } else if (ev === 'group-invited') {
        showToast((d.by || 'Друг') + ' добавил(а) вас в группу «' + d.name + '»');
        refreshGroupsCache();
        const dlg = document.getElementById('dialogsRoot');
        if (dlg && dlg.offsetParent !== null) renderDialogs();
    }
}

// ---------- меню по удержанию ----------
let gestureTimer = null;

function closeMsgMenu() {
    const m = document.getElementById('msgMenu');
    if (m) m.remove();
    document.querySelectorAll('.chat-message.pressed, .chat-message.pressed-ad').forEach(el => el.classList.remove('pressed', 'pressed-ad'));
}

// что за сообщение удержали
function resolveTarget(msgEl) {
    const id = msgEl.dataset.id;
    if (!id) return null;
    if (id.startsWith('ad_')) {
        const adId = msgEl.dataset.adId || id.slice(3);
        const ad = findAd(adId);
        if (!ad) return null;
        return { kind: 'ad', id, adId, mine: !!ad.mine, text: '', reply: { id, user: 'Объявление', text: ad.title, adId: String(ad.id), adTitle: ad.title } };
    }
    if (currentDm) {
        const m = (window.dmMsgs || {})[id];
        if (!m) return null;
        const who = (m.from && m.from.name) || '';
        return { kind: 'dm', id, text: m.text || '', reply: { id, user: who, text: m.text ? m.text.slice(0, 100) : (m.video ? 'Видеосообщение' : (m.voice ? 'Голосовое сообщение' : '📷 Фото')) } };
    }
    if (currentGroup) {
        const m = currentGroup.messages.find(x => x.id === id);
        if (!m) return null;
        return { kind: 'group', id, text: m.text, reply: { id, user: (m.from && m.from.name) || '', text: m.text ? m.text.slice(0, 100) : (m.req ? '🔎 Запрос: ' + (m.req.city || 'жильё') : m.ad ? '🏠 ' + m.ad.title : '') } };
    }
    const m = ((currentRoom && messagesCache[currentRoom]) || []).find(x => x.id === id);
    if (!m) return null;
    return { kind: 'room', id, text: m.text, reply: { id, user: m.user, text: m.text ? m.text.slice(0, 100) : '📷 Фото' } };
}

// короткий «щелчок»: вибрация там, где она есть (Android), и переключатель-хаптик на iOS 18+
function haptic(ms) {
    if (navigator.vibrate) { try { navigator.vibrate(ms || 12); return; } catch (e) {} }
    try {
        let l = document.getElementById('hapticSwitch');
        if (!l) {
            l = document.createElement('label');
            l.id = 'hapticSwitch'; l.setAttribute('aria-hidden', 'true');
            l.style.cssText = 'position:fixed;left:-99px;top:-99px;opacity:0;pointer-events:none';
            const i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', '');
            l.appendChild(i); document.body.appendChild(l);
        }
        l.click();
    } catch (e) {}
}

function openMsgMenu(msgEl) {
    const t = resolveTarget(msgEl);
    if (!t) return;
    closeMsgMenu();
    haptic(12);

    // сообщение «приподнимается»: поверх затемнения рисуем его копию с подсветкой
    const bub = msgEl.querySelector('.chat-bubble');
    const lift = bub && t.kind !== 'ad';
    msgEl.classList.add(lift ? 'pressed' : 'pressed-ad');

    const menu = document.createElement('div');
    menu.id = 'msgMenu';
    menu.className = 'msg-menu-overlay';
    menu.innerHTML = `<div class="msg-menu" role="menu">
        <div class="msg-menu-emojis">${['👍', '❤️', '😂', '😮', '😢', '🔥'].map(e => `<button type="button" data-emoji="${e}">${e}</button>`).join('')}</div>
        <button type="button" class="msg-menu-item" data-act="reply"><i class="fas fa-reply"></i> Ответить</button>
        ${t.kind === 'ad' ? '<button type="button" class="msg-menu-item" data-act="group"><i class="fas fa-user-group"></i> Добавить в мою группу</button>' : ''}
        ${t.text ? '<button type="button" class="msg-menu-item" data-act="copy"><i class="fas fa-copy"></i> Копировать</button>' : ''}
        ${t.kind === 'ad' && t.mine ? '<button type="button" class="msg-menu-item danger" data-act="delete"><i class="fas fa-trash"></i> Удалить объявление</button>' : ''}
    </div>`;
    document.body.appendChild(menu);

    const panel = menu.querySelector('.msg-menu');
    const rect = (bub || msgEl).getBoundingClientRect();
    if (lift) {
        const clone = bub.cloneNode(true);
        clone.querySelectorAll('audio,video').forEach(n => n.remove());
        clone.classList.add('lift-clone');
        if (msgEl.classList.contains('chat-message-mine')) clone.classList.add('lift-mine');
        clone.style.cssText += `;position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;max-width:none;margin:0;z-index:2;`;
        menu.insertBefore(clone, panel);
    }
    const ph = panel.offsetHeight, pw = panel.offsetWidth, gap = 12;
    let top = lift ? rect.bottom + gap : rect.top - ph - 8;
    if (lift && top + ph > window.innerHeight - 8) top = rect.top - ph - gap;      // снизу не помещается — над сообщением
    if (top < 8) top = Math.min(Math.max(8, rect.top + 8), window.innerHeight - ph - 8);
    const mine = msgEl.classList.contains('chat-message-mine');
    const left = Math.min(Math.max(8, mine ? rect.right - pw : rect.left), window.innerWidth - pw - 8);
    panel.style.top = top + 'px';
    panel.style.left = left + 'px';

    const openedAt = Date.now();
    menu.addEventListener('click', (ev) => {
        if (Date.now() - openedAt < 400) return;     // «хвост» того же тапа, который открыл меню
        if (ev.target.closest('.msg-menu') === null && ev.target.closest('.lift-clone')) return;   // по самому сообщению — не закрываем
        const emojiBtn = ev.target.closest('[data-emoji]');
        const act = ev.target.closest('[data-act]');
        if (emojiBtn) { haptic(8); toggleReaction(t.id, emojiBtn.dataset.emoji); }
        else if (act && act.dataset.act === 'reply') setReply(t.reply);
        else if (act && act.dataset.act === 'group') addAdToGroup(t.adId);
        else if (act && act.dataset.act === 'delete') {
            closeMsgMenu();
            deleteMyAd(t.adId);   // спросит подтверждение, удалит у всех
            return;
        }
        else if (act && act.dataset.act === 'copy') {
            const done = () => showToast('Скопировано');
            const fallback = () => {
                try {
                    const ta = document.createElement('textarea');
                    ta.value = t.text; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
                    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done();
                } catch (e) { showToast('Не удалось скопировать'); }
            };
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.text).then(done, fallback); else fallback();
        }
        closeMsgMenu();
    });
}

function attachChatGestures() {
    const box = document.getElementById('chatMessages');
    if (!box || box.dataset.gestures) return;
    box.dataset.gestures = '1';
    let startX = 0, startY = 0, held = false, swiped = false, tapEl = null, tapT = 0;
    let swipeEl = null, swipeDx = 0, swipeState = 0;   // 0 — не определено, 1 — свайп, -1 — это прокрутка
    const SWIPE_MAX = 84, SWIPE_TRIGGER = 56;
    const cancel = () => { if (gestureTimer) { clearTimeout(gestureTimer); gestureTimer = null; } };
    const swipeHint = (el) => {
        let h = el.querySelector(':scope > .swipe-hint');
        if (!h) { h = document.createElement('div'); h.className = 'swipe-hint'; el.appendChild(h); }
        return h;
    };
    const resetSwipe = (animate) => {
        if (!swipeEl) return;
        const el = swipeEl; swipeEl = null;
        el.style.transition = animate ? 'transform .18s ease-out' : '';
        el.style.transform = '';
        const h = el.querySelector(':scope > .swipe-hint');
        if (h) h.remove();
        setTimeout(() => { el.style.transition = ''; }, 220);
    };

    box.addEventListener('pointerdown', (ev) => {
        if (ev.button > 0) return;
        held = false; swiped = false; swipeState = 0; swipeDx = 0; tapEl = null;
        resetSwipe(false);
        if (ev.target.closest('.react-chip, .reply-quote, .ad-slides')) return;   // по фото листаем, а не отвечаем
        const msgEl = ev.target.closest('.chat-message[data-id]');
        if (!msgEl || !ev.target.closest('.chat-bubble')) return;
        startX = ev.clientX; startY = ev.clientY;
        swipeEl = msgEl;
        // обычный тап по тексту/подписи открывает меню; по фото, ссылкам, голосовым и карточкам объявлений — свои действия
        if (!msgEl.dataset.id.startsWith('ad_') && !ev.target.closest('a,button,audio,video,img,.vm,.group-ad,.ad-slides')) { tapEl = msgEl; tapT = Date.now(); }
        cancel();
        gestureTimer = setTimeout(() => { held = true; gestureTimer = null; swipeState = -1; resetSwipe(false); openMsgMenu(msgEl); }, 450);
    });
    box.addEventListener('pointermove', (ev) => {
        if (!swipeEl) return;
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        if (tapEl && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) tapEl = null;
        if (swipeState === 0) {
            if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { swipeState = -1; cancel(); resetSwipe(false); return; }
            if (dx < -12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                swipeState = 1; cancel();
                try { box.setPointerCapture(ev.pointerId); } catch (e) {}
            } else if (Math.abs(dx) > 10 || Math.abs(dy) > 10) { cancel(); return; }
            else return;
        }
        if (swipeState !== 1) return;
        swipeDx = Math.max(-SWIPE_MAX, Math.min(0, dx));
        swipeEl.style.transform = `translateX(${swipeDx}px)`;
        const h = swipeHint(swipeEl);
        const isAd = swipeEl.dataset.id.startsWith('ad_');
        h.innerHTML = isAd ? '<i class="fas fa-user-group"></i>' : '<i class="fas fa-reply"></i>';
        h.classList.toggle('ready', swipeDx <= -SWIPE_TRIGGER);
    });
    const finish = (ev) => {
        cancel();
        if (ev.type === 'pointerup' && tapEl && swipeState === 0 && !held && Date.now() - tapT < 450) {
            const el = tapEl; tapEl = null; held = true;     // held гасит следующий click
            resetSwipe(false);
            openMsgMenu(el);
            return;
        }
        tapEl = null;
        if (swipeState === 1 && swipeEl) {
            swiped = true;
            const el = swipeEl;
            const fire = swipeDx <= -SWIPE_TRIGGER;
            resetSwipe(true);
            if (fire && ev.type === 'pointerup') {
                const t = resolveTarget(el);
                if (t) {
                    haptic(10);
                    if (t.kind === 'ad') ensureLogin(() => addAdToGroup(t.adId));
                    else setReply(t.reply);
                }
            }
            return;
        }
        resetSwipe(false);
    };
    ['pointerup', 'pointercancel'].forEach(t => box.addEventListener(t, finish));
    box.addEventListener('pointerleave', cancel);
    box.addEventListener('contextmenu', (ev) => {
        const msgEl = ev.target.closest('.chat-message[data-id]');
        if (msgEl && ev.target.closest('.chat-bubble')) { ev.preventDefault(); cancel(); held = true; openMsgMenu(msgEl); }
    });

    // Клики ловим в фазе перехвата: так удержание/свайп/реакция не открывают объявление
    box.addEventListener('click', (ev) => {
        if (held || swiped) { held = false; swiped = false; ev.stopPropagation(); ev.preventDefault(); return; }
        const chip = ev.target.closest('.react-chip');
        if (chip) {
            ev.stopPropagation(); ev.preventDefault();
            const msgEl = chip.closest('.chat-message[data-id]');
            if (msgEl) toggleReaction(msgEl.dataset.id, chip.dataset.emoji);
            return;
        }
        const q = ev.target.closest('.reply-quote[data-reply]');
        if (q) {
            ev.stopPropagation(); ev.preventDefault();
            const target = box.querySelector(`.chat-message[data-id="${CSS.escape(q.dataset.reply)}"]`);
            if (target) { target.scrollIntoView({ block: 'center', behavior: 'smooth' }); target.classList.add('flash'); setTimeout(() => target.classList.remove('flash'), 1200); }
            return;
        }
        const gr = ev.target.closest('.group-req [data-greq]');
        if (gr) {
            ev.stopPropagation(); ev.preventDefault();
            const mid = gr.closest('.chat-message') && gr.closest('.chat-message').dataset.id;
            const gm = currentGroup && currentGroup.messages.find(x => x.id === mid);
            if (gm && gm.req) openOfferSheet({ ...gm.req });
            return;
        }
        const ga = ev.target.closest('.group-ad[data-ad]');
        if (ga) {
            ev.stopPropagation(); ev.preventDefault();
            if (findAd(ga.dataset.ad)) openListing(ga.dataset.ad); else showToast('Это объявление недоступно на вашем устройстве');
        }
    }, true);
}

// Подключаем жесты и реакции на объявления при открытии общего чата
(function patchChatOpen() {
    const origOpen = openChatRoom;
    openChatRoom = function (roomId) {
        currentDm = null; currentGroup = null;
        clearReply();
        closeMsgMenu();
        origOpen.apply(this, arguments);
        attachChatGestures();
        if (isHousingRoom(roomId)) {
            placeRemoteAds();
            whenSocketReady(fetchAdReactions, () => {});
        }
    };
    const origClose = closeGroup;
    closeGroup = function () {
        clearReply();
        closeMsgMenu();
        currentDm = null; currentGroup = null;
        origClose.apply(this, arguments);
    };
})();

document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeMsgMenu(); });

// ---------- ссылка-приглашение ?join=КОД ----------
function handleJoinLink() {
    let code = null;
    try { code = new URLSearchParams(location.search).get('join'); } catch (e) {}
    if (code) {
        try { localStorage.setItem('tell-pending-join', code); history.replaceState(null, '', location.pathname); } catch (e) {}
    }
    let pending = '';
    try { pending = localStorage.getItem('tell-pending-join') || ''; } catch (e) {}
    if (!/^[0-9a-f]{16}$/.test(pending)) return;
    const run = () => ensureLogin(() => whenSocketReady(() => socketAsk('group-join', { code: pending }, (res) => {
        try { localStorage.removeItem('tell-pending-join'); } catch (e) {}
        if (!res.ok) { showToast(res.message || 'Приглашение недействительно'); return; }
        showToast(res.already ? 'Вы уже в группе «' + res.group.name + '»' : 'Вы в группе «' + res.group.name + '»');
        openGroupById(res.group.id);
    })));
    setTimeout(run, 600);
}
handleJoinLink();


// ============================================
// ОБЪЯВЛЕНИЯ НА СЕРВЕРЕ (их видят все)
// ============================================
const isRemoteAdId = (id) => typeof id === 'string' && /^l_[0-9a-f]{16}$/.test(id);

function myAdsAll() {
    return [...remoteAds.filter(a => a.mine), ...getMyAds()];
}

function normalizeRemoteAd(a) {
    const acc = getAccount();
    a.mine = !!(acc && a.ownerId === acc.id);
    const d = new Date(a.updated || a.created || Date.now());   // поднятое объявление показывается со временем поднятия
    const today = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    a.time = p2(d.getHours()) + ':' + p2(d.getMinutes());
    a.date = d.toDateString() === today.toDateString() ? 'Сегодня' : p2(d.getDate()) + '.' + p2(d.getMonth() + 1);
    return a;
}

async function fetchRemoteAds() {
    try {
        const res = await fetch(`${SERVER_URL}/api/listings`);
        const data = await res.json();
        if (!data || !data.ok) return;
        const old = new Map(remoteAds.map(a => [a.id, a]));
        remoteAds = data.listings.map(l => {
            const prev = old.get(l.id);
            // если полная версия уже загружена и не менялась — не теряем её
            return normalizeRemoteAd(prev && !prev.partial && prev.updated === l.updated ? prev : l);
        });
        renderFeatured();
        refreshHousingAds();
        const prof = document.getElementById('profileRoot');
        if (prof && prof.offsetParent !== null) renderProfile();
    } catch (e) { /* сервер недоступен — остаются демо и локальные объявления */ }
}

async function fetchFullAd(id, cb) {
    try {
        const res = await fetch(`${SERVER_URL}/api/listings/${encodeURIComponent(id)}`);
        const data = await res.json();
        if (!data || !data.ok) throw new Error('no');
        const full = normalizeRemoteAd(data.listing);
        const i = remoteAds.findIndex(a => a.id === id);
        if (i >= 0) remoteAds[i] = full; else remoteAds.unshift(full);
        cb(true);
    } catch (e) {
        showToast('Не удалось загрузить объявление. Проверьте интернет.');
        cb(false);
    }
}

// Обновляем карточки объявлений в открытом чате «Жильё»
function refreshHousingAds() {
    const box = document.getElementById('chatMessages');
    if (!box || !isHousingRoom(currentRoom)) return;
    placeRemoteAds();
    refreshHousingChips();
    fetchAdReactions();
}

// Объявления с сервера стоят в ленте по времени публикации: новые — сверху
function placeRemoteAds() {
    const box = document.getElementById('chatMessages');
    if (!box || !isHousingRoom(currentRoom)) return;
    const nearTop = box.scrollTop < 160;
    box.querySelectorAll('.chat-message-ad[data-ad-id^="l_"]').forEach(el => el.remove());
    const sorted = adsForRoom(currentRoom)([...remoteAds]).sort((a, b) => (a.updated || a.created || 0) - (b.updated || b.created || 0));   // поднятые встают ниже, ближе к свежим
    let added = false;
    for (const ad of sorted) {
        const tpl = document.createElement('template');
        tpl.innerHTML = renderHousingMessage(ad).trim();
        const el = tpl.content.firstElementChild;
        if (!el) continue;
        const ts = Number(ad.updated || ad.created) || 0;
        box.appendChild(el);
        added = true;
    }
    if (typeof cardsNewestFirst === 'function') cardsNewestFirst(box);
    if (added && nearTop) box.scrollTop = 0;
}

// История перерисовывается после загрузки — возвращаем объявления на место
(function patchHistoryRender() {
    const orig = renderHistory;
    renderHistory = function () {
        orig.apply(this, arguments);
        if (isHousingRoom(currentRoom)) placeRemoteAds();
    };
})();

// ---------- сжатие фото для сервера ----------
function loadImage(src) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

async function shrinkDataURL(src, maxSide, quality) {
    const img = await loadImage(src);
    const k = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
}

async function fitPhoto(src, maxBytes) {
    if (typeof src !== 'string' || !src.startsWith('data:image/')) return null;
    for (const [side, q] of [[1000, 0.72], [900, 0.65], [800, 0.58], [700, 0.5], [600, 0.45]]) {
        const out = await shrinkDataURL(src, side, q);
        if (out.length * 0.75 <= maxBytes) return out;
    }
    return null;
}

// ---------- публикация ----------
async function publishAd(ad, remoteId, done) {
    ensureLogin(async () => {
        showToast('Публикую объявление...');
        try {
            const photos = [];
            for (const p of (ad.photos || []).slice(0, 6)) {
                const fit = await fitPhoto(p, 330000);
                if (fit) photos.push(fit);
            }
            if ((ad.photos || []).length && !photos.length) { showToast('Не удалось подготовить фото'); done(false); return; }
            const thumb = photos[0] ? await fitThumb(photos[0]) : '';
            const prof = getProfile();
            let avatar = prof.avatar || '';
            if (avatar.startsWith('avatars/')) avatar = await avatarToDataURL(avatar);
            if (avatar && avatar.length * 0.75 > 110000) avatar = await fitPhoto(avatar, 110000) || '';

            const body = { id: remoteId || undefined, ad: { ...ad, photos, thumb }, profile: { phone: prof.phone || '', about: prof.about || '', avatar } };
            delete body.ad.id; delete body.ad.mine;
            const res = await fetch(`${SERVER_URL}/api/listings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
                body: JSON.stringify(body)
            });
            let data = null;
            try { data = await res.json(); } catch (e) {}
            if (!res.ok || !data || !data.ok) {
                if (res.status === 401) { clearSession(); showToast('Сессия истекла. Войдите снова.'); }
                else showToast((data && data.message) || 'Не удалось опубликовать');
                done(false);
                return;
            }
            const saved = normalizeRemoteAd(data.listing);
            const i = remoteAds.findIndex(a => a.id === saved.id);
            if (i >= 0) remoteAds[i] = saved; else remoteAds.unshift(saved);
            refreshHousingAds();
            done(true, saved);
        } catch (e) {
            showToast('Нет связи с сервером. Попробуйте позже.');
            done(false);
        }
    });
}

async function fitThumb(src) {
    for (const [side, q] of [[480, 0.65], [400, 0.55], [320, 0.5]]) {
        const out = await shrinkDataURL(src, side, q);
        if (out.length * 0.75 <= 75000) return out;
    }
    return '';
}

async function deleteRemoteAd(id) {
    try {
        const res = await fetch(`${SERVER_URL}/api/listings/${encodeURIComponent(id)}`, {
            method: 'DELETE', headers: { Authorization: 'Bearer ' + getToken() }
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || !data.ok) { showToast((data && data.message) || 'Не удалось удалить'); return; }
        remoteAds = remoteAds.filter(a => a.id !== id);
        refreshHousingAds();
        renderProfile();
        renderFeatured();
        showToast('Объявление удалено');
    } catch (e) { showToast('Нет связи с сервером'); }
}

// Старые объявления, сохранённые только на этом устройстве, публикуем для всех
let migratingAds = false;
async function migrateLocalAds() {
    const acc = getAccount();
    if (migratingAds || !acc || !acc.verified) return;
    const local = getMyAds();
    if (!local.length) return;
    migratingAds = true;
    let moved = 0;
    for (const ad of local) {
        const ok = await new Promise(r => publishAd(ad, null, r));
        if (!ok) break;
        saveMyAds(getMyAds().filter(a => String(a.id) !== String(ad.id)));
        moved++;
    }
    migratingAds = false;
    if (moved) { showToast('Ваши объявления опубликованы для всех: ' + moved); renderProfile(); renderFeatured(); }
}

fetchRemoteAds();
