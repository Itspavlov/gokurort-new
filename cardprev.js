/* Предпросмотр карточки перед публикацией.
   Показывает карточку так, как её увидят другие, и две кнопки: «Опубликовать» и «Вернуться к правке».
   Подключён ко всем формам создания: услуги, «Создать поиск», запрос на жильё, карточки «Ищу / Предлагаю», объявление о жилье. */
(function () {
    'use strict';
    const esc = (s) => (typeof escapeHtml === 'function' ? escapeHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    let box = null, onKey = null;

    function close() {
        if (onKey) { document.removeEventListener('keydown', onKey); onKey = null; }
        if (box) { const b = box; box = null; b.classList.remove('open'); setTimeout(() => b.remove(), 200); }
    }

    // html — готовая карточка; cls — обёртка, которая нужна её стилям
    function open(opts) {
        close();
        const el = document.createElement('div');
        el.className = 'cp-overlay';
        el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Предпросмотр карточки');
        el.innerHTML = `<div class="cp-panel">
            <div class="cp-grab"></div>
            <h3 class="cp-title">Так увидят вашу карточку</h3>
            <p class="cp-sub">${esc(opts.note || 'Проверьте перед публикацией: фото, название, цену и место.')}</p>
            <div class="cp-stage ${esc(opts.cls || '')}" aria-hidden="true">${opts.html}</div>
            <button type="button" class="primary-btn wide-btn cp-go"><i class="fas fa-paper-plane"></i> ${esc(opts.publishLabel || 'Опубликовать')}</button>
            <button type="button" class="ghost-btn wide-btn cp-back"><i class="fas fa-pen"></i> Вернуться к правке</button>
        </div>`;
        el.addEventListener('click', (ev) => { if (ev.target === el) close(); });
        el.querySelector('.cp-back').addEventListener('click', close);
        el.querySelector('.cp-go').addEventListener('click', () => { close(); try { opts.onPublish && opts.onPublish(); } catch (e) { console.error(e); } });
        onKey = (ev) => { if (ev.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);
        // картинки в предпросмотре не должны ждать ленивой загрузки и не трогаются пальцем
        el.querySelectorAll('img[loading]').forEach((i) => i.setAttribute('loading', 'eager'));
        document.body.appendChild(el);
        box = el;
        requestAnimationFrame(() => el.classList.add('open'));
        return el;
    }

    const me = () => {
        const acc = typeof getAccount === 'function' ? getAccount() : null;
        return { id: '__preview', name: (acc && acc.name) || 'Вы', verified: !!(acc && acc.verified) };
    };
    const now = () => Date.now();

    // ---- готовые услуги ----
    function service(d) {
        const u = me();
        const s = Object.assign({ id: '__preview', ownerId: u.id, ownerName: u.name, verified: u.verified, created: now(), updated: now() }, d);
        if (typeof svPhotoCache === 'object') svPhotoCache['__preview'] = (d.photos || []).slice();
        s.photoCount = (d.photos || []).length;
        s.thumb = (d.photos || [])[0] || '';
        return { html: serviceFeedHTML(s), cls: 'sv-grid cp-sv' };
    }
    // ---- «Создать поиск» (движ) ----
    function dviz(d) {
        const u = me();
        const e = Object.assign({ id: '__preview', ownerId: u.id, ownerName: u.name, verified: u.verified, created: now(), comments: 0, joins: 0 }, d);
        e.photoCount = (d.photos || []).length;
        e.thumb = (d.photos || [])[0] || '';
        return { html: dvCardHTML(e, 0), cls: 'cp-dv' };
    }
    // ---- запросы и карточки «Ищу / Предлагаю» ----
    function request(d) {
        const u = me();
        const prof = typeof getProfile === 'function' ? getProfile() : {};
        const avatar = prof && /^avatars\//.test(prof.avatar || '') ? prof.avatar : '';
        const r = Object.assign({ id: '__preview', status: 'active', mine: false, ownerId: u.id, ownerName: u.name, ownerVerified: u.verified, ownerAvatar: avatar, created: now() }, d);
        return { html: reqCardHTML(r), cls: 'cp-req' };
    }
    // ---- объявление о жилье ----
    function ad(a) {
        const town = typeof adTownOnly === 'function' ? adTownOnly(a.location) : (a.location || '');
        const html = `<div class="ad-card"><div class="ad-card-img">${typeof adImg === 'function' ? adImg(a) : ''}${typeof adBadgesHTML === 'function' ? adBadgesHTML(a) : ''}</div>
            <div class="ad-card-body"><div class="ad-card-price">${esc(a.price)}</div><div class="ad-card-title">${esc(a.title)}</div>
            <div class="ad-card-loc"><i class="fas fa-map-marker-alt"></i><span>${esc(town)}</span></div></div></div>`;
        return { html, cls: 'cp-ad', note: 'Это карточка в ленте. Внутри объявления будут все фото, условия и карта.' };
    }

    window.cardPreview = function (kind, data, onPublish) {
        const build = { service, dviz, request, ad }[kind];
        let r;
        try { r = build(data); } catch (err) { console.error('preview', err); onPublish && onPublish(); return; }   // не получилось нарисовать — не мешаем публикации
        open({ html: r.html, cls: r.cls, note: r.note, onPublish });
    };
    window.cardPreviewClose = close;
})();
