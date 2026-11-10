// ============================================
// AVATARS.JS — аватарки людей везде, где виден человек:
// списки диалогов, сообщения, комментарии, карточки. Если у человека
// есть готовая аватарка, показываем её, иначе букву на цветном фоне.
// Картинки подтягиваем с сервера пачкой по именам и запоминаем на устройстве.
// ============================================
const AV_KEY = 'yy-avmap-v1';
const AV_HIT_TTL = 6 * 3600 * 1000, AV_MISS_TTL = 20 * 60 * 1000;
let avMap = {};
try { avMap = JSON.parse(localStorage.getItem(AV_KEY) || '{}') || {}; } catch (_) { avMap = {}; }
const avQueue = new Set();
let avTimer = 0;

const avKey = (n) => String(n || '').normalize('NFC').toLowerCase().replace(/[\s_.'\-]+/g, '');
const avEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const avLetter = (n) => avEsc((Array.from(String(n || '?').trim())[0] || '?').toUpperCase());

function avOwnSrc(name) {
    try {
        const acc = typeof getAccount === 'function' ? getAccount() : null;
        if (!acc || avKey(acc.name) !== avKey(name)) return '';
        const p = getProfile();
        return p.avatar || avatarUrl(p.avatarId) || '';
    } catch (_) { return ''; }
}
function avSrc(name) {
    const own = avOwnSrc(name);
    if (own) return own;
    const e = avMap[avKey(name)];
    return e && e.id ? avatarUrl(e.id) : '';
}
function avWant(name) {
    const k = avKey(name);
    if (!k) return;
    const e = avMap[k];
    if (e && Date.now() - e.t < (e.id ? AV_HIT_TTL : AV_MISS_TTL)) return;
    avQueue.add(String(name));
    clearTimeout(avTimer);
    avTimer = setTimeout(avFetch, 60);
}
function avApply(root) {
    (root || document).querySelectorAll('[data-avn]').forEach((el) => {
        if (el.querySelector('img')) return;
        const src = avSrc(el.dataset.avn);
        if (src) el.innerHTML = '<img src="' + avEsc(src) + '" alt="" decoding="async">';
    });
}
function avFetch() {
    const names = [...avQueue].slice(0, 40);
    names.forEach((n) => avQueue.delete(n));
    if (!names.length) return;
    fetch(SERVER_URL + '/api/avatars?names=' + encodeURIComponent(names.join(',')))
        .then((r) => r.json()).then((d) => {
            if (!d || !d.ok) return;
            const byKey = {};
            Object.keys(d.avatars || {}).forEach((n) => { byKey[avKey(n)] = d.avatars[n]; });
            const t = Date.now();
            names.forEach((n) => { avMap[avKey(n)] = { id: byKey[avKey(n)] || '', t }; });
            try { localStorage.setItem(AV_KEY, JSON.stringify(avMap)); } catch (_) {}
            avApply();
        }).catch(() => {});
    if (avQueue.size) avTimer = setTimeout(avFetch, 120);
}
// содержимое кружка: картинка или буква
function avInner(name) {
    const src = avSrc(name);
    if (src) return '<img src="' + avEsc(src) + '" alt="" decoding="async">';
    avWant(name);
    return avLetter(name);
}
// готовый кружок целиком
function avatarHTML(name, cls, extraStyle) {
    const n = String(name || '?');
    return '<span class="' + (cls || 'chat-avatar') + '" data-avn="' + avEsc(n) + '" style="background:' + (typeof dmColor === 'function' ? dmColor(n) : '#E8643F') + ';' + (extraStyle || '') + '">' + avInner(n) + '</span>';
}
// своя аватарка поменялась: перерисовываем уже стоящие на экране кружки
window.addEventListener('storage', () => avApply());
