// Debt Snowball Tracker Application with Cloud Sync Support

// Configuration
const CONFIG = {
  USE_CLOUD_SYNC: false, // Set to true to enable Cloudflare sync
  API_URL: '', // Add your Cloudflare Worker URL here
  AUTH_TOKEN: '' // Add authentication token if required
};

// State Management
let debts = [];
let priorityMode = 'balance'; // balance, interest, custom
let currentEditId = null;
let syncInProgress = false;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();
  render();
  
  // Setup periodic sync if cloud enabled
  if (CONFIG.USE_CLOUD_SYNC && 'serviceWorker' in navigator && 'sync' in navigator.serviceWorker) {
    setupBackgroundSync();
  }
});

// Cloud Sync Functions
async function syncToCloud() {
  if (!CONFIG.USE_CLOUD_SYNC || !CONFIG.API_URL || syncInProgress) {
    return;
  }
  
  syncInProgress = true;
  
  try {
    const response = await fetch(`${CONFIG.API_URL}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(CONFIG.AUTH_TOKEN && { 'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}` })
      },
      body: JSON.stringify({
        debts,
        priorityMode,
        lastSync: new Date().toISOString()
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      localStorage.setItem('lastCloudSync', data.synced);
      console.log('Synced to cloud successfully');
    } else {
      console.error('Cloud sync failed:', response.statusText);
    }
  } catch (error) {
    console.error('Cloud sync error:', error);
    // Fallback to local storage
  } finally {
    syncInProgress = false;
  }
}

async function loadFromCloud() {
  if (!CONFIG.USE_CLOUD_SYNC || !CONFIG.API_URL) {
    return false;
  }
  
  try {
    const response = await fetch(`${CONFIG.API_URL}/debts`, {
      method: 'GET',
      headers: {
        ...(CONFIG.AUTH_TOKEN && { 'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}` })
      }
    });
    
    if (response.ok) {
      const cloudDebts = await response.json();
      
      // Merge with local data (cloud takes precedence if newer)
      const localLastSync = localStorage.getItem('lastSync');
      const cloudLastSync = localStorage.getItem('lastCloudSync');
      
      if (!localLastSync || (cloudLastSync && cloudLastSync > localLastSync)) {
        debts = cloudDebts;
        return true;
      }
    }
  } catch (error) {
    console.error('Failed to load from cloud:', error);
  }
  
  return false;
}

function setupBackgroundSync() {
  // Register for background sync
  navigator.serviceWorker.ready.then(registration => {
    registration.sync.register('sync-debts')
      .then(() => console.log('Background sync registered'))
      .catch(err => console.error('Background sync registration failed:', err));
  });
}

// Load data from localStorage
function loadFromStorage() {
  const stored = localStorage.getItem('debtSnowball');
  if (stored) {
    const data = JSON.parse(stored);
    debts = data.debts || [];
    priorityMode = data.priorityMode || 'balance';
  }
  
  // Try to load from cloud if enabled
  if (CONFIG.USE_CLOUD_SYNC) {
    loadFromCloud().then(loaded => {
      if (loaded) {
        render();
      }
    });
  }
}

// Save to localStorage and optionally cloud
function saveToStorage() {
  const data = {
    debts,
    priorityMode,
    lastSync: new Date().toISOString()
  };
  
  localStorage.setItem('debtSnowball', JSON.stringify(data));
  
  // Sync to cloud if enabled
  if (CONFIG.USE_CLOUD_SYNC) {
    syncToCloud();
  }
}

// Priority Management
function changePriority(mode) {
  priorityMode = mode;
  
  // Update button states
  document.querySelectorAll('.priority-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.priority === mode) {
      btn.classList.add('active');
    }
  });
  
  saveToStorage();
  render();
}

// Calculate debt payoff details
function calculateDebtDetails(debt) {
  const monthlyRate = (debt.interestRate / 100) / 12;
  const currentBalance = debt.currentBalance;
  const minimumPayment = debt.minimumPayment;
  
  if (minimumPayment === 0 || monthlyRate === 0) {
    const months = Math.ceil(currentBalance / (minimumPayment || 1));
    return {
      monthsRemaining: months,
      payoffDate: new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000)
    };
  }
  
  // Calculate months to payoff using amortization formula
  let balance = currentBalance;
  let months = 0;
  const maxMonths = 600; // 50 years cap
  
  while (balance > 0 && months < maxMonths) {
    const interest = balance * monthlyRate;
    const principal = minimumPayment - interest;
    
    if (principal <= 0) {
      // Payment doesn't cover interest
      months = maxMonths;
      break;
    }
    
    balance -= principal;
    months++;
  }
  
  const payoffDate = new Date();
  payoffDate.setMonth(payoffDate.getMonth() + months);
  
  return {
    monthsRemaining: months,
    payoffDate
  };
}

// Sort debts based on priority
function sortDebts() {
  const sorted = [...debts];
  
  if (priorityMode === 'balance') {
    sorted.sort((a, b) => a.currentBalance - b.currentBalance);
  } else if (priorityMode === 'interest') {
    sorted.sort((a, b) => b.interestRate - a.interestRate);
  }
  // custom mode uses existing order
  
  return sorted;
}

