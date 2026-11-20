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
            if (src !== cur) { cur = src; photo.src = src; if (mirror) mirror.src = src; }
            if (stage) stage.classList.toggle('hero-custom', src !== DEF.photo);
        }
    }
    if (photo) {
        photo.onerror = function () {          // вместо встроенного: упало своё фото — вернём стандартное, упало и оно — убираем кадр, как раньше
            if (cur && cur !== DEF.photo) { cur = DEF.photo; photo.src = DEF.photo; if (mirror) mirror.src = DEF.photo; if (stage) stage.classList.remove('hero-custom'); }
            else if (photo.parentNode && photo.parentNode.parentNode) photo.parentNode.remove();
        };
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
    refresh(true);
    var st = window.switchTab;
    if (typeof st === 'function') window.switchTab = function (n) { var r = st.apply(this, arguments); if (n === 'search') refresh(false); return r; };
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(false); });
    var hooked = null;
    setInterval(function () {
        var s = typeof socket !== 'undefined' ? socket : null;
        if (s && s !== hooked && typeof s.on === 'function') { hooked = s; s.on('site-changed', function () { refresh(true); }); }
    }, 3000);
})();
