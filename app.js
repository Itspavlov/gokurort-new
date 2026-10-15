// ============================================
// TELL — логика приложения + связь с бэкендом
// ============================================

// ---------- НАСТРОЙКИ ----------
const SERVER_URL = 'https://tell-server.onrender.com';
let socket = null;
let currentRoom = null;

// Кэш сообщений по комнатам
const messagesCache = {
    housing: null,
    work: null,
    market: null,
    trips: null
};

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
        metaTheme.setAttribute('content', '#0F172A');
    } else {
        themeIcon.className = 'fas fa-sun';
        metaTheme.setAttribute('content', '#F8FAFC');
    }
}

themeToggle.addEventListener('click', () => {
    const current = html.getAttribute('data-theme');
    setTheme(current === 'dark' ? 'light' : 'dark');
});

// ---------- ИМЯ ПОЛЬЗОВАТЕЛЯ ----------
function getUserName() {
    let name = localStorage.getItem('tell-username');
    if (!name) {
        name = 'Гость_' + Math.floor(Math.random() * 9000 + 1000);
        localStorage.setItem('tell-username', name);
    }
    return name;
}

// ---------- ПЕРЕКЛЮЧАТЕЛЬ ВКЛАДОК ----------
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

function switchTab(tabName) {
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
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

navItems.forEach(item => {
    item.addEventListener('click', () => switchTab(item.dataset.tab));
});

switchTab('search');

// ---------- SOCKET.IO (с кэшированием подключения) ----------
function connectSocket() {
    // Если socket уже есть — переиспользуем
    if (socket) {
        if (!socket.connected) {
            socket.connect();
        }
        return;
    }
    
    socket = io(SERVER_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000
    });
    
    socket.on('connect', () => {
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
    
    // Пришло новое сообщение
    socket.on('new-message', (message) => {
        console.log('💬 Новое сообщение:', message);
        addMessageToChat(message);
    });
    
    // Пришла история комнаты
    socket.on('room-history', (history) => {
        console.log('📜 История (socket):', history.length);
        
        if (currentRoom) {
            messagesCache[currentRoom] = history;
        }
        
        renderHistory(history);
    });
    
    // Комната очищена
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

// ---------- ОТРИСОВКА ИСТОРИИ ----------
function renderHistory(history) {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) return;
    
    const userName = getUserName();
    
    // Удаляем ТОЛЬКО сообщения из истории, объявления оставляем
    const oldHistoryMessages = messagesContainer.querySelectorAll('.chat-message[data-from-history="true"]');
    oldHistoryMessages.forEach(el => el.remove());
    
    const oldDivider = document.getElementById('history-divider');
    if (oldDivider) oldDivider.remove();
    
    if (!history || history.length === 0) return;
    
    // Разделитель
    const divider = document.createElement('div');
    divider.id = 'history-divider';
    divider.className = 'chat-history-divider';
    divider.innerHTML = '<span>История сообщений</span>';
    messagesContainer.appendChild(divider);
    
    // Рисуем сообщения
    history.forEach(message => {
        const html = renderMessageHTML(message, userName);
        messagesContainer.insertAdjacentHTML('beforeend', html);
    });
    
    // Помечаем как "из истории"
    messagesContainer.querySelectorAll('.chat-message:not([data-from-history])').forEach(el => {
        if (el.querySelector('.chat-ad-image')) return;
        el.setAttribute('data-from-history', 'true');
    });
    
    scrollChatToBottom();
}

// ---------- HTML ОДНОГО СООБЩЕНИЯ ----------
function renderMessageHTML(message, userName) {
    const isMine = message.user === userName;
    
    const imageBlock = message.image 
        ? `<div class="chat-bubble-image"><img src="${message.image}" alt="Фото" loading="lazy"></div>` 
        : '';
    
    const textBlock = message.text 
        ? `<div>${escapeHtml(message.text)}</div>` 
        : '';
    
    if (isMine) {
        return `
            <div class="chat-message chat-message-mine">
                <div class="chat-bubble-wrap">
                    <div class="chat-bubble chat-bubble-mine">
                        ${imageBlock}
                        ${textBlock}
                    </div>
                    <div class="chat-time-mine">${formatTime(message.time)}</div>
                </div>
            </div>
        `;
    } else {
        const colors = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#0EA5E9'];
        const color = colors[Math.abs(hashCode(message.user)) % colors.length];
        
        return `
            <div class="chat-message">
                <div class="chat-avatar" style="background: ${color};">${message.avatar || message.user[0]}</div>
                <div class="chat-bubble-wrap">
                    <div class="chat-bubble-header">
                        <span class="chat-user-name">${escapeHtml(message.user)}</span>
                        <span class="chat-time">${formatTime(message.time)}</span>
                    </div>
                    <div class="chat-bubble">
                        ${imageBlock}
                        ${textBlock}
                    </div>
                </div>
            </div>
        `;
    }
}

// ---------- ОТКРЫТИЕ ГРУППЫ ----------
function openGroup(groupId) {
    const rooms = {
        housing: { name: 'Жильё', icon: 'fas fa-home', ads: typeof HOUSING_ADS !== 'undefined' ? HOUSING_ADS : [] },
        work: { name: 'Работа', icon: 'fas fa-briefcase', ads: [] },
        market: { name: 'Продам/Отдам', icon: 'fas fa-shopping-bag', ads: [] },
        trips: { name: 'Поездки', icon: 'fas fa-car', ads: [] }
    };
    
    const room = rooms[groupId];
    if (!room) return;
    
    openChatRoom(groupId, room.name, room.icon, room.ads);
}

// ---------- ОТКРЫТИЕ ЧАТА ----------
function openChatRoom(roomId, roomName, roomIcon, ads) {
    tabContents.forEach(section => section.style.display = 'none');
    
    let groupScreen = document.getElementById('group-screen');
    if (!groupScreen) {
        groupScreen = document.createElement('section');
        groupScreen.id = 'group-screen';
        groupScreen.className = 'group-screen';
        document.getElementById('appMain').appendChild(groupScreen);
    }
    
    // Проверяем кэш
    const cachedMessages = messagesCache[roomId];
    const hasCache = cachedMessages !== null;
    
    groupScreen.innerHTML = `
        <div class="chat-header">
            <button class="chat-back-btn" onclick="closeGroup()">
                <i class="fas fa-arrow-left"></i>
            </button>
            <div class="chat-header-info">
                <div class="chat-header-title">${roomName}</div>
                <div class="chat-header-subtitle" id="chatStatus">подключение...</div>
            </div>
            <button class="chat-header-btn" onclick="showToast('Меню группы — скоро')">
                <i class="fas fa-ellipsis-v"></i>
            </button>
        </div>
        
        <div class="chat-messages" id="chatMessages">
            <div class="chat-welcome">
                <div class="chat-welcome-icon"><i class="${roomIcon}"></i></div>
                <div class="chat-welcome-title">Добро пожаловать в чат «${roomName}»</div>
                <div class="chat-welcome-text">Общайтесь, задавайте вопросы, делитесь фото.</div>
            </div>
            ${ads.map(ad => renderHousingMessage(ad)).join('')}
        </div>
        
        <div class="chat-input-wrapper">
            <button class="chat-attach-btn" onclick="attachImage()">
                <i class="fas fa-paperclip"></i>
            </button>
            <input type="file" id="imageInput" accept="image/*" style="display:none" onchange="handleImageSelect(event)">
            <input type="text" class="chat-input" id="chatInput" placeholder="Написать сообщение..." onkeydown="if(event.key==='Enter') sendMessage()">
            <button class="chat-send-btn" onclick="sendMessage()">
                <i class="fas fa-paper-plane"></i>
            </button>
        </div>
    `;
    
    groupScreen.style.display = 'flex';
    currentRoom = roomId;
    
    // ✅ ЕСЛИ ЕСТЬ КЭШ — показываем мгновенно
    if (hasCache) {
        console.log('⚡ Мгновенно из кэша:', roomId);
        renderHistory(cachedMessages);
    }
    
    // 🌐 Параллельно обновляем с сервера
    loadHistoryHTTP(roomId);
    
    // 📡 Socket.io для реалтайма
    connectSocket();
    if (socket && socket.connected) {
        socket.emit('join-room', roomId);
        document.getElementById('chatStatus').textContent = 'онлайн';
    }
    
    setTimeout(() => scrollChatToBottom(), 50);
}

// ---------- ЗАГРУЗКА ИСТОРИИ ЧЕРЕЗ HTTP ----------
async function loadHistoryHTTP(roomId) {
    try {
        const res = await fetch(`${SERVER_URL}/api/messages/${roomId}`);
        const data = await res.json();
        
        const newMessages = data.messages || [];
        const oldCount = messagesCache[roomId]?.length || 0;
        
        messagesCache[roomId] = newMessages;
        
        // Перерисовываем только если изменилось
        if (newMessages.length !== oldCount) {
            console.log('🔄 Обновлено с сервера:', newMessages.length);
            renderHistory(newMessages);
        }
    } catch (err) {
        console.error('Ошибка HTTP:', err);
    }
}

// ---------- СООБЩЕНИЕ-ОБЪЯВЛЕНИЕ ----------
function renderHousingMessage(ad) {
    const colors = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#0EA5E9'];
    const color = colors[ad.id % colors.length];
    const userName = ['Александр', 'Мария', 'Дмитрий', 'Анна', 'Сергей', 'Елена'][ad.id % 6];
    const time = ['10:23', '10:45', '11:12', '12:30', '13:15', '14:02'][ad.id % 6];
    
    return `
        <div class="chat-message">
            <div class="chat-avatar" style="background: ${color};">${userName[0]}</div>
            <div class="chat-bubble-wrap">
                <div class="chat-bubble-header">
                    <span class="chat-user-name">${userName}</span>
                    <span class="chat-time">${time}</span>
                </div>
                <div class="chat-bubble">
                    <div class="chat-ad-image">
                        <img src="${ad.image}" loading="lazy" alt="${ad.title}" onerror="this.style.display='none'">
                        ${ad.isUrgent ? '<div class="ad-badge ad-badge-urgent">Срочно</div>' : ''}
                        ${ad.isVerified ? '<div class="ad-badge ad-badge-verified"><i class="fas fa-check"></i></div>' : ''}
                    </div>
                    <div class="chat-ad-title">${ad.title}</div>
                    <div class="chat-ad-price">${ad.price}</div>
                    <div class="chat-ad-location">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${ad.location}</span>
                    </div>
                    <div class="chat-ad-desc">${ad.description}</div>
                </div>
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
        socket.emit('send-message', {
            room: currentRoom,
            user: userName,
            text: text,
            avatar: userName[0]
        });
        input.value = '';
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
    const html = renderMessageHTML(message, userName);
    messagesContainer.insertAdjacentHTML('beforeend', html);
    
    scrollChatToBottom();
}

// ---------- ПРИКРЕПИТЬ ФОТО ----------
function attachImage() {
    document.getElementById('imageInput').click();
}

function handleImageSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > 2 * 1024 * 1024) {
        showToast('Картинка слишком большая (макс. 2 МБ)');
        event.target.value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const userName = getUserName();
        
        if (socket && socket.connected) {
            socket.emit('send-message', {
                room: currentRoom,
                user: userName,
                text: '',
                image: e.target.result,
                avatar: userName[0]
            });
        } else {
            showToast('Сервер недоступен');
        }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

// ---------- ЗАКРЫТЬ ЧАТ ----------
function closeGroup() {
    if (socket && currentRoom) {
        socket.emit('leave-room', currentRoom);
    }
    currentRoom = null;
    
    const groupScreen = document.getElementById('group-screen');
    if (groupScreen) groupScreen.style.display = 'none';
    
    switchTab('search');
}

// ---------- ВСПОМОГАТЕЛЬНЫЕ ----------
function scrollChatToBottom() {
    const messages = document.getElementById('chatMessages');
    if (messages) messages.scrollTop = messages.scrollHeight;
}

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
    const link = 'https://gokurort-new.onrender.com';
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

// ---------- ЗАПУСК ----------
connectSocket();

console.log('💬 Tell — приложение запущено');
console.log('🌐 Сервер:', SERVER_URL);
console.log('👤 Ваше имя:', getUserName());