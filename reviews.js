// ============================================
// REVIEWS.JS — профиль человека: объявления, рейтинг и отзывы
// Открывается по нажатию на карточку хозяина в объявлении и на имя/аватар в любом чате.
// Подключается после listing.js, requests.js и notify.js.
// ============================================

const starsHTML = (n) => [1, 2, 3, 4, 5].map(i => `<i${i <= Math.round(n) ? ' class="on"' : ''}>★</i>`).join('');
const rateFmt = (n) => String(n).replace('.', ',');
const isServerAd = (ad) => !!(ad && typeof ad.id === 'string' && ad.id.startsWith('l_'));

// маленький значок рейтинга для карточек
function ratingBadge(ad) {
    return ad && ad.rating ? `<span class="ad-rate"><i class="fas fa-star"></i>${rateFmt(ad.rating)}</span>` : '';
}

const reviewDate = (ts) => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const reviewApiError = (d, fallback) => showToast((d && d.message) || fallback || 'Не удалось. Попробуйте ещё раз');

let fromProfile = false;
let pv = null;   // состояние открытого профиля: { data, tab, ctxAdId, query }

// ---------- окно профиля ----------
function openUserProfile(who, ctxAdId) {
    who = who || {};
    const id = who.id && String(who.id).startsWith('u_') ? who.id : '';
    const name = who.name || '';
    if (!id && !name) return;
    const q = id ? 'id=' + encodeURIComponent(id) : 'name=' + encodeURIComponent(name);
    const h = {}; const t = getToken(); if (t) h.Authorization = 'Bearer ' + t;
    fetch(`${SERVER_URL}/api/profile?${q}`, { headers: h }).then(r => r.json()).then(d => {
        if (d && d.ok) { showUserProfile({ server: true, ...d }, ctxAdId, q); return; }
        localProfile(who, ctxAdId);
    }).catch(() => localProfile(who, ctxAdId));
}

// Демо-хозяева и те, кого нет на сервере: собираем профиль из объявлений, которые есть в приложении
function localProfile(who, ctxAdId) {
    const ads = getAllAds().filter(a => { const o = getOwner(a); return (who.id && o.id === who.id) || (who.name && o.name === who.name); });
    if (!ads.length) { showToast('Профиль недоступен'); return; }
    const o = getOwner(ads[0]);
    showUserProfile({
        server: false, isMe: false,
        user: { id: o.id, name: o.name, verified: ads.some(a => a.isVerified), since: o.since || null, avatar: o.avatar || '', about: o.about || '', color: o.color },
        listings: ads, rating: o.rating || null, count: o.reviews || 0, reviews: []
    }, ctxAdId, '');
}

function showUserProfile(data, ctxAdId, query) {
    pv = { data, tab: 'ads', ctxAdId: ctxAdId || '', query };
    let el = document.getElementById('user-screen');
    if (!el) {
        el = document.createElement('section');
        el.id = 'user-screen'; el.className = 'user-screen';
        document.body.appendChild(el);
        el.addEventListener('click', onUserScreenClick);
    }
    el.style.display = 'flex';
    paintUserProfile();
}

function closeUserProfile() {
    const el = document.getElementById('user-screen');
    if (el) el.style.display = 'none';
    pv = null;
}

function reloadUserProfile() {
    if (!pv || !pv.query) return;
    const h = {}; const t = getToken(); if (t) h.Authorization = 'Bearer ' + t;
    fetch(`${SERVER_URL}/api/profile?${pv.query}`, { headers: h }).then(r => r.json()).then(d => {
        if (d && d.ok && pv) { pv.data = { server: true, ...d }; paintUserProfile(); }
    }).catch(() => {});
}

