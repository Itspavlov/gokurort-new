/* Шапка главной: тексты и фото можно менять в админке («Шапка сайта»).
   Что не задано в админке — остаётся как в index.html. */
(function () {
    'use strict';
    var KEY = 'yy-hero';
    var q = function (s) { return document.querySelector(s); };
    var t1 = q('.hero-title span'), t2 = q('.hero-title em'), tag = q('.hero-tag'), place = q('.hero-place span'), photo = q('.hero-photo'), mirror = q('.hero-mirror'), stage = q('.hero-stage');
    if (!t1 || !t2 || !tag || !place) return;
    var DEF = { title1: t1.textContent, title2: t2.textContent, tag: tag.textContent, place: place.textContent, photo: photo ? photo.getAttribute('src') : '' };
    var cur = '';
    function lsGet() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
    function lsSet(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* без хранилища тоже работает */ } }
    function apply(h) {
        h = h || {};
        t1.textContent = h.title1 || DEF.title1;
        t2.textContent = h.title2 || DEF.title2;
        tag.textContent = h.tag || DEF.tag;
        place.textContent = h.place || DEF.place;
        if (photo) {
            var src = h.photo && typeof h.photo === 'string' && h.photo.indexOf('/api/site/hero') === 0 ? SERVER_URL + h.photo : DEF.photo;
            if (src !== cur) { cur = src; photo.src = src; if (mirror) mirror.src = src; tint(src); }
            if (stage) stage.classList.toggle('hero-custom', src !== DEF.photo);
        }
    }
    if (photo) {
        photo.onerror = function () {          // вместо встроенного: упало своё фото — вернём стандартное, упало и оно — убираем кадр, как раньше
            if (cur && cur !== DEF.photo) { cur = DEF.photo; photo.src = DEF.photo; if (mirror) mirror.src = DEF.photo; if (stage) stage.classList.remove('hero-custom'); }
            else if (photo.parentNode && photo.parentNode.parentNode) photo.parentNode.remove();
        };
    }
    // цвет под строкой состояния = цвет верха самой фото (у своего фото небо другое, чем у стандартного)
    var tinted = '';
    function tint(src) {
        if (!src || src === tinted) return;
        tinted = src;
        try {
            var im = new Image(); im.crossOrigin = 'anonymous';
            im.onload = function () {
                if (src !== tinted) return;          // успела прийти другая фото — этот результат устарел
                try {
                    var c = document.createElement('canvas'); c.width = 8; c.height = 2;
                    var g = c.getContext('2d'); g.drawImage(im, 0, 0, im.naturalWidth, Math.max(2, im.naturalHeight * 0.05), 0, 0, 8, 2);
                    var d = g.getImageData(0, 0, 8, 2).data, r = 0, gg = 0, b = 0, n = d.length / 4;
                    for (var i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
                    document.documentElement.style.setProperty('--hero-top', 'rgb(' + Math.round(r / n) + ',' + Math.round(gg / n) + ',' + Math.round(b / n) + ')');
                    if (typeof window.syncTopTint === 'function') window.syncTopTint();
                } catch (e) { /* фото с другого адреса без разрешения — оставляем цвет темы */ }
            };
            im.src = src;
        } catch (e) { /* не страшно */ }
    }
    var busy = false, last = 0;
    function refresh(force) {
        if (busy || (!force && Date.now() - last < 15000)) return;
        busy = true;
        fetch(SERVER_URL + '/api/site').then(function (r) { return r.json(); }).then(function (d) {
            last = Date.now();
            if (d && d.ok && d.hero) { lsSet(d.hero); apply(d.hero); }
        }).catch(function () { /* оставляем, что было */ }).then(function () { busy = false; });
    }
    apply(lsGet());
    if (!cur && DEF.photo) tint(DEF.photo);
    refresh(true);
    var st = window.switchTab;
    if (typeof st === 'function') window.switchTab = function (n) { var r = st.apply(this, arguments); if (n === 'search') refresh(false); return r; };
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(false); });
    var hooked = null;
    setInterval(function () {
        var s = typeof socket !== 'undefined' ? socket : null;
        if (s && s !== hooked && typeof s.on === 'function') { hooked = s; s.on('site-changed', function () { refresh(true); }); }
    }, 3000);

    // iOS красит область под часами «плашкой» цвета страницы, пока страница лежит ровно на нулевой отметке, и показывает фото под часами,
    // как только она хоть чуть сдвинута. Поэтому держим страницу на 1 пикселе от верха: фото всегда уходит под часы.
    var touching = false, nt = 0;
    function nudge() {
        var ts = document.getElementById('tab-search'), gs = document.getElementById('group-screen');
        if (!ts || ts.style.display === 'none' || (gs && gs.style.display && gs.style.display !== 'none')) return;
        if (document.hidden || touching || (window.scrollY || 0) >= 1 || document.documentElement.scrollHeight <= window.innerHeight + 4) return;
        window.scrollTo(0, 1);
    }
    function nudgeSoon() { clearTimeout(nt); nt = setTimeout(nudge, 160); }
    window.addEventListener('scroll', nudgeSoon, { passive: true });
    window.addEventListener('touchstart', function () { touching = true; }, { passive: true });
    window.addEventListener('touchend', function () { touching = false; nudgeSoon(); }, { passive: true });
    window.addEventListener('touchcancel', function () { touching = false; nudgeSoon(); }, { passive: true });
    window.addEventListener('pageshow', nudgeSoon);
    window.addEventListener('load', nudgeSoon);
    document.addEventListener('visibilitychange', nudgeSoon);
    setTimeout(nudgeSoon, 600); setTimeout(nudgeSoon, 1800);
})();
