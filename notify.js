// ============================================
// NOTIFY.JS — всплывающие баннеры сверху (как в Telegram), звук и push-уведомления.
// Подключается после social.js.
// ============================================

// ---------- ЗВУК ----------
const SOUND_KEY = 'tell-sound';
let audioCtx = null;

function soundOn() { try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch (e) { return true; } }
function setSoundOn(v) { try { localStorage.setItem(SOUND_KEY, v ? 'on' : 'off'); } catch (e) {} }

// Браузер разрешает звук только после первого касания — «разблокируем» его при любом нажатии
function unlockAudio() {
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        if (!audioCtx) audioCtx = new AC();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) {}
}
['pointerdown', 'keydown', 'touchstart'].forEach(t => document.addEventListener(t, unlockAudio, { passive: true }));

// Короткий мягкий двухнотный сигнал (создаётся самим приложением, файлов не нужно)
function playChime() {
    if (!soundOn() || !audioCtx || audioCtx.state !== 'running') return;
    try {
        const t0 = audioCtx.currentTime;
        [[880, 0], [1318.5, 0.11]].forEach(([freq, delay]) => {
            const o = audioCtx.createOscillator(), g = audioCtx.createGain();
            o.type = 'sine'; o.frequency.value = freq;
            g.gain.setValueAtTime(0.0001, t0 + delay);
            g.gain.exponentialRampToValueAtTime(0.16, t0 + delay + 0.015);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.28);
            o.connect(g); g.connect(audioCtx.destination);
            o.start(t0 + delay); o.stop(t0 + delay + 0.3);
        });
    } catch (e) {}
}

// ---------- БАННЕРЫ ----------
const BANNER_ICONS = { dm: 'fa-comment', group: 'fa-user-group', reply: 'fa-reply', invite: 'fa-user-plus', verify: 'fa-shield-halved', listing: 'fa-house-circle-xmark', info: 'fa-bell' };
const BANNER_COLORS = ['#E8643F', '#12A8A8', '#D98A1E', '#7C5CFF', '#3E7BFF', '#C2417A'];

function bannerHost() {
    let h = document.getElementById('bannerHost');
    if (!h) { h = document.createElement('div'); h.id = 'bannerHost'; h.setAttribute('aria-live', 'polite'); document.body.appendChild(h); }
    return h;
}

function dismissBanner(el, dir) {
    if (!el || el._gone) return;
    el._gone = true;
    clearTimeout(el._timer);
    el.classList.remove('in');
    el.classList.add('out');
    if (dir) el.style.transform = `translate(${dir.x}px, ${dir.y}px)`;
    setTimeout(() => el.remove(), 260);
}