// Calculate summary statistics
function calculateSummary() {
  const totalDebt = debts.reduce((sum, d) => sum + d.currentBalance, 0);
  const totalOriginal = debts.reduce((sum, d) => sum + d.originalBalance, 0);
  const totalPaid = totalOriginal - totalDebt;
  const debtsRemaining = debts.filter(d => d.currentBalance > 0).length;
  
  // Calculate debt-free date (last debt payoff)
  let latestPayoff = null;
  debts.forEach(debt => {
    if (debt.currentBalance > 0) {
      const details = calculateDebtDetails(debt);
      if (!latestPayoff || details.payoffDate > latestPayoff) {
        latestPayoff = details.payoffDate;
      }
    }
  });
  
  return {
    totalDebt,
    totalPaid,
    debtsRemaining,
    debtFreeDate: latestPayoff
  };
}

// Format currency
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

// Format date
function formatDate(date) {
  if (!date) return '--';
  return new Intl.DateFormat('en-US', {
    month: 'short',
    year: 'numeric'
  }).format(date);
}

// Render the entire UI
function render() {
  renderSummary();
  renderDebtList();
  renderTargetDebtSelector();
}

// Render summary cards
function renderSummary() {
  const summary = calculateSummary();
  
  document.getElementById('totalDebt').textContent = formatCurrency(summary.totalDebt);
  document.getElementById('totalPaid').textContent = formatCurrency(summary.totalPaid);
  document.getElementById('debtsRemaining').textContent = summary.debtsRemaining;
  document.getElementById('debtFreeDate').textContent = formatDate(summary.debtFreeDate);
}

// Render debt list
function renderDebtList() {
  const debtListEl = document.getElementById('debtList');
  const sortedDebts = sortDebts();
  
  if (sortedDebts.length === 0) {
    debtListEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <div class="empty-state-text">
          No debts added yet.<br>
          Click Settings to get started.
        </div>
      </div>
    `;
    return;
  }
  
  debtListEl.innerHTML = sortedDebts.map((debt, index) => {
    const details = calculateDebtDetails(debt);
    const progress = ((debt.originalBalance - debt.currentBalance) / debt.originalBalance) * 100;
    const priorityClass = index === 0 ? 'priority-1' : '';
    
    return `
      <div class="debt-card ${priorityClass}">
        <div class="debt-header">
          <div class="debt-name">${escapeHtml(debt.name)}</div>
          <div class="debt-priority">#${index + 1}</div>
        </div>
        <div class="debt-stats">
          <div class="debt-stat">
            <div class="debt-stat-label">Original</div>
            <div class="debt-stat-value">${formatCurrency(debt.originalBalance)}</div>
          </div>
          <div class="debt-stat">
            <div class="debt-stat-label">Current</div>
            <div class="debt-stat-value">${formatCurrency(debt.currentBalance)}</div>
          </div>
          <div class="debt-stat">
            <div class="debt-stat-label">Interest Rate</div>
            <div class="debt-stat-value">${debt.interestRate.toFixed(2)}%</div>
          </div>
          <div class="debt-stat">
            <div class="debt-stat-label">Min Payment</div>
            <div class="debt-stat-value">${formatCurrency(debt.minimumPayment)}</div>
          </div>
          <div class="debt-stat">
            <div class="debt-stat-label">Months Left</div>
            <div class="debt-stat-value">${details.monthsRemaining}</div>
          </div>
          <div class="debt-stat">
            <div class="debt-stat-label">Payoff Date</div>
            <div class="debt-stat-value">${formatDate(details.payoffDate)}</div>
          </div>
        </div>
        <div class="debt-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progress}%"></div>
          </div>
          <div class="progress-text">${progress.toFixed(1)}% paid</div>
        </div>
      </div>
    `;
  }).join('');
}

// Render target debt selector
function renderTargetDebtSelector() {
  const selectEl = document.getElementById('targetDebt');
  const sortedDebts = sortDebts();
  
  selectEl.innerHTML = '<option value="priority">Priority #1 (Default)</option>' +
    sortedDebts.map((debt, index) => 
      `<option value="${debt.id}">${escapeHtml(debt.name)} (#${index + 1})</option>`
    ).join('');
}

// Apply extra payment
function applyExtraPayment() {
  const amount = parseFloat(document.getElementById('extraAmount').value);
  const target = document.getElementById('targetDebt').value;
  
  if (!amount || amount <= 0) {
    showToast('Please enter a valid payment amount');
    return;
  }
  
  let targetDebt;
  if (target === 'priority') {
    const sortedDebts = sortDebts();
    targetDebt = sortedDebts[0];
  } else {
    targetDebt = debts.find(d => d.id === target);
  }
  
  if (!targetDebt) {
    showToast('Debt not found');
    return;
  }
  
  // Apply payment
  targetDebt.currentBalance = Math.max(0, targetDebt.currentBalance - amount);
  
  // Clear input
  document.getElementById('extraAmount').value = '';
  
  saveToStorage();
  render();
  showToast(`Payment of ${formatCurrency(amount)} applied to ${targetDebt.name}!`);
}

// Settings Modal
function openSettings() {
  renderDebtListSettings();
  document.getElementById('settingsModal').classList.add('active');
}

function closeSettings() {
  document.getElementById('settingsModal').classList.remove('active');
  render();
}

function renderDebtListSettings() {
  const container = document.getElementById('debtListSettings');
  const sortedDebts = sortDebts();
  
  if (sortedDebts.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">No debts yet. Add your first debt below.</p>';
    return;
  }
  
  container.innerHTML = sortedDebts.map((debt, index) => `
    <div class="debt-item" draggable="${priorityMode === 'custom'}" data-id="${debt.id}">
      <div class="debt-item-info">
        <div class="debt-item-name">${escapeHtml(debt.name)}</div>
        <div class="debt-item-details">
          ${formatCurrency(debt.currentBalance)} at ${debt.interestRate}% APR
        </div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="btn-primary" style="width: auto; padding: 8px 16px;" onclick="editDebt('${debt.id}')">Edit</button>
        <button class="btn-danger" onclick="deleteDebt('${debt.id}')">Delete</button>
      </div>
    </div>
  `).join('');
  
  if (priorityMode === 'custom') {
    enableDragAndDrop();
  }
}

// Drag and drop for custom ordering
function enableDragAndDrop() {
  const items = document.querySelectorAll('.debt-item[draggable="true"]');
  
  items.forEach(item => {
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('drop', handleDrop);
    item.addEventListener('dragend', handleDragEnd);
  });
}

let draggedElement = null;

function handleDragStart(e) {
  draggedElement = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = 'move';
  
  const items = document.querySelectorAll('.debt-item');
  items.forEach(item => item.classList.remove('drag-over'));
  
  if (this !== draggedElement) {
    this.classList.add('drag-over');
  }
  
  return false;
}

function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }
  
  if (draggedElement !== this) {
    const draggedId = draggedElement.dataset.id;
    const targetId = this.dataset.id;
    
    const draggedIndex = debts.findIndex(d => d.id === draggedId);
    const targetIndex = debts.findIndex(d => d.id === targetId);
    
    // Reorder array
    const [removed] = debts.splice(draggedIndex, 1);
    debts.splice(targetIndex, 0, removed);
    
    saveToStorage();
    renderDebtListSettings();
  }
  
  return false;
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  document.querySelectorAll('.debt-item').forEach(item => {
    item.classList.remove('drag-over');
  });
}

