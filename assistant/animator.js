// CharacterAnimator: 12 анимационных состояний, плавные переходы (перекрёстное смешивание поз).
// Позы считаются кодом по именам суставов, поэтому та же логика подойдёт и для GLB-скелета.
// Соглашения: персонаж смотрит в +z; поворот сустава по x вперёд = отрицательный, колено сгибается положительным x.
const JOINTS = ['hips', 'spine', 'neck', 'head', 'shL', 'shR', 'elL', 'elR', 'hipL', 'hipR', 'knL', 'knR', 'ankL', 'ankR'];
export const STATES = ['idle', 'walk', 'run', 'jump', 'climb', 'sit', 'point', 'wave', 'talk', 'sleep', 'fall', 'celebrate'];
const sin = Math.sin, cos = Math.cos, PI = Math.PI, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t, ease = t => t * t * (3 - 2 * t);

function blank() { const p = { y: 0.5, yaw: 0, lift: 0, mouth: 0.12, eyes: 0 }; for (const j of JOINTS) p[j] = [0, 0, 0]; return p; }
function set(p, j, x, y, z) { const a = p[j]; a[0] = x; a[1] = y; a[2] = z; }
// базовая стойка: руки чуть в стороны
function base(p) { set(p, 'shL', 0, 0, 0.1); set(p, 'shR', 0, 0, -0.1); set(p, 'elL', -0.18, 0, 0); set(p, 'elR', -0.18, 0, 0); set(p, 'knL', 0.04, 0, 0); set(p, 'knR', 0.04, 0, 0); return p; }
// указать направлением a (рад, 0 — вправо, π/2 — вверх) в плоскости экрана
const aimZ = a => Math.atan2(cos(a), -sin(a));

