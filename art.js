// ============================================
// ART.JS — библиотека готовых иллюстраций для карточек вакансий (70 штук).
// Файлы: images/art/aNN.webp (крупная) и images/art/t/aNN.webp (миниатюра для выбора).
// В карточке хранится только код вида «a22»: сервер принимает a01…a70 и больше ничего.
// ============================================
const ART_V = 1;
const ART_CATS = [['job', 'Профессии'], ['food', 'Еда и напитки'], ['water', 'Вода и пляж'], ['fun', 'Развлечения'], ['move', 'Транспорт'], ['stay', 'Жильё и сервис']];
// [код, название, раздел, ширина, высота] — размеры нужны, чтобы страница не прыгала, пока картинка грузится
const ART = [
    ['a01', 'Кафе на пляже', 'food', 200, 186],
    ['a02', 'Карусель', 'fun', 195, 186],
    ['a03', 'Спасательная вышка', 'water', 190, 186],
    ['a04', 'Гидроцикл', 'water', 195, 186],
    ['a05', 'Джип', 'move', 199, 186],
    ['a06', 'Отель с бассейном', 'stay', 209, 186],
    ['a07', 'Повар у плиты', 'food', 169, 186],
    ['a08', 'Гриль', 'food', 166, 186],
    ['a09', 'Коктейль', 'food', 114, 186],
    ['a10', 'Мороженое', 'food', 128, 186],
    ['a11', 'Сёрфинг', 'water', 200, 176],
    ['a12', 'Шатёр-беседка', 'stay', 195, 176],
    ['a13', 'Дайвинг', 'water', 190, 176],
    ['a14', 'Яхта', 'water', 194, 176],
    ['a15', 'Микроавтобус', 'move', 181, 176],
    ['a16', 'Сувенирная лавка', 'stay', 198, 176],
    ['a17', 'Номер в отеле', 'stay', 180, 176],
    ['a18', 'Шезлонги и зонт', 'water', 160, 176],
    ['a19', 'Водный банан', 'water', 132, 176],
    ['a20', 'Парасейлинг', 'water', 136, 176],
    ['a21', 'Аквапарк', 'fun', 199, 168],
    ['a22', 'Колесо обозрения', 'fun', 184, 168],
    ['a23', 'Автодром', 'fun', 194, 168],
    ['a24', 'Игровой автомат', 'fun', 176, 168],
    ['a25', 'Попкорн и сладкая вата', 'food', 171, 168],
    ['a26', 'Фудтрак', 'food', 184, 168],
    ['a27', 'Бургер', 'food', 182, 168],
    ['a28', 'Пицца', 'food', 169, 168],
    ['a29', 'Суши', 'food', 172, 168],
    ['a30', 'Клубника в шоколаде', 'food', 130, 168],
    ['a31', 'Кофе и круассан', 'food', 198, 144],
    ['a32', 'Бар', 'food', 184, 144],
    ['a33', 'Официант', 'job', 179, 144],
    ['a34', 'Официантка', 'job', 170, 144],
    ['a35', 'Шеф-повар', 'job', 176, 144],
    ['a36', 'Выпечка', 'food', 174, 144],
    ['a37', 'Фрукты', 'food', 164, 144],
    ['a38', 'Кассир', 'job', 170, 144],
    ['a39', 'Магазин', 'stay', 171, 144],
    ['a40', 'Курьер', 'job', 168, 144],
    ['a41', 'Администратор', 'job', 196, 144],
    ['a42', 'Горничная', 'job', 180, 144],
    ['a43', 'Прачечная', 'stay', 174, 144],
    ['a44', 'Уборка', 'job', 178, 144],
    ['a45', 'Мастер по ремонту', 'job', 176, 144],
    ['a46', 'Садовник', 'job', 172, 144],
    ['a47', 'Чистка бассейна', 'job', 170, 144],
    ['a48', 'Охранник', 'job', 166, 144],
    ['a49', 'Спасатель', 'job', 169, 144],
    ['a50', 'Билетная касса', 'fun', 169, 144],
    ['a51', 'Аниматор', 'job', 195, 136],
    ['a52', 'Сцена', 'fun', 182, 136],
    ['a53', 'Диджей', 'job', 181, 136],
    ['a54', 'Фотограф', 'job', 175, 136],
    ['a55', 'Экскурсовод', 'job', 175, 136],
    ['a56', 'Маршрут', 'fun', 171, 136],
    ['a57', 'Квадроцикл', 'move', 174, 136],
    ['a58', 'Конные прогулки', 'fun', 162, 136],
    ['a59', 'Велосипеды', 'move', 170, 136],
    ['a60', 'Самокаты', 'move', 175, 136],
    ['a61', 'Рыбалка', 'fun', 198, 171],
    ['a62', 'Снорклинг', 'water', 195, 171],
    ['a63', 'Парусник', 'water', 165, 171],
    ['a64', 'Надувной батут', 'water', 171, 171],
    ['a65', 'САП-борд', 'water', 191, 171],
    ['a66', 'Каяк', 'water', 165, 171],
    ['a67', 'Пляжный волейбол', 'water', 168, 171],
    ['a68', 'Кинотеатр под открытым небом', 'fun', 166, 171],
    ['a69', 'Костёр', 'fun', 160, 171],
    ['a70', 'Глэмпинг', 'stay', 186, 171]
];
const ART_BY_ID = Object.fromEntries(ART.map(a => [a[0], a]));
const artSrc = (id, thumb) => `images/art/${thumb ? 't/' : ''}${id}.webp?v=${ART_V}`;
const artKnown = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(ART_BY_ID, id);

