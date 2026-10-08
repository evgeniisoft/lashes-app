/* ============================================================
   LASHES APP — APP.JS v2.2
   Мгновенная загрузка, оффлайн, салоны, редактирование
   ============================================================ */

// ==================== КОНФИГ ====================
const API_URL = 'https://script.google.com/macros/s/AKfycbzDZWaNyyU2S-Ipg-iVYDNJD84CfxkirrKPtkDq7gfFcPd3S1nUsg2D-k6YT6i0BNxG-g/exec';

const STORAGE_KEYS = {
  TOKEN: 'lash_token',
  DATA: 'lash_data',
  PENDING: 'lash_pending',
  SALON: 'lash_current_salon',
  LAST_SYNC: 'lash_last_sync'
};

// ==================== СОСТОЯНИЕ ====================
const State = {
  token: '',
  data: {
    master: { name: '', phone: '' },
    salons: [],
    totalDebt: 0,
    recentOps: [],
    services: {}
  },
  fullData: null,
  pending: [],
  currentSalonId: '',
  currentScreen: 'loading',
  network: 'online',
  draftVisit: { services: [] },
  editingSalonId: null,
  journalFilter: { salon: 'all', type: 'all' },
  reportsFilter: { salon: 'all', period: 'month', month: '' }
};

// ==================== УТИЛИТЫ ====================
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function formatMoney(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '0 ₽';
  const rounded = Math.round(amount);
  return rounded.toLocaleString('ru-RU') + ' ₽';
}

