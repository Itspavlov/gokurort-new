// ============================================
// YuGi YuGi — карточки услуг в профиле
//  • «Мои услуги» в профиле: карточки с фото (до 4), ценой и описанием — прогулки на джипах, трансфер, маникюр…
//  • другой пользователь видит их в профиле хозяина (вкладка «Услуги») и в разделе «Услуги»
//  • «Предоставляю»: если карточки или объявления уже есть — предложим опубликовать старое заново или создать новое
// ============================================
const SV_TAGS = { tours: 'Экскурсии и прогулки', transport: 'Транспорт', beauty: 'Красота', repair: 'Ремонт', food: 'Еда', kids: 'Детям', other: 'Другое' };
const SV_UNITS = ['', 'за человека', 'за час', 'за день', 'за услугу'];
const SV_MAX = 10, SV_PHOTOS = 4;
let serviceFeed = [];      // карточки в разделе «Услуги»
let myServices = [];       // мои карточки

const svApi = (path, opts) => fetch(SERVER_URL + path, opts).then(async (r) => { let d = null; try { d = await r.json(); } catch (_) {} return { status: r.status, d }; });
const svAuth = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() });
const svPrice = (s) => s.price ? Number(s.price).toLocaleString('ru-RU') + ' ₽' + (s.unit ? ' ' + s.unit : '') : 'Цена по договорённости';
const svWait = (sec) => { const h = Math.floor(sec / 3600), m = Math.ceil((sec % 3600) / 60); return h ? `${h} ч ${m} мин` : `${Math.max(1, m)} мин`; };

// ---------- карточки ----------
function serviceCardHTML(s, mine) {
    const e = escapeHtml;
    const thumb = s.thumb ? `<img src="${e(s.thumb)}" alt="" loading="lazy">` : '<i class="fas fa-image"></i>';
    const act = mine ? `<div class="sv-actions">
            <button type="button" data-sv="edit" data-id="${e(s.id)}"><i class="fas fa-pen"></i> Изменить</button>
            <button type="button" data-sv="bump" data-id="${e(s.id)}"><i class="fas fa-arrow-up"></i> Поднять</button>
            <button type="button" data-sv="del" data-id="${e(s.id)}" aria-label="Удалить"><i class="fas fa-trash"></i></button></div>` : '';
    return `<div class="sv-card" data-sid="${e(s.id)}">
        <div class="sv-main" data-sv="view" data-id="${e(s.id)}">
            <div class="sv-thumb">${thumb}${s.photoCount > 1 ? `<em>${s.photoCount}</em>` : ''}</div>
            <div class="sv-info">
                <b class="sv-title">${e(s.title)}</b>
                <span class="sv-price">${e(svPrice(s))}</span>
                <small class="sv-meta"><span>${e(SV_TAGS[s.tag] || '')}</span>${s.city ? `<span><i class="fas fa-location-dot"></i>${e(s.city)}</span>` : ''}</small>
            </div>
        </div>${act}</div>`;
}

// в ленте раздела: с автором и кнопкой «Написать»
function serviceFeedHTML(s) {
    const e = escapeHtml;
    const acc = typeof getAccount === 'function' ? getAccount() : null;
    const mine = !!(acc && acc.id === s.ownerId);
    return `<div class="sv-card sv-feed" data-sid="${e(s.id)}">
        <div class="req-head"><div class="chat-avatar" style="background:${dmColor(s.ownerName)}">${e(Array.from(s.ownerName)[0] || '?')}</div>
            <div class="req-title"><b>${e(mine ? 'Вы' : s.ownerName)}${s.verified ? ' <i class="fas fa-circle-check pf-check"></i>' : ''}</b><small>${fmtAgo(s.updated || s.created)}</small></div>
            <em class="req-kind offer">Услуга</em></div>
        <div class="sv-main" data-sv="view" data-id="${e(s.id)}">
            <div class="sv-thumb">${s.thumb ? `<img src="${e(s.thumb)}" alt="" loading="lazy">` : '<i class="fas fa-image"></i>'}${s.photoCount > 1 ? `<em>${s.photoCount}</em>` : ''}</div>
            <div class="sv-info">
                <b class="sv-title">${e(s.title)}</b>
                <span class="sv-price">${e(svPrice(s))}</span>
                ${s.text ? `<p class="sv-text">${e(s.text)}</p>` : ''}
                <small class="sv-meta"><span>${e(SV_TAGS[s.tag] || '')}</span>${s.city ? `<span><i class="fas fa-location-dot"></i>${e(s.city)}</span>` : ''}</small>
            </div>
        </div>
        <div class="req-actions">${mine ? `<button type="button" data-sv="edit" data-id="${e(s.id)}">Изменить</button><button type="button" data-sv="bump" data-id="${e(s.id)}">Поднять</button>`
            : `<button type="button" data-sv="view" data-id="${e(s.id)}">Смотреть</button><button type="button" class="main" data-sv="write" data-id="${e(s.id)}"><i class="fas fa-paper-plane"></i> Написать</button>`}</div></div>`;
}