const POSES = {
    idle(p, t, c) {
        base(p); const b = sin(t * 2.1);
        p.y = 0.5 + b * 0.0035; set(p, 'spine', b * 0.012, sin(t * 0.7) * 0.05, sin(t * 0.9) * 0.015);
        set(p, 'head', sin(t * 0.8) * 0.02, c.look * 0.5, 0); p.hips[2] = sin(t * 0.9) * 0.02;
        p.shL[0] = sin(t * 1.3) * 0.04; p.shR[0] = -sin(t * 1.3) * 0.04; p.yaw = 0.35 * c.dir;
    },
    walk(p, t, c) {
        base(p); const f = t * (7.5 * c.pace), s = sin(f), k = c.pace;
        p.y = 0.5 - 0.012 + Math.abs(cos(f)) * 0.02 * k;
        set(p, 'hipL', -0.52 * s * k, 0, 0); set(p, 'hipR', 0.52 * s * k, 0, 0);
        p.knL[0] = 0.12 + 0.62 * Math.max(0, cos(f)) * k; p.knR[0] = 0.12 + 0.62 * Math.max(0, -cos(f)) * k;
        p.ankL[0] = -0.12 * Math.max(0, cos(f)); p.ankR[0] = -0.12 * Math.max(0, -cos(f));
        p.shL[0] = 0.5 * s * k; p.shR[0] = -0.5 * s * k; p.elL[0] = -0.3 - 0.2 * Math.max(0, -s); p.elR[0] = -0.3 - 0.2 * Math.max(0, s);
        set(p, 'spine', -0.06 * k, 0.14 * s * k, 0); set(p, 'head', 0.03, -0.1 * s * k, 0); p.yaw = 1.05 * c.dir;
    },
    run(p, t, c) {
        base(p); const f = t * 12.5, s = sin(f);
        p.y = 0.5 - 0.035 + Math.abs(cos(f)) * 0.045; p.lift = 0.012 * Math.abs(cos(f));
        set(p, 'hipL', -0.95 * s, 0, 0); set(p, 'hipR', 0.95 * s, 0, 0);
        p.knL[0] = 0.3 + 1.15 * Math.max(0, cos(f)); p.knR[0] = 0.3 + 1.15 * Math.max(0, -cos(f));
        p.shL[0] = 0.95 * s; p.shR[0] = -0.95 * s; p.elL[0] = -1.35; p.elR[0] = -1.35;
        set(p, 'spine', -0.26, 0.2 * s, 0); set(p, 'head', 0.2, -0.12 * s, 0); p.yaw = 1.1 * c.dir; p.mouth = 0.3;
    },
    jump(p, t, c) {                         // c.u — прогресс прыжка 0..1 (задаёт навигатор)
        base(p); const u = clamp(c.u, 0, 1);
        const crouch = u < 0.18 ? ease(u / 0.18) : u > 0.82 ? ease((u - 0.82) / 0.18) : 0;
        const air = u > 0.18 && u < 0.82 ? sin((u - 0.18) / 0.64 * PI) : 0;
        p.y = 0.5 - 0.1 * crouch;
        for (const s of ['L', 'R']) {
            p['hip' + s][0] = -0.7 * crouch - 0.9 * air * 0.6; p['kn' + s][0] = 1.2 * crouch + 0.9 * air; p['ank' + s][0] = 0.3 * crouch - 0.3 * air;
        }
        const armsBack = crouch, armsUp = air;
        p.shL[0] = 0.8 * armsBack - 2.2 * armsUp; p.shR[0] = 0.8 * armsBack - 2.2 * armsUp; p.shL[2] = 0.1 + 0.5 * armsUp; p.shR[2] = -0.1 - 0.5 * armsUp;
        p.elL[0] = -0.4; p.elR[0] = -0.4; set(p, 'spine', 0.25 * crouch - 0.08 * air, 0, 0); p.head[0] = -0.1 * air; p.yaw = 1.0 * c.dir; p.mouth = 0.5 * air;
    },
    climb(p, t, c) {                        // лезет вверх по краю плитки, лицом к краю
        base(p); const f = t * 6.5, s = sin(f);
        p.y = 0.5 - 0.02 + 0.012 * cos(f * 2);
        set(p, 'hipL', -0.9 * Math.max(0, s) - 0.1, 0, 0); set(p, 'hipR', -0.9 * Math.max(0, -s) - 0.1, 0, 0);
        p.knL[0] = 0.9 * Math.max(0, s) + 0.2; p.knR[0] = 0.9 * Math.max(0, -s) + 0.2;
        p.shL[0] = -2.45 + 0.5 * s; p.shR[0] = -2.45 - 0.5 * s; p.shL[2] = 0.2; p.shR[2] = -0.2; p.elL[0] = -0.4; p.elR[0] = -0.4;
        set(p, 'spine', -0.1, -0.2 * s, 0); set(p, 'head', -0.35, 0, 0); p.yaw = 1.5 * c.dir; p.mouth = 0.2;
    },
    sit(p, t, c) {                          // сидит на краю, ноги свешены
        base(p); const sw = sin(t * 2.2);
        p.y = 0.5 - 0.455;
        set(p, 'hipL', -1.5 + 0.14 * sw, 0, 0.05); set(p, 'hipR', -1.5 - 0.14 * sw, 0, -0.05);
        p.knL[0] = 0.2 + 0.28 * Math.max(0, -sw); p.knR[0] = 0.2 + 0.28 * Math.max(0, sw);
        p.shL[0] = -0.45; p.shR[0] = -0.45; p.shL[2] = 0.2; p.shR[2] = -0.2; p.elL[0] = -0.2; p.elR[0] = -0.2;
        set(p, 'spine', 0.04 * sin(t * 1.2), 0, 0); set(p, 'head', 0.05, c.look * 0.5 + sin(t * 0.6) * 0.1, 0); p.yaw = 0.3 * c.dir;
    },
    point(p, t, c) {                        // указывает рукой на цель (угол c.aim), лицом к зрителю
        base(p); const a = c.aim, left = cos(a) > 0, arm = left ? 'L' : 'R', other = left ? 'R' : 'L';
        const k = ease(clamp(c.pt, 0, 1));
        const z = aimZ(a) * (left ? 1 : 1);
        p['sh' + arm] = [0, 0, lerp(left ? 0.1 : -0.1, z, k)]; p['el' + arm] = [lerp(-0.18, 0, k), 0, 0];
        p['sh' + other][2] = other === 'L' ? 0.14 : -0.14; p['el' + other][0] = -0.5;
        set(p, 'spine', 0.01 * sin(t * 2), (left ? -1 : 1) * -0.12 * k, 0); set(p, 'head', 0, (left ? 1 : -1) * 0.35 * k + c.look * 0.2, 0);
        p.y = 0.5 + 0.004 * sin(t * 2.2); p.yaw = 0.1 * (left ? 1 : -1); p.mouth = 0.25;
    },
    wave(p, t, c) {
        base(p); const k = ease(clamp(c.pt, 0, 1)), w = sin(t * 9.5);
        p.shR = [0, 0, lerp(-0.1, -2.55, k)]; p.elR = [0, 0, -0.5 * w * k - 0.2 * k];
        p.shL[0] = sin(t * 1.5) * 0.05; set(p, 'spine', 0, -0.1, 0); set(p, 'head', -0.05 * k, 0.25 * k + c.look * 0.2, 0.08 * w * k);
        p.y = 0.5 + 0.006 * Math.abs(sin(t * 4.7)); p.yaw = 0.2; p.mouth = 0.55;
    },
    talk(p, t, c) {
        base(p); const g1 = sin(t * 3.1), g2 = sin(t * 2.3 + 1);
        p.shL = [-0.5 + 0.35 * g1, 0, 0.25]; p.shR = [-0.5 + 0.35 * g2, 0, -0.25]; p.elL[0] = -1.1 + 0.35 * g2; p.elR[0] = -1.1 + 0.35 * g1;
        set(p, 'head', 0.04 * sin(t * 4.2) - 0.02, c.look * 0.4 + 0.12 * sin(t * 1.7), 0.04 * sin(t * 1.3));
        set(p, 'spine', 0.02, 0.1 * sin(t * 1.4), 0); p.y = 0.5 + 0.004 * sin(t * 6); p.yaw = 0.15;
        p.mouth = 0.15 + 0.7 * Math.abs(sin(t * 12.5) * sin(t * 4.1 + 0.5));
    },
    sleep(p, t, c) {
        POSES.sit(p, t * 0.15, c); const b = sin(t * 1.3);
        p.shL[0] = -0.3; p.shR[0] = -0.3; p.elL[0] = -0.8; p.elR[0] = -0.8; set(p, 'spine', 0.28 + b * 0.015, 0, 0.03); set(p, 'head', 0.7 + b * 0.02, 0.1, 0.12);
        p.y = 0.5 - 0.44; p.eyes = 1; p.mouth = 0.05; p.yaw = 0.2;
    },
    fall(p, t, c) {                         // споткнулся: размахивает руками и выпрямляется, c.fu 0..1
        base(p); const u = clamp(c.fu, 0, 1), w = sin(u * 26);
        const lean = sin(clamp(u * 1.5, 0, 1) * PI) * 0.7 * (u < 0.7 ? 1 : (1 - u) / 0.3);
        set(p, 'spine', -0.35 * lean * 1.2, 0, 0.1 * lean); p.hips[0] = -0.15 * lean;
        p.shL = [-2.2 * Math.abs(w) * lean - 0.2, 0, 0.9 * lean]; p.shR = [-2.2 * Math.abs(cos(u * 26)) * lean - 0.2, 0, -0.9 * lean];
        p.elL[0] = -0.6; p.elR[0] = -0.6; p.hipL[0] = -0.7 * lean; p.hipR[0] = 0.2 * lean; p.knL[0] = 0.8 * lean; p.knR[0] = 0.1;
        p.head[0] = 0.3 * lean; p.y = 0.5 - 0.02 * lean; p.yaw = 1.0 * c.dir; p.mouth = 0.8 * lean;
    },
    celebrate(p, t, c) {
        base(p); const j = Math.abs(sin(t * 6.2)), s = sin(t * 6.2);
        p.y = 0.5 - 0.05 + j * 0.1; p.lift = j * 0.03;
        p.shL = [-0.3, 0, 2.55 + 0.2 * s]; p.shR = [-0.3, 0, -2.55 - 0.2 * s]; p.elL[0] = -0.3; p.elR[0] = -0.3;
        for (const q of ['L', 'R']) { p['hip' + q][0] = -0.35 * (1 - j); p['kn' + q][0] = 0.5 * (1 - j) + 0.3; }
        set(p, 'head', -0.2, 0.2 * s, 0.1 * s); set(p, 'spine', -0.1, 0.15 * s, 0); p.yaw = 0.15 * s; p.mouth = 0.85;
    }
};