function formatDate(date) {
  const d = new Date(date);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function formatDateFull(date) {
  const d = new Date(date);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(date) {
  const d = new Date(date);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTimeLocal(date) {
  const d = date ? new Date(date) : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseMoney(str) {
  return Number(String(str).replace(/\s/g, '').replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ==================== STORAGE ====================
const Storage = {
  get(key, def = null) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : def;
    } catch (e) {
      return def;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('Storage error:', e);
    }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }
};

// ==================== API ====================
async function apiCall(action, params = {}, options = {}) {
  if (!State.token) throw new Error('Нет токена');

  const body = new URLSearchParams();
  body.append('token', State.token);
  body.append('action', action);
  Object.entries(params).forEach(([k, v]) => {
    if (typeof v === 'object' && v !== null) {
      body.append(k, JSON.stringify(v));
    } else {
      body.append(k, v);
    }
  });

  const timeout = options.timeout || 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: body.toString(),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (!data.success && data.error) throw new Error(data.error);
    return data;
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') throw new Error('Превышено время ожидания');
    throw e;
  }
}

// ==================== СЕТЬ ====================
function setNetwork(status) {
  State.network = status;
  const el = document.getElementById('sync-indicator');
  const txt = document.getElementById('sync-text');
  if (!el || !txt) return;
  el.classList.remove('online', 'syncing', 'offline');
  el.classList.add(status);
  txt.textContent = status === 'online' ? 'Синхронизировано' :
                   status === 'syncing' ? 'Синхронизация' :
                   'Офлайн';
}

async function syncData(silent = false) {
  if (!State.token) return false;
  setNetwork('syncing');

  try {
    const [quick, full] = await Promise.all([
      apiCall('getQuickData'),
      apiCall('getFullData').catch(() => null)
    ]);

    if (quick.success) {
      State.data.master = quick.master;
      State.data.salons = quick.salons;
      State.data.totalDebt = quick.totalDebt;
      State.data.recentOps = quick.recentOps;
    }

    if (full && full.success) {
      State.fullData = {
        transactions: full.transactions,
        payouts: full.payouts,
        salons: full.salons
      };
    }

    Storage.set(STORAGE_KEYS.DATA, State.data);
    if (State.fullData) Storage.set(STORAGE_KEYS.DATA + '_full', State.fullData);
    Storage.set(STORAGE_KEYS.LAST_SYNC, Date.now());

    setNetwork('online');
    return true;
  } catch (e) {
    console.error('Sync error:', e);
    setNetwork('offline');
    return false;
  }
}

// ==================== СИНХРОНИЗАЦИЯ ОЧЕРЕДИ ====================
async function flushPending() {
  const pending = Storage.get(STORAGE_KEYS.PENDING, []);
  if (pending.length === 0) return;

  const remaining = [];
  for (const op of pending) {
    try {
      if (op.type === 'add_visit') {
        await apiCall('addVisit', { payload: op.payload });
      } else if (op.type === 'add_payout') {
        await apiCall('addPayout', { payload: op.payload });
      }
    } catch (e) {
      console.error('Pending error:', e);
      op.attempts = (op.attempts || 0) + 1;
      remaining.push(op);
    }
  }

  Storage.set(STORAGE_KEYS.PENDING, remaining);
}

function addPending(op) {
  const pending = Storage.get(STORAGE_KEYS.PENDING, []);
  pending.push(op);
  Storage.set(STORAGE_KEYS.PENDING, pending);
}

// ==================== ГЛАВНЫЙ РОУТЕР ====================
const App = {
  go(screen) {
    if (screen === 'loading' || screen === 'auth') {
      showScreen(screen);
      return;
    }
    if (!State.token) {
      showScreen('auth');
      return;
    }

    State.currentScreen = screen;

    if (screen === 'home') {
      renderHome();
    } else if (screen === 'add-visit') {
      renderAddVisit();
    } else if (screen === 'payout') {
      renderPayout();
    } else if (screen === 'journal') {
      renderJournal();
    } else if (screen === 'reports') {
      renderReports();
    } else if (screen === 'settings') {
      renderSettings();
    } else if (screen === 'salons') {
      renderSalons();
    } else if (screen === 'salon-edit') {
      renderSalonEdit();
    }

    showScreen(screen);
    updateBottomNav(screen);
  },

  openServicePicker() {
    renderServicePicker('visit');
    showScreen('service-picker');
  },

  addServiceToVisit(service) {
    State.draftVisit.services.push({
      service_id: service.service_id,
      service_name: service.service_name,
      full_price: service.base_price,
      discount_percent: 0,
      master_percent: App.getCurrentSalon()?.default_percent || 50
    });
    renderVisitServices();
    App.go('add-visit');
  },

  async saveVisit() {
    const btn = document.getElementById('btn-save-visit');
    const salonId = State.currentSalonId;

    if (!salonId) {
      toast('Выберите салон', 'error');
      return;
    }
    if (State.draftVisit.services.length === 0) {
      toast('Добавьте услугу', 'error');
      return;
    }

    const dateInput = document.getElementById('visit-date').value;
    const serviceDate = dateInput ? new Date(dateInput).toISOString() : new Date().toISOString();
    const clientId = uuid();

    const payload = {
      service_date: serviceDate,
      salon_id: salonId,
      client_id: clientId,
      services: State.draftVisit.services.map(s => ({
        service_name: s.service_name,
        full_price: s.full_price,
        discount_percent: s.discount_percent,
        master_percent: s.master_percent
      }))
    };

    btn.disabled = true;
    btn.innerHTML = '<div class="spinner-btn"></div><span>Сохранение...</span>';

    const optimistic = {
      id: clientId,
      type: 'visit',
      date: new Date().toISOString(),
      service_date: serviceDate,
      title: State.draftVisit.services[0].service_name,
      amount: State.draftVisit.services.reduce((sum, s) => {
        const finalPrice = s.full_price - (s.full_price * s.discount_percent / 100);
        return sum + (finalPrice * s.master_percent / 100);
      }, 0),
      salon_id: salonId,
      status: 'pending'
    };
    State.data.recentOps = [optimistic, ...State.data.recentOps].slice(0, 20);

    addPending({
      id: clientId,
      type: 'add_visit',
      payload: payload,
      created_at: Date.now(),
      attempts: 0
    });

    try {
      await apiCall('addVisit', { payload });
      optimistic.status = 'saved';
      toast('Визит сохранён', 'success');
      syncData(true);
      App.go('home');
    } catch (e) {
      console.error('Save visit error:', e);
      toast('Нет связи. Сохранено локально', 'error');
      App.go('home');
      setNetwork('offline');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="check"></i><span>Сохранить визит</span>';
      lucide.createIcons();
      State.draftVisit = { services: [] };
    }
  },

  updateVisitService(index, field, value) {
    if (!State.draftVisit.services[index]) return;
    State.draftVisit.services[index][field] = value;
    renderVisitServices();
  },

  removeVisitService(index) {
    State.draftVisit.services.splice(index, 1);
    renderVisitServices();
  },

  async savePayout() {
    const btn = document.getElementById('btn-save-payout');
    const salonId = State.currentSalonId;
    const amountInput = document.getElementById('payout-amount');
    const commentInput = document.getElementById('payout-comment');

    const amount = parseMoney(amountInput.value);
    if (!salonId) {
      toast('Выберите салон', 'error');
      return;
    }
    if (amount <= 0) {
      toast('Введите сумму', 'error');
      return;
    }

    const clientId = uuid();
    const payload = {
      salon_id: salonId,
      amount: amount,
      comment: commentInput.value.trim(),
      client_id: clientId
    };

    btn.disabled = true;
    btn.innerHTML = '<div class="spinner-btn"></div><span>Сохранение...</span>';

    const optimistic = {
      id: clientId,
      type: 'payout',
      date: new Date().toISOString(),
      title: 'Получено',
      amount: -amount,
      salon_id: salonId,
      status: 'pending'
    };
    State.data.recentOps = [optimistic, ...State.data.recentOps].slice(0, 20);

    addPending({
      id: clientId,
      type: 'add_payout',
      payload: payload,
      created_at: Date.now(),
      attempts: 0
    });

    try {
      await apiCall('addPayout', { payload });
      optimistic.status = 'saved';
      toast('Выплата сохранена', 'success');
      syncData(true);
      App.go('home');
    } catch (e) {
      console.error('Save payout error:', e);
      toast('Нет связи. Сохранено локально', 'error');
      App.go('home');
      setNetwork('offline');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="check"></i><span>Подтвердить</span>';
      lucide.createIcons();
    }
  },

  setPayoutAmount(value) {
    const input = document.getElementById('payout-amount');
    if (input) {
      if (value === 'all') {
        const salon = App.getCurrentSalon();
        input.value = salon ? Math.round(salon.debt) : 0;
      } else {
        input.value = value;
      }
    }
  },

  switchSalon(salonId) {
    State.currentSalonId = salonId;
    Storage.set(STORAGE_KEYS.SALON, salonId);
    if (State.currentScreen === 'home') {
      renderHome();
    }
  },

  getCurrentSalon() {
    return State.data.salons.find(s => s.salon_id === State.currentSalonId) || State.data.salons[0];
  },

  showProfile() {
    const name = State.data.master.name || 'Мастер';
    showModal(`
      <div class="modal-handle"></div>
      <div class="modal-title">Профиль</div>
      <div class="input-group">
        <label class="input-label">Имя</label>
        <input type="text" class="input" value="${escapeHtml(name)}" disabled>
      </div>
      <p class="text-small text-muted">Изменить имя можно в Google Таблице (лист Master)</p>
    `);
  },

  showDataStatus() {
    const lastSync = Storage.get(STORAGE_KEYS.LAST_SYNC, 0);
    const pending = Storage.get(STORAGE_KEYS.PENDING, []);
    const diff = lastSync ? Math.round((Date.now() - lastSync) / 1000) : 0;
    const timeAgo = diff < 60 ? `${diff} сек назад` :
                    diff < 3600 ? `${Math.round(diff / 60)} мин назад` :
                    `${Math.round(diff / 3600)} ч назад`;

    showModal(`
      <div class="modal-handle"></div>
      <div class="modal-title">Состояние данных</div>
      <div class="report-row">
        <span class="report-label">Последняя синхронизация</span>
        <span class="report-value" style="font-size: 15px;">${timeAgo}</span>
      </div>
      <div class="report-row">
        <span class="report-label">Не отправлено</span>
        <span class="report-value ${pending.length > 0 ? 'danger' : 'success'}" style="font-size: 15px;">${pending.length}</span>
      </div>
      <div class="report-row">
        <span class="report-label">Статус</span>
        <span class="report-value" style="font-size: 15px;">${State.network === 'online' ? 'Онлайн' : State.network === 'syncing' ? 'Синхронизация' : 'Офлайн'}</span>
      </div>
      <button class="btn btn-primary mt-16" onclick="App.forceRefresh()">
        <i data-lucide="refresh-cw"></i>
        <span>Обновить сейчас</span>
      </button>
      <button class="btn btn-secondary" onclick="App.sendPending()" ${pending.length === 0 ? 'disabled' : ''}>
        <i data-lucide="upload"></i>
        <span>Отправить ожидающие (${pending.length})</span>
      </button>
    `);
  },

  async forceRefresh() {
    closeModal();
    await flushPending();
    await syncData();
    toast('Обновлено', 'success');
    App.go(State.currentScreen);
  },

  async sendPending() {
    closeModal();
    await flushPending();
    const remaining = Storage.get(STORAGE_KEYS.PENDING, []);
    if (remaining.length === 0) {
      toast('Все отправлено', 'success');
    } else {
      toast(`Не удалось отправить ${remaining.length}`, 'error');
    }
  },

  logout() {
    if (!confirm('Выйти из приложения? Данные на устройстве будут удалены.')) return;
    Storage.remove(STORAGE_KEYS.TOKEN);
    Storage.remove(STORAGE_KEYS.DATA);
    Storage.remove(STORAGE_KEYS.DATA + '_full');
    Storage.remove(STORAGE_KEYS.SALON);
    Storage.remove(STORAGE_KEYS.PENDING);
    Storage.remove(STORAGE_KEYS.LAST_SYNC);
    State.token = '';
    State.data = {
      master: { name: '', phone: '' },
      salons: [],
      totalDebt: 0,
      recentOps: [],
      services: {}
    };
    State.fullData = null;
    State.currentSalonId = '';
    App.go('auth');
  },

  async saveSalon() {
    const nameInput = document.getElementById('salon-edit-name');
    const percentInput = document.getElementById('salon-edit-percent');
    const name = nameInput.value.trim();
    const percent = parseInt(percentInput.value) || 50;

    if (!name) {
      toast('Введите название', 'error');
      return;
    }

    const btn = document.getElementById('btn-save-salon');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner-btn"></div><span>Сохранение...</span>';

    try {
      if (State.editingSalonId) {
        await apiCall('manageSalon', {
          salon_action: 'update',
          payload: { salon_id: State.editingSalonId, name, default_percent: percent }
        });
      } else {
        await apiCall('manageSalon', {
          salon_action: 'create',
          payload: { name, default_percent: percent }
        });
      }
      await syncData();
      toast('Сохранено', 'success');
      App.go('salons');
    } catch (e) {
      toast('Ошибка: ' + e.message, 'error');
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="check"></i><span>Сохранить</span>';
      lucide.createIcons();
    }
  },

  async deleteSalon() {
    if (!State.editingSalonId) return;
    if (!confirm('Удалить салон? Данные останутся, но скроются из интерфейса.')) return;

    try {
      await apiCall('manageSalon', {
        salon_action: 'delete',
        payload: { salon_id: State.editingSalonId }
      });
      await syncData();
      toast('Удалено', 'success');
      App.go('salons');
    } catch (e) {
      toast('Ошибка: ' + e.message, 'error');
    }
  },

  editSalon(salonId) {
    State.editingSalonId = salonId;
    App.go('salon-edit');
  },

  showServicesManage() {
    const salons = State.data.salons;
    showModal(`
      <div class="modal-handle"></div>
      <div class="modal-title">Прайс-лист</div>
      <p class="text-small text-muted mb-16">Выберите салон для настройки</p>
      ${salons.map(s => `
        <div class="settings-row" onclick="App.editSalon('${s.salon_id}')">
          <div class="settings-icon"><i data-lucide="building-2"></i></div>
          <div class="settings-content">
            <div class="settings-title">${escapeHtml(s.name)}</div>
            <div class="settings-subtitle">Процент: ${s.default_percent}%</div>
          </div>
          <i data-lucide="chevron-right" class="settings-chevron"></i>
        </div>
      `).join('')}
    `);
  },

  openServicePickerForSalon() {
    renderServicePicker('salon-edit');
    showScreen('service-picker');
  },

  async saveSalonService(service) {
    try {
      await apiCall('manageService', {
        service_action: 'create',
        payload: {
          salon_id: State.editingSalonId,
          service_name: service.name,
          base_price: service.price
        }
      });
      await syncData();
      toast('Услуга добавлена', 'success');
      App.go('salon-edit');
    } catch (e) {
      toast('Ошибка: ' + e.message, 'error');
    }
  },

  // ==================== РЕДАКТИРОВАНИЕ ВИЗИТОВ ====================
  
  showVisitDetails(visitId) {
    const services = State.fullData.transactions.filter(t => t.visit_id === visitId);
    if (services.length === 0) {
      toast('Визит не найден', 'error');
      return;
    }
    
    const first = services[0];
    const totalPrice = services.reduce((sum, s) => sum + (s.final_price || s.full_price || 0), 0);
    const totalEarnings = services.reduce((sum, s) => sum + s.master_earnings, 0);
    const dateStr = formatDateFull(first.service_date) + ', ' + formatTime(first.service_date);
    
    showModal(`
      <div class="modal-handle"></div>
      <div class="modal-title">Визит</div>
      <div class="text-small text-muted mb-16">${dateStr}</div>
      
      <div class="section-title" style="margin: 0 0 8px;">Услуги</div>
      ${services.map(s => `
        <div class="service-item clickable" onclick="App.editTransaction('${s.id}')">
          <div class="service-item-main">
            <div class="service-name">${escapeHtml(s.service_name)}</div>
            <div class="service-meta">
              ${formatMoney(s.final_price || s.full_price || 0)} · ${s.discount_percent > 0 ? 'скидка ' + s.discount_percent + '% · ' : ''}${s.master_percent}%
            </div>
          </div>
          <div class="service-price">${formatMoney(s.master_earnings)}</div>
          <i data-lucide="pencil" style="width: 16px; height: 16px; margin-left: 8px; color: var(--text-3);"></i>
        </div>
      `).join('')}
      
      <div class="total-block" style="margin-top: 12px;">
        <div class="total-row">
          <span class="total-row-label">Стоимость визита</span>
          <span class="total-row-value">${formatMoney(totalPrice)}</span>
        </div>
        <div class="total-row">
          <span class="total-row-label">Заработок мастера</span>
          <span class="total-row-value income">${formatMoney(totalEarnings)}</span>
        </div>
      </div>
      
      <button class="btn btn-danger" onclick="App.confirmDeleteVisit('${visitId}')">
        <i data-lucide="trash-2"></i>
        <span>Удалить весь визит</span>
      </button>
    `);
  },
  
  editTransaction(transactionId) {
    const transaction = State.fullData.transactions.find(t => t.id === transactionId);
    if (!transaction) {
      toast('Услуга не найдена', 'error');
      return;
    }
    
    const salonId = transaction.salon_id;
    
    apiCall('getServices', { salon_id: salonId }).then(data => {
      const services = data.success ? data.services : [];
      
      showModal(`
        <div class="modal-handle"></div>
        <div class="modal-title">Редактировать услугу</div>
        
        <div class="input-group">
          <label class="input-label">Услуга</label>
          <select id="edit-tx-service" class="select">
            <option value="">— выберите —</option>
            ${services.map(s => `
              <option value="${escapeHtml(s.service_name)}" ${s.service_name === transaction.service_name ? 'selected' : ''}>
                ${escapeHtml(s.service_name)}
              </option>
            `).join('')}
          </select>
        </div>
        
        <div class="input-group">
          <label class="input-label">Цена (₽)</label>
          <input type="number" id="edit-tx-price" class="input" value="${transaction.full_price || 0}">
        </div>
        
        <div class="input-group">
          <label class="input-label">Скидка (%)</label>
          <input type="number" id="edit-tx-discount" class="input" value="${transaction.discount_percent || 0}" min="0" max="100">
        </div>
        
        <div class="input-group">
          <label class="input-label">Процент мастера</label>
          <input type="number" id="edit-tx-percent" class="input" value="${transaction.master_percent || 50}" min="1" max="100">
        </div>
        
        <div class="input-group">
          <label class="input-label">Дата и время</label>
          <input type="datetime-local" id="edit-tx-date" class="input" value="${formatDateTimeLocal(transaction.service_date)}">
        </div>
        
        <button class="btn btn-primary" onclick="App.saveTransactionEdit('${transactionId}')">
          <i data-lucide="check"></i>
          <span>Сохранить</span>
        </button>
        
        <button class="btn btn-danger" onclick="App.confirmDeleteTransaction('${transactionId}')">
          <i data-lucide="trash-2"></i>
          <span>Удалить услугу</span>
        </button>
      `);
      
      const select = document.getElementById('edit-tx-service');
      if (select) {
        select.addEventListener('change', e => {
          const selected = services.find(s => s.service_name === e.target.value);
          if (selected) {
            document.getElementById('edit-tx-price').value = selected.base_price;
          }
        });
      }
    }).catch(() => {
      toast('Ошибка загрузки каталога', 'error');
    });
  },
  
  async saveTransactionEdit(transactionId) {
    const serviceName = document.getElementById('edit-tx-service').value;
    const fullPrice = parseFloat(document.getElementById('edit-tx-price').value) || 0;
    const discountPercent = parseFloat(document.getElementById('edit-tx-discount').value) || 0;
    const masterPercent = parseFloat(document.getElementById('edit-tx-percent').value) || 50;
    const dateInput = document.getElementById('edit-tx-date').value;
    
    if (!serviceName) {
      toast('Выберите услугу', 'error');
      return;
    }
    
    const serviceDate = dateInput ? new Date(dateInput).toISOString() : undefined;
    
    showLoadingModal('Сохранение...');
    
    try {
      await apiCall('updateTransaction', {
        payload: {
          transaction_id: transactionId,
          updates: {
            service_name: serviceName,
            full_price: fullPrice,
            discount_percent: discountPercent,
            master_percent: masterPercent,
            service_date: serviceDate
          }
        }
      });
      
      const tx = State.fullData.transactions.find(t => t.id === transactionId);
      if (tx) {
        tx.service_name = serviceName;
        tx.full_price = fullPrice;
        tx.discount_percent = discountPercent;
        tx.discount_amount = fullPrice * (discountPercent / 100);
        tx.final_price = fullPrice - tx.discount_amount;
        tx.master_percent = masterPercent;
        tx.master_earnings = tx.final_price * (masterPercent / 100);
        if (serviceDate) tx.service_date = serviceDate;
      }
      
      Storage.set(STORAGE_KEYS.DATA + '_full', State.fullData);
      
      closeModal();
      toast('Сохранено', 'success');
      
      syncData(true);
      
      if (State.currentScreen === 'journal') renderJournalList();
    } catch (e) {
      toast('Ошибка: ' + e.message, 'error');
      closeModal();
    }
  },
  
  confirmDeleteTransaction(transactionId) {
    if (!confirm('Удалить эту услугу? Действие необратимо.')) return;
    
    showLoadingModal('Удаление...');
    
    apiCall('deleteTransaction', {
      payload: { transaction_id: transactionId }
    }).then(() => {
      State.fullData.transactions = State.fullData.transactions.filter(t => t.id !== transactionId);
      Storage.set(STORAGE_KEYS.DATA + '_full', State.fullData);
      
      closeModal();
      toast('Услуга удалена', 'success');
      
      syncData(true);
      
      if (State.currentScreen === 'journal') renderJournalList();
    }).catch(e => {
      toast('Ошибка: ' + e.message, 'error');
      closeModal();
    });
  },
  
  confirmDeleteVisit(visitId) {
    const count = State.fullData.transactions.filter(t => t.visit_id === visitId).length;
    if (!confirm(`Удалить весь визит (${count} услуг)? Действие необратимо.`)) return;
    
    showLoadingModal('Удаление...');
    
    apiCall('deleteVisit', {
      payload: { visit_id: visitId }
    }).then(() => {
      State.fullData.transactions = State.fullData.transactions.filter(t => t.visit_id !== visitId);
      Storage.set(STORAGE_KEYS.DATA + '_full', State.fullData);
      
      closeModal();
      toast('Визит удалён', 'success');
      
      syncData(true);
      
      if (State.currentScreen === 'journal') renderJournalList();
    }).catch(e => {
      toast('Ошибка: ' + e.message, 'error');
      closeModal();
    });
  },
  
  // ==================== РЕДАКТИРОВАНИЕ ВЫПЛАТ ====================
  
  editPayout(payoutId) {
    const payout = State.fullData.payouts.find(p => p.id === payoutId);
    if (!payout) {
      toast('Выплата не найдена', 'error');
      return;
    }
    
    showModal(`
      <div class="modal-handle"></div>
      <div class="modal-title">Редактировать выплату</div>
      
      <div class="input-group">
        <label class="input-label">Сумма (₽)</label>
        <input type="number" id="edit-payout-amount" class="input" value="${payout.amount || 0}">
      </div>
      
      <div class="input-group">
        <label class="input-label">Комментарий</label>
        <input type="text" id="edit-payout-comment" class="input" value="${escapeHtml(payout.comment || '')}" placeholder="наличными">
      </div>
      
      <div class="input-group">
        <label class="input-label">Дата</label>
        <input type="datetime-local" id="edit-payout-date" class="input" value="${formatDateTimeLocal(payout.date)}">
      </div>
      
      <button class="btn btn-primary" onclick="App.savePayoutEdit('${payoutId}')">
        <i data-lucide="check"></i>
        <span>Сохранить</span>
      </button>
      
      <button class="btn btn-danger" onclick="App.confirmDeletePayout('${payoutId}')">
        <i data-lucide="trash-2"></i>
        <span>Удалить выплату</span>
      </button>
    `);
  },
  
  async savePayoutEdit(payoutId) {
    const amount = parseFloat(document.getElementById('edit-payout-amount').value) || 0;
    const comment = document.getElementById('edit-payout-comment').value.trim();
    const dateInput = document.getElementById('edit-payout-date').value;
    
    if (amount <= 0) {
      toast('Введите сумму', 'error');
      return;
    }
    
    const date = dateInput ? new Date(dateInput).toISOString() : undefined;
    
    showLoadingModal('Сохранение...');
    
    try {
      await apiCall('updatePayout', {
        payload: {
          payout_id: payoutId,
          updates: { amount, comment, date }
        }
      });
      
      const p = State.fullData.payouts.find(x => x.id === payoutId);
      if (p) {
        p.amount = amount;
        p.comment = comment;
        if (date) p.date = date;
      }
      
      Storage.set(STORAGE_KEYS.DATA + '_full', State.fullData);
      
      closeModal();
      toast('Сохранено', 'success');
      
      syncData(true);
      
      if (State.currentScreen === 'journal') renderJournalList();
    } catch (e) {
      toast('Ошибка: ' + e.message, 'error');
      closeModal();
    }
  },
  
  confirmDeletePayout(payoutId) {
    if (!confirm('Удалить эту выплату? Действие необратимо.')) return;
    
    showLoadingModal('Удаление...');
    
    apiCall('deletePayout', {
      payload: { payout_id: payoutId }
    }).then(() => {
      State.fullData.payouts = State.fullData.payouts.filter(p => p.id !== payoutId);
      Storage.set(STORAGE_KEYS.DATA + '_full', State.fullData);
      
      closeModal();
      toast('Выплата удалена', 'success');
      
      syncData(true);
      
      if (State.currentScreen === 'journal') renderJournalList();
    }).catch(e => {
      toast('Ошибка: ' + e.message, 'error');
      closeModal();
    });
  },

  closeModal() {
    const modal = document.getElementById('modal');
    const backdrop = document.getElementById('modal-backdrop');
    if (modal) modal.classList.remove('show');
    if (backdrop) backdrop.classList.remove('show');
  }
};

// ==================== ПОКАЗ ЭКРАНА ====================
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + name);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
}

function updateBottomNav(screen) {
  const nav = document.getElementById('bottom-nav');
  if (!nav) return;
  const hideNav = ['add-visit', 'payout', 'salon-edit', 'service-picker', 'auth', 'loading'];
  if (hideNav.includes(screen)) {
    nav.style.display = 'none';
    return;
  }
  nav.style.display = 'flex';
  nav.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.nav === screen);
  });
}

