/* ============================================
   WALK.JS — «Прогулка» по объявлению.
   Хозяин снимает видео (идёт по территории), приложение прямо на телефоне
   вырезает из него ~36 кадров и склеивает в одну картинку-ленту. Лента уходит
   на сервер одним файлом, в объявлении хранится только её номер и разбивка.
   Гость смотрит: стрелки «Вперёд / Назад» (можно держать), тяга пальцем,
   ползунок и «Идти сам» — кадры плавно перетекают друг в друга.
   ============================================ */
const WALK_MAX_SEC = 60;       // длиннее — просим обрезать
const WALK_MAX_FRAMES = 36;
const WALK_MIN_FRAMES = 12;
const WALK_SIDE = 640;         // длинная сторона кадра, px
const WALK_COLS = 6;
const WALK_MAX_BYTES = 2_200_000;
const WALK_MAX_PIXELS = 12_000_000;   // запас до предела холста на iPhone (~16,7 млн)

// ---------- съёмка кадров из видеофайла ----------
function walkWait(el, ev, ms) {
    return new Promise((resolve) => {
        let done = false;
        const fin = (ok) => { if (done) return; done = true; el.removeEventListener(ev, onEv); clearTimeout(tm); resolve(ok); };
        const onEv = () => fin(true);
        const tm = setTimeout(() => fin(false), ms);
        el.addEventListener(ev, onEv);
    });
}

// file → { blob, n, cols, w, h, preview }; бросает Error с понятным текстом
async function walkExtract(file, onProgress) {
    if (!file || !/^video\//.test(file.type || 'video/mp4')) throw new Error('Выберите видеофайл');
    if (file.size > 400 * 1048576) throw new Error('Видео слишком большое. Снимите покороче.');
    const url = URL.createObjectURL(file);
    try {
        const v = document.createElement('video');
        v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto'; v.src = url;
        if (!(await walkWait(v, 'loadedmetadata', 15000))) throw new Error('Не удалось открыть видео. Попробуйте снять заново.');
        const dur = v.duration;
        if (!isFinite(dur) || dur < 2) throw new Error('Видео слишком короткое. Нужно хотя бы 2 секунды.');
        if (dur > WALK_MAX_SEC + 0.5) throw new Error('Видео длиннее ' + WALK_MAX_SEC + ' секунд. Снимите покороче или обрежьте.');
        if (!v.videoWidth || !v.videoHeight) throw new Error('Не удалось прочитать картинку видео.');
        // iOS не грузит кадры, пока видео не «запустили»
        try { await v.play(); v.pause(); } catch (_) {}

        const n = Math.max(WALK_MIN_FRAMES, Math.min(WALK_MAX_FRAMES, Math.round(dur * 2)));
        const cols = Math.min(WALK_COLS, n), rows = Math.ceil(n / cols);
        let sc = Math.min(1, WALK_SIDE / Math.max(v.videoWidth, v.videoHeight)), w, h;
        for (;;) {
            w = Math.max(2, Math.round(v.videoWidth * sc)); h = Math.max(2, Math.round(v.videoHeight * sc));
            if (cols * w * rows * h <= WALK_MAX_PIXELS) break;
            sc *= 0.92;
        }

        const cv = document.createElement('canvas');
        cv.width = cols * w; cv.height = rows * h;
        const cx = cv.getContext('2d');
        if (!cx) throw new Error('Телефон не смог подготовить кадры.');
        for (let i = 0; i < n; i++) {
            const t = Math.min(dur - 0.08, (i / (n - 1)) * dur);
            const seeked = walkWait(v, 'seeked', 6000);
            v.currentTime = Math.max(0, t);
            await seeked;
            cx.drawImage(v, (i % cols) * w, Math.floor(i / cols) * h, w, h);
            if (onProgress) onProgress(i + 1, n);
            await new Promise((r) => setTimeout(r, 0));   // дать экрану перерисоваться
        }
        let q = 0.76, blob = null;
        while (q > 0.38) {
            blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', q));
            if (!blob) throw new Error('Не удалось собрать прогулку.');
            if (blob.size <= WALK_MAX_BYTES) break;
            q -= 0.08;
        }
        if (!blob || blob.size > WALK_MAX_BYTES) throw new Error('Прогулка получилась слишком тяжёлой. Снимите покороче.');
        return { blob, n, cols, w, h };
    } finally { URL.revokeObjectURL(url); }
}

async function walkUpload(blob) {
    if (!getToken()) throw new Error('Войдите в аккаунт');
    let up, d = null;
    try { up = await fetch(`${SERVER_URL}/api/media/video?kind=walk`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Authorization: 'Bearer ' + getToken() }, body: blob }); }
    catch (_) { throw new Error('Нет связи с сервером'); }
    try { d = await up.json(); } catch (_) {}
    if (!up.ok || !d || !d.ok || !/^vm_[0-9a-f]{32}$/.test(String(d.id))) {
        throw new Error(up.status === 413 ? 'Прогулка слишком тяжёлая' : up.status === 429 ? 'Слишком много загрузок. Подождите немного.' : up.status === 401 ? 'Сессия истекла. Войдите снова.' : 'Не удалось загрузить прогулку');
    }
    return d.id;
}

