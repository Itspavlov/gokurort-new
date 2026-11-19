'use strict';
// ============================================
// Главная: «Чем заняться сегодня?»
// Живая лента без фильтров из трёх источников:
//   • афиша, которую ведёт администратор (события, истории про Архипо-Осиповку, интересные места);
//   • свежие «Сейчас ищут компанию» (курортный движ);
//   • свежие «Готовые услуги».
// Закреплённое в афише стоит первым, остальное — по свежести.
// ============================================
let tfAfisha = [], tfDviz = [], tfSvc = [], tfAt = 0, tfBusy = false, tfReady = false;
const TF_TTL = 60 * 1000;
const TF_KIND = {
    event: ['Событие', 'fa-ticket'], story: ['История', 'fa-book-open'], place: ['Интересное место', 'fa-mountain-sun'], news: ['Новость', 'fa-newspaper']
};
// пока ничего не загрузилось (или лента пуста) — идеи-подсказки, они ведут в нужные разделы
const TF_IDEAS = [
    { t: 'Встреча на пляже', s: 'Найди компанию', i: 'fa-user-group', go: "openDvizScreen('dviz')", g: 2 },
    { t: 'Прогулка на катере', s: 'Готовые услуги', i: 'fa-ship', go: "openDvizScreen('svc')", g: 3 },
    { t: 'Джипы в горы', s: 'К водопадам', i: 'fa-truck-monster', go: "openDvizScreen('svc')", g: 1 },
    { t: 'Закат у моря', s: 'Позови друзей', i: 'fa-sun', go: "openDvizScreen('dviz')", g: 0 }
];

function tfItems() {
    const out = [];
    tfAfisha.forEach((a, n) => {
        const k = TF_KIND[a.kind] || TF_KIND.event;
        out.push({ key: 'a' + a.id, kind: 'afisha', id: a.id, ts: a.updated || a.created || 0, pinned: !!a.pinned, title: a.title, tag: k[0], icon: k[1],
            sub: a.when ? dvWhen(a.when) : (a.place || ''), img: a.thumb || '', g: n % 4 });
    });
    const dv = (tfDviz.length ? tfDviz : (typeof dvFeed !== 'undefined' ? dvFeed : [])).slice(0, 6);
    dv.forEach((e, n) => out.push({ key: 'd' + e.id, kind: 'dviz', id: e.id, ts: e.created || 0, title: e.title, tag: 'Ищут компанию', icon: 'fa-user-group',
        sub: e.when ? dvWhen(e.when) : (e.place || ''), img: e.thumb || '', g: (n + 1) % 4 }));
    const sv = (tfSvc.length ? tfSvc : (typeof serviceFeed !== 'undefined' ? serviceFeed : [])).slice(0, 6);
    sv.forEach((s, n) => out.push({ key: 's' + s.id, kind: 'svc', id: s.id, ts: s.updated || s.created || 0, title: s.title,
        tag: (typeof SV_TAGS !== 'undefined' && SV_TAGS[s.tag]) || 'Услуга', icon: (typeof SV_ICONS !== 'undefined' && SV_ICONS[s.tag]) || 'fa-star',
        sub: [svPrice(s), s.city].filter(Boolean).join(' · '), img: s.thumb || '', g: (n + 3) % 4 }));
    // закреплённое сверху, дальше свежее; чтобы лента не превратилась в один вид, чередуем виды
    const pinned = out.filter(x => x.pinned).sort((a, b) => b.ts - a.ts);
    const rest = out.filter(x => !x.pinned).sort((a, b) => b.ts - a.ts);
    const lanes = { afisha: [], dviz: [], svc: [] };
    rest.forEach(x => lanes[x.kind].push(x));
    const mixed = [];
    while (mixed.length < rest.length) {
        for (const k of ['afisha', 'svc', 'dviz']) if (lanes[k].length) mixed.push(lanes[k].shift());
    }
    return [...pinned, ...mixed].slice(0, 14);
}

function tfCardHTML(x) {
    const e = escapeHtml;
    return `<button type="button" class="tf-card tf-g${x.g}" data-tf="${x.kind}" data-id="${e(String(x.id))}">
        <span class="tf-bg">${x.img ? `<img src="${e(x.img)}" alt="" decoding="async">` : `<i class="fas ${x.icon}"></i>`}</span>
        <span class="tf-ico"><i class="fas ${x.icon}"></i></span>
        ${x.pinned ? '<span class="tf-pin"><i class="fas fa-thumbtack"></i></span>' : ''}
        <span class="tf-txt"><em>${e(x.tag)}</em><b>${e(x.title)}</b>${x.sub ? `<small>${e(x.sub)}</small>` : ''}</span>
    </button>`;
}

