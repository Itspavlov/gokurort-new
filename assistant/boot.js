/* Загрузчик помощника: классический скрипт, грузит 3D-модули лениво (после отрисовки страницы). Не трогает остальной интерфейс. */
(function () {
    'use strict';
    var KEY = 'yy_asst_v1', ctl = null, ghost = null, starting = false;
    function cfg() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
    function save(o) { try { var c = cfg(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { } }
    function homeOK() {
        if (document.hidden || document.body.classList.contains('kb-open')) return false;
        var t = document.getElementById('tab-search'); if (!t || t.offsetParent === null) return false;
        var g = document.getElementById('group-screen'); return !(g && getComputedStyle(g).display !== 'none');
    }
    function start() {
        if (ctl || starting) return; starting = true;
        import('./controller.js?v=1').then(function (m) {
            try { ctl = new m.AssistantController(); window.YuGiAssistant = {
                controller: ctl, say: function (t, ms) { ctl.say(t, ms); }, pointAt: function (id, t) { ctl.pointAt(id, t); },
                celebrate: function () { ctl.celebrate(); }, open: function () { ctl.chat.open(); }, close: function () { ctl.chat.close(); }
            }; }
            catch (e) { document.querySelectorAll('.yy-asst,.yy-chat').forEach(function (n) { n.remove(); }); ctl = null; if (window.console) console.warn('[assistant] выключен:', e && e.message); }
            starting = false;
        }).catch(function (e) { starting = false; if (window.console) console.warn('[assistant] не загрузился:', e && e.message); });
    }
    function showGhost() {
        if (!ghost) {
            ghost = document.createElement('button'); ghost.type = 'button'; ghost.className = 'yy-ghost'; ghost.setAttribute('aria-label', 'Включить помощника'); ghost.innerHTML = '<i class="fas fa-face-smile"></i>';
            ghost.onclick = function () { save({ on: true }); hideGhost(); start(); }; document.body.appendChild(ghost);
        }
        ghost.style.display = homeOK() ? 'flex' : 'none';
    }
    function hideGhost() { if (ghost) { ghost.remove(); ghost = null; } }
    window.addEventListener('yy-assistant-off', function () { ctl = null; delete window.YuGiAssistant; });
    function tick() { if (cfg().on === false) { if (!ctl) showGhost(); } else { hideGhost(); if (!ctl) start(); } }
    function init() {
        if (navigator.connection && navigator.connection.saveData) return;                // экономия трафика — не грузим
        tick(); setInterval(function () { if (!starting) tick(); }, 800);
    }
    function later() { (window.requestIdleCallback || function (f) { setTimeout(f, 600); })(init, { timeout: 3500 }); }
    if (document.readyState === 'complete') later(); else window.addEventListener('load', later);
})();
