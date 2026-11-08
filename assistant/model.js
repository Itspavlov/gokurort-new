// CharacterModel: процедурная модель по референс-листу (стилизованная, около 10 тыс. треугольников).
// Это НЕ портрет конкретного человека: только общий образ из ТЗ (русые волосы с чубом вверх, серо-зелёные глаза,
// чёрная футболка и шорты, белые кроссовки, рюкзак). Финальную GLB-модель подключают через CharacterModel.fromGLB()
// с теми же именами суставов (hips, spine, neck, head, shL, shR, elL, elR, hipL, hipR, knL, knR, ankL, ankR).
import { Group, Mesh, Material, SphereGeometry, CapsuleGeometry, CylinderGeometry, BoxGeometry } from './gl3d.js?v=1';

export const MODEL_HEIGHT = 1.03;       // высота модели в условных единицах (от подошвы до макушки)

const C = {
    skin: '#E4B793', skinShade: '#CF9B78', hair: '#6B4A33', hairTip: '#8A6446', hairSide: '#4A3526', brow: '#4A3526',
    tee: '#17181B', shorts: '#1D1F23', pocket: '#22252A', shoe: '#F7F7F5', sole: '#E2E2DE', stripe: '#16171A', sock: '#FAFAFA', lace: '#C9CED6',
    pack: '#202328', packEdge: '#32363D', buckle: '#8E949C', eyeWhite: '#FBFBF8', iris: '#7F96A6', pupil: '#101214', mouth: '#7A2E33',
    logo: '#8B4DFF', tat: '#9A735C', tatDark: '#3F3029', watch: '#15161A', watchFace: '#2E3238'
};
const mats = {};
const mat = (c, o) => { const k = c + JSON.stringify(o || {}); return mats[k] || (mats[k] = new Material(Object.assign({ color: c }, o || {}))); };

