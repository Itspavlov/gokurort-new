// ============================================
// FRIENDS.JS — «Мои друзья»: бонус за приглашённых.
//  • ссылка вида https://yugiyugi.ru/?ref=КОД; код запоминается, пока человек не зарегистрировался,
//    и уходит на сервер вместе с регистрацией (social.js → authRequest);
//  • когда друг зарегистрировался и опубликовал любую карточку, у вас +1 карточка в день на каждый раздел
//    (жильё, работа, поездки, развлечения). Засчитывается до 5 друзей, максимум 5 карточек в день на раздел.
// ============================================
const REF_KEY = 'yy-ref';

(function captureRef() {
    try {
        const m = location.search.match(/[?&]ref=([A-Za-z0-9]{6,10})/);
        if (m && !(typeof getToken === 'function' && getToken())) localStorage.setItem(REF_KEY, m[1].toUpperCase());
    } catch (_) {}
})();
function pendingRef() { try { return localStorage.getItem(REF_KEY) || ''; } catch (_) { return ''; } }
function clearRef() { try { localStorage.removeItem(REF_KEY); } catch (_) {} }

function friendsLink(code) {
    const base = /^https?:$/.test(location.protocol) && location.hostname !== 'localhost' ? location.origin : 'https://yugiyugi.ru';
    return base + '/?ref=' + encodeURIComponent(code);
}

function friendsApi() {
    return fetch(`${SERVER_URL}/api/invites/me`, { headers: { Authorization: 'Bearer ' + getToken() } })
        .then(r => r.json()).catch(() => null);
}

const FR_SECTIONS = [['housing', 'Жильё'], ['work', 'Работа'], ['trips', 'Поездки'], ['services', 'Развлечения']];

function friendsHTML(d) {
    const e = escapeHtml;
    const max = d.maxFriends || 5;
    const dots = Array.from({ length: max }, (_, i) => `<i class="${i < d.counted ? 'on' : ''}"></i>`).join('');
    const rows = d.friends.length
        ? d.friends.map(f => `<div class="fr-row"><span class="chat-avatar" data-avn="${avEsc(f.name)}" style="background:${dmColor(f.name)}">${avInner(f.name)}</span>
            <b>${e(f.name)}</b><small class="${f.counted ? 'ok' : ''}">${f.counted ? 'засчитан, +1 в день' : (f.done ? 'опубликовал, но больше 5 не засчитываем' : 'ждём первую карточку')}</small></div>`).join('')
        : '<p class="pf-empty">Пока никого. Отправьте ссылку другу.</p>';
    const lim = FR_SECTIONS.map(([k, t]) => { const q = d.quotas[k]; return `<div class="fr-lim"><span>${t}</span><b>${q.used} из ${q.limit}</b></div>`; }).join('');
    return `
        <p class="auth-note">Отправьте ссылку другу. Когда он зарегистрируется и опубликует любую карточку, у вас станет на одну публикацию в день больше в каждом разделе. Засчитывается до ${max} друзей, максимум ${d.cap} карточек в день на раздел.</p>
        <div class="fr-link"><input type="text" readonly id="frLink" value="${e(friendsLink(d.code))}" aria-label="Ваша ссылка"><button type="button" class="primary-btn" id="frCopy">Скопировать</button></div>
        ${navigator.share ? '<button type="button" class="ghost-btn wide-btn" id="frShare" style="margin-top:8px"><i class="fas fa-share-nodes"></i> Поделиться</button>' : ''}
        <div class="fr-prog"><span>Засчитано друзей: <b>${d.counted} из ${max}</b></span><div class="fr-dots">${dots}</div></div>
        <div class="form-h" style="margin:16px 2px 6px">Друзья</div>
        <div class="fr-list">${rows}</div>
        <div class="form-h" style="margin:16px 2px 6px">Ваш лимит на сегодня</div>
        <div class="fr-lims">${lim}</div>
        <p class="auth-note" style="margin-top:10px">Правка карточки и «Опубликовать снова» лимит не тратят.</p>`;
}

function openFriends() {
    if (!getToken() || !getAccount()) {
        openSheet('Мои друзья', `<p class="auth-note">Войдите, чтобы получить свою ссылку для друзей.</p>
            <button type="button" class="primary-btn wide-btn" id="frLogin">Войти</button>`, (el) => {
            el.querySelector('#frLogin').onclick = () => { closeSheet(); openAuthSheet(() => openFriends(), 'login'); };
        });
        return;
    }
    openSheet('Мои друзья', '<p class="auth-note">Загружаю…</p>', async (el) => {
        const d = await friendsApi();
        if (!el.isConnected) return;
        const body = el.querySelector('.sheet-panel');
        const old = body.querySelector('.auth-note');
        if (!d || !d.ok) { if (old) old.textContent = (d && d.message) || 'Не удалось загрузить. Попробуйте позже.'; return; }
        if (old) old.remove();
        body.insertAdjacentHTML('beforeend', `<div class="fr-body">${friendsHTML(d)}</div>`);
        const link = d.code ? friendsLink(d.code) : '';
        el.querySelector('#frCopy').onclick = () => {
            const done = () => showToast('Ссылка скопирована!');
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done).catch(() => { el.querySelector('#frLink').select(); showToast('Выделите и скопируйте ссылку'); });
            else { el.querySelector('#frLink').select(); showToast('Выделите и скопируйте ссылку'); }
        };
        const sh = el.querySelector('#frShare');
        if (sh) sh.onclick = () => navigator.share({ title: 'YuGi YuGi', text: 'Жильё, работа, поездки и развлечения у моря. Заходи!', url: link }).catch(() => {});
        el.querySelector('#frLink').addEventListener('focus', (ev) => ev.target.select());
        const badge = document.getElementById('rowFriendsCount');
        if (badge) { badge.textContent = d.counted + '/' + (d.maxFriends || 5); badge.hidden = false; }
    });
}

// счётчик «2/5» на плашке в профиле
function refreshFriendsBadge() {
    const badge = document.getElementById('rowFriendsCount');
    if (!badge || !getToken() || !getAccount()) return;
    friendsApi().then(d => { if (d && d.ok && badge.isConnected) { badge.textContent = d.counted + '/' + (d.maxFriends || 5); badge.hidden = false; } });
}
if (typeof renderProfile === 'function') {
    const _renderProfileFriends = renderProfile;
    renderProfile = function () { const r = _renderProfileFriends.apply(this, arguments); setTimeout(refreshFriendsBadge, 0); return r; };
}
