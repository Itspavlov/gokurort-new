// ============================================
// SEARCHSUB.JS — подписки на сохранённый поиск жилья
// «Следить за этим поиском» в фильтрах → когда появится подходящее объявление,
// придёт уведомление. Список подписок: в фильтрах и в профиле.
// Подключается после filters.js и profile.js.
// ============================================

function searchHeaders() { return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() }; }

function searchSummary(f) {
    const p = [];
    const cat = HOUSING_CATS.find(c => c.id === f.cat);
    if (cat && cat.id !== 'all') p.push(cat.one);
    if (f.q) p.push(f.q);
    if (f.min !== '' && f.max !== '') p.push(`${f.min}–${f.max} ₽`); else if (f.max !== '') p.push(`до ${f.max} ₽`); else if (f.min !== '') p.push(`от ${f.min} ₽`);
    if (f.from) p.push(f.to ? `${f.from.slice(8)}.${f.from.slice(5, 7)}–${f.to.slice(8)}.${f.to.slice(5, 7)}` : `с ${f.from.slice(8)}.${f.from.slice(5, 7)}`);
    if (f.guests) p.push(`${f.guests}+ гост.`);
    if (f.sea) { const s = FSEA.find(x => x[0] === f.sea); if (s) p.push('море ' + s[1]); }
    (f.amen || []).forEach(a => p.push(a));
    if (f.verified) p.push('проверенные');
    return p;
}

function watchSearch(f) {
    if (typeof activeFilterCount === 'function' && !activeFilterCount(f)) { showToast('Задайте хотя бы один фильтр'); return; }
    ensureLogin(() => {
        const cat = typeof currentRoom === 'string' ? housingCatByRoom(currentRoom).id : 'all';
        const filter = { q: f.q, min: f.min, max: f.max, from: f.from, to: f.to, guests: f.guests, sea: f.sea, amen: f.amen, verified: f.verified, cat: cat === 'all' ? '' : cat };
        const name = searchSummary(filter).slice(0, 3).join(', ') || 'Мой поиск';
        fetch(`${SERVER_URL}/api/searches`, { method: 'POST', headers: searchHeaders(), body: JSON.stringify({ name, filter }) })
            .then(r => r.json()).then(d => {
                if (!d.ok) { showToast(d.message || 'Не удалось сохранить'); return; }
                showToast('Готово! Сообщим, когда появится подходящее жильё');
                if (document.getElementById('subsBox')) paintSubs(d.searches);
            }).catch(() => showToast('Нет связи с сервером'));
    });
}

function paintSubs(list) {
    const box = document.getElementById('subsBox'); if (!box) return;
    box._list = list;
    const e = escapeHtml;
    box.innerHTML = list.length ? list.map(s => `
        <div class="sub-row" data-id="${e(s.id)}">
            <div class="sub-main"><b>${e(s.name)}</b><span>${e(searchSummary(s.filter).join(' · '))}</span></div>
            <button type="button" class="sub-show" data-a="show">Показать</button>
            <button type="button" class="sub-del" data-a="del" aria-label="Удалить подписку"><i class="fas fa-trash"></i></button>
        </div>`).join('') : '<p class="rv-empty">Подписок пока нет. Откройте фильтры в чате «Жильё», задайте условия и нажмите «Следить за этим поиском».</p>';
}

function openSearchSubs() {
    ensureLogin(() => {
        openSheet('Подписки на поиск', '<div id="subsBox"><p class="rv-empty">Загрузка…</p></div><p class="st-note">Уведомление приходит о новых объявлениях, которые подходят под условия. Не больше одного уведомления на объявление.</p>', (el) => {
            fetch(`${SERVER_URL}/api/searches`, { headers: searchHeaders() }).then(r => r.json()).then(d => {
                if (!d.ok) { el.querySelector('#subsBox').innerHTML = `<p class="rv-empty">${escapeHtml(d.message || 'Не удалось загрузить')}</p>`; return; }
                paintSubs(d.searches);
            }).catch(() => { el.querySelector('#subsBox').innerHTML = '<p class="rv-empty">Нет связи с сервером</p>'; });
            el.querySelector('#subsBox').addEventListener('click', (ev) => {
                const b = ev.target.closest('[data-a]'); if (!b) return;
                const row = b.closest('.sub-row'), box = row.parentElement;
                const s = (box._list || []).find(x => x.id === row.dataset.id); if (!s) return;
                if (b.dataset.a === 'del') {
                    if (!b.dataset.sure) { b.dataset.sure = '1'; b.classList.add('sure'); b.innerHTML = 'Удалить?'; setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.classList.remove('sure'); b.innerHTML = '<i class="fas fa-trash"></i>'; } }, 3000); return; }
                    fetch(`${SERVER_URL}/api/searches/${encodeURIComponent(s.id)}`, { method: 'DELETE', headers: searchHeaders() }).then(r => r.json())
                        .then(d => { if (d.ok) paintSubs(d.searches); else showToast(d.message || 'Не удалось удалить'); }).catch(() => showToast('Нет связи с сервером'));
                } else {
                    adFilter = { ...FILTER_DEFAULT, ...s.filter, amen: [...(s.filter.amen || [])] }; saveAdFilter();
                    closeSheet();
                    const room = s.filter.cat ? HOUSING_CATS.find(c => c.id === s.filter.cat).room : 'housing';
                    if (typeof closeUserProfile === 'function') closeUserProfile();
                    openGroup(room);
                }
            });
        });
    });
}