// ---------- загрузка ----------
function loadMyServices(cb) {
    if (!getToken()) { myServices = []; cb && cb(); return; }
    svApi('/api/services?mine=1', { headers: { Authorization: 'Bearer ' + getToken() } }).then(({ d }) => {
        if (d && d.ok) myServices = d.services || [];
        cb && cb();
    }).catch(() => cb && cb());
}

const _loadRequestsSv = loadRequests;
loadRequests = function (cb) {
    if (reqSection() !== 'services') return _loadRequestsSv.apply(this, arguments);
    svApi('/api/services').then(({ d }) => { if (d && d.ok) serviceFeed = d.services || []; }).catch(() => {}).then(() => _loadRequestsSv(cb));
};

// ---------- просмотр карточки ----------
function openServiceView(id) {
    svApi('/api/services/' + encodeURIComponent(id)).then(({ d }) => {
        if (!d || !d.ok) { showToast((d && d.message) || 'Карточка недоступна'); return; }
        const s = d.service, e = escapeHtml;
        const acc = typeof getAccount === 'function' ? getAccount() : null;
        const mine = !!(acc && acc.id === s.ownerId);
        const gal = (s.photos || []).length ? `<div class="sv-gallery">${s.photos.map((p, i) => `<img src="${e(p)}" alt="Фото ${i + 1}">`).join('')}</div>` : '';
        openSheet(e(s.title), `
            ${gal}
            <div class="sv-view-price">${e(svPrice(s))}</div>
            <div class="sv-view-meta"><span class="sv-tag">${e(SV_TAGS[s.tag] || '')}</span>${s.city ? `<span><i class="fas fa-location-dot"></i>${e(s.city)}</span>` : ''}</div>
            ${s.text ? `<p class="sv-view-text">${e(s.text)}</p>` : ''}
            <button type="button" class="sv-owner" data-sv-owner><span class="chat-avatar" style="background:${dmColor(s.ownerName)}">${e(Array.from(s.ownerName)[0] || '?')}</span>
                <span><b>${e(mine ? 'Вы' : s.ownerName)}</b><small>Открыть профиль и другие услуги</small></span><i class="fas fa-chevron-right"></i></button>
            ${mine ? `<div class="sv-view-btns"><button class="ghost-btn" data-sv="edit" data-id="${e(s.id)}"><i class="fas fa-pen"></i> Изменить</button><button class="primary-btn" data-sv="bump" data-id="${e(s.id)}"><i class="fas fa-arrow-up"></i> Поднять</button></div>`
                : `<button class="primary-btn wide-btn" data-sv="write" data-id="${e(s.id)}"><i class="fas fa-paper-plane"></i> Написать</button>`}`, (el) => {
            el.querySelector('[data-sv-owner]').addEventListener('click', () => { closeSheet(); if (typeof openUserProfile === 'function') openUserProfile({ id: s.ownerId, name: s.ownerName }); });
            el._sv = s;
        });
    }).catch(() => showToast('Нет связи с сервером'));
}

