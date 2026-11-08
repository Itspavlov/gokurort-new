// AssistantSettings: настройки помощника в localStorage (всё обёрнуто в try/catch).
const KEY = 'yy_asst_v1';
const DEF = { on: true, sound: false, hints: true, calm: false, voice: false, pad: 0 };
export const NAME = 'Юги';
export class Settings {
    constructor() {
        this.v = Object.assign({}, DEF); this.subs = [];
        try { Object.assign(this.v, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { }
    }
    get(k) { return this.v[k]; }
    set(k, val) { this.v[k] = val; try { localStorage.setItem(KEY, JSON.stringify(this.v)); } catch (e) { } this.subs.forEach(f => f(k, val)); }
    onChange(f) { this.subs.push(f); }
    // «меньше движения»: либо включено вручную, либо системная настройка
    get calm() { return !!this.v.calm || !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
}
export const seenBefore = () => { try { return !!localStorage.getItem('yy_asst_seen'); } catch (e) { return false; } };
export const markSeen = () => { try { localStorage.setItem('yy_asst_seen', '1'); } catch (e) { } };
// Виден ли сейчас главный экран (помощник живёт только там)
export function homeVisible() {
    if (document.hidden || document.body.classList.contains('kb-open')) return false;
    const t = document.getElementById('tab-search'); if (!t || t.offsetParent === null) return false;
    const g = document.getElementById('group-screen'); if (g && getComputedStyle(g).display !== 'none') return false;
    return true;
}
