// ===================== КОНФИГУРАЦИЯ И СОСТОЯНИЕ =====================
const API_URL =
'https://script.google.com/macros/s/AKfycbzDZWaNyyU2S-Ipg-iVYDNJD84CfxkirrKPtkDq7gfFcPd3S1nUsg2D-k6YT6i0BNxG-g/exec'; // ЗАМЕНИТЕ НА ВАШ URL
let AUTH_TOKEN = localStorage.getItem('auth_token') || ''; // Берем из localStorage

let appState = {
    data: {
        settings: { DEFAULT_PERCENT: 50 },
        servicesCatalog: [],
        transactions: [],
        payouts: []
    },
    currentScreen: 'dashboard',
    selectedPeriodId: null,
    pendingSync: []
};

// ===================== УЛУЧШЕННАЯ РАБОТА С МОДАЛЬНЫМИ ОКНАМИ =====================
function closeModal() {
    document.getElementById('modal').classList.add('hidden');
}

// Закрытие по Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});

// Закрытие по клику вне окна
document.addEventListener('click', (e) => {
    const modal = document.getElementById('modal');
    if (e.target === modal) closeModal();
});

// ===================== ХРАНИЛИЩЕ (LOCALSTORAGE) =====================
function loadLocalData(key, defaultValue) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : defaultValue;
    } catch (e) {
        console.error('Ошибка загрузки из LocalStorage:', e);
        return defaultValue;
    }
}

function saveLocalData(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.error('Ошибка сохранения в LocalStorage:', e);
    }
}

function savePendingSync(pending) {
    saveLocalData('pendingSync', pending);
}

function loadPendingSync() {
    return loadLocalData('pendingSync', []);
}

// ===================== API ВЗАИМОДЕЙСТВИЕ =====================
async function apiCall(action, params = {}) {
    if (!AUTH_TOKEN) {
        throw new Error('Токен не задан. Введите токен авторизации.');
    }

    const formData = new URLSearchParams();
    formData.append('token', AUTH_TOKEN);
    formData.append('action', action);

    for (const [key, value] of Object.entries(params)) {
        if (typeof value === 'object') {
            formData.append(key, JSON.stringify(value));
        } else {
            formData.append(key, value);
        }
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (!data.success && data.error) {
            throw new Error(data.error);
        }
        return data;
    } catch (error) {
        console.error('Ошибка API:', error);
        throw error;
    }
}

async function syncPendingVisits() {
    const pending = loadPendingSync();
    if (pending.length === 0) return;

    console.log(`Попытка синхронизации ${pending.length} визитов...`);
    showToast(`Синхронизация ${pending.length} визитов...`);

    const unsynced = [];
    for (const visit of pending) {
        try {
            await apiCall('addVisit', {
                service_date: visit.service_date,
                services: visit.services
            });
            console.log('Визит синхронизирован успешно.');
        } catch (error) {
            console.error('Ошибка синхронизации визита:', error);
            unsynced.push(visit);
        }
    }

    savePendingSync(unsynced);
    if (unsynced.length === 0) {
        showToast('Все данные синхронизированы');
    } else {
        showToast(`Не удалось синхронизировать ${unsynced.length} визитов`);
    }
}

async function fetchData() {
    try {
        const data = await apiCall('getData');
        appState.data = data;
        console.log('Данные обновлены');
    } catch (error) {
        console.error('Не удалось получить данные:', error);
        showToast('Ошибка загрузки данных');
        throw error; // Пробрасываем ошибку выше
    }
}

// ===================== НАВИГАЦИЯ =====================
function showScreen(screenName, params = {}) {
    appState.currentScreen = screenName;
    closeModal();

    if (screenName === 'dashboard') renderDashboard();
    else if (screenName === 'addVisit') renderAddVisit();
    else if (screenName === 'history') renderHistory();
    else if (screenName === 'catalog') renderCatalog();
    else if (screenName === 'pricelist') renderPriceList();
    else if (screenName === 'periodDetail') renderPeriodDetail(params.periodId);
    else if (screenName === 'initialSetup') renderInitialSetup();

    const fab = document.getElementById('fab-add');
    if (fab) {
        if (screenName === 'dashboard') {
            fab.classList.remove('hidden');
        } else {
            fab.classList.add('hidden');
        }
    }

    window.scrollTo(0, 0);
}

// ===================== ЭКРАНЫ =====================
function renderInitialSetup() {
    const content = document.getElementById('content');
    const loading = document.getElementById('loading');

    // Скрываем загрузку, показываем контент
    loading.classList.add('hidden');
    content.classList.remove('hidden');

    content.innerHTML = `
    <div class="bg-white rounded-lg shadow p-6 mt-8">
        <h2 class="text-xl font-semibold mb-4 text-center">Вход в приложение</h2>
        <p class="text-sm text-gray-600 mb-4 text-center">
            Введите ваш секретный токен для доступа к данным
        </p>
        <input type="password" id="auth-token-input" placeholder="Введите токен"
            class="w-full p-3 border border-gray-300 rounded mb-3 text-base" autocomplete="off">
        <button onclick="handleInitialize()"
            class="w-full bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600 text-base font-medium">
            Подключиться
        </button>
        <p class="text-xs text-gray-400 mt-4 text-center">
            Токен можно получить у администратора системы
        </p>
    </div>
    `;

    // Фокус на поле ввода
    setTimeout(() => {
        document.getElementById('auth-token-input')?.focus();
    }, 100);
}

async function handleInitialize() {
    const tokenInput = document.getElementById('auth-token-input');
    const token = tokenInput.value.trim();

    if (!token) {
        showToast('Введите токен');
        return;
    }

    // Сохраняем токен
    AUTH_TOKEN = token;
    localStorage.setItem('auth_token', token);

    // Показываем загрузку
    const button = tokenInput.nextElementSibling;
    button.disabled = true;
    button.textContent = 'Подключение...';

    try {
        await fetchData();
        showToast('Подключено успешно!');
        showScreen('dashboard');
    } catch (e) {
        console.error('Ошибка подключения:', e);
        // Удаляем неверный токен
        localStorage.removeItem('auth_token');
        AUTH_TOKEN = '';
        showToast('Ошибка: ' + e.message);

        // Восстанавливаем кнопку
        button.disabled = false;
        button.textContent = 'Подключиться';
    }
}