// ==================== РЕНДЕР: ГЛАВНАЯ ====================
function renderHome() {
  const debtEl = document.getElementById('total-debt');
  if (debtEl) {
    debtEl.textContent = formatMoney(State.data.totalDebt);
    debtEl.classList.toggle('zero', State.data.totalDebt <= 0);
  }

  const salonList = document.getElementById('salon-list');
  if (salonList) {
    if (State.data.salons.length <= 1) {
      salonList.style.display = 'none';
    } else {
      salonList.style.display = 'flex';
      salonList.innerHTML = State.data.salons.map(s => `
        <div class="salon-item ${s.salon_id === State.currentSalonId ? 'active' : ''}" onclick="App.switchSalon('${s.salon_id}')">
          <div class="salon-item-name">
            <span class="salon-dot"></span>
            <span>${escapeHtml(s.name)}</span>
          </div>
          <div class="salon-item-amount">${formatMoney(s.debt)}</div>
        </div>
      `).join('');
    }
  }

  const opsEl = document.getElementById('recent-ops');
  if (opsEl) {
    const ops = (State.data.recentOps || []).slice(0, 5);
    if (ops.length === 0) {
      opsEl.innerHTML = `
        <div class="empty-state">
          <i data-lucide="inbox"></i>
          <div class="empty-state-text">Пока нет операций</div>
        </div>
      `;
    } else {
      opsEl.innerHTML = ops.map(op => renderOpItem(op)).join('');
    }
  }

  lucide.createIcons();
}

