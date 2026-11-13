// ============================================
// YuGi YuGi — карты
//  • основная: Яндекс.Карты (JS API 2.1): улицы, дома, кафе, рестораны и всё, что есть на обычной карте, подпись «Яндекс»;
//  • запасная: OpenStreetMap через Leaflet — если Яндекс не загрузился (нет связи, ключ не разрешён для сайта).
// Обе карты выдают одинаковое управление, поэтому экраны не зависят от того, какая из них включилась.
// Координаты везде [широта, долгота].
//
//   YM.open(el, { center, zoom, interactive, zoomControl }) → Promise<карта | null>
//   карта: setView(c, z, animate) · fitBounds(points, { padding, maxZoom, animate }) · getZoom()
//          addMarker({ coords, html, size, anchor, draggable, onClick, onDrag, group }) → { setCoords(c), remove() }
//          clearMarkers(group) · addLine(points, { color, width }) · onClick(fn) · setInteractive(on) · showZoom()
//          project(c) → { x, y } в пикселях блока · invalidate() · destroy() · engine: 'yandex' | 'osm'
// ============================================
// Ключ «JavaScript API». В кабинете Яндекса его нужно ограничить по HTTP-referer (yugiyugi.ru).
const YM_KEY = '7aafdf73-bf1e-4ec7-8d18-07b14be93c80';