// картинка на карточке (справа, текст обтекает)
function artCardHTML(id) {
    if (!artKnown(id)) return '';
    const a = ART_BY_ID[id];
    return `<div class="rq-art"><img src="${artSrc(id)}" alt="${a[1]}" width="${a[3]}" height="${a[4]}" decoding="async" draggable="false" onerror="this.parentNode.remove()"></div>`;
}

// выбор в форме: кнопка с предпросмотром и раскрывающаяся библиотека по разделам
function artPickerHTML(cur) {
    return `<div class="field rq-artf" id="cdArt"><span>Картинка вакансии (необязательно)</span>
        <div class="rq-art-bar">
            <button type="button" class="rq-art-open" id="cdArtOpen" aria-expanded="false"></button>
            <button type="button" class="rq-art-clear" id="cdArtClear" hidden>Убрать</button>
        </div>
        <div class="rq-art-lib" id="cdArtLib" hidden>
            <div class="rq-art-tabs" role="tablist">${ART_CATS.map((c, i) => `<button type="button" role="tab" data-cat="${c[0]}" class="${i ? '' : 'on'}" aria-selected="${!i}">${c[1]}</button>`).join('')}</div>
            <div class="rq-art-grid" id="cdArtGrid"></div>
        </div>
        <small class="rq-photo-hint">Картинка видна справа на карточке. Выбирайте то, что подходит к работе.</small></div>`;
}
function artPickerInit(root, cur, onPick) {
    const open = root.querySelector('#cdArtOpen'), clr = root.querySelector('#cdArtClear'), lib = root.querySelector('#cdArtLib'), grid = root.querySelector('#cdArtGrid');
    let val = artKnown(cur) ? cur : '', cat = 'job';
    const paintBar = () => {
        const a = val ? ART_BY_ID[val] : null;
        open.innerHTML = a ? `<img src="${artSrc(val, true)}" alt=""><span>${a[1]}<small>Нажмите, чтобы изменить</small></span>` : '<i class="fas fa-image"></i><span>Выбрать картинку<small>70 готовых иллюстраций</small></span>';
        clr.hidden = !a;
    };
    const paintGrid = () => {
        grid.innerHTML = ART.filter(a => a[2] === cat).map(a => `<button type="button" class="rq-art-it${a[0] === val ? ' on' : ''}" data-id="${a[0]}" aria-label="${a[1]}" aria-pressed="${a[0] === val}"><img src="${artSrc(a[0], true)}" alt="" loading="lazy" decoding="async"></button>`).join('');
    };
    // если картинка уже выбрана, библиотека открывается на её разделе
    if (val) cat = ART_BY_ID[val][2];
    root.querySelectorAll('.rq-art-tabs button').forEach(b => { const on = b.dataset.cat === cat; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    open.addEventListener('click', () => { lib.hidden = !lib.hidden; open.setAttribute('aria-expanded', String(!lib.hidden)); if (!lib.hidden) paintGrid(); });
    clr.addEventListener('click', () => { val = ''; paintBar(); paintGrid(); onPick(''); });
    root.querySelector('.rq-art-tabs').addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-cat]'); if (!b) return;
        cat = b.dataset.cat;
        root.querySelectorAll('.rq-art-tabs button').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); });
        paintGrid(); grid.scrollTop = 0;
    });
    grid.addEventListener('click', (ev) => {
        const b = ev.target.closest('.rq-art-it'); if (!b) return;
        val = b.dataset.id; paintBar(); lib.hidden = true; open.setAttribute('aria-expanded', 'false'); onPick(val);
    });
    paintBar();
    return { get: () => val };
}
