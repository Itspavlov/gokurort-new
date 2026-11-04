// ============================================
// TELL — мой профиль, мои объявления, диалоги
// Данные хранятся на этом устройстве (localStorage)
// ============================================

// ---------- ФОТО: уменьшаем перед сохранением ----------
function fileToDataURL(file, maxSide, quality) {
    return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onerror = reject;
        fr.onload = () => {
            const img = new Image();
            img.onerror = reject;
            img.onload = () => {
                const k = Math.min(1, maxSide / Math.max(img.width, img.height));
                const c = document.createElement('canvas');
                c.width = Math.round(img.width * k);
                c.height = Math.round(img.height * k);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                resolve(c.toDataURL('image/jpeg', quality));
            };
            img.src = fr.result;
        };
        fr.readAsDataURL(file);
    });
}

// ---------- НИЖНЯЯ ШТОРКА ----------
function openSheet(title, bodyHTML, onMount) {
    closeSheet();
    const el = document.createElement('div');
    el.id = 'sheet';
    el.className = 'sheet-overlay';
    el.innerHTML = `
        <div class="sheet-panel">
            <div class="sheet-grab"></div>
            <div class="sheet-title">${title}</div>
            ${bodyHTML}
        </div>`;
    el.addEventListener('click', (ev) => { if (ev.target === el) closeSheet(); });
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('open'));
    if (onMount) onMount(el);
}

function closeSheet() {
    const el = document.getElementById('sheet');
    if (el) el.remove();
}

// ============================================
// ВКЛАДКА «ПРОФИЛЬ»
// ============================================
function renderProfile() {
    const root = document.getElementById('profileRoot');
    if (!root) return;
    const e = escapeHtml;
    const p = getProfile();
    const mine = myAdsAll();

    const meta = [
        p.city ? `<span><i class="fas fa-location-dot"></i>${e(p.city)}</span>` : '',
        p.phone ? `<span><i class="fas fa-phone"></i>${e(p.phone)}</span>` : ''
    ].join('');

    const rows = mine.map(ad => `
        <div class="my-ad">
            <div class="my-ad-thumb" onclick="openListing('${ad.id}')">${ad.image ? `<img src="${ad.image}" alt="">` : '<i class="fas fa-image"></i>'}</div>
            <div class="my-ad-info" onclick="openListing('${ad.id}')">
                <div class="my-ad-title">${e(ad.title)}</div>
                <div class="my-ad-price">${e(ad.price)}</div>
                <div class="my-ad-loc">${e(ad.location || '')}</div>
            </div>
            <div class="my-ad-actions">
                <button onclick="openAdForm('${ad.id}')" aria-label="Изменить"><i class="fas fa-pen"></i></button>
                <button onclick="deleteMyAd('${ad.id}')" aria-label="Удалить"><i class="fas fa-trash"></i></button>
            </div>
        </div>`).join('');

    root.innerHTML = (typeof accountCardHTML === 'function' ? accountCardHTML() : '') + `
        <div class="profile-hero">
            <div class="avatar-circle profile-avatar">${p.avatar ? `<img src="${p.avatar}" alt="">` : '<i class="fas fa-user"></i>'}</div>
            <div class="profile-name">${e(p.name || 'Гость')}</div>
            ${meta ? `<div class="profile-meta">${meta}</div>` : ''}
            <p class="profile-about ${p.about ? '' : 'muted'}">${p.about ? e(p.about) : 'Расскажите о себе: с теми, кого видно, общаются охотнее.'}</p>
            <button class="ghost-btn" onclick="openProfileEditor()"><i class="fas fa-pen"></i> Редактировать профиль</button>
        </div>

        <div class="section-head"><h2 class="section-title">Мои объявления</h2></div>
        ${mine.length ? `<div class="my-ads">${rows}</div>` : `
            <div class="placeholder">
                <span class="placeholder-icon"><i class="fas fa-house-chimney"></i></span>
                <h2 class="placeholder-title">Сдаёте или продаёте жильё?</h2>
                <p class="placeholder-text">Добавьте фото, условия заселения, место на карте и свободные даты. Объявление появится в чате «Жильё».</p>
            </div>`}
        <button class="primary-btn wide-btn" onclick="openAdForm()"><i class="fas fa-plus"></i> Добавить жильё</button>
        <p class="profile-foot">Профиль и объявления сохраняются на этом устройстве.</p>
    `;
}