const YM = (() => {
    let loading = null;

    function load() {
        if (window.ymaps && window.ymaps.Map) return Promise.resolve(window.ymaps);
        if (loading) return loading;
        loading = new Promise((res, rej) => {
            const fail = (e) => { loading = null; rej(e); };
            const timer = setTimeout(() => fail(new Error('ymaps timeout')), 9000);
            const sc = document.createElement('script');
            sc.src = 'https://api-maps.yandex.ru/2.1/?apikey=' + YM_KEY + '&lang=ru_RU';
            sc.onload = () => {
                if (!window.ymaps) { clearTimeout(timer); fail(new Error('no ymaps')); return; }
                window.ymaps.ready(() => { clearTimeout(timer); res(window.ymaps); });
            };
            sc.onerror = () => { clearTimeout(timer); fail(new Error('ymaps load')); };
            document.head.appendChild(sc);
        });
        return loading;
    }

    // ---------- Яндекс ----------
    function yandex(ym, el, o) {
        const map = new ym.Map(el, { center: o.center, zoom: o.zoom, controls: [] },
            { suppressMapOpenBlock: true, yandexMapDisablePoiInteractivity: true, minZoom: 3 });
        const groups = {};
        const byId = {};
        let seq = 0, lastPin = 0, zoomCtl = null;
        const sizeOf = () => { const s = map.container.getSize(); return s; };

        const h = {
            engine: 'yandex',
            setView(c, z, animate) { map.setCenter(c, z == null ? map.getZoom() : z, { duration: animate === false ? 0 : 300 }); },
            fitBounds(pts, f) {
                f = f || {};
                if (!pts || !pts.length) return;
                const dur = f.animate === false ? 0 : 300;
                if (pts.length === 1) { h.setView(pts[0], f.maxZoom || 16, f.animate); return; }
                let a = 90, b = 180, c = -90, d = -180;
                pts.forEach(p => { a = Math.min(a, p[0]); c = Math.max(c, p[0]); b = Math.min(b, p[1]); d = Math.max(d, p[1]); });
                map.setBounds([[a, b], [c, d]], { checkZoomRange: true, zoomMargin: f.padding == null ? 40 : f.padding, duration: dur })
                    .then(() => { if (f.maxZoom && map.getZoom() > f.maxZoom) map.setZoom(f.maxZoom, { duration: dur }); }, () => {});
            },
            getZoom() { return map.getZoom(); },
            addMarker(m) {
                const [w, hgt] = m.size || [40, 40], [ax, ay] = m.anchor || [w / 2, hgt / 2];
                const id = 'ymk' + (++seq);
                const layout = ym.templateLayoutFactory.createClass(`<div class="ym-mk" data-ymk="${id}" style="width:${w}px;height:${hgt}px">${m.html}</div>`);
                const pm = new ym.Placemark(m.coords, {}, {
                    iconLayout: layout, iconOffset: [-ax, -ay],
                    iconShape: { type: 'Rectangle', coordinates: [[-ax, -ay], [w - ax, hgt - ay]] },
                    draggable: !!m.draggable, hasBalloon: false, hasHint: false, zIndex: m.zIndex || 1000
                });
                if (m.onDrag) pm.events.add('dragend', () => m.onDrag(pm.geometry.getCoordinates()));
                map.geoObjects.add(pm);
                const rec = { pm, onClick: m.onClick, size: [w, hgt], anchor: [ax, ay], coords: m.coords };
                byId[id] = rec;
                (groups[m.group || ''] = groups[m.group || ''] || []).push({ id, pm });
                return {
                    setCoords(c) { rec.coords = c; pm.geometry.setCoordinates(c); },
                    remove() { map.geoObjects.remove(pm); delete byId[id]; }
                };
            },
            clearMarkers(g) {
                (groups[g || ''] || []).forEach(x => { map.geoObjects.remove(x.pm); delete byId[x.id]; });
                groups[g || ''] = [];
            },
            addLine(pts, f) {
                f = f || {};
                const line = new ym.Polyline(pts, {}, { strokeColor: f.color || '#2DD4DA', strokeWidth: f.width || 3, strokeStyle: f.dash === false ? 'solid' : 'shortdash', strokeOpacity: .95 });
                map.geoObjects.add(line);
                return { remove() { map.geoObjects.remove(line); } };
            },
            onClick(fn) {
                map.events.add('click', (e) => { if (Date.now() - lastPin < 400) return; fn(e.get('coords')); });
            },
            setInteractive(on) {
                try { map.behaviors[on ? 'enable' : 'disable'](['drag', 'scrollZoom', 'dblClickZoom', 'multiTouch']); } catch (_) {}
            },
            showZoom() {
                if (zoomCtl) return;
                zoomCtl = new ym.control.ZoomControl({ options: { size: 'small', position: { right: 10, bottom: o.zoomBottom || 40 } } });
                map.controls.add(zoomCtl);
            },
            project(c) {
                const g = map.options.get('projection').toGlobalPixels(c, map.getZoom()), gc = map.getGlobalPixelCenter(), s = sizeOf();
                return { x: g[0] - gc[0] + s[0] / 2, y: g[1] - gc[1] + s[1] / 2 };
            },
            invalidate() { try { map.container.fitToViewport(); } catch (_) {} },
            destroy() { try { map.destroy(); } catch (_) {} }
        };
        // Тап по метке. «Область нажатия» HTML-меток в Яндексе зависит от версии и телефона, а слой событий лежит над метками,
        // поэтому попадание считаем сами: по тапу на карте переводим точку в пиксели и смотрим, какой метки она касается.
        const tapPin = (rec) => { if (Date.now() - lastPin < 350) return; lastPin = Date.now(); rec.onClick(); };
        const hitPin = (coords) => {
            const p = h.project(coords), pad = 8;
            let best = null, bd = 1e9;
            Object.keys(byId).forEach((k) => {
                const r = byId[k]; if (!r.onClick) return;
                const c = h.project(r.coords);
                const l = c.x - r.anchor[0], t = c.y - r.anchor[1];
                if (p.x < l - pad || p.x > l + r.size[0] + pad || p.y < t - pad || p.y > t + r.size[1] + pad) return;
                const d = Math.hypot(p.x - (l + r.size[0] / 2), p.y - (t + r.size[1] / 2));
                if (d < bd) { bd = d; best = r; }
            });
            return best;
        };
        map.events.add('click', (e) => {
            const r = hitPin(e.get('coords'));
            if (r) tapPin(r);
        });
        // на случай, если тап дошёл до самой метки (мышь на компьютере)
        el.addEventListener('click', (ev) => {
            const t = ev.target.closest && ev.target.closest('[data-ymk]');
            if (!t) return;
            const rec = byId[t.dataset.ymk];
            if (rec && rec.onClick) tapPin(rec);
        }, true);
        if (o.zoomControl) h.showZoom();
        if (o.interactive === false) h.setInteractive(false);
        return h;
    }

    // ---------- запасная: OpenStreetMap ----------
    function osm(el, o) {
        if (typeof L === 'undefined') {
            el.innerHTML = '<div class="map-fallback"><i class="fas fa-map"></i>Карта загрузится при подключении к интернету</div>';
            return null;
        }
        const map = L.map(el, { zoomControl: false, tap: false, fadeAnimation: false }).setView(o.center, o.zoom);
        if (map.attributionControl) map.attributionControl.setPrefix(false);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
        const groups = {};
        let zoomCtl = null, lastPin = 0;
        const h = {
            engine: 'osm',
            setView(c, z, animate) { map.setView(c, z == null ? map.getZoom() : z, { animate: animate !== false }); },
            fitBounds(pts, f) {
                f = f || {};
                if (!pts || !pts.length) return;
                if (pts.length === 1) { h.setView(pts[0], f.maxZoom || 16, f.animate); return; }
                const p = f.padding == null ? 40 : f.padding;
                map.fitBounds(pts, { padding: [p, p], maxZoom: f.maxZoom || 18, animate: f.animate !== false });
            },
            getZoom() { return map.getZoom(); },
            addMarker(m) {
                const [w, hgt] = m.size || [40, 40], [ax, ay] = m.anchor || [w / 2, hgt / 2];
                const mk = L.marker(m.coords, { icon: L.divIcon({ className: 'map-pin-wrap', html: m.html, iconSize: [w, hgt], iconAnchor: [ax, ay] }), draggable: !!m.draggable });
                if (m.onClick) mk.on('click', () => { lastPin = Date.now(); m.onClick(); });
                if (m.onDrag) mk.on('dragend', () => { const p = mk.getLatLng(); m.onDrag([p.lat, p.lng]); });
                mk.addTo(map);
                (groups[m.group || ''] = groups[m.group || ''] || []).push(mk);
                return { setCoords(c) { mk.setLatLng(c); }, remove() { map.removeLayer(mk); } };
            },
            clearMarkers(g) { (groups[g || ''] || []).forEach(x => map.removeLayer(x)); groups[g || ''] = []; },
            addLine(pts, f) {
                f = f || {};
                const l = L.polyline(pts, { color: f.color || '#2DD4DA', weight: f.width || 3, dashArray: f.dash === false ? null : '2 8', lineCap: 'round', lineJoin: 'round' }).addTo(map);
                return { remove() { map.removeLayer(l); } };
            },
            onClick(fn) { map.on('click', (ev) => { if (Date.now() - lastPin < 400) return; fn([ev.latlng.lat, ev.latlng.lng]); }); },
            setInteractive(on) {
                ['dragging', 'touchZoom', 'scrollWheelZoom', 'doubleClickZoom', 'boxZoom', 'keyboard'].forEach(k => { if (map[k] && map[k][on ? 'enable' : 'disable']) map[k][on ? 'enable' : 'disable'](); });
            },
            showZoom() { if (!zoomCtl) { zoomCtl = L.control.zoom({ position: 'bottomright' }).addTo(map); } },
            project(c) { const p = map.latLngToContainerPoint(c); return { x: p.x, y: p.y }; },
            invalidate() { map.invalidateSize({ animate: false }); },
            destroy() { try { map.remove(); } catch (_) {} }
        };
        if (o.zoomControl) h.showZoom();
        if (o.interactive === false) h.setInteractive(false);
        setTimeout(() => h.invalidate(), 250);
        return h;
    }

    // Щипок по карте должен менять масштаб карты, а не всей страницы: иначе на телефоне страница «уезжает»,
    // кнопка закрытия остаётся за краем экрана, и выйти можно только сильно отдалив.
    function guard(el, h, o) {
        const stop = (ev) => { ev.preventDefault(); };
        const move = (ev) => { if (h.interactive && ev.touches && ev.touches.length > 1) ev.preventDefault(); };
        ['gesturestart', 'gesturechange', 'gestureend'].forEach((n) => el.addEventListener(n, stop, { passive: false }));
        el.addEventListener('touchmove', move, { passive: false });
        const set = h.setInteractive;
        h.setInteractive = (on) => { h.interactive = !!on; el.style.touchAction = on ? 'none' : ''; set(on); };
        h.setInteractive(o.interactive !== false);
        return h;
    }

    function open(el, o) {
        o = Object.assign({ zoom: 15, interactive: true, zoomControl: false }, o || {});
        if (!el) return Promise.resolve(null);
        return load().then((ym) => {
            if (!el.isConnected) return null;
            return yandex(ym, el, o);
        }).catch(() => {
            if (!el.isConnected) return null;
            el.innerHTML = '';
            return osm(el, o);
        }).then((h) => h && guard(el, h, o));
    }

    // Поиск точки по адресу («Колхозная 7» → координаты). Ищем рядом с посёлком; нет Яндекса или адрес не найден — null.
    function geocode(query) {
        const q = String(query || '').trim();
        if (q.length < 3) return Promise.resolve(null);
        return load().then((ym) => ym.geocode(/Архипо|Осипов/i.test(q) ? q : 'Архипо-Осиповка, ' + q,
            { results: 1, boundedBy: [[44.30, 38.40], [44.45, 38.65]], strictBounds: true }))
            .then((r) => { const o = r && r.geoObjects && r.geoObjects.get(0); return o ? o.geometry.getCoordinates() : null; })
            .catch(() => null);
    }

    return { open, geocode };
})();
