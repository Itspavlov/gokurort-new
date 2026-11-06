// ============================================
// KEYBOARD.JS — экранная клавиатура не должна сдвигать чат.
// На iPhone при фокусе в поле ввода Safari прокручивает страницу и уменьшает видимую область:
// шапка уходит вверх, а между полем и клавиатурой остаётся пустое место.
// Пока клавиатура открыта, подгоняем экраны чата и шторки под видимую область (visualViewport).
// ============================================
(function () {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let open = false, raf = 0;

    function nearBottom() {
        const box = document.getElementById('chatMessages');
        return !box || box.scrollHeight - box.scrollTop - box.clientHeight < 140;
    }

    function sync() {
        raf = 0;
        const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        const now = kb > 100;                                    // меньше — это не клавиатура, а панель браузера
        if (now) {
            root.style.setProperty('--vvh', Math.round(vv.height) + 'px');
            root.style.setProperty('--vvtop', Math.round(vv.offsetTop) + 'px');
        } else {
            root.style.removeProperty('--vvh');
            root.style.removeProperty('--vvtop');
        }
        if (now !== open) {
            const stick = nearBottom();
            open = now;
            document.body.classList.toggle('kb-open', now);
            if (stick && typeof scrollChatToBottom === 'function') requestAnimationFrame(() => scrollChatToBottom());
        }
        if (now && window.scrollY !== 0) window.scrollTo(0, 0);   // страница под чатом не должна уезжать
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(sync); };
    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
    window.addEventListener('orientationchange', () => setTimeout(schedule, 300));
    document.addEventListener('focusout', () => setTimeout(schedule, 150));
})();
