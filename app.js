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
    market: null,
    trips: null
};

// ---------- ДАННЫЕ ПОЛЬЗОВАТЕЛЯ И ОБЪЯВЛЕНИЯ ----------
// Центр карты и ближайшая точка моря по умолчанию — поменяйте на свой город
const MAP_DEFAULT = [44.8946, 37.3100];
const BEACH_DEFAULT = [44.8928, 37.2990];

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
    return [...remoteAds, ...getMyAds(), ...base];
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
const themeToggle = document.getElementById('themeToggle');
const themeIcon = themeToggle.querySelector('i');
const html = document.documentElement;
const metaTheme = document.querySelector('meta[name="theme-color"]');

const savedTheme = localStorage.getItem('tell-theme') || 'dark';
setTheme(savedTheme);

function setTheme(theme) {
    html.setAttribute('data-theme', theme);
    localStorage.setItem('tell-theme', theme);

    if (theme === 'dark') {
        themeIcon.className = 'fas fa-moon';
        metaTheme.setAttribute('content', '#060F1C');
    } else {
        themeIcon.className = 'fas fa-sun';
        metaTheme.setAttribute('content', '#E9F5F7');
    }
}

themeToggle.addEventListener('click', () => {
    const current = html.getAttribute('data-theme');
    setTheme(current === 'dark' ? 'light' : 'dark');
});

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
    const groupScreen = document.getElementById('group-screen');
    if (groupScreen) groupScreen.style.display = 'none';

    tabContents.forEach(section => section.style.display = 'none');

    const target = document.getElementById('tab-' + tabName);
    if (target) {
        target.style.display = 'block';
        target.classList.add('fade-in');
    }

    navItems.forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tabName);
    });

    moveNavIndicator(animate);

    if (tabName === 'profile' && typeof renderProfile === 'function') renderProfile();
    if (tabName === 'messages' && typeof renderDialogs === 'function') renderDialogs();
    if (tabName === 'search') renderFeatured();

    window.scrollTo({ top: 0, behavior: 'smooth' });
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
        const statusEl = document.getElementById('chatStatus');
        if (statusEl) statusEl.textContent = 'онлайн';
        if (currentRoom) socket.emit('join-room', currentRoom);
    });

    socket.on('disconnect', () => {
        console.log('🔴 Отключено от сервера');
        const statusEl = document.getElementById('chatStatus');
        if (statusEl) statusEl.textContent = 'отключено';
    });

    socket.on('connect_error', (err) => {
        console.error('Ошибка подключения:', err);
        const statusEl = document.getElementById('chatStatus');
        if (statusEl) statusEl.textContent = 'ошибка подключения';
    });

    socket.on('new-message', (message) => {
        if (!message || typeof message !== 'object') return;
        // сообщение из другой комнаты не показываем
        if (message.room && message.room !== currentRoom) return;
        // защита от дублей (повторная доставка после переподключения)
        const cached = currentRoom && messagesCache[currentRoom];
        if (message.id && cached && cached.some(m => m.id === message.id)) return;
        addMessageToChat(message);
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
                <div class="chat-avatar" style="background: ${color};">${escapeHtml(Array.from(String(message.user || '?'))[0] || '?')}</div>
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
            noAttach: true, chips: true,
            welcomeTitle: all ? 'Жильё у моря: все объявления' : 'Чат «' + cat.label + '»',
            welcomeText: all ? 'Здесь все типы жилья. Чтобы увидеть только квартиры, дома или отели, выберите тип сверху.' : 'Здесь только объявления этого типа и общение с хозяевами.'
        }, opts || {}));
        return;
    }
    const rooms = {
        work: { name: 'Работа', icon: 'fas fa-briefcase', ads: [] },
        market: { name: 'Продам/Отдам', icon: 'fas fa-shopping-bag', ads: [] },
        trips: { name: 'Поездки', icon: 'fas fa-car', ads: [] }
    };

    const room = rooms[groupId];
    if (!room) return;

    openChatRoom(groupId, room.name, room.icon, room.ads, Object.assign({ noAttach: !!room.noAttach, hint: !!room.hint }, opts || {}));
}

