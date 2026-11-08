// Navigator: читает DOM (края карточек = «земля», текст и кнопки = «запретные зоны»), выбирает места и строит маршруты.
// Ничего не кэширует по координатам надолго: у каждого шага есть ссылка на элемент и доля u вдоль его верхней кромки,
// положение пересчитывается каждый кадр по getBoundingClientRect (прокрутка, перестройка списков, смена темы).
const ANCHOR_SEL = '#tab-search .group-card, #tab-search #featuredList > *';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export class Navigator {
    constructor() { this.vw = 360; this.vh = 640; this.tileH = 164; this.navTop = 600; this.topLimit = 0; this.protect = []; this.t = -1e9; this.dirty = true; this.navEl = null; this.panel = null; this.pad = 0; }
    refresh(now, force) { if (!force && !(this.dirty && now - this.t > 250) && now - this.t < 900) return; this.dirty = false; this.t = now; this.scan(); }
    scan() {
        const de = document.documentElement; this.vw = de.clientWidth; this.vh = window.innerHeight;
        const nav = this.navEl = document.querySelector('.bottom-nav-inner'), nr = nav && nav.getBoundingClientRect();
        this.navTop = nr && nr.height > 0 && nr.top < this.vh ? nr.top : this.vh - 10;
        const hd = document.querySelector('.app-header'), hr = hd && hd.getBoundingClientRect();
        this.topLimit = hr && hr.height > 0 ? Math.max(0, hr.bottom) : 0;
        const c0 = document.querySelector('#tab-search .group-grid .group-card'); if (c0) { const h = c0.getBoundingClientRect().height; if (h > 60) this.tileH = h; }
        // запретные зоны: все текстовые узлы и интерактивные элементы
        const out = [], vh = this.vh, vw = this.vw, rg = document.createRange();
        const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.nodeValue.trim() && n.parentNode && !(n.parentNode.closest && n.parentNode.closest('.yy-asst,.yy-chat,script,style,noscript'))) ? 1 : 2 });
        let n, cnt = 0; while ((n = tw.nextNode()) && cnt++ < 1200) {
            rg.selectNodeContents(n); const r = rg.getBoundingClientRect();
            if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
            out.push([r.left, r.top, r.right, r.bottom]);
        }
        document.querySelectorAll('button,a[href],input,textarea,select,[role=button]').forEach(el => {
            if (el.closest('.yy-asst,.yy-chat,.bottom-nav')) return;
            const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > vh) return; out.push([r.left, r.top, r.right, r.bottom]);
        });
        this.protect = out;
    }
    // положение точки на верхней кромке элемента
    resolve(el, u) {
        const r = el.getBoundingClientRect(), dy = el === this.navEl ? this.pad : 0;
        return { x: r.left + u * r.width, y: r.top + 1 - dy, r };
    }
    ovl(x0, y0, x1, y1) {
        let a = 0; for (const p of this.protect) { const w = Math.min(x1, p[2]) - Math.max(x0, p[0]); if (w <= 0) continue; const h = Math.min(y1, p[3]) - Math.max(y0, p[1]); if (h > 0) a += w * h; }
        return a / ((x1 - x0) * (y1 - y0));
    }
    box(x, y, w, h, mode) { return mode === 'sit' ? [x - w * 0.5, y - 0.6 * h, x + w * 0.5, y + 0.3 * h] : [x - w * 0.5, y - h, x + w * 0.5, y]; }
    // все возможные точки стоянки: [{el,u,x,y,kind,score}]; score — доля тела, закрывающая текст/кнопки
    candidates(w, h, mode = 'stand') {
        const out = [], bandTop = this.topLimit + h + 6, bandBot = this.navTop - 2 - (mode === 'sit' ? 0.32 * h : 0);
        const add = (el, kind) => {
            const r = el.getBoundingClientRect(); if (r.width < w * 1.6 || r.height < 18) return;
            const y = r.top + 1 - (kind === 'nav' ? this.pad : 0);
            if (kind === 'nav' ? y < h + 6 : (y < bandTop || y > bandBot)) return;
            const lo = Math.max(r.left + w * 0.5 + 2, w * 0.5 + 4), hi = Math.min(r.right - w * 0.5 - 2, this.vw - w * 0.5 - 4); if (hi < lo) return;
            const step = Math.max(14, w * 0.7), n = Math.max(1, Math.floor((hi - lo) / step) + 1);
            for (let i = 0; i < n; i++) {
                const x = n === 1 ? (lo + hi) / 2 : lo + (hi - lo) * i / (n - 1), b = this.box(x, y, w, h, mode);
                out.push({ el, u: (x - r.left) / r.width, x, y, kind, score: kind === 'panel' ? 0 : this.ovl(b[0], b[1], b[2], b[3]) });
            }
        };
        if (this.panel) { add(this.panel, 'panel'); return out; }
        document.querySelectorAll(ANCHOR_SEL).forEach(el => add(el, 'card'));
        if (this.navEl) add(this.navEl, 'nav');
        return out;
    }
    // маршрут между двумя точками (null — недостижимо без «телепорта»)
    plan(from, to, h) {
        if (from.el === to.el) return [{ t: 'walk', el: to.el, u: to.u }];
        const a = this.resolve(from.el, from.u), b = this.resolve(to.el, to.u), dy = b.y - a.y, dist = Math.hypot(b.x - a.x, dy);
        if (dy < -1.15 * h) {                       // вверх — лезем по краю
            if (-dy > 6.5 * h) return null;
            let edge = null; if (Math.abs(a.r.left - b.r.left) < 40) edge = 'L'; else if (Math.abs(a.r.right - b.r.right) < 40) edge = 'R';
            if (!edge) return null;
            return [{ t: 'walk', el: from.el, edge }, { t: 'climb', from: from.el, to: to.el, edge }, { t: 'walk', el: to.el, u: to.u }];
        }
        if (dist > 3.6 * h) return null;
        return [{ t: 'walk', el: from.el, toX: b.x }, { t: 'jump', to: { el: to.el, u: to.u } }];
    }
    inBand(el, h) { if (!el || !el.isConnected) return false; const r = el.getBoundingClientRect(); if (el === this.navEl) return r.height > 0; return r.height > 0 && r.top >= this.topLimit + h + 6 && r.top <= this.navTop - 2 && r.right > 0 && r.left < this.vw; }
}