function writeAboutService(id, title, ownerName) {
    loginRequired(() => startDm(ownerName, { id: 'svc_' + id, title: 'Услуга: ' + title }, `Здравствуйте! Интересует «${title}». `));
}

// ---------- сжатие фото ----------
function svShrink(src, maxSide, q) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
            const k = Math.min(1, maxSide / Math.max(img.width, img.height));
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            resolve(c.toDataURL('image/jpeg', q));
        };
        img.src = src;
    });
}
const svReadFile = (file) => new Promise((res, rej) => { const fr = new FileReader(); fr.onerror = rej; fr.onload = () => res(fr.result); fr.readAsDataURL(file); });
// фото на сервере: до 350 КБ (≈ 470 тыс. знаков в base64) — подбираем размер и качество
async function svPhoto(file) {
    const raw = await svReadFile(file);
    for (const [side, q] of [[1280, 0.78], [1024, 0.7], [800, 0.62], [640, 0.55]]) {
        const out = await svShrink(raw, side, q);
        if (out.length <= 440000) return out;
    }
    throw new Error('big');
}
async function svThumb(first) {
    for (const [side, q] of [[320, 0.7], [240, 0.6], [160, 0.55]]) {
        const out = await svShrink(first, side, q);
        if (out.length <= 78000) return out;
    }
    return '';
}

