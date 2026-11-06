// ============================================
// INBOX.JS — колокольчик в углу экрана и центр уведомлений.
// Уведомления хранятся на сервере: на всех устройствах видно одно и то же.
// ============================================
let inboxUnread = 0;
let inboxTimer = 0;
const INBOX_ICONS = { dm: 'fa-comment', group: 'fa-user-group', reply: 'fa-reply', invite: 'fa-user-plus', verify: 'fa-shield-halved', listing: 'fa-house-circle-xmark', offer: 'fa-house-circle-check', match: 'fa-magnifying-glass-location', request: 'fa-clock', review: 'fa-star' };
const INBOX_GROUPS = [['messages', 'Сообщения', 'Личные, групповые и ответы'], ['offers', 'Предложения жилья', 'Хозяева предложили вам жильё'], ['matches', 'Подходящее жильё', 'Появилось жильё под ваш запрос'], ['requests', 'Запросы', 'Срок запроса закончился'], ['reviews', 'Отзывы', 'Новые отзывы и ответы хозяев']];

const inboxHeaders = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() });
const inboxApi = (path, body) => fetch(SERVER_URL + path, body === undefined ? { headers: inboxHeaders() } : { method: 'POST', headers: inboxHeaders(), body: JSON.stringify(body) }).then(r => r.json());

function paintBell() {
    const b = document.getElementById('bellBadge');
    if (!b) return;
    b.hidden = inboxUnread <= 0;
    b.textContent = inboxUnread > 99 ? '99+' : String(inboxUnread);
    const btn = document.getElementById('bellBtn');
    if (btn) btn.setAttribute('aria-label', inboxUnread > 0 ? 'Уведомления: ' + inboxUnread + ' новых' : 'Уведомления');
    try { if (navigator.setAppBadge) { inboxUnread > 0 ? navigator.setAppBadge(inboxUnread) : navigator.clearAppBadge(); } } catch (e) {}
}

function setUnread(n) { inboxUnread = Math.max(0, Number(n) || 0); paintBell(); }

function refreshUnread() {
    if (!getToken()) { setUnread(0); return Promise.resolve(); }
    return inboxApi('/api/notifications').then(d => { if (d && d.ok) setUnread(d.unread); }).catch(() => {});
}

function markInboxRead(sel) {
    if (!getToken()) return;
    inboxApi('/api/notifications/read', sel).then(d => { if (d && d.ok) setUnread(d.unread); }).catch(() => {});
}

// ---------- время ----------
function inboxAgo(ts) {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return 'только что';
    if (s < 3600) return Math.floor(s / 60) + ' мин назад';
    if (s < 86400) return Math.floor(s / 3600) + ' ч назад';
    return Math.floor(s / 86400) + ' дн назад';
}

// ---------- окно центра ----------
function openInbox() {
    loginRequired(() => {
        openSheet('Уведомления', '<div id="inboxBox"><p class="opt-empty">Загружаю…</p></div>', (el) => {
            const box = el.querySelector('#inboxBox');
            const draw = (d) => {
                const e = escapeHtml;
                const head = `<div class="inbox-top"><button type="button" data-a="all" ${d.unread ? '' : 'disabled'}>Прочитать все</button><button type="button" data-a="prefs"><i class="fas fa-sliders"></i> Настройки</button></div>`;
                const rows = d.items.length ? d.items.map(it => `<button type="button" class="inbox-item ${it.read ? '' : 'new'}" data-id="${e(it.id)}" data-open="${e(it.open || '')}">
                    <span class="inbox-ic kind-${e(it.kind)}"><i class="fas ${INBOX_ICONS[it.kind] || 'fa-bell'}"></i></span>
                    <span class="inbox-tx"><b>${e(it.title)}${it.count > 1 ? ' <em>×' + it.count + '</em>' : ''}</b><span>${e(it.body)}</span><small>${inboxAgo(it.time)}</small></span>${it.read ? '' : '<i class="inbox-dot"></i>'}</button>`).join('')
                    : '<div class="req-empty"><i class="fas fa-bell"></i><b>Пока ничего нового</b><span>Здесь появятся сообщения, предложения жилья и новости по вашим запросам.</span></div>';
                box.innerHTML = head + rows;
            };
            const load = () => inboxApi('/api/notifications').then(d => { if (!d.ok) { box.innerHTML = '<p class="opt-empty">Не удалось загрузить</p>'; return; } setUnread(d.unread); box._d = d; draw(d); }).catch(() => { box.innerHTML = '<p class="opt-empty">Нет связи с сервером</p>'; });
            load();
            el.addEventListener('click', (ev) => {
                const item = ev.target.closest('.inbox-item');
                if (item) {
                    markInboxRead({ ids: [item.dataset.id] });
                    closeSheet();
                    if (typeof openTarget === 'function') openTarget(item.dataset.open);
                    return;
                }
                const b = ev.target.closest('button[data-a]'); if (!b) return;
                if (b.dataset.a === 'all') inboxApi('/api/notifications/read', { all: true }).then(d => { if (d.ok) { setUnread(d.unread); load(); } });
                else if (b.dataset.a === 'prefs') openInboxPrefs(box._d && box._d.prefs);
            });
        });
    });
}

