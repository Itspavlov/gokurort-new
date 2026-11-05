// ============================================
// CIRCLES.JS — видеокружки в личных чатах (как в Телеграме):
// запись до 60 секунд, отправка и воспроизведение в круге.
// ============================================

const CIRCLE_MAX_SEC = 60;
const VM_ID_RE = /^vm_[0-9a-f]{32}$/;
let vrState = null;

const fmtDur = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

// ---------- сообщение-кружок в ленте ----------
const _renderDmMessage = renderDmMessage;
renderDmMessage = function (m) {
    if (!m || !m.video || !VM_ID_RE.test(String(m.video.id))) return _renderDmMessage(m);
    const me = getAccount();
    const mine = me && m.from && m.from.id === me.id;
    const id = escapeHtml(String(m.id));
    const time = formatTime(m.time);
    const dur = Math.max(1, Math.min(60, Number(m.video.dur) || 1));
    const src = `${SERVER_URL}/api/media/${m.video.id}`;
    const circle = `<div class="vc" role="button" tabindex="0" data-dur="${dur}" aria-label="Видеосообщение, ${dur} сек. Нажмите, чтобы воспроизвести">
        <video playsinline preload="metadata" src="${escapeHtml(src)}#t=0.1"></video>
        <svg class="vc-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48"></circle></svg>
        <span class="vc-play"><i class="fas fa-play"></i></span>
        <span class="vc-dur">${fmtDur(dur)}</span></div>`;
    if (mine) return `<div class="chat-message chat-message-mine" data-id="${id}"><div class="chat-bubble-wrap">${circle}<div class="chat-time-mine">${time}</div></div></div>`;
    const nm = (m.from && m.from.name) || '?';
    return `<div class="chat-message" data-id="${id}"><div class="chat-avatar" style="background:${dmColor(nm)};">${escapeHtml(Array.from(nm)[0] || '?')}</div><div class="chat-bubble-wrap"><div class="chat-bubble-header"><span class="chat-user-name">${escapeHtml(nm)}</span><span class="chat-time">${time}</span></div>${circle}</div></div>`;
};

// ---------- воспроизведение ----------
let playingVc = null;
function stopVc(vc) {
    if (!vc) return;
    const v = vc.querySelector('video');
    try { v.pause(); } catch (e) {}
    vc.classList.remove('playing');
    vc.style.setProperty('--p', 0);
    vc.querySelector('.vc-dur').textContent = fmtDur(Number(vc.dataset.dur));
    v.muted = true;
    if (playingVc === vc) playingVc = null;
}
function toggleVc(vc) {
    const v = vc.querySelector('video');
    if (vc.classList.contains('playing')) { stopVc(vc); return; }
    stopVc(playingVc);
    v.muted = false;
    try { v.currentTime = 0; } catch (e) {}
    const pr = v.play();
    if (pr && pr.catch) pr.catch(() => { showToast('Не удалось воспроизвести видео'); stopVc(vc); });
    vc.classList.add('playing');
    playingVc = vc;
    v.ontimeupdate = () => {
        const d = v.duration && isFinite(v.duration) ? v.duration : Number(vc.dataset.dur);
        vc.style.setProperty('--p', Math.min(1, v.currentTime / d));
        vc.querySelector('.vc-dur').textContent = fmtDur(d - v.currentTime);
    };
    v.onended = () => stopVc(vc);
    v.onerror = () => { showToast('Видео недоступно'); stopVc(vc); };
}
document.addEventListener('click', (ev) => { const vc = ev.target.closest && ev.target.closest('.vc'); if (vc) toggleVc(vc); });
document.addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList && ev.target.classList.contains('vc')) { ev.preventDefault(); toggleVc(ev.target); } });

// ---------- кнопка камеры в поле ввода ----------
function syncCircleBtn() {
    const input = document.getElementById('chatInput');
    const w = document.querySelector('#group-screen .chat-input-wrapper');
    if (!input || !w || !w.querySelector('.chat-video-btn')) return;
    const has = input.value.trim().length > 0;
    w.querySelector('.chat-send-btn:not(.chat-video-btn)').style.display = has ? '' : 'none';
    w.querySelector('.chat-video-btn').style.display = has ? 'none' : '';
}

