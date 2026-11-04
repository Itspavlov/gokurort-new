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
            body: JSON.stringify({ name, password })
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
        <div class="auth-error" id="authError"></div>
        <button class="primary-btn wide-btn" id="authSubmit"></button>
        <p class="auth-note">Аккаунт нужен для личных сообщений и чтобы никто не писал под вашим именем. Восстановления пароля пока нет — запомните его.</p>`;
    openSheet('Аккаунт Tell', body, (el) => {
        let m = mode;
        const submit = el.querySelector('#authSubmit');
        const err = el.querySelector('#authError');
        const paint = () => {
            el.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === m));
            submit.textContent = m === 'login' ? 'Войти' : 'Создать аккаунт';
            el.querySelector('#authPass').setAttribute('autocomplete', m === 'login' ? 'current-password' : 'new-password');
            err.textContent = '';
        };
        el.querySelectorAll('.auth-tab').forEach(t => t.addEventListener('click', () => { m = t.dataset.mode; paint(); }));
        paint();
        const go = async () => {
            const name = el.querySelector('#authName').value.trim();
            const pass = el.querySelector('#authPass').value;
            if (!name || !pass) { err.textContent = 'Введите имя и пароль'; return; }
            submit.disabled = true; submit.textContent = 'Подождите...';
            const r = await authRequest(m, name, pass);
            submit.disabled = false;
            if (!r || !r.ok) { err.textContent = (r && r.message) || 'Не получилось'; paint(); err.textContent = (r && r.message) || 'Не получилось'; return; }
            setSession(r.token, r.user);
            closeSheet();
            reconnectSocket();
            showToast(m === 'login' ? 'Вы вошли как ' + r.user.name : 'Аккаунт создан. Добро пожаловать, ' + r.user.name + '!');
            if (typeof renderProfile === 'function') renderProfile();
            if (typeof renderDialogs === 'function') renderDialogs();
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
    if (typeof renderProfile === 'function') renderProfile();
    if (typeof renderDialogs === 'function') renderDialogs();
}

function accountCardHTML() {
    const a = getAccount();
    if (a) {
        return `<div class="account-card">
            <div class="account-line"><i class="fas fa-circle-check"></i><span>Вы вошли как <b>${escapeHtml(a.name)}</b></span></div>
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
    }
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
    return `<div class="chat-message" data-id="${id}"><div class="chat-avatar" style="background:${dmColor(nm)};">${escapeHtml(Array.from(nm)[0] || '?')}</div><div class="chat-bubble-wrap"><div class="chat-bubble-header"><span class="chat-user-name">${escapeHtml(nm)}</span><span class="chat-time">${time}</span></div><div class="chat-bubble"><div>${escapeHtml(m.text)}</div></div></div></div>`;
}

