// ============================================
// DMQUICK.JS — личные чаты: фото и быстрые ответы
// Кнопка «+» слева от поля ввода: «Фото» и «Быстрые ответы».
// Фото сжимается на телефоне (до 1280 px), подпись необязательна.
// Быстрые ответы хранятся на этом устройстве (до 8 шаблонов).
// Подключается после circles.js и reviews.js.
// ============================================

(function () {
    const QKEY = 'yy-quick';
    const QDEFAULT = [
        'Здравствуйте! Жильё свободно на ваши даты.',
        'Сейчас пришлю адрес и как добраться.',
        'Заселение с 14:00, выезд до 12:00.',
        'Спасибо за обращение! Отвечу чуть позже.'
    ];
    const QMAX = 8, QLEN = 200;

    function getQuick() {
        try { const a = JSON.parse(localStorage.getItem(QKEY) || 'null'); if (Array.isArray(a)) return a.filter(x => typeof x === 'string' && x.trim()).slice(0, QMAX); } catch (e) {}
        return QDEFAULT.slice();
    }
    function saveQuick(a) { try { localStorage.setItem(QKEY, JSON.stringify(a.slice(0, QMAX))); } catch (e) {} }

    // ---------- сжатие фото ----------
    async function loadBitmap(file) {
        if (window.createImageBitmap) { try { return await createImageBitmap(file); } catch (e) {} }
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file), img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
            img.src = url;
        });
    }
    async function compress(file) {
        const bmp = await loadBitmap(file);
        const w0 = bmp.width, h0 = bmp.height;
        for (const [max, q] of [[1280, 0.82], [1280, 0.65], [1024, 0.6], [800, 0.55]]) {
            const k = Math.min(1, max / Math.max(w0, h0));
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
            c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
            const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
            if (blob && blob.size <= 1900000) return blob;
        }
        throw new Error('too large');
    }

    // ---------- отправка ----------
    async function sendPhoto(blob, caption) {
        if (!currentDm) return false;
        if (!getToken()) { showToast('Войдите в аккаунт'); return false; }
        try {
            const up = await fetch(`${SERVER_URL}/api/media/video?kind=photo`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Authorization: 'Bearer ' + getToken() }, body: blob });
            let d = null; try { d = await up.json(); } catch (e) {}
            if (!up.ok || !d || !d.ok || !VM_ID_RE.test(String(d.id))) {
                showToast(up.status === 413 ? 'Фото слишком большое' : up.status === 429 ? 'Слишком много загрузок. Подождите немного.' : up.status === 401 ? 'Сессия истекла. Войдите снова.' : 'Не удалось отправить фото');
                return false;
            }
            const convId = currentDm.convId;
            socketAsk('dm-send', { convId, text: caption, clientId: newClientId(), photo: { id: d.id } }, (res) => { if (!res.ok) showToast(res.message || 'Не удалось отправить'); });
            return true;
        } catch (e) { showToast('Нет связи. Фото не отправлено.'); return false; }
    }

    function pickPhoto() {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = async () => {
            const f = inp.files && inp.files[0]; if (!f) return;
            if (!/^image\//.test(f.type)) { showToast('Выберите фото'); return; }
            let blob;
            try { blob = await compress(f); } catch (e) { showToast('Не удалось подготовить фото'); return; }
            const url = URL.createObjectURL(blob);
            openSheet('Отправить фото', `
                <img class="dm-prev" src="${url}" alt="">
                <input type="text" class="rv-ta dm-cap" id="dmCap" maxlength="300" placeholder="Подпись (необязательно)">
                <button class="rv-send" id="dmPhotoSend">Отправить</button>`, (el) => {
                el.querySelector('#dmPhotoSend').onclick = async (ev) => {
                    const b = ev.currentTarget; b.disabled = true; b.textContent = 'Отправляю…';
                    const ok = await sendPhoto(blob, el.querySelector('#dmCap').value.trim());
                    if (ok) { closeSheet(); URL.revokeObjectURL(url); } else { b.disabled = false; b.textContent = 'Отправить'; }
                };
            });
        };
        inp.click();
    }

    // ---------- быстрые ответы ----------
    function openQuick() {
        const draw = (el) => {
            const list = getQuick(), e = escapeHtml;
            el.querySelector('#qBody').innerHTML = (list.length ? list.map((t, i) => `
                <div class="q-row"><button type="button" class="q-use" data-i="${i}">${e(t)}</button><button type="button" class="q-del" data-i="${i}" aria-label="Удалить шаблон"><i class="fas fa-xmark"></i></button></div>`).join('') : '<p class="rv-empty">Шаблонов нет</p>')
                + (list.length < QMAX ? `<div class="q-add"><input type="text" id="qNew" maxlength="${QLEN}" placeholder="Новый шаблон"><button type="button" id="qAdd">Добавить</button></div>` : '<p class="st-note">Максимум 8 шаблонов.</p>');
        };
        openSheet('Быстрые ответы', '<div id="qBody"></div><p class="st-note">Нажмите на шаблон, и он появится в поле ввода: его можно поправить перед отправкой. Шаблоны хранятся на этом устройстве.</p>', (el) => {
            draw(el);
            el.addEventListener('click', (ev) => {
                const use = ev.target.closest('.q-use'), del = ev.target.closest('.q-del');
                if (use) {
                    const t = getQuick()[Number(use.dataset.i)]; if (!t) return;
                    const input = document.getElementById('chatInput');
                    closeSheet();
                    if (input) { input.value = input.value ? input.value.trimEnd() + ' ' + t : t; input.dispatchEvent(new Event('input')); input.focus(); }
                } else if (del) {
                    const a = getQuick(); a.splice(Number(del.dataset.i), 1); saveQuick(a); draw(el);
                } else if (ev.target.closest('#qAdd')) {
                    const v = el.querySelector('#qNew').value.trim(); if (!v) return;
                    const a = getQuick(); a.push(v.slice(0, QLEN)); saveQuick(a); draw(el);
                }
            });
        });
    }

    function openPlus() {
        openSheet('Добавить', `
            <button type="button" class="plus-row" id="plPhoto"><i class="fas fa-image"></i><span>Фото</span></button>
            <button type="button" class="plus-row" id="plQuick"><i class="fas fa-bolt"></i><span>Быстрые ответы</span></button>`, (el) => {
            el.querySelector('#plPhoto').onclick = () => { closeSheet(); pickPhoto(); };
            el.querySelector('#plQuick').onclick = () => { closeSheet(); openQuick(); };
        });
    }

    // кнопка «+» в личном чате
    function setupPlus() {
        const w = document.querySelector('#group-screen .chat-input-wrapper');
        const input = document.getElementById('chatInput');
        if (!w || !input || !currentDm || w.querySelector('.plus-btn')) return;
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'plus-btn'; b.setAttribute('aria-label', 'Фото и быстрые ответы');
        b.innerHTML = '<i class="fas fa-plus"></i>';
        b.onclick = openPlus;
        w.insertBefore(b, input);
    }
    const _open = openDmChat;
    openDmChat = function () { const r = _open.apply(this, arguments); setupPlus(); return r; };

    // ---------- показ фото в ленте ----------
    const _render = renderDmMessage;
    renderDmMessage = function (m) {
        if (!(m && m.photo && VM_ID_RE.test(String(m.photo.id)))) return _render(m);
        const me = getAccount(), mine = me && m.from && m.from.id === me.id, e = escapeHtml;
        const id = e(String(m.id)), time = formatTime(m.time);
        const body = `<div class="chat-bubble dm-photo-bubble ${mine ? 'chat-bubble-mine' : ''}"><img class="dm-photo" loading="lazy" alt="Фото" data-src="${e(mediaUrl(m.photo.id))}" src="${e(mediaUrl(m.photo.id))}">${m.text ? `<div class="dm-cap-t">${e(m.text)}</div>` : ''}</div>`;
        if (mine) return `<div class="chat-message chat-message-mine" data-id="${id}"><div class="chat-bubble-wrap">${body}<div class="chat-time-mine">${time}</div></div></div>`;
        const nm = (m.from && m.from.name) || '?';
        return `<div class="chat-message" data-id="${id}"><div class="chat-avatar" data-avn="${avEsc(nm)}" style="background:${dmColor(nm)}">${avInner(nm)}</div><div class="chat-bubble-wrap"><div class="chat-bubble-header"><span class="chat-user-name">${e(nm)}</span><span class="chat-time">${time}</span></div>${body}</div></div>`;
    };

    // просмотр фото на весь экран
    document.addEventListener('click', (ev) => {
        const img = ev.target.closest && ev.target.closest('.dm-photo');
        if (!img) return;
        const v = document.createElement('div');
        v.className = 'photo-viewer';
        v.innerHTML = `<img src="${img.dataset.src}" alt="Фото"><button type="button" aria-label="Закрыть">×</button>`;
        v.onclick = () => v.remove();
        document.body.appendChild(v);
    });
})();