// ---------- РЕДАКТОР ПРОФИЛЯ ----------
function openProfileEditor() {
    const p = getProfile();
    let avatar = p.avatar || '';
    const e = escapeHtml;

    openSheet('Мой профиль', `
        <div class="avatar-edit">
            <div class="avatar-circle avatar-sm" id="pfAvatar">${avatar ? `<img src="${avatar}" alt="">` : '<i class="fas fa-user"></i>'}</div>
            <div class="avatar-edit-btns">
                <button class="ghost-btn small" id="pfPick" type="button"><i class="fas fa-camera"></i> Фото</button>
                <button class="ghost-btn small" id="pfDrop" type="button">Убрать</button>
            </div>
            <input type="file" id="pfFile" accept="image/*" hidden>
        </div>
        <label class="field"><span>Имя</span><input id="pfName" maxlength="30" value="${e(p.name || '')}" placeholder="Как к вам обращаться"></label>
        <label class="field"><span>Телефон</span><input id="pfPhone" type="tel" maxlength="20" value="${e(p.phone || '')}" placeholder="+7 900 000-00-00"></label>
        <label class="field"><span>Город</span><input id="pfCity" maxlength="40" value="${e(p.city || '')}" placeholder="Где живёте"></label>
        <label class="field"><span>О себе</span><textarea id="pfAbout" rows="3" maxlength="300" placeholder="Пара слов для гостей и хозяев">${e(p.about || '')}</textarea></label>
        <button class="primary-btn wide-btn" id="pfSave" type="button">Сохранить</button>
    `, (root) => {
        const file = root.querySelector('#pfFile');
        const box = root.querySelector('#pfAvatar');
        root.querySelector('#pfPick').onclick = () => file.click();
        root.querySelector('#pfDrop').onclick = () => { avatar = ''; box.innerHTML = '<i class="fas fa-user"></i>'; };
        file.onchange = async () => {
            if (!file.files[0]) return;
            try {
                avatar = await fileToDataURL(file.files[0], 320, 0.8);
                box.innerHTML = `<img src="${avatar}" alt="">`;
            } catch (err) { showToast('Не удалось открыть фото'); }
        };
        root.querySelector('#pfSave').onclick = () => {
            const name = root.querySelector('#pfName').value.trim();
            if (!name) { showToast('Укажите имя'); return; }
            saveProfile({
                name,
                phone: root.querySelector('#pfPhone').value.trim(),
                city: root.querySelector('#pfCity').value.trim(),
                about: root.querySelector('#pfAbout').value.trim(),
                avatar
            });
            closeSheet();
            renderProfile();
            showToast('Профиль сохранён');
        };
    });
}

function deleteMyAd(id) {
    if (!confirm('Удалить объявление?')) return;
    if (isRemoteAdId(id)) { deleteRemoteAd(id); return; }
    saveMyAds(getMyAds().filter(a => String(a.id) !== String(id)));
    renderProfile();
    renderFeatured();
    showToast('Объявление удалено');
}

// ============================================
// ВКЛАДКА «СООБЩЕНИЯ» — список личных чатов
// ============================================
function fmtAgo(ts) {
    const min = Math.floor((Date.now() - ts) / 60000);
    if (min < 1) return 'только что';
    if (min < 60) return min + ' мин назад';
    const h = Math.floor(min / 60);
    if (h < 24) return h + ' ч назад';
    return Math.floor(h / 24) + ' дн назад';
}