// opts: { title, body, kind, name, onClick, compact, sound, ttl, key }
function showBanner(opts) {
    const host = bannerHost();
    const key = opts.key || '';
    if (key) host.querySelectorAll('.banner').forEach(b => { if (b.dataset.key === key) { clearTimeout(b._timer); b.remove(); } });
    while (host.children.length >= 3) dismissBanner(host.firstElementChild);

    const el = document.createElement('div');
    el.className = 'banner' + (opts.compact ? ' compact' : '');
    el.dataset.key = key;
    el.setAttribute('role', 'status');

    if (!opts.compact) {
        const av = document.createElement('div');
        av.className = 'banner-avatar';
        const kind = opts.kind || 'info';
        if (kind === 'dm' && opts.title) {
            av.textContent = Array.from(opts.title)[0] || '?';
            av.style.background = BANNER_COLORS[Math.abs(hashCode(opts.title)) % BANNER_COLORS.length];
        } else {
            const i = document.createElement('i');
            i.className = 'fas ' + (BANNER_ICONS[kind] || BANNER_ICONS.info);
            av.appendChild(i);
            av.classList.add('kind-' + kind);
        }
        el.appendChild(av);
    }
    const txt = document.createElement('div');
    txt.className = 'banner-text';
    if (opts.title && !opts.compact) {
        const head = document.createElement('div');
        head.className = 'banner-head';
        const t = document.createElement('span'); t.className = 'banner-title'; t.textContent = opts.title;
        const when = document.createElement('span'); when.className = 'banner-time'; when.textContent = 'сейчас';
        head.append(t, when);
        txt.appendChild(head);
    }
    const body = document.createElement('div');
    body.className = 'banner-body';
    body.textContent = opts.body || '';
    txt.appendChild(body);
    el.appendChild(txt);
    host.appendChild(el);

    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    const ttl = opts.ttl || (opts.compact ? 2600 : 5200);
    const arm = () => { clearTimeout(el._timer); el._timer = setTimeout(() => dismissBanner(el), ttl); };
    arm();

    // касание = открыть, смахивание вверх/в сторону = убрать
    let sx = 0, sy = 0, dx = 0, dy = 0, down = false, moved = false;
    el.addEventListener('pointerdown', (ev) => {
        down = true; moved = false; sx = ev.clientX; sy = ev.clientY; dx = dy = 0;
        clearTimeout(el._timer); el.classList.add('drag');
        try { el.setPointerCapture(ev.pointerId); } catch (e) {}
    });
    el.addEventListener('pointermove', (ev) => {
        if (!down) return;
        dx = ev.clientX - sx; dy = Math.min(0, ev.clientY - sy);
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) moved = true;
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        el.style.opacity = String(Math.max(0.2, 1 - Math.max(Math.abs(dx) / 260, Math.abs(dy) / 90)));
    });
    const end = () => {
        if (!down) return;
        down = false; el.classList.remove('drag');
        if (!moved) { dismissBanner(el); if (opts.onClick) opts.onClick(); return; }
        if (dy < -28 || Math.abs(dx) > 90) { dismissBanner(el, { x: dx * 1.6, y: dy - 40 }); return; }
        el.style.transform = ''; el.style.opacity = '';
        arm();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);

    if (opts.sound !== false) { playChime(); if (navigator.vibrate) { try { navigator.vibrate(25); } catch (e) {} } }
    return el;
}

// Все короткие сообщения приложения («Скопировано», «Вы вышли» и т. д.) показываем тем же баннером сверху
window.showToast = function (message) {
    showBanner({ body: String(message == null ? '' : message), compact: true, sound: false, key: 'toast:' + message });
};

// ---------- ПЕРЕХОД ПО УВЕДОМЛЕНИЮ ----------
const OPEN_RE = /^(?:(?:dm|group):[\w-]{1,60}|room:(?:housing(?:-[a-z]{3,12})?|work|market|trips)|listing:l_[\w-]{1,40}|profile)$/;

function openTarget(target) {
    if (typeof target !== 'string' || !OPEN_RE.test(target)) return;
    const [kind, id] = target.split(':');
    if (kind === 'profile') { switchTab('profile'); return; }
    if (kind === 'listing') { if (typeof openListingById === 'function') openListingById(id); return; }
    whenSocketReady(() => {
        if (kind === 'dm') openDmById(id);
        else if (kind === 'group') openGroupById(id);
        else if (kind === 'room') openGroup(id);
    }, () => showToast('Нет связи с сервером'));
}

// ---------- ВХОДЯЩЕЕ УВЕДОМЛЕНИЕ ----------
function viewingTarget(p) {
    if (!p.open) return false;
    if (typeof currentDm !== 'undefined' && currentDm && p.open === 'dm:' + currentDm.convId) return true;
    if (typeof currentGroup !== 'undefined' && currentGroup && p.open === 'group:' + currentGroup.id) return true;
    if (typeof currentRoom !== 'undefined' && currentRoom && p.open === 'room:' + currentRoom) return true;
    return false;
}

let swReg = null;

