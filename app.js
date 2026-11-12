// ============================================
// TELL — логика приложения + связь с бэкендом
// ============================================

// ---------- НАСТРОЙКИ ----------
// Адрес сервера: на старом хостинге (Render) — прежний, на своём домене — тот же адрес, что у сайта.
// Для проверки можно задать window.TELL_SERVER_URL до загрузки app.js.
const SERVER_URL = window.TELL_SERVER_URL ||
    (/onrender\.com$/.test(location.hostname) || location.protocol === 'file:' || location.hostname === 'localhost'
        ? 'https://tell-server.onrender.com'
        : location.origin);
let socket = null;
let currentRoom = null;
// 2 — сервер умеет подтверждения (ack) и идентификаторы; 1 — старый сервер
let serverProtocol = 1;

// Разрешаем в <img> только настоящие картинки из data: или https
function safeImageSrc(src) {
    if (typeof src !== 'string') return '';
    if (/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+\/]+={0,2}$/.test(src)) return src;
    if (/^https:\/\/[^\s"'<>]+$/.test(src)) return src;
    return '';
}

// ---------- РЕАКЦИИ И ОТВЕТЫ (разметка) ----------
const REACTION_SET = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
const myReacts = {}; // id сообщения -> мои эмодзи

function isMyReaction(message, emoji) {
    return (Array.isArray(message.mine) && message.mine.includes(emoji)) ||
        (myReacts[message.id] && myReacts[message.id].includes(emoji));
}

function renderReactionChips(message) {
    const r = message.reactions || {};
    return REACTION_SET.filter(e => r[e] > 0).map(e =>
        `<button type="button" class="react-chip${isMyReaction(message, e) ? ' mine' : ''}" data-emoji="${e}">${e}<b>${Number(r[e])}</b></button>`
    ).join('');
}

function renderReplyHTML(message) {
    const r = message.reply;
    if (!r || !r.id) return '';
    return `<div class="reply-quote" data-reply="${escapeHtml(String(r.id))}"><b>${escapeHtml(r.user || '')}</b><span>${escapeHtml(r.text || '')}</span></div>`;
}

function applyReactions(id, reactions) {
    const list = (typeof currentGroup !== 'undefined' && currentGroup)
        ? currentGroup.messages
        : ((currentRoom && messagesCache[currentRoom]) || []);
    const msg = list.find(m => m.id === id);
    if (!msg) return;
    msg.reactions = reactions;
    const holder = document.querySelector(`.chat-reactions[data-for="${CSS.escape(String(id))}"]`);
    if (holder) holder.innerHTML = renderReactionChips(msg);
}

function newClientId() {
    const a = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return 'c' + Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}

// Отправка с подтверждением. Против старого сервера работает как раньше.
function emitMessage(payload, onDone) {
    if (!socket || !socket.connected) { showToast('Сервер недоступен. Проверьте интернет.'); return; }
    if (serverProtocol < 2) {
        socket.emit('send-message', payload);
        if (onDone) onDone(true);
        return;
    }
    const data = Object.assign({ clientId: newClientId() }, payload);
    let retried = false;
    const attempt = () => {
        let answered = false;
        const timer = setTimeout(() => {
            if (answered) return;
            answered = true;
            if (!retried) { retried = true; attempt(); } // тот же clientId — дубля не будет
            else { showToast('Не удалось отправить. Проверьте соединение.'); if (onDone) onDone(false); }
        }, 8000);
        socket.emit('send-message', data, (res) => {
            if (answered) return;
            answered = true; clearTimeout(timer);
            if (res && res.ok) { if (onDone) onDone(true); return; }
            if (res && res.code === 'NOT_IN_ROOM' && !retried) {
                retried = true;
                socket.emit('join-room', data.room, () => attempt());
                return;
            }
            showToast((res && res.message) || 'Не удалось отправить');
            if (onDone) onDone(false);
        });
    };
    attempt();
}

// Кэш сообщений по комнатам
const messagesCache = {
    housing: null,
    work: null,
    services: null,
    dating: null,
    trips: null
};

// ---------- ДАННЫЕ ПОЛЬЗОВАТЕЛЯ И ОБЪЯВЛЕНИЯ ----------
// Центр карты: Архипо-Осиповка. SEA_POINT — единая точка у моря: расстояние и маршрут от любого жилья считаются до неё.
const MAP_DEFAULT = [44.3625, 38.5265];
const SEA_POINT = [44.358556, 38.528949];
const BEACH_DEFAULT = SEA_POINT;

// Готовые аватарки: файлы avatars/av01.webp … av35.webp, на сервере хранится только id (av07)
const AVATAR_COUNT = 35;
const avatarIdOf = (n) => 'av' + String(n).padStart(2, '0');
const avatarUrl = (id) => /^av(0[1-9]|[12]\d|3[0-5])$/.test(id || '') ? 'avatars/' + id + '.webp' : '';
// В объявления аватарка уходит картинкой: готовую превращаем в маленькое изображение
function avatarToDataURL(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onerror = () => resolve('');
        img.onload = () => {
            try {
                const c = document.createElement('canvas'); c.width = c.height = 160;
                c.getContext('2d').drawImage(img, 0, 0, 160, 160);
                const o = c.toDataURL('image/webp', 0.8);
                resolve(o.startsWith('data:image/webp') ? o : c.toDataURL('image/png'));
            } catch (e) { resolve(''); }
        };
        img.src = src;
    });
}

function getProfile() {
    try {
        const p = JSON.parse(localStorage.getItem('tell-profile') || 'null');
        if (p) return p;
    } catch (e) {}
    return { name: getUserName(), phone: '', city: '', about: '', avatar: '' };
}

function saveProfile(p) {
    localStorage.setItem('tell-profile', JSON.stringify(p));
    if (p.name) localStorage.setItem('tell-username', p.name);
}

function getMyAds() {
    try { return JSON.parse(localStorage.getItem('tell-my-ads') || '[]'); } catch (e) { return []; }
}

