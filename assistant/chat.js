// AssistantChat: текстовый помощник. ИИ получает доступ к приложению ТОЛЬКО через AppBridge (белый список действий):
//   point — показать раздел (персонаж подходит и указывает рукой; ничего не открывается);
//   open  — открыть раздел: выполняется ТОЛЬКО по нажатию пользователя на кнопку в чате;
//   say, celebrate — реплика и анимация.
// Провайдер ответов сменный: LocalProvider (правила, работает офлайн) или RemoteProvider (когда на сервере появится /api/assistant).
import { NAME } from './settings.js?v=1';
import { AssistantVoice } from './voice.js?v=1';

export const SECTIONS = [
    { id: 'housing', label: 'Жильё', sel: '.gc-housing', re: /жил|квартир|комнат|дом|снять|аренд|сдать|отель|гостиниц|номер/i, hint: 'Ищешь, где остановиться? Загляни в «Жильё».' },
    { id: 'work', label: 'Работа', sel: '.gc-work', re: /работ|вакан|подработ|сезон|официант|горнич/i, hint: 'Нужна сезонная работа? Смотри «Работу».' },
    { id: 'trips', label: 'Поездки', sel: '.gc-trips', re: /поездк|попутч|такси|трансфер|доехать|добраться|машин/i, hint: 'Едешь к морю или обратно? Загляни в «Поездки».' },
    { id: 'services', label: 'Развлечения', sel: '.gc-services', re: /развлеч|экскурс|яхт|катер|прогулк|море|пляж|досуг|чем заня/i, hint: 'Скучно? В «Развлечениях» есть экскурсии и морские прогулки.' },
    { id: 'dating', label: 'Знакомства и общение', sel: '.gc-dating', re: /знаком|общени|компан|друз|поговор/i, hint: 'Хочешь найти компанию? Загляни в «Знакомства и общение».' }
];

// Разрешённые программные интерфейсы приложения
export const AppBridge = {
    sections: () => SECTIONS.map(s => ({ id: s.id, label: s.label })),
    el: id => { const s = SECTIONS.find(x => x.id === id); return s ? document.querySelector('#tab-search ' + s.sel) : null; },
    open: id => { if (SECTIONS.some(s => s.id === id) && typeof window.openGroup === 'function') window.openGroup(id); }   // вызывается только из клика пользователя
};
const ALLOWED = new Set(['point', 'open', 'say', 'celebrate']);
export function sanitize(actions) {          // что бы ни вернул ИИ, лишнего не выполним
    return (Array.isArray(actions) ? actions : []).filter(a => a && ALLOWED.has(a.type) && (a.type === 'say' || a.type === 'celebrate' || SECTIONS.some(s => s.id === a.section))).slice(0, 4);
}