function paintUserProfile() {
    const el = document.getElementById('user-screen');
    if (!el || !pv) return;
    const e = escapeHtml, d = pv.data, u = d.user;
    const color = u.color || (typeof dmColor === 'function' ? dmColor(u.name) : '#E8643F');
    const avatar = u.avatar ? `<img src="${e(u.avatar)}" alt="">` : e(Array.from(u.name || '?')[0] || '?');
    const rate = d.count ? `<div class="up-rate"><span class="rv-big">${rateFmt(d.rating)}</span><span class="rv-stars">${starsHTML(d.rating)}</span><span class="rv-n">${d.count} ${ratingWord(d.count)}</span></div>` : '<div class="up-rate"><span class="rv-n">Пока без отзывов</span></div>';
    const ads = d.listings || [];
    const cards = ads.length ? ads.map(a => `
        <div class="ad-card up-ad" data-ad="${e(String(a.id))}">
            <div class="ad-card-img">${typeof adImg === 'function' ? adImg(a) : ''}</div>
            <div class="ad-card-body">
                <div class="ad-card-price">${e(a.price)}${ratingBadge(a)}</div>
                <div class="ad-card-title">${e(a.title)}</div>
                <div class="ad-card-loc"><i class="fas fa-map-marker-alt"></i><span>${e(a.location || '')}</span></div>
            </div>
        </div>`).join('') : '<p class="rv-empty">Объявлений нет</p>';

    const svs = d.services || [];
    const svcHTML = svs.length ? `<div class="sv-list">${svs.map(x => (typeof serviceCardHTML === 'function' ? serviceCardHTML(x, false) : '')).join('')}</div>` : '<p class="rv-empty">Развлечений нет</p>';

    let revs;
    if (!d.server) {
        revs = d.count ? `<p class="rv-empty">Отзывы по этому хозяину пришли с прежнего сайта: оценка ${rateFmt(d.rating)}, ${d.count} ${ratingWord(d.count)}. Новые отзывы можно оставить к объявлениям с пометкой «проверено».</p>` : '<p class="rv-empty">Отзывов пока нет</p>';
    } else {
        const can = !d.isMe && ads.some(isServerAd);
        const mineBtn = can ? `<button class="rv-btn" data-a="write"><i class="fas fa-pen"></i> ${d.reviews.some(r => r.mine) ? 'Изменить мой отзыв' : 'Оставить отзыв'}</button>` : '';
        const list = d.reviews.length ? d.reviews.map(r => `
            <div class="rv-item">
                <div class="rv-top"><b>${e(r.author.name)}</b><span class="rv-stars sm">${starsHTML(r.rating)}</span><span class="rv-date">${reviewDate(r.created)}</span></div>
                ${r.listingTitle ? `<div class="rv-on">${e(r.listingTitle)}</div>` : ''}
                ${r.text ? `<p class="rv-text">${e(r.text)}</p>` : ''}
                ${r.reply ? `<div class="rv-reply"><b>Ответ хозяина</b><p>${e(r.reply.text)}</p></div>` : (d.isMe ? `<button class="rv-link" data-a="reply" data-id="${e(r.id)}">Ответить</button>` : '')}
                ${r.mine ? `<button class="rv-link bad" data-a="del" data-id="${e(r.id)}">Удалить мой отзыв</button>` : (typeof sfReportBtn === 'function' ? sfReportBtn({ kind: 'review', id: r.id, ownerId: (r.author && r.author.id) || '', ownerName: r.author.name, title: r.text, label: 'Пожаловаться на отзыв' }) : '')}
            </div>`).join('') : '<p class="rv-empty">Отзывов пока нет</p>';
        revs = mineBtn + `<div class="rv-list">${list}</div>`;
    }

    el.innerHTML = `
        <div class="up-top">
            <button class="up-back" data-a="close" aria-label="Назад"><i class="fas fa-arrow-left"></i></button>
            <div class="up-title">Профиль</div>
            ${d.server && !d.isMe && u.id && typeof SF !== 'undefined' ? '<button class="up-more" data-a="more" aria-label="Пожаловаться или заблокировать"><i class="fas fa-ellipsis"></i></button>' : ''}
        </div>
        <div class="up-scroll">
            <div class="up-head">
                <div class="owner-avatar up-avatar" style="background:${e(color)}">${avatar}</div>
                <div class="up-name">${e(u.name)}${u.verified ? ' <i class="fas fa-circle-check pf-check" aria-label="Проверенный хозяин"></i>' : ''}</div>
                ${u.verified ? '<div class="up-sub">Проверенный хозяин</div>' : ''}
                ${u.since ? `<div class="up-sub">На сайте с ${e(String(u.since))} года</div>` : ''}
                ${rate}
                ${u.about ? `<p class="up-about">${e(u.about)}</p>` : ''}
            </div>
            <div class="up-tabs">
                <button class="${pv.tab === 'ads' ? 'on' : ''}" data-a="tab" data-t="ads">Объявления · ${ads.length}</button>
                <button class="${pv.tab === 'svc' ? 'on' : ''}" data-a="tab" data-t="svc">Развлечения · ${svs.length}</button>
                <button class="${pv.tab === 'rev' ? 'on' : ''}" data-a="tab" data-t="rev">Отзывы · ${d.count}</button>
            </div>
            <div class="up-body">${pv.tab === 'ads' ? `<div class="featured-list up-list">${cards}</div>` : pv.tab === 'svc' ? svcHTML : revs}</div>
        </div>`;
}

