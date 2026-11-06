// ============================================
// REVIEWS.JS — отзывы и рейтинг на экране объявления
// Подключается после listing.js, requests.js и notify.js.
// ============================================

const starsHTML = (n) => [1, 2, 3, 4, 5].map(i => `<i${i <= Math.round(n) ? ' class="on"' : ''}>★</i>`).join('');
const rateFmt = (n) => String(n).replace('.', ',');
const isServerAd = (ad) => !!(ad && typeof ad.id === 'string' && ad.id.startsWith('l_'));

// маленький значок рейтинга для карточек
function ratingBadge(ad) {
    return ad && ad.rating ? `<span class="ad-rate"><i class="fas fa-star"></i>${rateFmt(ad.rating)}</span>` : '';
}

let reviewsState = null;

function reviewDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function paintReviews(adId) {
    const box = document.getElementById('reviewsBox');
    if (!box || !reviewsState) return;
    const e = escapeHtml, d = reviewsState;
    const head = `<div class="rv-head"><h2 class="l-h">Отзывы</h2>${d.count ? `<div class="rv-sum"><span class="rv-big">${rateFmt(d.rating)}</span><span class="rv-stars">${starsHTML(d.rating)}</span><span class="rv-n">${d.count} ${ratingWord(d.count)}</span></div>` : ''}</div>`;
    let action = '';
    if (d.isOwner) action = '';
    else if (d.status.mine) action = `<button class="rv-btn" data-a="write">Изменить мой отзыв</button>`;
    else if (d.status.can) action = `<button class="rv-btn" data-a="write"><i class="fas fa-pen"></i> Оставить отзыв</button>`;
    else if (d.status.reason === 'AUTH_REQUIRED') action = `<div class="rv-hint">Войдите в аккаунт, чтобы оставить отзыв</div>`;
    else if (d.status.reason === 'NEED_CONTACT') action = `<div class="rv-hint">Отзыв можно оставить после того, как вы напишете хозяину</div>`;
    const list = d.items.length ? d.items.map(r => `
        <div class="rv-item" data-id="${e(r.id)}">
            <div class="rv-top"><b>${e(r.author.name)}</b><span class="rv-stars sm">${starsHTML(r.rating)}</span><span class="rv-date">${reviewDate(r.created)}</span></div>
            ${r.text ? `<p class="rv-text">${e(r.text)}</p>` : ''}
            ${r.reply ? `<div class="rv-reply"><b>Ответ хозяина</b><p>${e(r.reply.text)}</p></div>`
                : (d.isOwner ? `<button class="rv-link" data-a="reply" data-id="${e(r.id)}">Ответить</button>` : '')}
            ${r.mine ? `<button class="rv-link bad" data-a="del" data-id="${e(r.id)}">Удалить мой отзыв</button>` : ''}
        </div>`).join('') : '<p class="rv-empty">Отзывов пока нет</p>';
    box.innerHTML = head + action + `<div class="rv-list">${list}</div>`;
}

function loadReviews(adId) {
    const h = {}; const t = getToken(); if (t) h.Authorization = 'Bearer ' + t;
    return fetch(`${SERVER_URL}/api/listings/${encodeURIComponent(adId)}/reviews`, { headers: h }).then(r => r.json()).then(d => {
        if (!d || !d.ok) return;
        reviewsState = d;
        if (listingAd && listingAd.id === adId) paintReviews(adId);
    }).catch(() => {});
}

function reviewApiError(d, fallback) { showToast((d && d.message) || fallback || 'Не удалось. Попробуйте ещё раз'); }

