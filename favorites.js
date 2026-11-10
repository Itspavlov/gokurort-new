// ============================================
// FAVORITES.JS — избранное (хранится на аккаунте) и «Недавно смотрели» (на устройстве).
// ============================================
let favIds = new Set();
const RECENT_KEY = 'yy-recent';

const favApi = (path, body) => fetch(SERVER_URL + path, body === undefined ? { headers: { Authorization: 'Bearer ' + getToken() } } : { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() }, body: JSON.stringify(body) }).then(r => r.json());

function loadFavIds(cb) {
    if (!getToken()) { favIds = new Set(); cb && cb(); return; }
    favApi('/api/favorites').then(d => { if (d && d.ok) { favIds = new Set(d.ids); cb && cb(d); } }).catch(() => {});
}

// ---------- недавно смотрели ----------
function getRecent() { try { const a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function pushRecent(ad) {
    if (!ad || !ad.id || String(ad.id).startsWith('my-')) return;
    try {
        const list = getRecent().filter(x => x.id !== ad.id);
        list.unshift({ id: ad.id, title: ad.title, price: ad.price, location: ad.location || '', thumb: (ad.thumb || ad.image || '').startsWith('data:') && (ad.thumb || ad.image).length > 60000 ? '' : (ad.thumb || ad.image || '') });
        localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 12)));
    } catch (e) {}
}

// ---------- сердечко в карточке объявления ----------
function paintFav(btn, id) {
    const on = favIds.has(id);
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on);
    btn.setAttribute('aria-label', on ? 'Убрать из избранного' : 'В избранное');
    btn.innerHTML = '<i class="fas fa-heart"></i>';
}

const _openListingFav = openListing;
openListing = function (adId) {
    const r = _openListingFav.apply(this, arguments);
    setTimeout(() => {
        const ad = typeof listingAd !== 'undefined' ? listingAd : null;
        const gal = document.querySelector('#listing-screen .listing-gallery');
        if (!ad || String(ad.id) !== String(adId) || !gal || gal.querySelector('.gallery-fav')) return;
        pushRecent(ad);
        if (String(ad.id).startsWith('my-')) return;       // локальные черновики в избранное не добавляем
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'gallery-fav';
        gal.appendChild(b);
        paintFav(b, ad.id);
        loadFavIds(() => paintFav(b, ad.id));
        b.addEventListener('click', () => {
            loginRequired(() => {
                const on = !favIds.has(ad.id);
                if (on) favIds.add(ad.id); else favIds.delete(ad.id);
                paintFav(b, ad.id);
                favApi('/api/favorites', { id: ad.id, on }).then(d => {
                    if (!d.ok) { if (on) favIds.delete(ad.id); else favIds.add(ad.id); paintFav(b, ad.id); showToast(d.message || 'Не удалось сохранить'); }
                    else { favIds = new Set(d.ids); showToast(on ? 'Добавлено в избранное' : 'Убрано из избранного'); refreshFavSections(); }
                }).catch(() => { if (on) favIds.delete(ad.id); else favIds.add(ad.id); paintFav(b, ad.id); showToast('Нет связи с сервером'); });
            });
        });
    }, 30);
    return r;
};

// ---------- открыть объявление из списка (даже если оно ещё не загружено) ----------
function openAdFromCard(light) {
    if (typeof findAd === 'function' && !findAd(light.id) && typeof normalizeRemoteAd === 'function') {
        try { remoteAds.push(normalizeRemoteAd(light)); } catch (e) {}
    }
    openListing(light.id);
}

// ---------- разделы в профиле ----------
function favCardHTML(l, withRemove) {
    return listingMiniHTML({ id: l.id, title: l.title, price: l.price, location: l.location, thumb: l.thumb || l.image || '' },
        `<button class="main" data-a="open">Открыть</button>${withRemove ? '<button data-a="unfav" aria-label="Убрать из избранного"><i class="fas fa-heart-crack"></i></button>' : ''}`);
}

// «Недавно смотрели»: карточки в одну строку, листаются вбок
function recentCardHTML(l) {
    const e = escapeHtml, t = l.thumb || l.image || '';
    return `<button type="button" class="rc-card" data-a="open" data-lid="${e(l.id)}"><span class="rc-thumb" style="${t ? 'background-image:url(' + e(t) + ')' : ''}"></span>
        <b>${e(l.title)}</b><small>${e(l.price || '')}</small>${l.location ? `<small class="rc-loc">${e(l.location)}</small>` : ''}</button>`;
}

let favList = [];
function paintFavSections() {
    const fav = document.getElementById('favBox'), rec = document.getElementById('recentBox');
    if (fav) fav.innerHTML = favList.length ? favList.map(l => favCardHTML(l, true)).join('')
        : `<div class="req-empty"><i class="fas fa-heart"></i><b>Пока пусто</b><span>${getToken() ? 'Нажмите «В избранное» в карточке жилья, чтобы вернуться к нему позже.' : 'Войдите в аккаунт, чтобы сохранять жильё в избранное.'}</span></div>`;
    const secF = document.getElementById('favHead'); if (secF) secF.textContent = 'Избранное' + (favList.length ? ': ' + favList.length : '');
    const r = getRecent();
    if (rec) { rec.innerHTML = r.map(recentCardHTML).join(''); const s = document.getElementById('recentSec'); if (s) s.hidden = !r.length; }
}