function saveMyAds(list) {
    try {
        localStorage.setItem('tell-my-ads', JSON.stringify(list));
        return true;
    } catch (e) {
        showToast('Не хватило места для фото. Уберите часть фото.');
        return false;
    }
}

// Объявления с сервера (их видят все). Заполняется в social.js
let remoteAds = [];

function getAllAds() {
    const base = typeof HOUSING_ADS !== 'undefined' ? HOUSING_ADS : [];
    const all = [...remoteAds, ...getMyAds(), ...base];
    all.forEach(a => { if (a && Array.isArray(a.coords)) a.beach = SEA_POINT.slice(); });   // море у всех одно
    return all;
}

function findAd(id) {
    return getAllAds().find(a => String(a.id) === String(id));
}

// Хозяин объявления: для своих объявлений данные берутся из вашего профиля
function getOwner(ad) {
    if (!ad.mine) return ad.owner || {};
    const p = getProfile();
    return {
        id: 'me', name: p.name || getUserName(), phone: p.phone || '', color: '#FF7A59',
        since: ad.since, about: p.about || '', avatar: p.avatar || '', rating: null, reviews: 0, response: ''
    };
}

function adImg(ad, alt) {
    if (!ad.image) return '';
    return `<img src="${ad.image}" alt="${escapeHtml(alt || ad.title || '')}" loading="lazy" onerror="this.style.display='none'">`;
}

// ---------- ТЕМА ----------
const html = document.documentElement;
const metaTheme = document.querySelector('meta[name="theme-color"]');

// Темы: sea — «Морской вечер» (по умолчанию), sand — «Песок», sky — «Небо», dusk — «Закат».
// Старые «light» и «surf» (Прибой) переносятся на «Песок», «dark» — на «Морской вечер».
const THEMES = {
    sea:  { name: 'Вечер',  meta: '#060F1C', bg: '#060F1C', accent: '#FF9A5C' },
    sand: { name: 'Песок',  meta: '#FBF3E4', bg: '#FBF3E4', accent: '#F08A24' },
    sky:  { name: 'Небо',   meta: '#F0F8FF', bg: '#F0F8FF', accent: '#0C84C4' },
    dusk: { name: 'Закат',  meta: '#121216', bg: '#121216', accent: '#FF5E8A' }
};
const THEME_FONTS = {
    sand: 'family=Nunito:wght@500;600;700;800;900',
    sky: 'family=Nunito:wght@500;600;700;800;900',
    dusk: 'family=Space+Grotesk:wght@500;600;700'
};
const normTheme = (t) => (t === 'light' || t === 'surf') ? 'sand' : t === 'peak' ? 'sky' : (THEMES[t] ? t : 'sea');
function getTheme() { return normTheme(html.getAttribute('data-theme')); }
function loadThemeFont(theme) {
    const q = THEME_FONTS[theme]; if (!q || document.getElementById('font-' + theme)) return;
    const l = document.createElement('link'); l.id = 'font-' + theme; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?' + q + '&display=swap';
    document.head.appendChild(l);
}
function setTheme(theme) {
    theme = normTheme(theme);
    html.setAttribute('data-theme', theme === 'sea' ? 'dark' : theme);   // «dark» остаётся для основной, тёмной темы
    try { localStorage.setItem('tell-theme', theme); } catch (e) {}
    if (metaTheme) metaTheme.setAttribute('content', THEMES[theme].meta);
    loadThemeFont(theme);
    if (typeof window.syncTopTint === 'function') window.syncTopTint();
    document.querySelectorAll('.theme-grid button').forEach(b => b.classList.toggle('on', b.dataset.th === theme));
}
setTheme((function () { try { return localStorage.getItem('tell-theme'); } catch (e) { return null; } })() || 'sea');

// ---------- ИМЯ ПОЛЬЗОВАТЕЛЯ ----------
function getUserName() {
    if (typeof getAccount === 'function') { const acc = getAccount(); if (acc) return acc.name; }
    let name = localStorage.getItem('tell-username');
    if (!name) {
        name = 'Гость_' + Math.floor(Math.random() * 9000 + 1000);
        localStorage.setItem('tell-username', name);
    }
    return name;
}

// ---------- ПУЗЫРЬ В НИЖНЕЙ ПАНЕЛИ ----------
const navIndicator = document.querySelector('.nav-indicator');

function moveNavIndicator(animate = true) {
    const active = document.querySelector('.nav-item.active');
    if (!active || !navIndicator) return;

    if (!animate) navIndicator.style.transition = 'none';

    navIndicator.style.width = active.offsetWidth + 'px';
    navIndicator.style.transform = `translateX(${active.offsetLeft}px)`;

    if (animate) {
        navIndicator.classList.remove('moving');
        void navIndicator.offsetWidth;
        navIndicator.classList.add('moving');
    } else {
        void navIndicator.offsetWidth;
        navIndicator.style.transition = '';
    }
}

window.addEventListener('load', () => moveNavIndicator(false));
window.addEventListener('resize', () => moveNavIndicator(false));

// ---------- ПЕРЕКЛЮЧАТЕЛЬ ВКЛАДОК ----------
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

function switchTab(tabName, animate = true) {
    if (typeof closeTip === 'function') closeTip();
    if (typeof hideSeekTip === 'function') hideSeekTip();
    const groupScreen = document.getElementById('group-screen');
    if (groupScreen) groupScreen.style.display = 'none';

    tabContents.forEach(section => section.style.display = 'none');

    const target = document.getElementById('tab-' + tabName);
    if (target) {
        target.style.display = 'block';
        // плавное появление только при нажатии на вкладку; «Назад» показывает экран сразу
        target.classList.remove('fade-in');
        if (animate) { void target.offsetWidth; target.classList.add('fade-in'); }
    }

    navItems.forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tabName);
    });

    moveNavIndicator(animate);

    if (tabName !== 'mypubs') window._reqSecOverride = '';
    if (tabName === 'profile' && typeof renderProfile === 'function') renderProfile();
    if (tabName === 'mypubs' && typeof renderMyPubs === 'function') { renderMyPubs(); setTimeout(() => { if (document.getElementById('tab-mypubs').style.display !== 'none' && typeof markPubsSeen === 'function') markPubsSeen(); }, 1500); }
    if (tabName === 'messages' && typeof renderDialogs === 'function') renderDialogs();
    if (tabName === 'search') renderFeatured();

    window.scrollTo({ top: 0, behavior: animate ? 'smooth' : 'instant' });
}

