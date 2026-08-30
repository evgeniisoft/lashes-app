// ===================== КОНФИГУРАЦИЯ И СОСТОЯНИЕ =====================
const API_URL = 'https://script.google.com/macros/s/AKfycbzDZWaNyyU2S-Ipg-iVYDNJD84CfxkirrKPtkDq7gfFcPd3S1nUsg2D-k6YT6i0BNxG-g/exec';
const AUTH_TOKEN = 'irina2026';

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
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
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
        console.log('Все визиты синхронизированы.');
        showToast('Данные обновлены');
    }
}

async function fetchData() {
    try {
        const data = await apiCall('getData');
        appState.data = data;
        console.log('Данные обновлены:', data);
    } catch (error) {
        console.error('Не удалось получить данные:', error);
        showToast('Ошибка загрузки данных. Проверьте токен и URL.');
    }
}

// ===================== ЭКРАНЫ И ОТОБРАЖЕНИЕ =====================
function showScreen(screenName, params = {}) {
    appState.currentScreen = screenName;
    
    if (screenName === 'dashboard') renderDashboard();
    else if (screenName === 'addVisit') renderAddVisit();
    else if (screenName === 'history') renderHistory();
    else if (screenName === 'catalog') renderCatalog();
    else if (screenName === 'periodDetail') renderPeriodDetail(params.periodId);
    else if (screenName === 'initialSetup') renderInitialSetup();
    
    // Управление кнопкой FAB
    const fab = document.getElementById('fab-add');
    if (screenName === 'dashboard') {
        fab.classList.remove('hidden');
    } else {
        fab.classList.add('hidden');
    }
    
    window.scrollTo(0, 0);
}

