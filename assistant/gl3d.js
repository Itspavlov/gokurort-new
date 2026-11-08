// Лёгкий WebGL-слой для помощника: сцена из «суставов», простые геометрии, мягкое освещение.
// Имена классов и осей совпадают с Three.js (Group, Mesh, rotation XYZ, y вверх), поэтому
// финальную GLB-модель можно будет подключить через настоящий Three.js, не меняя логику помощника.
'use strict';

// ---------- матрицы (column-major, как в WebGL и Three.js) ----------
const M4 = {
    ident() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
    mul(a, b, out) {
        out = out || new Float32Array(16);
        for (let c = 0; c < 4; c++) {
            const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
            out[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
            out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
            out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
            out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
        }
        return out;
    },
    compose(p, r, s, te) {            // порядок вращений XYZ — как у Three.js
        const a = Math.cos(r.x), b = Math.sin(r.x), c = Math.cos(r.y), d = Math.sin(r.y), e = Math.cos(r.z), f = Math.sin(r.z);
        const ae = a * e, af = a * f, be = b * e, bf = b * f;
        te[0] = c * e * s.x; te[1] = (af + be * d) * s.x; te[2] = (bf - ae * d) * s.x; te[3] = 0;
        te[4] = -c * f * s.y; te[5] = (ae - bf * d) * s.y; te[6] = (be + af * d) * s.y; te[7] = 0;
        te[8] = d * s.z; te[9] = -b * c * s.z; te[10] = a * c * s.z; te[11] = 0;
        te[12] = p.x; te[13] = p.y; te[14] = p.z; te[15] = 1;
        return te;
    },
    // матрица нормалей = обратная транспонированная верхнего 3x3
    normalMat(m, out) {
        const a00 = m[0], a01 = m[1], a02 = m[2], a10 = m[4], a11 = m[5], a12 = m[6], a20 = m[8], a21 = m[9], a22 = m[10];
        const b01 = a22 * a11 - a12 * a21, b11 = -a22 * a10 + a12 * a20, b21 = a21 * a10 - a11 * a20;
        let det = a00 * b01 + a01 * b11 + a02 * b21; if (!det) det = 1; det = 1 / det;
        out[0] = b01 * det; out[1] = (-a22 * a01 + a02 * a21) * det; out[2] = (a12 * a01 - a02 * a11) * det;
        out[3] = b11 * det; out[4] = (a22 * a00 - a02 * a20) * det; out[5] = (-a12 * a00 + a02 * a10) * det;
        out[6] = b21 * det; out[7] = (-a21 * a00 + a01 * a20) * det; out[8] = (a11 * a00 - a01 * a10) * det;
        // транспонируем
        let t = out[1]; out[1] = out[3]; out[3] = t; t = out[2]; out[2] = out[6]; out[6] = t; t = out[5]; out[5] = out[7]; out[7] = t;
        return out;
    }
};

// ---------- сцена ----------
class Object3D {
    constructor() {
        this.position = { x: 0, y: 0, z: 0 };
        this.rotation = { x: 0, y: 0, z: 0 };
        this.scale = { x: 1, y: 1, z: 1 };
        this.children = []; this.parent = null; this.visible = true; this.name = '';
        this.matrix = M4.ident(); this.matrixWorld = M4.ident();
    }
    add(...o) { for (const c of o) { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = this; this.children.push(c); } return this; }
    updateMatrixWorld() {
        M4.compose(this.position, this.rotation, this.scale, this.matrix);
        if (this.parent) M4.mul(this.parent.matrixWorld, this.matrix, this.matrixWorld); else this.matrixWorld.set(this.matrix);
        for (const c of this.children) c.updateMatrixWorld();
    }
}
class Group extends Object3D {}
class Mesh extends Object3D {
    constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; this.renderOrder = 0; }
}
class Material {
    constructor(o = {}) {
        const c = o.color || '#ffffff';
        this.rgb = typeof c === 'string' ? hex(c) : c;
        this.opacity = o.opacity == null ? 1 : o.opacity;
        this.unlit = !!o.unlit; this.depthWrite = o.depthWrite !== false;
        this.shine = o.shine || 0;
    }
}
function hex(s) { const n = parseInt(s.replace('#', ''), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }

// ---------- геометрии ----------
class Geometry { constructor(pos, nor, idx) { this.pos = new Float32Array(pos); this.nor = new Float32Array(nor); this.idx = new Uint16Array(idx); this.gl = null; } }

// тело вращения по профилю [r, y] снизу вверх
function lathe(profile, seg) {
    const pos = [], nor = [], idx = [], n = profile.length;
    for (let i = 0; i < n; i++) {
        const p0 = profile[Math.max(0, i - 1)], p1 = profile[Math.min(n - 1, i + 1)];
        let dr = p1[0] - p0[0], dy = p1[1] - p0[1]; const l = Math.hypot(dr, dy) || 1;
        const nr = dy / l, ny = -dr / l;
        for (let j = 0; j <= seg; j++) {
            const a = j / seg * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
            pos.push(profile[i][0] * s, profile[i][1], profile[i][0] * c);
            nor.push(nr * s, ny, nr * c);
        }
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) {
        const a = i * (seg + 1) + j, b = a + seg + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    return new Geometry(pos, nor, idx);
}
function SphereGeometry(r, seg = 14, rings = 10) {
    const pr = []; for (let i = 0; i <= rings; i++) { const a = -Math.PI / 2 + i / rings * Math.PI; pr.push([Math.max(0, Math.cos(a)) * r, Math.sin(a) * r]); }
    pr[0][0] = 0; pr[rings][0] = 0; return lathe(pr, seg);
}
function CapsuleGeometry(r, len, seg = 12, caps = 5) {  // len — длина цилиндрической части
    const pr = [], h = len / 2;
    for (let i = 0; i <= caps; i++) { const a = -Math.PI / 2 + i / caps * (Math.PI / 2); pr.push([Math.max(0, Math.cos(a)) * r, -h + Math.sin(a) * r]); }
    for (let i = 0; i <= caps; i++) { const a = i / caps * (Math.PI / 2); pr.push([Math.cos(a) * r, h + Math.sin(a) * r]); }
    pr[0][0] = 0; pr[pr.length - 1][0] = 0; return lathe(pr, seg);
}
function CylinderGeometry(rt, rb, h, seg = 12) {
    return lathe([[0, -h / 2], [rb, -h / 2], [rb, -h / 2 + 0.0001], [rt, h / 2 - 0.0001], [rt, h / 2], [0, h / 2]], seg);
}
function BoxGeometry(w, h, d) {
    const x = w / 2, y = h / 2, z = d / 2, pos = [], nor = [], idx = [];
    const faces = [[[0, 0, 1], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]], [[0, 0, -1], [x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]],
        [[1, 0, 0], [x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]], [[-1, 0, 0], [-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]],
        [[0, 1, 0], [-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]], [[0, -1, 0], [-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]]];
    faces.forEach((f, i) => { for (let k = 1; k <= 4; k++) { pos.push(...f[k]); nor.push(...f[0]); } const o = i * 4; idx.push(o, o + 1, o + 2, o, o + 2, o + 3); });
    return new Geometry(pos, nor, idx);
}

// ---------- камера ----------
class OrthographicCamera {
    constructor(l, r, t, b, n, f) { this.set(l, r, t, b, n, f); }
    set(l, r, t, b, n, f) {
        this.l = l; this.r = r; this.t = t; this.b = b; this.n = n; this.f = f;
        const m = this.proj = new Float32Array(16);
        m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n);
        m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n); m[15] = 1;
    }
}