function renderDashboard() {
    const { transactions, payouts, settings } = appState.data;
    const content = document.getElementById('content');
    const loading = document.getElementById('loading');

    loading.classList.add('hidden');
    content.classList.remove('hidden');

    const totalDebt = calculateTotalDebt(transactions, payouts);
    const currentPeriodEarnings = calculateCurrentPeriodEarnings(transactions);
    const todayEarnings = calculateCalendarEarnings(transactions, 'today');
    const monthEarnings = calculateCalendarEarnings(transactions, 'month');
    const yearEarnings = calculateCalendarEarnings(transactions, 'year');

    content.innerHTML = `
    <!-- Навигация -->
    <div class="bg-white rounded-lg shadow mb-4 sticky top-0 z-30">
        <div class="grid grid-cols-4 text-center text-sm">
            <button onclick="showScreen('dashboard')" class="py-3 font-semibold text-blue-600 border-b-2 border-blue-600">
                📊
            </button>
            <button onclick="showScreen('history')" class="py-3 text-gray-600 hover:text-blue-600">
                📅
            </button>
            <button onclick="showScreen('pricelist')" class="py-3 text-gray-600 hover:text-blue-600">
                💰
            </button>
            <button onclick="showScreen('catalog')" class="py-3 text-gray-600 hover:text-blue-600">
                ⚙️
            </button>
        </div>
    </div>

    <div class="space-y-4">
        <!-- Главный виджет -->
        <div class="bg-white rounded-lg shadow p-5 text-center">
            <p class="text-sm text-gray-500">Общий долг салона</p>
            <p class="text-3xl font-bold text-red-600 my-2">${formatMoney(totalDebt)}</p>
            <button onclick="showScreen('history')" class="text-sm text-blue-500 hover:underline">История периодов</button>
        </div>

        <!-- Текущий период -->
        <div class="bg-white rounded-lg shadow p-5 flex justify-between items-center">
            <div>
                <p class="text-sm text-gray-500">Текущий период</p>
                <p class="text-xl font-semibold">${formatMoney(currentPeriodEarnings)}</p>
            </div>
            <button onclick="handleClosePeriod()"
                class="bg-yellow-500 text-white px-4 py-3 rounded-lg hover:bg-yellow-600 text-base">Закрыть</button>
        </div>

                    <!-- Календарная аналитика -->
            <div class="bg-white rounded-lg shadow p-5">
                <p class="text-sm text-gray-500 mb-3">Доход по календарю (нажмите для деталей)</p>
                <div class="grid grid-cols-3 gap-3 text-center">
                    <div class="bg-gray-50 rounded-lg p-3 cursor-pointer hover:bg-gray-100" onclick="showAnalytics('today')">
                        <p class="text-xs text-gray-400">Сегодня</p>
                        <p class="font-semibold">${formatMoney(todayEarnings)}</p>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-3 cursor-pointer hover:bg-gray-100" onclick="showAnalytics('month')">
                        <p class="text-xs text-gray-400">За месяц</p>
                        <p class="font-semibold">${formatMoney(monthEarnings)}</p>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-3 cursor-pointer hover:bg-gray-100" onclick="showAnalytics('year')">
                        <p class="text-xs text-gray-400">За год</p>
                        <p class="font-semibold">${formatMoney(yearEarnings)}</p>
                    </div>
                </div>
                <button onclick="showAnalytics('custom')" class="w-full mt-3 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm">
                    📊 Расширенная аналитика
                </button>
            </div>
            
    `;
}

function showAnalytics(period = 'month') {
    const { transactions } = appState.data;
    const now = new Date();
    let startDate, endDate = now;
    
    if (period === 'today') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = now;
    } else if (period === 'week') {
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        endDate = now;
    } else if (period === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = now;
    } else if (period === 'quarter') {
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        endDate = now;
    } else if (period === 'year') {
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = now;
    } else if (period === 'custom') {
        // Показываем модальное окно для выбора периода
        showCustomPeriodModal();
        return;
    }
    
    renderAnalytics(startDate, endDate, period);
}

function showCustomPeriodModal() {
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    
    modalContent.innerHTML = `
        <h3 class="text-lg font-semibold mb-4">Выберите период</h3>
        
        <div class="space-y-3 mb-4">
            <button onclick="showAnalytics('today')" class="w-full bg-gray-100 py-2 rounded-lg">Сегодня</button>
            <button onclick="showAnalytics('week')" class="w-full bg-gray-100 py-2 rounded-lg">Последние 7 дней</button>
            <button onclick="showAnalytics('month')" class="w-full bg-gray-100 py-2 rounded-lg">Текущий месяц</button>
            <button onclick="showAnalytics('quarter')" class="w-full bg-gray-100 py-2 rounded-lg">Текущий квартал</button>
            <button onclick="showAnalytics('year')" class="w-full bg-gray-100 py-2 rounded-lg">Текущий год</button>
        </div>
        
        <div class="border-t pt-3">
            <p class="text-sm font-medium mb-2">Произвольный период:</p>
            <div class="space-y-2">
                <div>
                    <label class="block text-xs text-gray-500">С даты:</label>
                    <input type="date" id="custom-start-date" class="w-full p-2 border border-gray-300 rounded">
                </div>
                <div>
                    <label class="block text-xs text-gray-500">По дату:</label>
                    <input type="date" id="custom-end-date" class="w-full p-2 border border-gray-300 rounded">
                </div>
                <button onclick="applyCustomPeriod()" class="w-full bg-blue-500 text-white py-2 rounded-lg">Применить</button>
            </div>
        </div>
    `;
    
    modal.classList.remove('hidden');
}

function applyCustomPeriod() {
    const startDate = document.getElementById('custom-start-date').value;
    const endDate = document.getElementById('custom-end-date').value;
    
    if (startDate && endDate) {
        closeModal();
        renderAnalytics(new Date(startDate), new Date(endDate), 'custom');
    } else {
        showToast('Выберите обе даты');
    }
}