navItems.forEach(item => {
    item.addEventListener('click', () => switchTab(item.dataset.tab));
});

switchTab('search', false);

// ---------- SOCKET.IO (с кэшированием подключения) ----------
function connectSocket() {
    if (socket) {
        if (!socket.connected) {
            socket.connect();
        }
        return;
    }

    socket = io(SERVER_URL, {
        // токен читается при каждом (пере)подключении
        auth: (cb) => cb({ token: (typeof getToken === 'function' ? getToken() : '') }),
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000
    });

    socket.on('server-hello', (info) => {
        serverProtocol = (info && info.protocol) || 1;
        if (typeof handleServerHello === 'function') handleServerHello(info);
    });

    socket.on('dm-message', (m) => { if (typeof onDmMessage === 'function') onDmMessage(m); });
    socket.on('dviz-changed', (d) => { if (typeof onDvizChanged === 'function') onDvizChanged(d); });
    socket.on('dm-reaction', (d) => { if (typeof onDmReaction === 'function') onDmReaction(d); });
    socket.on('dm-read', (d) => { if (typeof onDmRead === 'function') onDmRead(d); });
    socket.on('notify', (p) => { if (typeof onNotify === 'function') onNotify(p); });

    ['group-message', 'group-reaction', 'group-members', 'group-invited', 'ad-reaction-update', 'listing-changed', 'request-changed'].forEach((ev) => {
        socket.on(ev, (d) => { if (typeof onSocialEvent === 'function') onSocialEvent(ev, d); });
    });

    socket.on('reaction-update', (d) => {
        if (d && d.room === currentRoom) applyReactions(d.id, d.reactions || {});
    });

    socket.on('send-error', (e) => {
        showToast((e && e.message) || 'Не удалось отправить');
    });

    socket.on('connect', () => {
        serverProtocol = 1; // уточнится после server-hello
        console.log('🟢 Подключено к серверу:', socket.id);
        setChatStatus('онлайн');
        if (currentRoom) socket.emit('join-room', currentRoom);
    });

    socket.on('disconnect', () => {
        console.log('🔴 Отключено от сервера');
        setChatStatus('отключено');
    });

    socket.on('connect_error', (err) => {
        console.error('Ошибка подключения:', err);
        setChatStatus('ошибка подключения');
    });

    socket.on('new-message', (message) => {
        if (!message || typeof message !== 'object') return;
        // сообщение из другой комнаты не показываем
        if (message.room && message.room !== currentRoom) return;
        if (document.querySelector('#chatMessages.cards')) return;   // в разделах нет переписки
        // защита от дублей (повторная доставка после переподключения)
        const cached = currentRoom && messagesCache[currentRoom];
        if (message.id && cached && cached.some(m => m.id === message.id)) return;
        addMessageToChat(message);
    });

    // имя сменили на другом устройстве: подхватываем без перезахода
    socket.on('account-renamed', (d) => {
        const acc = typeof getAccount === 'function' ? getAccount() : null;
        if (!acc || !d || d.id !== acc.id || typeof d.name !== 'string') return;
        try { localStorage.setItem('tell-account', JSON.stringify({ ...acc, name: d.name })); localStorage.setItem('tell-username', d.name); } catch (e) {}
        if (typeof renderProfile === 'function') renderProfile();
    });

    socket.on('room-history', (history) => {
        console.log('📜 История (socket):', history.length);
        history.forEach(m => { if (m && m.id && Array.isArray(m.mine)) myReacts[m.id] = m.mine; });

        if (currentRoom) {
            messagesCache[currentRoom] = history;
        }

        renderHistory(history);
    });

    // модератор удалил сообщение — убираем его у всех сразу
    socket.on('message-deleted', (d) => {
        if (!d || typeof d.id !== 'string') return;
        if (messagesCache[d.room]) messagesCache[d.room] = messagesCache[d.room].filter(m => m.id !== d.id);
        if (d.room !== currentRoom) return;
        const box = document.getElementById('chatMessages');
        if (!box) return;
        box.querySelectorAll('.chat-message[data-id]').forEach(el => { if (el.dataset.id === d.id) el.remove(); });
    });

    socket.on('room-cleared', () => {
        if (currentRoom) {
            messagesCache[currentRoom] = [];
        }

        const messagesContainer = document.getElementById('chatMessages');
        if (!messagesContainer) return;

        messagesContainer.querySelectorAll('.chat-message').forEach(el => {
            if (el.querySelector('.chat-ad-image')) return;
            el.remove();
        });

        const divider = document.getElementById('history-divider');
        if (divider) divider.remove();
    });
}

// ---------- СКРОЛЛ ВНИЗ ----------
// Статус соединения. В чатах комнат заголовка нет, поэтому показываем его только когда связи нет.
function setChatStatus(text) {
    const el = document.getElementById('chatStatus');
    if (el) el.textContent = text;
    const head = document.querySelector('#group-screen .room-head');
    if (head) head.classList.toggle('offline', text !== 'онлайн');
}

function scrollChatToBottom() {
    const messages = document.getElementById('chatMessages');
    if (!messages) return;

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            messages.scrollTop = messages.scrollHeight;
        });
    });
}

