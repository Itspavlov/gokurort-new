// ============================================
// CIRCLES.JS — голосовые сообщения и видеокружки в личных чатах и группах.
// Как в Телеграме: микрофон и камера слева от поля ввода, запись пока удерживаете,
// отпустили — отправилось, смахнули влево — отмена, смахнули вверх — запись без удержания.
// ============================================

const REC_LIMIT = { video: 60, voice: 120 };
const CANCEL_PX = 70, LOCK_PX = 60, MIN_MS = 700;
const VM_ID_RE = /^vm_[0-9a-f]{32}$/;
let rec = null;

const fmtDur = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const hasMedia = (m) => !!(m && ((m.video && VM_ID_RE.test(String(m.video.id))) || (m.voice && VM_ID_RE.test(String(m.voice.id)))));
const mediaUrl = (id) => `${SERVER_URL}/api/media/${id}`;
const clampDur = (d, max) => Math.max(1, Math.min(max, Number(d) || 1));

// ============================================
// ОТОБРАЖЕНИЕ В ЛЕНТЕ
// ============================================
function circleHTML(v) {
    const dur = clampDur(v.dur, 60);
    return `<div class="vc" role="button" tabindex="0" data-dur="${dur}" aria-label="Видеосообщение, ${dur} сек. Нажмите, чтобы воспроизвести">
        <video playsinline preload="metadata" src="${escapeHtml(mediaUrl(v.id))}#t=0.1"></video>
        <svg class="vc-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48"></circle></svg>
        <span class="vc-play"><i class="fas fa-play"></i></span>
        <span class="vc-dur">${fmtDur(dur)}</span></div>`;
}

// «Волна» — оформление: высота столбиков берётся из идентификатора, это не график звука
function voiceHTML(v) {
    const dur = clampDur(v.dur, 120);
    let seed = 0; for (const ch of String(v.id)) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    let bars = '';
    for (let i = 0; i < 30; i++) { seed = (seed * 1103515245 + 12345) >>> 0; bars += `<b style="height:${28 + (seed >> 16) % 72}%"></b>`; }
    return `<div class="vm" role="button" tabindex="0" data-dur="${dur}" aria-label="Голосовое сообщение, ${dur} сек. Нажмите, чтобы воспроизвести">
        <span class="vm-play"><i class="fas fa-play"></i></span><span class="vm-wave">${bars}</span><span class="vm-dur">${fmtDur(dur)}</span>
        <audio preload="none" src="${escapeHtml(mediaUrl(v.id))}"></audio></div>`;
}

function mediaMessageHTML(m, extraBelow) {
    const me = getAccount();
    const mine = me && m.from && m.from.id === me.id;
    const id = escapeHtml(String(m.id));
    const time = formatTime(m.time);
    const body = m.video ? circleHTML(m.video) : `<div class="chat-bubble ${mine ? 'chat-bubble-mine' : ''}">${renderReplyHTML ? renderReplyHTML(m) : ''}${voiceHTML(m.voice)}</div>`;
    const below = extraBelow || '';
    if (mine) return `<div class="chat-message chat-message-mine" data-id="${id}"><div class="chat-bubble-wrap">${body}${below}<div class="chat-time-mine">${time}</div></div></div>`;
    const nm = (m.from && m.from.name) || '?';
    return `<div class="chat-message" data-id="${id}"><div class="chat-avatar" data-avn="${avEsc(nm)}" style="background:${dmColor(nm)}">${avInner(nm)}</div><div class="chat-bubble-wrap"><div class="chat-bubble-header"><span class="chat-user-name">${escapeHtml(nm)}</span><span class="chat-time">${time}</span></div>${body}${below}</div></div>`;
}

const _renderDmMessage = renderDmMessage;
renderDmMessage = function (m) { return hasMedia(m) ? mediaMessageHTML(m) : _renderDmMessage(m); };

const _renderGroupMessage = renderGroupMessage;
renderGroupMessage = function (m) {
    if (!hasMedia(m)) return _renderGroupMessage(m);
    return mediaMessageHTML(m, `<div class="chat-reactions" data-for="${escapeHtml(String(m.id))}">${renderReactionChips(m)}</div>`);
};

