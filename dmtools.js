// ============================================
// DMTOOLS.JS — личные сообщения: «прочитано», чёрный список, жалобы.
// Надстройка над social.js: оборачивает openDmChat, renderDmMessage, onDmMessage.
// ============================================
let dmMeta = { peerRead: 0, blockedByMe: false };

// ---------- галочки: одна — доставлено, две голубые — прочитано ----------
function dmTickHTML(m) {
    const read = dmMeta.peerRead && dmMeta.peerRead >= m.time;
    return `<i class="fas ${read ? 'fa-check-double' : 'fa-check'} dm-tick ${read ? 'read' : ''}" data-time="${Number(m.time) || 0}" aria-label="${read ? 'Прочитано' : 'Доставлено'}"></i>`;
}
const _renderDmMessageTools = renderDmMessage;
renderDmMessage = function (m) {
    const html = _renderDmMessageTools.apply(this, arguments);
    const me = getAccount();
    if (!(me && m.from && m.from.id === me.id)) return html;
    return html.replace(/(<div class="chat-time-mine">)([^<]*)(<\/div>)/, `$1$2 ${dmTickHTML(m)}$3`);
};

function paintTicks() {
    document.querySelectorAll('#chatMessages .dm-tick').forEach(t => {
        const read = dmMeta.peerRead && dmMeta.peerRead >= Number(t.dataset.time);
        t.classList.toggle('read', !!read);
        t.classList.toggle('fa-check-double', !!read);
        t.classList.toggle('fa-check', !read);
        t.setAttribute('aria-label', read ? 'Прочитано' : 'Доставлено');
    });
}

function onDmRead(d) {
    if (!d || !currentDm || currentDm.convId !== d.convId) return;
    dmMeta.peerRead = Math.max(dmMeta.peerRead, Number(d.time) || 0);
    paintTicks();
}

// Сообщаем серверу, что диалог открыт и прочитан
function markDmRead() {
    if (!currentDm || document.hidden) return;
    socketAsk('dm-read', { convId: currentDm.convId }, () => {});
}

const _onDmMessageTools = onDmMessage;
onDmMessage = function (m) {
    const r = _onDmMessageTools.apply(this, arguments);
    try {
        const me = getAccount();
        if (m && currentDm && currentDm.convId === m.convId && me && m.from && m.from.id !== me.id) markDmRead();
    } catch (e) {}
    return r;
};
document.addEventListener('visibilitychange', () => { if (!document.hidden) markDmRead(); });

// ---------- чёрный список ----------
function applyBlockUI() {
    const screen = document.getElementById('group-screen');
    if (!screen || !currentDm) return;
    const wrap = screen.querySelector('.chat-input-wrapper');
    let bar = screen.querySelector('.dm-blocked');
    if (dmMeta.blockedByMe) {
        if (!bar) {
            bar = document.createElement('div');
            bar.className = 'dm-blocked';
            bar.innerHTML = `<span><i class="fas fa-ban"></i> Вы заблокировали ${escapeHtml(currentDm.with)}</span><button type="button" class="ghost-btn">Разблокировать</button>`;
            bar.querySelector('button').onclick = () => setDmBlock(false);
            if (wrap) wrap.insertAdjacentElement('beforebegin', bar); else screen.appendChild(bar);
        }
        if (wrap) wrap.style.display = 'none';
    } else {
        if (bar) bar.remove();
        if (wrap) wrap.style.display = '';
    }
}

function setDmBlock(on) {
    if (!currentDm) return;
    const convId = currentDm.convId;
    socketAsk('dm-block', { convId, on }, (res) => {
        if (!res || !res.ok) { showToast((res && res.message) || 'Не удалось выполнить'); return; }
        if (currentDm && currentDm.convId === convId) { dmMeta.blockedByMe = !!res.blockedByMe; applyBlockUI(); }
        showToast(on ? 'Пользователь заблокирован' : 'Пользователь разблокирован');
    });
}

// ---------- жалоба ----------
const DM_REASONS = [['spam', 'Спам или реклама'], ['scam', 'Мошенничество (предоплата, левые ссылки)'], ['abuse', 'Оскорбления или угрозы'], ['other', 'Другое']];
function openDmReport() {
    if (!currentDm) return;
    const convId = currentDm.convId, who = currentDm.with;
    openSheet('Пожаловаться', `
        <p class="auth-note" style="margin:0 2px 10px">Модератор увидит последние сообщения этого диалога. Собеседник о жалобе не узнает.</p>
        <div class="pref-list" id="rpReasons">${DM_REASONS.map(([k, t], i) => `<label class="pref-row"><span><b>${t}</b></span><input type="radio" name="rpReason" value="${k}" ${i === 0 ? 'checked' : ''}><i class="rp-dot"></i></label>`).join('')}</div>
        <label class="field" style="margin-top:10px"><span>Что произошло (по желанию)</span><textarea id="rpText" rows="2" maxlength="300"></textarea></label>
        <label class="pref-row" style="margin-top:4px"><span><b>Заблокировать ${escapeHtml(who)}</b><small>Он не сможет вам писать</small></span><input type="checkbox" id="rpBlock" checked><i class="pref-sw"></i></label>
        <button class="primary-btn wide-btn" id="rpSend" style="margin-top:12px">Отправить жалобу</button>`, (el) => {
        el.querySelector('#rpSend').onclick = () => {
            const btn = el.querySelector('#rpSend'); btn.disabled = true;
            const reason = (el.querySelector('input[name=rpReason]:checked') || {}).value;
            socketAsk('dm-report', { convId, reason, text: el.querySelector('#rpText').value.trim() }, (res) => {
                if (!res || !res.ok) { btn.disabled = false; showToast((res && res.message) || 'Не удалось отправить'); return; }
                const block = el.querySelector('#rpBlock').checked;
                closeSheet();
                showToast('Жалоба отправлена. Спасибо');
                if (block && !dmMeta.blockedByMe) setDmBlock(true);
            });
        };
    });
}

function openDmMenu() {
    if (!currentDm) return;
    openSheet(escapeHtml(currentDm.with), `<div class="pf-menu">
        <button type="button" class="pf-row" id="dmmBlock"><i class="fas fa-ban"></i><span>${dmMeta.blockedByMe ? 'Разблокировать' : 'Заблокировать'}</span></button>
        <button type="button" class="pf-row" id="dmmReport"><i class="fas fa-flag"></i><span>Пожаловаться</span></button></div>`, (el) => {
        el.querySelector('#dmmBlock').onclick = () => { closeSheet(); setDmBlock(!dmMeta.blockedByMe); };
        el.querySelector('#dmmReport').onclick = () => { closeSheet(); openDmReport(); };
    });
}

// ---------- открытие диалога ----------
const _openDmChatTools = openDmChat;
openDmChat = function (conv) {
    dmMeta = { peerRead: Number(conv && conv.peerRead) || 0, blockedByMe: !!(conv && conv.blockedByMe) };   // до отрисовки сообщений
    const r = _openDmChatTools.apply(this, arguments);
    const head = document.querySelector('#group-screen .chat-header');
    if (head && !head.querySelector('#dmMenuBtn')) head.insertAdjacentHTML('beforeend', '<button type="button" class="chat-header-btn" id="dmMenuBtn" aria-label="Меню диалога"><i class="fas fa-ellipsis-vertical"></i></button>');
    const b = document.getElementById('dmMenuBtn'); if (b) b.onclick = openDmMenu;
    applyBlockUI();
    setTimeout(markDmRead, 500);
    return r;
};