// переопределяем прежнюю подборку объявлений: на главной теперь «Чем заняться сегодня?»
renderFeatured = function () {
    const list = document.getElementById('todayFeed');
    if (!list) return;
    const items = tfItems();
    const sig = items.map(x => [x.key, x.ts, x.title, x.sub, (x.img || '').length, x.pinned ? 1 : 0].join('~')).join('|') + (items.length ? '' : tfReady ? 'empty' : 'wait');
    if (list.dataset.sig === sig && list.children.length) { tfLoad(); return; }
    list.dataset.sig = sig;
    list.innerHTML = items.length ? items.map(tfCardHTML).join('')
        : TF_IDEAS.map(x => `<button type="button" class="tf-card tf-idea tf-g${x.g}" onclick="${x.go}"><span class="tf-bg"><i class="fas ${x.i}"></i></span>
            <span class="tf-ico"><i class="fas ${x.i}"></i></span><span class="tf-txt"><b>${escapeHtml(x.t)}</b><small>${escapeHtml(x.s)}</small></span></button>`).join('');
    tfLoad();
};

function tfLoad(force) {
    if (tfBusy || (!force && tfReady && Date.now() - tfAt < TF_TTL)) return;
    tfBusy = true;
    const get = (p) => fetch(SERVER_URL + p).then(r => r.json()).catch(() => null);
    Promise.all([get('/api/afisha'), get('/api/dviz'), get('/api/services?limit=12')]).then(([a, d, s]) => {
        if (a && a.ok) tfAfisha = a.items || [];
        if (d && d.ok) tfDviz = d.events || [];
        if (s && s.ok) tfSvc = s.services || [];
        tfReady = !!((a && a.ok) || (d && d.ok) || (s && s.ok));
        tfAt = Date.now();
    }).finally(() => { tfBusy = false; renderFeatured(); });
}

// нажатие на плитку
document.addEventListener('click', (ev) => {
    const c = ev.target.closest && ev.target.closest('.tf-card[data-tf]');
    if (!c) return;
    const id = c.dataset.id;
    if (c.dataset.tf === 'afisha') openAfishaView(id);
    else if (c.dataset.tf === 'dviz') openDvizView(id);
    else openServiceView(id);
});

// запись афиши целиком
function openAfishaView(id) {
    fetch(SERVER_URL + '/api/afisha/' + encodeURIComponent(id)).then(r => r.json()).then((d) => {
        if (!d || !d.ok) { showToast((d && d.message) || 'Запись уже убрана из афиши'); tfLoad(true); return; }
        const a = d.item, e = escapeHtml, k = TF_KIND[a.kind] || TF_KIND.event;
        const link = a.link && /^https?:\/\//i.test(a.link) ? a.link : '';
        openSheet(e(a.title), `
            ${a.image ? `<div class="sv-gallery"><img src="${e(a.image)}" alt=""></div>` : ''}
            <div class="dv-meta big">
                <span><i class="fas ${k[1]}"></i>${e(k[0])}</span>
                ${a.when ? `<span><i class="fas fa-clock"></i>${e(dvWhen(a.when))}</span>` : ''}
                ${a.place ? `<span><i class="fas fa-location-dot"></i>${e(a.place)}</span>` : ''}
            </div>
            ${a.text ? `<p class="sv-view-text tf-text">${e(a.text)}</p>` : ''}
            ${a.coords ? `<button type="button" class="ghost-btn wide-btn" data-af-map><i class="fas fa-map-location-dot"></i> Показать на карте</button>` : ''}
            ${link ? `<a class="primary-btn wide-btn tf-link" href="${e(link)}" target="_blank" rel="noopener noreferrer"><i class="fas fa-arrow-up-right-from-square"></i> Подробнее</a>` : ''}`,
        (el) => {
            const m = el.querySelector('[data-af-map]');
            if (m) m.onclick = () => openPointMap({ title: a.title, place: a.place, coords: a.coords, pin: 'flag', panel: typeof dvRouteHTML === 'function' ? dvRouteHTML(a.coords) : '' });
        });
    }).catch(() => showToast('Нет связи с сервером'));
}

// подсказки под поиском: нажал — сразу в нужный раздел
document.addEventListener('click', (ev) => {
    const h = ev.target.closest && ev.target.closest('.search-hint[data-q]');
    if (!h) return;
    const input = document.getElementById('searchInput');
    if (input) input.value = h.dataset.q;
    runSearch();
});

renderFeatured();