// ---------- рендерер ----------
const VS = 'attribute vec3 aPos;attribute vec3 aNor;uniform mat4 uVP;uniform mat4 uM;uniform mat3 uN;varying vec3 vN;' +
    'void main(){vN=normalize(uN*aNor);gl_Position=uVP*uM*vec4(aPos,1.0);}';
const FS = 'precision mediump float;uniform vec3 uColor;uniform float uAlpha;uniform float uUnlit;uniform float uShine;varying vec3 vN;' +
    'void main(){vec3 n=normalize(vN);' +
    'float key=smoothstep(0.05,0.62,dot(n,normalize(vec3(-0.5,0.7,0.62))));' +
    'float fill=smoothstep(-0.2,0.8,dot(n,normalize(vec3(0.7,0.2,0.5))))*0.18;' +
    'float hemi=0.5+0.5*n.y;' +
    'float rim=pow(1.0-max(n.z,0.0),3.0)*0.16;' +
    'vec3 lit=uColor*(0.46+0.2*hemi+0.5*key+fill)+vec3(rim)*vec3(1.0,0.86,0.7);' +
    'lit+=vec3(1.0)*uShine*pow(max(dot(n,normalize(vec3(-0.3,0.5,0.8))),0.0),24.0);' +
    'vec3 c=mix(lit,uColor,uUnlit);' +
    'gl_FragColor=vec4(c*uAlpha,uAlpha);}';

