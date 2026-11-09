// ============================================
// YuGi YuGi — «Курортный движ»
//  • лента карточек «найди компанию»: джипы, морская прогулка, волейбол, просто потусить;
//  • «Создать движ»: описание, время, место, до 5 фото; можно закрепить карточку из «Развлечений»;
//  • под карточкой — комментарии и кнопка «Я с вами».
// Работает поверх services.js (сжатие фото, api-хелперы).
// ============================================
const DV_PHOTOS = 5;
const DV_IDEAS = ['Джипы в горы', 'Морская прогулка', 'Волейбол на пляже', 'Просто потусить', 'Шашлыки у моря', 'Вечер на набережной'];
let dvFeed = [];
let dvOpenId = null;       // открытая в шторке карточка

const dvEsc = (s) => escapeHtml(String(s == null ? '' : s));
const dvPrice = (a) => a && a.price ? Number(a.price).toLocaleString('ru-RU') + ' ₽' + (a.unit ? ' ' + a.unit : '') : '';
const dvAuthed = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() });
const dvGet = (path) => svApi(path, getToken() ? { headers: { Authorization: 'Bearer ' + getToken() } } : undefined);

// «сб, 12 июня · 10:00»
function dvWhen(w) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(w || '');
    if (!m) return '';
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' }) + ' · ' + m[4] + ':' + m[5];
}
const dvPeople = (e) => e.max ? `${e.joins} из ${e.max}` : (e.joins ? String(e.joins) : '');

// ---------- экран ----------
function openDvizScreen() {
    if (typeof socket !== 'undefined' && socket && currentRoom) socket.emit('leave-room', currentRoom);
    currentRoom = null; currentDm = null; currentGroup = null;
    tabContents.forEach(section => section.style.display = 'none');
    let screen = document.getElementById('group-screen');
    if (!screen) {
        screen = document.createElement('section');
        screen.id = 'group-screen'; screen.className = 'group-screen';
        document.getElementById('appMain').appendChild(screen);
    }
    screen.innerHTML = `
        <div class="chat-header room-head">
            <button class="chat-back-btn" onclick="closeGroup()" aria-label="Назад"><i class="fas fa-arrow-left"></i></button>
            <div class="chat-header-info">
                <div class="chat-header-title">Курортный движ</div>
                <div class="chat-header-subtitle">найди компанию на отдых</div>
            </div>
        </div>
        <div class="dv-feed" id="dvFeed"><div class="dv-empty"><i class="fas fa-spinner fa-spin"></i><b>Загружаю…</b></div></div>
        <div class="cards-dock"><div class="dock-actions"><button type="button" class="dock-btn main" id="dvCreate"><i class="fas fa-plus"></i> Создать движ</button></div></div>`;
    screen.style.display = 'flex';
    screen.querySelector('#dvCreate').onclick = () => openDvizForm();
    screen.querySelector('#dvFeed').addEventListener('click', onFeedClick);
    loadDviz();
}

const _openGroupDv = openGroup;
openGroup = function (id) { return id === 'dating' ? openDvizScreen() : _openGroupDv.apply(this, arguments); };

function loadDviz() {
    dvGet('/api/dviz').then(({ d }) => {
        if (d && d.ok) dvFeed = d.events || [];
        paintDviz();
    }).catch(() => { const f = document.getElementById('dvFeed'); if (f && !dvFeed.length) f.innerHTML = '<div class="dv-empty"><i class="fas fa-wifi"></i><b>Нет связи с сервером</b></div>'; });
}