// ============================================
// ФОРМА «ДОБАВИТЬ / ИЗМЕНИТЬ ЖИЛЬЁ»
// ============================================
let formState = null;
let pickMap = null;
let pickMarkers = {};
let formCal = null;

function openAdForm(editId) {
    const old = editId ? myAdsAll().find(a => String(a.id) === String(editId)) : null;
    if (old && old.partial) { fetchFullAd(old.id, (ok) => { if (ok) openAdForm(editId); }); return; }
    const f = (old && old.form) || {};
    const e = escapeHtml;

    formState = {
        id: old ? old.id : null,
        since: old ? old.since : new Date().getFullYear(),
        type: old ? old.type : 'rent',
        photos: old ? [...(old.photos || [])] : [],
        amenities: new Set(old ? old.amenities : []),
        busy: new Set(old ? old.busy : []),
        coords: old && old.coords ? old.coords.slice() : MAP_DEFAULT.slice(),
        beach: old && old.beach ? old.beach.slice() : BEACH_DEFAULT.slice(),
        pick: 'home'
    };

    let screen = document.getElementById('form-screen');
    if (!screen) {
        screen = document.createElement('section');
        screen.id = 'form-screen';
        screen.className = 'listing-screen form-screen';
        document.body.appendChild(screen);
    }

    screen.innerHTML = `
        <div class="form-top">
            <button class="chat-back-btn" onclick="closeAdForm()" aria-label="Закрыть"><i class="fas fa-xmark"></i></button>
            <div class="form-top-title">${old ? 'Изменить объявление' : 'Новое объявление'}</div>
        </div>

        <div class="listing-scroll form-scroll" id="formScroll">
            <div class="seg" id="fmType">
                <button type="button" data-type="rent" class="${formState.type === 'rent' ? 'on' : ''}">Сдаю</button>
                <button type="button" data-type="sale" class="${formState.type === 'sale' ? 'on' : ''}">Продаю</button>
            </div>

            <div class="form-block">
                <div class="form-h">Фото</div>
                <div class="photo-grid" id="fmPhotos"></div>
                <input type="file" id="fmFile" accept="image/*" multiple hidden>
                <div class="form-hint">До 8 фото. Первое станет обложкой.</div>
            </div>

            <div class="form-block">
                <label class="field"><span>Название</span><input id="fmTitle" maxlength="60" value="${e(old ? old.title : '')}" placeholder="Например: Студия у моря"></label>
                <label class="field"><span id="fmPriceLabel">Цена за сутки, ₽</span><input id="fmPrice" type="number" inputmode="numeric" min="0" value="${old ? old.priceNum : ''}" placeholder="2500"></label>
                <label class="field"><span>Адрес</span><input id="fmAddr" maxlength="80" value="${e(old ? old.location : '')}" placeholder="Улица, дом"></label>
                <label class="field"><span>Описание</span><textarea id="fmDesc" rows="4" maxlength="800" placeholder="Что есть в жилье, чем оно удобно">${e(old ? old.description : '')}</textarea></label>
                <label class="field"><span id="fmRoomsLabel">Комнаты и площадь</span><input id="fmRooms" maxlength="40" value="${e(f.rooms || '')}" placeholder="1 комната · 32 м²"></label>
            </div>

            <div class="form-block only-rent">
                <label class="field"><span>Сколько гостей</span><input id="fmGuests" type="number" inputmode="numeric" min="1" max="30" value="${e(f.guests || '')}" placeholder="3"></label>
                <div class="form-h">Удобства</div>
                <div class="chip-row" id="fmAmen">${AMENITIES.map(a =>
                    `<button type="button" class="chip chip-toggle ${formState.amenities.has(a.l) ? 'on' : ''}" data-a="${e(a.l)}"><i class="fas ${a.i}"></i>${e(a.l)}</button>`).join('')}</div>
            </div>

            <div class="form-block only-rent">
                <div class="form-h">Условия заселения</div>
                <div class="two-cols">
                    <label class="field"><span>Заезд с</span><input id="fmIn" type="time" value="${e(f.from || '14:00')}"></label>
                    <label class="field"><span>Выезд до</span><input id="fmOut" type="time" value="${e(f.out || '12:00')}"></label>
                </div>
                <label class="field"><span>Залог</span><input id="fmDeposit" maxlength="60" value="${e(f.deposit || '')}" placeholder="2000 ₽ или «не нужен»"></label>
                <label class="field"><span>Как заселиться</span><input id="fmHow" maxlength="120" value="${e(f.how || '')}" placeholder="Встречу лично, ключ в боксе…"></label>
                <label class="field"><span>Правила (каждое с новой строки)</span><textarea id="fmRules" rows="3" maxlength="400" placeholder="Без вечеринок&#10;Можно с детьми">${e(f.rules || '')}</textarea></label>
            </div>

            <div class="form-block">
                <div class="form-h">Где находится</div>
                <div class="seg seg-small" id="fmPick">
                    <button type="button" data-pick="home" class="on"><i class="fas fa-home"></i> Жильё</button>
                    <button type="button" data-pick="sea"><i class="fas fa-umbrella-beach"></i> Ближайшее море</button>
                </div>
                <div class="listing-map pick-map" id="pickMap"></div>
                <div class="pick-bar">
                    <div class="pick-dist" id="pickDist"></div>
                    <button type="button" class="ghost-btn small" id="fmLocate"><i class="fas fa-crosshairs"></i> Я здесь</button>
                </div>
                <div class="form-hint">Нажмите на карту, чтобы поставить метку. Расстояние до моря посчитается само.</div>
            </div>

            <div class="form-block only-rent">
                <div class="form-h">Занятые даты</div>
                <div class="cal" id="fmCal"></div>
            </div>

            <div class="form-save-space"></div>
        </div>

        <div class="listing-actions">
            <button class="act-call" onclick="closeAdForm()"><span>Отмена</span></button>
            <button class="act-write" id="fmSave"><i class="fas fa-check"></i><span>${old ? 'Сохранить' : 'Опубликовать'}</span></button>
        </div>
    `;

    screen.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    wireAdForm(screen);
    applyFormType(screen);
    renderFormPhotos();
    formCal = buildCalendar(document.getElementById('fmCal'), { busy: formState.busy, edit: true });
    setTimeout(initPickMap, 80);
}