const _openDmChat = openDmChat;
openDmChat = function () {
    _openDmChat.apply(this, arguments);
    const w = document.querySelector('#group-screen .chat-input-wrapper');
    const input = document.getElementById('chatInput');
    if (!w || !input || w.querySelector('.chat-video-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-send-btn chat-video-btn';
    btn.setAttribute('aria-label', 'Записать видеокружок');
    btn.innerHTML = '<i class="fas fa-video"></i>';
    btn.onclick = openCircleRecorder;
    w.appendChild(btn);
    input.addEventListener('input', syncCircleBtn);
    syncCircleBtn();
    setTimeout(() => runTour('circles', [{ sel: '.chat-video-btn', title: 'Видеокружки', text: 'Нажмите на камеру: запишите короткое видео до минуты, оно отправится круглым. Удобно показать жильё или объяснить, как добраться.' }]), 900);
};
const _sendDm = sendDm;
sendDm = function () { _sendDm.apply(this, arguments); setTimeout(syncCircleBtn, 0); };

// ---------- запись ----------
function pickMime() {
    const list = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    return list.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
}

function vrStop() {
    const s = vrState;
    if (!s) return;
    clearInterval(s.timer);
    try { if (s.rec && s.rec.state !== 'inactive') s.rec.stop(); } catch (e) {}
    if (s.stream) s.stream.getTracks().forEach(t => t.stop());
    if (s.url) URL.revokeObjectURL(s.url);
    if (s.el) s.el.remove();
    vrState = null;
}

async function vrStartCamera(facing) {
    const s = vrState;
    if (s.stream) s.stream.getTracks().forEach(t => t.stop());
    s.facing = facing;
    s.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 480 }, height: { ideal: 480 } },
        audio: { echoCancellation: true, noiseSuppression: true }
    });
    const v = s.el.querySelector('video');
    v.srcObject = s.stream; v.muted = true; v.loop = false;
    v.classList.toggle('mirror', facing === 'user');
    await v.play().catch(() => {});
}

function vrSetMode(mode) {
    const s = vrState; if (!s) return;
    s.mode = mode;
    s.el.dataset.mode = mode;
    const hint = s.el.querySelector('.vr-hint');
    hint.textContent = { preview: 'Нажмите на красную кнопку, чтобы начать запись', recording: 'Идёт запись. Нажмите ещё раз, чтобы закончить', review: 'Посмотрите и отправьте', sending: 'Отправляю…' }[mode] || '';
}