class WebGLRenderer {
    constructor(canvas) {
        const gl = this.gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'low-power' });
        if (!gl) throw new Error('webgl');
        this.canvas = canvas; this.ok = true;
        const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
        const pg = this.prog = gl.createProgram();
        gl.attachShader(pg, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pg);
        if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pg));
        gl.useProgram(pg);
        this.a = { pos: gl.getAttribLocation(pg, 'aPos'), nor: gl.getAttribLocation(pg, 'aNor') };
        this.u = {}; for (const k of ['uVP', 'uM', 'uN', 'uColor', 'uAlpha', 'uUnlit', 'uShine']) this.u[k] = gl.getUniformLocation(pg, k);
        gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        this.nm = new Float32Array(9); this.pixelRatio = 1; this.triangles = 0;
    }
    setSize(w, h, pr) {
        this.pixelRatio = pr; this.canvas.width = Math.max(1, Math.round(w * pr)); this.canvas.height = Math.max(1, Math.round(h * pr));
        this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
    _buf(g) {
        const gl = this.gl;
        g.gl = { p: gl.createBuffer(), n: gl.createBuffer(), i: gl.createBuffer(), count: g.idx.length };
        gl.bindBuffer(gl.ARRAY_BUFFER, g.gl.p); gl.bufferData(gl.ARRAY_BUFFER, g.pos, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, g.gl.n); gl.bufferData(gl.ARRAY_BUFFER, g.nor, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.gl.i); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.idx, gl.STATIC_DRAW);
    }
    render(scene, camera) {
        const gl = this.gl; if (gl.isContextLost()) return;
        scene.updateMatrixWorld();
        const list = [];
        (function walk(o) { if (!o.visible) return; if (o.geometry) list.push(o); for (const c of o.children) walk(c); })(scene);
        list.sort((a, b) => (a.material.opacity < 1) - (b.material.opacity < 1) || a.renderOrder - b.renderOrder);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.uniformMatrix4fv(this.u.uVP, false, camera.proj);
        let tri = 0;
        for (const m of list) {
            const g = m.geometry; if (!g.gl) this._buf(g);
            gl.bindBuffer(gl.ARRAY_BUFFER, g.gl.p); gl.enableVertexAttribArray(this.a.pos); gl.vertexAttribPointer(this.a.pos, 3, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, g.gl.n); gl.enableVertexAttribArray(this.a.nor); gl.vertexAttribPointer(this.a.nor, 3, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.gl.i);
            gl.uniformMatrix4fv(this.u.uM, false, m.matrixWorld);
            gl.uniformMatrix3fv(this.u.uN, false, M4.normalMat(m.matrixWorld, this.nm));
            const mt = m.material;
            gl.uniform3f(this.u.uColor, mt.rgb[0], mt.rgb[1], mt.rgb[2]); gl.uniform1f(this.u.uAlpha, mt.opacity);
            gl.uniform1f(this.u.uUnlit, mt.unlit ? 1 : 0); gl.uniform1f(this.u.uShine, mt.shine);
            gl.depthMask(mt.depthWrite);
            gl.drawElements(gl.TRIANGLES, g.gl.count, gl.UNSIGNED_SHORT, 0);
            tri += g.gl.count / 3;
        }
        this.triangles = tri;
    }
    dispose() { try { this.gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch (e) { } this.ok = false; }
}

export { Object3D, Group, Mesh, Material, SphereGeometry, CapsuleGeometry, CylinderGeometry, BoxGeometry, OrthographicCamera, WebGLRenderer, hex };