function renderAnalytics(startDate, endDate, periodName) {
    const { transactions } = appState.data;
    
    // Фильтруем транзакции
    const filtered = transactions.filter(t => {
        const date = new Date(t.service_date);
        return date >= startDate && date <= endDate;
    });
    
    // Считаем итоги
    const totalServices = filtered.reduce((sum, t) => sum + (t.final_price || t.full_price || 0), 0);
    const totalDiscount = filtered.reduce((sum, t) => sum + (t.discount_amount || 0), 0);
    const totalEarnings = filtered.reduce((sum, t) => sum + t.master_earnings, 0);
    
    // Группировка по дням
    const dailyData = {};
    filtered.forEach(t => {
        const dateKey = new Date(t.service_date).toLocaleDateString('ru-RU');
        if (!dailyData[dateKey]) {
            dailyData[dateKey] = {
                services: 0,
                amount: 0,
                earnings: 0,
                discounts: 0
            };
        }
        dailyData[dateKey].services++;
        dailyData[dateKey].amount += (t.final_price || t.full_price || 0);
        dailyData[dateKey].earnings += t.master_earnings;
        dailyData[dateKey].discounts += (t.discount_amount || 0);
    });
    
    // Создаем простой график
    const maxAmount = Math.max(...Object.values(dailyData).map(d => d.amount), 1);
    const barChart = Object.entries(dailyData).map(([date, data]) => {
        const barHeight = Math.max(5, (data.amount / maxAmount) * 150);
        return `
            <div class="flex flex-col items-center flex-shrink-0">
                <div class="text-xs mb-1">${Math.round(data.amount)}</div>
                <div class="w-10 bg-blue-500 rounded-t" style="height: ${barHeight}px"></div>
                <div class="text-xs mt-1">${date.split('.')[0]}.${date.split('.')[1]}</div>
            </div>
        `;
    }).join('');
    
    const periodLabel = periodName === 'today' ? 'Сегодня' : 
                        periodName === 'week' ? 'Последние 7 дней' :
                        periodName === 'month' ? 'Текущий месяц' :
                        periodName === 'quarter' ? 'Текущий квартал' :
                        periodName === 'year' ? 'Текущий год' :
                        'Произвольный период';
    
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="bg-white rounded-lg shadow p-4">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-semibold">Аналитика: ${periodLabel}</h2>
                <button onclick="showScreen('dashboard')" class="text-blue-500 text-base">← Назад</button>
            </div>
            
            <div class="text-sm text-gray-500 mb-3">
                ${startDate.toLocaleDateString('ru-RU')} - ${endDate.toLocaleDateString('ru-RU')}
            </div>
            
            <!-- Сводка -->
            <div class="grid grid-cols-2 gap-3 mb-4">
                <div class="bg-gray-50 rounded-lg p-3">
                    <p class="text-xs text-gray-500">Услуг оказано</p>
                    <p class="text-xl font-semibold">${filtered.length}</p>
                </div>
                <div class="bg-gray-50 rounded-lg p-3">
                    <p class="text-xs text-gray-500">Общая стоимость</p>
                    <p class="text-xl font-semibold">${formatMoney(totalServices)}</p>
                </div>
                <div class="bg-gray-50 rounded-lg p-3">
                    <p class="text-xs text-gray-500">Скидки</p>
                    <p class="text-xl font-semibold text-red-500">-${formatMoney(totalDiscount)}</p>
                </div>
                <div class="bg-gray-50 rounded-lg p-3">
                    <p class="text-xs text-gray-500">Заработок</p>
                    <p class="text-xl font-semibold text-green-600">${formatMoney(totalEarnings)}</p>
                </div>
            </div>
            
            <!-- График -->
            <div class="bg-gray-50 rounded-lg p-4 mb-4">
                <h3 class="font-semibold mb-3">Доходы по дням</h3>
                <div class="flex items-end space-x-2 overflow-x-auto" style="min-height: 180px;">
                    ${barChart || '<p class="text-gray-500">Нет данных за выбранный период</p>'}
                </div>
            </div>
            
            <!-- Кнопка смены периода -->
            <button onclick="showCustomPeriodModal()" class="w-full bg-gray-100 text-gray-700 py-2 rounded-lg mb-4 text-sm">
                📅 Изменить период
            </button>
            
            <!-- Таблица -->
            <div class="space-y-2">
                <h3 class="font-semibold mb-2">Детализация</h3>
                ${filtered.length > 0 ? filtered.map(t => `
                    <div class="flex justify-between items-center border-b py-2 text-sm">
                        <span class="flex-grow">${t.service_name}</span>
                        <span class="mx-2">${formatMoney(t.full_price || 0)}</span>
                        ${t.discount_percent > 0 ? `<span class="text-red-500 text-xs">-${t.discount_percent}%</span>` : ''}
                        <span class="text-green-600 mx-2">${formatMoney(t.master_earnings)}</span>
                    </div>
                `).join('') : '<p class="text-gray-500">Нет транзакций</p>'}
            </div>
        </div>
    `;
    
    appState.currentScreen = 'analytics';
    document.getElementById('fab-add').classList.add('hidden');
    window.scrollTo(0, 0);
}


function renderAddVisit() {
    const { servicesCatalog, settings } = appState.data;
    const defaultPercent = settings.DEFAULT_PERCENT || 50;

    const content = document.getElementById('content');
    content.innerHTML = `
    <div class="bg-white rounded-lg shadow p-4">
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-semibold">Добавить визит</h2>
            <button onclick="showScreen('dashboard')" class="text-gray-500 text-2xl">×</button>
        </div>
        <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">Дата и время</label>
            <input type="datetime-local" id="service-date" class="w-full p-3 border border-gray-300 rounded text-base"
                value="${getCurrentDateTimeLocal()}">
        </div>
        <div id="services-list" class="space-y-3"></div>
        <button onclick="addServiceRow()"
            class="w-full bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600 mt-4 text-base">+ Добавить
            услугу</button>
        <div class="mt-6 border-t pt-4">
            <div class="flex justify-between text-base mb-2">
                <span>Стоимость визита:</span>
                <span id="total-full-price" class="font-semibold">0 ₽</span>
            </div>
            <div id="total-discount" class="text-right text-sm text-red-500 mb-2 hidden"></div>
            <div class="flex justify-between text-base mb-3">
                <span>Заработок мастера:</span>
                <span id="total-master-earnings" class="font-semibold text-green-600">0 ₽</span>
            </div>
            <button onclick="handleSaveVisit()"
                class="w-full bg-green-500 text-white py-4 rounded-lg hover:bg-green-600 text-lg font-semibold">Сохранить
                визит</button>
        </div>
    </div>
    `;

    addServiceRow();
}

function addServiceRow(serviceData = {}) {
    const { servicesCatalog } = appState.data;
    const servicesList = document.getElementById('services-list');
    const rowId = Date.now() + Math.random();

    const rowDiv = document.createElement('div');
    rowDiv.className = 'service-row border rounded-lg p-3 bg-gray-50';
    rowDiv.id = `row-${rowId}`;
    rowDiv.innerHTML = `
        <div class="flex space-x-2 items-start">
            <div class="flex-grow">
                <select class="w-full p-3 border border-gray-300 rounded text-base service-select">
                    <option value="">Выберите услугу...</option>
                    ${servicesCatalog.map(s => `<option value="${s.service_id}" ${s.service_id === serviceData.service_id ? 'selected' : ''}>${s.service_name}</option>`).join('')}
                </select>
            </div>
            <button onclick="deleteServiceRow('${rowId}')" class="text-red-500 hover:text-red-700 text-2xl px-3 py-2">×</button>
        </div>
        <div class="grid grid-cols-3 gap-2 mt-2">
            <div>
                <label class="block text-xs text-gray-500">Цена (₽)</label>
                <input type="number" class="w-full p-3 border border-gray-300 rounded text-base price-input" value="${serviceData.full_price || ''}" placeholder="0">
            </div>
            <div>
                <label class="block text-xs text-gray-500">Скидка (%)</label>
                <input type="number" class="w-full p-3 border border-gray-300 rounded text-base discount-percent-input" value="${serviceData.discount_percent || 0}" placeholder="0" min="0" max="100">
            </div>
            <div>
                <label class="block text-xs text-gray-500">Процент</label>
                <input type="number" class="w-full p-3 border border-gray-300 rounded text-base percent-input" value="${serviceData.master_percent || appState.data.settings.DEFAULT_PERCENT || 50}">
            </div>
        </div>
        <div class="flex justify-between items-center mt-2 text-sm">
            <span class="text-gray-500">Итого со скидкой:</span>
            <span class="font-semibold final-price-display">0 ₽</span>
        </div>
    `;

    servicesList.appendChild(rowDiv);
    attachRowListeners(rowDiv);
    updateTotals();
}

function attachRowListeners(rowDiv) {
    const select = rowDiv.querySelector('.service-select');
    const priceInput = rowDiv.querySelector('.price-input');
    const discountPercentInput = rowDiv.querySelector('.discount-percent-input');
    const percentInput = rowDiv.querySelector('.percent-input');
    const finalPriceDisplay = rowDiv.querySelector('.final-price-display');

    function updateFinalPrice() {
        const price = parseFloat(priceInput.value) || 0;
        const discountPercent = parseFloat(discountPercentInput.value) || 0;
        const discountAmount = price * (discountPercent / 100);
        const finalPrice = Math.max(0, price - discountAmount);
        finalPriceDisplay.textContent = formatMoney(finalPrice) + (discountPercent > 0 ? ` (-${discountPercent}%)` : '');
        updateTotals();
    }

    select.addEventListener('change', (e) => {
        const service = appState.data.servicesCatalog.find(s => s.service_id === e.target.value);
        if (service) {
            priceInput.value = service.base_price;
            discountPercentInput.value = 0;
            percentInput.value = appState.data.settings.DEFAULT_PERCENT || 50;
            updateFinalPrice();
        }
    });

    priceInput.addEventListener('input', updateFinalPrice);
    discountPercentInput.addEventListener('input', updateFinalPrice);
    percentInput.addEventListener('input', updateTotals);
}

function deleteServiceRow(rowId) {
    const row = document.getElementById(`row-${rowId}`);
    if (row) {
        row.remove();
        updateTotals();
    }
}

function updateTotals() {
    const rows = document.querySelectorAll('.service-row');
    let totalFull = 0;
    let totalDiscount = 0;
    let totalMaster = 0;

    rows.forEach(row => {
        const price = parseFloat(row.querySelector('.price-input').value) || 0;
        const discountPercent = parseFloat(row.querySelector('.discount-percent-input').value) || 0;
        const percent = parseFloat(row.querySelector('.percent-input').value) || 0;
        const discountAmount = price * (discountPercent / 100);
        const finalPrice = price - discountAmount;
        
        totalFull += finalPrice;
        totalDiscount += discountAmount;
        totalMaster += finalPrice * (percent / 100);
    });

    document.getElementById('total-full-price').textContent = formatMoney(totalFull);
    document.getElementById('total-master-earnings').textContent = formatMoney(totalMaster);
    
    const discountElement = document.getElementById('total-discount');
    if (discountElement) {
        if (totalDiscount > 0) {
            discountElement.textContent = `Общая скидка: ${formatMoney(totalDiscount)}`;
            discountElement.classList.remove('hidden');
        } else {
            discountElement.classList.add('hidden');
        }
    }
}

async function handleSaveVisit() {
    const rows = document.querySelectorAll('.service-row');
    const services = [];
    let hasError = false;

    rows.forEach(row => {
        const select = row.querySelector('.service-select');
        const priceInput = row.querySelector('.price-input');
        const discountPercentInput = row.querySelector('.discount-percent-input');
        const percentInput = row.querySelector('.percent-input');

        if (!select.value || !priceInput.value) {
            hasError = true;
            return;
        }

        const serviceName = select.options[select.selectedIndex]?.text || 'Без названия';
        services.push({
            service_name: serviceName,
            full_price: parseFloat(priceInput.value) || 0,
            discount_percent: parseFloat(discountPercentInput.value) || 0,
            master_percent: parseFloat(percentInput.value) || appState.data.settings.DEFAULT_PERCENT
        });
    });

    if (hasError || services.length === 0) {
        showToast('Заполните все услуги корректно');
        return;
    }

    const serviceDate = document.getElementById('service-date').value;
    if (!serviceDate) {
        showToast('Введите дату и время');
        return;
    }

    const visitData = {
        service_date: serviceDate,
        services: services
    };

    try {
        await apiCall('addVisit', visitData);
        await fetchData();
        showToast('Визит сохранен!');
        showScreen('dashboard');
    } catch (error) {
        console.error('Ошибка сохранения визита:', error);
        const pending = loadPendingSync();
        pending.push(visitData);
        savePendingSync(pending);
        showToast('Ошибка сети. Визит сохранен локально.');
        showScreen('dashboard');
    }
}

function renderHistory() {
    const { transactions, payouts } = appState.data;
    const periods = getPeriodsSummary(transactions, payouts);
    const content = document.getElementById('content');

    content.innerHTML = `
    <div class="bg-white rounded-lg shadow mb-4 sticky top-0 z-30">
        <div class="grid grid-cols-4 text-center text-sm">
            <button onclick="showScreen('dashboard')" class="py-3 text-gray-600 hover:text-blue-600">📊</button>
            <button onclick="showScreen('history')"
                class="py-3 font-semibold text-blue-600 border-b-2 border-blue-600">📅</button>
            <button onclick="showScreen('pricelist')" class="py-3 text-gray-600 hover:text-blue-600">💰</button>
            <button onclick="showScreen('catalog')" class="py-3 text-gray-600 hover:text-blue-600">⚙️</button>
        </div>
    </div>

    <div class="bg-white rounded-lg shadow p-4">
        <h2 class="text-xl font-semibold mb-4">Периоды</h2>
        <div class="space-y-3">
            ${periods.map(p => `
            <div class="border rounded-lg p-4 cursor-pointer hover:bg-gray-50"
                onclick="showScreen('periodDetail', { periodId: '${p.period_id}' })">
                <div class="flex justify-between items-center">
                    <span class="font-medium">${p.period_id === 'CURRENT' ? 'Текущий период' : p.label}</span>
                    <span class="text-base ${p.remaining_debt > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}">
                        ${formatMoney(p.remaining_debt)}
                    </span>
                </div>
                <div class="text-sm text-gray-500 mt-1 flex justify-between">
                    <span>Услуг: ${p.services_count}</span>
                    <span>Выплат: ${p.payouts_count} ${p.total_payouts > 0 ? `(${formatMoney(p.total_payouts)})` : ''}</span>
                </div>
            </div>
            `).join('')}
        </div>
    </div>
    `;
}

function renderPriceList() {
    const { servicesCatalog } = appState.data;
    const content = document.getElementById('content');

    // Нормализуем данные
    const safeCatalog = servicesCatalog.map(s => ({
        service_name: String(s.service_name || 'Без названия'),
        base_price: Number(s.base_price) || 0
    }));

    content.innerHTML = `
    <div class="bg-white rounded-lg shadow mb-4 sticky top-0 z-30">
        <div class="grid grid-cols-4 text-center text-sm">
            <button onclick="showScreen('dashboard')" class="py-3 text-gray-600 hover:text-blue-600">📊</button>
            <button onclick="showScreen('history')" class="py-3 text-gray-600 hover:text-blue-600">📅</button>
            <button onclick="showScreen('pricelist')"
                class="py-3 font-semibold text-blue-600 border-b-2 border-blue-600">💰</button>
            <button onclick="showScreen('catalog')" class="py-3 text-gray-600 hover:text-blue-600">⚙️</button>
        </div>
    </div>

    <div class="bg-white rounded-lg shadow p-4">
        <h2 class="text-xl font-semibold mb-4">Прайс-лист</h2>
        <div class="space-y-2">
            ${safeCatalog.map(s => `
            <div class="flex justify-between items-center border-b py-3">
                <span class="font-medium">${s.service_name}</span>
                <span class="text-lg font-semibold">${formatMoney(s.base_price)}</span>
            </div>
            `).join('')}
        </div>
        <button onclick="showScreen('catalog')" class="w-full bg-gray-100 text-gray-700 py-3 rounded-lg mt-4 text-base">
            Управлять услугами
        </button>
    </div>
    `;
}

function renderCatalog() {
    const { servicesCatalog, settings } = appState.data;
    const content = document.getElementById('content');

    // Проверяем и нормализуем данные
    const safeCatalog = servicesCatalog.map(s => ({
        service_id: String(s.service_id || ''),
        service_name: String(s.service_name || 'Без названия'),
        base_price: Number(s.base_price) || 0
    }));

    content.innerHTML = `
    <div class="bg-white rounded-lg shadow mb-4 sticky top-0 z-30">
        <div class="grid grid-cols-4 text-center text-sm">
            <button onclick="showScreen('dashboard')" class="py-3 text-gray-600 hover:text-blue-600">📊</button>
            <button onclick="showScreen('history')" class="py-3 text-gray-600 hover:text-blue-600">📅</button>
            <button onclick="showScreen('pricelist')" class="py-3 text-gray-600 hover:text-blue-600">💰</button>
            <button onclick="showScreen('catalog')"
                class="py-3 font-semibold text-blue-600 border-b-2 border-blue-600">⚙️</button>
        </div>
    </div>

    <div class="space-y-4">
        <div class="bg-white rounded-lg shadow p-4">
            <h2 class="text-xl font-semibold mb-4">Настройки</h2>
            <div class="space-y-3">
                <div>
                    <label class="block text-sm text-gray-600 mb-1">Базовый процент мастера</label>
                    <input type="number" id="default-percent" value="${settings.DEFAULT_PERCENT || 50}"
                        class="w-full p-3 border border-gray-300 rounded text-base">
                </div>
                <button onclick="saveSettings()"
                    class="w-full bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600 text-base">
                    Сохранить настройки
                </button>
            </div>
        </div>

        <div class="bg-white rounded-lg shadow p-4">
            <h2 class="text-xl font-semibold mb-4">Управление услугами</h2>
            <div class="space-y-2">
                ${safeCatalog.map(s => `
                <div class="flex justify-between items-center border-b py-3">
                    <div class="flex-grow">
                        <p class="font-medium">${s.service_name}</p>
                        <p class="text-sm text-gray-500">${formatMoney(s.base_price)}</p>
                    </div>
                    <div class="flex space-x-1">
                        <button onclick="showCatalogEditModal('${s.service_id}', '${s.service_name.replace(/'/g, "\\'")}', ${s.base_price})"
                            class="text-blue-500 hover:text-blue-700 text-xl px-3 py-2">✎</button>
                        <button onclick="handleDeleteService('${s.service_id}')"
                            class="text-red-500 hover:text-red-700 text-xl px-3 py-2">×</button>
                    </div>
                </div>
                `).join('')}
            </div>
            <button onclick="showCatalogEditModal()"
                class="w-full bg-green-500 text-white py-3 rounded-lg hover:bg-green-600 mt-4 text-base">
                + Добавить услугу
            </button>
        </div>

        <!-- НОВЫЙ БЛОК: Системные операции -->
        <div class="bg-white rounded-lg shadow p-4">
            <h2 class="text-xl font-semibold mb-4">Системные операции</h2>
            <p class="text-sm text-gray-500 mb-3">Осторожно! Эти действия могут повлиять на данные.</p>
            <button onclick="handleRevertLastAction()"
                class="w-full bg-red-500 text-white py-3 rounded-lg hover:bg-red-600 text-base">
                ↩️ Отменить последнее действие
            </button>
        </div>
    </div>
    `;
}

function showCatalogEditModal(serviceId = null, serviceName = '', basePrice = 0) {
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    const isEdit = serviceId !== null;

    modalContent.innerHTML = `
    <h3 class="text-lg font-semibold mb-4">${isEdit ? 'Изменить услугу' : 'Новая услуга'}</h3>
    <input type="hidden" id="edit-service-id" value="${serviceId || ''}">
    <div class="mb-3">
        <label class="block text-sm text-gray-600 mb-1">Название</label>
        <input type="text" id="edit-service-name" class="w-full p-3 border border-gray-300 rounded text-base"
            value="${serviceName}">
    </div>
    <div class="mb-4">
        <label class="block text-sm text-gray-600 mb-1">Базовая цена (₽)</label>
        <input type="number" id="edit-service-price" class="w-full p-3 border border-gray-300 rounded text-base"
            value="${basePrice}">
    </div>
    <button onclick="handleCatalogSave(${isEdit})"
        class="w-full bg-green-500 text-white py-3 rounded-lg hover:bg-green-600 text-base font-medium">
        Сохранить
    </button>
    `;
    modal.classList.remove('hidden');
}

async function handleCatalogSave(isEdit) {
    const serviceId = document.getElementById('edit-service-id').value;
    const serviceName = document.getElementById('edit-service-name').value.trim();
    const basePrice = parseFloat(document.getElementById('edit-service-price').value) || 0;

    if (!serviceName) {
        showToast('Введите название услуги');
        return;
    }

    try {
        const action = isEdit ? 'update' : 'create';
        await apiCall('manageCatalog', {
            catalog_action: action,
            service_id: serviceId,
            service_name: serviceName,
            base_price: basePrice
        });
        await fetchData();
        closeModal();
        showScreen('catalog');
        showToast(isEdit ? 'Услуга обновлена' : 'Услуга добавлена');
    } catch (e) {
        showToast('Ошибка: ' + e.message);
    }
}

async function handleDeleteService(serviceId) {
    if (confirm('Удалить услугу из каталога? Исторические записи не будут затронуты.')) {
        try {
            await apiCall('manageCatalog', {
                catalog_action: 'delete',
                service_id: serviceId
            });
            await fetchData();
            showScreen('catalog');
            showToast('Услуга удалена');
        } catch (e) {
            showToast('Ошибка: ' + e.message);
        }
    }
}

async function saveSettings() {
    const newPercent = parseInt(document.getElementById('default-percent').value);
    if (newPercent > 0 && newPercent <= 100) {
        try {
            await apiCall('manageCatalog', {
                catalog_action: 'update_settings',
                default_percent: newPercent
            });
            appState.data.settings.DEFAULT_PERCENT = newPercent;
            showToast('Настройки сохранены');
            showScreen('catalog');
        } catch (e) {
            showToast('Ошибка: ' + e.message);
        }
    } else {
        showToast('Процент должен быть от 1 до 100');
    }
}

async function handleRevertLastAction() {
    if (confirm('Отменить последнее действие? Это может повлиять на данные.')) {
        try {
            const result = await apiCall('revertLastAction');
            await fetchData();
            showToast(result.message || 'Действие отменено');
            showScreen('catalog');
        } catch (e) {
            showToast('Ошибка: ' + e.message);
        }
    }
}

function renderPeriodDetail(periodId) {
    const { transactions, payouts, settings } = appState.data;
    const periodTransactions = transactions.filter(t => t.period_id === periodId);
    const periodPayouts = payouts.filter(p => p.period_id === periodId);

    const totalServiceCost = periodTransactions.reduce((sum, t) => sum + (t.final_price || t.full_price || 0), 0);
    const totalDiscount = periodTransactions.reduce((sum, t) => sum + (t.discount || 0), 0);
    const totalMasterEarnings = periodTransactions.reduce((sum, t) => sum + t.master_earnings, 0);
    const totalPayouts = periodPayouts.reduce((sum, p) => sum + p.amount, 0);
    const remainingDebt = totalMasterEarnings - totalPayouts;

    const groupedByDate = {};
    periodTransactions.forEach(t => {
        const dateKey = new Date(t.service_date).toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
        if (!groupedByDate[dateKey]) groupedByDate[dateKey] = [];
        groupedByDate[dateKey].push(t);
    });

    const isCurrent = periodId === 'CURRENT';
    const content = document.getElementById('content');
    content.innerHTML = `
    <div class="bg-white rounded-lg shadow p-4">
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-semibold">${isCurrent ? 'Текущий период' : 'Отчет'}</h2>
            <button onclick="showScreen('history')" class="text-blue-500 text-base px-3 py-2">← Назад</button>
        </div>

        <div class="space-y-2 text-base">
            <p>Диапазон: <span class="font-medium">${getPeriodDateRange(periodTransactions)}</span></p>
            <p>Общая стоимость: <span class="font-medium">${formatMoney(totalServiceCost)}</span></p>
            ${totalDiscount > 0 ? `<p class="text-red-500">Скидки: <span class="font-medium">-${formatMoney(totalDiscount)}</span></p>` : ''}
            <p>Сумма мастеру: <span class="font-medium text-green-600">${formatMoney(totalMasterEarnings)}</span></p>
            <p>Выплаты: <span class="font-medium text-blue-600">${formatMoney(totalPayouts)}</span></p>
            <p class="text-lg font-bold ${remainingDebt > 0 ? 'text-red-600' : 'text-green-600'}">Остаток:
                ${formatMoney(remainingDebt)}</p>
        </div>

        ${isCurrent ? `
        <div class="mt-4 p-3 bg-yellow-50 rounded-lg">
            <p class="text-sm text-yellow-800">Это текущий период. Вы можете редактировать транзакции.</p>
        </div>
        ` : ''}

        <div class="mt-4">
            <h3 class="font-semibold mb-2">Выплаты</h3>
            ${periodPayouts.length > 0 ? periodPayouts.map(p => `
            <div class="flex justify-between text-base border-b py-2">
                <span>${new Date(p.date).toLocaleDateString('ru-RU')}</span>
                <span class="font-medium">${formatMoney(p.amount)}</span>
                ${p.comment ? `<span class="text-sm text-gray-500">${p.comment}</span>` : ''}
            </div>
            `).join('') : '<p class="text-gray-500">Нет выплат</p>'}
        </div>

        ${!isCurrent && remainingDebt > 0 ? `
        <button onclick="showPayoutModal('${periodId}', ${remainingDebt})"
            class="w-full bg-green-500 text-white py-3 rounded-lg hover:bg-green-600 mt-4 text-base">
            Внести оплату
        </button>
        ` : ''}

        <div class="mt-6">
            <h3 class="font-semibold mb-3">Услуги</h3>
            ${Object.entries(groupedByDate).map(([date, services]) => `
            <div class="mb-3">
                <p class="text-sm text-gray-500 mb-1">${date}</p>
                ${services.map(s => `
                <div class="flex justify-between items-center py-2 border-b text-sm ${isCurrent ? 'hover:bg-gray-50 cursor-pointer' : ''}"
                    ${isCurrent ? `onclick="editTransaction('${s.id}')" ` : ''}>
                    <span class="flex-grow">${s.service_name}</span>
                    <span class="font-medium mx-2">${formatMoney(s.full_price || 0)}</span>
                    ${s.discount > 0 ? `<span class="text-red-500 text-xs">-${formatMoney(s.discount)}</span>` : ''}
                    <span class="text-xs ${s.master_percent !== settings.DEFAULT_PERCENT ? 'bg-yellow-100 text-yellow-800 px-2 py-1 rounded' : 'text-gray-400'}">${s.master_percent}%</span>
                    <span class="text-green-600 font-medium mx-2">${formatMoney(s.master_earnings)}</span>
                    ${isCurrent ? '<span class="text-blue-500">✎</span>' : ''}
                </div>
                `).join('')}
            </div>
            `).join('')}
        </div>
    </div>
    `;
}

function showPayoutModal(periodId, remainingDebt) {
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML = `
    <h3 class="text-lg font-semibold mb-4">Внести оплату</h3>
    <p class="mb-3">Остаток долга: <span class="font-bold">${formatMoney(remainingDebt)}</span></p>

    <button onclick="handleFullPayout('${periodId}', ${remainingDebt})"
        class="w-full bg-green-500 text-white py-3 rounded-lg mb-2 text-base">
        Погасить полностью
    </button>

    <div class="flex space-x-2 mb-2">
        <input type="number" id="manual-amount" placeholder="Сумма"
            class="flex-grow p-3 border border-gray-300 rounded text-base">
        <button onclick="handleManualPayout('${periodId}')"
            class="bg-blue-500 text-white px-4 py-3 rounded-lg text-base">Внести</button>
    </div>

    <div class="mb-3">
        <label class="block text-sm text-gray-600 mb-1">Комментарий</label>
        <input type="text" id="payout-comment" placeholder="Например: наличные из кассы"
            class="w-full p-3 border border-gray-300 rounded text-base">
    </div>
    `;
    modal.classList.remove('hidden');
}

async function handleFullPayout(periodId, amount) {
    const comment = document.getElementById('payout-comment')?.value || '';
    await handlePayout(periodId, amount, comment);
}

async function handleManualPayout(periodId) {
    const amount = parseFloat(document.getElementById('manual-amount').value);
    const comment = document.getElementById('payout-comment')?.value || '';
    if (amount > 0) {
        await handlePayout(periodId, amount, comment);
    } else {
        showToast('Введите корректную сумму');
    }
}

async function handlePayout(periodId, amount, comment = '') {
    try {
        await apiCall('addPayout', {
            period_id: periodId,
            amount: amount,
            comment: comment
        });
        await fetchData();
        closeModal();
        showScreen('periodDetail', { periodId: periodId });
        showToast('Оплата внесена');
    } catch (e) {
        showToast('Ошибка: ' + e.message);
    }
}

// ===================== РАСЧЕТЫ =====================
function calculateTotalDebt(transactions, payouts) {
    const closedTransactionsTotal = transactions
        .filter(t => t.period_id !== 'CURRENT')
        .reduce((sum, t) => sum + t.master_earnings, 0);
    const payoutsTotal = payouts.reduce((sum, p) => sum + p.amount, 0);
    return Math.max(0, closedTransactionsTotal - payoutsTotal);
}

function calculateCurrentPeriodEarnings(transactions) {
    return transactions
        .filter(t => t.period_id === 'CURRENT')
        .reduce((sum, t) => sum + t.master_earnings, 0);
}

function calculateCalendarEarnings(transactions, period) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let filtered = [];

    if (period === 'today') {
        filtered = transactions.filter(t => new Date(t.service_date) >= todayStart);
    } else if (period === 'month') {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        filtered = transactions.filter(t => new Date(t.service_date) >= monthStart);
    } else if (period === 'year') {
        const yearStart = new Date(now.getFullYear(), 0, 1);
        filtered = transactions.filter(t => new Date(t.service_date) >= yearStart);
    }

    return filtered.reduce((sum, t) => sum + t.master_earnings, 0);
}

function getPeriodsSummary(transactions, payouts) {
    const periodsMap = new Map();

    periodsMap.set('CURRENT', {
        period_id: 'CURRENT',
        label: 'Текущий',
        services_count: 0,
        payouts_count: 0,
        total_payouts: 0,
        remaining_debt: 0,
        status: 'Открыт'
    });

    transactions.forEach(t => {
        if (!periodsMap.has(t.period_id)) {
            periodsMap.set(t.period_id, {
                period_id: t.period_id,
                label: t.period_id.replace('PERIOD_', '').replace(/_/g, ' '),
                services_count: 0,
                payouts_count: 0,
                total_payouts: 0,
                remaining_debt: 0,
                status: 'Ожидает оплаты'
            });
        }
        const period = periodsMap.get(t.period_id);
        period.services_count++;
        period.remaining_debt += (t.master_earnings || 0);
    });

    payouts.forEach(p => {
        if (!periodsMap.has(p.period_id)) {
            periodsMap.set(p.period_id, {
                period_id: p.period_id,
                label: p.period_id.replace('PERIOD_', '').replace(/_/g, ' '),
                services_count: 0,
                payouts_count: 0,
                total_payouts: 0,
                remaining_debt: 0,
                status: 'Ожидает оплаты'
            });
        }
        const period = periodsMap.get(p.period_id);
        period.payouts_count++;
        period.total_payouts += p.amount;
        period.remaining_debt -= p.amount;
    });

    periodsMap.forEach(period => {
        if (period.period_id === 'CURRENT') {
            period.status = 'Открыт';
        } else {
            if (period.remaining_debt <= 0) {
                period.status = 'Оплачен';
            } else if (period.payouts_count > 0) {
                period.status = 'Частично оплачен';
            } else {
                period.status = 'Ожидает оплаты';
            }
        }
    });

    return Array.from(periodsMap.values()).sort((a, b) => {
        if (a.period_id === 'CURRENT') return -1;
        if (b.period_id === 'CURRENT') return 1;
        return b.period_id.localeCompare(a.period_id);
    });
}

function getPeriodDateRange(transactions) {
    if (transactions.length === 0) return 'Нет данных';
    const dates = transactions.map(t => new Date(t.service_date));
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    return `${minDate.toLocaleDateString('ru-RU')} - ${maxDate.toLocaleDateString('ru-RU')}`;
}

// ===================== УТИЛИТЫ =====================
function formatMoney(amount) {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        maximumFractionDigits: 0
    }).format(amount);
}

function getCurrentDateTimeLocal() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function showAnalytics(period) {
    const { transactions } = appState.data;
    const now = new Date();
    let startDate;

    if (period === 'today') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'year') {
        startDate = new Date(now.getFullYear(), 0, 1);
    }

    const filtered = transactions.filter(t => new Date(t.service_date) >= startDate);
    const totalServices = filtered.reduce((sum, t) => sum + (t.final_price || t.full_price || 0), 0);
    const totalDiscount = filtered.reduce((sum, t) => sum + (t.discount || 0), 0);
    const totalEarnings = filtered.reduce((sum, t) => sum + t.master_earnings, 0);

    const content = document.getElementById('content');
    content.innerHTML = `
    <div class="bg-white rounded-lg shadow p-4">
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-semibold">Аналитика: ${period === 'today' ? 'Сегодня' : period === 'month' ? 'За месяц' : 'За год'}</h2>
            <button onclick="showScreen('dashboard')" class="text-blue-500">← Назад</button>
        </div>

        <div class="space-y-2 text-base mb-4">
            <p>Услуг оказано: <span class="font-medium">${filtered.length}</span></p>
            <p>Общая стоимость: <span class="font-medium">${formatMoney(totalServices)}</span></p>
            ${totalDiscount > 0 ? `<p>Скидки: <span class="text-red-500">-${formatMoney(totalDiscount)}</span></p>` : ''}
            <p>Заработок: <span class="font-medium text-green-600">${formatMoney(totalEarnings)}</span></p>
        </div>

        <h3 class="font-semibold mb-2">Детализация</h3>
        <div class="space-y-2">
            ${filtered.map(t => `
            <div class="flex justify-between items-center border-b py-2 text-sm">
                <span>${t.service_name}</span>
                <span>${formatMoney(t.full_price || 0)}</span>
                ${t.discount > 0 ? `<span class="text-red-500">-${formatMoney(t.discount)}</span>` : ''}
                <span class="text-green-600">${formatMoney(t.master_earnings)}</span>
            </div>
            `).join('')}
        </div>
    </div>
    `;

    appState.currentScreen = 'analytics';
    document.getElementById('fab-add').classList.add('hidden');
}

function editTransaction(transactionId) {
    const { transactions, servicesCatalog } = appState.data;
    const transaction = transactions.find(t => t.id === transactionId);

    if (!transaction) {
        showToast('Транзакция не найдена');
        return;
    }

    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML = `
    <h3 class="text-lg font-semibold mb-4">Редактировать услугу</h3>
    <div class="mb-3">
        <label class="block text-sm text-gray-600 mb-1">Услуга</label>
        <select id="edit-transaction-service" class="w-full p-3 border border-gray-300 rounded text-base">
            ${servicesCatalog.map(s => `
            <option value="${s.service_name}" ${s.service_name === transaction.service_name ? 'selected' : ''}>
                ${s.service_name}</option>
            `).join('')}
        </select>
    </div>
    <div class="mb-3">
        <label class="block text-sm text-gray-600 mb-1">Цена (₽)</label>
        <input type="number" id="edit-transaction-price" class="w-full p-3 border border-gray-300 rounded text-base"
            value="${transaction.full_price || 0}">
    </div>
    <div class="mb-3">
        <label class="block text-sm text-gray-600 mb-1">Скидка (₽)</label>
        <input type="number" id="edit-transaction-discount" class="w-full p-3 border border-gray-300 rounded text-base"
            value="${transaction.discount || 0}">
    </div>
    <div class="mb-4">
        <label class="block text-sm text-gray-600 mb-1">Процент</label>
        <input type="number" id="edit-transaction-percent" class="w-full p-3 border border-gray-300 rounded text-base"
            value="${transaction.master_percent || 50}">
    </div>
    <div class="flex space-x-2">
        <button onclick="saveTransactionEdit('${transactionId}')"
            class="flex-grow bg-green-500 text-white py-3 rounded-lg text-base">Сохранить</button>
        <button onclick="deleteTransaction('${transactionId}')"
            class="bg-red-500 text-white px-4 py-3 rounded-lg text-base">Удалить</button>
    </div>
    `;
    modal.classList.remove('hidden');
}

async function saveTransactionEdit(transactionId) {
    const serviceName = document.getElementById('edit-transaction-service').value;
    const fullPrice = parseFloat(document.getElementById('edit-transaction-price').value) || 0;
    const discount = parseFloat(document.getElementById('edit-transaction-discount').value) || 0;
    const masterPercent = parseFloat(document.getElementById('edit-transaction-percent').value) || 50;

    try {
        await apiCall('updateTransaction', {
            transaction_id: transactionId,
            updates: {
                service_name: serviceName,
                full_price: fullPrice,
                discount: discount,
                master_percent: masterPercent
            }
        });
        await fetchData();
        closeModal();
        showScreen('periodDetail', { periodId: 'CURRENT' });
        showToast('Транзакция обновлена');
    } catch (e) {
        showToast('Ошибка: ' + e.message);
    }
}

async function deleteTransaction(transactionId) {
    if (confirm('Удалить эту услугу из периода?')) {
        try {
            await apiCall('deleteTransaction', {
                transaction_id: transactionId
            });
            await fetchData();
            closeModal();
            showScreen('periodDetail', { periodId: 'CURRENT' });
            showToast('Транзакция удалена');
        } catch (e) {
            showToast('Ошибка: ' + e.message);
        }
    }
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
    position: fixed;
    bottom: 5rem;
    left: 50%;
    transform: translateX(-50%);
    background-color: rgba(0,0,0,0.8);
    color: white;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    z-index: 60;
    transition: opacity 0.3s;
    max-width: 90%;
    text-align: center;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// ===================== ОБРАБОТЧИКИ =====================
async function handleClosePeriod() {
    if (confirm('Закрыть текущий период? Все накопленные средства будут зафиксированы.')) {
        try {
            await apiCall('closeCurrentPeriod');
            await fetchData();
            showScreen('history');
            showToast('Период закрыт');
        } catch (e) {
            showToast('Ошибка: ' + e.message);
        }
    }
}

async function initApp() {
    console.log('Инициализация приложения...');

    // Проверяем наличие токена
    if (!AUTH_TOKEN) {
        console.log('Токен не найден, показываем экран входа');
        showScreen('initialSetup');
        return;
    }

    console.log('Токен найден, загружаем данные...');

    // Показываем загрузку
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('content').classList.add('hidden');

    // Синхронизируем оффлайн-данные
    await syncPendingVisits();

    // Пытаемся загрузить данные
    try {
        await fetchData();
        console.log('Данные загружены успешно');
        showScreen('dashboard');
    } catch (e) {
        console.error('Ошибка загрузки данных:', e);
        // Если ошибка авторизации - показываем экран входа
        if (e.message.includes('авторизац') || e.message.includes('токен')) {
            localStorage.removeItem('auth_token');
            AUTH_TOKEN = '';
            showScreen('initialSetup');
        } else {
            // Другая ошибка - показываем сообщение
            showScreen('initialSetup');
        }
    }
}

// Глобальные функции
window.showScreen = showScreen;
window.closeModal = closeModal;
window.addServiceRow = addServiceRow;
window.deleteServiceRow = deleteServiceRow;
window.handleSaveVisit = handleSaveVisit;
window.handleClosePeriod = handleClosePeriod;
window.handleInitialize = handleInitialize;
window.showPayoutModal = showPayoutModal;
window.handleFullPayout = handleFullPayout;
window.handleManualPayout = handleManualPayout;
window.showCatalogEditModal = showCatalogEditModal;
window.handleCatalogSave = handleCatalogSave;
window.handleDeleteService = handleDeleteService;
window.saveSettings = saveSettings;
window.handleRevertLastAction = handleRevertLastAction;
window.showAnalytics = showAnalytics;
window.editTransaction = editTransaction;
window.saveTransactionEdit = saveTransactionEdit;
window.deleteTransaction = deleteTransaction;
window.showAnalytics = showAnalytics;
window.showCustomPeriodModal = showCustomPeriodModal;
window.applyCustomPeriod = applyCustomPeriod;
window.renderAnalytics = renderAnalytics;

document.addEventListener('DOMContentLoaded', initApp);

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => {
            console.log('Service Worker registration failed: ', err);
        });
    });
}