// ============================================
// ВОСПРОИЗВЕДЕНИЕ (одно за раз)
// ============================================
let playing = null;
function stopPlaying() {
    const el = playing; if (!el) return;
    playing = null;
    el.classList.remove('playing');
    const media = el.querySelector('video, audio');
    try { media.pause(); } catch (e) {}
    media.onended = media.ontimeupdate = media.onerror = null;
    el.style.setProperty('--p', 0);
    el.querySelectorAll('.vm-wave b.on').forEach(b => b.classList.remove('on'));
    const d = el.querySelector('.vc-dur, .vm-dur');
    if (d) d.textContent = fmtDur(Number(el.dataset.dur));
    if (el.classList.contains('vc')) media.muted = true;
    const ic = el.querySelector('.vm-play i'); if (ic) ic.className = 'fas fa-play';
}
function togglePlay(el) {
    if (playing === el) { stopPlaying(); return; }
    stopPlaying();
    const media = el.querySelector('video, audio');
    const isVoice = el.classList.contains('vm');
    media.muted = false;
    try { media.currentTime = 0; } catch (e) {}
    const pr = media.play();
    if (pr && pr.catch) pr.catch(() => { showToast('Не удалось воспроизвести'); if (playing === el) stopPlaying(); });
    el.classList.add('playing');
    playing = el;
    const bars = isVoice ? el.querySelectorAll('.vm-wave b') : null;
    if (isVoice) el.querySelector('.vm-play i').className = 'fas fa-pause';
    media.ontimeupdate = () => {
        const d = media.duration && isFinite(media.duration) ? media.duration : Number(el.dataset.dur);
        const p = Math.min(1, media.currentTime / d);
        el.style.setProperty('--p', p);
        el.querySelector('.vc-dur, .vm-dur').textContent = fmtDur(d - media.currentTime);
        if (bars) { const n = Math.round(p * bars.length); bars.forEach((b, i) => b.classList.toggle('on', i < n)); }
    };
    media.onended = () => { if (playing === el) stopPlaying(); };
    media.onerror = () => { showToast('Файл недоступен'); if (playing === el) stopPlaying(); };
}
document.addEventListener('click', (ev) => { const el = ev.target.closest && ev.target.closest('.vc, .vm'); if (el) togglePlay(el); });
document.addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList && (ev.target.classList.contains('vc') || ev.target.classList.contains('vm'))) { ev.preventDefault(); togglePlay(ev.target); } });

// ============================================
// ПОЛЕ ВВОДА: микрофон и камера слева
// ============================================
function mediaCtx() {
    if (typeof currentDm !== 'undefined' && currentDm) return { event: 'dm-send', base: { convId: currentDm.convId } };
    if (typeof currentGroup !== 'undefined' && currentGroup) return { event: 'group-send', base: { groupId: currentGroup.id } };
    return null;
}

function syncInputBar() {
    const w = document.querySelector('#group-screen .chat-input-wrapper');
    const input = document.getElementById('chatInput');
    if (!w || !input) return;
    const send = w.querySelector('.chat-send-btn');
    const has = !!input.value.trim();
    if (send) send.style.display = has ? '' : 'none';
    w.querySelectorAll('.rec-btn').forEach(b => { b.style.display = has ? 'none' : ''; });
}

function setupInputBar() {
    const w = document.querySelector('#group-screen .chat-input-wrapper');
    const input = document.getElementById('chatInput');
    if (!w || !input || w.dataset.rec) return;
    w.dataset.rec = '1';
    w.classList.add('compact');
    const mk = (kind, icon, label) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'rec-btn'; b.dataset.kind = kind;
        b.setAttribute('aria-label', label);
        b.innerHTML = `<i class="fas ${icon}"></i>`;
        bindHold(b, kind);
        return b;
    };
    const sendBtn = w.querySelector('.chat-send-btn');
    w.insertBefore(mk('video', 'fa-video', 'Видеокружок: удерживайте кнопку для записи'), sendBtn);
    w.insertBefore(mk('voice', 'fa-microphone', 'Голосовое сообщение: удерживайте кнопку для записи'), sendBtn);
    input.addEventListener('input', syncInputBar);
    syncInputBar();
    setTimeout(() => runTour('hold', [{ sel: '.rec-btn[data-kind="voice"]', title: 'Голос и видеокружки', text: 'Удерживайте микрофон — запишется голосовое, камеру — видеокружок. Отпустили — отправилось. Смахните влево — отмена, вверх — запись без удержания.' }]), 900);
}