function applyFormType(screen) {
    const sale = formState.type === 'sale';
    screen.querySelectorAll('.only-rent').forEach(el => el.style.display = sale ? 'none' : '');
    document.getElementById('fmPriceLabel').textContent = sale ? 'Цена, ₽' : 'Цена за сутки, ₽';
    document.getElementById('fmRoomsLabel').textContent = sale ? 'Площадь и комнаты' : 'Комнаты и площадь';
    document.getElementById('fmRooms').placeholder = sale ? '120 м² · 4 комнаты · участок 6 соток' : '1 комната · 32 м²';
    document.querySelectorAll('#fmType button').forEach(b => b.classList.toggle('on', b.dataset.type === formState.type));
}

function wireAdForm(screen) {
    screen.querySelector('#fmType').onclick = (ev) => {
        const b = ev.target.closest('button[data-type]');
        if (!b) return;
        formState.type = b.dataset.type;
        applyFormType(screen);
    };

    screen.querySelector('#fmAmen').onclick = (ev) => {
        const b = ev.target.closest('.chip-toggle');
        if (!b) return;
        const a = b.dataset.a;
        if (formState.amenities.has(a)) formState.amenities.delete(a); else formState.amenities.add(a);
        b.classList.toggle('on');
    };

    const file = screen.querySelector('#fmFile');
    file.onchange = async () => {
        const room = 8 - formState.photos.length;
        const picked = [...file.files].slice(0, Math.max(0, room));
        if (!picked.length) { showToast('Можно загрузить не больше 8 фото'); file.value = ''; return; }
        showToast('Загружаю фото…');
        for (const f of picked) {
            try { formState.photos.push(await fileToDataURL(f, 1000, 0.72)); } catch (err) { /* пропускаем битый файл */ }
        }
        file.value = '';
        renderFormPhotos();
    };

    screen.querySelector('#fmPhotos').onclick = (ev) => {
        const del = ev.target.closest('[data-del]');
        if (del) { formState.photos.splice(Number(del.dataset.del), 1); renderFormPhotos(); return; }
        if (ev.target.closest('.photo-add')) file.click();
    };

    screen.querySelector('#fmPick').onclick = (ev) => {
        const b = ev.target.closest('button[data-pick]');
        if (!b) return;
        formState.pick = b.dataset.pick;
        screen.querySelectorAll('#fmPick button').forEach(x => x.classList.toggle('on', x === b));
    };

    screen.querySelector('#fmLocate').onclick = () => {
        if (!navigator.geolocation) { showToast('Геолокация недоступна'); return; }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setPickPoint('home', [pos.coords.latitude, pos.coords.longitude]);
                if (pickMap) pickMap.setView(formState.coords, 16);
            },
            () => showToast('Не удалось определить место. Поставьте метку на карте.')
        );
    };

    screen.querySelector('#fmSave').onclick = saveAdForm;
}