function renderOpItem(op) {
  const isPayout = op.type === 'payout';
  const statusClass = op.status === 'saved' ? 'check' :
                     op.status === 'pending' ? 'pending' : 'error';
  const statusIcon = op.status === 'saved' ? 'check' :
                    op.status === 'pending' ? 'clock' : 'alert-circle';
  const salon = State.data.salons.find(s => s.salon_id === op.salon_id);
  const salonName = salon ? salon.name : '';
  const date = op.service_date || op.date;
  const meta = `${salonName} · ${formatDate(date)} ${formatTime(date)}`;

  return `
    <div class="op-item" onclick="App.go('journal')">
      <div class="op-status ${isPayout ? 'money' : statusClass}">
        <i data-lucide="${isPayout ? 'banknote' : statusIcon}"></i>
      </div>
      <div class="op-content">
        <div class="op-title">${escapeHtml(op.title)}</div>
        <div class="op-meta">${escapeHtml(meta)}</div>
      </div>
      <div class="op-amount ${isPayout ? 'expense' : 'income'}">
        ${isPayout ? '−' : '+'}${formatMoney(Math.abs(op.amount))}
      </div>
    </div>
  `;
}

// ==================== РЕНДЕР: ДОБАВИТЬ ВИЗИТ ====================
function renderAddVisit() {
  const salon = App.getCurrentSalon();
  const salonEl = document.getElementById('add-visit-salon');
  if (salonEl && salon) salonEl.textContent = salon.name;

  const dateInput = document.getElementById('visit-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = formatDateTimeLocal();
  }

  renderVisitServices();
}