function openDmChat(conv, prefill, messages) {
    if (socket && currentRoom) socket.emit('leave-room', currentRoom);
    currentRoom = null;
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
                <div class="chat-welcome-text">${e(conv.adTitle ? conv.adTitle + ' · ' : '')}Видите только вы и ${e(conv.with)}.</div>
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
    const attempt = (retry) => socketAsk('dm-send', { convId, text, clientId }, (res) => {
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
    const me = getAccount();
    if (me && m.from && m.from.id !== me.id) showToast('Новое сообщение от ' + m.from.name);
    const dlg = document.getElementById('dialogsRoot');
    if (dlg && dlg.offsetParent !== null) renderDialogs();
}

// ---------- ВКЛАДКА «СООБЩЕНИЯ» ----------
function renderDialogs() {
    const root = document.getElementById('dialogsRoot');
    if (!root) return;

    if (!getAccount()) {
        root.innerHTML = `
            <div class="placeholder fade-in">
                <span class="placeholder-icon"><i class="fas fa-lock"></i></span>
                <h2 class="placeholder-title">Личные сообщения</h2>
                <p class="placeholder-text">Войдите в аккаунт, чтобы писать хозяевам лично. Эти диалоги видите только вы и собеседник.</p>
                <button class="primary-btn" onclick="openAuthSheet(null,'login')">Войти или зарегистрироваться</button>
            </div>`;
        return;
    }
    root.innerHTML = '<div class="placeholder fade-in"><p class="placeholder-text">Загружаю диалоги...</p></div>';
    whenSocketReady(() => {
        socketAsk('dm-list', undefined, (res) => {
            if (!res.ok) { root.innerHTML = `<div class="placeholder"><p class="placeholder-text">${escapeHtml(res.message || 'Не удалось загрузить')}</p></div>`; return; }
            if (!res.convs.length) {
                root.innerHTML = `
                    <div class="placeholder fade-in">
                        <span class="placeholder-icon"><i class="fas fa-inbox"></i></span>
                        <h2 class="placeholder-title">Пока пусто</h2>
                        <p class="placeholder-text">Откройте объявление в разделе «Жильё» и нажмите «Написать» — диалог появится здесь.</p>
                    </div>`;
                return;
            }
            root.innerHTML = `<div class="dialogs">${res.convs.map(c => `
                <div class="dialog-row" onclick="openDmById('${escapeHtml(c.id)}')">
                    <div class="chat-avatar dialog-avatar" style="background:${dmColor(c.with)}">${escapeHtml(Array.from(c.with || '?')[0] || '?')}</div>
                    <div class="dialog-info">
                        <div class="dialog-name">${escapeHtml(c.with)}</div>
                        <div class="dialog-ad">${escapeHtml(c.last ? (c.last.mine ? 'Вы: ' : '') + c.last.text : (c.adTitle || ''))}</div>
                    </div>
                    <div class="dialog-time">${c.last ? fmtAgo(c.last.time) : ''}</div>
                </div>`).join('')}</div>`;
        }, () => { root.innerHTML = '<div class="placeholder"><p class="placeholder-text">Сервер недоступен</p></div>'; });
    }, () => { root.innerHTML = '<div class="placeholder"><p class="placeholder-text">Сервер недоступен</p></div>'; });
}

// ---------- ОТВЕТ НА СООБЩЕНИЕ ----------
let replyDraft = null;

function clearReply() {
    replyDraft = null;
    const bar = document.getElementById('replyBar');
    if (bar) bar.remove();
}

function setReply(msg) {
    replyDraft = { id: msg.id, user: msg.user, text: msg.text ? msg.text.slice(0, 100) : '📷 Фото' };
    const wrap = document.querySelector('#group-screen .chat-input-wrapper');
    if (!wrap) return;
    let bar = document.getElementById('replyBar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'replyBar';
        bar.className = 'reply-bar';
        wrap.parentNode.insertBefore(bar, wrap);
    }
    bar.innerHTML = `<i class="fas fa-reply"></i><div class="reply-bar-text"><b>${escapeHtml(replyDraft.user)}</b><span>${escapeHtml(replyDraft.text)}</span></div><button type="button" aria-label="Отменить ответ"><i class="fas fa-xmark"></i></button>`;
    bar.querySelector('button').addEventListener('click', clearReply);
    const inp = document.getElementById('chatInput');
    if (inp) inp.focus();
}

// ---------- РЕАКЦИИ ----------
function toggleReaction(id, emoji) {
    if (!currentRoom) return;
    if (serverProtocol < 2) { showToast('Реакции заработают после обновления сервера'); return; }
    if (!socket || !socket.connected) { showToast('Сервер недоступен'); return; }
    socketAsk('react', { room: currentRoom, id, emoji, user: getUserName() }, (res) => {
        if (!res.ok) { showToast(res.message || 'Не получилось'); return; }
        myReacts[id] = res.mine || [];
        applyReactions(id, res.reactions || {});
    });
}

// ---------- ЖЕСТЫ: удержание = меню, нажатие на реакцию = переключить ----------
let gestureTimer = null;

function closeMsgMenu() {
    const m = document.getElementById('msgMenu');
    if (m) m.remove();
    document.querySelectorAll('.chat-message.pressed').forEach(el => el.classList.remove('pressed'));
}

function openMsgMenu(msgEl) {
    const id = msgEl.dataset.id;
    const list = (currentRoom && messagesCache[currentRoom]) || [];
    const msg = list.find(m => m.id === id);
    if (!msg) return;
    closeMsgMenu();
    msgEl.classList.add('pressed');
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }

    const menu = document.createElement('div');
    menu.id = 'msgMenu';
    menu.className = 'msg-menu-overlay';
    menu.innerHTML = `<div class="msg-menu" role="menu">
        <div class="msg-menu-emojis">${['👍', '❤️', '😂', '😮', '😢', '🔥'].map(e => `<button type="button" data-emoji="${e}">${e}</button>`).join('')}</div>
        <button type="button" class="msg-menu-item" data-act="reply"><i class="fas fa-reply"></i> Ответить</button>
        ${msg.text ? '<button type="button" class="msg-menu-item" data-act="copy"><i class="fas fa-copy"></i> Копировать</button>' : ''}
    </div>`;
    document.body.appendChild(menu);

    const panel = menu.querySelector('.msg-menu');
    const rect = (msgEl.querySelector('.chat-bubble') || msgEl).getBoundingClientRect();
    const ph = panel.offsetHeight, pw = panel.offsetWidth;
    let top = rect.top - ph - 8;
    if (top < 8) top = Math.min(rect.bottom + 8, window.innerHeight - ph - 8);
    let left = Math.min(Math.max(8, rect.left), window.innerWidth - pw - 8);
    panel.style.top = top + 'px';
    panel.style.left = left + 'px';

    menu.addEventListener('click', (ev) => {
        const emojiBtn = ev.target.closest('[data-emoji]');
        const act = ev.target.closest('[data-act]');
        if (emojiBtn) { toggleReaction(id, emojiBtn.dataset.emoji); }
        else if (act && act.dataset.act === 'reply') { setReply(msg); }
        else if (act && act.dataset.act === 'copy') {
            try { navigator.clipboard.writeText(msg.text); showToast('Скопировано'); } catch (e) { showToast('Не удалось скопировать'); }
        }
        closeMsgMenu();
    });
}

function attachChatGestures() {
    const box = document.getElementById('chatMessages');
    if (!box || box.dataset.gestures) return;
    box.dataset.gestures = '1';
    let startX = 0, startY = 0, held = false;

    const cancel = () => { if (gestureTimer) { clearTimeout(gestureTimer); gestureTimer = null; } };

    box.addEventListener('pointerdown', (ev) => {
        if (ev.button > 0) return;
        if (ev.target.closest('.react-chip')) return;
        const msgEl = ev.target.closest('.chat-message[data-id]');
        if (!msgEl || !ev.target.closest('.chat-bubble')) return;
        startX = ev.clientX; startY = ev.clientY; held = false;
        cancel();
        gestureTimer = setTimeout(() => { held = true; gestureTimer = null; openMsgMenu(msgEl); }, 450);
    });
    box.addEventListener('pointermove', (ev) => {
        if (gestureTimer && (Math.abs(ev.clientX - startX) > 10 || Math.abs(ev.clientY - startY) > 10)) cancel();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => box.addEventListener(t, cancel));
    box.addEventListener('scroll', cancel, { passive: true });
    // правый клик на компьютере — то же меню
    box.addEventListener('contextmenu', (ev) => {
        const msgEl = ev.target.closest('.chat-message[data-id]');
        if (msgEl && ev.target.closest('.chat-bubble')) { ev.preventDefault(); openMsgMenu(msgEl); }
    });
    box.addEventListener('click', (ev) => {
        if (held) { held = false; ev.preventDefault(); return; }
        const chip = ev.target.closest('.react-chip');
        if (chip) {
            const msgEl = chip.closest('.chat-message[data-id]');
            if (msgEl) toggleReaction(msgEl.dataset.id, chip.dataset.emoji);
            return;
        }
        const q = ev.target.closest('.reply-quote[data-reply]');
        if (q) {
            const target = box.querySelector(`.chat-message[data-id="${CSS.escape(q.dataset.reply)}"]`);
            if (target) { target.scrollIntoView({ block: 'center', behavior: 'smooth' }); target.classList.add('flash'); setTimeout(() => target.classList.remove('flash'), 1200); }
        }
    });
}

// Подключаем жесты каждый раз, когда открывается общий чат
(function patchChatOpen() {
    const origOpen = openChatRoom;
    openChatRoom = function () {
        currentDm = null;
        clearReply();
        closeMsgMenu();
        origOpen.apply(this, arguments);
        attachChatGestures();
    };
    const origClose = closeGroup;
    closeGroup = function () {
        clearReply();
        closeMsgMenu();
        currentDm = null;
        origClose.apply(this, arguments);
    };
})();

document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeMsgMenu(); });
