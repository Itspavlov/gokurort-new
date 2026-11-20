// ============================================
// ОНБОРДИНГ: слайды «Добро пожаловать» после регистрации
// ============================================
// Показываются один раз при первом запуске, до регистрации. Листаются пальцем или кнопкой «Дальше»;
// на последнем слайде кнопка «Начать» открывает окно регистрации (его можно закрыть и смотреть гостем).
const ONBOARD_KEY = 'yy-onboard-1';
const ONBOARD_SLIDES = [
    { img: 'images/hero.jpg', pos: '70% 30%', kicker: 'Архипо-Осиповка', title: 'Добро пожаловать в&nbsp;YuGi&nbsp;<em>YuGi</em>', text: 'Весь курорт в одном приложении: жильё, развлечения, работа, поездки и общение.' },
    { img: 'images/housing.jpg', pos: '40% 50%', kicker: 'Жильё', title: 'Жильё у моря <em>без посредников</em>', text: 'Квартиры, дома и отели напрямую от хозяев. Смотрите фото и свободные даты, пишите хозяину в личные сообщения.' },
    { img: 'images/services.jpg', pos: '75% 50%', kicker: 'Развлечения', title: 'Морские прогулки, экскурсии, <em>джип-туры</em>', text: 'Готовые услуги с ценами от организаторов: пишите им прямо из карточки.' },
    { img: 'images/trips.jpg', pos: '60% 50%', kicker: 'Поездки и работа', title: 'Доехать и <em>заработать</em>', text: 'Попутчики и водители по побережью, вакансии на сезон и подработка рядом с морем.' },
    { img: 'images/dating.jpg', pos: '50% 60%', kicker: 'Общение', title: 'Выбирайте <em>вместе с друзьями</em>', text: 'Создайте группу, добавляйте в неё понравившееся жильё свайпом и решайте вместе. Что-то непонятно? В каждом разделе есть кнопка с вопросом.' }
];

function openOnboarding(opts) {
    if (document.getElementById('onboard')) return;
    const o = opts || {};
    const el = document.createElement('div');
    el.id = 'onboard'; el.className = 'ob';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Знакомство с приложением');
    const n = ONBOARD_SLIDES.length;
    el.innerHTML = `
        <button type="button" class="ob-skip" id="obSkip">Пропустить</button>
        <div class="ob-track" id="obTrack">${ONBOARD_SLIDES.map((s, i) => `
            <section class="ob-slide" aria-label="${i + 1} из ${n}">
                <div class="ob-pic"><img src="${s.img}" alt="" style="object-position:${s.pos}"${i ? ' loading="lazy"' : ''}></div>
                <div class="ob-txt">
                    <div class="ob-kicker">${s.kicker}</div>
                    <h2 class="ob-title">${s.title}</h2>
                    <p class="ob-text">${s.text}</p>
                </div>
            </section>`).join('')}
        </div>
        <div class="ob-foot">
            <div class="ob-dots" id="obDots">${ONBOARD_SLIDES.map((_, i) => `<i${i ? '' : ' class="on"'}></i>`).join('')}</div>
            <button type="button" class="ob-next" id="obNext">Дальше</button>
        </div>`;
    document.body.appendChild(el);
    const track = el.querySelector('#obTrack'), next = el.querySelector('#obNext'), dots = el.querySelectorAll('#obDots i'), skip = el.querySelector('#obSkip');
    let cur = 0;
    const paint = () => {
        dots.forEach((d, i) => d.classList.toggle('on', i === cur));
        const last = cur === n - 1;
        next.textContent = last ? 'Начать' : 'Дальше';
        next.classList.toggle('go', last);
        skip.style.visibility = last ? 'hidden' : '';
    };
    const close = (start) => {
        try { localStorage.setItem(ONBOARD_KEY, '1'); } catch (_) {}
        el.classList.remove('in');
        setTimeout(() => el.remove(), 260);
        // «Начать»: сразу окно регистрации (если человек ещё не вошёл)
        if (start === true && typeof getAccount === 'function' && !getAccount() && typeof openAuthSheet === 'function') setTimeout(() => openAuthSheet(null, 'register'), 200);
        if (o.onDone) o.onDone();
    };
    track.addEventListener('scroll', () => {
        const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
        if (i !== cur) { cur = Math.max(0, Math.min(n - 1, i)); paint(); }
    }, { passive: true });
    next.addEventListener('click', () => {
        if (cur >= n - 1) { close(true); return; }
        track.scrollTo({ left: (cur + 1) * track.clientWidth, behavior: 'smooth' });
    });
    skip.addEventListener('click', () => close(false));
    paint();
    requestAnimationFrame(() => el.classList.add('in'));
}

// Первый запуск: гость, который ещё не видел слайды. Вошедшим пользователям не показываем.
window.addEventListener('load', () => {
    try { if (localStorage.getItem(ONBOARD_KEY) === '1') return; } catch (_) { return; }
    if (typeof getAccount === 'function' && getAccount()) { try { localStorage.setItem(ONBOARD_KEY, '1'); } catch (_) {} return; }
    setTimeout(() => { if (!document.getElementById('sheet')) openOnboarding(); }, 350);
});