export class LocalProvider {
    async reply(text) {
        const t = text.trim();
        if (/^(привет|здравствуй|добрый|hi|hello|хай)/i.test(t)) return { text: `Привет! Я ${NAME}. Подскажу, где что искать, и покажу нужный раздел. Сам ничего не открываю — только если ты нажмёшь кнопку.`, actions: [] };
        if (/что (тут|здесь|есть|умеешь)|помо(щь|ги)|разделы|как (тут|здесь)/i.test(t)) return { text: 'Здесь пять разделов: жильё, работа, поездки, развлечения и знакомства. Какой показать?', actions: SECTIONS.map(s => ({ type: 'point', section: s.id })).slice(0, 4) };
        if (/размест|подать объявл|добавить объявл|опублик/i.test(t)) return { text: 'Объявление размещается внутри раздела: открой нужный и нажми кнопку добавления. Показать, где разделы?', actions: [{ type: 'point', section: 'housing' }, { type: 'point', section: 'work' }] };
        if (/поиск|найти|ищу/i.test(t) && !SECTIONS.some(s => s.re.test(t))) return { text: 'Строка поиска вверху экрана: впиши, что ищешь, и нажми «Найти».', actions: [] };
        const hit = SECTIONS.find(s => s.re.test(t));
        if (hit) return { text: `Это про раздел «${hit.label}». Показать, где он?`, actions: [{ type: 'point', section: hit.id }, { type: 'open', section: hit.id }] };
        if (/спасибо|круто|класс|отлично/i.test(t)) return { text: 'Рад помочь!', actions: [{ type: 'celebrate' }] };
        return { text: 'Пока я понимаю простые вопросы про разделы: жильё, работа, поездки, развлечения, знакомства. Полноценные ответы ИИ подключим позже.', actions: SECTIONS.slice(0, 3).map(s => ({ type: 'point', section: s.id })) };
    }
}
// Заготовка под серверный ИИ: сервер должен вернуть {text, actions}; клиент всё равно пропустит ответ через sanitize().
export class RemoteProvider {
    constructor(url) { this.url = url; }
    async reply(text) {
        const r = await fetch(this.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, sections: AppBridge.sections() }) });
        if (!r.ok) throw new Error('assistant ' + r.status);
        const j = await r.json(); return { text: String(j.text || '').slice(0, 800), actions: j.actions };
    }
}

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class AssistantChat {
    // host: { settings, onPoint(id), onCelebrate(), onOpen(), onClose(), onTalk(on), say(text) }
    constructor(host, provider) {
        this.host = host; this.provider = provider || new LocalProvider(); this.voice = new AssistantVoice(); this.isOpen = false; this.busy = false;
        const p = this.el = h('div', 'yy-chat'); p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Помощник ' + NAME); p.hidden = true;
        p.innerHTML = `<div class="yy-chat-head"><span class="yy-chat-title"><b>${NAME}</b><small>помощник</small></span>
            <button type="button" class="yy-ic" data-a="settings" aria-label="Настройки помощника"><i class="fas fa-gear"></i></button>
            <button type="button" class="yy-ic" data-a="close" aria-label="Закрыть"><i class="fas fa-xmark"></i></button></div>
            <div class="yy-msgs" aria-live="polite"></div>
            <div class="yy-chips"></div>
            <form class="yy-chat-in" autocomplete="off"><input type="text" maxlength="300" placeholder="Спроси про жильё, работу, поездки…" aria-label="Вопрос помощнику">
            <button type="button" class="yy-ic yy-mic" data-a="mic" aria-label="Голосовой ввод" hidden><i class="fas fa-microphone"></i></button>
            <button type="submit" class="yy-send" aria-label="Отправить"><i class="fas fa-paper-plane"></i></button></form>
            <div class="yy-set" hidden></div>`;
        document.body.appendChild(p);
        this.msgs = p.querySelector('.yy-msgs'); this.chips = p.querySelector('.yy-chips'); this.input = p.querySelector('input'); this.setBox = p.querySelector('.yy-set');
        p.addEventListener('click', e => {
            const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
            if (a === 'close') this.close(); else if (a === 'settings') this.toggleSettings(); else if (a === 'mic') this.mic();
            else if (a === 'point') { this.close(); this.host.onPoint(b.dataset.id); }
            else if (a === 'open') { AppBridge.open(b.dataset.id); this.close(); }          // явное нажатие пользователя
            else if (a === 'chip') this.ask(b.dataset.q);
        });
        p.querySelector('form').addEventListener('submit', e => { e.preventDefault(); const q = this.input.value.trim(); if (q) { this.input.value = ''; this.ask(q); } });
        if (AssistantVoice.canListen && host.settings.get('voice')) p.querySelector('.yy-mic').hidden = false;
        this.renderChips();
    }
    renderChips() {
        const q = ['Что здесь есть?', 'Найти жильё', 'Нужна работа', 'Как добраться?'];
        this.chips.innerHTML = q.map(x => `<button type="button" data-a="chip" data-q="${esc(x)}">${esc(x)}</button>`).join('');
    }
    open() {
        if (this.isOpen) return; this.isOpen = true; this.el.hidden = false; this.setBox.hidden = true;
        requestAnimationFrame(() => this.el.classList.add('on'));
        if (!this.msgs.children.length) this.add('bot', `Привет! Я ${NAME}. Спроси, где что искать, или нажми подсказку ниже.`);
        this.host.onOpen(this.el);
    }
    close() {
        if (!this.isOpen) return; this.isOpen = false; this.el.classList.remove('on'); this.voice.stop();
        setTimeout(() => { if (!this.isOpen) this.el.hidden = true; }, 220); this.host.onClose();
    }
    toggle() { this.isOpen ? this.close() : this.open(); }
    add(role, text, actions) {
        const m = h('div', 'yy-m ' + role); m.innerHTML = `<span>${esc(text)}</span>`;
        for (const a of sanitize(actions)) {
            if (a.type === 'point' || a.type === 'open') {
                const s = SECTIONS.find(x => x.id === a.section), b = h('button', 'yy-act' + (a.type === 'open' ? ' open' : ''), a.type === 'point' ? `Показать: ${esc(s.label)}` : `Открыть «${esc(s.label)}»`);
                b.type = 'button'; b.dataset.a = a.type; b.dataset.id = s.id; m.appendChild(b);
            }
        }
        this.msgs.appendChild(m); this.msgs.scrollTop = this.msgs.scrollHeight; return m;
    }
    async ask(q) {
        if (this.busy) return; this.busy = true; this.add('me', q); const wait = this.add('bot', '…'); this.host.onTalk(true);
        let res; try { res = await this.provider.reply(q); } catch (e) { res = { text: 'Не получилось связаться с помощником. Попробуй ещё раз позже.', actions: [] }; }
        wait.remove(); this.add('bot', res.text, res.actions); this.host.onTalk(false, res.text);
        for (const a of sanitize(res.actions)) if (a.type === 'celebrate') this.host.onCelebrate();
        if (this.host.settings.get('sound') && this.host.settings.get('voice')) this.voice.speak(res.text);
        this.busy = false;
    }
    mic() { const b = this.el.querySelector('.yy-mic'); b.classList.add('rec'); this.voice.listen(t => this.ask(t), () => b.classList.remove('rec')); }
    toggleSettings() {
        const S = this.host.settings, box = this.setBox; box.hidden = !box.hidden; if (box.hidden) return;
        const row = (k, label, note) => `<label class="yy-row"><span>${label}${note ? `<small>${note}</small>` : ''}</span><input type="checkbox" data-k="${k}" ${S.get(k) ? 'checked' : ''}><i class="yy-sw"></i></label>`;
        box.innerHTML = `<div class="yy-set-h">Настройки помощника</div>${row('on', 'Показывать помощника')}${row('sound', 'Звук')}${row('hints', 'Автоподсказки', 'иногда подсказывает разделы')}${row('calm', 'Меньше движения', 'персонаж почти не бегает')}${row('voice', 'Голос (пробный)', 'озвучка ответов и ввод голосом')}
            <label class="yy-row yy-pad"><span>Отступ от нижней панели<small>если персонаж мешает</small></span><input type="range" min="0" max="60" step="4" value="${S.get('pad')}" data-k="pad"></label>`;
        box.onchange = e => { const k = e.target.dataset.k; if (!k) return; const v = e.target.type === 'checkbox' ? e.target.checked : +e.target.value; S.set(k, v); if (k === 'on' && !v) this.close(); if (k === 'voice') this.el.querySelector('.yy-mic').hidden = !(v && AssistantVoice.canListen); };
    }
    destroy() { this.el.remove(); }
}