function dvCardHTML(e) {
    const acc = typeof getAccount === 'function' ? getAccount() : null;
    const mine = !!(acc && acc.id === e.ownerId);
    const people = dvPeople(e);
    return `<article class="dv-card" data-id="${dvEsc(e.id)}">
        <div class="dv-head"><div class="chat-avatar" style="background:${dmColor(e.ownerName)}">${dvEsc(Array.from(e.ownerName)[0] || '?')}</div>
            <div class="dv-who"><b>${dvEsc(mine ? 'Вы' : e.ownerName)}${e.verified ? ' <i class="fas fa-circle-check pf-check"></i>' : ''}</b><small>${fmtAgo(e.created)}</small></div></div>
        ${e.thumb ? `<div class="dv-photo"><img src="${dvEsc(e.thumb)}" alt="" loading="lazy">${e.photoCount > 1 ? `<em><i class="fas fa-images"></i> ${e.photoCount}</em>` : ''}</div>` : ''}
        <h3 class="dv-title">${dvEsc(e.title)}</h3>
        ${e.text ? `<p class="dv-text">${dvEsc(e.text)}</p>` : ''}
        <div class="dv-meta">
            ${e.when ? `<span><i class="fas fa-clock"></i>${dvEsc(dvWhen(e.when))}</span>` : ''}
            ${e.place ? `<span><i class="fas fa-location-dot"></i>${dvEsc(e.place)}</span>` : ''}
            ${people ? `<span><i class="fas fa-user-group"></i>${dvEsc(people)}</span>` : ''}
        </div>
        ${e.attached ? dvAttachHTML(e.attached) : ''}
        <div class="dv-foot">
            <button type="button" class="dv-btn" data-dv="open"><i class="fas fa-comment"></i> ${e.comments || 'Обсудить'}</button>
            ${mine ? '<span class="dv-own">Ваш движ</span>' : `<button type="button" class="dv-btn main ${e.joined ? 'on' : ''}" data-dv="join">${e.joined ? '<i class="fas fa-check"></i> Вы идёте' : 'Я с вами'}</button>`}
        </div></article>`;
}

function dvAttachHTML(a) {
    return `<div class="dv-attach" data-dv="service" data-sid="${dvEsc(a.id)}">
        <div class="dv-attach-img">${a.thumb ? `<img src="${dvEsc(a.thumb)}" alt="">` : '<i class="fas fa-ship"></i>'}</div>
        <div><small>Закреплено из «Развлечений»</small><b>${dvEsc(a.title)}</b>${dvPrice(a) ? `<span>${dvEsc(dvPrice(a))}</span>` : ''}</div></div>`;
}

function paintDviz() {
    const box = document.getElementById('dvFeed');
    if (!box) return;
    box.innerHTML = dvFeed.length ? dvFeed.map(dvCardHTML).join('')
        : `<div class="dv-empty"><i class="fas fa-champagne-glasses"></i><b>Пока тихо</b><span>Создайте движ: позовите компанию на джипы, морскую прогулку, волейбол или просто потусить.</span></div>`;
}

function onFeedClick(ev) {
    const card = ev.target.closest('.dv-card');
    if (!card) return;
    const id = card.dataset.id;
    const act = ev.target.closest('[data-dv]');
    if (act && act.dataset.dv === 'join') { dvToggleJoin(id); return; }
    if (act && act.dataset.dv === 'service') { openServiceView(act.dataset.sid); return; }
    openDvizView(id);
}

// ---------- отклик ----------
function dvToggleJoin(id, after) {
    loginRequired(() => {
        svApi('/api/dviz/' + encodeURIComponent(id) + '/join', { method: 'POST', headers: dvAuthed(), body: '{}' }).then(({ status, d }) => {
            if (status === 401) { clearSession(); showToast('Сессия истекла. Войдите снова.'); return; }
            if (!d || !d.ok) { showToast((d && d.message) || 'Не получилось'); return; }
            if (typeof haptic === 'function') haptic(10);
            showToast(d.joined ? 'Вы идёте! Автор получил уведомление' : 'Отклик снят');
            const e = dvFeed.find(x => x.id === id);
            if (e) { e.joined = d.joined; e.joins = d.joins; paintDviz(); }
            after && after();
        }).catch(() => showToast('Нет связи с сервером'));
    });
}

// ---------- просмотр: фото, описание, участники, комментарии ----------
function dvCommentsHTML(e) {
    const acc = typeof getAccount === 'function' ? getAccount() : null;
    const list = e.commentList || [];
    return list.length ? list.map(c => {
        const can = acc && (acc.id === c.userId || acc.id === e.ownerId);
        return `<div class="dv-comment" data-cid="${dvEsc(c.id)}"><div class="chat-avatar" style="background:${dmColor(c.name)}">${dvEsc(Array.from(c.name)[0] || '?')}</div>
            <div class="dv-cbody"><div class="dv-chead"><b>${dvEsc(c.name)}${c.userId === e.ownerId ? ' <em>автор</em>' : ''}</b><small>${fmtAgo(c.time)}</small>${can ? `<button type="button" data-cdel="${dvEsc(c.id)}" aria-label="Удалить комментарий"><i class="fas fa-trash"></i></button>` : ''}</div>
            <p>${dvEsc(c.text)}</p></div></div>`;
    }).join('') : '<p class="dv-nocomm">Комментариев пока нет. Спросите, что берут с собой и где встречаться.</p>';
}

