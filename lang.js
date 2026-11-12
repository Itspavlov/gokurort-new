// ============================================
// LANG.JS — переключатель языка Русский / English.
// Надписи интерфейса переводятся по словарю lang-dict.js: и те, что уже на экране, и те, что появятся позже
// (за новыми надписями следит MutationObserver). Тексты людей — объявления, имена, сообщения, комментарии —
// не переводятся. Выбранный язык хранится в localStorage (tell-lang).
// Строка, которой нет в словаре, остаётся по-русски; английский текст при возврате на русский откатывается.
// ============================================
(function () {
    const KEY = 'tell-lang';
    const CYR = /[А-Яа-яЁё]/;
    const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
    const SKIP = 'script, style, .chat-message:not(.chat-message-ad) .chat-bubble, [data-ugc], [data-i18n-skip]';

    let lang = 'ru';
    try { lang = localStorage.getItem(KEY) === 'en' ? 'en' : 'ru'; } catch (_) {}

    // ---- словарь ----
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    const exact = new Map();
    let phraseRe = null;
    function buildDict() {
        const lines = String(window.LANG_EN_TEXT || '').split('\n');
        const longPairs = [];
        for (const line of lines) {
            const i = line.indexOf(' => ');
            if (i < 1) continue;
            const ru = norm(line.slice(0, i)), en = line.slice(i + 4).trim();
            if (!ru || exact.has(ru)) continue;
            exact.set(ru, en);
            if (ru.length >= 5 && ru !== en) longPairs.push(ru);
        }
        longPairs.sort((a, b) => b.length - a.length);
        const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        try {
            phraseRe = new RegExp('(?<![А-Яа-яЁё])(?:' + longPairs.map(esc).join('|') + ')(?![А-Яа-яЁё])', 'g');
        } catch (_) { phraseRe = null; }   // старый браузер без lookbehind: работает только точное совпадение
    }

    // ---- числа и склонения ----
    const MONTHS = { 'января': 'Jan', 'февраля': 'Feb', 'марта': 'Mar', 'апреля': 'Apr', 'мая': 'May', 'июня': 'Jun', 'июля': 'Jul', 'августа': 'Aug', 'сентября': 'Sep', 'октября': 'Oct', 'ноября': 'Nov', 'декабря': 'Dec' };
    const SHORT_MONTHS = { 'янв': 'Jan', 'фев': 'Feb', 'мар': 'Mar', 'апр': 'Apr', 'июн': 'Jun', 'июл': 'Jul', 'авг': 'Aug', 'сен': 'Sep', 'окт': 'Oct', 'ноя': 'Nov', 'дек': 'Dec' };
    const N = '(\\d[\\d\\s]*)';
    const NOT_CYR = '(?![А-Яа-яЁё])';
    const plural = (re, one, many) => [new RegExp(N + '\\s*' + re + NOT_CYR, 'g'), (m, n) => n + ' ' + (parseInt(n.replace(/\s/g, ''), 10) === 1 ? one : many)];
    const RULES = [
        plural('объявлени[а-яё]*', 'listing', 'listings'),
        plural('ноч[а-яё]*', 'night', 'nights'),
        plural('гост(?:ь|я|ей|ям)', 'guest', 'guests'),
        plural('отзыв[а-яё]*', 'review', 'reviews'),
        plural('запрос[а-яё]*', 'request', 'requests'),
        plural('предложени[а-яё]*', 'offer', 'offers'),
        plural('комнат[а-яё]*', 'room', 'rooms'),
        plural('участник[а-яё]*', 'member', 'members'),
        plural('мест[а-яё]*', 'seat', 'seats'),
        plural('человек[а-яё]*', 'person', 'people'),
        plural('карточ[а-яё]+', 'card', 'cards'),
        plural('фото', 'photo', 'photos'),
        [/(^|\s)от(?=\s\d)/g, (m, sp) => sp + 'from'],
        [/(^|\s)до(?=\s\d)/g, (m, sp) => sp + 'up to'],
        [/\/сут(?:ки)?(?![А-Яа-яЁё])/g, () => '/night'],
        [new RegExp(N + '\\s*км' + NOT_CYR, 'g'), (m, n) => n + ' km'],
        [new RegExp(N + '\\s*м(?![А-Яа-яЁё²])', 'g'), (m, n) => n + ' m'],
        [new RegExp(N + '\\s*мин' + NOT_CYR, 'g'), (m, n) => n + ' min'],
        [new RegExp(N + '\\s*ч' + NOT_CYR, 'g'), (m, n) => n + ' h'],
        [new RegExp(N + '\\s*дн' + NOT_CYR, 'g'), (m, n) => n + ' d'],
        [new RegExp('(\\d+)\\s+(' + Object.keys(MONTHS).join('|') + ')' + NOT_CYR, 'g'), (m, d, mo) => MONTHS[mo] + ' ' + d],
        [new RegExp('(\\d+)\\s+(' + Object.keys(SHORT_MONTHS).join('|') + ')\\.?' + NOT_CYR, 'g'), (m, d, mo) => SHORT_MONTHS[mo] + ' ' + d]
    ];

    const cache = new Map();
    function toEn(ru) {
        const key = norm(ru);
        if (!key || !CYR.test(key)) return null;
        if (cache.has(key)) return cache.get(key);
        let out = exact.get(key);
        if (out === undefined) {
            out = key;
            if (phraseRe) out = out.replace(phraseRe, (m) => exact.get(m) || m);
            for (const [re, fn] of RULES) out = out.replace(re, fn);
            if (out === key) out = null;
        }
        if (cache.size > 4000) cache.clear();
        cache.set(key, out);
        return out;
    }
    // сохраняем пробелы по краям, как были в исходном тексте
    function translateText(src) {
        const en = toEn(src);
        if (en === null) return null;
        const lead = src.match(/^\s*/)[0], tail = src.match(/\s*$/)[0];
        return lead + en + tail;
    }

    // ---- обход страницы ----
    const textOrig = new WeakMap();          // узел -> { ru, en }
    const attrOrig = new WeakMap();          // элемент -> { attr: { ru, en } }
    const tracked = new Set();               // WeakRef на то, что переведено (чтобы откатить на русский)
    let obs = null;

    const skipped = (el) => !el || (el.closest && el.closest(SKIP));

    function doText(node) {
        const cur = node.data;
        const rec = textOrig.get(node);
        if (rec && cur === rec.en) return;                // уже наш перевод
        if (!CYR.test(cur)) return;
        if (skipped(node.parentElement)) return;
        const en = translateText(cur);
        if (en === null) return;
        textOrig.set(node, { ru: cur, en });
        tracked.add(new WeakRef(node));
        node.data = en;
    }
    function doAttrs(el) {
        if (!el.getAttribute || skipped(el)) return;
        for (const a of ATTRS) {
            const v = el.getAttribute(a);
            if (!v || !CYR.test(v)) continue;
            const rec = (attrOrig.get(el) || {})[a];
            if (rec && v === rec.en) continue;
            const en = translateText(v);
            if (en === null) continue;
            const all = attrOrig.get(el) || {};
            all[a] = { ru: v, en };
            attrOrig.set(el, all);
            tracked.add(new WeakRef(el));
            el.setAttribute(a, en);
        }
    }
    function walk(root) {
        if (!root) return;
        if (root.nodeType === 3) { doText(root); return; }
        if (root.nodeType !== 1) return;
        if (root.matches && root.matches(SKIP)) return;
        doAttrs(root);
        const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
            acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIP)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
        });
        let n;
        while ((n = tw.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
    }
    function translateTitle() {
        if (lang !== 'en') return;
        const t = document.title, en = translateText(t);
        if (en !== null) document.title = en;
    }

    function onMutations(list) {
        if (lang !== 'en') return;
        for (const m of list) {
            if (m.type === 'childList') m.addedNodes.forEach(walk);
            else if (m.type === 'characterData') doText(m.target);
            else if (m.type === 'attributes') doAttrs(m.target);
        }
        obs.takeRecords();                                // свои правки не разбираем второй раз
    }
    function startObs() {
        if (obs) return;
        obs = new MutationObserver(onMutations);
        obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    }
    function stopObs() { if (obs) { obs.disconnect(); obs = null; } }

    function revert() {
        for (const ref of tracked) {
            const n = ref.deref();
            if (!n) continue;
            if (n.nodeType === 3) { const r = textOrig.get(n); if (r && n.data === r.en) n.data = r.ru; }
            else {
                const all = attrOrig.get(n) || {};
                for (const a of Object.keys(all)) if (n.getAttribute(a) === all[a].en) n.setAttribute(a, all[a].ru);
            }
        }
        tracked.clear();
    }

    // ---- публичное API ----
    function apply() {
        document.documentElement.setAttribute('lang', lang);
        if (lang === 'en') {
            if (!exact.size) buildDict();
            walk(document.body);
            translateTitle();
            startObs();
            obs.takeRecords();
        } else {
            stopObs();
            revert();
            if (window.__ruTitle) document.title = window.__ruTitle;
        }
        document.querySelectorAll('[data-lang]').forEach((b) => {
            const on = b.dataset.lang === lang;
            b.classList.toggle('on', on);
            b.setAttribute('aria-pressed', String(on));
        });
    }
    window.__ruTitle = document.title;
    window.getLang = () => lang;
    window.setLang = function (l) {
        l = l === 'en' ? 'en' : 'ru';
        if (l === lang) return;
        lang = l;
        try { localStorage.setItem(KEY, l); } catch (_) {}
        apply();
    };

    document.addEventListener('click', (ev) => {
        const b = ev.target.closest && ev.target.closest('[data-lang]');
        if (b) window.setLang(b.dataset.lang);
    });

    if (lang === 'en') apply(); else document.documentElement.setAttribute('lang', 'ru');
})();