function renderVisitServices() {
  const container = document.getElementById('visit-services');
  if (!container) return;

  const services = State.draftVisit.services;

  if (services.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 20px;">
        <div class="empty-state-text">Добавьте услуги</div>
      </div>
    `;
  } else {
    container.innerHTML = services.map((s, i) => {
      return `
        <div class="service-item">
          <div class="service-item-main">
            <div class="service-name">${escapeHtml(s.service_name)}</div>
            <div class="service-meta">
              ${formatMoney(s.full_price)} · скидка ${s.discount_percent}% · ${s.master_percent}%
            </div>
          </div>
          <button class="icon-btn" onclick="App.removeVisitService(${i})">
            <i data-lucide="x"></i>
          </button>
        </div>
      `;
    }).join('');
  }

  updateVisitTotals();
  lucide.createIcons();
}

function updateVisitTotals() {
  const services = State.draftVisit.services;
  let total = 0;
  let earnings = 0;

  services.forEach(s => {
    const finalPrice = s.full_price - (s.full_price * s.discount_percent / 100);
    total += finalPrice;
    earnings += finalPrice * (s.master_percent / 100);
  });

  const totalEl = document.getElementById('visit-total');
  const earnEl = document.getElementById('visit-earnings');
  if (totalEl) totalEl.textContent = formatMoney(total);
  if (earnEl) earnEl.textContent = formatMoney(earnings);
}

// ==================== РЕНДЕР: ВЫПЛАТА ====================
function renderPayout() {
  const salon = App.getCurrentSalon();
  if (!salon) return;

  const salonEl = document.getElementById('payout-salon');
  const debtEl = document.getElementById('payout-debt');
  const amountInput = document.getElementById('payout-amount');

  if (salonEl) salonEl.textContent = salon.name;
  if (debtEl) debtEl.textContent = formatMoney(salon.debt);
  if (amountInput) amountInput.value = '';

  const quickEl = document.getElementById('quick-amounts');
  if (quickEl) {
    const debt = salon.debt;
    const amounts = [];
    if (debt > 0) {
      if (debt >= 1000) amounts.push(1000);
      if (debt >= 2000) amounts.push(2000);
      if (debt >= 5000) amounts.push(5000);
    }
    quickEl.innerHTML = [
      ...amounts.map(a => `<button class="quick-amount" onclick="App.setPayoutAmount(${a})">${a.toLocaleString('ru-RU')}</button>`),
      debt > 0 ? `<button class="quick-amount" onclick="App.setPayoutAmount('all')">Всё</button>` : ''
    ].join('');
  }

  lucide.createIcons();
}

// ==================== РЕНДЕР: ЖУРНАЛ ====================
function renderJournal() {
  if (!State.fullData) {
    apiCall('getFullData').then(data => {
      if (data.success) {
        State.fullData = {
          transactions: data.transactions,
          payouts: data.payouts,
          salons: data.salons
        };
        Storage.set(STORAGE_KEYS.DATA + '_full', State.fullData);
        renderJournal();
      }
    }).catch(() => {});
    return;
  }

  const salonFilter = document.getElementById('journal-salon-filter');
  if (salonFilter && salonFilter.options.length <= 1) {
    salonFilter.innerHTML = '<option value="all">Все салоны</option>' +
      State.data.salons.map(s => `<option value="${s.salon_id}">${escapeHtml(s.name)}</option>`).join('');
  }

  renderJournalList();
}

function renderJournalList() {
  const container = document.getElementById('journal-list');
  if (!container || !State.fullData) return;

  const filter = State.journalFilter;
  
  let transactions = [];
  if (filter.type === 'all' || filter.type === 'visit') {
    transactions = State.fullData.transactions.filter(t => {
      if (filter.salon !== 'all' && t.salon_id !== filter.salon) return false;
      return true;
    });
  }
  
  let payouts = [];
  if (filter.type === 'all' || filter.type === 'payout') {
    payouts = State.fullData.payouts.filter(p => {
      if (filter.salon !== 'all' && p.salon_id !== filter.salon) return false;
      return true;
    });
  }
  
  const visitsMap = {};
  transactions.forEach(t => {
    const vid = t.visit_id || t.id;
    if (!visitsMap[vid]) {
      visitsMap[vid] = {
        visit_id: vid,
        type: 'visit',
        date: t.service_date || t.created_at,
        salon_id: t.salon_id,
        services: [],
        total_earnings: 0,
        total_price: 0
      };
    }
    visitsMap[vid].services.push(t);
    visitsMap[vid].total_earnings += t.master_earnings || 0;
    visitsMap[vid].total_price += t.final_price || t.full_price || 0;
    const tDate = new Date(t.service_date || t.created_at);
    const vDate = new Date(visitsMap[vid].date);
    if (tDate < vDate) visitsMap[vid].date = t.service_date || t.created_at;
  });
  
  let items = [];
  
  Object.values(visitsMap).forEach(v => {
    items.push(v);
  });
  
  payouts.forEach(p => {
    items.push({
      payout_id: p.id,
      type: 'payout',
      date: p.date,
      salon_id: p.salon_id,
      amount: p.amount,
      comment: p.comment
    });
  });
  
  items.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  const limited = items.slice(0, 100);
  
  if (limited.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="inbox"></i>
        <div class="empty-state-text">Нет операций</div>
      </div>
    `;
    lucide.createIcons();
    return;
  }
  
  const grouped = {};
  limited.forEach(item => {
    const key = formatDateFull(item.date);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });
  
  container.innerHTML = Object.entries(grouped).map(([date, ops]) => `
    <div class="date-group">${date}</div>
    ${ops.map(op => renderJournalItem(op)).join('')}
  `).join('');
  
  lucide.createIcons();
}