let scrollRaf = 0;
function scrollChatToBottomSmooth() {
    // Одно прокручивание за кадр. Если сообщения идут подряд — прыгаем сразу:
    // «плавная» прокрутка, которую перезапускают каждые 200 мс, как раз и даёт подвисание.
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        const messages = document.getElementById('chatMessages');
        if (!messages) return;
        const gap = messages.scrollHeight - messages.scrollTop - messages.clientHeight;
        messages.scrollTo({ top: messages.scrollHeight, behavior: gap < 160 ? 'smooth' : 'auto' });
    });
}

// ---------- ОТРИСОВКА ИСТОРИИ ----------
function renderHistory(history) {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) return;
    if (messagesContainer.classList.contains('cards')) return;      // в разделах нет переписки: только карточки

    const userName = getUserName();

    // Удаляем только сообщения из истории
    const oldHistoryMessages = messagesContainer.querySelectorAll('.chat-message[data-from-history="true"]');
    oldHistoryMessages.forEach(el => el.remove());

    const oldDivider = document.getElementById('history-divider');
    if (oldDivider) oldDivider.remove();

    if (!history || history.length === 0) {
        setTimeout(() => scrollChatToBottom(), 100);
        return;
    }

    // Разделитель
    const divider = document.createElement('div');
    divider.id = 'history-divider';
    divider.className = 'chat-history-divider';
    divider.innerHTML = '<span>История сообщений</span>';
    messagesContainer.appendChild(divider);

    // Рисуем сообщения
    history.forEach(message => {
        const messageHtml = renderMessageHTML(message, userName);
        messagesContainer.insertAdjacentHTML('beforeend', messageHtml);
    });

    // Помечаем как "из истории"
    messagesContainer.querySelectorAll('.chat-message:not([data-from-history])').forEach(el => {
        if (el.querySelector('.chat-ad-image')) return;
        el.setAttribute('data-from-history', 'true');
    });

    // Скролл вниз — с задержкой, чтобы всё отрисовалось
    setTimeout(() => scrollChatToBottom(), 100);
}

// ---------- HTML ОДНОГО СООБЩЕНИЯ ----------
function renderMessageHTML(message, userName) {
    const isMine = message.user === userName;

    const imageBlock = safeImageSrc(message.image)
        ? `<div class="chat-bubble-image"><img src="${safeImageSrc(message.image)}" alt="Фото" loading="lazy"></div>`
        : '';

    const textBlock = message.text
        ? `<div>${escapeHtml(message.text)}</div>`
        : '';
    const idAttr = message.id ? ` data-id="${escapeHtml(String(message.id))}"` : '';
    const tsAttr = Number(message.time) ? ` data-ts="${Number(message.time)}"` : '';
    const replyBlock = renderReplyHTML(message);
    const reactBlock = message.id
        ? `<div class="chat-reactions" data-for="${escapeHtml(String(message.id))}">${renderReactionChips(message)}</div>`
        : '';

    if (isMine) {
        return `
            <div class="chat-message chat-message-mine"${idAttr}${tsAttr}>
                <div class="chat-bubble-wrap">
                    <div class="chat-bubble chat-bubble-mine">
                        ${replyBlock}
                        ${imageBlock}
                        ${textBlock}
                    </div>
                    ${reactBlock}
                    <div class="chat-time-mine">${formatTime(message.time)}</div>
                </div>
            </div>
        `;
    } else {
        const colors = ['#E8643F', '#12A8A8', '#D98A1E', '#7C5CFF', '#3E7BFF', '#C2417A'];
        const color = colors[Math.abs(hashCode(message.user)) % colors.length];

        return `
            <div class="chat-message"${idAttr}${tsAttr}>
                <div class="chat-avatar" data-avn="${avEsc(message.user || '?')}" style="background: ${color};">${avInner(message.user || '?')}</div>
                <div class="chat-bubble-wrap">
                    <div class="chat-bubble-header">
                        <span class="chat-user-name">${escapeHtml(message.user)}</span>
                        <span class="chat-time">${formatTime(message.time)}</span>
                    </div>
                    <div class="chat-bubble">
                        ${replyBlock}
                        ${imageBlock}
                        ${textBlock}
                    </div>
                    ${reactBlock}
                </div>
            </div>
        `;
    }
}

// ---------- ОТКРЫТИЕ ГРУППЫ ----------
function openGroup(groupId, opts) {
    // чаты жилья: общий и по типам (квартиры, дома, отели, комнаты, гостевые)
    if (isHousingRoom(groupId)) {
        const cat = housingCatByRoom(groupId);
        const local = getAllAds().filter(a => !(typeof isRemoteAdId === 'function' && isRemoteAdId(a.id)));
        const all = cat.id === 'all';
        openChatRoom(groupId, all ? 'Жильё' : 'Жильё · ' + cat.label, 'fas ' + (all ? 'fa-home' : cat.icon), adsForRoom(groupId)(local), Object.assign({
            noAttach: true, chips: true, cards: true,
            welcomeTitle: all ? 'Жильё у моря' : 'Раздел «' + cat.label + '»',
            welcomeText: (all ? 'Здесь все типы жилья. Чтобы увидеть только квартиры, дома или отели, выберите тип сверху. ' : 'Здесь только жильё этого типа. ') + 'Переписки в разделе нет: нажмите «Хочу снять», если ищете, или «Сдать жильё», чтобы разместить своё. Договариваться можно в личных сообщениях.'
        }, opts || {}));
        return;
    }
    const rooms = {
        work: { name: 'Работа', icon: 'fas fa-briefcase', ads: [] },
        services: { name: 'Развлечения', icon: 'fas fa-ship', ads: [] },
        trips: { name: 'Поездки', icon: 'fas fa-car', ads: [] },
        dating: { name: 'Курортный движ', icon: 'fas fa-champagne-glasses', ads: [] },
        online: { name: 'Чат онлайн', icon: 'fas fa-globe', ads: [] }
    };

    const room = rooms[groupId];
    if (!room) return;

    openChatRoom(groupId, room.name, room.icon, room.ads, Object.assign({
        noAttach: !!room.noAttach, hint: !!room.hint, cards: groupId !== 'dating' && groupId !== 'online',
        welcomeTitle: groupId === 'online' ? 'Чат онлайн' : undefined,
        welcomeText: groupId === 'online'
            ? 'Общий чат всех курортов: телепортируйтесь к людям из других мест и общайтесь со всеми. Не публикуйте телефон и адрес, а о подозрительных людях сообщайте через жалобу.'
            : groupId === 'dating'
            ? 'Раздел для тех, кому 18+. Здесь можно знакомиться и общаться. Не публикуйте телефон и адрес, а о подозрительных людях сообщайте через жалобу на сообщение.'
            : 'Переписки в разделе нет: нажмите кнопку «Ищу» или «Предлагаю» внизу и добавьте карточку. Договариваться можно в личных сообщениях.'
    }, opts || {}));
}