// ---------- редактор ----------
function openServiceEditor(edit, after) {
    loginRequired(async () => {
        if (edit && edit.id && edit.photoCount && !edit.photos) {      // из списка пришло без фото — берём полную
            const { d } = await svApi('/api/services/' + encodeURIComponent(edit.id)).catch(() => ({}));
            if (!d || !d.ok) { showToast('Не удалось загрузить карточку'); return; }
            edit = d.service;
        }
        const s = edit || {}, e = escapeHtml;
        const photos = (s.photos || []).slice();
        openSheet(edit ? 'Изменить услугу' : 'Новая услуга', `
            <p class="auth-note" style="margin:0 4px 12px">Например: «Прогулки на джипах», «Трансфер из аэропорта», «Маникюр на дому». Карточку увидят в вашем профиле и в разделе «Услуги».</p>
            <div class="form-h" style="margin:0 2px 8px">Фото · до ${SV_PHOTOS}</div>
            <div class="photo-grid sv-photo-grid" id="svPhotos"></div>
            <input type="file" id="svFile" accept="image/*" multiple hidden>
            <label class="field"><span>Название</span><input id="svTitle" maxlength="80" placeholder="Прогулки на джипах по горам" value="${e(s.title || '')}"></label>
            <label class="field"><span>Категория</span><select id="svTag">${Object.entries(SV_TAGS).map(([k, v]) => `<option value="${k}" ${s.tag === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
            <div class="rq-row"><label class="field"><span>Цена, ₽</span><input id="svPrice" type="number" inputmode="numeric" min="1" value="${s.price || ''}" placeholder="Можно пусто"></label>
            <label class="field"><span>Как считать</span><select id="svUnit">${SV_UNITS.map(u => `<option value="${e(u)}" ${(s.unit || '') === u ? 'selected' : ''}>${u || '—'}</option>`).join('')}</select></label></div>
            <label class="field"><span>Город или место</span><input id="svCity" maxlength="60" value="${e(s.city || '')}" placeholder="Например: Красная Поляна"></label>
            <label class="field"><span>Описание</span><textarea id="svText" rows="4" maxlength="800" placeholder="Что входит, сколько длится, как договориться">${e(s.text || '')}</textarea></label>
            <div class="auth-error" id="svErr"></div>
            <button class="primary-btn wide-btn" id="svSave" type="button"><i class="fas fa-check"></i> ${edit ? 'Сохранить' : 'Опубликовать'}</button>`, (el) => {
            const grid = el.querySelector('#svPhotos'), file = el.querySelector('#svFile'), err = el.querySelector('#svErr'), btn = el.querySelector('#svSave');
            const paint = () => {
                grid.innerHTML = photos.map((src, i) => `<div class="photo-tile ${i === 0 ? 'cover' : ''}"><img src="${e(src)}" alt=""><button type="button" data-del="${i}" aria-label="Убрать фото"><i class="fas fa-xmark"></i></button></div>`).join('')
                    + (photos.length < SV_PHOTOS ? '<button type="button" class="photo-add"><i class="fas fa-camera"></i><span>Добавить</span></button>' : '');
            };
            paint();
            grid.addEventListener('click', (ev) => {
                const del = ev.target.closest('[data-del]');
                if (del) { photos.splice(Number(del.dataset.del), 1); paint(); return; }
                if (ev.target.closest('.photo-add')) file.click();
            });
            file.addEventListener('change', async () => {
                const list = Array.from(file.files || []).slice(0, SV_PHOTOS - photos.length);
                file.value = '';
                for (const f of list) {
                    try { photos.push(await svPhoto(f)); } catch (_) { err.textContent = 'Не удалось обработать фото'; }
                }
                paint();
            });
            btn.addEventListener('click', async () => {
                const v = (id) => el.querySelector(id).value.trim();
                if (!v('#svTitle')) { err.textContent = 'Напишите название'; return; }
                err.textContent = ''; btn.disabled = true;
                let thumb = '';
                try { if (photos[0]) thumb = await svThumb(photos[0]); } catch (_) {}
                const body = { id: s.id, title: v('#svTitle'), tag: el.querySelector('#svTag').value, price: v('#svPrice'), unit: el.querySelector('#svUnit').value, city: v('#svCity'), text: v('#svText'), photos, thumb };
                try {
                    const { status, d } = await svApi('/api/services', { method: 'POST', headers: svAuth(), body: JSON.stringify(body) });
                    if (status === 401) { clearSession(); err.textContent = 'Сессия истекла. Войдите снова.'; btn.disabled = false; return; }
                    if (!d || !d.ok) { err.textContent = (d && d.message) || 'Не удалось сохранить'; btn.disabled = false; return; }
                    closeSheet();
                    showToast(edit ? 'Карточка обновлена' : 'Карточка опубликована');
                    afterServiceChange();
                    after && after(d.service);
                } catch (_) { err.textContent = 'Нет связи с сервером'; btn.disabled = false; }
            });
        });
    });
}

function afterServiceChange() {
    loadMyServices(() => { mountMyServices(); });
    if (typeof reqSection === 'function' && reqSection() === 'services' && document.getElementById('chatMessages')) loadRequests();
}

// ---------- действия ----------
function bumpService(id) {
    svApi('/api/services/' + encodeURIComponent(id) + '/bump', { method: 'POST', headers: svAuth(), body: '{}' }).then(({ d }) => {
        if (d && d.ok) { closeSheet(); showToast('Карточка поднята наверх'); afterServiceChange(); return; }
        showToast(d && d.code === 'BUMP_WAIT' && d.wait ? `Поднять можно раз в 6 часов. Через ${svWait(d.wait)}` : ((d && d.message) || 'Не удалось поднять'));
    }).catch(() => showToast('Нет связи с сервером'));
}
function deleteService(id) {
    if (!confirm('Удалить карточку услуги?')) return;
    svApi('/api/services/' + encodeURIComponent(id), { method: 'DELETE', headers: svAuth() }).then(({ d }) => {
        if (d && d.ok) { closeSheet(); showToast('Карточка удалена'); afterServiceChange(); }
        else showToast((d && d.message) || 'Не удалось удалить');
    }).catch(() => showToast('Нет связи с сервером'));
}

// ---------- профиль: «Мои услуги» ----------
function mountMyServices() {
    const root = document.getElementById('profileRoot');
    if (!root) return;
    const acc = typeof getAccount === 'function' ? getAccount() : null;
    let box = document.getElementById('svMine');
    if (!acc) { if (box) box.remove(); return; }
    if (!box) {
        box = document.createElement('div');
        box.id = 'svMine';
        const head = root.querySelector('.pf-head');
        if (head) head.parentNode.insertBefore(box, head); else root.appendChild(box);
    }
    box.innerHTML = `<div class="section-head pf-head"><h2 class="section-title">Мои услуги${myServices.length ? ': ' + myServices.length : ''}</h2></div>
        ${myServices.length ? `<div class="sv-list">${myServices.map(s => serviceCardHTML(s, true)).join('')}</div>`
            : '<p class="pf-empty">Сдаёте жильё и ещё возите на джипах, делаете экскурсии, маникюр? Добавьте услугу с фото: её увидят в вашем профиле.</p>'}
        ${myServices.length < SV_MAX ? '<button type="button" class="ghost-btn wide-btn sv-add" data-sv="new"><i class="fas fa-plus"></i> Добавить услугу</button>' : ''}`;
}

const _renderProfileSv = renderProfile;
renderProfile = function () {
    const r = _renderProfileSv.apply(this, arguments);
    mountMyServices();
    if (getToken()) loadMyServices(mountMyServices);
    return r;
};

// ---------- «Предоставляю»: старое или новое ----------
function chooserRow(thumb, title, sub, btns) {
    const e = escapeHtml;
    return `<div class="rp-row"><div class="rp-thumb">${thumb ? `<img src="${e(thumb)}" alt="">` : '<i class="fas fa-image"></i>'}</div>
        <div class="rp-info"><b>${e(title)}</b><small>${e(sub)}</small></div><div class="rp-btns">${btns}</div></div>`;
}

function openServiceFlow() {
    loginRequired(() => loadMyServices(() => {
        if (!myServices.length) { openServiceEditor(); return; }
        const rows = myServices.slice(0, SV_MAX).map(s => chooserRow(s.thumb, s.title, svPrice(s),
            `<button type="button" class="rp-main" data-sv="bump" data-id="${escapeHtml(s.id)}">Поднять</button><button type="button" data-sv="edit" data-id="${escapeHtml(s.id)}" aria-label="Изменить"><i class="fas fa-pen"></i></button>`)).join('');
        openSheet('Предоставляю услугу', `
            <p class="auth-note" style="margin:0 4px 12px">У вас уже есть карточки. Опубликуйте одну из них заново — она встанет наверх раздела, — или создайте новую.</p>
            <div class="rp-list">${rows}</div>
            ${myServices.length < SV_MAX ? '<button type="button" class="primary-btn wide-btn" data-sv="new"><i class="fas fa-plus"></i> Создать новую карточку</button>' : '<p class="auth-note" style="margin:8px 4px 0">Достигнут предел: 10 карточек. Удалите ненужную в профиле.</p>'}`);
    }));
}

// Работа и поездки: старые карточки из «Моих запросов»
function openCardFlow(kind) {
    kind = kind === 'offer' ? 'offer' : 'seek';
    if (!getToken()) { openCardSheet(kind); return; }
    svApi('/api/requests?mine=1&status=all', { headers: { Authorization: 'Bearer ' + getToken() } }).then(({ d }) => {
        const sec = reqSection();
        const old = d && d.ok ? (d.requests || []).filter(r => r.section === sec && r.kind === kind).sort((a, b) => b.created - a.created).slice(0, 4) : [];
        if (!old.length) { openCardSheet(kind); return; }
        window._cardFlow = old;
        const rows = old.map(r => {
            const live = r.status === 'active';
            return chooserRow('', r.title || 'Без названия', live ? 'Сейчас опубликована' : 'Не активна',
                live ? `<button type="button" class="rp-main" data-cf="edit" data-id="${escapeHtml(r.id)}">Изменить</button>`
                     : `<button type="button" class="rp-main" data-cf="again" data-id="${escapeHtml(r.id)}">Опубликовать снова</button>`);
        }).join('');
        openSheet(SEC[sec][kind].head, `
            <p class="auth-note" style="margin:0 4px 12px">Ваши прежние карточки. Опубликуйте старую заново или создайте новую.</p>
            <div class="rp-list">${rows}</div>
            <button type="button" class="primary-btn wide-btn" data-cf="new" data-kind="${kind}"><i class="fas fa-plus"></i> Создать новую карточку</button>`);
    }).catch(() => openCardSheet(kind));
}

// Жильё: поднять своё объявление или создать новое
const _openAdFormSv = openAdForm;
openAdForm = function (editId) {
    if (editId) return _openAdFormSv.apply(this, arguments);
    const acc = typeof getAccount === 'function' ? getAccount() : null;
    if (!acc || !acc.verified) return _openAdFormSv.apply(this, arguments);        // проверка хозяина — как раньше
    const mine = myAdsAll().filter(a => a.mine && isRemoteAdId(a.id));
    if (!mine.length) return _openAdFormSv.apply(this, arguments);
    const rows = mine.slice(0, 6).map(a => chooserRow(a.image || (a.photos && a.photos[0]) || '', a.title, a.price || '',
        `<button type="button" class="rp-main" data-ad-bump="${escapeHtml(String(a.id))}">Поднять</button><button type="button" data-ad-edit="${escapeHtml(String(a.id))}" aria-label="Изменить"><i class="fas fa-pen"></i></button>`)).join('');
    openSheet('Предлагаю жильё', `
        <p class="auth-note" style="margin:0 4px 12px">Вы уже публиковали жильё. Опубликуйте его заново — объявление встанет наверх, — или добавьте новое.</p>
        <div class="rp-list">${rows}</div>
        <button type="button" class="primary-btn wide-btn" data-ad-new><i class="fas fa-plus"></i> Добавить новое жильё</button>`);
};

function bumpListing(id) {
    svApi('/api/listings/' + encodeURIComponent(id) + '/bump', { method: 'POST', headers: svAuth(), body: '{}' }).then(({ d }) => {
        if (d && d.ok) { closeSheet(); showToast('Объявление поднято наверх'); if (typeof fetchRemoteAds === 'function') fetchRemoteAds(); return; }
        showToast(d && d.code === 'BUMP_WAIT' && d.wait ? `Поднять можно раз в 6 часов. Через ${svWait(d.wait)}` : ((d && d.message) || 'Не удалось поднять'));
    }).catch(() => showToast('Нет связи с сервером'));
}

// ---------- общий обработчик нажатий ----------
document.addEventListener('click', (ev) => {
    const t = ev.target;
    const sv = t.closest('[data-sv]');
    if (sv) {
        const id = sv.dataset.id, act = sv.dataset.sv;
        const known = () => myServices.find(x => x.id === id) || serviceFeed.find(x => x.id === id);
        if (act === 'view') openServiceView(id);
        else if (act === 'new') { closeSheet(); openServiceEditor(); }
        else if (act === 'edit') { const s = known(); closeSheet(); openServiceEditor(s || { id, photoCount: 1 }); }
        else if (act === 'bump') bumpService(id);
        else if (act === 'del') deleteService(id);
        else if (act === 'write') {
            const s = known();
            if (s) { closeSheet(); writeAboutService(id, s.title, s.ownerName); }
            else svApi('/api/services/' + encodeURIComponent(id)).then(({ d }) => { if (d && d.ok) { closeSheet(); writeAboutService(id, d.service.title, d.service.ownerName); } });
        }
        return;
    }
    const cf = t.closest('[data-cf]');
    if (cf) {
        const r = (window._cardFlow || []).find(x => x.id === cf.dataset.id);
        closeSheet();
        if (cf.dataset.cf === 'new') openCardSheet(cf.dataset.kind);
        else if (cf.dataset.cf === 'edit' && r) openCardSheet(r.kind, r);
        else if (cf.dataset.cf === 'again' && r) openCardSheet(r.kind, null, r);
        return;
    }
    const b = t.closest('[data-ad-bump]'); if (b) { bumpListing(b.dataset.adBump); return; }
    const ed = t.closest('[data-ad-edit]'); if (ed) { closeSheet(); _openAdFormSv(ed.dataset.adEdit); return; }
    if (t.closest('[data-ad-new]')) { closeSheet(); _openAdFormSv(); }
});
