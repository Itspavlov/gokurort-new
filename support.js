'use strict';
// Режим поддержки: модератор открывает сайт глазами пользователя (ссылка из админки: #support=…).
// Сессия короткая (30 минут) и без личной переписки — это проверяет сервер.
// Собственный вход модератора сохраняется и возвращается по кнопке «Выйти».
(function () {
    const K = 'tell-support', KEYS = ['tell-token', 'tell-account', 'tell-username'];
    const ls = {
        get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
        del(k) { try { localStorage.removeItem(k); } catch (e) {} }
    };
    const server = () => window.TELL_SERVER_URL ||
        (/onrender\.com$/.test(location.hostname) || location.protocol === 'file:' || location.hostname === 'localhost'
            ? 'https://tell-server.onrender.com' : location.origin);

    function restore(st) {
        for (const k of KEYS) { if (st.backup && st.backup[k] != null) ls.set(k, st.backup[k]); else ls.del(k); }
        ls.del(K);
    }
    function leave() {
        let st = null; try { st = JSON.parse(ls.get(K) || 'null'); } catch (e) {}
        if (st) {
            try { fetch(server() + '/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + st.token }, keepalive: true }); } catch (e) {}
            restore(st);
        }
        location.reload();
    }

    // 1) вход по ссылке из админки
    const m = /[#&]support=([0-9a-f]{64})(?:&|$)/.exec(location.hash);
    if (m) {
        const q = new URLSearchParams(location.hash.slice(1));
        const name = (q.get('n') || '').slice(0, 40), id = (q.get('i') || '').slice(0, 64);
        let prev = null; try { prev = JSON.parse(ls.get(K) || 'null'); } catch (e) {}
        const backup = prev && prev.backup ? prev.backup : Object.fromEntries(KEYS.map(k => [k, ls.get(k)]));
        ls.set(K, JSON.stringify({ token: m[1], name, backup, exp: Date.now() + 30 * 60000 }));
        ls.set('tell-token', m[1]);
        ls.set('tell-account', JSON.stringify({ id, name, verified: q.get('v') === '1' }));
        ls.set('tell-username', name);
        try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    }

    // 2) плашка, пока режим включён; по истечении времени возвращаем свой вход
    let st = null; try { st = JSON.parse(ls.get(K) || 'null'); } catch (e) {}
    if (!st) return;
    if (st.exp <= Date.now() || ls.get('tell-token') !== st.token) { restore(st); return; }
    window.SUPPORT_MODE = true;

    function bar() {
        const left = () => Math.max(0, Math.ceil((st.exp - Date.now()) / 60000));
        const b = document.createElement('div');
        b.className = 'support-bar';
        const t = document.createElement('span');
        const x = document.createElement('button');
        x.type = 'button'; x.textContent = 'Выйти'; x.addEventListener('click', leave);
        b.append(t, x);
        const paint = () => { if (st.exp <= Date.now()) return leave(); t.textContent = 'Режим поддержки · вы смотрите как «' + st.name + '» · осталось ' + left() + ' мин · переписка закрыта'; };
        paint(); setInterval(paint, 30000);
        document.body.append(b);
        document.body.classList.add('has-support');
    }
    if (document.body) bar(); else document.addEventListener('DOMContentLoaded', bar);
})();
