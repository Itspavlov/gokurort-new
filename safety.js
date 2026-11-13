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

    // ---------- смена пароля ----------
    SF.openPassword = function () {
        if (!me()) return;
        openSheet('Сменить пароль', `
            <label class="field"><span>Текущий пароль</span><input id="sfPwOld" type="password" maxlength="72" autocomplete="current-password"></label>
            <label class="field"><span>Новый пароль</span><input id="sfPwNew" type="password" maxlength="72" autocomplete="new-password" placeholder="Не короче 8 символов"></label>
            <label class="field"><span>Повторите новый пароль</span><input id="sfPwNew2" type="password" maxlength="72" autocomplete="new-password"></label>
            <div class="auth-error" id="sfPwErr"></div>
            <button class="primary-btn wide-btn" id="sfPwGo">Сменить пароль</button>
            <p class="auth-note" style="margin:10px 2px 0">После смены вы останетесь в аккаунте здесь, а на других устройствах придётся войти заново.</p>`, (el) => {
            const err = el.querySelector('#sfPwErr'), go = el.querySelector('#sfPwGo');
            const run = async () => {
                const o = el.querySelector('#sfPwOld').value, n = el.querySelector('#sfPwNew').value, n2 = el.querySelector('#sfPwNew2').value;
                err.textContent = '';
                if (!o || !n) { err.textContent = 'Введите текущий и новый пароль'; return; }
                if (n.length < 8) { err.textContent = 'Новый пароль: не короче 8 символов'; return; }
                if (n !== n2) { err.textContent = 'Новые пароли не совпадают'; return; }
                go.disabled = true; go.textContent = 'Подождите…';
                const r = await api('POST', '/api/auth/password', { oldPassword: o, newPassword: n });
                go.disabled = false; go.textContent = 'Сменить пароль';
                if (!r.d || !r.d.ok) { err.textContent = r.status === 429 ? 'Слишком много попыток. Подождите немного.' : (r.d && r.d.message) || 'Не получилось. Попробуйте ещё раз.'; return; }
                closeSheet();
                toast('Пароль изменён');
            };
            go.onclick = run;
            el.querySelector('#sfPwNew2').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') run(); });
        });
    };

    // ---------- восстановление доступа: код, почта, «забыли пароль» ----------
    async function copyText(t) {
        try { await navigator.clipboard.writeText(t); return true; }
        catch (err) {
            try { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0;top:0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; }
            catch (x) { return false; }
        }
    }
    const errText = (r, def) => (r.status === 429 && !(r.d && r.d.message)) ? 'Слишком много попыток. Подождите немного.' : (r.d && r.d.message) || def || 'Не получилось. Попробуйте ещё раз.';
    const afterLogin = () => {
        try { if (typeof reconnectSocket === 'function') reconnectSocket(); } catch (x) {}
        try { if (typeof fetchRemoteAds === 'function') fetchRemoteAds(); } catch (x) {}
        for (const fn of ['renderProfile', 'renderDialogs', 'renderMyPubs']) { try { if (typeof window[fn] === 'function') window[fn](); } catch (x) {} }
    };

    // Код показывается один раз: на сервере хранится только его хеш
    SF.showRecovery = function (code, o) {
        o = o || {};
        openSheet('Код восстановления', `
            <p class="auth-note" style="margin:0 2px 10px">${o.reset ? 'Пароль изменён. Прежний код больше не действует, вот новый.' : 'Если забудете пароль, этот код вернёт доступ к аккаунту. Он показывается один раз: сохраните его в заметках или в менеджере паролей.'}</p>
            <div class="sf-code" id="sfCode">${e(code)}</div>
            <div class="sf-code-actions"><button type="button" class="ghost-btn" id="sfCodeCopy"><i class="fas fa-copy"></i> Скопировать</button></div>
            <label class="pref-row" style="margin-top:8px"><span><b>Я сохранил(а) код</b></span><input type="checkbox" id="sfCodeOk"><i class="pref-sw"></i></label>
            <button class="primary-btn wide-btn" id="sfCodeDone" disabled>Готово</button>
            <p class="auth-note" style="margin:10px 2px 0">Никому не показывайте код: по нему можно сменить пароль. Новый код можно создать в профиле, прежний тогда перестанет действовать.</p>`, (el) => {
            const ok = el.querySelector('#sfCodeOk'), done = el.querySelector('#sfCodeDone'), cp = el.querySelector('#sfCodeCopy');
            ok.addEventListener('change', () => { done.disabled = !ok.checked; });
            cp.onclick = async () => { cp.innerHTML = (await copyText(code)) ? '<i class="fas fa-check"></i> Скопировано' : 'Выделите код и скопируйте вручную'; };
            done.onclick = () => { closeSheet(); if (typeof renderProfile === 'function') { try { renderProfile(); } catch (x) {} } };
        });
    };

    // Запрос пароля перед опасным действием; run вернёт текст ошибки или null (тогда сам закроет шторку)
    function askPassword(title, note, btn, run) {
        openSheet(title, `
            <p class="auth-note" style="margin:0 2px 10px">${e(note)}</p>
            <label class="field"><span>Ваш пароль</span><input id="sfApPw" type="password" maxlength="72" autocomplete="current-password"></label>
            <div class="auth-error" id="sfApErr"></div>
            <button class="primary-btn wide-btn" id="sfApGo">${e(btn)}</button>`, (el) => {
            const pw = el.querySelector('#sfApPw'), go = el.querySelector('#sfApGo'), err = el.querySelector('#sfApErr');
            const doIt = async () => {
                if (!pw.value) { err.textContent = 'Введите пароль'; return; }
                go.disabled = true; err.textContent = '';
                const msg = await run(pw.value);
                if (msg) { go.disabled = false; err.textContent = msg; }
            };
            go.onclick = doIt;
            pw.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') doIt(); });
        });
    }

    SF.openRecovery = async function () {
        if (!me()) return;
        const r = await api('GET', '/api/auth/recovery');
        if (!r.d || !r.d.ok) { toast(errText(r)); return; }
        const d = r.d;
        const mailRow = d.email
            ? `<div class="pf-row pf-static"><i class="fas fa-envelope"></i><span>Почта<small class="sf-sub">${e(d.email)}</small></span><button type="button" class="ghost-btn" data-rc="unmail">Отвязать</button></div>`
            : (d.mail
                ? `<button type="button" class="pf-row" data-rc="mail"><i class="fas fa-envelope"></i><span>Привязать почту<small class="sf-sub">чтобы сбросить пароль письмом</small></span><i class="fas fa-chevron-right pf-go"></i></button>`
                : `<div class="pf-row pf-static"><i class="fas fa-envelope"></i><span>Почта<small class="sf-sub">привязка скоро появится</small></span></div>`);
        openSheet('Восстановление доступа', `
            <p class="auth-note" style="margin:0 2px 10px">Если забудете пароль, вернуть доступ можно по коду восстановления${d.mail ? ' или через почту' : ''}.</p>
            <div class="pf-menu">
                <button type="button" class="pf-row" data-rc="code"><i class="fas fa-key"></i><span>Код восстановления<small class="sf-sub">${d.hasCode ? 'есть · создать новый' : 'не создан · создать'}</small></span><i class="fas fa-chevron-right pf-go"></i></button>
                ${mailRow}
            </div>`, (el) => {
            el.addEventListener('click', (ev) => {
                const b = ev.target.closest('[data-rc]'); if (!b) return;
                const k = b.dataset.rc;
                if (k === 'code') askPassword('Новый код восстановления', 'Прежний код перестанет действовать. Новый код будет показан один раз.', 'Создать код', async (pw) => {
                    const x = await api('POST', '/api/auth/recovery-code', { password: pw });
                    if (!x.d || !x.d.ok) return errText(x);
                    SF.showRecovery(x.d.code); return null;
                });
                else if (k === 'mail') SF.openEmailAdd();
                else if (k === 'unmail') askPassword('Отвязать почту', 'После этого сбросить пароль через почту будет нельзя.', 'Отвязать', async (pw) => {
                    const x = await api('DELETE', '/api/auth/email', { password: pw });
                    if (!x.d || !x.d.ok) return errText(x);
                    toast('Почта отвязана'); SF.openRecovery(); return null;
                });
            });
        });
    };

    SF.openEmailAdd = function () {
        if (!me()) return;
        openSheet('Привязать почту', `
            <div id="sfEm1">
                <label class="field"><span>Почта</span><input id="sfEmMail" type="email" maxlength="254" autocomplete="email" inputmode="email" placeholder="name@example.com"></label>
                <label class="field"><span>Ваш пароль</span><input id="sfEmPw" type="password" maxlength="72" autocomplete="current-password"></label>
                <div class="auth-error" id="sfEmErr"></div>
                <button class="primary-btn wide-btn" id="sfEmSend">Отправить код</button>
                <p class="auth-note" style="margin:10px 2px 0">Почту видим только мы: она нужна лишь для сброса пароля и не показывается другим пользователям.</p>
            </div>
            <div id="sfEm2" hidden>
                <p class="auth-note" id="sfEmSent" style="margin:0 2px 10px"></p>
                <label class="field"><span>Код из письма</span><input id="sfEmCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="6 цифр"></label>
                <div class="auth-error" id="sfEmErr2"></div>
                <button class="primary-btn wide-btn" id="sfEmOk">Подтвердить</button>
                <p class="auth-note" style="margin:10px 2px 0">Письма нет? Проверьте «Спам». Код действует 15 минут.</p>
            </div>`, (el) => {
            const q = (s) => el.querySelector(s);
            const send = q('#sfEmSend'), ok = q('#sfEmOk');
            send.onclick = async () => {
                const mail = q('#sfEmMail').value.trim(), pw = q('#sfEmPw').value, err = q('#sfEmErr');
                err.textContent = '';
                if (!mail || !pw) { err.textContent = 'Введите почту и пароль'; return; }
                send.disabled = true; send.textContent = 'Отправляем…';
                const r = await api('POST', '/api/auth/email', { email: mail, password: pw });
                send.disabled = false; send.textContent = 'Отправить код';
                if (!r.d || !r.d.ok) { err.textContent = errText(r); return; }
                if (r.d.already) { closeSheet(); toast('Эта почта уже привязана'); return; }
                q('#sfEm1').hidden = true; q('#sfEm2').hidden = false;
                q('#sfEmSent').textContent = 'Отправили код на ' + mail + '.';
                q('#sfEmCode').focus();
            };
            const confirm = async () => {
                const code = q('#sfEmCode').value.trim(), err = q('#sfEmErr2');
                err.textContent = '';
                if (code.replace(/\D/g, '').length !== 6) { err.textContent = 'Введите 6 цифр из письма'; return; }
                ok.disabled = true;
                const r = await api('POST', '/api/auth/email/confirm', { code });
                ok.disabled = false;
                if (!r.d || !r.d.ok) { err.textContent = errText(r); return; }
                toast('Почта привязана'); SF.openRecovery();
            };
            ok.onclick = confirm;
            q('#sfEmCode').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') confirm(); });
        });
    };

    // «Забыли пароль» на экране входа
    SF.openReset = async function (pref) {
        const o = await api('GET', '/api/auth/options');
        const mailOn = !!(o.d && o.d.mail);
        const mail = LEGAL().email;
        openSheet('Восстановление пароля', `
            <label class="field"><span>Имя</span><input id="sfRsName" maxlength="24" autocomplete="username" value="${e(pref || '')}"></label>
            ${mailOn ? `<div class="auth-tabs"><button type="button" class="auth-tab active" data-rm="recovery">По коду</button><button type="button" class="auth-tab" data-rm="email">По почте</button></div>` : ''}
            <div id="sfRsMail" hidden>
                <p class="auth-note" style="margin:0 2px 10px">Пришлём 6-значный код на почту, которую вы привязали к аккаунту.</p>
                <button type="button" class="ghost-btn wide-btn" id="sfRsSend" style="margin-bottom:12px">Отправить код на почту</button>
            </div>
            <label class="field"><span id="sfRsCodeLbl">Код восстановления</span><input id="sfRsCode" maxlength="24" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX"></label>
            <label class="field"><span>Новый пароль</span><input id="sfRsPw" type="password" maxlength="72" autocomplete="new-password" placeholder="Не короче 8 символов"></label>
            <label class="field"><span>Повторите новый пароль</span><input id="sfRsPw2" type="password" maxlength="72" autocomplete="new-password"></label>
            <div class="auth-error" id="sfRsErr"></div>
            <button class="primary-btn wide-btn" id="sfRsGo">Сменить пароль и войти</button>
            <p class="auth-note" style="margin:10px 2px 0">Нет ни кода, ни почты? ${mail ? `Напишите в поддержку: <a href="mailto:${e(mail)}">${e(mail)}</a>.` : 'Напишите в поддержку.'} Код восстановления выдаётся при регистрации и обновляется в профиле.</p>`, (el) => {
            const q = (s) => el.querySelector(s);
            let method = 'recovery';
            const paint = () => {
                el.querySelectorAll('[data-rm]').forEach(t => t.classList.toggle('active', t.dataset.rm === method));
                q('#sfRsMail').hidden = method !== 'email';
                q('#sfRsCodeLbl').textContent = method === 'email' ? 'Код из письма' : 'Код восстановления';
                q('#sfRsCode').placeholder = method === 'email' ? '6 цифр' : 'XXXX-XXXX-XXXX-XXXX';
                q('#sfRsCode').maxLength = method === 'email' ? 6 : 24;
                q('#sfRsCode').inputMode = method === 'email' ? 'numeric' : 'text';
                q('#sfRsErr').textContent = '';
            };
            el.querySelectorAll('[data-rm]').forEach(t => t.addEventListener('click', () => { method = t.dataset.rm; paint(); }));
            paint();
            const err = q('#sfRsErr');
            q('#sfRsSend').onclick = async () => {
                const name = q('#sfRsName').value.trim();
                err.textContent = '';
                if (!name) { err.textContent = 'Введите имя'; return; }
                const b = q('#sfRsSend'); b.disabled = true;
                const r = await api('POST', '/api/auth/reset', { name });
                setTimeout(() => { b.disabled = false; }, 30000);
                if (!r.d || !r.d.ok) { b.disabled = false; err.textContent = errText(r); return; }
                toast('Если к аккаунту привязана почта, мы отправили код'); q('#sfRsCode').focus();
            };
            const go = q('#sfRsGo');
            const run = async () => {
                const name = q('#sfRsName').value.trim(), code = q('#sfRsCode').value.trim(), pw = q('#sfRsPw').value, pw2 = q('#sfRsPw2').value;
                err.textContent = '';
                if (!name || !code) { err.textContent = 'Введите имя и код'; return; }
                if (pw.length < 8) { err.textContent = 'Новый пароль: не короче 8 символов'; return; }
                if (pw !== pw2) { err.textContent = 'Пароли не совпадают'; return; }
                go.disabled = true; go.textContent = 'Подождите…';
                const r = await api('POST', '/api/auth/reset/confirm', { name, method, code, password: pw });
                go.disabled = false; go.textContent = 'Сменить пароль и войти';
                if (!r.d || !r.d.ok) { err.textContent = errText(r); return; }
                if (typeof setSession === 'function') setSession(r.d.token, r.d.user);
                closeSheet(); afterLogin();
                toast('Пароль изменён. Вы вошли как ' + r.d.user.name);
                if (r.d.recoveryCode) setTimeout(() => SF.showRecovery(r.d.recoveryCode, { reset: true }), 350);
            };
            go.onclick = run;
            q('#sfRsPw2').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') run(); });
        });
    };

    // Тем, у кого нет ни кода, ни почты (старые аккаунты), раз в три дня напоминаем создать код
    SF.recoveryHint = async function () {
        if (!me()) return;
        try { if (Date.now() - Number(localStorage.getItem('yy-rec-hint') || 0) < 3 * 86400000) return; } catch (x) {}
        const r = await api('GET', '/api/auth/recovery');
        if (r.d && r.d.ok && !r.d.hasCode && !r.d.email) {
            try { localStorage.setItem('yy-rec-hint', String(Date.now())); } catch (x) {}
            toast('Создайте код восстановления: Профиль → Восстановление доступа');
        }
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
            ${a ? `<button type="button" class="pf-row" onclick="SF.openPassword()"><i class="fas fa-key"></i><span>Сменить пароль</span><i class="fas fa-chevron-right pf-go"></i></button>` : ''}
            ${a ? `<button type="button" class="pf-row" onclick="SF.openRecovery()"><i class="fas fa-shield-halved"></i><span>Восстановление доступа</span><i class="fas fa-chevron-right pf-go"></i></button>` : ''}
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
        setTimeout(() => SF.recoveryHint(), 6000);
    }
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