function openDvizView(id) {
    dvGet('/api/dviz/' + encodeURIComponent(id)).then(({ d }) => {
        if (!d || !d.ok) { showToast((d && d.message) || 'Движ недоступен'); loadDviz(); return; }
        const e = d.event;
        const acc = typeof getAccount === 'function' ? getAccount() : null;
        const mine = !!(acc && acc.id === e.ownerId);
        dvOpenId = e.id;
        const gal = (e.photos || []).length ? `<div class="sv-gallery dv-gallery">${e.photos.map((p, i) => `<img src="${dvEsc(p)}" alt="Фото ${i + 1}">`).join('')}</div>` : '';
        const going = (e.joinList || []);
        openSheet(dvEsc(e.title), `
            ${gal}
            <div class="dv-meta big">
                ${e.when ? `<span><i class="fas fa-clock"></i>${dvEsc(dvWhen(e.when))}</span>` : ''}
                ${e.place ? `<span><i class="fas fa-location-dot"></i>${dvEsc(e.place)}</span>` : ''}
                ${dvPeople(e) ? `<span><i class="fas fa-user-group"></i>${dvEsc(dvPeople(e))}</span>` : ''}
            </div>
            ${e.text ? `<p class="sv-view-text">${dvEsc(e.text)}</p>` : ''}
            ${e.attached ? dvAttachHTML(e.attached) : ''}
            <button type="button" class="sv-owner" data-dv-owner><span class="chat-avatar" style="background:${dmColor(e.ownerName)}">${dvEsc(Array.from(e.ownerName)[0] || '?')}</span>
                <span><b>${dvEsc(mine ? 'Вы' : e.ownerName)}</b><small>Организатор · открыть профиль</small></span><i class="fas fa-chevron-right"></i></button>
            <div class="dv-going" id="dvGoing"></div>
            <div class="dv-actions" id="dvActions"></div>
            <div class="form-h" style="margin:14px 2px 8px">Комментарии</div>
            <div class="dv-comments" id="dvComments">${dvCommentsHTML(e)}</div>
            <form class="dv-write" id="dvWrite"><input id="dvText" maxlength="400" placeholder="Написать комментарий…" autocomplete="off"><button type="submit" aria-label="Отправить"><i class="fas fa-paper-plane"></i></button></form>`, (el) => {
            const paintTop = (ev) => {
                const g = el.querySelector('#dvGoing');
                const jl = ev.joinList || [];
                g.innerHTML = jl.length ? `<div class="dv-going-h">Идут (${jl.length}${ev.max ? ' из ' + ev.max : ''})</div><div class="dv-chips">${jl.map(j => `<span class="dv-chip"><i style="background:${dmColor(j.name)}">${dvEsc(Array.from(j.name)[0] || '?')}</i>${dvEsc(j.name)}</span>`).join('')}</div>` : '';
                el.querySelector('#dvActions').innerHTML = mine
                    ? '<button type="button" class="ghost-btn wide-btn dv-del" data-dv-del><i class="fas fa-trash"></i> Удалить движ</button>'
                    : `<button type="button" class="primary-btn wide-btn" data-dv-join>${ev.joined ? '<i class="fas fa-check"></i> Вы идёте — отменить' : '<i class="fas fa-hand"></i> Я с вами'}</button>`;
            };
            paintTop(e);
            el._dv = { id: e.id, paintTop, owner: e.ownerId, e };
            el.querySelector('[data-dv-owner]').onclick = () => { closeSheet(); if (typeof openUserProfile === 'function') openUserProfile({ id: e.ownerId, name: e.ownerName }); };
            const att = el.querySelector('[data-dv="service"]');
            if (att) att.onclick = () => openServiceView(att.dataset.sid);
            el.addEventListener('click', (ev) => {
                if (ev.target.closest('[data-dv-join]')) { dvToggleJoin(e.id, () => dvRefreshOpen()); return; }
                if (ev.target.closest('[data-dv-del]')) { dvDelete(e.id); return; }
                const cdel = ev.target.closest('[data-cdel]');
                if (cdel) {
                    svApi('/api/dviz/' + encodeURIComponent(e.id) + '/comments/' + encodeURIComponent(cdel.dataset.cdel), { method: 'DELETE', headers: dvAuthed() })
                        .then(({ d }) => { if (d && d.ok) dvRefreshOpen(); else showToast((d && d.message) || 'Не удалось удалить'); });
                }
            });
            el.querySelector('#dvWrite').addEventListener('submit', (ev) => {
                ev.preventDefault();
                const inp = el.querySelector('#dvText'), text = inp.value.trim();
                if (!text) return;
                loginRequired(() => {
                    inp.disabled = true;
                    svApi('/api/dviz/' + encodeURIComponent(e.id) + '/comments', { method: 'POST', headers: dvAuthed(), body: JSON.stringify({ text }) }).then(({ status, d }) => {
                        inp.disabled = false;
                        if (status === 401) { clearSession(); showToast('Сессия истекла. Войдите снова.'); return; }
                        if (!d || !d.ok) { showToast((d && d.message) || 'Не удалось отправить'); return; }
                        inp.value = '';
                        dvRefreshOpen(true);
                    }).catch(() => { inp.disabled = false; showToast('Нет связи с сервером'); });
                });
            });
        });
    }).catch(() => showToast('Нет связи с сервером'));
}