function onUserScreenClick(ev) {
    if (!pv) return;
    const card = ev.target.closest('.up-ad');
    if (card) {
        fromProfile = true;
        const l = pv.data.server ? pv.data.listings.find(a => String(a.id) === card.dataset.ad) : null;
        if (l && typeof openAdFromCard === 'function') openAdFromCard(l); else openListing(card.dataset.ad);
        fromProfile = false;
        const ls = document.getElementById('listing-screen'); if (ls) ls.style.zIndex = '400';   // поверх профиля
        return;
    }
    const b = ev.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'close') closeUserProfile();
    else if (a === 'more') { if (typeof SF !== 'undefined') SF.userMenu(pv.data.user); }
    else if (a === 'tab') { pv.tab = b.dataset.t; paintUserProfile(); }
    else if (a === 'write') { if (!getAccount()) { showToast('Войдите в аккаунт'); return; } openReviewForm(); }
    else if (a === 'reply') openReplyForm(b.dataset.id);
    else if (a === 'del') deleteMyReview(b.dataset.id, b);
}

// ---------- формы ----------
function openReviewForm() {
    const d = pv.data;
    const ads = (d.listings || []).filter(isServerAd);
    if (!ads.length) return;
    const mine = d.reviews.find(r => r.mine);
    let adId = (mine && mine.listingId) || (ads.find(a => a.id === pv.ctxAdId) || ads[0]).id;
    let rating = mine ? mine.rating : 0;
    const e = escapeHtml;
    const pick = ads.length > 1 && !mine ? `<select class="rv-sel" id="rvAd">${ads.map(a => `<option value="${e(a.id)}"${a.id === adId ? ' selected' : ''}>${e(a.title)}</option>`).join('')}</select>` : '';
    openSheet(mine ? 'Ваш отзыв' : 'Оставить отзыв', `
        ${pick}
        <div class="rv-pick" id="rvPick">${[1, 2, 3, 4, 5].map(i => `<button type="button" data-v="${i}" aria-label="${i} из 5">★</button>`).join('')}</div>
        <textarea class="rv-ta" id="rvText" maxlength="600" rows="5" placeholder="Что понравилось, что нет (необязательно)">${e(mine ? mine.text : '')}</textarea>
        <button class="rv-send" id="rvSend">Опубликовать</button>`, (el) => {
        const paint = () => el.querySelectorAll('#rvPick button').forEach(b => b.classList.toggle('on', Number(b.dataset.v) <= rating));
        paint();
        const sel = el.querySelector('#rvAd'); if (sel) sel.addEventListener('change', () => { adId = sel.value; });
        el.querySelector('#rvPick').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b) { rating = Number(b.dataset.v); paint(); } });
        el.querySelector('#rvSend').addEventListener('click', (ev) => {
            if (!rating) { showToast('Поставьте оценку'); return; }
            const btn = ev.currentTarget; btn.disabled = true;
            fetch(`${SERVER_URL}/api/listings/${encodeURIComponent(adId)}/reviews`, { method: 'POST', headers: reqAuthHeaders(), body: JSON.stringify({ rating, text: el.querySelector('#rvText').value }) })
                .then(r => r.json()).then(r => {
                    btn.disabled = false;
                    if (!r.ok) return reviewApiError(r);
                    closeSheet(); showToast('Спасибо за отзыв!');
                    if (pv) pv.tab = 'rev';
                    reloadUserProfile(); if (typeof fetchRemoteAds === 'function') fetchRemoteAds();
                }).catch(() => { btn.disabled = false; showToast('Нет связи с сервером'); });
        });
    });
}

function openReplyForm(reviewId) {
    openSheet('Ответ на отзыв', `
        <textarea class="rv-ta" id="rvText" maxlength="400" rows="4" placeholder="Ответ увидят все. Изменить его потом нельзя"></textarea>
        <button class="rv-send" id="rvSend">Ответить</button>`, (el) => {
        el.querySelector('#rvSend').addEventListener('click', (ev) => {
            const text = el.querySelector('#rvText').value.trim();
            if (!text) { showToast('Напишите ответ'); return; }
            const btn = ev.currentTarget; btn.disabled = true;
            fetch(`${SERVER_URL}/api/reviews/${encodeURIComponent(reviewId)}/reply`, { method: 'POST', headers: reqAuthHeaders(), body: JSON.stringify({ text }) })
                .then(r => r.json()).then(d => { btn.disabled = false; if (!d.ok) return reviewApiError(d); closeSheet(); reloadUserProfile(); })
                .catch(() => { btn.disabled = false; showToast('Нет связи с сервером'); });
        });
    });
}