function renderJournalItem(op) {
  const salon = State.data.salons.find(s => s.salon_id === op.salon_id);
  const salonName = salon ? salon.name : '';
  const time = formatTime(op.date);
  
  if (op.type === 'payout') {
    return `
      <div class="op-item" onclick="App.editPayout('${op.payout_id}')">
        <div class="op-status money">
          <i data-lucide="banknote"></i>
        </div>
        <div class="op-content">
          <div class="op-title">Получено${op.comment ? ': ' + escapeHtml(op.comment) : ''}</div>
          <div class="op-meta">${escapeHtml(salonName)} · ${time}</div>
        </div>
        <div class="op-amount expense">−${formatMoney(op.amount)}</div>
      </div>
    `;
  }
  
  const servicesCount = op.services.length;
  const firstServiceName = op.services[0]?.service_name || 'Визит';
  const title = servicesCount === 1 
    ? firstServiceName 
    : `${firstServiceName} +${servicesCount - 1} услуг`;
  
  return `
    <div class="op-item" onclick="App.showVisitDetails('${op.visit_id}')">
      <div class="op-status check">
        <i data-lucide="check"></i>
      </div>
      <div class="op-content">
        <div class="op-title">${escapeHtml(title)}</div>
        <div class="op-meta">${escapeHtml(salonName)} · ${time} · ${servicesCount} ${servicesCount === 1 ? 'услуга' : 'услуг'}</div>
      </div>
      <div class="op-amount income">+${formatMoney(op.total_earnings)}</div>
    </div>
  `;
}

// ==================== РЕНДЕР: ОТЧЁТЫ ====================
function renderReports() {
  if (!State.fullData) {
    apiCall('getFullData').then(data => {
      if (data.success) {
        State.fullData = {
          transactions: data.transactions,
          payouts: data.payouts,
          salons: data.salons
        };
        Storage.set(STORAGE_KEYS.DATA + '_full', State.fullData);
        renderReports();
      }
    }).catch(() => {});
    return;
  }

  const salonFilter = document.getElementById('reports-salon-filter');
  if (salonFilter && salonFilter.options.length <= 1) {
    salonFilter.innerHTML = '<option value="all">Все салоны</option>' +
      State.data.salons.map(s => `<option value="${s.salon_id}">${escapeHtml(s.name)}</option>`).join('');
  }

  initMonthPicker();

  const monthPicker = document.getElementById('reports-month-picker');
  if (monthPicker) {
    monthPicker.style.display = State.reportsFilter.period === 'month' ? 'block' : 'none';
  }

  renderReportsContent();
}

function initMonthPicker() {
  const select = document.getElementById('reports-month-select');
  if (!select || select.options.length > 0) return;

  const now = new Date();
  const months = [];
  
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
    });
  }

  select.innerHTML = months.map(m => 
    `<option value="${m.value}">${m.label.charAt(0).toUpperCase() + m.label.slice(1)}</option>`
  ).join('');

  const currentValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  select.value = currentValue;
  State.reportsFilter.month = currentValue;

  select.addEventListener('change', e => {
    State.reportsFilter.month = e.target.value;
    renderReportsContent();
  });
}

function getPeriodRange(period) {
  const now = new Date();
  let startDate, endDate, label;

  if (period === 'today') {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    label = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

  } else if (period === 'week') {
    const day = now.getDay() || 7;
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59);
    
    const formatShort = d => d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    label = `${formatShort(startDate)} — ${formatShort(endDate)}.${endDate.getFullYear()}`;

  } else if (period === 'month') {
    const monthValue = State.reportsFilter.month || 
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [year, month] = monthValue.split('-').map(Number);
    
    startDate = new Date(year, month - 1, 1);
    endDate = new Date(year, month, 0, 23, 59, 59);
    
    label = startDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    label = label.charAt(0).toUpperCase() + label.slice(1);

  } else if (period === 'year') {
    startDate = new Date(now.getFullYear(), 0, 1);
    endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
    label = String(now.getFullYear());
  }

  return { startDate, endDate, label };
}