function refreshFavSections() {
    if (!document.getElementById('favBox')) return;
    if (!getToken()) { favList = []; paintFavSections(); return; }
    favApi('/api/favorites').then(d => { if (d && d.ok) { favIds = new Set(d.ids); favList = d.listings || []; paintFavSections(); } }).catch(() => {});
}

// ---------- окно «Избранное» (сердечко в шапке) ----------
function openFavorites() {
    openSheet('Избранное', `<div class="opt-sec" id="favHead">Избранное</div><div id="favBox" class="req-mine"></div>
        <div id="recentSec" hidden><div class="opt-sec" style="margin-top:16px">Недавно смотрели</div><div id="recentBox" class="recent-row"></div></div>`, (el) => {
        el.addEventListener('click', onFavClick);
        paintFavSections(); refreshFavSections();
    });
}
document.addEventListener('DOMContentLoaded', () => {
    const b = document.getElementById('favBtn');
    if (b) b.addEventListener('click', openFavorites);
});

function onFavClick(ev) {
    const b = ev.target.closest('#favBox button[data-a], #recentBox button[data-a]'); if (!b) return;
    const card = b.closest('.opt-card, .rc-card'); const id = card.dataset.lid;
    if (b.dataset.a === 'open') {
        const l = favList.find(x => x.id === id);
        if (l) { closeSheet(); openAdFromCard(l); return; }
        // из «недавно смотрели»: берём объявление с сервера, если его ещё нет в памяти
        if (typeof findAd === 'function' && findAd(id)) { closeSheet(); openListing(id); }
        else if (typeof fetchFullAd === 'function') fetchFullAd(id, (ok) => { if (ok) { closeSheet(); openListing(id); } else showToast('Объявление больше недоступно'); });
    } else if (b.dataset.a === 'unfav') {
        favApi('/api/favorites', { id, on: false }).then(d => { if (d.ok) { favIds = new Set(d.ids); favList = favList.filter(x => x.id !== id); paintFavSections(); } else showToast(d.message || 'Не удалось'); }).catch(() => showToast('Нет связи с сервером'));
    }
}

// ---------- сердечко на карточке в ленте жилья ----------
function paintCardFavs() {
    document.querySelectorAll('.card-fav[data-fav]').forEach(b => { const on = favIds.has(b.dataset.fav); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', on ? 'Убрать из избранного' : 'В избранное'); });
}
// Сердечко «улетает» с карточки в сердечко в шапке; там оно подпрыгивает
function flyHeartToFav(from) {
    const to = document.getElementById('roomFavBtn');
    if (!to || !from || !from.isConnected) return;
    const bump = () => { to.classList.remove('bump'); void to.offsetWidth; to.classList.add('bump'); setTimeout(() => to.classList.remove('bump'), 600); };
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !to.animate) { bump(); return; }
    const sz = 30, x0 = a.left + a.width / 2 - sz / 2, y0 = a.top + a.height / 2 - sz / 2;
    const dx = (b.left + b.width / 2 - sz / 2) - x0, dy = (b.top + b.height / 2 - sz / 2) - y0;
    const el = document.createElement('div');
    el.className = 'fly-heart';
    el.style.cssText = `left:${x0}px;top:${y0}px;width:${sz}px;height:${sz}px`;
    el.innerHTML = '<svg viewBox="0 0 24 24" width="100%" height="100%"><path fill="#FF5A6E" d="M12 21.2l-1.5-1.3C5.4 15.3 2 12.2 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.800 3 16.500 3 19.600 3 22 5.400 22 8.500c0 3.700-3.400 6.800-8.500 11.400L12 21.200z"/></svg>';
    document.body.appendChild(el);
    const anim = el.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1, offset: 0, easing: 'cubic-bezier(.2,.7,.4,1)' },
        { transform: `translate(${dx * .22}px,${dy * .22 - 36}px) scale(1.7) rotate(-12deg)`, opacity: 1, offset: .3, easing: 'cubic-bezier(.55,0,.8,.5)' },
        { transform: `translate(${dx}px,${dy}px) scale(.6) rotate(8deg)`, opacity: .95, offset: 1 }
    ], { duration: 800, fill: 'forwards' });
    anim.onfinish = () => { el.remove(); bump(); };
    anim.oncancel = () => { el.remove(); };
}
function toggleCardFav(id, btn) {
    loginRequired(() => {
        const on = !favIds.has(id);
        if (on) favIds.add(id); else favIds.delete(id);
        paintCardFavs();
        if (on && btn) { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); flyHeartToFav(btn); }
        favApi('/api/favorites', { id, on }).then(d => {
            if (!d.ok) { if (on) favIds.delete(id); else favIds.add(id); paintCardFavs(); showToast(d.message || 'Не удалось сохранить'); }
            else { favIds = new Set(d.ids); paintCardFavs(); showToast(on ? 'Добавлено в избранное' : 'Убрано из избранного'); refreshFavSections(); }
        }).catch(() => { if (on) favIds.delete(id); else favIds.add(id); paintCardFavs(); showToast('Нет связи с сервером'); });
    });
}
const _openGroupFav = openGroup;
openGroup = function () { const r = _openGroupFav.apply(this, arguments); if (getToken()) setTimeout(() => loadFavIds(paintCardFavs), 300); return r; };
const _placeRemoteAdsFav = placeRemoteAds;
placeRemoteAds = function () { const r = _placeRemoteAdsFav.apply(this, arguments); paintCardFavs(); return r; };