// ---------- ОТКРЫТИЕ ЧАТА ----------
function openChatRoom(roomId, roomName, roomIcon, ads, opts = {}) {
    if (socket && currentRoom && currentRoom !== roomId) socket.emit('leave-room', currentRoom);

    tabContents.forEach(section => { if (section.id === 'tab-search' && section.style.display !== 'none') return; section.style.display = 'none'; });   // главная остаётся под экраном чата: «Назад» не пересобирает её заново

    const welcomeTitle = opts.welcomeTitle || (opts.cards ? `Раздел «${roomName}»` : `Добро пожаловать в чат «${roomName}»`);
    const welcomeText = opts.welcomeText || 'Общайтесь, задавайте вопросы, делитесь фото.';

    let groupScreen = document.getElementById('group-screen');
    if (!groupScreen) {
        groupScreen = document.createElement('section');
        groupScreen.id = 'group-screen';
        groupScreen.className = 'group-screen';
        document.getElementById('appMain').appendChild(groupScreen);
    }

    // Проверяем кэш
    const cachedMessages = messagesCache[roomId];
    const hasCache = cachedMessages != null;

    groupScreen.innerHTML = `
        <div class="chat-header room-head">
            <button class="chat-back-btn" onclick="closeGroup()" aria-label="Назад">
                <i class="fas fa-arrow-left"></i>
            </button>
            <div class="chat-header-info">
                <div class="chat-header-title">${escapeHtml(roomName)}</div>
                <div class="chat-header-subtitle" id="chatStatus">подключение...</div>
            </div>
            ${opts.chips ? `<button class="chat-header-btn chat-help-btn" onclick="housingTour(true)" aria-label="Подсказки"><i class="fas fa-question"></i></button>` : ''}
        </div>
        ${opts.chips ? housingChipsHTML(roomId) : ''}
        ${opts.cards ? seekBarHTML(roomId) : ''}

        <div class="chat-messages${opts.cards ? ' cards' : ''}" id="chatMessages">
            <div class="chat-welcome">
                <div class="chat-welcome-icon"><i class="${roomIcon}"></i></div>
                <div class="chat-welcome-title">${escapeHtml(welcomeTitle)}</div>
                <div class="chat-welcome-text">${escapeHtml(welcomeText)}</div>
            </div>
            ${ads.map(ad => renderHousingMessage(ad)).join('')}
        </div>

        ${opts.cards ? cardsDockHTML(roomId) : `<div class="chat-input-wrapper">
            ${opts.noAttach ? '' : `<button class="chat-attach-btn" onclick="attachImage()">
                <i class="fas fa-paperclip"></i>
            </button>
            <input type="file" id="imageInput" accept="image/*" style="display:none" onchange="handleImageSelect(event)">`}
            <input type="text" class="chat-input" id="chatInput" placeholder="Написать сообщение..." onkeydown="if(event.key==='Enter'){event.preventDefault();sendMessage();}">
            <button class="chat-send-btn" onclick="sendMessage()">
                <i class="fas fa-paper-plane"></i>
            </button>
        </div>`}
    `;

    groupScreen.style.display = 'flex';
    currentRoom = roomId;

    if (opts.prefill) {
        const inp = document.getElementById('chatInput');
        if (inp) inp.value = opts.prefill;
    }

    // Если есть кэш — показываем мгновенно
    if (hasCache) {
        console.log('⚡ Мгновенно из кэша:', roomId);
        renderHistory(cachedMessages);
    }

    // Параллельно обновляем с сервера
    loadHistoryHTTP(roomId);

    // Socket.io для реалтайма
    connectSocket();
    if (socket && socket.connected) {
        socket.emit('join-room', roomId);
        setChatStatus('онлайн');
    }

    if (opts.chips) { centerActiveChip(); setTimeout(housingTour, 700); }

    // Скролл вниз после отрисовки (несколько раз)
    setTimeout(() => scrollChatToBottom(), 100);
    setTimeout(() => scrollChatToBottom(), 400);
    setTimeout(() => scrollChatToBottom(), 800);
}

// ---------- ЗАГРУЗКА ИСТОРИИ ЧЕРЕЗ HTTP ----------
async function loadHistoryHTTP(roomId) {
    try {
        const res = await fetch(`${SERVER_URL}/api/messages/${roomId}`);
        const data = await res.json();

        const newMessages = data.messages || [];
        const oldCount = messagesCache[roomId]?.length || 0;

        messagesCache[roomId] = newMessages;

        if (newMessages.length !== oldCount) {
            console.log('🔄 Обновлено с сервера:', newMessages.length);
            renderHistory(newMessages);
        }
    } catch (err) {
        console.error('Ошибка HTTP:', err);
    }
}

// ---------- СООБЩЕНИЕ-ОБЪЯВЛЕНИЕ ----------
function adChipsHTML(adId) {
    const st = (typeof adState !== 'undefined' && adState[adId]) || { counts: {}, mine: [] };
    return renderReactionChips({ id: 'ad_' + adId, reactions: st.counts, mine: st.mine });
}

