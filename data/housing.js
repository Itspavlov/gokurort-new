// ============================================
// ТЕСТОВЫЕ ДАННЫЕ: Жильё
// Реальные фото из папки images/
// ============================================

const HOUSING_ADS = [
    {
        id: 1,
        title: 'Сдам 1-комн. квартиру',
        price: '2500 ₽/сут',
        location: 'ул. Приморская, 45',
        image: 'images/house1.webp',
        date: 'Сегодня',
        views: 45,
        isVerified: true,
        isUrgent: false,
        description: 'Светлая уютная квартира с современным ремонтом. Вся техника, Wi-Fi.'
    },
    {
        id: 2,
        title: 'Сдам студию у моря',
        price: '3000 ₽/сут',
        location: 'ул. Набережная, 12',
        image: 'images/house2.webp',
        date: 'Вчера',
        views: 23,
        isVerified: false,
        isUrgent: true,
        description: 'Уютная студия с видом на море. 5 минут до пляжа.'
    },
    {
        id: 3,
        title: 'Гостевой дом «Уют»',
        price: 'от 2000 ₽/сут',
        location: 'ул. Пляжная, 8',
        image: 'images/house3.webp',
        date: 'Сегодня',
        views: 78,
        isVerified: true,
        isUrgent: false,
        description: 'Номера с удобствами. Бассейн, мангал, парковка.'
    },
    {
        id: 4,
        title: 'Продам дом 120 м²',
        price: '5 500 000 ₽',
        location: 'ул. Центральная, 3',
        image: 'images/house4.webp',
        date: '2 дня назад',
        views: 89,
        isVerified: true,
        isUrgent: false,
        description: 'Дом с участком 6 соток. Все коммуникации.'
    },
    {
        id: 5,
        title: '2-комн. квартира',
        price: '3500 ₽/сут',
        location: 'ул. Курортная, 15',
        image: 'images/house5.jpg',
        date: 'Сегодня',
        views: 34,
        isVerified: false,
        isUrgent: false,
        description: 'Просторная квартира для семьи. 4 спальных места.'
    },
    {
        id: 6,
        title: 'Отель «Волна»',
        price: 'от 3500 ₽/сут',
        location: 'ул. Пляжная, 5',
        image: 'images/house6.jpg',
        date: 'Сегодня',
        views: 156,
        isVerified: true,
        isUrgent: false,
        description: 'Отель с бассейном и завтраком. Первая линия.'
    },
];