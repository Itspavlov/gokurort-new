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
            <div class="sheet-head"><button type="button" class="sheet-back" data-sheet-close aria-label="Закрыть"><i class="fas fa-arrow-left"></i></button>
                <div class="sheet-title">${title}</div></div>
            ${bodyHTML}
        </div>`;
    el.addEventListener('click', (ev) => { if (ev.target === el || ev.target.closest('[data-sheet-close]')) closeSheet(); });
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('open'));
    attachSheetSwipe(el);
    if (onMount) onMount(el);
}

// Шторка закрывается и свайпом: тянуть можно за ручку и заголовок вверх или вниз, а за содержимое — вниз,
// когда оно прокручено до начала. Поля ввода, ползунки и календари не трогаем.
function attachSheetSwipe(el) {
    const panel = el.querySelector('.sheet-panel');
    if (!panel) return;
    let x0 = 0, y0 = 0, dy = 0, t0 = 0, state = 0, fromHead = false;      // state: 0 — не решено, 1 — тянем, -1 — не наше
    const finish = (closing) => {
        panel.style.transition = 'transform .22s ease-out';
        if (closing) {
            el.style.transition = 'opacity .2s'; el.style.opacity = '0';
            panel.style.transform = dy > 0 ? 'translateY(100%)' : 'translateY(-40px)';
            setTimeout(() => { if (document.getElementById('sheet') === el) closeSheet(); }, 200);
        } else { panel.style.transform = ''; el.style.opacity = ''; }
    };
    panel.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1 || e.target.closest('input, textarea, select, [data-noswipe], .cal, .cal-grid')) { state = -1; return; }
        const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; dy = 0; t0 = Date.now(); state = 0;
        fromHead = !!e.target.closest('.sheet-grab, .sheet-head');
    }, { passive: true });
    panel.addEventListener('touchmove', (e) => {
        if (state < 0 || e.touches.length !== 1) return;
        const t = e.touches[0], dx = t.clientX - x0; dy = t.clientY - y0;
        if (state === 0) {
            if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
            const vertical = Math.abs(dy) > Math.abs(dx) * 1.2;
            state = vertical && (fromHead || (dy > 0 && panel.scrollTop <= 0)) ? 1 : -1;
            if (state < 0) return;
            panel.style.transition = 'none';
        }
        const off = dy > 0 ? dy : dy * 0.35;                                   // вверх тянется туго
        panel.style.transform = 'translateY(' + off + 'px)';
        el.style.opacity = String(1 - Math.min(Math.abs(off) / 420, 0.6));
        if (e.cancelable) e.preventDefault();
    }, { passive: false });
    const end = () => {
        if (state !== 1) { state = 0; return; }
        state = 0;
        const dist = Math.abs(dy), speed = dist / Math.max(1, Date.now() - t0);
        finish(dist > 90 || (speed > 0.6 && dist > 30));
    };
    panel.addEventListener('touchend', end);
    panel.addEventListener('touchcancel', end);
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
    const acc = typeof getAccount === 'function' ? getAccount() : null;
    const mine = myAdsAll();
    const verified = !!(acc && acc.verified);
    const theme = typeof getTheme === 'function' ? getTheme() : 'sea';

    const meta = [p.city ? `<span><i class="fas fa-location-dot"></i>${e(p.city)}</span>` : '', p.phone ? `<span><i class="fas fa-phone"></i>${e(p.phone)}</span>` : ''].join('');

    const rows = mine.map(ad => `
        <div class="my-ad">
            <div class="my-ad-thumb" onclick="openListing('${ad.id}')">${ad.image ? `<img src="${ad.image}" alt="">` : '<i class="fas fa-image"></i>'}</div>
            <div class="my-ad-info" onclick="openListing('${ad.id}')">
                <div class="my-ad-title">${e(ad.title)}</div>
                <div class="my-ad-price">${e(ad.price)}</div>
            </div>
            <div class="my-ad-actions">
                <button onclick="openAdForm('${ad.id}')" aria-label="Изменить"><i class="fas fa-pen"></i></button>
                <button onclick="deleteMyAd('${ad.id}')" aria-label="Удалить"><i class="fas fa-trash"></i></button>
            </div>
        </div>`).join('');

    const name = p.name || (acc && acc.name) || 'Гость';
    root.innerHTML = `
        <div class="pf-top">
            <div class="avatar-circle profile-avatar pf-av">${p.avatar ? `<img src="${p.avatar}" alt="">` : '<i class="fas fa-user"></i>'}</div>
            <div class="pf-id">
                <div class="pf-name"><span class="pf-nick">${e(name)}</span>${verified ? '<i class="fas fa-circle-check pf-check" aria-label="Проверенный хозяин"></i><span class="pf-badge">Проверенный хозяин</span>' : ''}</div>
                ${meta ? `<div class="pf-meta">${meta}</div>` : ''}
                ${p.about ? `<p class="pf-about">${e(p.about)}</p>` : ''}
            </div>
            <button class="pf-edit" onclick="openProfileEditor()" aria-label="Редактировать профиль"><i class="fas fa-pen"></i></button>
        </div>
        ${acc ? '' : `<div class="pf-login"><span>Войдите, чтобы писать хозяевам и занять своё имя</span><button class="primary-btn" onclick="openAuthSheet(null,'login')">Войти</button></div>`}

        <div class="pf-menu">
            <button type="button" class="pf-row" id="rowStats" onclick="openStats()" hidden><i class="fas fa-chart-simple"></i><span>Статистика</span><i class="fas fa-chevron-right pf-go"></i></button>
            <button type="button" class="pf-row" id="rowSubs" onclick="openSearchSubs()"><i class="fas fa-bell"></i><span>Подписки на поиск</span><i class="fas fa-chevron-right pf-go"></i></button>
            <button type="button" class="pf-row" id="rowReq" onclick="openMyRequests()"><i class="fas fa-magnifying-glass"></i><span>Мои запросы</span><em id="rowReqCount" hidden></em><i class="fas fa-chevron-right pf-go"></i></button>
            <button type="button" class="pf-row" id="rowMatch" onclick="openMatchingSheet()" hidden><i class="fas fa-users"></i><span>Подходящие арендаторы</span><em id="rowMatchCount" hidden></em><i class="fas fa-chevron-right pf-go"></i></button>
            <div class="pf-row pf-static theme-card"><div class="tc-h"><i class="fas fa-palette"></i><span>Тема</span></div>
                <div class="theme-grid" role="group" aria-label="Тема">${Object.entries(THEMES).map(([k, t]) => `<button type="button" class="th-card ${theme === k ? 'on' : ''}" data-th="${k}" onclick="setTheme('${k}')"><span class="th-sw" style="background:${t.bg}"><b style="background:${t.accent}"></b><i style="background:${t.accent}"></i></span>${t.name}</button>`).join('')}</div>
            </div>
        </div>

        <div class="section-head pf-head"><h2 class="section-title">Мои объявления${mine.length ? ': ' + mine.length : ''}</h2></div>
        ${mine.length ? `<div class="my-ads">${rows}</div>` : '<p class="pf-empty">Сдаёте или продаёте жильё? Добавьте объявление: оно появится в чате выбранного типа.</p>'}
        <button class="primary-btn wide-btn pf-add" onclick="openAdForm()"><i class="fas fa-plus"></i> Добавить жильё</button>
        ${acc ? '<button class="pf-logout" onclick="doLogout()"><i class="fas fa-arrow-right-from-bracket"></i> Выйти из аккаунта</button>' : ''}
    `;
    setTimeout(() => { const r = document.getElementById('profileRoot'); if (r && r.offsetParent !== null) hostProfileTip(); }, 800);
}

// ---------- РЕДАКТОР ПРОФИЛЯ ----------
function openProfileEditor() {
    const p = getProfile();
    const accNow = typeof getAccount === 'function' ? getAccount() : null;
    if (accNow) p.name = accNow.name;      // у аккаунта имя одно: его видят в чатах, отзывах и объявлениях
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
        <label class="field"><span>Имя</span><input id="pfName" maxlength="${accNow ? 24 : 30}" value="${e(p.name || '')}" placeholder="Как к вам обращаться">${accNow ? '<small class="field-hint">Имя видят все: в чатах, отзывах и объявлениях. Менять можно раз в сутки.</small>' : ''}</label>
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
        root.querySelector('#pfSave').onclick = async () => {
            const btn = root.querySelector('#pfSave');
            let name = root.querySelector('#pfName').value.trim();
            if (!name) { showToast('Укажите имя'); return; }
            const acc = typeof getAccount === 'function' ? getAccount() : null;
            // Имя в аккаунте — это и логин, и подпись в чатах, отзывах и объявлениях: меняем его на сервере
            if (acc && name !== acc.name) {
                btn.disabled = true;
                try {
                    const r = await fetch(`${SERVER_URL}/api/auth/rename`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() }, body: JSON.stringify({ name }) });
                    let d = null; try { d = await r.json(); } catch (_) {}
                    if (r.status === 401) { clearSession(); closeSheet(); showToast('Сессия истекла. Войдите снова'); return; }
                    if (!d || !d.ok) { showToast((d && d.message) || 'Не удалось сменить имя'); btn.disabled = false; return; }
                    name = d.user.name;
                    try { localStorage.setItem('tell-account', JSON.stringify({ ...acc, name })); localStorage.setItem('tell-username', name); } catch (_) {}
                    if (typeof reconnectSocket === 'function') reconnectSocket();   // сервер увидит новое имя
                } catch (err) { showToast('Нет связи с сервером'); btn.disabled = false; return; }
            }
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
    document.querySelectorAll('.chat-message-ad').forEach(el => { if (el.dataset.adId === String(id)) el.remove(); });
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
    // Новые объявления — только от проверенных хозяев
    if (!editId) {
        const acc = typeof getAccount === 'function' ? getAccount() : null;
        if (!acc || !acc.verified) { ensureVerifiedHost(() => openAdForm(editId)); return; }
    }
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
        pick: 'home',
        category: old ? adCategory(old) : 'apartment'
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
            <div class="form-block">
                <div class="form-h">Тип жилья</div>
                <div class="chip-row" id="fmCat">${AD_CATS.map(c => `<button type="button" class="chip chip-toggle ${formState.category === c.id ? 'on' : ''}" data-cat="${c.id}"><i class="fas ${c.icon}"></i>${c.one}</button>`).join('')}</div>
                <div class="form-hint" id="fmCatHint"></div>
            </div>

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
                <label class="field"><span>Посёлок, улица, дом</span><input id="fmAddr" maxlength="100" value="${e(old ? old.location : 'Архипо-Осиповка, ')}" placeholder="Архипо-Осиповка, ул. Горная, 12"><small class="form-hint">Начните с посёлка или города — по нему объявление находят те, кто ищет жильё.</small></label>
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
    setTimeout(hostFormTip, 700);
}

function applyFormType(screen) {
    const sale = formState.type === 'sale';
    screen.querySelectorAll('.only-rent').forEach(el => el.style.display = sale ? 'none' : '');
    document.getElementById('fmPriceLabel').textContent = sale ? 'Цена, ₽' : 'Цена за сутки, ₽';
    document.getElementById('fmRoomsLabel').textContent = sale ? 'Площадь и комнаты' : 'Комнаты и площадь';
    document.getElementById('fmRooms').placeholder = sale ? '120 м² · 4 комнаты · участок 6 соток' : '1 комната · 32 м²';
    document.querySelectorAll('#fmType button').forEach(b => b.classList.toggle('on', b.dataset.type === formState.type));
}

function catHint() {
    const c = AD_CATS.find(x => x.id === formState.category) || AD_CATS[0];
    return 'Объявление появится в чатах «Жильё · ' + c.label + '» и «Жильё» (все).';
}

function wireAdForm(screen) {
    const catBox = screen.querySelector('#fmCat'), catHintEl = screen.querySelector('#fmCatHint');
    if (catHintEl) catHintEl.textContent = catHint();
    catBox.onclick = (ev) => {
        const b = ev.target.closest('button[data-cat]');
        if (!b) return;
        formState.category = b.dataset.cat;
        catBox.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
        catHintEl.textContent = catHint();
    };
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
    updatePickDist();
    YM.open(el, { center: formState.coords, zoom: 15, zoomControl: true }).then((map) => {
        if (!map) return;
        if (!document.getElementById('pickMap')) { map.destroy(); return; }
        if (pickMap) pickMap.destroy();
        pickMap = map;
        const pin = (cls, icon) => `<div class="map-pin ${cls}"><i class="fas ${icon}"></i></div>`;
        pickMarkers.home = map.addMarker({ coords: formState.coords, html: pin('pin-home', 'fa-home'), size: [40, 40], draggable: true,
            onDrag: (c) => { formState.coords = c; updatePickDist(); } });
        pickMarkers.sea = map.addMarker({ coords: formState.beach, html: pin('pin-sea', 'fa-umbrella-beach'), size: [40, 40], draggable: true,
            onDrag: (c) => { formState.beach = c; updatePickDist(); } });
        map.onClick((c) => setPickPoint(formState.pick, c));
        map.fitBounds([formState.coords, formState.beach], { padding: 50, maxZoom: 16, animate: false });
        setTimeout(() => map.invalidate(), 250);
    });
}

function setPickPoint(which, latlng) {
    if (which === 'home') formState.coords = latlng; else formState.beach = latlng;
    const marker = pickMarkers[which === 'home' ? 'home' : 'sea'];
    if (marker) marker.setCoords(latlng);
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
        category: formState.category,
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
        showToast('Готово: объявление видно в чате «Жильё · ' + (AD_CATS.find(c => c.id === formState.category) || AD_CATS[0]).label + '»');
    });
}

function closeAdForm() {
    if (pickMap) { pickMap.destroy(); pickMap = null; }
    pickMarkers = {};
    formCal = null;
    const screen = document.getElementById('form-screen');
    if (screen) { screen.style.display = 'none'; screen.innerHTML = ''; }
    document.body.style.overflow = '';
}
