// ============================================
// LAB.JS — диагностика (включается адресом ?perf=1): панель эффектов справа и показ ошибок скриптов внизу.
// Отдельный файл: работает, даже если в app.js что-то упало на устройстве.
// ============================================
(function () {
    let on = false;
    try { on = /[?&]perf=1/.test(location.search) || localStorage.getItem('yy-perf') === '1'; } catch (_) {}
    if (!on) return;
    try { if (/[?&]perf=1/.test(location.search)) localStorage.setItem('yy-perf', '1'); } catch (_) {}
    if (/[?&]perf=0/.test(location.search)) { try { localStorage.removeItem('yy-perf'); } catch (_) {} return; }

    const mount = () => {
        const KEYS = [['bf', 'размытие под панелями'], ['fl', 'blur-фильтры'], ['bs', 'тени'], ['mx', 'blend'], ['bl', 'пятна фона'], ['mk', 'маски'], ['im', 'фото шапки']];
        const box = document.createElement('div');
        box.setAttribute('data-i18n-skip', '');
        box.style.cssText = 'position:fixed;right:4px;top:38%;z-index:99999;display:flex;flex-direction:column;gap:4px;font:700 11px sans-serif';
        const paint = () => box.querySelectorAll('button').forEach(b => {
            const off = document.documentElement.classList.contains('lite-' + b.dataset.k);
            b.style.background = off ? '#1b8a3a' : '#a02828';
            b.textContent = (off ? 'ВЫКЛ ' : 'вкл ') + b.dataset.k;
        });
        KEYS.forEach(([k, name]) => {
            const b = document.createElement('button');
            b.type = 'button'; b.dataset.k = k; b.title = name;
            b.style.cssText = 'padding:7px 8px;border:0;border-radius:8px;color:#fff;opacity:.92';
            b.addEventListener('click', (ev) => {
                ev.stopPropagation();
                document.documentElement.classList.toggle('lite-' + k);
                const list = KEYS.map(x => x[0]).filter(x => document.documentElement.classList.contains('lite-' + x));
                try { localStorage.setItem('yy-lite', list.join(',')); } catch (_) {}
                paint();
            });
            box.appendChild(b);
        });
        document.body.appendChild(box);
        paint();
        const mark = document.createElement('div');
        mark.setAttribute('data-i18n-skip', '');
        mark.textContent = 'LAB v2 · эффекты справа';
        mark.style.cssText = 'position:fixed;left:50%;top:2px;transform:translateX(-50%);z-index:99999;font:700 10px sans-serif;color:#fff;background:#1b6f9a;border-radius:6px;padding:2px 8px;pointer-events:none;opacity:.9';
        document.body.appendChild(mark);

        // ошибки скриптов: если что-то падает на этом устройстве, видно здесь
        const errBox = document.createElement('div');
        errBox.setAttribute('data-i18n-skip', '');
        errBox.style.cssText = 'position:fixed;left:4px;right:60px;bottom:90px;z-index:99999;font:11px/1.3 monospace;color:#fff;background:rgba(160,40,40,.88);border-radius:8px;padding:6px 8px;display:none;pointer-events:none;max-height:30vh;overflow:hidden';
        document.body.appendChild(errBox);
        const lines = [];
        const add = (t) => { lines.push(String(t).slice(0, 160)); while (lines.length > 4) lines.shift(); errBox.textContent = lines.join('\n'); errBox.style.display = 'block'; };
        window.addEventListener('error', (e) => add('ERR ' + (e.message || '') + ' @' + String(e.filename || '').split('/').pop() + ':' + (e.lineno || '')));
        window.addEventListener('unhandledrejection', (e) => add('PROMISE ' + (e.reason && e.reason.message || e.reason)));
        (window.__earlyErrors || []).forEach(add);
    };
    if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
