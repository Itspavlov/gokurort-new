// AssistantController: главный цикл. Связывает модель, аниматор, навигатор, чат и настройки.
// Холст маленький (≈2.2 высоты персонажа) и перемещается через transform; поверх страницы — только кнопка-«хитбокс» по самому персонажу.
import { WebGLRenderer, Group, OrthographicCamera } from './gl3d.js?v=1';
import { CharacterModel, MODEL_HEIGHT } from './model.js?v=1';
import { CharacterAnimator } from './animator.js?v=1';
import { Navigator } from './navigator.js?v=1';
import { Settings, NAME, homeVisible, seenBefore, markSeen } from './settings.js?v=1';
import { AssistantChat, AppBridge, SECTIONS, LocalProvider } from './chat.js?v=1';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
const SPEED_WALK = 50, SPEED_RUN = 105, SPEED_CLIMB = 48;
const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

export class AssistantController {
    constructor(settings) {
        this.S = settings || new Settings(); this.nav = new Navigator(); this.pos = { el: null, u: 0.5, x: -100, y: -100, air: false };
        this.step = null; this.queue = []; this.deferred = null; this.pending = []; this.idleT = 0; this.sc = 0; this.dir = 1; this.h = 0;
        this.running = false; this.last = 0; this.lastDraw = 0; this.scrollAt = 0; this.nextHint = performance.now() + 28000; this.hintsShown = 0; this.lastHintId = '';
        this.bubbleTimer = 0; this.bubbleOn = false; this.bw = 0; this.bh = 0; this.recoverAt = 0; this.dead = false; this.entered = false;
        // DOM
        const L = this.layer = el('div', 'yy-asst'); L.style.display = 'none';
        const cv = this.canvas = el('canvas', 'yy-asst-canvas'); cv.setAttribute('aria-hidden', 'true');
        const hit = this.hit = el('button', 'yy-asst-hit'); hit.type = 'button'; hit.setAttribute('aria-label', 'Помощник ' + NAME + ': нажми, чтобы поговорить');
        const bb = this.bubble = el('div', 'yy-bubble'); bb.setAttribute('role', 'status');
        this.zzz = el('div', 'yy-zzz'); this.zzz.innerHTML = '<i>z</i><i>z</i><i>Z</i>';
        L.append(cv, this.zzz, bb, hit); document.body.appendChild(L);
        // 3D
        this.renderer = new WebGLRenderer(cv);
        this.scene = new Group(); this.cam = new OrthographicCamera(0, 10, 10, 0, -1000, 1000);
        this.model = new CharacterModel(); this.scene.add(this.model.root); this.anim = new CharacterAnimator(this.model);
        cv.addEventListener('webglcontextlost', e => { e.preventDefault(); this.fail(); });
        // чат
        this.chat = new AssistantChat({
            settings: this.S,
            onPoint: id => { const s = SECTIONS.find(x => x.id === id); this.pointAt(id, `Вот «${s.label}». Нажми на плитку, если хочешь открыть.`); },
            onCelebrate: () => this.celebrate(), onTalk: on => { if (this.chatOpen) this.anim.play(on ? 'talk' : 'idle'); },
            onOpen: panel => this.onChatOpen(panel), onClose: () => this.onChatClose()
        }, new LocalProvider());
        // события
        hit.addEventListener('click', () => { this.poke(); this.unlockAudio(); this.chat.toggle(); });
        bb.addEventListener('click', () => { this.poke(); this.chat.open(); });
        const poke = () => this.poke();
        for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, poke, { passive: true, capture: true });
        window.addEventListener('scroll', () => { this.scrollAt = performance.now(); this.nav.dirty = true; this.poke(); }, { passive: true, capture: true });
        window.addEventListener('resize', () => { this.nav.dirty = true; });
        this.mo = new MutationObserver(() => { this.nav.dirty = true; });
        const home = document.getElementById('tab-search'); if (home) this.mo.observe(home, { childList: true, subtree: true });
        this.S.onChange((k, v) => { if (k === 'pad') this.nav.pad = v; if (k === 'on' && !v) this.destroy(true); });
        this.nav.pad = this.S.get('pad');
        this.loop = t => { this.raf = requestAnimationFrame(this.loop); this.frame(t); };
        this.watchTimer = setInterval(() => this.watch(), 350); this.watch();
    }

    // ---------- жизненный цикл ----------
    watch() {
        if (this.dead) return;
        const ok = homeVisible() && this.S.get('on');
        if (ok && !this.running) this.resume(); else if (!ok && this.running) this.suspend();
    }
    resume() {
        this.running = true; this.layer.style.display = ''; this.last = this.lastDraw = performance.now(); this.nav.refresh(this.last, true); this.layout();
        if (!this.entered) { this.entered = true; this.enter(); }
        this.raf = requestAnimationFrame(this.loop);
    }
    suspend() { this.running = false; cancelAnimationFrame(this.raf); this.layer.style.display = 'none'; this.hideBubble(); if (this.chat.isOpen) this.chat.close(); }
    destroy(keepSettings) {
        this.dead = true; this.running = false; cancelAnimationFrame(this.raf); clearInterval(this.watchTimer); this.mo.disconnect();
        try { this.renderer.dispose(); } catch (e) { } this.layer.remove(); this.chat.destroy(); document.querySelectorAll('.yy-spot').forEach(e => e.classList.remove('yy-spot'));
        window.dispatchEvent(new CustomEvent('yy-assistant-off'));
    }
    fail() { this.destroy(); }
    enter() {
        const first = !seenBefore(), n = this.nav, navEl = n.navEl;
        if (!navEl) return;
        const steps = [{ t: 'pop', el: navEl, u: first ? 0.12 : 0.1 + Math.random() * 0.8 }];
        if (first) { markSeen(); steps.push({ t: 'do', anim: 'wave', dur: 4.2, bubble: `Привет! Я ${NAME}, помощник YuGi YuGi. Нажми на меня, если нужна подсказка.` }); }
        else steps.push({ t: 'do', anim: 'wave', dur: 1.3 });
        this.go(steps);
    }

    // ---------- размеры ----------
    layout() {
        const h = Math.round(clamp(this.nav.tileH * 0.33, 30, 120));                      // высота персонажа = 33% высоты плитки
        if (h === this.h) return; this.h = h; this.w = h * 0.4; this.s = h / MODEL_HEIGHT;
        const B = this.B = Math.round(h * 2.2), pr = this.pr = Math.min(window.devicePixelRatio || 1, 2);
        this.cam.set(0, B, B, 0, -1000, 1000); this.renderer.setSize(B, B, pr);
    }

    // ---------- управление шагами ----------
    go(steps, force) {
        const cu = this.step; if (cu && cu.t === 'do' && cu.onEnd && cu.age < cu.dur) { cu.onEnd(); cu.onEnd = null; }
        if (force) { this.pos.air = false; this.deferred = null; } else if (this.pos.air) { this.deferred = steps; return; }
        this.queue = steps.slice(); this.step = null; this.nextStep();
    }
    nextStep() {
        if (this.deferred && !this.pos.air) { this.queue = this.deferred; this.deferred = null; }
        this.step = this.queue.shift() || null; if (this.step) this.begin(this.step);
    }
    begin(s) {
        const A = this.anim, c = A.ctx, p = this.pos;
        if (s.t === 'do') {
            s.age = 0; c.look = (Math.random() - 0.5) * 1.2; if (s.dir) { this.dir = s.dir; } c.dir = this.dir;
            A.play(s.anim, { fade: s.fade }); if (s.anim === 'celebrate') this.confetti(); if (s.bubble) this.say(s.bubble, Math.max(2400, s.dur * 1000 - 200));
            if (s.anim === 'fall') this.tone(160, 0.12);
        } else if (s.t === 'walk') {
            if (!s.began) { s.began = true; s.moved = 0; s.fallAt = (!this.S.calm && Math.random() < 0.04) ? 20 + Math.random() * 40 : -1; }
        } else if (s.t === 'pop') { s.ph = this.sc < 0.05 ? 1 : 0; s.k = 0; if (s.ph === 1) { p.el = s.el; p.u = s.u; p.air = false; this.resolvePos(); } }
    }
    run(s, dt) {
        const A = this.anim, c = A.ctx, p = this.pos, n = this.nav, h = this.h;
        switch (s.t) {
            case 'walk': {
                if (p.el !== s.el || !s.el.isConnected) return true;
                const r = s.el.getBoundingClientRect(); if (r.width <= 0) return true;
                const m = Math.min(0.45, (this.w * 0.5 + 2) / r.width);
                const tu = s.edge ? (s.edge === 'L' ? 0 : 1) : clamp(s.toX != null ? (s.toX - r.left) / r.width : s.u, m, 1 - m);
                const du = tu - p.u, dist = Math.abs(du) * r.width;
                if (dist < 1.2) { p.u = tu; if (s.edge) this.dir = s.edge === 'L' ? 1 : -1; return true; }
                const run = s.run != null ? s.run : dist > 170, mv = Math.min(dist, (run ? SPEED_RUN : SPEED_WALK) * dt);
                p.u += Math.sign(du) * mv / r.width; s.moved += mv; this.dir = du > 0 ? 1 : -1; c.dir = this.dir; c.pace = 1; A.play(run ? 'run' : 'walk');
                if (s.fallAt > 0 && s.moved > s.fallAt && dist > 40) { s.fallAt = -1; this.queue.unshift(s); this.step = { t: 'do', anim: 'fall', dur: 1.15 }; this.begin(this.step); }
                return false;
            }
            case 'jump': {
                if (s.p == null) {
                    s.p = 0; s.from = { el: p.el, u: p.u }; const a = n.resolve(s.from.el, s.from.u), b = n.resolve(s.to.el, s.to.u), d = Math.hypot(b.x - a.x, b.y - a.y);
                    s.dur = clamp(0.55 + d / 360, 0.6, 1.2); s.apex = clamp(d * 0.28, 0.5 * h, 1.2 * h); this.dir = b.x >= a.x ? 1 : -1; c.dir = this.dir; A.play('jump', { fade: 0.12 }); p.air = true; this.tone(520, 0.08);
                }
                s.p += dt / s.dur; const pr = Math.min(1, s.p), a = n.resolve(s.from.el, s.from.u), b = n.resolve(s.to.el, s.to.u), q = clamp((pr - 0.14) / 0.72, 0, 1);
                p.x = lerp(a.x, b.x, q); p.y = lerp(a.y, b.y, q) - 4 * s.apex * q * (1 - q); c.u = pr;
                if (pr >= 1) { p.el = s.to.el; p.u = s.to.u; p.air = false; this.tone(220, 0.06); return true; }
                return false;
            }
            case 'climb': {
                const eu = s.edge === 'L' ? 0 : 1;
                if (s.p == null) { s.p = 0; const a = n.resolve(s.from, eu), b = n.resolve(s.to, eu); s.dur = Math.max(0.6, Math.abs(a.y - b.y) / SPEED_CLIMB); this.dir = s.edge === 'L' ? 1 : -1; c.dir = this.dir; A.play('climb'); p.air = true; }
                s.p += dt / s.dur; const pr = Math.min(1, s.p), a = n.resolve(s.from, eu), b = n.resolve(s.to, eu);
                p.x = lerp(a.x, b.x, pr); p.y = lerp(a.y, b.y, pr);
                if (pr >= 1) { p.el = s.to; p.u = eu; p.air = false; return true; }
                return false;
            }
            case 'pop': {
                if (s.ph === 0) { s.k += dt / 0.16; this.sc = Math.max(0, 1 - s.k); if (s.k >= 1) { s.ph = 1; s.k = 0; p.el = s.el; p.u = s.u; p.air = false; this.resolvePos(); } return false; }
                s.k += dt / 0.22; const k = Math.min(1, s.k); this.sc = k * k * (3 - 2 * k) * (1 + 0.12 * Math.sin(k * Math.PI)); if (k >= 1) { this.sc = 1; return true; } return false;
            }
            case 'call': s.fn(); return true;
            case 'do': {
                s.age += dt;
                if (s.anim === 'point' && s.aimEl && s.aimEl.isConnected) {
                    const r = s.aimEl.getBoundingClientRect(), tx = r.left + r.width * 0.5, ty = r.top + Math.min(r.height * 0.45, 40), hx = p.x, hy = p.y - 0.62 * h;
                    c.aim = Math.atan2(-(ty - hy), tx - hx); this.dir = tx >= hx ? 1 : -1; c.dir = this.dir;
                }
                if (s.anim === 'fall') c.fu = s.age / s.dur;
                if (s.anim === 'sleep') c.look = 0;
                if (s.age >= s.dur) { if (s.onEnd) s.onEnd(); return true; }
                return false;
            }
        }
        return true;
    }

    // ---------- «мозг»: что делать дальше ----------
    poke() {
        this.idleT = 0; const s = this.step;
        if (s && s.t === 'do' && s.anim === 'sleep') { s.dur = 0; this.say('О, привет!', 1800); }
    }
    idle(sec, anim = 'idle') { this.go([{ t: 'do', anim, dur: sec }]); }
    think() {
        const S = this.S, n = this.nav, now = performance.now(), calm = S.calm;
        if (this.chatOpen) return this.go([{ t: 'do', anim: 'idle', dur: Infinity }]);
        if (!n.inBand(this.pos.el, this.h)) { if (now > this.recoverAt) { this.recoverAt = now + 400; this.recover(); } return; }
        if (now - this.scrollAt < 700) return this.idle(0.4);
        if (S.get('hints') && now > this.nextHint && this.hintsShown < 3) return this.hint();
        if (this.idleT > 55 && !calm) return this.sleep();
        const r = Math.random();
        if (calm) { if (r < 0.7) return this.idle(3 + Math.random() * 3); return this.idle(4, 'sit'); }
        if (r < 0.5) return this.wander();
        if (r < 0.72) return this.sit();
        if (r < 0.8) return this.go([{ t: 'do', anim: 'wave', dur: 1.6 }]);
        this.idle(1.5 + Math.random() * 2.5);
    }
    pickSpot(mode, filter) {
        const n = this.nav, cur = { el: this.pos.el, u: this.pos.u }, ok = [];
        for (const c of n.candidates(this.w, this.h, mode)) {
            if (c.score > 0.04) continue; if (c.el === this.pos.el && Math.abs(c.x - this.pos.x) < this.w * 1.4) continue; if (filter && !filter(c)) continue;
            const pl = n.plan(cur, c, this.h); if (pl) ok.push({ c, pl });
        }
        return ok.length ? ok[Math.floor(Math.random() * ok.length)] : null;
    }
    wander() { const p = this.pickSpot('stand'); if (!p) return this.idle(2 + Math.random() * 2); this.go([...p.pl, { t: 'do', anim: 'idle', dur: 1.5 + Math.random() * 3 }]); }
    sit() { const p = this.pickSpot('sit'); if (!p) return this.idle(2); this.go([...p.pl, { t: 'do', anim: 'sit', dur: 5 + Math.random() * 8 }]); }
    sleep() { const p = this.pickSpot('sit') || { pl: [] }; this.go([...p.pl, { t: 'do', anim: 'sleep', dur: Infinity }]); }
    hint() {
        const now = performance.now(); this.nextHint = now + 50000 + Math.random() * 30000;
        const vis = SECTIONS.filter(s => { const e = AppBridge.el(s.id); if (!e || s.id === this.lastHintId) return false; const r = e.getBoundingClientRect(); return r.height > 0 && r.top > this.nav.topLimit && r.bottom < this.nav.navTop; });
        if (!vis.length) return this.idle(2);
        const s = vis[Math.floor(Math.random() * vis.length)]; this.lastHintId = s.id; this.hintsShown++; this.pointAt(s.id, s.hint);
    }
    recover() {
        const n = this.nav, cs = n.candidates(this.w, this.h, 'stand'); if (!cs.length) return;
        const px = this.pos.x, py = this.pos.y; cs.sort((a, b) => (a.score * 400 + Math.hypot(a.x - px, a.y - py) * 0.3) - (b.score * 400 + Math.hypot(b.x - px, b.y - py) * 0.3));
        const c = this.chatOpen ? cs[0] : cs[0]; this.go([{ t: 'pop', el: c.el, u: this.chatOpen ? 0.56 : c.u }]);
    }
    // показать раздел: подойти и указать рукой; раздел НЕ открывается
    pointAt(id, text) {
        const target = AppBridge.el(id), n = this.nav; if (!target) return;
        const r = target.getBoundingClientRect(); n.refresh(performance.now(), true);
        if (r.height <= 0 || r.bottom < n.topLimit || r.top > n.navTop) { if (text) this.say(text, 4000); return; }
        const h = this.h, w = this.w, tx = r.left + r.width * 0.5, ty = r.top + Math.min(r.height * 0.45, 40), cur = { el: this.pos.el, u: this.pos.u };
        let steps = [], best = null, bs = 1e9;
        if (!this.S.calm) {
            for (const c of n.candidates(w, h, 'stand')) {
                if (c.el === target) continue;
                const dx = tx - c.x, dy = -(ty - (c.y - 0.62 * h)), d = Math.hypot(dx, dy); if (d > r.width * 1.6 + h * 2 || d < h * 0.7) continue;
                const sc = c.score * 3 + Math.abs(Math.sin(Math.atan2(dy, dx))) * 0.5 + d / 800; if (sc < bs) { bs = sc; best = c; }
            }
            if (best) { steps = (best.el === this.pos.el ? [{ t: 'walk', el: best.el, u: best.u }] : n.plan(cur, best, h)) || [{ t: 'pop', el: best.el, u: best.u }]; }
        }
        this.spotEl = target; target.classList.add('yy-spot');
        steps.push({ t: 'do', anim: 'point', aimEl: target, dur: 4.2, bubble: text, onEnd: () => { target.classList.remove('yy-spot'); } });
        this.go(steps);
    }
    celebrate() { this.go([{ t: 'do', anim: 'celebrate', dur: 2.4 }]); this.tone(660, 0.12); }
    onChatOpen(panel) {
        this.chatOpen = true; this.nav.panel = panel; this.layer.classList.add('chat'); this.hideBubble();
        this.go([{ t: 'pop', el: panel, u: 0.56 }, { t: 'do', anim: 'wave', dur: 1.4 }, { t: 'do', anim: 'idle', dur: Infinity }], true);
    }
    onChatClose() { this.chatOpen = false; this.nav.panel = null; this.layer.classList.remove('chat'); this.go([{ t: 'do', anim: 'idle', dur: 0.2 }], true); }

    // ---------- реплики, эффекты, звук ----------
    say(text, ms = 3500) {
        if (this.chatOpen) return; this.bubble.textContent = text; this.bubble.classList.add('on'); this.bubbleOn = true; this.bw = this.bh = 0;
        clearTimeout(this.bubbleTimer); this.bubbleTimer = setTimeout(() => this.hideBubble(), ms); this.tone(700, 0.05);
        if (this.S.get('sound') && this.S.get('voice')) { try { this.chat.voice.speak(text); } catch (e) { } }
    }
    hideBubble() { clearTimeout(this.bubbleTimer); this.bubbleOn = false; this.bubble.classList.remove('on'); }
    confetti() {
        const box = el('div', 'yy-conf'); const cols = ['#F6B45A', '#0F8F8B', '#FF5E8A', '#8A5CFF', '#fff'];
        for (let i = 0; i < 18; i++) { const i_ = el('i'); const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 50; i_.style.cssText = `--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(-Math.abs(Math.sin(a)) * d - 14).toFixed(0)}px;--c:${cols[i % 5]};--r:${(Math.random() * 540 - 270).toFixed(0)}deg;animation-delay:${(Math.random() * 0.15).toFixed(2)}s`; box.appendChild(i_); }
        this.layer.appendChild(box); this.confBox = box; setTimeout(() => box.remove(), 1900);
    }
    unlockAudio() { if (this.S.get('sound') && !this.ac) { try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } }
    tone(f, d = 0.08) {
        if (!this.S.get('sound') || !this.ac) return;
        try { const o = this.ac.createOscillator(), g = this.ac.createGain(), t = this.ac.currentTime; o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.03, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(this.ac.destination); o.start(t); o.stop(t + d); } catch (e) { }
    }

    // ---------- кадр ----------
    resolvePos() { const p = this.pos; if (p.el && !p.air && p.el.isConnected) { const q = this.nav.resolve(p.el, p.u); p.x = q.x; p.y = q.y; } }
    frame(t) {
        const quiet = !this.step || (this.step.t === 'do' && ['idle', 'sit', 'sleep'].includes(this.step.anim));
        if (quiet && t - this.lastDraw < 33) return;
        let dt = Math.min(0.05, (t - this.last) / 1000); this.last = t; this.lastDraw = t;
        this.nav.refresh(t); this.layout(); this.idleT += dt;
        if (!this.step) { this.nextStep(); if (!this.step) this.think(); }
        let guard = 0; while (this.step && guard++ < 4) { if (this.run(this.step, dt)) { this.nextStep(); dt = 0; } else break; }
        this.resolvePos(); this.anim.update(dt); this.place();
        this.renderer.render(this.scene, this.cam);
    }
    place() {
        const p = this.pos, B = this.B, h = this.h, root = this.model.root, a = this.anim, sit = this.step && this.step.t === 'do' && (this.step.anim === 'sit' || this.step.anim === 'sleep');
        const s = this.s * this.sc, vis = this.sc > 0.02 && p.x > -50;
        root.scale.x = root.scale.y = root.scale.z = Math.max(1e-4, s); root.rotation.y = a.yaw; root.position.x = B / 2; root.position.y = B * 0.28 + a.lift * s;
        this.canvas.style.transform = `translate3d(${(p.x - B / 2).toFixed(2)}px,${(p.y - 0.72 * B).toFixed(2)}px,0)`; this.canvas.style.visibility = vis ? 'visible' : 'hidden';
        const bh = (sit ? 0.62 : 1) * h, hw = this.w + 14;
        this.hit.style.cssText = `transform:translate3d(${(p.x - hw / 2).toFixed(1)}px,${(p.y - bh - 6).toFixed(1)}px,0);width:${hw}px;height:${(bh + 12).toFixed(0)}px;display:${vis && !this.pos.air ? 'block' : 'none'}`;
        if (this.bubbleOn) {
            const b = this.bubble; if (!this.bw) { this.bw = b.offsetWidth; this.bh = b.offsetHeight; }
            const n = this.nav, left = clamp(p.x - this.bw / 2, 8, n.vw - this.bw - 8), headTop = p.y - bh, tA = headTop - this.bh - 12, tB = p.y + 0.32 * h + 8;
            const okA = tA > n.topLimit + 4, okB = tB + this.bh < n.vh - 4;
            const oA = okA ? n.ovl(left, tA, left + this.bw, tA + this.bh) : 9, oB = okB ? n.ovl(left, tB, left + this.bw, tB + this.bh) : 9, above = oA <= oB + 0.02;
            b.style.transform = `translate3d(${left.toFixed(1)}px,${(above ? tA : tB).toFixed(1)}px,0)`; b.style.setProperty('--tx', clamp(p.x - left, 14, this.bw - 14).toFixed(0) + 'px'); b.classList.toggle('below', !above);
        }
        const sleeping = this.step && this.step.t === 'do' && this.step.anim === 'sleep';
        this.zzz.style.display = sleeping ? 'block' : 'none'; if (sleeping) this.zzz.style.transform = `translate3d(${(p.x + 8).toFixed(1)}px,${(p.y - 0.62 * h).toFixed(1)}px,0)`;
        if (this.confBox) this.confBox.style.transform = `translate3d(${p.x.toFixed(1)}px,${(p.y - h * 0.8).toFixed(1)}px,0)`;
    }
}