function deleteMyReview(reviewId, btn) {
    if (!btn.dataset.sure) { btn.dataset.sure = '1'; btn.textContent = 'Нажмите ещё раз, чтобы удалить'; setTimeout(() => { if (btn.isConnected) { delete btn.dataset.sure; btn.textContent = 'Удалить мой отзыв'; } }, 3000); return; }
    fetch(`${SERVER_URL}/api/reviews/${encodeURIComponent(reviewId)}`, { method: 'DELETE', headers: reqAuthHeaders() })
        .then(r => r.json()).then(d => { if (!d.ok) return reviewApiError(d); reloadUserProfile(); if (typeof fetchRemoteAds === 'function') fetchRemoteAds(); })
        .catch(() => showToast('Нет связи с сервером'));
}

// ---------- карточка хозяина в объявлении: нажатие открывает профиль ----------
(function patchOpenListing() {
    const orig = openListing;
    openListing = function (adId) {
        const ls0 = document.getElementById('listing-screen'); if (ls0 && !fromProfile) ls0.style.zIndex = '';
        const r = orig.apply(this, arguments);
        const ad = typeof listingAd !== 'undefined' ? listingAd : null;
        const card = document.querySelector('#listing-screen .owner-card');
        if (!ad || String(ad.id) !== String(adId) || !card || card.dataset.pv) return r;
        card.dataset.pv = '1';
        card.classList.add('owner-card-link');
        card.setAttribute('role', 'button'); card.tabIndex = 0;
        card.insertAdjacentHTML('beforeend', '<i class="fas fa-chevron-right owner-go"></i>');
        const o = getOwner(ad);
        const go = () => { if (ad.mine) { closeListing(); switchTab('profile'); return; } openUserProfile({ id: o.id || ad.ownerId, name: o.name }, ad.id); };
        card.addEventListener('click', go);
        card.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') go(); });
        return r;
    };
})();

// ---------- из любого чата: нажатие на аватар или имя собеседника ----------
document.addEventListener('click', (ev) => {
    const t = ev.target.closest('.chat-message:not(.chat-message-mine) .chat-avatar, .chat-message:not(.chat-message-mine) .chat-user-name, #group-screen .chat-header-info');
    if (!t) return;
    let name = '';
    if (t.classList.contains('chat-header-info')) {
        if (typeof currentDm === 'undefined' || !currentDm) return;
        name = currentDm.with;
    } else {
        const msg = t.closest('.chat-message');
        const n = msg && msg.querySelector('.chat-user-name');
        name = n ? n.textContent.trim() : '';
    }
    if (!name) return;
    ev.stopPropagation(); ev.preventDefault();
    openUserProfile({ name });
}, true);

// С любой карточки (запрос, движ, услуга) и из комментария к движу: тап по аватарке или имени открывает профиль человека.
document.addEventListener('click', (ev) => {
    const t = ev.target.closest('.req-item .rq-ava, .req-item .rq-who, .dv2 .rq-ava, .dv2 .rq-who, .sv-t-top .chat-avatar, .sv-t-top .sv-t-by, .dv-comment .chat-avatar, .dv-comment .dv-chead b, .sv-card .rq-ava, .sv-card .rq-who');
    if (!t) return;
    const box = t.closest('.rq-top, .sv-t-top, .dv-comment') || t;
    const nameEl = box.querySelector('.rq-who b, .sv-t-by b, .dv-chead b');
    const name = nameEl ? (nameEl.firstChild && nameEl.firstChild.nodeType === 3 ? nameEl.firstChild.textContent : nameEl.textContent).trim() : '';
    if (!name || name === 'Вы') return;                         // свою карточку открывать как обычно
    ev.stopPropagation(); ev.preventDefault();
    if (typeof closeDvizComments === 'function' && t.closest('.dv-comment')) closeDvizComments();
    openUserProfile({ name });
}, true);

// переход из уведомления «listing:ID»
function openListingById(id) {
    if (typeof findAd === 'function' && findAd(id)) { openListing(id); return; }
    fetchFullAd(id, (ok) => { if (ok) openListing(id); });
}
