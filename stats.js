// ============================================
// STATS.JS — кабинет хозяина: просмотры, избранное, диалоги, отзывы
// Строка «Статистика» в профиле → окно со сводкой и по каждому объявлению.
// Подключается после profile.js и reviews.js.
// ============================================

(function () {
    const DAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const num = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

    // последние 7 дней: подписи по дням недели, от старых к новым
    function dayLabels() {
        const out = [];
        for (let i = 6; i >= 0; i--) out.push(DAYS[new Date(Date.now() - i * 86400000).getDay()]);
        return out;
    }

    function barsHTML(series, big) {
        const max = Math.max(1, ...series), lab = dayLabels();
        return `<div class="st-bars${big ? ' big' : ''}">${series.map((v, i) => `
            <div class="st-col"><span class="st-val">${v || ''}</span><div class="st-bar" style="height:${Math.max(4, Math.round(v / max * 100))}%"></div>${big ? `<span class="st-day">${lab[i]}</span>` : ''}</div>`).join('')}</div>`;
    }

    function paintStats(d) {
        const e = escapeHtml, t = d.totals;
        const tiles = [
            ['fa-eye', t.views7, 'просмотров за неделю'],
            ['fa-heart', t.favorites, 'в избранном'],
            ['fa-comments', t.chats, 'диалогов' + (t.chatsWeek ? ` (+${t.chatsWeek} за неделю)` : '')],
            ['fa-handshake', t.offers, 'откликов на запросы']
        ].map(([i, n, l]) => `<div class="st-tile"><i class="fas ${i}"></i><b>${num(n)}</b><span>${l}</span></div>`).join('');
        const rows = d.listings.length ? d.listings.map(l => `
            <button type="button" class="st-ad" data-id="${e(l.id)}">
                <div class="st-ad-top"><b>${e(l.title)}</b><span>${e(l.price || '')}</span></div>
                <div class="st-ad-grid">
                    <div><b>${num(l.views7)}</b><span>за неделю</span></div>
                    <div><b>${num(l.views)}</b><span>всего</span></div>
                    <div><b>${num(l.favorites)}</b><span>в избранном</span></div>
                    <div><b>${l.rating ? String(l.rating).replace('.', ',') + ' ★' : '—'}</b><span>${l.reviews} ${typeof ratingWord === 'function' ? ratingWord(l.reviews) : 'отз.'}</span></div>
                </div>
                ${barsHTML(l.series, false)}
            </button>`).join('') : '<p class="rv-empty">У вас пока нет объявлений. Добавьте первое в профиле.</p>';
        return `
            <div class="st-tiles">${tiles}</div>
            <div class="st-chart"><div class="st-h">Просмотры по дням</div>${barsHTML(t.series, true)}</div>
            <div class="st-h">Ваши объявления</div>
            <div class="st-list">${rows}</div>
            <p class="st-note">Просмотр считается один раз в сутки на человека. Свои просмотры не учитываются. Диалоги показывают, сколько людей вам написали.</p>`;
    }

    function openStats() {
        if (!getToken()) { showToast('Войдите в аккаунт'); return; }
        openSheet('Статистика', '<div id="stBody"><p class="rv-empty">Загрузка…</p></div>', (el) => {
            const body = el.querySelector('#stBody');
            fetch(`${SERVER_URL}/api/my/stats`, { headers: reqAuthHeaders() }).then(r => r.json()).then(d => {
                if (!d.ok) { body.innerHTML = `<p class="rv-empty">${escapeHtml(d.message || 'Не удалось загрузить')}</p>`; return; }
                body.innerHTML = paintStats(d);
                body.addEventListener('click', (ev) => {
                    const b = ev.target.closest('.st-ad'); if (!b) return;
                    closeSheet(); openListing(b.dataset.id);
                });
            }).catch(() => { body.innerHTML = '<p class="rv-empty">Нет связи с сервером</p>'; });
        });
    }
    window.openStats = openStats;

    // показываем строку в профиле тем, кто вошёл
    const origRender = renderProfile;
    renderProfile = function () {
        const r = origRender.apply(this, arguments);
        const row = document.getElementById('rowStats');
        if (row) row.hidden = !getToken();
        return r;
    };
})();