// ---------- фото в карточке: листаются прямо в ленте ----------
// В списке сервер присылает одну обложку, остальные фото подгружаются при первом касании.
const adPhotoCache = {};
function adSlidesHTML(ad) {
    const id = String(ad.id);
    const cached = adPhotoCache[id] || (ad.photos && ad.photos.length > 1 ? ad.photos : null);
    const n = cached ? cached.length : (Number(ad.photoCount) || (ad.image ? 1 : 0));
    const first = cached ? cached[0] : ad.image;
    const slide = (src) => src ? `<div class="ad-slide"><img src="${escapeHtml(src)}" alt="" loading="lazy" onerror="this.style.display='none'"></div>` : '<div class="ad-slide ph"></div>';
    let html = slide(first);
    for (let i = 1; i < n; i++) html += slide(cached ? cached[i] : '');
    return { n, html: `<div class="ad-slides" data-slides="${escapeHtml(id)}" data-n="${n}" data-loaded="${cached || n <= 1 ? 1 : 0}">${html}</div>` };
}

function loadAdSlides(box) {
    if (!box || box.dataset.loaded === '1' || box.dataset.loading === '1') return;
    const id = box.dataset.slides;
    if (!(typeof isRemoteAdId === 'function' && isRemoteAdId(id))) { box.dataset.loaded = '1'; return; }
    box.dataset.loading = '1';
    fetch(`${SERVER_URL}/api/listings/${encodeURIComponent(id)}`).then(r => r.json()).then(d => {
        const photos = d && d.ok && d.listing && Array.isArray(d.listing.photos) ? d.listing.photos.filter(Boolean) : [];
        if (!photos.length) { box.dataset.loading = ''; return; }
        adPhotoCache[id] = photos;
        document.querySelectorAll(`.ad-slides[data-slides="${CSS.escape(id)}"]`).forEach(el => {
            const slides = el.querySelectorAll('.ad-slide');
            photos.forEach((src, i) => {
                const sl = slides[i]; if (!sl || (i === 0 && sl.querySelector('img'))) return;
                sl.classList.remove('ph'); sl.innerHTML = `<img src="${escapeHtml(src)}" alt="" onerror="this.style.display='none'">`;
            });
            el.dataset.loaded = '1'; el.dataset.loading = '';
        });
    }).catch(() => { box.dataset.loading = ''; });
}
document.addEventListener('pointerdown', (ev) => { const b = ev.target.closest && ev.target.closest('.ad-slides'); if (b) loadAdSlides(b); }, true);
document.addEventListener('mouseover', (ev) => { const b = ev.target.closest && ev.target.closest('.ad-slides'); if (b && b.dataset.loaded !== '1') loadAdSlides(b); });
document.addEventListener('scroll', (ev) => {
    const b = ev.target;
    if (!b || !b.classList || !b.classList.contains('ad-slides')) return;
    const i = Math.round(b.scrollLeft / Math.max(1, b.clientWidth)) + 1;
    const cur = b.parentElement && b.parentElement.querySelector('.ph-count .cur');
    if (cur && cur.textContent !== String(i)) cur.textContent = i;
}, true);

// Главные удобства показываем первыми: Wi-Fi, парковка, бассейн
const AMEN_FIRST = ['Wi-Fi', 'Парковка', 'Бассейн', 'Кондиционер', 'Кухня'];
function adAmenBadges(ad, max) {
    const list = (ad.amenities || []).slice().sort((x, y) => {
        const i = AMEN_FIRST.indexOf(x), j = AMEN_FIRST.indexOf(y);
        return (i < 0 ? 99 : i) - (j < 0 ? 99 : j);
    });
    if (!list.length) return '';
    const icon = typeof amenityIcon === 'function' ? amenityIcon : () => 'fa-check';
    const shown = list.slice(0, max).map(l => `<span class="am"><i class="fas ${icon(l)}"></i>${escapeHtml(l)}</span>`).join('');
    return `<div class="ad-amen">${shown}${list.length > max ? `<span class="am more">+${list.length - max}</span>` : ''}</div>`;
}

function renderHousingMessage(ad) {
    const id = escapeHtml(String(ad.id));
    const remote = typeof isRemoteAdId === 'function' && isRemoteAdId(ad.id);
    const sl = adSlidesHTML(ad);
    const sea = (typeof distMeters === 'function' && ad.coords && ad.beach) ? fmtDist(distMeters(ad.coords, ad.beach)) : '';
    const fav = remote && typeof favIds !== 'undefined' && favIds.has(ad.id);
    const rating = ad.rating ? `<span class="ad-rate"><i class="fas fa-star"></i>${Number(ad.rating).toFixed(1).replace('.', ',')}${ad.reviewCount ? `<small>(${ad.reviewCount})</small>` : ''}</span>` : '';

    return `
        <div class="chat-message chat-message-ad" data-id="ad_${id}" data-ad-id="${id}"${(ad.updated || ad.created) ? ` data-ts="${Number(ad.updated || ad.created)}"` : ''} onclick="openListing('${id}')">
            <div class="chat-bubble-wrap">
                <div class="chat-bubble">
                    <div class="chat-ad-image">
                        ${sl.html}
                        ${ad.isUrgent ? '<div class="ad-badge ad-badge-urgent">Срочно</div>' : ''}
                        ${remote ? `<button type="button" class="card-fav ${fav ? 'on' : ''}" data-fav="${id}" aria-pressed="${!!fav}" aria-label="В избранное" onclick="event.stopPropagation();toggleCardFav('${id}',this)"><i class="far fa-heart"></i><i class="fas fa-heart"></i></button>` : ''}
                        ${sl.n ? `<span class="ph-count"><i class="fas fa-camera"></i><span><b class="cur">1</b>/${sl.n}</span></span>` : ''}
                        ${sea ? `<span class="sea-dist"><i class="fas fa-umbrella-beach"></i>${escapeHtml(sea)}<small> до моря</small></span>` : ''}
                    </div>
                    <div class="ad-info">
                        <div class="ad-row1"><div class="chat-ad-price">${escapeHtml(ad.price)}${ad.isVerified ? ' <i class="fas fa-circle-check ad-ok" aria-label="Проверенный хозяин"></i>' : ''}</div>${rating}</div>
                        <div class="chat-ad-title" data-ugc>${escapeHtml(ad.title)}</div>
                        <div class="chat-ad-location" data-ugc><i class="fas fa-map-marker-alt"></i><span>${escapeHtml(ad.location)}</span></div>
                        ${adAmenBadges(ad, 3)}
                    </div>
                </div>
                ${typeof adMapBtnHTML === 'function' ? adMapBtnHTML(ad) : ''}
                <div class="chat-reactions" data-for="ad_${id}">${adChipsHTML(ad.id)}</div>
            </div>
        </div>
    `;
}