function systemNotify(p) {
    try {
        if (!swReg || !('Notification' in window) || Notification.permission !== 'granted') return false;
        swReg.showNotification(p.title || 'Новое сообщение', {
            body: p.body || '', icon: 'icons/icon-192.png', tag: p.tag || undefined, renotify: !!p.tag, data: { open: p.open || '' }
        });
        return true;
    } catch (e) { return false; }
}

window.onNotify = function (p) {
    if (!p || typeof p !== 'object') return;
    const visible = !document.hidden;
    if (visible && viewingTarget(p)) return;          // вы и так в этом чате
    if (!visible && systemNotify(p)) return;          // приложение свёрнуто — системное уведомление
    showBanner({ title: p.title, body: p.body, kind: p.kind, key: p.tag ? 'n:' + p.tag : '', onClick: () => openTarget(p.open) });
};

// ---------- PUSH ----------
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

function urlB64ToBytes(s) {
    const pad = '='.repeat((4 - s.length % 4) % 4);
    const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function registerSW() {
    if (!window.isSecureContext || !('serviceWorker' in navigator)) return null;
    try { swReg = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; } catch (e) { swReg = null; }
    return swReg;
}

async function serverPushKey() {
    try {
        const r = await fetch(`${SERVER_URL}/api/push/key`);
        const d = await r.json();
        return d && d.ok && d.enabled ? d.key : '';
    } catch (e) { return ''; }
}

// Состояние для карточки в профиле
async function pushState() {
    if (!window.isSecureContext) return 'insecure';
    if (isIOS && !isStandalone) return 'ios-install';
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    if (!(await serverPushKey())) return 'server-off';
    const reg = swReg || await registerSW();
    const sub = reg && await reg.pushManager.getSubscription();
    return Notification.permission === 'granted' && sub ? 'on' : 'off';
}

async function postSub(sub) {
    const res = await fetch(`${SERVER_URL}/api/push/subscribe`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
        body: JSON.stringify({ subscription: sub.toJSON() })
    });
    return res.ok;
}

async function enablePush() {
    unlockAudio();
    try {
        const key = await serverPushKey();
        if (!key) { showToast('На сервере ещё не включены push-уведомления'); return; }
        const reg = swReg || await registerSW();
        if (!reg) { showToast('Браузер не поддерживает уведомления'); return; }
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') { showToast('Уведомления не разрешены в браузере'); refreshNotifyCard(); return; }
        let sub = await reg.pushManager.getSubscription();
        if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(key) });
        if (!(await postSub(sub))) { showToast('Не удалось включить уведомления. Попробуйте позже.'); return; }
        showToast('Уведомления включены');
    } catch (e) { showToast('Не удалось включить уведомления'); }
    refreshNotifyCard();
}

async function disablePush() {
    try {
        const reg = swReg || await registerSW();
        const sub = reg && await reg.pushManager.getSubscription();
        if (sub) {
            const endpoint = sub.endpoint;
            await sub.unsubscribe();
            fetch(`${SERVER_URL}/api/push/unsubscribe`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() }, body: JSON.stringify({ endpoint }) }).catch(() => {});
        }
        showToast('Уведомления выключены');
    } catch (e) { showToast('Не удалось выключить'); }
    refreshNotifyCard();
}

// После входа привязываем уже выданное разрешение к аккаунту (без новых вопросов)
async function syncPush() {
    try {
        if (!getAccount() || !window.isSecureContext || !('PushManager' in window) || Notification.permission !== 'granted') return;
        const reg = swReg || await registerSW();
        const sub = reg && await reg.pushManager.getSubscription();
        if (sub) await postSub(sub);
    } catch (e) {}
}

