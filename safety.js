'use strict';
// ============================================
// SAFETY.JS — то, без чего нельзя в магазины приложений:
// жалобы на любой материал, блокировка пользователей (с фильтрацией лент),
// удаление аккаунта, согласие с документами, поддержка.
// Подключается после social.js, reviews.js, services.js, dviz.js.
// ============================================
(function () {
    const e = (s) => (typeof escapeHtml === 'function' ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    const norm = (n) => String(n || '').trim().toLowerCase();
    const LEGAL = () => window.YUGI_LEGAL || {};
    const BLK_KEY = 'yy-blocks';
    const SF = window.SF = { ids: new Set(), names: new Set(), users: [] };

    // ---------- сеть ----------
    const _fetch = window.fetch.bind(window);
    const base = () => (typeof SERVER_URL !== 'undefined' ? SERVER_URL : '');
    async function api(method, path, body) {
        const h = { 'Content-Type': 'application/json' };
        const t = typeof getToken === 'function' ? getToken() : '';
        if (t) h.Authorization = 'Bearer ' + t;
        let res;
        try { res = await _fetch(base() + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); }
        catch (err) { return { status: 0, d: { ok: false, message: 'Нет связи с сервером. Проверьте интернет.' } }; }
        let d = {};
        try { d = await res.json(); } catch (err) {}
        return { status: res.status, d };
    }
    const toast = (t) => { if (typeof showToast === 'function') showToast(t); };
    const me = () => (typeof getAccount === 'function' ? getAccount() : null);

    // ---------- список заблокированных ----------
    function setBlocked(users) {
        SF.users = (users || []).filter(u => u && u.id);
        SF.ids = new Set(SF.users.map(u => u.id));
        SF.names = new Set(SF.users.map(u => norm(u.name)));
        try {
            const a = me();
            if (a && SF.users.length) localStorage.setItem(BLK_KEY, JSON.stringify({ uid: a.id, users: SF.users }));
            else localStorage.removeItem(BLK_KEY);
        } catch (err) {}
    }
    function readCache() {
        try {
            const c = JSON.parse(localStorage.getItem(BLK_KEY) || 'null');
            const acc = JSON.parse(localStorage.getItem('tell-account') || 'null');
            if (c && acc && c.uid === acc.id && Array.isArray(c.users)) setBlocked(c.users);
        } catch (err) {}
    }
    readCache();         // сразу, до первой загрузки лент

    SF.load = async function () {
        if (!me()) { setBlocked([]); return; }
        const r = await api('GET', '/api/blocks');
        if (r.d && r.d.ok) { const before = SF.ids.size; setBlocked(r.d.users); if (before !== SF.ids.size) refreshFeeds(); }
    };

    function refreshFeeds() {
        try { if (typeof fetchRemoteAds === 'function') fetchRemoteAds(); } catch (err) {}
        try { if (typeof renderDialogs === 'function') renderDialogs(); } catch (err) {}
        for (const fn of ['loadDviz', 'loadRequests', 'loadServices', 'renderRequestsFeed']) { try { if (typeof window[fn] === 'function') window[fn](); } catch (err) {} }
    }

    SF.isBlocked = (userOrName) => {
        if (!userOrName) return false;
        if (typeof userOrName === 'object') return SF.ids.has(userOrName.id || userOrName.ownerId) || SF.names.has(norm(userOrName.name || userOrName.ownerName));
        return SF.names.has(norm(userOrName));
    };

    SF.block = async function (id, name, on) {
        if (!id || !String(id).startsWith('u_')) { toast('Этого пользователя нельзя заблокировать'); return false; }
        const r = await api('POST', '/api/blocks', { userId: id, on: on !== false });
        if (!r.d || !r.d.ok) { toast((r.d && r.d.message) || 'Не удалось выполнить'); return false; }
        setBlocked(r.d.users);
        toast(on === false ? 'Пользователь разблокирован' : 'Пользователь заблокирован. Его публикации скрыты');
        refreshFeeds();
        return true;
    };

    // лента: убираем публикации заблокированных из ответов сервера (объявления, развлечения, поиски, запросы)
    const FEEDS = { listings: 'listings', services: 'services', dviz: 'events', requests: 'requests' };
    window.fetch = async function (input, init) {
        const res = await _fetch(input, init);
        try {
            if (!SF.ids.size) return res;
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            const m = url.match(/\/api\/(listings|services|dviz|requests)(\?[^#]*)?$/);
            if (!m) return res;
            const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
            if (method !== 'GET' || !res.ok) return res;
            const d = await res.clone().json();
            const key = FEEDS[m[1]];
            if (!d || !Array.isArray(d[key])) return res;
            d[key] = d[key].filter(x => !(x && SF.ids.has(x.ownerId)));
            const headers = new Headers(res.headers); headers.delete('content-length');
            return new Response(JSON.stringify(d), { status: res.status, statusText: res.statusText, headers });
        } catch (err) { return res; }
    };

    // ---------- кнопка «Пожаловаться» для шаблонов ----------
    window.sfReportBtn = function (o) {
        const a = me();
        if (o.ownerId && a && a.id === o.ownerId) return '';
        return `<button type="button" class="sf-link${o.icon ? ' ico' : ''}" ${o.icon ? 'aria-label="Пожаловаться" title="Пожаловаться"' : ''} data-sf-r data-k="${e(o.kind)}" data-id="${e(o.id)}" data-oid="${e(o.ownerId || '')}" data-on="${e(o.ownerName || '')}" data-t="${e((o.title || '').slice(0, 120))}" data-room="${e(o.room || '')}"><i class="fas fa-flag"></i>${o.icon ? '' : ' ' + e(o.label || 'Пожаловаться')}</button>`;
    };
    document.addEventListener('click', (ev) => {
        const b = ev.target.closest && ev.target.closest('[data-sf-r]');
        if (!b) return;
        ev.preventDefault(); ev.stopPropagation();
        SF.report({ kind: b.dataset.k, id: b.dataset.id, ownerId: b.dataset.oid, ownerName: b.dataset.on, title: b.dataset.t, room: b.dataset.room });
    }, true);

    // ---------- шторка жалобы ----------
    const REASONS = [['spam', 'Спам или реклама'], ['scam', 'Мошенничество'], ['abuse', 'Оскорбления или угрозы'], ['adult', 'Неприемлемое содержание'], ['other', 'Другое']];
    const WHAT = { listing: 'объявление', service: 'развлечение', dviz: 'поиск компании', request: 'запрос', review: 'отзыв', message: 'сообщение', user: 'пользователя' };
    SF.report = function (o) {
        const go = () => {
            const canBlock = !!(o.ownerId && String(o.ownerId).startsWith('u_') && !(me() && me().id === o.ownerId));
            openSheet('Пожаловаться', `
                <p class="auth-note" style="margin:0 2px 10px">Вы жалуетесь на ${e(WHAT[o.kind] || 'материал')}${o.ownerName ? ' от «' + e(o.ownerName) + '»' : ''}. Модератор рассмотрит жалобу, автор о ней не узнает.</p>
                <div class="pref-list">${REASONS.map(([k, t], i) => `<label class="pref-row"><span><b>${t}</b></span><input type="radio" name="sfReason" value="${k}" ${i === 0 ? 'checked' : ''}><i class="rp-dot"></i></label>`).join('')}</div>
                <label class="field" style="margin-top:10px"><span>Что не так (по желанию)</span><textarea id="sfText" rows="2" maxlength="300"></textarea></label>
                ${canBlock ? `<label class="pref-row" style="margin-top:4px"><span><b>Заблокировать ${e(o.ownerName || 'автора')}</b><small>Скрыть все его публикации у меня</small></span><input type="checkbox" id="sfBlock" checked><i class="pref-sw"></i></label>` : ''}
                <button class="primary-btn wide-btn" id="sfSend" style="margin-top:12px">Отправить жалобу</button>`, (el) => {
                el.querySelector('#sfSend').onclick = async () => {
                    const btn = el.querySelector('#sfSend'); btn.disabled = true;
                    const reason = (el.querySelector('input[name=sfReason]:checked') || {}).value;
                    const r = await api('POST', '/api/reports', { kind: o.kind, targetId: String(o.id), room: o.room || undefined, reason, text: el.querySelector('#sfText').value.trim() });
                    if (!r.d || !r.d.ok) {
                        btn.disabled = false;
                        toast(r.status === 409 ? 'Вы уже жаловались на это сегодня' : (r.d && r.d.message) || 'Не удалось отправить');
                        return;
                    }
                    const blk = el.querySelector('#sfBlock');
                    const doBlock = !!(blk && blk.checked);
                    closeSheet();
                    toast('Жалоба отправлена. Спасибо!');
                    if (doBlock) SF.block(o.ownerId, o.ownerName, true);
                };
            });
        };
        if (typeof loginRequired === 'function') loginRequired(go); else go();
    };

    // ---------- меню пользователя: пожаловаться / заблокировать ----------
    SF.userMenu = function (u) {
        if (!u || !u.id || me() && me().id === u.id) return;
        const blocked = SF.ids.has(u.id);
        openSheet(e(u.name || 'Пользователь'), `<div class="pf-menu">
            <button type="button" class="pf-row" data-sfm="block"><i class="fas fa-ban"></i><span>${blocked ? 'Разблокировать' : 'Заблокировать'}</span></button>
            <button type="button" class="pf-row" data-sfm="report"><i class="fas fa-flag"></i><span>Пожаловаться на пользователя</span></button></div>
            <p class="auth-note" style="margin:10px 2px 0">${blocked ? 'Сейчас его публикации скрыты, а написать вам он не может.' : 'Заблокированный не сможет писать вам, а его публикации и сообщения вы видеть не будете.'}</p>`, (el) => {
            el.querySelector('[data-sfm=block]').onclick = () => { closeSheet(); loginOr(() => SF.block(u.id, u.name, !blocked)); };
            el.querySelector('[data-sfm=report]').onclick = () => { closeSheet(); SF.report({ kind: 'user', id: u.id, ownerId: u.id, ownerName: u.name, title: u.name }); };
        });
    };
    function loginOr(cb) { if (typeof loginRequired === 'function') loginRequired(cb); else cb(); }

    // ---------- список заблокированных ----------
    SF.openBlocked = function () {
        const draw = (el) => {
            const box = el.querySelector('#sfBlList');
            box.innerHTML = SF.users.length ? SF.users.map(u => `<div class="pf-row pf-static sf-bl"><span class="chat-avatar" style="background:${typeof dmColor === 'function' ? dmColor(u.name) : '#888'}">${e(Array.from(u.name || '?')[0])}</span><span><b>${e(u.name)}</b></span><button type="button" class="ghost-btn" data-unb="${e(u.id)}">Разблокировать</button></div>`).join('')
                : '<p class="rv-empty">Вы никого не блокировали</p>';
        };
        openSheet('Заблокированные', '<div class="pf-menu" id="sfBlList"></div>', (el) => {
            draw(el);
            el.addEventListener('click', async (ev) => {
                const b = ev.target.closest('[data-unb]'); if (!b) return;
                b.disabled = true;
                const u = SF.users.find(x => x.id === b.dataset.unb);
                await SF.block(b.dataset.unb, u && u.name, false);
                draw(el);
            });
        });
    };

    // ---------- удаление аккаунта ----------
    SF.openDelete = function () {
        const a = me();
        if (!a) return;
        openSheet('Удалить аккаунт', `
            <div class="sf-warn"><i class="fas fa-triangle-exclamation"></i><div><b>Это необратимо.</b> Будут удалены ваш аккаунт «${e(a.name)}», объявления, развлечения, поиски, запросы, отзывы, избранное, фото и все личные диалоги — в том числе у собеседников.</div></div>
            <label class="field"><span>Пароль для подтверждения</span><input id="sfDelPass" type="password" maxlength="72" autocomplete="current-password" placeholder="Ваш пароль"></label>
            <label class="pref-row" style="margin-top:4px"><span><b>Понимаю, что вернуть данные нельзя</b></span><input type="checkbox" id="sfDelOk"><i class="pref-sw"></i></label>
            <div class="auth-error" id="sfDelErr"></div>
            <button class="primary-btn wide-btn sf-danger" id="sfDelGo" disabled>Удалить навсегда</button>`, (el) => {
            const go = el.querySelector('#sfDelGo'), ok = el.querySelector('#sfDelOk'), pass = el.querySelector('#sfDelPass'), err = el.querySelector('#sfDelErr');
            const upd = () => { go.disabled = !(ok.checked && pass.value.length >= 1); };
            ok.addEventListener('change', upd); pass.addEventListener('input', upd);
            go.onclick = async () => {
                go.disabled = true; go.textContent = 'Удаляем…'; err.textContent = '';
                const r = await api('DELETE', '/api/auth/account', { password: pass.value });
                if (!r.d || !r.d.ok) {
                    go.textContent = 'Удалить навсегда'; upd();
                    err.textContent = r.status === 401 ? 'Неверный пароль' : r.status === 429 ? 'Слишком много попыток. Подождите немного.' : (r.d && r.d.message) || 'Не получилось. Попробуйте ещё раз.';
                    return;
                }
                for (const k of ['tell-token', 'tell-account', 'tell-username', 'tell-profile', 'tell-my-ads', 'tell-dialogs', 'tell-pending-join', 'yy-ref', BLK_KEY]) { try { localStorage.removeItem(k); } catch (x) {} }
                closeSheet();
                openSheet('Аккаунт удалён', '<p class="auth-note" style="margin:0 2px 12px">Ваш аккаунт и данные удалены. Спасибо, что были с нами.</p><button class="primary-btn wide-btn" id="sfDone">Закрыть</button>', (el2) => {
                    const done = () => { location.reload(); };
                    el2.querySelector('#sfDone').onclick = done;
                    setTimeout(done, 6000);
                });
            };
        });
    };

    // ---------- документы и поддержка ----------
    SF.openSupport = function () {
        const mail = LEGAL().email;
        openSheet('Поддержка', `
            <div class="pf-menu">
                ${mail ? `<a class="pf-row" href="mailto:${e(mail)}"><i class="fas fa-envelope"></i><span>${e(mail)}</span><i class="fas fa-chevron-right pf-go"></i></a>` : '<div class="pf-row pf-static"><i class="fas fa-envelope"></i><span>Адрес поддержки будет здесь</span></div>'}
                <a class="pf-row" href="privacy.html" target="_blank" rel="noopener"><i class="fas fa-shield-halved"></i><span>Политика конфиденциальности</span><i class="fas fa-chevron-right pf-go"></i></a>
                <a class="pf-row" href="terms.html" target="_blank" rel="noopener"><i class="fas fa-file-lines"></i><span>Пользовательское соглашение</span><i class="fas fa-chevron-right pf-go"></i></a>
            </div>
            <p class="auth-note" style="margin:10px 2px 0">Увидели нарушение? Нажмите «Пожаловаться» на объявлении, сообщении или в профиле. Жалобы рассматриваются модератором.</p>`);
    };

    // блок для экрана «Профиль»
    window.sfProfileRows = function () {
        const a = me();
        return `
            ${a ? `<button type="button" class="pf-row" onclick="SF.openBlocked()"><i class="fas fa-ban"></i><span>Заблокированные</span>${SF.users.length ? `<em>${SF.users.length}</em>` : ''}<i class="fas fa-chevron-right pf-go"></i></button>` : ''}
            <button type="button" class="pf-row" onclick="SF.openSupport()"><i class="fas fa-life-ring"></i><span>Поддержка и документы</span><i class="fas fa-chevron-right pf-go"></i></button>`;
    };
    window.sfProfileDanger = function () {
        return me() ? '<button class="pf-delete" onclick="SF.openDelete()"><i class="fas fa-user-slash"></i> Удалить аккаунт</button>' : '';
    };

    // согласие при регистрации (в шторке входа)
    window.sfConsentHTML = function () {
        return `<label class="sf-consent" id="sfConsent" hidden><input type="checkbox" id="sfAgree"><span>Я принимаю <a href="terms.html" target="_blank" rel="noopener">пользовательское соглашение</a> и <a href="privacy.html" target="_blank" rel="noopener">политику конфиденциальности</a>, даю согласие на обработку моих данных</span></label>`;
    };

    // ---------- подключение к существующим экранам ----------
    function hook() {
        // сообщения заблокированных не рисуем (история и новые)
        if (typeof renderMessageHTML === 'function' && !renderMessageHTML._sf) {
            const _r = renderMessageHTML;
            renderMessageHTML = function (m, userName) {
                if (m && m.user && m.user !== userName && SF.names.has(norm(m.user))) return '';
                return _r.apply(this, arguments);
            };
            renderMessageHTML._sf = true;
        }
        // вход и выход обновляют список
        if (typeof setSession === 'function' && !setSession._sf) {
            const _s = setSession;
            setSession = function () { const r = _s.apply(this, arguments); setTimeout(() => SF.load(), 0); return r; };
            setSession._sf = true;
        }
        if (typeof clearSession === 'function' && !clearSession._sf) {
            const _c = clearSession;
            clearSession = function () { const r = _c.apply(this, arguments); setBlocked([]); return r; };
            clearSession._sf = true;
        }
        // объявление: кнопки внизу
        if (typeof openListing === 'function' && !openListing._sf) {
            const _o = openListing;
            openListing = function (adId) {
                const r = _o.apply(this, arguments);
                try {
                    const ad = typeof listingAd !== 'undefined' ? listingAd : null;
                    const body = document.querySelector('#listing-screen .listing-body');
                    if (ad && String(ad.id) === String(adId) && body && !body.querySelector('.sf-row') && !ad.mine && typeof isServerAd === 'function' && isServerAd(ad)) {
                        const oid = ad.ownerId || (ad.owner && ad.owner.id) || '';
                        const oname = (ad.owner && ad.owner.name) || ad.ownerName || '';
                        const wrap = document.createElement('div');
                        wrap.className = 'sf-row';
                        wrap.innerHTML = window.sfReportBtn({ kind: 'listing', id: ad.id, ownerId: oid, ownerName: oname, title: ad.title }) +
                            (String(oid).startsWith('u_') ? `<button type="button" class="sf-link" data-sf-blk="${e(oid)}" data-n="${e(oname)}"><i class="fas fa-ban"></i> ${SF.ids.has(oid) ? 'Разблокировать' : 'Заблокировать'} хозяина</button>` : '');
                        wrap.addEventListener('click', (ev) => {
                            const b = ev.target.closest('[data-sf-blk]'); if (!b) return;
                            loginOr(async () => { const was = SF.ids.has(b.dataset.sfBlk); if (await SF.block(b.dataset.sfBlk, b.dataset.n, !was)) { if (!was && typeof closeListing === 'function') closeListing(); } });
                        });
                        body.appendChild(wrap);
                    }
                } catch (err) {}
                return r;
            };
            openListing._sf = true;
        }
        // сообщения в общих комнатах: пункт «Пожаловаться» в меню по удержанию
        if (typeof openMsgMenu === 'function' && !openMsgMenu._sf) {
            const _m = openMsgMenu;
            openMsgMenu = function (msgEl) {
                const r = _m.apply(this, arguments);
                try {
                    const panel = document.querySelector('#msgMenu .msg-menu');
                    if (!panel || msgEl.classList.contains('chat-message-mine') || (typeof currentDm !== 'undefined' && currentDm) || (typeof currentGroup !== 'undefined' && currentGroup)) return r;
                    const id = msgEl.dataset.id; if (!id || id.startsWith('ad_') || typeof currentRoom === 'undefined' || !currentRoom) return r;
                    const who = (msgEl.querySelector('.chat-user-name') || {}).textContent || '';
                    const btn = document.createElement('button');
                    btn.type = 'button'; btn.className = 'msg-menu-item danger'; btn.innerHTML = '<i class="fas fa-flag"></i> Пожаловаться';
                    btn.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        const room = currentRoom;
                        if (typeof closeMsgMenu === 'function') closeMsgMenu();
                        SF.report({ kind: 'message', id, room, ownerName: who, title: (msgEl.querySelector('.chat-bubble') || {}).textContent || '' });
                    });
                    panel.appendChild(btn);
                } catch (err) {}
                return r;
            };
            openMsgMenu._sf = true;
        }
    }

    function start() {
        hook();
        SF.load().then(() => { if (SF.ids.size) refreshFeeds(); });
    }
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