// ---------- ОТПРАВКА СООБЩЕНИЯ ----------
function sendMessage() {
    const input = document.getElementById('chatInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    const userName = getUserName();

    if (socket && socket.connected) {
        const payload = { room: currentRoom, user: userName, text: text };
        if (typeof replyDraft !== 'undefined' && replyDraft) {
            if (String(replyDraft.id).startsWith('ad_')) payload.replyAd = { id: replyDraft.adId, title: replyDraft.adTitle };
            else payload.replyTo = replyDraft.id;
        }
        emitMessage(payload);
        if (typeof clearReply === 'function') clearReply();
        input.value = '';

        input.focus(); // клавиатура остаётся открытой — можно писать подряд
    } else {
        showToast('Сервер недоступен. Проверьте интернет.');
    }
}

// ---------- ДОБАВИТЬ СООБЩЕНИЕ В ЧАТ ----------
function addMessageToChat(message) {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) return;

    // Обновляем кэш
    if (currentRoom) {
        if (!messagesCache[currentRoom]) {
            messagesCache[currentRoom] = [];
        }
        messagesCache[currentRoom].push(message);
    }

    const userName = getUserName();
    const messageHtml = renderMessageHTML(message, userName);
    messagesContainer.insertAdjacentHTML('beforeend', messageHtml);

    // Плавный скролл вниз
    scrollChatToBottomSmooth();
}

// ---------- ПРИКРЕПИТЬ ФОТО ----------
function attachImage() {
    const inp = document.getElementById('imageInput');
    if (inp) inp.click();
}

async function handleImageSelect(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;

    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
        showToast('Нужна картинка JPEG, PNG, WebP или GIF');
        return;
    }
    if (file.size > 12 * 1024 * 1024) {
        showToast('Картинка слишком большая');
        return;
    }
    if (!socket || !socket.connected) { showToast('Сервер недоступен'); return; }

    try {
        // Сжимаем до 1280 px — сервер принимает не более 1,5 МБ
        const dataUrl = await fileToDataURL(file, 1280, 0.8);
        if (dataUrl.length * 0.75 > 1.4 * 1024 * 1024) {
            showToast('Фото слишком тяжёлое даже после сжатия');
            return;
        }
        emitMessage({ room: currentRoom, user: getUserName(), text: '', image: dataUrl });
    } catch (err) {
        showToast('Не удалось обработать фото');
    }
}

function goToProfileFromChat() {
    closeGroup();
    switchTab('profile');
}
function goToPubsFromChat() {
    closeGroup();
    switchTab('mypubs');
}

// ---------- ЗАКРЫТЬ ЧАТ ----------
function closeGroup() {
    // Разфокусируем всё (закрыть клавиатуру)
    if (document.activeElement) document.activeElement.blur();

    if (socket && currentRoom) {
        socket.emit('leave-room', currentRoom);
    }
    currentRoom = null;

    const groupScreen = document.getElementById('group-screen');
    if (groupScreen) groupScreen.style.display = 'none';

    switchTab('search', false);
}

// ---------- ВСПОМОГАТЕЛЬНЫЕ ----------
function getCurrentTime() {
    const now = new Date();
    return now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return hash;
}

// ---------- КОПИРОВАТЬ ССЫЛКУ ----------
function copyInviteLink() {
    const link = /^https?:$/.test(location.protocol) && location.hostname !== 'localhost' ? location.origin : 'https://yugiyugi.ru';
    navigator.clipboard.writeText(link).then(() => {
        showToast('Ссылка скопирована!');
    }).catch(() => {
        alert('Ссылка: ' + link);
    });
}

// ---------- ТОСТ ----------
function showToast(message) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

// ---------- ЛЕНТА «ГОРЯЧЕЕ СЕГОДНЯ» ----------
function renderFeatured() {
    const list = document.getElementById('featuredList');
    const all = getAllAds();

    const count = document.getElementById('housingCount');
    if (count) {
        const n = all.length;
        const last = n % 10, two = n % 100;
        const word = (two >= 11 && two <= 14) ? 'объявлений'
            : last === 1 ? 'объявление'
            : (last >= 2 && last <= 4) ? 'объявления' : 'объявлений';
        count.textContent = n + ' ' + word;
    }

    if (!list) return;

    const mine = [...remoteAds, ...getMyAds()];
    const top = [...(typeof HOUSING_ADS !== 'undefined' ? HOUSING_ADS : [])].sort((a, b) => b.views - a.views);
    const hot = [...mine, ...top].slice(0, 7);

    // если подборка не изменилась, не перерисовываем: иначе при каждом «Назад» заново декодируются все фото
    const sig = hot.map(a => [a.id, a.updated || '', a.price, a.title, a.location, (a.image || '').length, a.rating || '', a.reviewCount || '', a.isUrgent ? 1 : 0, a.isVerified ? 1 : 0, Array.isArray(a.coords) ? 1 : 0].join('~')).join('|');
    if (list.dataset.sig === sig && list.children.length) return;
    list.dataset.sig = sig;
    list.innerHTML = hot.map(ad => `
        <div class="ad-card" onclick="openListing('${ad.id}')">
            <div class="ad-card-img">
                ${adImg(ad)}
                ${ad.isUrgent ? '<div class="ad-badge ad-badge-urgent">Срочно</div>' : ''}
                ${ad.isVerified ? '<div class="ad-badge ad-badge-verified"><i class="fas fa-check"></i></div>' : ''}
            </div>
            <div class="ad-card-body">
                <div class="ad-card-price">${escapeHtml(ad.price)}${typeof ratingBadge === 'function' ? ratingBadge(ad) : ''}</div>
                <div class="ad-card-title">${escapeHtml(ad.title)}</div>
                <div class="ad-card-loc"><i class="fas fa-map-marker-alt"></i><span>${escapeHtml(ad.location)}</span></div>
                ${typeof adMapBtnHTML === 'function' ? adMapBtnHTML(ad) : ''}
            </div>
        </div>
    `).join('');
}

