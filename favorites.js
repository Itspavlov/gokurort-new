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
    btn.innerHTML = `<i class="fas fa-heart"></i><span>${on ? 'В избранном' : 'В избранное'}</span>`;
}

const _openListingFav = openListing;
openListing = function (adId) {
    const r = _openListingFav.apply(this, arguments);
    setTimeout(() => {
        const ad = typeof listingAd !== 'undefined' ? listingAd : null;
        const bar = document.querySelector('#listing-screen .listing-actions, .listing-actions');
        if (!ad || String(ad.id) !== String(adId) || !bar || bar.querySelector('.act-fav')) return;
        pushRecent(ad);
        if (String(ad.id).startsWith('my-')) return;       // локальные черновики в избранное не добавляем
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'act-fav';
        bar.insertBefore(b, bar.querySelector('.act-write'));
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

let favList = [];
function paintFavSections() {
    const fav = document.getElementById('favBox'), rec = document.getElementById('recentBox');
    if (fav) fav.innerHTML = favList.length ? favList.map(l => favCardHTML(l, true)).join('') : '<p class="profile-foot" style="margin:6px 0 0">Нажмите «В избранное» в карточке жилья, чтобы вернуться к нему позже.</p>';
    const secF = document.getElementById('favSec'); if (secF) secF.querySelector('h2').textContent = 'Избранное' + (favList.length ? ': ' + favList.length : '');
    const r = getRecent();
    if (rec) { rec.innerHTML = r.map(x => favCardHTML(x, false)).join(''); const s = document.getElementById('recentSec'); if (s) s.hidden = !r.length; }
}

function refreshFavSections() {
    if (!document.getElementById('favBox')) return;
    if (!getToken()) { favList = []; paintFavSections(); return; }
    favApi('/api/favorites').then(d => { if (d && d.ok) { favIds = new Set(d.ids); favList = d.listings || []; paintFavSections(); } }).catch(() => {});
}

const _renderProfileFav = renderProfile;
renderProfile = function () {
    _renderProfileFav.apply(this, arguments);
    const root = document.getElementById('profileRoot');
    if (!root) return;
    const foot = Array.from(root.children).reverse().find(c => c.classList.contains('profile-foot'));
    const html = `<div id="favSec"><div class="section-head" style="margin-top:22px"><h2 class="section-title">Избранное</h2></div><div id="favBox" class="req-mine"></div></div>
        <div id="recentSec" hidden><div class="section-head" style="margin-top:22px"><h2 class="section-title">Недавно смотрели</h2></div><div id="recentBox" class="req-mine"></div></div>`;
    if (foot) foot.insertAdjacentHTML('beforebegin', html); else root.insertAdjacentHTML('beforeend', html);
    if (!root._favBound) { root._favBound = true; root.addEventListener('click', onFavClick); }
    paintFavSections(); refreshFavSections();
};

function onFavClick(ev) {
    const b = ev.target.closest('#favBox button[data-a], #recentBox button[data-a]'); if (!b) return;
    const card = b.closest('.opt-card'); const id = card.dataset.lid;
    if (b.dataset.a === 'open') {
        const l = favList.find(x => x.id === id);
        if (l) { openAdFromCard(l); return; }
        // из «недавно смотрели»: берём объявление с сервера, если его ещё нет в памяти
        if (typeof findAd === 'function' && findAd(id)) openListing(id);
        else if (typeof fetchFullAd === 'function') fetchFullAd(id, (ok) => { if (ok) openListing(id); else showToast('Объявление больше недоступно'); });
    } else if (b.dataset.a === 'unfav') {
        favApi('/api/favorites', { id, on: false }).then(d => { if (d.ok) { favIds = new Set(d.ids); favList = favList.filter(x => x.id !== id); paintFavSections(); } else showToast(d.message || 'Не удалось'); }).catch(() => showToast('Нет связи с сервером'));
    }
}