export class CharacterModel {
    constructor() {
        const root = this.root = new Group(); root.name = 'root';
        const J = this.joints = {};
        const mk = (name, parent, x = 0, y = 0, z = 0) => { const g = new Group(); g.name = name; g.position.x = x; g.position.y = y; g.position.z = z; parent.add(g); J[name] = g; return g; };
        const ell = (parent, color, rx, ry, rz, x = 0, y = 0, z = 0, o) => {
            const m = new Mesh(SphereGeometry(1, 14, 10), mat(color, o)); m.scale.x = rx; m.scale.y = ry; m.scale.z = rz;
            m.position.x = x; m.position.y = y; m.position.z = z; parent.add(m); return m;
        };
        const small = (parent, color, r, x, y, z, sx = 1, sy = 1, sz = 1, o) => {
            const m = new Mesh(SphereGeometry(r, 10, 7), mat(color, o)); m.scale.x = sx; m.scale.y = sy; m.scale.z = sz;
            m.position.x = x; m.position.y = y; m.position.z = z; parent.add(m); return m;
        };
        const cap = (parent, color, r, len, x, y, z) => { const m = new Mesh(CapsuleGeometry(r, len, 10, 4), mat(color)); m.position.x = x; m.position.y = y; m.position.z = z; parent.add(m); return m; };
        const box = (parent, color, w, h, d, x, y, z) => { const m = new Mesh(BoxGeometry(w, h, d), mat(color)); m.position.x = x; m.position.y = y; m.position.z = z; parent.add(m); return m; };

        // --- таз и шорты (карго) ---
        const hips = mk('hips', root, 0, 0.5, 0);
        ell(hips, C.shorts, 0.108, 0.075, 0.07, 0, -0.012, 0);
        // --- торс (чёрная футболка), атлетичные плечи ---
        const spine = mk('spine', hips, 0, 0.03, 0);
        ell(spine, C.tee, 0.115, 0.165, 0.066, 0, 0.13, 0);
        ell(spine, C.tee, 0.1, 0.07, 0.066, 0, 0.035, 0);
        // лого-«горы» на груди (фиолетовое)
        for (const k of [-1, 1]) { const l = box(spine, C.logo, 0.021, 0.0045, 0.006, -0.05 + k * 0.0065, 0.205, 0.053); l.rotation.z = -k * 0.95; }
        // лямки рюкзака спереди + пряжки
        for (const s of [-1, 1]) { box(spine, C.packEdge, 0.022, 0.16, 0.008, s * 0.062, 0.12, 0.058); box(spine, C.buckle, 0.026, 0.009, 0.01, s * 0.062, 0.17, 0.062); }
        // рюкзак
        const pack = new Group(); pack.position.z = -0.09; pack.position.y = 0.13; spine.add(pack);
        box(pack, C.pack, 0.16, 0.22, 0.075, 0, 0, 0);
        box(pack, C.packEdge, 0.13, 0.08, 0.08, 0, -0.045, 0.002);
        box(pack, C.packEdge, 0.16, 0.02, 0.077, 0, 0.075, 0);
        box(pack, C.buckle, 0.02, 0.012, 0.082, 0, -0.01, 0);
        // --- шея и голова ---
        const neck = mk('neck', spine, 0, 0.28, 0);
        const nk = new Mesh(CylinderGeometry(0.034, 0.038, 0.07, 10), mat(C.skin)); nk.position.y = 0.012; neck.add(nk);
        const head = mk('head', neck, 0, 0.04, 0);
        const hc = new Group(); hc.position.y = 0.085; hc.scale.x = hc.scale.y = hc.scale.z = 0.93; head.add(hc);                 // центр головы
        ell(hc, C.skin, 0.08, 0.088, 0.085, 0, 0, 0);
        ell(hc, C.skin, 0.066, 0.042, 0.062, 0, -0.034, 0.016);                         // скулы и челюсть
        ell(hc, C.skin, 0.04, 0.027, 0.045, 0, -0.063, 0.036);                         // подбородок
        small(hc, C.skin, 0.019, -0.079, -0.004, 0, 0.55, 1, 0.9); small(hc, C.skin, 0.019, 0.079, -0.004, 0, 0.55, 1, 0.9);
        small(hc, C.skinShade, 0.0125, 0, -0.012, 0.088, 0.9, 1, 0.8);              // нос
        this.lids = []; this.eyes = [];
        for (const s of [-1, 1]) {
            const eg = new Group(); eg.position.x = s * 0.033; eg.position.y = 0.012; eg.position.z = 0.072; hc.add(eg);
            small(eg, C.eyeWhite, 0.0155, 0, 0, 0, 1.1, 0.9, 0.7);
            const ir = small(eg, C.iris, 0.0125, 0, 0, 0.008, 1, 1, 0.55); small(eg, C.pupil, 0.006, 0, 0, 0.0128, 1, 1, 0.4);
            const lid = small(eg, C.skin, 0.0205, 0, 0.02, 0.003, 1.15, 0.0001, 1);
            this.lids.push(lid); this.eyes.push(ir);
            const brow = box(hc, C.brow, 0.032, 0.0085, 0.009, s * 0.034, 0.046, 0.079); brow.rotation.z = -s * 0.07; brow.rotation.y = s * 0.4;
        }
        this.mouth = small(hc, C.mouth, 0.014, 0, -0.05, 0.078, 1.5, 0.2, 0.35);
        // волосы: короткие тёмные виски, сверху торчащие «шипы»
        ell(hc, C.hair, 0.086, 0.07, 0.09, 0, 0.03, -0.01);
        ell(hc, C.hairSide, 0.082, 0.07, 0.07, 0, -0.005, -0.045);
        for (const s of [-1, 1]) small(hc, C.hairSide, 0.022, s * 0.067, 0.014, -0.012, 0.6, 1.7, 1.5);
        ell(hc, C.hair, 0.074, 0.04, 0.085, 0, 0.078, 0.0);
        const spike = (x, y, z, tx, tz, len, col) => { const m = new Mesh(CylinderGeometry(0.004, 0.017, len, 6), mat(col || C.hair)); m.position.x = x; m.position.y = y + len * 0.4; m.position.z = z; m.rotation.x = tx; m.rotation.z = tz; hc.add(m); };
        for (let i = 0; i < 9; i++) { const an = i / 9 * Math.PI * 2, rx = Math.sin(an), rz = Math.cos(an); spike(rx * 0.052, 0.09, rz * 0.05 - 0.005, rz * 0.5, -rx * 0.5, 0.05 + (i % 3) * 0.008, i % 2 ? C.hairTip : C.hair); }
        for (const [x, z] of [[-0.02, 0.01], [0.02, 0.0], [0, -0.025]]) spike(x, 0.098, z, 0.05, -x * 3, 0.06, C.hairTip);
        for (const x of [-0.04, 0, 0.04]) spike(x, 0.078, 0.062, 0.8, -x * 5, 0.045, C.hair);                                 // чуб вперёд-вверх
        this.head = head; this.neck = neck;
        // --- руки: правая персонажа (слева на экране) в татуировке-рукаве ---
        for (const s of [-1, 1]) {
            const tat = s < 0;
            const sh = mk(s < 0 ? 'shR' : 'shL', spine, s * 0.125, 0.235, 0);
            small(sh, C.tee, 0.05, 0, -0.004, 0, 1, 0.95, 1);                                  // рукав
            cap(sh, C.skin, 0.032, 0.07, 0, -0.085, 0);
            const el = mk(s < 0 ? 'elR' : 'elL', sh, 0, -0.145, 0);
            cap(el, C.skin, 0.028, 0.07, 0, -0.065, 0);
            small(el, C.skin, 0.03, 0, -0.142, 0, 1, 1.1, 0.9);                            // кисть
            if (tat) {
                cap(sh, C.tat, 0.0335, 0.05, 0, -0.095, 0); cap(el, C.tat, 0.0295, 0.06, 0, -0.07, 0);
                for (const [y, z, r] of [[-0.09, 0.03, 0.012], [-0.12, -0.02, 0.01], [-0.06, 0.02, 0.009]]) small(sh, C.tatDark, r, 0.006 * s, y, z, 1, 1.5, 0.5);
                for (const [y, z, r] of [[-0.05, 0.026, 0.011], [-0.09, -0.015, 0.009], [-0.115, 0.02, 0.008]]) small(el, C.tatDark, r, 0, y, z, 1, 1.6, 0.5);
            } else {                                                                      // умные часы на левом запястье
                const w = new Mesh(CylinderGeometry(0.0305, 0.0305, 0.02, 12), mat(C.watch)); w.position.y = -0.118; el.add(w);
                box(el, C.watchFace, 0.034, 0.024, 0.012, 0, -0.118, 0.03);
            }
        }
        // --- ноги: карго-шорты, белые носки, кроссовки ---
        for (const s of [-1, 1]) {
            const side = s < 0 ? 'R' : 'L';
            const hp = mk('hip' + side, hips, s * 0.054, -0.02, 0);
            cap(hp, C.skin, 0.047, 0.1, 0, -0.12, 0);
            cap(hp, C.shorts, 0.06, 0.07, 0, -0.07, 0);                                   // штанина шорт
            box(hp, C.pocket, 0.012, 0.05, 0.04, s * 0.058, -0.1, 0.0);                    // карман карго
            const kn = mk('kn' + side, hp, 0, -0.225, 0);
            small(kn, C.skin, 0.043, 0, 0, 0, 1, 1, 1);
            cap(kn, C.skin, 0.037, 0.1, 0, -0.105, 0);
            cap(kn, C.sock, 0.0385, 0.04, 0, -0.165, 0);                                  // носок
            const an = mk('ank' + side, kn, 0, -0.205, 0);
            ell(an, C.shoe, 0.044, 0.032, 0.083, 0, -0.012, 0.034);                         // кроссовок
            box(an, C.sole, 0.084, 0.014, 0.17, 0, -0.037, 0.034);
            for (const q of [-1, 1]) box(an, C.stripe, 0.004, 0.02, 0.06, q * 0.0425, -0.006, 0.04);   // тёмная вставка на боку
            box(an, C.lace, 0.03, 0.006, 0.04, 0, 0.012, 0.045);
        }
        // тень-пятно под ногами (в пикселях масштабируется контроллером)
        this.shadow = new Mesh(CylinderGeometry(1, 1, 0.01, 18), new Material({ color: '#000000', opacity: 0.28, unlit: true, depthWrite: false }));
        this.shadow.scale.x = 0.11; this.shadow.scale.z = 0.05; this.shadow.position.y = 0.004;
        this.shadow.renderOrder = 5;
        root.add(this.shadow);
        this.setBlink(0); this.setMouth(0.15);
    }
    // 0 — глаза открыты, 1 — закрыты
    setBlink(v) { for (const l of this.lids) { l.scale.y = Math.max(0.0001, v * 1.0); l.position.y = 0.0205 * (1 - v); } }
    setMouth(v) { this.mouth.scale.y = 0.12 + 0.75 * Math.max(0, Math.min(1, v)); }
    // Точка подключения готовой модели: GLB должна иметь те же имена суставов.
    static fromGLB() { throw new Error('GLB-модель пока не подключена: нужен Three.js + GLTFLoader (этап 1, финальная модель)'); }
}