// ---------- ПОИСК ----------
function runSearch() {
    const input = document.getElementById('searchInput');
    if (!input) return;
    const q = input.value.trim().toLowerCase();
    if (!q) { showToast('Введите, что ищете'); return; }

    // «дом», «отель» и т. п. ведут сразу в нужный чат жилья
    const cats = [['guest', ['гостев', 'хостел']], ['hotel', ['отел', 'гостиниц']], ['room', ['комнат']], ['house', ['дом', 'коттедж', 'вилл', 'дач']], ['apartment', ['квартир', 'студи', 'апарт']]];
    const cat = cats.find(c => c[1].some(w => q.includes(w)));
    const map = [
        { room: 'work',   words: ['работ', 'ваканс', 'резюме', 'подработ', 'официант', 'повар'] },
        { room: 'trips',  words: ['поезд', 'попутч', 'трансфер', 'такси', 'довез', 'аэропорт'] },
        { room: 'services', words: ['развлеч', 'экскурс', 'прогулк', 'яхт', 'катер', 'джип', 'дайвинг', 'аквапарк', 'дельфин', 'рыбалк', 'шоу', 'квадр'] },
        { room: 'dating', words: ['знаком', 'общени', 'компани'] }
    ];
    const hit = map.find(m => m.words.some(w => q.includes(w)));

    input.value = '';
    input.blur();
    openGroup(hit ? hit.room : (cat ? 'housing-' + cat[0] : 'housing'));
}

const searchGo = document.getElementById('searchGo');
const searchInput = document.getElementById('searchInput');
if (searchGo) searchGo.addEventListener('click', runSearch);
if (searchInput) searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); runSearch(); }
});

// ---------- ЗАПУСК ----------
renderFeatured();
connectSocket();

console.log('💬 Tell — приложение запущено');
console.log('🌐 Сервер:', SERVER_URL);
console.log('👤 Ваше имя:', getUserName());


// ---------- КНОПКА «НАЗАД»: срабатывает с первого касания ----------
// Раньше первое касание уходило на закрытие клавиатуры (поле теряло фокус, раскладка
// сдвигалась) и «клик» не попадал в кнопку. Теперь действие запускается при касании.
(function fastBackButton() {
    let lastFire = 0, synthetic = false;
    document.addEventListener('pointerdown', (ev) => {
        if (ev.button > 0) return;
        const btn = ev.target.closest && ev.target.closest('.chat-back-btn');
        if (!btn) return;
        lastFire = Date.now();
        synthetic = true;
        const t0 = performance.now(), wait = Math.round(t0 - ev.timeStamp);   // сколько касание ждало, пока страница освободится
        try { btn.click(); } finally { synthetic = false; }
        const js = Math.round(performance.now() - t0);
        // диагностика: адрес с ?perf=1 (или localStorage yy-perf=1) показывает, где теряется время
        let on = false;
        try { on = /[?&]perf=1/.test(location.search) || localStorage.getItem('yy-perf') === '1'; } catch (_) {}
        if (on) requestAnimationFrame(() => requestAnimationFrame(() => {
            const ms = Math.round(performance.now() - t0);
            if (typeof showToast === 'function') showToast('Назад: касание ждало ' + wait + ' мс, скрипт ' + js + ' мс, экран сменился за ' + ms + ' мс');
        }));
    }, true);
    document.addEventListener('click', (ev) => {
        const btn = ev.target.closest && ev.target.closest('.chat-back-btn');
        if (!btn || synthetic) return;
        if (Date.now() - lastFire < 900) { ev.stopPropagation(); ev.preventDefault(); }
    }, true);
})();



// ---------- цвет под строкой состояния ----------
// Вверху главной лежит фото с голубым небом. iOS красит область под часами в цвет темы, и она резала фото
// тёмной или белой полосой. Пока открыта главная и страница наверху, красим эту область в цвет неба с фото.
(function () {
    const HERO_BLUE = '#007cd4';
    let state = '';
    function sync() {
        const ts = document.getElementById('tab-search'), gs = document.getElementById('group-screen');
        const home = !!ts && ts.style.display !== 'none' && !(gs && gs.style.display && gs.style.display !== 'none') && !!document.querySelector('.hero-photo');
        const top = home && (window.scrollY || 0) < 40;
        const next = top ? 'top' : '';
        if (next === state) return;
        state = next;
        document.documentElement.classList.toggle('on-home-top', top);
        if (metaTheme) metaTheme.setAttribute('content', top ? HERO_BLUE : THEMES[getTheme()].meta);
    }
    window.syncTopTint = function () { state = '\0'; sync(); };
    const mo = new MutationObserver(sync);
    document.querySelectorAll('.tab-content').forEach(el => mo.observe(el, { attributes: true, attributeFilter: ['style'] }));
    // экран комнаты создаётся позже всех: подключаемся, как только он появится
    const attach = () => { const g = document.getElementById('group-screen'); if (g && !g._tint) { g._tint = 1; mo.observe(g, { attributes: true, attributeFilter: ['style'] }); sync(); } return !!g; };
    if (!attach()) { const bo = new MutationObserver(() => { if (attach()) bo.disconnect(); }); bo.observe(document.body, { childList: true, subtree: true }); }
    window.addEventListener('scroll', sync, { passive: true });
    sync();
})();