function openReviewForm(adId) {
    const mine = reviewsState && reviewsState.status && reviewsState.status.mine;
    let rating = mine ? mine.rating : 0;
    openSheet(mine ? 'Ваш отзыв' : 'Оставить отзыв', `
        <div class="rv-pick" id="rvPick">${[1, 2, 3, 4, 5].map(i => `<button type="button" data-v="${i}" aria-label="${i} из 5">★</button>`).join('')}</div>
        <textarea class="rv-ta" id="rvText" maxlength="600" rows="5" placeholder="Что понравилось, что нет (необязательно)">${escapeHtml(mine ? mine.text : '')}</textarea>
        <button class="rv-send" id="rvSend">Опубликовать</button>`, (el) => {
        const paint = () => el.querySelectorAll('#rvPick button').forEach(b => b.classList.toggle('on', Number(b.dataset.v) <= rating));
        paint();
        el.querySelector('#rvPick').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b) { rating = Number(b.dataset.v); paint(); } });
        el.querySelector('#rvSend').addEventListener('click', (ev) => {
            if (!rating) { showToast('Поставьте оценку'); return; }
            const btn = ev.currentTarget; btn.disabled = true;
            fetch(`${SERVER_URL}/api/listings/${encodeURIComponent(adId)}/reviews`, { method: 'POST', headers: reqAuthHeaders(), body: JSON.stringify({ rating, text: el.querySelector('#rvText').value }) })
                .then(r => r.json()).then(d => {
                    btn.disabled = false;
                    if (!d.ok) return reviewApiError(d);
                    closeSheet(); showToast('Спасибо за отзыв!');
                    loadReviews(adId); if (typeof fetchRemoteAds === 'function') fetchRemoteAds();
                }).catch(() => { btn.disabled = false; showToast('Нет связи с сервером'); });
        });
    });
}

function openReplyForm(adId, reviewId) {
    openSheet('Ответ на отзыв', `
        <textarea class="rv-ta" id="rvText" maxlength="400" rows="4" placeholder="Ответ увидят все. Изменить его потом нельзя"></textarea>
        <button class="rv-send" id="rvSend">Ответить</button>`, (el) => {
        el.querySelector('#rvSend').addEventListener('click', (ev) => {
            const text = el.querySelector('#rvText').value.trim();
            if (!text) { showToast('Напишите ответ'); return; }
            const btn = ev.currentTarget; btn.disabled = true;
            fetch(`${SERVER_URL}/api/reviews/${encodeURIComponent(reviewId)}/reply`, { method: 'POST', headers: reqAuthHeaders(), body: JSON.stringify({ text }) })
                .then(r => r.json()).then(d => { btn.disabled = false; if (!d.ok) return reviewApiError(d); closeSheet(); loadReviews(adId); })
                .catch(() => { btn.disabled = false; showToast('Нет связи с сервером'); });
        });
    });
}

function deleteMyReview(adId, reviewId, btn) {
    if (!btn.dataset.sure) { btn.dataset.sure = '1'; btn.textContent = 'Нажмите ещё раз, чтобы удалить'; setTimeout(() => { if (btn.isConnected) { delete btn.dataset.sure; btn.textContent = 'Удалить мой отзыв'; } }, 3000); return; }
    fetch(`${SERVER_URL}/api/reviews/${encodeURIComponent(reviewId)}`, { method: 'DELETE', headers: reqAuthHeaders() })
        .then(r => r.json()).then(d => { if (!d.ok) return reviewApiError(d); loadReviews(adId); if (typeof fetchRemoteAds === 'function') fetchRemoteAds(); })
        .catch(() => showToast('Нет связи с сервером'));
}

// блок отзывов на экране объявления
(function patchOpenListing() {
    const orig = openListing;
    openListing = function (adId) {
        const r = orig.apply(this, arguments);
        const ad = typeof listingAd !== 'undefined' ? listingAd : null;
        if (!ad || ad.id !== adId || !isServerAd(ad)) return r;
        const body = document.querySelector('#listing-screen .listing-body');
        if (!body || document.getElementById('reviewsBox')) return r;
        const sec = document.createElement('section');
        sec.className = 'l-section reviews'; sec.id = 'reviewsBox';
        sec.innerHTML = '<h2 class="l-h">Отзывы</h2><p class="rv-empty">Загрузка…</p>';
        const others = [...body.querySelectorAll('.l-section')].find(s => /Ещё у этого хозяина/.test(s.textContent));
        body.insertBefore(sec, others || null);
        reviewsState = null;
        sec.addEventListener('click', (ev) => {
            const b = ev.target.closest('[data-a]'); if (!b) return;
            if (b.dataset.a === 'write') {
                if (!getAccount()) { showToast('Войдите в аккаунт'); return; }
                openReviewForm(adId);
            } else if (b.dataset.a === 'reply') openReplyForm(adId, b.dataset.id);
            else if (b.dataset.a === 'del') deleteMyReview(adId, b.dataset.id, b);
        });
        loadReviews(adId);
        return r;
    };
})();

// переход из уведомления «listing:ID»
function openListingById(id) {
    if (typeof findAd === 'function' && findAd(id)) { openListing(id); return; }
    fetchFullAd(id, (ok) => { if (ok) openListing(id); });
}