const _openDmChat = openDmChat;
openDmChat = function () { _openDmChat.apply(this, arguments); setupInputBar(); };
const _openGroupChat = openGroupChat;
openGroupChat = function () { _openGroupChat.apply(this, arguments); setupInputBar(); };
const _sendDm = sendDm;
sendDm = function () { _sendDm.apply(this, arguments); setTimeout(syncInputBar, 0); };
const _sendGroupMessage = sendGroupMessage;
sendGroupMessage = function () { _sendGroupMessage.apply(this, arguments); setTimeout(syncInputBar, 0); };

// ============================================
// ЗАПИСЬ
// ============================================
function pickMime(kind) {
    const list = kind === 'video'
        ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
        : ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'];
    return list.find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
}

function bindHold(btn, kind) {
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('pointerdown', (ev) => {
        if (ev.button > 0) return;
        ev.preventDefault();
        try { btn.setPointerCapture(ev.pointerId); } catch (e) {}
        startHold(kind, btn, ev.clientX, ev.clientY, false);
        if (rec) trackPointer(ev.pointerId);
    });
    // с клавиатуры: Enter/пробел запускают запись без удержания
    btn.addEventListener('keydown', (ev) => {
        if ((ev.key === 'Enter' || ev.key === ' ') && !ev.repeat) { ev.preventDefault(); startHold(kind, btn, 0, 0, true); }
    });
}

// Следим за пальцем на уровне документа: не зависит от захвата указателя и перекрывающего оверлея
let trackOff = null;
function trackPointer(id) {
    untrackPointer();
    const mv = (e) => { if (e.pointerId === id) moveHold(e.clientX, e.clientY); };
    const up = (e) => { if (e.pointerId === id) { untrackPointer(); endHold(e.type === 'pointercancel'); } };
    const tm = (e) => { if (rec && !rec.released) e.preventDefault(); };
    document.addEventListener('pointermove', mv);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    document.addEventListener('touchmove', tm, { passive: false });
    trackOff = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); document.removeEventListener('touchmove', tm); };
}
function untrackPointer() { if (trackOff) { trackOff(); trackOff = null; } }

function buildRecUI() {
    const s = rec;
    const el = document.createElement('div');
    s.el = el;
    if (s.kind === 'video') {
        el.className = 'vr-overlay';
        el.innerHTML = `
            <div class="vr-time">0:00</div>
            <div class="vr-stage"><div class="vr-circle"><video playsinline muted></video></div>
                <svg class="vr-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48"></circle></svg></div>
            <div class="vr-hint"></div>
            <div class="vr-actions"><button type="button" class="rec-cancel">Отмена</button><button type="button" class="rec-send"><i class="fas fa-paper-plane"></i> Отправить</button></div>`;
        document.body.appendChild(el);
    } else {
        el.className = 'rec-strip';
        el.innerHTML = `<span class="rec-dot"></span><span class="rec-time">0:00</span><span class="rec-hint"></span>
            <span class="rec-lock"><button type="button" class="rec-cancel">Отмена</button><button type="button" class="rec-send" aria-label="Отправить"><i class="fas fa-paper-plane"></i></button></span>`;
        const w = document.querySelector('#group-screen .chat-input-wrapper');
        (w || document.body).appendChild(el);
        if (w) w.classList.add('recording');
    }
    el.dataset.state = 'prep';
    s.btn.classList.add('hold-active');
    el.querySelector('.rec-cancel').onclick = () => cancelRec();
    el.querySelector('.rec-send').onclick = () => stopRec('send', true);
    paintHint();
}

