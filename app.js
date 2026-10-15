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
    item.addEventListener('click', () => {
        switchTab(item.dataset.tab);
    });
});

switchTab('search');

// ---------- ОТКРЫТИЕ ГРУППЫ ----------
function openGroup(groupId) {
    console.log('Открываем группу:', groupId);
    
    if (groupId === 'housing') {
        openHousingGroup();
    } else {
        alert('Группа "' + groupId + '" — скоро!');
    }
}

// ---------- ГРУППА "ЖИЛЬЁ" ----------
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
    
    // Заполняем экран
    groupScreen.innerHTML = `
        <div class="group-header">
            <button class="group-back-btn" onclick="closeGroup()">
                <i class="fas fa-arrow-left"></i>
            </button>
            <h1 class="group-title">🏘️ Жильё</h1>
            <div class="group-header-spacer"></div>
        </div>
        
        <p class="group-subtitle">${HOUSING_ADS.length} объявлений</p>
        
        <div class="ads-list">
            ${HOUSING_ADS.map(ad => renderHousingCard(ad)).join('')}
        </div>
        
        <button class="fab-add" onclick="openAddForm('housing')">
            <i class="fas fa-plus"></i>
        </button>
    `;
    
    groupScreen.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- КАРТОЧКА ОБЪЯВЛЕНИЯ ----------
function renderHousingCard(ad) {
    return `
        <div class="ad-card" onclick="openAdDetail(${ad.id})">
            <div class="ad-image-wrap">
                <img src="${ad.image}" class="ad-image" loading="lazy" alt="${ad.title}" onerror="this.style.display='none'">
                ${ad.isUrgent ? '<div class="ad-badge ad-badge-urgent">Срочно</div>' : ''}
                ${ad.isVerified ? '<div class="ad-badge ad-badge-verified"><i class="fas fa-check"></i></div>' : ''}
            </div>
            <div class="ad-body">
                <div class="ad-price">${ad.price}</div>
                <div class="ad-title">${ad.title}</div>
                <div class="ad-location">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>${ad.location}</span>
                </div>
                <div class="ad-meta">
                    <span>${ad.date}</span>
                    <span>•</span>
                    <span><i class="fas fa-eye"></i> ${ad.views}</span>
                </div>
            </div>
        </div>
    `;
}

// ---------- ЗАКРЫТЬ ГРУППУ ----------
function closeGroup() {
    const groupScreen = document.getElementById('group-screen');
    if (groupScreen) groupScreen.style.display = 'none';
    
    switchTab('search');
}

// ---------- ОТКРЫТЬ ОБЪЯВЛЕНИЕ ----------
function openAdDetail(adId) {
    const ad = HOUSING_ADS.find(a => a.id === adId);
    if (!ad) return;
    
    alert(`📋 ${ad.title}\n\n💰 ${ad.price}\n📍 ${ad.location}\n\n${ad.description}\n\n— Детальная страница скоро!`);
}

// ---------- ФОРМА ПОДАЧИ ----------
function openAddForm(groupId) {
    alert('📝 Форма подачи объявления в группе "' + groupId + '" — скоро!');
}

// ---------- КОПИРОВАТЬ ССЫЛКУ ----------
function copyInviteLink() {
    const link = 'https://gokurort-new.onrender.com';
    navigator.clipboard.writeText(link).then(() => {
        showToast('✅ Ссылка скопирована!');
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