'use strict';
// ============================================
// Личные сообщения: ответы на сообщения и реакции (меню по тапу — в social.js).
// Подключается после circles/dmquick/dmtools: оборачивает самый внешний renderDmMessage.
// ============================================
window.dmMsgs = window.dmMsgs || {};

(function () {
    const _render = renderDmMessage;
    renderDmMessage = function (m) {
        if (m && m.id) window.dmMsgs[m.id] = m;
        const html = _render.apply(this, arguments);
        if (!m || !m.id) return html;
        const t = document.createElement('template');
        t.innerHTML = html;
        const wrap = t.content.querySelector('.chat-bubble-wrap');
        if (!wrap) return html;
        const bub = wrap.querySelector('.chat-bubble');
        if (bub && m.reply && !bub.querySelector('.reply-quote')) bub.insertAdjacentHTML('afterbegin', renderReplyHTML(m));
        if (!wrap.querySelector('.chat-reactions')) {
            const chips = `<div class="chat-reactions" data-for="${escapeHtml(String(m.id))}">${renderReactionChips(m)}</div>`;
            if (bub) bub.insertAdjacentHTML('afterend', chips); else wrap.insertAdjacentHTML('beforeend', chips);
        }
        return t.innerHTML;
    };
})();

function paintDmReactions(id, reactions, mine) {
    const m = window.dmMsgs[id];
    if (!m) return;
    m.reactions = reactions; m.mine = mine || [];
    const holder = document.querySelector(`.chat-reactions[data-for="${CSS.escape(String(id))}"]`);
    if (holder) holder.innerHTML = renderReactionChips(m);
}

function onDmReaction(d) {
    if (!d || !currentDm || currentDm.convId !== d.convId) return;
    paintDmReactions(d.id, d.reactions || {}, d.mine || []);
}