// ---------- ОТКРЫТИЕ ЧАТА ----------
function openChatRoom(roomId, roomName, roomIcon, ads, opts = {}) {
    if (socket && currentRoom && currentRoom !== roomId) socket.emit('leave-room', currentRoom);

    tabContents.forEach(section => section.style.display = 'none');

    const welcomeTitle = opts.welcomeTitle || `Добро пожаловать в чат «${roomName}»`;
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
        <div class="chat-header">
            <button class="chat-back-btn" onclick="closeGroup()">
                <i class="fas fa-arrow-left"></i>
            </button>
            <div class="chat-header-info">
                <div class="chat-header-title">${escapeHtml(roomName)}</div>
                <div class="chat-header-subtitle" id="chatStatus">подключение...</div>
            </div>
            ${opts.chips
                ? `<button class="chat-header-btn chat-help-btn" onclick="housingTour(true)" aria-label="Подсказки"><i class="fas fa-question"></i></button>`
                : `<button class="chat-header-btn" onclick="showToast('Меню группы — скоро')"><i class="fas fa-ellipsis-v"></i></button>`}
        </div>
        ${opts.chips ? housingChipsHTML(roomId) : ''}

        <div class="chat-messages" id="chatMessages">
            <div class="chat-welcome">
                <div class="chat-welcome-icon"><i class="${roomIcon}"></i></div>
                <div class="chat-welcome-title">${escapeHtml(welcomeTitle)}</div>
                <div class="chat-welcome-text">${escapeHtml(welcomeText)}</div>
            </div>
            ${ads.map(ad => renderHousingMessage(ad)).join('')}
        </div>

        <div class="chat-input-wrapper">
            ${opts.noAttach ? '' : `<button class="chat-attach-btn" onclick="attachImage()">
                <i class="fas fa-paperclip"></i>
            </button>
            <input type="file" id="imageInput" accept="image/*" style="display:none" onchange="handleImageSelect(event)">`}
            <input type="text" class="chat-input" id="chatInput" placeholder="Написать сообщение..." onkeydown="if(event.key==='Enter'){event.preventDefault();sendMessage();}">
            <button class="chat-send-btn" onclick="sendMessage()">
                <i class="fas fa-paper-plane"></i>
            </button>
        </div>
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
        document.getElementById('chatStatus').textContent = 'онлайн';
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

function renderHousingMessage(ad) {
    const owner = getOwner(ad);
    const name = owner.name || 'Хозяин';
    const color = owner.color || '#E8643F';
    const time = ad.time || '';
    const avatar = owner.avatar
        ? `<img src="${owner.avatar}" alt="" class="chat-avatar-img">`
        : escapeHtml(name[0] || '?');

    return `
        <div class="chat-message chat-message-ad" data-id="ad_${escapeHtml(String(ad.id))}" data-ad-id="${escapeHtml(String(ad.id))}"${ad.created ? ` data-ts="${Number(ad.created)}"` : ''} onclick="openListing('${ad.id}')">
            <div class="chat-avatar" style="background: ${color};">${avatar}</div>
            <div class="chat-bubble-wrap">
                <div class="chat-bubble-header">
                    <span class="chat-user-name">${escapeHtml(name)}</span>
                    <span class="chat-time">${escapeHtml(time)}</span>
                </div>
                <div class="chat-bubble">
                    <div class="chat-ad-image">
                        ${adImg(ad)}
                        ${ad.isUrgent ? '<div class="ad-badge ad-badge-urgent">Срочно</div>' : ''}
                        ${ad.isVerified ? '<div class="ad-badge ad-badge-verified"><i class="fas fa-check"></i></div>' : ''}
                    </div>
                    <div class="chat-ad-title">${escapeHtml(ad.title)}</div>
                    <div class="chat-ad-price">${escapeHtml(ad.price)}</div>
                    <div class="chat-ad-location">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${escapeHtml(ad.location)}</span>
                    </div>
                    <div class="chat-ad-desc">${escapeHtml(ad.description || '')}</div>
                    <div class="chat-ad-more">Фото, карта, свободные даты <i class="fas fa-chevron-right"></i></div>
                </div>
                <div class="chat-reactions" data-for="ad_${escapeHtml(String(ad.id))}">${adChipsHTML(ad.id)}</div>
            </div>
        </div>
    `;
}

// ---------- ОТПРАВКА СООБЩЕНИЯ ----------
function sendMessage() {
    const input = document.getElementById('chatInput');
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

    list.innerHTML = hot.map(ad => `
        <div class="ad-card" onclick="openListing('${ad.id}')">
            <div class="ad-card-img">
                ${adImg(ad)}
                ${ad.isUrgent ? '<div class="ad-badge ad-badge-urgent">Срочно</div>' : ''}
                ${ad.isVerified ? '<div class="ad-badge ad-badge-verified"><i class="fas fa-check"></i></div>' : ''}
            </div>
            <div class="ad-card-body">
                <div class="ad-card-price">${escapeHtml(ad.price)}</div>
                <div class="ad-card-title">${escapeHtml(ad.title)}</div>
                <div class="ad-card-loc"><i class="fas fa-map-marker-alt"></i><span>${escapeHtml(ad.location)}</span></div>
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
        { room: 'market', words: ['продам', 'отдам', 'куплю', 'вещ', 'велосипед', 'мебель'] }
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
        try { btn.click(); } finally { synthetic = false; }
    }, true);
    document.addEventListener('click', (ev) => {
        const btn = ev.target.closest && ev.target.closest('.chat-back-btn');
        if (!btn || synthetic) return;
        if (Date.now() - lastFire < 900) { ev.stopPropagation(); ev.preventDefault(); }
    }, true);
})();