function renderInitialSetup() {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="bg-white rounded-lg shadow p-6">
            <h2 class="text-xl font-semibold mb-4">Первоначальная настройка</h2>
            <p class="text-sm text-gray-600 mb-4">Введите ваш секретный токен и нажмите "Инициализировать". Это создаст структуру в Google Таблице.</p>
            <input type="password" id="auth-token-input" placeholder="Токен" 
                class="w-full p-2 border border-gray-300 rounded mb-3" value="${AUTH_TOKEN}">
            <button onclick="handleInitialize()" 
                class="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600">Инициализировать</button>
        </div>
    `;
    
    document.getElementById('loading').classList.add('hidden');
    content.classList.remove('hidden');
}

async function handleInitialize() {
    const token = document.getElementById('auth-token-input').value.trim();
    if (token) {
        try {
            await apiCall('initializeStorage');
            await fetchData();
            showToast('Хранилище инициализировано!');
            showScreen('dashboard');
        } catch (e) {
            showToast('Ошибка инициализации: ' + e.message);
        }
    } else {
        showToast('Введите токен');
    }
}

function renderDashboard() {
    const { transactions, payouts, settings } = appState.data;
    const content = document.getElementById('content');
    const loading = document.getElementById('loading');
    
    loading.classList.add('hidden');
    content.classList.remove('hidden');
    
    // Расчеты
    const totalDebt = calculateTotalDebt(transactions, payouts);
    const currentPeriodEarnings = calculateCurrentPeriodEarnings(transactions);
    const todayEarnings = calculateCalendarEarnings(transactions, 'today');
    const monthEarnings = calculateCalendarEarnings(transactions, 'month');
    const yearEarnings = calculateCalendarEarnings(transactions, 'year');
    
    content.innerHTML = `
        <!-- Навигационное меню -->
        <div class="bg-white rounded-lg shadow mb-4">
            <div class="grid grid-cols-3 text-center text-sm">
                <button onclick="showScreen('dashboard')" class="py-3 font-semibold text-blue-600 border-b-2 border-blue-600">
                    📊 Дашборд
                </button>
                <button onclick="showScreen('history')" class="py-3 text-gray-600 hover:text-blue-600">
                    📅 Периоды
                </button>
                <button onclick="showScreen('catalog')" class="py-3 text-gray-600 hover:text-blue-600">
                    ⚙️ Настройки
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
                    <p class="text-sm text-gray-500">Накоплено в текущем периоде</p>
                    <p class="text-xl font-semibold">${formatMoney(currentPeriodEarnings)}</p>
                </div>
                <button onclick="handleClosePeriod()" class="bg-yellow-500 text-white px-4 py-2 rounded-lg hover:bg-yellow-600">Закрыть</button>
            </div>
            
            <!-- Календарная аналитика -->
            <div class="bg-white rounded-lg shadow p-5">
                <p class="text-sm text-gray-500 mb-3">Доход по календарю</p>
                <div class="grid grid-cols-3 gap-3 text-center">
                    <div>
                        <p class="text-xs text-gray-400">Сегодня</p>
                        <p class="font-semibold">${formatMoney(todayEarnings)}</p>
                    </div>
                    <div>
                        <p class="text-xs text-gray-400">За месяц</p>
                        <p class="font-semibold">${formatMoney(monthEarnings)}</p>
                    </div>
                    <div>
                        <p class="text-xs text-gray-400">За год</p>
                        <p class="font-semibold">${formatMoney(yearEarnings)}</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderAddVisit() {
    const { servicesCatalog, settings } = appState.data;
    const defaultPercent = settings.DEFAULT_PERCENT || 50;
    
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="bg-white rounded-lg shadow p-4">
            <h2 class="text-xl font-semibold mb-4">Добавить визит</h2>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Дата и время</label>
                <input type="datetime-local" id="service-date" class="w-full p-2 border border-gray-300 rounded" 
                    value="${getCurrentDateTimeLocal()}">
            </div>
            <div id="services-list" class="space-y-3"></div>
            <button onclick="addServiceRow()" class="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 mt-4">+ Добавить услугу</button>
            <div class="mt-6 border-t pt-4">
                <div class="flex justify-between text-sm">
                    <span>Итого стоимость визита:</span>
                    <span id="total-full-price" class="font-semibold">0 ₽</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span>Итого заработок мастера:</span>
                    <span id="total-master-earnings" class="font-semibold text-green-600">0 ₽</span>
                </div>
                <button onclick="handleSaveVisit()" class="w-full bg-green-500 text-white py-3 rounded-lg hover:bg-green-600 mt-4 font-semibold">Сохранить визит</button>
            </div>
        </div>
    `;
    
    // Добавляем первую строку услуги по умолчанию
    addServiceRow();
}

function addServiceRow(serviceData = {}) {
    const { servicesCatalog } = appState.data;
    const servicesList = document.getElementById('services-list');
    const rowId = Date.now();
    
    const rowDiv = document.createElement('div');
    rowDiv.className = 'service-row border-b pb-2';
    rowDiv.id = `row-${rowId}`;
    rowDiv.innerHTML = `
        <div class="flex space-x-2 items-end">
            <div class="flex-grow">
                <label class="block text-xs text-gray-400">Услуга</label>
                <select class="w-full p-2 border border-gray-300 rounded service-select">
                    <option value="">Выберите услугу...</option>
                    ${servicesCatalog.map(s => `<option value="${s.service_id}" ${s.service_id === serviceData.service_id ? 'selected' : ''}>${s.service_name}</option>`).join('')}
                </select>
            </div>
            <button onclick="deleteServiceRow('${rowId}')" class="text-red-500 hover:text-red-700 px-2 py-1">✕</button>
        </div>
        <div class="grid grid-cols-2 gap-2 mt-2">
            <div>
                <label class="block text-xs text-gray-400">Цена (₽)</label>
                <input type="number" class="w-full p-2 border border-gray-300 rounded price-input" value="${serviceData.full_price || ''}">
            </div>
            <div>
                <label class="block text-xs text-gray-400">Процент</label>
                <input type="number" class="w-full p-2 border border-gray-300 rounded percent-input" value="${serviceData.master_percent || appState.data.settings.DEFAULT_PERCENT || 50}">
            </div>
        </div>
    `;
    
    servicesList.appendChild(rowDiv);
    attachRowListeners(rowDiv);
    updateTotals();
}

function attachRowListeners(rowDiv) {
    const select = rowDiv.querySelector('.service-select');
    const priceInput = rowDiv.querySelector('.price-input');
    const percentInput = rowDiv.querySelector('.percent-input');
    
    select.addEventListener('change', (e) => {
        const service = appState.data.servicesCatalog.find(s => s.service_id === e.target.value);
        if (service) {
            priceInput.value = service.base_price;
            percentInput.value = appState.data.settings.DEFAULT_PERCENT || 50;
            updateTotals();
        }
    });
    
    priceInput.addEventListener('input', updateTotals);
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
    let totalMaster = 0;
    
    rows.forEach(row => {
        const price = parseFloat(row.querySelector('.price-input').value) || 0;
        const percent = parseFloat(row.querySelector('.percent-input').value) || 0;
        totalFull += price;
        totalMaster += price * (percent / 100);
    });
    
    document.getElementById('total-full-price').textContent = formatMoney(totalFull);
    document.getElementById('total-master-earnings').textContent = formatMoney(totalMaster);
}

async function handleSaveVisit() {
    const rows = document.querySelectorAll('.service-row');
    const services = [];
    let hasError = false;
    
    rows.forEach(row => {
        const select = row.querySelector('.service-select');
        const priceInput = row.querySelector('.price-input');
        const percentInput = row.querySelector('.percent-input');
        
        if (!select.value || !priceInput.value) {
            hasError = true;
            return;
        }
        
        const serviceName = select.options[select.selectedIndex]?.text || 'Без названия';
        services.push({
            service_name: serviceName,
            full_price: parseFloat(priceInput.value) || 0,
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
        // Сохраняем в локальную очередь для оффлайн-синхронизации
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
        <!-- Навигационное меню -->
        <div class="bg-white rounded-lg shadow mb-4">
            <div class="grid grid-cols-3 text-center text-sm">
                <button onclick="showScreen('dashboard')" class="py-3 text-gray-600 hover:text-blue-600">
                    📊 Дашборд
                </button>
                <button onclick="showScreen('history')" class="py-3 font-semibold text-blue-600 border-b-2 border-blue-600">
                    📅 Периоды
                </button>
                <button onclick="showScreen('catalog')" class="py-3 text-gray-600 hover:text-blue-600">
                    ⚙️ Настройки
                </button>
            </div>
        </div>
        
        <div class="bg-white rounded-lg shadow p-4">
            <h2 class="text-xl font-semibold mb-4">Периоды</h2>
            <div class="space-y-3">
                ${periods.map(p => `
                <div class="border rounded-lg p-3 cursor-pointer hover:bg-gray-50" onclick="showScreen('periodDetail', { periodId: '${p.period_id}' })">
                    <div class="flex justify-between items-center">
                        <span class="font-medium">${p.period_id === 'CURRENT' ? 'Текущий период' : p.label}</span>
                        <span class="text-sm ${p.remaining_debt > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}">
                            ${formatMoney(p.remaining_debt)}
                        </span>
                    </div>
                    <div class="text-xs text-gray-500 mt-1">
                        Услуг: ${p.services_count} | Выплат: ${p.payouts_count} | Статус: ${p.status}
                    </div>
                </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderPeriodDetail(periodId) {
    const { transactions, payouts, settings } = appState.data;
    const periodTransactions = transactions.filter(t => t.period_id === periodId);
    const periodPayouts = payouts.filter(p => p.period_id === periodId);
    
    const totalServiceCost = periodTransactions.reduce((sum, t) => sum + t.full_price, 0);
    const totalMasterEarnings = periodTransactions.reduce((sum, t) => sum + t.master_earnings, 0);
    const totalPayouts = periodPayouts.reduce((sum, p) => sum + p.amount, 0);
    const remainingDebt = totalMasterEarnings - totalPayouts;
    
    // Группировка по дням
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
    
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="bg-white rounded-lg shadow p-4">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-semibold">Отчет</h2>
                <button onclick="showScreen('history')" class="text-blue-500">Назад</button>
            </div>
            
            <div class="space-y-2 text-sm">
                <p>Период: <span class="font-medium">${periodId === 'CURRENT' ? 'Текущий' : periodId}</span></p>
                <p>Диапазон дат: <span class="font-medium">${getPeriodDateRange(periodTransactions)}</span></p>
                <p>Общая стоимость услуг: <span class="font-medium">${formatMoney(totalServiceCost)}</span></p>
                <p>Сумма мастеру: <span class="font-medium text-green-600">${formatMoney(totalMasterEarnings)}</span></p>
                <p>Выплаты: <span class="font-medium text-blue-600">${formatMoney(totalPayouts)}</span></p>
                <p class="text-lg font-bold ${remainingDebt > 0 ? 'text-red-600' : 'text-green-600'}">Остаток долга: ${formatMoney(remainingDebt)}</p>
            </div>
            
            <!-- История выплат -->
            <div class="mt-4">
                <h3 class="font-semibold mb-2">История выплат</h3>
                ${periodPayouts.length > 0 ? periodPayouts.map(p => `
                <div class="flex justify-between text-sm border-b py-2">
                    <span>${new Date(p.date).toLocaleDateString('ru-RU')}</span>
                    <span class="font-medium">${formatMoney(p.amount)}</span>
                    ${p.comment ? `<span class="text-xs text-gray-500">${p.comment}</span>` : ''}
                </div>
                `).join('') : '<p class="text-sm text-gray-500">Нет выплат</p>'}
            </div>
            
            <!-- Кнопка внесения оплаты -->
            ${remainingDebt > 0 && periodId !== 'CURRENT' ? `
            <button onclick="showPayoutModal('${periodId}', ${remainingDebt})" 
                class="w-full bg-green-500 text-white py-2 rounded-lg hover:bg-green-600 mt-4">Внести оплату</button>
            ` : ''}
            
            <!-- Лента услуг -->
            <div class="mt-6">
                <h3 class="font-semibold mb-3">Услуги</h3>
                ${Object.entries(groupedByDate).map(([date, services]) => `
                <div class="mb-3">
                    <p class="text-xs text-gray-500 mb-1">${date}</p>
                    ${services.map(s => `
                    <div class="flex justify-between items-center py-1 border-b">
                        <span class="text-sm">${s.service_name}</span>
                        <span class="text-sm font-medium">${formatMoney(s.full_price)}</span>
                        <span class="text-xs ${s.master_percent !== settings.DEFAULT_PERCENT ? 'highlight-percent' : 'text-gray-400'}">${s.master_percent}%</span>
                        <span class="text-sm text-green-600">${formatMoney(s.master_earnings)}</span>
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
            class="w-full bg-green-500 text-white py-2 rounded-lg mb-2">Погасить полностью</button>
        <div class="flex space-x-2">
            <input type="number" id="manual-amount" placeholder="Сумма" class="flex-grow p-2 border border-gray-300 rounded">
            <button onclick="handleManualPayout('${periodId}')" class="bg-blue-500 text-white px-4 py-2 rounded-lg">Внести</button>
        </div>
    `;
    modal.classList.remove('hidden');
}

async function handleFullPayout(periodId, amount) {
    await handlePayout(periodId, amount);
}

async function handleManualPayout(periodId) {
    const amount = parseFloat(document.getElementById('manual-amount').value);
    if (amount > 0) {
        await handlePayout(periodId, amount);
    } else {
        showToast('Введите корректную сумму');
    }
}

async function handlePayout(periodId, amount) {
    try {
        await apiCall('addPayout', { period_id: periodId, amount: amount });
        await fetchData();
        closeModal();
        showScreen('periodDetail', { periodId: periodId });
        showToast('Оплата внесена');
    } catch (e) {
        showToast('Ошибка: ' + e.message);
    }
}

function renderCatalog() {
    const { servicesCatalog, settings } = appState.data;
    const content = document.getElementById('content');
    
    content.innerHTML = `
        <!-- Навигационное меню -->
        <div class="bg-white rounded-lg shadow mb-4">
            <div class="grid grid-cols-3 text-center text-sm">
                <button onclick="showScreen('dashboard')" class="py-3 text-gray-600 hover:text-blue-600">
                    📊 Дашборд
                </button>
                <button onclick="showScreen('history')" class="py-3 text-gray-600 hover:text-blue-600">
                    📅 Периоды
                </button>
                <button onclick="showScreen('catalog')" class="py-3 font-semibold text-blue-600 border-b-2 border-blue-600">
                    ⚙️ Настройки
                </button>
            </div>
        </div>
        
        <div class="space-y-4">
            <!-- Настройки -->
            <div class="bg-white rounded-lg shadow p-4">
                <h2 class="text-xl font-semibold mb-4">Настройки</h2>
                <div class="space-y-3">
                    <div>
                        <label class="block text-sm text-gray-600 mb-1">Базовый процент мастера</label>
                        <input type="number" id="default-percent" value="${settings.DEFAULT_PERCENT || 50}" 
                            class="w-full p-2 border border-gray-300 rounded">
                    </div>
                    <button onclick="saveSettings()" class="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600">
                        Сохранить настройки
                    </button>
                </div>
            </div>
            
            <!-- Прайс-лист -->
            <div class="bg-white rounded-lg shadow p-4">
                <h2 class="text-xl font-semibold mb-4">Прайс-лист</h2>
                <div class="space-y-2">
                    ${servicesCatalog.map(s => `
                    <div class="flex justify-between items-center border-b py-2">
                        <div>
                            <p class="font-medium">${s.service_name}</p>
                            <p class="text-sm text-gray-500">${formatMoney(s.base_price)}</p>
                        </div>
                        <div class="flex space-x-2">
                            <button onclick="showCatalogEditModal('${s.service_id}', '${s.service_name.replace(/'/g, "\\'")}', ${s.base_price})" 
                                class="text-blue-500 hover:text-blue-700">✎</button>
                            <button onclick="handleDeleteService('${s.service_id}')" 
                                class="text-red-500 hover:text-red-700">✕</button>
                        </div>
                    </div>
                    `).join('')}
                </div>
                <button onclick="showCatalogEditModal()" class="w-full bg-green-500 text-white py-2 rounded-lg hover:bg-green-600 mt-4">
                    + Добавить услугу
                </button>
            </div>
        </div>
    `;
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

function showCatalogEditModal(serviceId = null, serviceName = '', basePrice = 0) {
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    const isEdit = serviceId !== null;
    
    modalContent.innerHTML = `
        <h3 class="text-lg font-semibold mb-4">${isEdit ? 'Изменить услугу' : 'Новая услуга'}</h3>
        <input type="hidden" id="edit-service-id" value="${serviceId || ''}">
        <div class="mb-3">
            <label class="block text-sm text-gray-600">Название</label>
            <input type="text" id="edit-service-name" class="w-full p-2 border border-gray-300 rounded" value="${serviceName}">
        </div>
        <div class="mb-4">
            <label class="block text-sm text-gray-600">Базовая цена (₽)</label>
            <input type="number" id="edit-service-price" class="w-full p-2 border border-gray-300 rounded" value="${basePrice}">
        </div>
        <button onclick="handleCatalogSave(${isEdit})" class="w-full bg-green-500 text-white py-2 rounded-lg">Сохранить</button>
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
        showToast('Услуга сохранена');
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

// ===================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ РАСЧЕТОВ =====================
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
    
    // Сначала добавим текущий период
    periodsMap.set('CURRENT', {
        period_id: 'CURRENT',
        label: 'Текущий',
        services_count: 0,
        payouts_count: 0,
        remaining_debt: 0,
        status: 'Открыт'
    });
    
    // Собираем все period_id из транзакций
    transactions.forEach(t => {
        if (!periodsMap.has(t.period_id)) {
            periodsMap.set(t.period_id, {
                period_id: t.period_id,
                label: t.period_id.replace('PERIOD_', '').replace(/_/g, ' '),
                services_count: 0,
                payouts_count: 0,
                remaining_debt: 0,
                status: 'Ожидает оплаты'
            });
        }
        const period = periodsMap.get(t.period_id);
        period.services_count++;
        period.remaining_debt += t.master_earnings;
    });
    
    // Добавляем периоды из выплат
    payouts.forEach(p => {
        if (!periodsMap.has(p.period_id)) {
            periodsMap.set(p.period_id, {
                period_id: p.period_id,
                label: p.period_id.replace('PERIOD_', '').replace(/_/g, ' '),
                services_count: 0,
                payouts_count: 0,
                remaining_debt: 0,
                status: 'Ожидает оплаты'
            });
        }
        const period = periodsMap.get(p.period_id);
        period.payouts_count++;
        period.remaining_debt -= p.amount;
    });
    
    // Определяем статусы
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
        padding: 0.5rem 1rem;
        border-radius: 0.25rem;
        font-size: 0.875rem;
        z-index: 60;
        transition: opacity 0.3s;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

function closeModal() {
    document.getElementById('modal').classList.add('hidden');
}

// ===================== ОБРАБОТЧИКИ СОБЫТИЙ И ИНИЦИАЛИЗАЦИЯ =====================
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
    // Показываем загрузку
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('content').classList.add('hidden');
    
    // Синхронизируем оффлайн-данные
    await syncPendingVisits();
    
    // Пытаемся загрузить данные
    try {
        await fetchData();
        showScreen('dashboard');
    } catch (e) {
        console.error('Init error:', e);
        showScreen('initialSetup');
    }
}

// Глобальные функции для доступа из HTML
window.showScreen = showScreen;
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

// Запуск приложения
document.addEventListener('DOMContentLoaded', initApp);

// Регистрация Service Worker для PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => {
            console.log('Service Worker registration failed: ', err);
        });
    });
}
