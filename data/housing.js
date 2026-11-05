// ============================================
// ДАННЫЕ: Жильё (демо-объявления)
// Фото берутся из папки images/
//
// ВАЖНО: координаты (coords — жильё, beach — ближайшая точка моря),
// телефоны и занятые даты ниже — ПРИМЕРЫ. Замените на реальные.
// Расстояние до моря считается автоматически по этим двум точкам.
// ============================================

// --- помощники для демо-дат (занятые ночи считаются от сегодняшнего дня) ---
function _isoDay(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
// [[через сколько дней начало, сколько ночей занято], ...]
function _busy(ranges) {
    const out = [];
    ranges.forEach(([offset, len]) => {
        for (let i = 0; i < len; i++) {
            const d = new Date();
            d.setHours(12, 0, 0, 0);
            d.setDate(d.getDate() + offset + i);
            out.push(_isoDay(d));
        }
    });
    return out;
}

// Точка на берегу (пример) — отсюда считаются расстояния
const _BEACH = [44.8928, 37.2990];
function _near(dLat, dLng) { return [_BEACH[0] + dLat, _BEACH[1] + dLng]; }

const HOUSING_ADS = [
    {
        id: 1,
        type: 'rent',
        category: 'apartment',
        title: 'Сдам 1-комн. квартиру',
        price: '2500 ₽/сут',
        priceNum: 2500,
        location: 'ул. Приморская, 45',
        image: 'images/house1.webp',
        photos: ['images/house1.webp', 'images/house2.webp', 'images/house3.webp', 'images/house5.jpg'],
        date: 'Сегодня',
        time: '10:23',
        views: 45,
        isVerified: true,
        isUrgent: false,
        description: 'Светлая уютная квартира с современным ремонтом. Вся техника, Wi-Fi. Тихий двор, до моря идти по тенистой улице. Подходит для пары или семьи с ребёнком.',
        owner: {
            id: 'o1', name: 'Александр', phone: '+79000000001', color: '#E8643F',
            since: 2021, rating: 4.9, reviews: 23, response: 'отвечает в течение часа',
            about: 'Сдаю жильё у моря с 2021 года. Встречаю гостей лично, помогу с маршрутом и экскурсиями.'
        },
        facts: [
            { i: 'fa-users', t: 'до 3 гостей' },
            { i: 'fa-bed', t: '1 комната · 32 м²' },
            { i: 'fa-layer-group', t: '3 этаж из 5' }
        ],
        amenities: ['Wi-Fi', 'Кондиционер', 'Кухня', 'Стиральная машина', 'Телевизор', 'Балкон'],
        terms: [
            { i: 'fa-door-open', l: 'Заезд', v: 'с 14:00' },
            { i: 'fa-door-closed', l: 'Выезд', v: 'до 12:00' },
            { i: 'fa-shield-halved', l: 'Залог', v: '2000 ₽, вернём при выезде' },
            { i: 'fa-key', l: 'Как заселиться', v: 'Встречаю лично, ключи передам у подъезда' }
        ],
        rules: ['Без шумных вечеринок после 22:00', 'Можно с детьми', 'Без животных', 'Не курить в квартире'],
        coords: _near(0.0028, 0.0035),
        beach: _BEACH,
        busy: _busy([[2, 3], [9, 4], [20, 6]])
    },
    {
        id: 2,
        type: 'rent',
        category: 'apartment',
        title: 'Сдам студию у моря',
        price: '3000 ₽/сут',
        priceNum: 3000,
        location: 'ул. Набережная, 12',
        image: 'images/house2.webp',
        photos: ['images/house2.webp', 'images/house1.webp', 'images/house6.jpg'],
        date: 'Вчера',
        time: '10:45',
        views: 23,
        isVerified: false,
        isUrgent: true,
        description: 'Уютная студия с видом на море. 5 минут до пляжа. Есть всё для отдыха вдвоём: кухня, кондиционер, свежее бельё.',
        owner: {
            id: 'o2', name: 'Мария', phone: '+79000000002', color: '#12A8A8',
            since: 2022, rating: 4.7, reviews: 11, response: 'отвечает в течение дня',
            about: 'Живу в этом городе всю жизнь. Студия моя собственная, поэтому слежу за порядком сама.'
        },
        facts: [
            { i: 'fa-users', t: 'до 2 гостей' },
            { i: 'fa-bed', t: 'Студия · 24 м²' },
            { i: 'fa-water', t: 'Вид на море' }
        ],
        amenities: ['Wi-Fi', 'Кондиционер', 'Кухня', 'Телевизор', 'Балкон'],
        terms: [
            { i: 'fa-door-open', l: 'Заезд', v: 'с 13:00' },
            { i: 'fa-door-closed', l: 'Выезд', v: 'до 11:00' },
            { i: 'fa-shield-halved', l: 'Залог', v: 'Не нужен' },
            { i: 'fa-key', l: 'Как заселиться', v: 'Самостоятельно, ключ в кодовом боксе' }
        ],
        rules: ['Только для пар', 'Без животных', 'Не курить'],
        coords: _near(0.0006, 0.0009),
        beach: _BEACH,
        busy: _busy([[0, 2], [5, 3], [14, 5]])
    },
    {
        id: 3,
        type: 'rent',
        category: 'guest',
        title: 'Гостевой дом «Уют»',
        price: 'от 2000 ₽/сут',
        priceNum: 2000,
        location: 'ул. Пляжная, 8',
        image: 'images/house3.webp',
        photos: ['images/house3.webp', 'images/house5.jpg', 'images/house6.jpg', 'images/house1.webp'],
        date: 'Сегодня',
        time: '11:12',
        views: 78,
        isVerified: true,
        isUrgent: false,
        description: 'Номера с удобствами. Бассейн, мангал, парковка. Во дворе беседка и детская площадка. Завтрак по желанию за отдельную плату.',
        owner: {
            id: 'o3', name: 'Дмитрий', phone: '+79000000003', color: '#D98A1E',
            since: 2019, rating: 4.8, reviews: 64, response: 'отвечает в течение часа',
            about: 'Семейный гостевой дом. Принимаем гостей с 2019 года, многие приезжают к нам каждый сезон.'
        },
        facts: [
            { i: 'fa-users', t: 'до 6 гостей' },
            { i: 'fa-bed', t: '4 номера' },
            { i: 'fa-car', t: 'Своя парковка' }
        ],
        amenities: ['Wi-Fi', 'Бассейн', 'Мангал', 'Парковка', 'Кондиционер', 'Для детей'],
        terms: [
            { i: 'fa-door-open', l: 'Заезд', v: 'с 12:00' },
            { i: 'fa-door-closed', l: 'Выезд', v: 'до 12:00' },
            { i: 'fa-shield-halved', l: 'Залог', v: '1000 ₽ с номера' },
            { i: 'fa-key', l: 'Как заселиться', v: 'Встретим во дворе, позвоните за час' }
        ],
        rules: ['Тишина после 23:00', 'Можно с детьми', 'Можно с небольшими животными'],
        coords: _near(0.0012, 0.0018),
        beach: _BEACH,
        busy: _busy([[1, 4], [8, 2], [16, 7]])
    },
    {
        id: 4,
        type: 'sale',
        category: 'house',
        title: 'Продам дом 120 м²',
        price: '5 500 000 ₽',
        priceNum: 5500000,
        location: 'ул. Центральная, 3',
        image: 'images/house4.webp',
        photos: ['images/house4.webp', 'images/house5.jpg', 'images/house6.jpg'],
        date: '2 дня назад',
        time: '12:30',
        views: 89,
        isVerified: true,
        isUrgent: false,
        description: 'Дом с участком 6 соток. Все коммуникации. Ровный участок, фруктовые деревья, летняя кухня. Рядом школа и магазины.',
        owner: {
            id: 'o4', name: 'Анна', phone: '+79000000004', color: '#7C5CFF',
            since: 2020, rating: 5.0, reviews: 4, response: 'отвечает в течение дня',
            about: 'Продаю дом семьи. Все документы готовы, покажу в удобное для вас время.'
        },
        facts: [
            { i: 'fa-ruler-combined', t: '120 м²' },
            { i: 'fa-tree', t: 'Участок 6 соток' },
            { i: 'fa-bed', t: '4 комнаты' }
        ],
        amenities: ['Газ', 'Вода', 'Электричество', 'Канализация', 'Парковка'],
        terms: [
            { i: 'fa-file-signature', l: 'Документы', v: 'Собственность, обременений нет' },
            { i: 'fa-handshake', l: 'Торг', v: 'Возможен при осмотре' },
            { i: 'fa-calendar-check', l: 'Показ', v: 'В любой день, по звонку' }
        ],
        rules: [],
        coords: _near(0.0080, 0.0100),
        beach: _BEACH,
        busy: []
    },
    {
        id: 5,
        type: 'rent',
        category: 'apartment',
        title: '2-комн. квартира',
        price: '3500 ₽/сут',
        priceNum: 3500,
        location: 'ул. Курортная, 15',
        image: 'images/house5.jpg',
        photos: ['images/house5.jpg', 'images/house1.webp', 'images/house3.webp', 'images/house2.webp'],
        date: 'Сегодня',
        time: '13:15',
        views: 34,
        isVerified: false,
        isUrgent: false,
        description: 'Просторная квартира для семьи. 4 спальных места. Две раздельные комнаты, большая кухня-гостиная, детская кроватка по запросу.',
        owner: {
            id: 'o5', name: 'Сергей', phone: '+79000000005', color: '#3E7BFF',
            since: 2023, rating: 4.6, reviews: 8, response: 'отвечает в течение дня',
            about: 'Сдаю квартиру, в которой сам отдыхал с семьёй. Знаю, что нужно гостям с детьми.'
        },
        facts: [
            { i: 'fa-users', t: 'до 4 гостей' },
            { i: 'fa-bed', t: '2 комнаты · 54 м²' },
            { i: 'fa-layer-group', t: '2 этаж из 9' }
        ],
        amenities: ['Wi-Fi', 'Кондиционер', 'Кухня', 'Стиральная машина', 'Телевизор', 'Для детей'],
        terms: [
            { i: 'fa-door-open', l: 'Заезд', v: 'с 14:00' },
            { i: 'fa-door-closed', l: 'Выезд', v: 'до 12:00' },
            { i: 'fa-shield-halved', l: 'Залог', v: '3000 ₽' },
            { i: 'fa-key', l: 'Как заселиться', v: 'Встречает консьерж, ключ у него' }
        ],
        rules: ['Можно с детьми', 'Без вечеринок', 'Не курить'],
        coords: _near(0.0040, 0.0050),
        beach: _BEACH,
        busy: _busy([[3, 5], [12, 3], [22, 4]])
    },
    {
        id: 6,
        type: 'rent',
        category: 'hotel',
        title: 'Отель «Волна»',
        price: 'от 3500 ₽/сут',
        priceNum: 3500,
        location: 'ул. Пляжная, 5',
        image: 'images/house6.jpg',
        photos: ['images/house6.jpg', 'images/house3.webp', 'images/house2.webp', 'images/house5.jpg'],
        date: 'Сегодня',
        time: '14:02',
        views: 156,
        isVerified: true,
        isUrgent: false,
        description: 'Отель с бассейном и завтраком. Первая линия. Номера с балконом и видом на море, круглосуточная стойка, трансфер от вокзала.',
        owner: {
            id: 'o6', name: 'Елена', phone: '+79000000006', color: '#C2417A',
            since: 2018, rating: 4.9, reviews: 212, response: 'отвечает в течение 15 минут',
            about: 'Администратор отеля «Волна». Поможем подобрать номер и организуем встречу на вокзале.'
        },
        facts: [
            { i: 'fa-users', t: 'до 3 гостей в номере' },
            { i: 'fa-mug-hot', t: 'Завтрак включён' },
            { i: 'fa-umbrella-beach', t: 'Первая линия' }
        ],
        amenities: ['Wi-Fi', 'Бассейн', 'Кондиционер', 'Парковка', 'Телевизор', 'Балкон', 'Для детей'],
        terms: [
            { i: 'fa-door-open', l: 'Заезд', v: 'с 14:00, ранний за доплату' },
            { i: 'fa-door-closed', l: 'Выезд', v: 'до 12:00' },
            { i: 'fa-shield-halved', l: 'Залог', v: 'Не нужен' },
            { i: 'fa-key', l: 'Как заселиться', v: 'Через стойку регистрации, паспорт обязателен' }
        ],
        rules: ['Можно с детьми', 'Можно с животными до 10 кг', 'Курение на террасе'],
        coords: _near(0.0004, 0.0006),
        beach: _BEACH,
        busy: _busy([[0, 6], [10, 5], [18, 8]])
    }
];