// обновить открытую шторку (комментарии, участники) без перерисовки всей
function dvRefreshOpen(scrollDown) {
    const sheet = document.getElementById('sheet');
    if (!sheet || !sheet._dv) return;
    const st = sheet._dv;
    dvGet('/api/dviz/' + encodeURIComponent(st.id)).then(({ d }) => {
        if (!d || !d.ok) return;
        const box = sheet.querySelector('#dvComments');
        if (!box) return;
        const e = d.event;
        box.innerHTML = dvCommentsHTML(e);
        st.paintTop(e);
        const f = dvFeed.find(x => x.id === e.id);
        if (f) { f.comments = e.comments; f.joins = e.joins; f.joined = e.joined; paintDviz(); }
        if (scrollDown) box.lastElementChild && box.lastElementChild.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }).catch(() => {});
}

function dvDelete(id) {
    if (!confirm('Удалить этот движ вместе с комментариями?')) return;
    svApi('/api/dviz/' + encodeURIComponent(id), { method: 'DELETE', headers: dvAuthed() }).then(({ d }) => {
        if (d && d.ok) { closeSheet(); showToast('Движ удалён'); loadDviz(); }
        else showToast((d && d.message) || 'Не удалось удалить');
    }).catch(() => showToast('Нет связи с сервером'));
}

// сервер сообщает: кто-то создал, удалил или прокомментировал движ
function onDvizChanged(d) {
    if (document.getElementById('dvFeed')) loadDviz();
    if (d && dvOpenId && d.id === dvOpenId) {
        if (d.removed) { closeSheet(); showToast('Этот движ удалён'); } else dvRefreshOpen();
    }
}