function paintHint() {
    const s = rec; if (!s || !s.el) return;
    const h = s.el.querySelector('.vr-hint, .rec-hint');
    if (!h) return;
    h.textContent = s.state === 'prep' ? 'Включаю…'
        : s.locked ? 'Запись идёт. Нажмите «Отправить»'
        : s.cancelling ? 'Отпустите, чтобы отменить'
        : '‹ Смахните влево — отмена' + (s.kind === 'video' ? ' · ↑ вверх — без удержания' : '');
    s.el.dataset.cancel = s.cancelling ? '1' : '';
    s.el.dataset.locked = s.locked ? '1' : '';
}

function startHold(kind, btn, x, y, locked) {
    if (rec) return;
    const ctx = mediaCtx();
    if (!ctx) return;
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
        showToast('Запись работает в браузерах с камерой и микрофоном по защищённому адресу (https)');
        return;
    }
    if (typeof unlockAudio === 'function') unlockAudio();
    stopPlaying();
    if (typeof closeTip === 'function') closeTip();
    const s = rec = { kind, ctx, btn, sx: x, sy: y, released: locked, locked, cancelling: false, state: 'prep', chunks: [], stream: null, recorder: null, started: 0, timer: 0, action: 'send', dur: 0, mime: '', el: null };
    buildRecUI();
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
    const audio = { echoCancellation: true, noiseSuppression: true };
    const constraints = kind === 'video' ? { video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } }, audio } : { audio };
    navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
        if (rec !== s) { stream.getTracks().forEach(t => t.stop()); return; }
        s.stream = stream;
        if (s.released && !s.locked) { recCleanup(); showToast('Удерживайте кнопку, пока записываете'); return; }  // первое разрешение или быстрое нажатие
        beginRecording();
    }).catch((err) => {
        if (rec === s) recCleanup();
        showToast(err && err.name === 'NotAllowedError' ? 'Разрешите доступ к микрофону' + (kind === 'video' ? ' и камере' : '') + ' в настройках браузера' : 'Не удалось включить ' + (kind === 'video' ? 'камеру' : 'микрофон'));
    });
}

function beginRecording() {
    const s = rec; if (!s) return;
    const mime = pickMime(s.kind);
    try {
        s.recorder = new MediaRecorder(s.stream, Object.assign(mime ? { mimeType: mime } : {}, s.kind === 'video' ? { videoBitsPerSecond: 500000, audioBitsPerSecond: 48000 } : { audioBitsPerSecond: 32000 }));
    } catch (e) { recCleanup(); showToast('Запись не поддерживается в этом браузере'); return; }
    s.mime = (s.recorder.mimeType || mime || (s.kind === 'video' ? 'video/webm' : 'audio/webm')).split(';')[0];
    s.recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size) s.chunks.push(ev.data); };
    s.recorder.onstop = () => onRecStopped(s);
    if (s.kind === 'video') { const v = s.el.querySelector('video'); v.srcObject = s.stream; v.muted = true; v.play().catch(() => {}); }
    s.recorder.start(500);
    s.started = Date.now();
    s.state = 'rec';
    s.el.dataset.state = 'rec';
    const timeEl = s.el.querySelector('.vr-time, .rec-time'), ring = s.el.querySelector('.vr-ring');
    const limit = REC_LIMIT[s.kind];
    s.timer = setInterval(() => {
        const sec = (Date.now() - s.started) / 1000;
        timeEl.textContent = fmtDur(sec);
        if (ring) ring.style.setProperty('--p', Math.min(1, sec / limit));
        if (sec >= limit) stopRec('send', true);
    }, 200);
    paintHint();
    // если пользователь уже отпустил кнопку, пока включалась камера
    if (s.released && !s.locked) endHold(false);
}

function stopRec(action, force) {
    const s = rec;
    if (!s || s.state !== 'rec') return;
    clearInterval(s.timer);
    s.action = action;
    s.dur = Math.max(1, Math.round((Date.now() - s.started) / 1000));
    s.state = 'stopping';
    try { s.recorder.stop(); } catch (e) { recCleanup(); }
}