// ---------- блок в форме объявления ----------
// st — объект с полем walk ({id,n,cols,w,h}) и walkLocal (адрес картинки в самом телефоне, пока не опубликовано)
function walkFormInit(root, st) {
    const box = root.querySelector('#fmWalk'), file = root.querySelector('#fmWalkFile');
    if (!box || !file) return;
    let busy = '';
    const draw = () => {
        if (busy) { box.innerHTML = `<div class="walk-form-row busy"><i class="fas fa-spinner fa-spin"></i><span>${busy}</span></div>`; return; }
        box.innerHTML = st.walk
            ? `<div class="walk-form-row ok"><i class="fas fa-person-walking"></i><span><b>Прогулка готова</b><small>${st.walk.n} кадров</small></span>
                 <button type="button" class="ghost-btn small" data-w="view">Посмотреть</button>
                 <button type="button" class="ghost-btn small" data-w="del" aria-label="Убрать"><i class="fas fa-trash"></i></button></div>`
            : `<button type="button" class="photo-add walk-add" data-w="add"><i class="fas fa-video"></i><span>Добавить видео</span></button>`;
    };
    box.onclick = (ev) => {
        const b = ev.target.closest('[data-w]'); if (!b || busy) return;
        if (b.dataset.w === 'add') file.click();
        else if (b.dataset.w === 'del') { st.walk = null; st.walkLocal = ''; draw(); }
        else if (b.dataset.w === 'view') openWalk({ ...st.walk, url: st.walkLocal || undefined }, 'Ваша прогулка');
    };
    file.onchange = async () => {
        const f = file.files && file.files[0]; file.value = '';
        if (!f) return;
        try {
            busy = 'Готовлю прогулку…'; draw();
            const r = await walkExtract(f, (i, n) => { busy = `Готовлю прогулку… ${i}/${n}`; draw(); });
            busy = 'Загружаю…'; draw();
            const id = await walkUpload(r.blob);
            st.walk = { id, n: r.n, cols: r.cols, w: r.w, h: r.h };
            st.walkLocal = URL.createObjectURL(r.blob);
            busy = '';
            if (typeof showToast === 'function') showToast('Прогулка добавлена');
        } catch (err) {
            busy = '';
            if (typeof showToast === 'function') showToast(err && err.message ? err.message : 'Не удалось подготовить прогулку');
        }
        draw();
    };
    draw();
}

// ---------- просмотр ----------
let walkV = null;

