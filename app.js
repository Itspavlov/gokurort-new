// ============================================
// TELL — логика приложения
// ============================================

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

// ---------- ПЕРЕКЛЮЧАТЕЛЬ ВКЛАДОК ----------
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

function switchTab(tabName) {
    // Скрываем экран группы (если открыт)
    const groupScreen = document.getElementById('group-screen');
    if (groupScreen) {
        groupScreen.style.display = 'none';
    }
    
    // Скрываем все вкладки
    tabContents.forEach(section => section.style.display = 'none');
    
    // Показываем нужную вкладку
    const target = document.getElementById('tab-' + tabName);
    if (target) {
        target.style.display = 'block';
        target.classList.add('fade-in');
    }
    
    // Обновляем активность кнопок
    navItems.forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tabName);
    });
    
    // Скролл наверх
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

navItems.forEach(item => {
    item.addEventListener('click', () => {
        switchTab(item.dataset.tab);
    });
});

// Показываем "Онлайн поиск" по умолчанию
switchTab('search');

// ---------- ОТКРЫТИЕ ГРУППЫ ----------
function openGroup(groupId) {
    console.log('Открываем группу:', groupId);
    
    if (groupId === 'housing') {
        openHousingGroup();
    } else {
        showToast('Группа "' + groupId + '" — скоро!');
    }
}

// ============================================
// ЧАТ "ЖИЛЬЁ"
// ============================================
function openHousingGroup() {
    // Скрываем все вкладки
    tabContents.forEach(section => section.style.display = 'none');
    
    // Создаём экран группы (если ещё нет)
    let groupScreen = document.getElementById('group-screen');
    if (!groupScreen) {
        groupScreen = document.createElement('section');
        groupScreen.id = 'group-screen';
        groupScreen.className = 'group-screen';
        document.getElementById('appMain').appendChild(groupScreen);
    }
    
    // Заполняем экран — ЧАТ
    groupScreen.innerHTML = `
        <div class="chat-header">
            <button class="chat-back-btn" onclick="closeGroup()">
                <i class="fas fa-arrow-left"></i>
            </button>
            <div class="chat-header-info">
                <div class="chat-header-title">Жильё</div>
                <div class="chat-header-subtitle">${HOUSING_ADS.length} объявлений • 24 участника</div>
            </div>
            <button class="chat-header-btn" onclick="showToast('Меню группы — скоро')">
                <i class="fas fa-ellipsis-v"></i>
            </button>
        </div>
        
        <div class="chat-messages" id="chatMessages">
            <div class="chat-welcome">
                <div class="chat-welcome-icon"><i class="fas fa-home"></i></div>
                <div class="chat-welcome-title">Добро пожаловать в чат «Жильё»</div>
                <div class="chat-welcome-text">Здесь публикуют объявления о жилье. Общайтесь, задавайте вопросы, договаривайтесь о сделках.</div>
            </div>
            
            ${HOUSING_ADS.map(ad => renderHousingMessage(ad)).join('')}
        </div>
        
        <div class="chat-input-wrapper">
            <button class="chat-attach-btn" onclick="attachImage()" title="Прикрепить фото">
                <i class="fas fa-paperclip"></i>
            </button>
            <input 
                type="file" 
                id="imageInput" 
                accept="image/*" 
                style="display:none" 
                onchange="handleImageSelect(event)"
            >
            <input 
                type="text" 
                class="chat-input" 
                id="chatInput" 
                placeholder="Написать сообщение..." 
                onkeydown="if(event.key==='Enter') sendMessage()"
            >
            <button class="chat-send-btn" onclick="sendMessage()">
                <i class="fas fa-paper-plane"></i>
            </button>
        </div>
    `;
    
    groupScreen.style.display = 'flex';
    setTimeout(() => scrollChatToBottom(), 100);
}

// ---------- СООБЩЕНИЕ-ОБЪЯВЛЕНИЕ ----------
function renderHousingMessage(ad) {
    const avatarColors = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#0EA5E9'];
    const color = avatarColors[ad.id % avatarColors.length];
    const userName = ['Александр', 'Мария', 'Дмитрий', 'Анна', 'Сергей', 'Елена'][ad.id % 6];
    const time = ['10:23', '10:45', '11:12', '12:30', '13:15', '14:02'][ad.id % 6];
    
    return `
        <div class="chat-message" data-ad-id="${ad.id}">
            <div class="chat-avatar" style="background: ${color};">
                ${userName[0]}
            </div>
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

// ---------- ОТПРАВИТЬ СООБЩЕНИЕ ----------
function sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    
    if (!text) return;
    
    const messagesContainer = document.getElementById('chatMessages');
    
    const messageHTML = `
        <div class="chat-message chat-message-mine">
            <div class="chat-bubble-wrap">
                <div class="chat-bubble chat-bubble-mine">
                    ${escapeHtml(text)}
                </div>
                <div class="chat-time-mine">${getCurrentTime()}</div>
            </div>
        </div>
    `;
    
    messagesContainer.insertAdjacentHTML('beforeend', messageHTML);
    input.value = '';
    scrollChatToBottom();
}

// ---------- ПРИКРЕПИТЬ ФОТО ----------
function attachImage() {
    document.getElementById('imageInput').click();
}

// ---------- ОБРАБОТКА ВЫБОРА ФОТО ----------
function handleImageSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const messagesContainer = document.getElementById('chatMessages');
        
        const messageHTML = `
            <div class="chat-message chat-message-mine">
                <div class="chat-bubble-wrap">
                    <div class="chat-bubble chat-bubble-mine chat-bubble-image">
                        <img src="${e.target.result}" alt="Фото">
                    </div>
                    <div class="chat-time-mine">${getCurrentTime()}</div>
                </div>
            </div>
        `;
        
        messagesContainer.insertAdjacentHTML('beforeend', messageHTML);
        scrollChatToBottom();
    };
    reader.readAsDataURL(file);
    
    event.target.value = '';
}

// ---------- ЗАКРЫТЬ ГРУППУ ----------
function closeGroup() {
    const groupScreen = document.getElementById('group-screen');
    if (groupScreen) groupScreen.style.display = 'none';
    
    switchTab('search');
}

// ---------- ВСПОМОГАТЕЛЬНЫЕ ----------
function scrollChatToBottom() {
    const messages = document.getElementById('chatMessages');
    if (messages) {
        messages.scrollTop = messages.scrollHeight;
    }
}

function getCurrentTime() {
    const now = new Date();
    return now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

console.log('💬 Tell — приложение запущено');