export class CharacterAnimator {
    constructor(model) {
        this.m = model; this.t = 0; this.ctx = { dir: 1, look: 0, pace: 1, u: 0, fu: 0, aim: 0, pt: 0 };
        this.cur = 'idle'; this.prev = null; this.w = 1; this.fade = 0.25; this.speedScale = 1;
        this.out = blank(); this.A = blank(); this.B = blank(); this.tPrev = 0; this.tCur = 0;
        this.blinkT = 2.5; this.blinkV = 0; this.eyeClosed = 0; this.timeInState = 0;
    }
    play(name, o = {}) {
        if (!POSES[name]) return;
        if (name === this.cur && !o.restart) return;
        this.prev = this.cur; this.tPrev = this.tCur; this.cur = name; this.tCur = 0; this.timeInState = 0; this.w = 0; this.fade = o.fade == null ? 0.25 : o.fade;
        if (name === 'point' || name === 'wave') this.ctx.pt = 0;
        if (name === 'fall') this.ctx.fu = 0;
    }
    update(dt) {
        dt = Math.min(dt, 0.05); const c = this.ctx;
        this.t += dt; this.tCur += dt * this.speedScale; this.tPrev += dt * this.speedScale; this.timeInState += dt;
        if (this.cur === 'point' || this.cur === 'wave') c.pt = Math.min(1, c.pt + dt * 4.5);
        if (this.w < 1) this.w = Math.min(1, this.w + dt / Math.max(0.01, this.fade));
        const B = this.reset(this.B); POSES[this.cur](B, this.tCur, c); let P = B;
        if (this.w < 1 && this.prev) {
            const A = this.reset(this.A); POSES[this.prev](A, this.tPrev, c); const k = ease(this.w), o = this.out;
            for (const key of ['y', 'yaw', 'lift', 'mouth', 'eyes']) o[key] = lerp(A[key], B[key], k);
            for (const j of JOINTS) for (let i = 0; i < 3; i++) o[j][i] = lerp(A[j][i], B[j][i], k);
            P = o;
        }
        this.apply(P, dt);
    }
    reset(p) { p.y = 0.5; p.yaw = 0; p.lift = 0; p.mouth = 0.12; p.eyes = 0; for (const j of JOINTS) { p[j][0] = p[j][1] = p[j][2] = 0; } return p; }
    apply(P, dt) {
        const J = this.m.joints;
        J.hips.position.y = P.y; J.hips.rotation.x = P.hips[0]; J.hips.rotation.y = P.hips[1]; J.hips.rotation.z = P.hips[2];
        for (const j of JOINTS) if (j !== 'hips') { J[j].rotation.x = P[j][0]; J[j].rotation.y = P[j][1]; J[j].rotation.z = P[j][2]; }
        this.yaw = P.yaw; this.lift = P.lift;
        // моргание
        this.blinkT -= dt; if (this.blinkT <= 0) { this.blinkV = 0.16; this.blinkT = 2.2 + Math.random() * 3.2; }
        let b = 0; if (this.blinkV > 0) { this.blinkV -= dt; b = Math.sin(Math.max(0, this.blinkV) / 0.16 * PI); }
        this.m.setBlink(Math.max(b, P.eyes)); this.m.setMouth(P.mouth);
    }
}
