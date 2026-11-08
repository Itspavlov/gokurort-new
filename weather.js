// Погода в шапке главной: температура воздуха и воды в Архипо-Осиповке.
// Значения приходят с сервера (/api/weather); их можно менять в админке. Нет данных: плашки скрыты.
(function () {
    const wrap = document.getElementById('heroWx');
    if (!wrap) return;
    const fmt = (v) => {
        const n = Math.round(v);
        return (n > 0 ? '+' : n < 0 ? '\u2212' : '') + Math.abs(n) + '\u00b0';
    };
    function paint(d) {
        const air = d && typeof d.air === 'number' ? d.air : null;
        const water = d && typeof d.water === 'number' ? d.water : null;
        const set = (id, v) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.hidden = v === null;
            if (v !== null) el.querySelector('b').textContent = fmt(v);
        };
        set('wxAir', air); set('wxWater', water);
        wrap.hidden = air === null && water === null;
        wrap.title = [air !== null ? 'Воздух ' + fmt(air) : '', water !== null ? 'Вода ' + fmt(water) : ''].filter(Boolean).join(', ');
    }
    async function load() {
        try {
            const r = await fetch(`${SERVER_URL}/api/weather`, { cache: 'no-store' });
            if (!r.ok) return;
            paint(await r.json());
        } catch (e) { /* без сети плашки просто остаются как были */ }
    }
    load();
    setInterval(() => { if (!document.hidden) load(); }, 10 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
})();