async function openCircleRecorder() {
    if (vrState) return;
    if (!currentDm) return;
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
        showToast('Видеокружки работают в браузерах с камерой и по защищённому адресу (https)');
        return;
    }
    unlockAudio && unlockAudio();
    const el = document.createElement('div');
    el.className = 'vr-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Запись видеокружка');
    el.innerHTML = `
        <div class="vr-top"><button type="button" class="vr-x" aria-label="Закрыть"><i class="fas fa-xmark"></i></button><span class="vr-time">0:00</span><button type="button" class="vr-flip" aria-label="Другая камера"><i class="fas fa-camera-rotate"></i></button></div>
        <div class="vr-stage"><div class="vr-circle"><video playsinline muted></video></div>
            <svg class="vr-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48"></circle></svg></div>
        <div class="vr-hint"></div>
        <div class="vr-actions">
            <button type="button" class="vr-again"><i class="fas fa-rotate-left"></i> Заново</button>
            <button type="button" class="vr-rec" aria-label="Запись"><span></span></button>
            <button type="button" class="vr-send"><i class="fas fa-paper-plane"></i> Отправить</button>
        </div>`;
    document.body.appendChild(el);
    vrState = { el, mode: 'preview', facing: 'user', chunks: [], started: 0, dur: 0, blob: null, url: '', stream: null, rec: null, timer: 0, convId: currentDm.convId };
    vrSetMode('preview');

    try { await vrStartCamera('user'); }
    catch (e) {
        vrStop();
        showToast(e && e.name === 'NotAllowedError' ? 'Разрешите доступ к камере и микрофону в настройках браузера' : 'Не удалось включить камеру');
        return;
    }

    const ring = el.querySelector('.vr-ring');
    const timeEl = el.querySelector('.vr-time');
    el.querySelector('.vr-x').onclick = vrStop;
    el.querySelector('.vr-flip').onclick = async () => {
        if (!vrState || vrState.mode !== 'preview') return;
        try { await vrStartCamera(vrState.facing === 'user' ? 'environment' : 'user'); } catch (e) { showToast('Другая камера недоступна'); try { await vrStartCamera(vrState.facing); } catch (e2) {} }
    };
    el.querySelector('.vr-again').onclick = async () => {
        const s = vrState; if (!s) return;
        if (s.url) { URL.revokeObjectURL(s.url); s.url = ''; }
        s.blob = null; ring.style.setProperty('--p', 0); timeEl.textContent = '0:00';
        try { await vrStartCamera(s.facing); vrSetMode('preview'); } catch (e) { vrStop(); showToast('Не удалось включить камеру'); }
    };

    const finish = () => {
        const s = vrState; if (!s || s.mode !== 'recording') return;
        clearInterval(s.timer);
        s.dur = Math.max(1, Math.round((Date.now() - s.started) / 1000));
        try { s.rec.stop(); } catch (e) {}
    };
    el.querySelector('.vr-rec').onclick = () => {
        const s = vrState; if (!s) return;
        if (s.mode === 'recording') { if (Date.now() - s.started < 1000) { showToast('Слишком коротко'); return; } finish(); return; }
        if (s.mode !== 'preview') return;
        const mime = pickMime();
        try { s.rec = new MediaRecorder(s.stream, Object.assign(mime ? { mimeType: mime } : {}, { videoBitsPerSecond: 500000, audioBitsPerSecond: 48000 })); }
        catch (e) { showToast('Запись видео не поддерживается в этом браузере'); return; }
        s.chunks = [];
        s.rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) s.chunks.push(ev.data); };
        s.rec.onstop = () => {
            if (!vrState || vrState !== s) return;
            s.blob = new Blob(s.chunks, { type: (s.rec.mimeType || mime || 'video/webm').split(';')[0] });
            if (s.stream) s.stream.getTracks().forEach(t => t.stop());
            s.stream = null;
            const v = el.querySelector('video');
            v.srcObject = null;
            s.url = URL.createObjectURL(s.blob);
            v.src = s.url; v.muted = false; v.loop = true; v.classList.remove('mirror');
            v.play().catch(() => {});
            vrSetMode('review');
        };
        s.rec.start(500);
        s.started = Date.now();
        vrSetMode('recording');
        s.timer = setInterval(() => {
            const sec = (Date.now() - s.started) / 1000;
            timeEl.textContent = fmtDur(sec);
            ring.style.setProperty('--p', Math.min(1, sec / CIRCLE_MAX_SEC));
            if (sec >= CIRCLE_MAX_SEC) finish();
        }, 200);
    };
    el.querySelector('.vr-send').onclick = () => vrSend();
}

async function vrSend() {
    const s = vrState;
    if (!s || s.mode !== 'review' || !s.blob) return;
    if (s.blob.size > 5_900_000) { showToast('Видео слишком большое. Запишите покороче.'); return; }
    if (!getToken()) { showToast('Войдите в аккаунт'); return; }
    vrSetMode('sending');
    try {
        const up = await fetch(`${SERVER_URL}/api/media/video?dur=${s.dur}`, {
            method: 'POST', headers: { 'Content-Type': s.blob.type || 'video/webm', Authorization: 'Bearer ' + getToken() }, body: s.blob
        });
        let d = null; try { d = await up.json(); } catch (e) {}
        if (!up.ok || !d || !d.ok || !VM_ID_RE.test(String(d.id))) {
            showToast(up.status === 413 ? 'Видео слишком большое' : up.status === 429 ? 'Слишком много видео. Подождите немного.' : up.status === 401 ? 'Сессия истекла. Войдите снова.' : 'Не удалось отправить видео');
            if (vrState) vrSetMode('review');
            return;
        }
        const convId = s.convId, clientId = newClientId();
        socketAsk('dm-send', { convId, text: '', video: { id: d.id }, clientId }, (res) => {
            if (res.ok) { vrStop(); return; }
            showToast(res.message || 'Не удалось отправить');
            if (vrState) vrSetMode('review');
        });
    } catch (e) {
        showToast('Нет связи. Видео не отправлено.');
        if (vrState) vrSetMode('review');
    }
}

// при сворачивании приложения камера выключается
document.addEventListener('visibilitychange', () => { if (document.hidden && vrState && vrState.mode !== 'sending') vrStop(); });