// Add/Edit Debt Form
function openAddDebtForm() {
  currentEditId = null;
  document.getElementById('formModalTitle').textContent = 'Add Debt';
  document.getElementById('debtForm').reset();
  document.getElementById('debtId').value = '';
  document.getElementById('debtFormModal').classList.add('active');
}

function editDebt(id) {
  const debt = debts.find(d => d.id === id);
  if (!debt) return;
  
  currentEditId = id;
  document.getElementById('formModalTitle').textContent = 'Edit Debt';
  document.getElementById('debtId').value = debt.id;
  document.getElementById('debtName').value = debt.name;
  document.getElementById('originalBalance').value = debt.originalBalance;
  document.getElementById('currentBalance').value = debt.currentBalance;
  document.getElementById('interestRate').value = debt.interestRate;
  document.getElementById('minimumPayment').value = debt.minimumPayment;
  
  document.getElementById('debtFormModal').classList.add('active');
}

function closeDebtForm() {
  document.getElementById('debtFormModal').classList.remove('active');
}

function saveDebt(e) {
  e.preventDefault();
  
  const id = document.getElementById('debtId').value || generateId();
  const debtData = {
    id,
    name: document.getElementById('debtName').value,
    originalBalance: parseFloat(document.getElementById('originalBalance').value),
    currentBalance: parseFloat(document.getElementById('currentBalance').value),
    interestRate: parseFloat(document.getElementById('interestRate').value),
    minimumPayment: parseFloat(document.getElementById('minimumPayment').value)
  };
  
  const existingIndex = debts.findIndex(d => d.id === id);
  if (existingIndex >= 0) {
    debts[existingIndex] = debtData;
    showToast('Debt updated successfully!');
  } else {
    debts.push(debtData);
    showToast('Debt added successfully!');
  }
  
  saveToStorage();
  closeDebtForm();
  renderDebtListSettings();
  render();
}

function deleteDebt(id) {
  if (!confirm('Are you sure you want to delete this debt?')) {
    return;
  }
  
  debts = debts.filter(d => d.id !== id);
  saveToStorage();
  renderDebtListSettings();
  render();
  showToast('Debt deleted');
}

// Utility functions
function generateId() {
  return 'debt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('active');
  
  setTimeout(() => {
    toast.classList.remove('active');
  }, 3000);
}

// Close modals on background click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) {
    e.target.classList.remove('active');
  }
});