// meta: { id, n, cols, w, h, url? } — url нужен, пока лента лежит только в телефоне
function openWalk(meta, title) {
    if (!meta || !meta.n || !meta.cols || !meta.w || !meta.h) return;
    closeWalk();
    const n = meta.n, cols = meta.cols, rows = Math.ceil(n / cols);
    const src = meta.url || `${SERVER_URL}/api/media/${meta.id}`;
    const el = document.createElement('section');
    el.id = 'walk-screen'; el.className = 'walk-screen';
    el.innerHTML = `
        <div class="walk-top">
            <button class="walk-x" data-w="close" aria-label="Закрыть"><i class="fas fa-xmark"></i></button>
            <div class="walk-title">${typeof escapeHtml === 'function' ? escapeHtml(title || 'Прогулка') : 'Прогулка'}</div>
        </div>
        <div class="walk-area" id="walkArea">
            <div class="walk-stage" id="walkStage"><div class="walk-l a"></div><div class="walk-l b"></div>
                <div class="walk-load" id="walkLoad"><i class="fas fa-spinner fa-spin"></i></div>
                <div class="walk-hint" id="walkHint"><i class="fas fa-hand-pointer"></i> Тяните вверх или жмите стрелки, чтобы идти</div>
            </div>
        </div>
        <div class="walk-bar">
            <input type="range" class="walk-range" id="walkRange" min="0" max="${n - 1}" step="0.01" value="0" aria-label="Положение на прогулке">
            <div class="walk-btns">
                <button class="walk-b" data-hold="-1" aria-label="Назад"><i class="fas fa-chevron-down"></i><span>Назад</span></button>
                <button class="walk-b auto" data-w="auto" aria-label="Идти сам"><i class="fas fa-play"></i><span>Идти сам</span></button>
                <button class="walk-b fwd" data-hold="1" aria-label="Вперёд"><i class="fas fa-chevron-up"></i><span>Вперёд</span></button>
            </div>
        </div>`;
    document.body.appendChild(el);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const stage = el.querySelector('#walkStage'), area = el.querySelector('#walkArea');
    const la = el.querySelector('.walk-l.a'), lb = el.querySelector('.walk-l.b');
    const range = el.querySelector('#walkRange'), autoBtn = el.querySelector('.walk-b.auto');
    const s = { pos: 0, target: 0, dir: 0, holding: false, auto: false, fw: 0, fh: 0, ia: -1, ib: -1, raf: 0, last: 0, holdT: 0, ready: false, closed: false, prevOverflow };
    walkV = { el, s };

    const layout = () => {
        const W = area.clientWidth, H = area.clientHeight;
        const k = Math.min(W / meta.w, H / meta.h);
        s.fw = Math.round(meta.w * k); s.fh = Math.round(meta.h * k);
        stage.style.width = s.fw + 'px'; stage.style.height = s.fh + 'px';
        for (const l of [la, lb]) { l.style.backgroundSize = `${cols * s.fw}px ${rows * s.fh}px`; }
        s.ia = s.ib = -1;
        draw();
    };
    const place = (l, i) => { l.style.backgroundPosition = `${-(i % cols) * s.fw}px ${-Math.floor(i / cols) * s.fh}px`; };
    const draw = () => {
        if (!s.ready) return;
        const p = Math.max(0, Math.min(n - 1, s.pos)), i = Math.min(n - 1, Math.floor(p)), f = p - i, j = Math.min(n - 1, i + 1);
        if (i !== s.ia) { place(la, i); s.ia = i; }
        if (j !== s.ib) { place(lb, j); s.ib = j; }
        lb.style.opacity = i === j ? 0 : String(f);
        range.value = String(p);
    };
    const clamp = (v) => Math.max(0, Math.min(n - 1, v));
    const stopAuto = () => { s.auto = false; autoBtn.classList.remove('on'); autoBtn.querySelector('i').className = 'fas fa-play'; autoBtn.querySelector('span').textContent = 'Идти сам'; };
    const hideHint = () => { const h = el.querySelector('#walkHint'); if (h) h.classList.add('gone'); };

    const tick = (t) => {
        if (s.closed) return;
        const dt = Math.min(0.05, (t - (s.last || t)) / 1000); s.last = t;
        if (s.holding) s.target = clamp(s.target + s.dir * 7 * dt);
        else if (s.auto) { s.target = clamp(s.target + 3.2 * dt); if (s.target >= n - 1) stopAuto(); }
        const d = s.target - s.pos;
        s.pos = Math.abs(d) < 0.002 ? s.target : s.pos + d * Math.min(1, dt * 9);
        draw();
        s.raf = requestAnimationFrame(tick);
    };

    // стрелки: нажатие — шаг, удержание — идём
    el.querySelectorAll('[data-hold]').forEach((b) => {
        const dir = Number(b.dataset.hold);
        const down = (ev) => { ev.preventDefault(); stopAuto(); hideHint(); s.dir = dir; s.target = clamp(Math.round(s.target) + dir); clearTimeout(s.holdT); s.holdT = setTimeout(() => { s.holding = true; }, 260); b.classList.add('on'); try { b.setPointerCapture(ev.pointerId); } catch (_) {} };
        const up = () => { clearTimeout(s.holdT); if (s.holding) s.target = clamp(Math.round(s.target)); s.holding = false; s.dir = 0; b.classList.remove('on'); };
        b.addEventListener('pointerdown', down);
        b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
        b.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    // тяга пальцем по картинке: вверх или влево — вперёд
    let drag = null;
    stage.addEventListener('pointerdown', (ev) => { stopAuto(); hideHint(); drag = { x: ev.clientX, y: ev.clientY, from: s.target, axis: '' }; try { stage.setPointerCapture(ev.pointerId); } catch (_) {} });
    stage.addEventListener('pointermove', (ev) => {
        if (!drag) return;
        const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
        if (!drag.axis) { if (Math.abs(dx) + Math.abs(dy) < 6) return; drag.axis = Math.abs(dy) >= Math.abs(dx) ? 'y' : 'x'; }
        const px = drag.axis === 'y' ? -dy : -dx, len = drag.axis === 'y' ? s.fh : s.fw;
        s.target = clamp(drag.from + px / (len * 0.9) * (n * 0.5));
    });
    const dend = () => { drag = null; };
    stage.addEventListener('pointerup', dend); stage.addEventListener('pointercancel', dend);

    range.addEventListener('input', () => { stopAuto(); hideHint(); s.target = s.pos = clamp(Number(range.value)); draw(); });
    el.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-w]'); if (!b) return;
        if (b.dataset.w === 'close') closeWalk();
        else if (b.dataset.w === 'auto') {
            if (s.auto) { stopAuto(); return; }
            hideHint();
            if (s.target >= n - 1.01) s.target = s.pos = 0;
            s.auto = true; autoBtn.classList.add('on'); autoBtn.querySelector('i').className = 'fas fa-pause'; autoBtn.querySelector('span').textContent = 'Пауза';
        }
    });
    s.key = (ev) => {
        if (ev.key === 'Escape') closeWalk();
        else if (['ArrowUp', 'ArrowRight', 'w', 'W'].includes(ev.key)) { stopAuto(); s.target = clamp(Math.round(s.target) + 1); }
        else if (['ArrowDown', 'ArrowLeft', 's', 'S'].includes(ev.key)) { stopAuto(); s.target = clamp(Math.round(s.target) - 1); }
    };
    document.addEventListener('keydown', s.key);
    s.resize = () => layout();
    window.addEventListener('resize', s.resize);

    // сначала грузим ленту целиком, потом показываем
    const img = new Image();
    img.onload = () => {
        if (s.closed) return;
        la.style.backgroundImage = lb.style.backgroundImage = `url("${src}")`;
        s.ready = true;
        el.querySelector('#walkLoad').remove();
        layout();
        setTimeout(hideHint, 4500);
    };
    img.onerror = () => { if (s.closed) return; const L = el.querySelector('#walkLoad'); if (L) L.innerHTML = '<span>Не удалось загрузить прогулку</span>'; };
    img.src = src;
    layout();
    s.raf = requestAnimationFrame(tick);
}

function closeWalk() {
    if (!walkV) return;
    const { el, s } = walkV;
    s.closed = true; cancelAnimationFrame(s.raf); clearTimeout(s.holdT);
    document.removeEventListener('keydown', s.key); window.removeEventListener('resize', s.resize);
    el.remove();
    walkV = null;
    document.body.style.overflow = s.prevOverflow;
}