function cancelRec() {
    const s = rec; if (!s) return;
    if (s.state === 'rec') stopRec('cancel');
    else recCleanup();
}

function onRecStopped(s) {
    const action = s.action, dur = s.dur, kind = s.kind, ctx = s.ctx;
    const blob = new Blob(s.chunks, { type: s.mime });
    if (rec === s) recCleanup();
    if (action !== 'send') return;
    sendRecorded(ctx, kind, blob, dur);
}

function recCleanup() {
    const s = rec; if (!s) return;
    rec = null;
    untrackPointer();
    clearInterval(s.timer);
    if (s.recorder) { s.recorder.onstop = null; try { if (s.recorder.state !== 'inactive') s.recorder.stop(); } catch (e) {} }
    if (s.stream) s.stream.getTracks().forEach(t => t.stop());
    if (s.el) s.el.remove();
    if (s.btn) s.btn.classList.remove('hold-active');
    const w = document.querySelector('#group-screen .chat-input-wrapper'); if (w) w.classList.remove('recording');
}

function moveHold(x, y) {
    const s = rec; if (!s || s.released || s.locked) return;
    const dx = x - s.sx, dy = y - s.sy;
    const cancelling = dx < -CANCEL_PX && Math.abs(dx) > Math.abs(dy);
    if (dy < -LOCK_PX && Math.abs(dy) >= Math.abs(dx)) { s.locked = true; s.cancelling = false; s.el.style.setProperty('--dx', '0px'); untrackPointer(); paintHint(); return; }
    if (cancelling !== s.cancelling) { s.cancelling = cancelling; paintHint(); }
    s.el.style.setProperty('--dx', Math.max(-140, Math.min(0, dx)) + 'px');
}

function endHold(cancelled) {
    const s = rec; if (!s) return;
    if (s.released && s.state !== 'rec') return;
    s.released = true;
    if (s.locked) return;
    if (s.state === 'prep') return;      // дальше решит getUserMedia: слишком быстро — подсказка
    if (cancelled || s.cancelling) { cancelRec(); return; }
    if (Date.now() - s.started < MIN_MS) { cancelRec(); showToast('Слишком коротко. Удерживайте кнопку'); return; }
    stopRec('send');
}

// ============================================
// ОТПРАВКА
// ============================================
async function sendRecorded(ctx, kind, blob, dur) {
    if (blob.size < 1000) { showToast('Запись пустая. Попробуйте ещё раз.'); return; }
    if (blob.size > (kind === 'voice' ? 2400000 : 5900000)) { showToast('Запись слишком большая. Сделайте короче.'); return; }
    if (!getToken()) { showToast('Войдите в аккаунт'); return; }
    showToast('Отправляю…');
    try {
        const up = await fetch(`${SERVER_URL}/api/media/video?kind=${kind}&dur=${dur}`, {
            method: 'POST', headers: { 'Content-Type': blob.type || (kind === 'voice' ? 'audio/webm' : 'video/webm'), Authorization: 'Bearer ' + getToken() }, body: blob
        });
        let d = null; try { d = await up.json(); } catch (e) {}
        if (!up.ok || !d || !d.ok || !VM_ID_RE.test(String(d.id))) {
            showToast(up.status === 413 ? 'Запись слишком большая' : up.status === 429 ? 'Слишком много записей. Подождите немного.' : up.status === 401 ? 'Сессия истекла. Войдите снова.' : 'Не удалось отправить');
            return;
        }
        const payload = Object.assign({}, ctx.base, { text: '', clientId: newClientId() });
        payload[kind === 'voice' ? 'voice' : 'video'] = { id: d.id };
        socketAsk(ctx.event, payload, (res) => { if (!res.ok) showToast(res.message || 'Не удалось отправить'); });
    } catch (e) { showToast('Нет связи. Сообщение не отправлено.'); }
}

// при сворачивании приложения запись прерывается без отправки
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (rec) cancelRec(); stopPlaying(); } });