// ---------- создать движ ----------
function openDvizForm(opts) {
    opts = opts || {};
    loginRequired(() => {
        let attach = opts.attach ? { id: opts.attach.id, title: opts.attach.title, price: opts.attach.price, unit: opts.attach.unit, thumb: opts.attach.thumb, ownerName: opts.attach.ownerName } : null;
        const photos = [];
        const e = dvEsc;
        const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        const minNow = now.toISOString().slice(0, 16);
        openSheet('Создать движ', `
            <p class="auth-note" style="margin:0 4px 12px">Позовите компанию: джипы, морская прогулка, волейбол или просто потусить. Желающие откликнутся и напишут в комментариях.</p>
            <div id="dvAttachBox"></div>
            <div class="dv-ideas" id="dvIdeas">${DV_IDEAS.map(t => `<button type="button">${e(t)}</button>`).join('')}</div>
            <label class="field"><span>Что за движ</span><input id="dvTitle" maxlength="80" placeholder="Например: Едем на джипах к водопадам" value="${e(opts.title || (attach ? 'Идём: ' + attach.title : ''))}"></label>
            <label class="field"><span>Описание</span><textarea id="dvText" rows="4" maxlength="1000" placeholder="Кого ищете, что берут с собой, сколько стоит, как добраться">${e(opts.text || '')}</textarea></label>
            <label class="field"><span>Когда</span><input id="dvWhen" type="datetime-local" min="${minNow}"></label>
            <label class="field"><span>Место встречи</span><input id="dvPlace" maxlength="120" placeholder="Например: у фонтана на набережной"></label>
            <label class="field"><span>Сколько человек нужно</span><input id="dvMax" type="number" inputmode="numeric" min="2" max="99" placeholder="Можно пусто"></label>
            <div class="form-h" style="margin:0 2px 8px">Фото · до ${DV_PHOTOS}</div>
            <div class="photo-grid sv-photo-grid" id="dvPhotos"></div>
            <input type="file" id="dvFile" accept="image/*" multiple hidden>
            <div class="auth-error" id="dvErr"></div>
            <button class="primary-btn wide-btn" id="dvSave" type="button"><i class="fas fa-champagne-glasses"></i> Опубликовать движ</button>`, (el) => {
            const grid = el.querySelector('#dvPhotos'), file = el.querySelector('#dvFile'), err = el.querySelector('#dvErr'), btn = el.querySelector('#dvSave');
            const paintAttach = () => {
                el.querySelector('#dvAttachBox').innerHTML = attach ? `<div class="dv-attach pinned">
                    <div class="dv-attach-img">${attach.thumb ? `<img src="${e(attach.thumb)}" alt="">` : '<i class="fas fa-ship"></i>'}</div>
                    <div><small><i class="fas fa-thumbtack"></i> Закреплено из «Развлечений»</small><b>${e(attach.title)}</b>${dvPrice(attach) ? `<span>${e(dvPrice(attach))}</span>` : ''}</div>
                    <button type="button" aria-label="Открепить" data-unpin><i class="fas fa-xmark"></i></button></div>` : '';
            };
            paintAttach();
            el.querySelector('#dvAttachBox').addEventListener('click', (ev) => { if (ev.target.closest('[data-unpin]')) { attach = null; paintAttach(); } });
            el.querySelector('#dvIdeas').addEventListener('click', (ev) => {
                const b = ev.target.closest('button'); if (!b) return;
                const t = el.querySelector('#dvTitle'); t.value = b.textContent; t.focus();
            });
            const paint = () => {
                grid.innerHTML = photos.map((src, i) => `<div class="photo-tile ${i === 0 ? 'cover' : ''}"><img src="${e(src)}" alt=""><button type="button" data-del="${i}" aria-label="Убрать фото"><i class="fas fa-xmark"></i></button></div>`).join('')
                    + (photos.length < DV_PHOTOS ? '<button type="button" class="photo-add"><i class="fas fa-camera"></i><span>Добавить</span></button>' : '');
            };
            paint();
            grid.addEventListener('click', (ev) => {
                const del = ev.target.closest('[data-del]');
                if (del) { photos.splice(Number(del.dataset.del), 1); paint(); return; }
                if (ev.target.closest('.photo-add')) file.click();
            });
            file.addEventListener('change', async () => {
                const list = Array.from(file.files || []).slice(0, DV_PHOTOS - photos.length);
                file.value = '';
                for (const f of list) { try { photos.push(await svPhoto(f)); } catch (_) { err.textContent = 'Не удалось обработать фото'; } }
                paint();
            });
            btn.addEventListener('click', async () => {
                const v = (id) => el.querySelector(id).value.trim();
                if (!v('#dvTitle')) { err.textContent = 'Напишите, что за движ'; return; }
                err.textContent = ''; btn.disabled = true;
                let thumb = '';
                try { if (photos[0]) thumb = await svThumb(photos[0]); } catch (_) {}
                const body = { title: v('#dvTitle'), text: v('#dvText'), when: v('#dvWhen'), max: v('#dvMax'), place: v('#dvPlace'), photos, thumb, attach: attach ? { id: attach.id } : undefined };
                try {
                    const { status, d } = await svApi('/api/dviz', { method: 'POST', headers: dvAuthed(), body: JSON.stringify(body) });
                    if (status === 401) { clearSession(); err.textContent = 'Сессия истекла. Войдите снова.'; btn.disabled = false; return; }
                    if (!d || !d.ok) { err.textContent = (d && d.message) || 'Не удалось опубликовать'; btn.disabled = false; return; }
                    closeSheet();
                    showToast('Движ опубликован!');
                    if (document.getElementById('dvFeed')) loadDviz(); else openDvizScreen();
                } catch (_) { err.textContent = 'Нет связи с сервером'; btn.disabled = false; }
            });
        });
    });
}