function renderReportsContent() {
  const filter = State.reportsFilter;
  const period = filter.period;

  const range = getPeriodRange(period);

  const labelEl = document.getElementById('reports-period-label');
  if (labelEl) labelEl.textContent = range.label;

  const filterBySalon = (arr) => filter.salon === 'all' ? arr : arr.filter(x => x.salon_id === filter.salon);
  const filterByDate = (arr) => arr.filter(x => {
    const d = new Date(x.service_date || x.date);
    return d >= range.startDate && d <= range.endDate;
  });

  const transactions = filterByDate(filterBySalon(State.fullData.transactions));
  const payouts = filterByDate(filterBySalon(State.fullData.payouts));

  const earned = transactions.reduce((sum, t) => sum + t.master_earnings, 0);
  const received = payouts.reduce((sum, p) => sum + p.amount, 0);

  const uniqueVisits = new Set(transactions.map(t => t.visit_id).filter(Boolean));
  const visitsCount = uniqueVisits.size;

  const summaryEl = document.getElementById('reports-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="report-row">
        <span class="report-label">Заработала за период</span>
        <span class="report-value success">${formatMoney(earned)}</span>
      </div>
      <div class="report-row">
        <span class="report-label">Получила за период</span>
        <span class="report-value primary">${formatMoney(received)}</span>
      </div>
      <div class="report-row">
        <span class="report-label">Визитов</span>
        <span class="report-value" style="font-size: 16px;">${visitsCount}</span>
      </div>
      <div class="report-row">
        <span class="report-label">Услуг оказано</span>
        <span class="report-value" style="font-size: 16px;">${transactions.length}</span>
      </div>
    `;
  }

  const totalDebtEl = document.getElementById('reports-total-debt');
  if (totalDebtEl) {
    let totalDebt;
    if (filter.salon === 'all') {
      totalDebt = State.data.totalDebt;
    } else {
      const salon = State.data.salons.find(s => s.salon_id === filter.salon);
      totalDebt = salon ? salon.debt : 0;
    }

    totalDebtEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 15px; font-weight: 600; color: #991b1b;">
          Салон должен сейчас
        </span>
        <span class="report-value danger">${formatMoney(totalDebt)}</span>
      </div>
    `;
  }

  const bySalonEl = document.getElementById('reports-by-salon');
  const bySalonTitle = document.getElementById('reports-by-salon-title');
  
  if (filter.salon === 'all') {
    if (bySalonTitle) bySalonTitle.style.display = 'block';
    if (bySalonEl) {
      bySalonEl.innerHTML = State.data.salons.map(salon => {
        const sT = transactions.filter(t => t.salon_id === salon.salon_id);
        const sP = payouts.filter(p => p.salon_id === salon.salon_id);
        const sEarned = sT.reduce((sum, t) => sum + t.master_earnings, 0);
        const sReceived = sP.reduce((sum, p) => sum + p.amount, 0);

        if (sEarned === 0 && sReceived === 0 && salon.debt === 0) return '';

        return `
          <div class="card">
            <div style="font-weight: 600; margin-bottom: 12px;">${escapeHtml(salon.name)}</div>
            <div class="total-row">
              <span class="total-row-label">Заработала за период</span>
              <span class="total-row-value">${formatMoney(sEarned)}</span>
            </div>
            <div class="total-row">
              <span class="total-row-label">Получила за период</span>
              <span class="total-row-value">${formatMoney(sReceived)}</span>
            </div>
            <div class="total-row">
              <span class="total-row-label">Долг сейчас</span>
              <span class="total-row-value" style="color: var(--danger);">${formatMoney(salon.debt)}</span>
            </div>
          </div>
        `;
      }).join('');
    }
  } else {
    if (bySalonTitle) bySalonTitle.style.display = 'none';
    if (bySalonEl) bySalonEl.innerHTML = '';
  }

  const topEl = document.getElementById('reports-top-services');
  if (topEl) {
    const counts = {};
    transactions.forEach(t => {
      counts[t.service_name] = (counts[t.service_name] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (sorted.length === 0) {
      topEl.innerHTML = '<div class="text-center text-muted text-small" style="padding: 20px;">Нет данных за период</div>';
    } else {
      topEl.innerHTML = sorted.map(([name, count]) => `
        <div class="report-row">
          <span class="report-label">${escapeHtml(name)}</span>
          <span class="report-value" style="font-size: 16px;">${count} раз</span>
        </div>
      `).join('');
    }
  }
}

// ==================== РЕНДЕР: НАСТРОЙКИ ====================
function renderSettings() {
  const nameEl = document.getElementById('settings-name');
  if (nameEl) nameEl.textContent = State.data.master.name || 'Мастер';

  const salonsEl = document.getElementById('settings-salons-count');
  if (salonsEl) salonsEl.textContent = `${State.data.salons.length} из 3`;

  const syncEl = document.getElementById('settings-sync');
  if (syncEl) {
    const lastSync = Storage.get(STORAGE_KEYS.LAST_SYNC, 0);
    const diff = lastSync ? Math.round((Date.now() - lastSync) / 1000) : 0;
    const timeAgo = diff < 60 ? 'только что' :
                    diff < 3600 ? `${Math.round(diff / 60)} мин назад` :
                    `${Math.round(diff / 3600)} ч назад`;
    syncEl.textContent = `Синхронизация: ${timeAgo}`;
  }
}

// ==================== РЕНДЕР: САЛОНЫ ====================
function renderSalons() {
  const container = document.getElementById('salons-list');
  if (!container) return;

  container.innerHTML = State.data.salons.map(s => `
    <div class="salon-card" onclick="App.editSalon('${s.salon_id}')">
      <div class="salon-card-header">
        <div class="salon-card-name">${escapeHtml(s.name)}</div>
        <div class="salon-card-percent">${s.default_percent}%</div>
      </div>
      <div class="salon-card-services">Нажмите для настройки прайса</div>
    </div>
  `).join('');

  const btn = document.getElementById('btn-add-salon');
  if (btn) {
    btn.style.display = State.data.salons.length >= 3 ? 'none' : 'flex';
  }

  lucide.createIcons();
}

// ==================== РЕНДЕР: РЕДАКТИРОВАНИЕ САЛОНА ====================
function renderSalonEdit() {
  const isNew = !State.editingSalonId;
  const salon = isNew ? { name: '', default_percent: 50 } : State.data.salons.find(s => s.salon_id === State.editingSalonId);

  const titleEl = document.getElementById('salon-edit-title');
  const nameEl = document.getElementById('salon-edit-name');
  const percentEl = document.getElementById('salon-edit-percent');
  const deleteBtn = document.getElementById('btn-delete-salon');

  if (titleEl) titleEl.textContent = isNew ? 'Новый салон' : escapeHtml(salon.name);
  if (nameEl) nameEl.value = salon.name || '';
  if (percentEl) percentEl.value = salon.default_percent || 50;
  if (deleteBtn) deleteBtn.style.display = isNew || State.data.salons.length <= 1 ? 'none' : 'flex';

  const servicesEl = document.getElementById('salon-services-list');
  if (servicesEl && !isNew) {
    apiCall('getServices', { salon_id: salon.salon_id }).then(data => {
      if (data.success && data.services) {
        if (data.services.length === 0) {
          servicesEl.innerHTML = '<div class="text-center text-muted text-small" style="padding: 20px;">Нет услуг. Добавьте первую.</div>';
        } else {
          servicesEl.innerHTML = data.services.map(s => `
            <div class="service-item">
              <div class="service-item-main">
                <div class="service-name">${escapeHtml(s.service_name)}</div>
              </div>
              <div class="service-price">${formatMoney(s.base_price)}</div>
            </div>
          `).join('');
        }
      }
    }).catch(() => {});
  } else if (servicesEl) {
    servicesEl.innerHTML = '<div class="text-center text-muted text-small" style="padding: 20px;">Сохраните салон, потом добавьте услуги</div>';
  }

  lucide.createIcons();
}

// ==================== РЕНДЕР: ВЫБОР УСЛУГ ====================
let servicePickerMode = 'visit';

function renderServicePicker(mode) {
  servicePickerMode = mode;
  const salon = mode === 'salon-edit' ? 
    State.data.salons.find(s => s.salon_id === State.editingSalonId) :
    App.getCurrentSalon();

  const titleEl = document.getElementById('service-picker-title');
  if (titleEl) titleEl.textContent = mode === 'salon-edit' ? 'Добавить услугу в прайс' : 'Выберите услугу';

  const listEl = document.getElementById('service-picker-list');
  if (!listEl) return;

  if (mode === 'salon-edit') {
    listEl.innerHTML = `
      <div class="input-group">
        <label class="input-label">Название</label>
        <input type="text" id="new-service-name" class="input" placeholder="Наращивание 1D">
      </div>
      <div class="input-group">
        <label class="input-label">Цена</label>
        <input type="number" id="new-service-price" class="input" placeholder="3200">
      </div>
      <button class="btn btn-primary" onclick="App.saveSalonService({ name: document.getElementById('new-service-name').value, price: parseInt(document.getElementById('new-service-price').value) || 0 })">
        <i data-lucide="check"></i>
        <span>Сохранить</span>
      </button>
    `;
    lucide.createIcons();
    return;
  }

  const salonId = salon?.salon_id;
  if (!salonId) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-state-text">Салон не выбран</div></div>';
    return;
  }

  apiCall('getServices', { salon_id: salonId }).then(data => {
    if (!data.success || !data.services || data.services.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <i data-lucide="inbox"></i>
          <div class="empty-state-text">Нет услуг</div>
          <p class="text-small text-muted mt-16">Добавьте услуги в настройках салона</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    listEl.innerHTML = data.services.map(s => `
      <div class="service-item clickable" onclick="App.addServiceToVisit({ service_id: '${s.service_id}', service_name: ${JSON.stringify(s.service_name)}, base_price: ${s.base_price} })">
        <div class="service-item-main">
          <div class="service-name">${escapeHtml(s.service_name)}</div>
        </div>
        <div class="service-price">${formatMoney(s.base_price)}</div>
      </div>
    `).join('');
    lucide.createIcons();
  }).catch(e => {
    listEl.innerHTML = `<div class="empty-state"><div class="empty-state-text">Ошибка загрузки</div></div>`;
  });
}

// ==================== МОДАЛКА ====================
function showModal(html) {
  const modal = document.getElementById('modal');
  const backdrop = document.getElementById('modal-backdrop');
  const content = document.getElementById('modal-content');
  if (!modal || !backdrop || !content) return;
  content.innerHTML = html;
  modal.classList.add('show');
  backdrop.classList.add('show');
  lucide.createIcons();
}

function closeModal() {
  App.closeModal();
}

// ==================== МОДАЛКА ЗАГРУЗКИ ====================
function showLoadingModal(text = 'Загрузка...') {
  showModal(`
    <div class="modal-handle"></div>
    <div style="padding: 30px 0; text-align: center;">
      <div class="spinner-large" style="margin: 0 auto 16px;"></div>
      <div class="text-muted">${text}</div>
    </div>
  `);
}

// ==================== TOAST ====================
let toastTimeout;
function toast(message, type = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  clearTimeout(toastTimeout);
  el.textContent = message;
  el.className = 'toast show ' + type;
  toastTimeout = setTimeout(() => {
    el.classList.remove('show');
  }, 2500);
}

// ==================== АВТОРИЗАЦИЯ ====================
async function handleAuth() {
  const input = document.getElementById('auth-token');
  const btn = document.getElementById('btn-auth');
  const token = input.value.trim();

  if (!token) {
    toast('Введите токен', 'error');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<div class="spinner-btn"></div><span>Подключение...</span>';

  State.token = token;

  try {
    const result = await apiCall('getQuickData');
    if (!result.success) throw new Error('Ошибка данных');

    Storage.set(STORAGE_KEYS.TOKEN, token);
    State.data.master = result.master;
    State.data.salons = result.salons;
    State.data.totalDebt = result.totalDebt;
    State.data.recentOps = result.recentOps;

    if (State.data.salons.length > 0) {
      State.currentSalonId = State.data.salons[0].salon_id;
      Storage.set(STORAGE_KEYS.SALON, State.currentSalonId);
    }

    Storage.set(STORAGE_KEYS.DATA, State.data);
    Storage.set(STORAGE_KEYS.LAST_SYNC, Date.now());

    syncData(true);

    App.go('home');
  } catch (e) {
    console.error('Auth error:', e);
    toast('Неверный токен или ошибка связи', 'error');
    btn.disabled = false;
    btn.innerHTML = '<span>Подключиться</span>';
    State.token = '';
  }
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
async function init() {
  lucide.createIcons();

  const token = Storage.get(STORAGE_KEYS.TOKEN, '');
  if (!token) {
    App.go('auth');
    return;
  }

  State.token = token;

  const cachedData = Storage.get(STORAGE_KEYS.DATA);
  const cachedFull = Storage.get(STORAGE_KEYS.DATA + '_full');
  const cachedSalon = Storage.get(STORAGE_KEYS.SALON, '');

  if (cachedData) {
    State.data = cachedData;
  }
  if (cachedFull) {
    State.fullData = cachedFull;
  }
  if (cachedSalon) {
    State.currentSalonId = cachedSalon;
  } else if (State.data.salons && State.data.salons.length > 0) {
    State.currentSalonId = State.data.salons[0].salon_id;
  }

  if (cachedData && cachedData.salons && cachedData.salons.length > 0) {
    App.go('home');
  } else {
    showScreen('loading');
  }

  setTimeout(async () => {
    await flushPending();
    const ok = await syncData();
    if (ok && State.currentScreen !== 'home') {
      App.go('home');
    } else if (ok) {
      renderHome();
    }
  }, 50);
}

// ==================== EVENTS ====================
document.addEventListener('DOMContentLoaded', () => {
  const authBtn = document.getElementById('btn-auth');
  if (authBtn) authBtn.addEventListener('click', handleAuth);

  const tokenInput = document.getElementById('auth-token');
  if (tokenInput) {
    tokenInput.addEventListener('keypress', e => {
      if (e.key === 'Enter') handleAuth();
    });
  }

  const journalSalon = document.getElementById('journal-salon-filter');
  if (journalSalon) journalSalon.addEventListener('change', e => {
    State.journalFilter.salon = e.target.value;
    renderJournalList();
  });

  const journalType = document.getElementById('journal-type-filter');
  if (journalType) journalType.addEventListener('change', e => {
    State.journalFilter.type = e.target.value;
    renderJournalList();
  });

  const reportsSalon = document.getElementById('reports-salon-filter');
  if (reportsSalon) reportsSalon.addEventListener('change', e => {
    State.reportsFilter.salon = e.target.value;
    renderReportsContent();
  });

  const reportsTabs = document.getElementById('reports-tabs');
  if (reportsTabs) {
    reportsTabs.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        reportsTabs.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        State.reportsFilter.period = tab.dataset.period;
        
        const monthPicker = document.getElementById('reports-month-picker');
        if (monthPicker) {
          monthPicker.style.display = tab.dataset.period === 'month' ? 'block' : 'none';
        }
        
        renderReportsContent();
      });
    });
  }

  const saveVisitBtn = document.getElementById('btn-save-visit');
  if (saveVisitBtn) saveVisitBtn.addEventListener('click', App.saveVisit);

  const savePayoutBtn = document.getElementById('btn-save-payout');
  if (savePayoutBtn) savePayoutBtn.addEventListener('click', App.savePayout);

  const saveSalonBtn = document.getElementById('btn-save-salon');
  if (saveSalonBtn) saveSalonBtn.addEventListener('click', App.saveSalon);

  const deleteSalonBtn = document.getElementById('btn-delete-salon');
  if (deleteSalonBtn) deleteSalonBtn.addEventListener('click', App.deleteSalon);

  const addSalonBtn = document.getElementById('btn-add-salon');
  if (addSalonBtn) addSalonBtn.addEventListener('click', () => {
    State.editingSalonId = null;
    App.go('salon-edit');
  });

  const servicePickerBack = document.getElementById('service-picker-back');
  if (servicePickerBack) {
    servicePickerBack.addEventListener('click', () => {
      App.go(servicePickerMode === 'salon-edit' ? 'salon-edit' : 'add-visit');
    });
  }

  window.addEventListener('online', () => {
    flushPending();
    syncData(true);
  });
  window.addEventListener('offline', () => setNetwork('offline'));

  init();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