// ---------- КАРТОЧКА «УВЕДОМЛЕНИЯ» В ПРОФИЛЕ ----------
function notifyCardHTML() {
    if (!getAccount()) return '';
    setTimeout(refreshNotifyCard, 0);
    return `<div class="account-card notify-card" id="notifyCard">
        <div class="notify-row">
            <div class="notify-info"><b>Звук уведомлений</b><span>Короткий сигнал, когда приходит сообщение</span></div>
            <button type="button" class="switch ${soundOn() ? 'on' : ''}" id="soundSwitch" role="switch" aria-checked="${soundOn()}" aria-label="Звук уведомлений" onclick="toggleSound()"><i></i></button>
        </div>
        <div class="notify-row">
            <div class="notify-info"><b>Уведомления на телефон</b><span id="pushText">Проверяю...</span></div>
            <button type="button" class="ghost-btn" id="pushBtn" style="display:none"></button>
        </div>
        <button type="button" class="notify-test" onclick="testBanner()"><i class="fas fa-bell"></i> Показать пример уведомления</button>
        <button type="button" class="notify-test" onclick="resetTips()"><i class="fas fa-circle-question"></i> Показать подсказки снова</button>
    </div>`;
}

function toggleSound() {
    setSoundOn(!soundOn());
    unlockAudio();
    const sw = document.getElementById('soundSwitch');
    if (sw) { sw.classList.toggle('on', soundOn()); sw.setAttribute('aria-checked', String(soundOn())); }
    if (soundOn()) playChime();
}

function testBanner() {
    unlockAudio();
    setTimeout(() => showBanner({ title: 'Анна', body: 'Привет! Квартира ещё свободна на выходные?', kind: 'dm', key: 'n:test' }), 150);
}

async function refreshNotifyCard() {
    const text = document.getElementById('pushText'), btn = document.getElementById('pushBtn');
    if (!text || !btn) return;
    const st = await pushState();
    const msg = {
        insecure: 'Уведомления при закрытом приложении заработают после перехода сайта на защищённое соединение (HTTPS). Баннеры внутри приложения уже работают.',
        'ios-install': 'На iPhone: нажмите «Поделиться» → «На экран «Домой»», откройте приложение с экрана и включите уведомления здесь.',
        unsupported: 'Этот браузер не поддерживает уведомления. Баннеры внутри приложения работают.',
        denied: 'Уведомления запрещены в настройках браузера для этого сайта. Разрешите их там и вернитесь сюда.',
        'server-off': 'На сервере ещё не включены push-уведомления.',
        off: 'Получайте сообщения, даже когда приложение закрыто',
        on: 'Включены на этом устройстве'
    }[st];
    text.textContent = msg;
    btn.style.display = (st === 'on' || st === 'off') ? '' : 'none';
    btn.textContent = st === 'on' ? 'Выключить' : 'Включить';
    btn.onclick = st === 'on' ? disablePush : enablePush;
}

// ---------- ПОДКЛЮЧЕНИЕ К ПРИЛОЖЕНИЮ ----------
(function wire() {
    // нажатие на системное уведомление, когда приложение уже открыто
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (ev) => { if (ev.data && ev.data.type === 'open') openTarget(ev.data.open); });
    }
    registerSW();

    const origHello = handleServerHello;
    handleServerHello = function (info) {
        origHello.apply(this, arguments);
        if (info && info.user) syncPush();
    };
    const origLogout = doLogout;
    doLogout = function () {
        // устройство больше не должно получать уведомления этого аккаунта
        (async () => {
            try {
                const reg = swReg || await registerSW();
                const sub = reg && await reg.pushManager.getSubscription();
                if (sub) fetch(`${SERVER_URL}/api/push/unsubscribe`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
            } catch (e) {}
        })();
        return origLogout.apply(this, arguments);
    };

    // открытие по ссылке из уведомления: ?open=dm:ID
    let target = '';
    try { target = new URLSearchParams(location.search).get('open') || ''; } catch (e) {}
    if (target) {
        try { history.replaceState(null, '', location.pathname); } catch (e) {}
        setTimeout(() => openTarget(target), 700);
    }
})();