function openInboxPrefs(prefs) {
    prefs = prefs || {};
    openSheet('Настройки уведомлений', `${typeof notifyCardHTML === 'function' ? notifyCardHTML() : ''}<div class="sheet-sub">Какие уведомления получать</div><div class="pref-list">${INBOX_GROUPS.map(([k, t, s]) => `
        <label class="pref-row"><span><b>${t}</b><small>${s}</small></span><input type="checkbox" data-g="${k}" ${prefs[k] === false ? '' : 'checked'}><i class="pref-sw"></i></label>`).join('')}</div>
        <p class="profile-foot" style="margin-top:12px">Важные служебные сообщения (проверка хозяина, решения модератора) приходят всегда.</p>
        <button class="primary-btn wide-btn" id="prefBack" style="margin-top:12px">Готово</button>`, (el) => {
        el.addEventListener('change', (ev) => {
            const c = ev.target.closest('input[data-g]'); if (!c) return;
            inboxApi('/api/notifications/prefs', { group: c.dataset.g, on: c.checked }).then(d => { if (!d.ok) { c.checked = !c.checked; showToast(d.message || 'Не удалось сохранить'); } }).catch(() => { c.checked = !c.checked; showToast('Нет связи с сервером'); });
        });
        el.querySelector('#prefBack').onclick = () => openInbox();
    });
}

// ---------- события ----------
const _onNotifyInbox = window.onNotify;
window.onNotify = function (p) {
    if (p && typeof p.unread === 'number') setUnread(p.unread); else refreshUnread();
    // если вы прямо сейчас в этом чате, уведомление сразу считается прочитанным
    try { if (p && p.open && !document.hidden && typeof viewingTarget === 'function' && viewingTarget(p)) markInboxRead({ open: p.open }); } catch (e) {}
    return _onNotifyInbox.apply(this, arguments);
};

// открытие чата помечает его уведомления прочитанными
const _oDm = openDmChat; openDmChat = function (conv) { const r = _oDm.apply(this, arguments); if (conv && conv.id && inboxUnread) markInboxRead({ open: 'dm:' + conv.id }); return r; };
const _oGc = openGroupChat; openGroupChat = function (g) { const r = _oGc.apply(this, arguments); if (g && g.id && inboxUnread) markInboxRead({ open: 'group:' + g.id }); return r; };
const _oGr = openGroup; openGroup = function (id) { const r = _oGr.apply(this, arguments); if (typeof id === 'string' && inboxUnread) markInboxRead({ open: 'room:' + id }); return r; };

document.addEventListener('DOMContentLoaded', () => {
    const b = document.getElementById('bellBtn');
    if (b) b.addEventListener('click', openInbox);
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshUnread(); });
setTimeout(refreshUnread, 1200);
setInterval(() => { if (!document.hidden) refreshUnread(); }, 60000);
window.addEventListener('storage', (ev) => { if (ev.key === 'tell-token') refreshUnread(); });