function renderFormPhotos() {
    const grid = document.getElementById('fmPhotos');
    if (!grid) return;
    grid.innerHTML = formState.photos.map((src, i) => `
        <div class="photo-tile ${i === 0 ? 'cover' : ''}">
            <img src="${src}" alt="">
            <button type="button" data-del="${i}" aria-label="Убрать фото"><i class="fas fa-xmark"></i></button>
        </div>`).join('') +
        (formState.photos.length < 8 ? '<button type="button" class="photo-add"><i class="fas fa-camera"></i><span>Добавить</span></button>' : '');
}

// ---------- КАРТА ДЛЯ ВЫБОРА МЕСТА ----------
function initPickMap() {
    const el = document.getElementById('pickMap');
    if (!el) return;
    if (typeof L === 'undefined') {
        el.innerHTML = '<div class="map-fallback"><i class="fas fa-map"></i>Карта загрузится при подключении к интернету</div>';
        updatePickDist();
        return;
    }

    pickMap = L.map(el, { zoomControl: false, tap: false }).setView(formState.coords, 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(pickMap);
    L.control.zoom({ position: 'bottomright' }).addTo(pickMap);

    const pin = (cls, icon) => L.divIcon({
        className: 'map-pin-wrap',
        html: `<div class="map-pin ${cls}"><i class="fas ${icon}"></i></div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    });

    pickMarkers.home = L.marker(formState.coords, { icon: pin('pin-home', 'fa-home'), draggable: true }).addTo(pickMap);
    pickMarkers.sea = L.marker(formState.beach, { icon: pin('pin-sea', 'fa-umbrella-beach'), draggable: true }).addTo(pickMap);

    pickMarkers.home.on('dragend', () => { const p = pickMarkers.home.getLatLng(); formState.coords = [p.lat, p.lng]; updatePickDist(); });
    pickMarkers.sea.on('dragend', () => { const p = pickMarkers.sea.getLatLng(); formState.beach = [p.lat, p.lng]; updatePickDist(); });

    pickMap.on('click', (ev) => setPickPoint(formState.pick, [ev.latlng.lat, ev.latlng.lng]));

    pickMap.fitBounds([formState.coords, formState.beach], { padding: [50, 50], maxZoom: 16 });
    setTimeout(() => pickMap.invalidateSize(), 250);
    updatePickDist();
}

function setPickPoint(which, latlng) {
    if (which === 'home') formState.coords = latlng; else formState.beach = latlng;
    const marker = pickMarkers[which === 'home' ? 'home' : 'sea'];
    if (marker) marker.setLatLng(latlng);
    updatePickDist();
}

function updatePickDist() {
    const box = document.getElementById('pickDist');
    if (!box) return;
    const m = distMeters(formState.coords, formState.beach);
    box.innerHTML = `<i class="fas fa-umbrella-beach"></i> До моря <b>${fmtDist(m)}</b> · ≈ ${walkMinutes(m)} мин пешком`;
}

// ---------- СОХРАНЕНИЕ ----------
function saveAdForm() {
    const val = (id) => (document.getElementById(id) ? document.getElementById(id).value.trim() : '');
    const sale = formState.type === 'sale';

    const title = val('fmTitle');
    const priceNum = Number(val('fmPrice'));
    if (title.length < 3) { showToast('Введите название объявления'); return; }
    if (!priceNum || priceNum <= 0) { showToast('Укажите цену'); return; }

    const guests = val('fmGuests');
    const rooms = val('fmRooms');
    const from = val('fmIn'), out = val('fmOut');
    const deposit = val('fmDeposit'), how = val('fmHow');
    const rulesText = document.getElementById('fmRules') ? document.getElementById('fmRules').value : '';

    const facts = [];
    if (!sale && guests) facts.push({ i: 'fa-users', t: 'до ' + guests + ' гостей' });
    if (rooms) facts.push({ i: sale ? 'fa-ruler-combined' : 'fa-bed', t: rooms });

    const terms = [];
    if (!sale) {
        if (from) terms.push({ i: 'fa-door-open', l: 'Заезд', v: 'с ' + from });
        if (out) terms.push({ i: 'fa-door-closed', l: 'Выезд', v: 'до ' + out });
        if (deposit) terms.push({ i: 'fa-shield-halved', l: 'Залог', v: deposit });
        if (how) terms.push({ i: 'fa-key', l: 'Как заселиться', v: how });
    }

    const now = new Date();
    const ad = {
        id: formState.id || 'my-' + Date.now(),
        mine: true,
        since: formState.since,
        type: formState.type,
        title,
        priceNum,
        price: sale ? fmtMoney(priceNum) : fmtMoney(priceNum) + '/сут',
        location: val('fmAddr'),
        description: val('fmDesc'),
        image: formState.photos[0] || '',
        photos: [...formState.photos],
        date: 'Сегодня',
        time: p2(now.getHours()) + ':' + p2(now.getMinutes()),
        views: 0,
        isVerified: false,
        isUrgent: false,
        facts,
        amenities: [...formState.amenities],
        terms,
        rules: rulesText.split('\n').map(s => s.trim()).filter(Boolean),
        coords: formState.coords.slice(),
        beach: formState.beach.slice(),
        busy: sale ? [] : [...formState.busy].sort(),
        form: { rooms, guests, from, out, deposit, how, rules: rulesText }
    };

    // объявление публикуется на сервере: так его увидят все
    const remoteId = isRemoteAdId(formState.id) ? formState.id : null;
    const legacyId = formState.id && !remoteId ? formState.id : null;
    publishAd(ad, remoteId, (ok) => {
        if (!ok) return;
        if (legacyId) saveMyAds(getMyAds().filter(a => String(a.id) !== String(legacyId)));
        closeAdForm();
        renderProfile();
        renderFeatured();
        showToast('Готово: объявление видят все в чате «Жильё»');
    });
}

function closeAdForm() {
    if (pickMap) { pickMap.remove(); pickMap = null; }
    pickMarkers = {};
    formCal = null;
    const screen = document.getElementById('form-screen');
    if (screen) { screen.style.display = 'none'; screen.innerHTML = ''; }
    document.body.style.overflow = '';
}
