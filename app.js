// --- 1. FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyALRDLXx5alOIl-PikR4bSg06MZaUg5avI",
  authDomain: "lifestyle-app-13867.firebaseapp.com",
  projectId: "lifestyle-app-13867",
  storageBucket: "lifestyle-app-13867.firebasestorage.app",
  messagingSenderId: "623783309157",
  appId: "1:623783309157:web:eae222bd76692edf6e7b8c",
  measurementId: "G-4DEG457F42"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// --- 2. STATE MANAGEMENT & I18N ---
let currentUser = null;
let currentLang = 'th';
let monthlyBudget = 15000;
let transactions = [];
let habits = [];
let chartInstance = null;
let currentCalDate = new Date();

const translations = {
  th: {
    login: "เข้าสู่ระบบ", logout: "ออกจากระบบ", income: "รายรับ", expense: "รายจ่าย", balance: "คงเหลือ",
    monthlyBudget: "งบประมาณรายเดือน", edit: "แก้ไข", addTransaction: "เพิ่มรายการ", food: "อาหาร",
    transport: "เดินทาง", shopping: "ช้อปปิ้ง", bills: "บิล/ที่พัก", other: "อื่นๆ", recurringItem: "รายการประจำทุกเดือน (Recurring)",
    add: "บันทึกข้อมูล", chartTitle: "สัดส่วนรายจ่าย", history: "ประวัติรายการ", dayStreak: "วันติดต่อกัน",
    todayHabits: "นิสัยประจำวันนี้", monthlyStats: "สถิตินิสัยรายเดือน", tabFinance: "การเงิน", tabHabits: "วินัยประจำวัน", tabCalendar: "ปฏิทิน", tabStats: "สถิติ"
  },
  en: {
    login: "Login", logout: "Logout", income: "Income", expense: "Expense", balance: "Balance",
    monthlyBudget: "Monthly Budget", edit: "Edit", addTransaction: "Add Transaction", food: "Food",
    transport: "Transport", shopping: "Shopping", bills: "Bills", other: "Other", recurringItem: "Monthly Recurring Item",
    add: "Save", chartTitle: "Expense Breakdown", history: "History", dayStreak: "Days Streak",
    todayHabits: "Today Habits", monthlyStats: "Monthly Habit Stats", tabFinance: "Finance", tabHabits: "Habits", tabCalendar: "Calendar", tabStats: "Stats"
  }
};

// Helper: ป้องกัน Error จากวันที่ในรูปแบบต่างๆ
function getDateString(createdAt) {
  if (!createdAt) return '';
  if (typeof createdAt === 'string') return createdAt;
  if (createdAt.toDate && typeof createdAt.toDate === 'function') {
    return createdAt.toDate().toISOString();
  }
  if (createdAt.seconds) {
    return new Date(createdAt.seconds * 1000).toISOString();
  }
  return '';
}

// --- 3. INIT & SERVICE WORKER ---
window.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initPWA();
  renderChart();
  renderCalendar();
});

function initPWA() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('Service Worker Registered'))
      .catch((err) => console.warn('SW registration failed: ', err));
  }
}

// --- 4. AUTH & REALTIME SYNC ---
function handleAuth() {
  if (currentUser) {
    auth.signOut();
  } else {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => alert("Login Failed: " + err.message));
  }
}

function initAuth() {
  auth.onAuthStateChanged(user => {
    currentUser = user;
    const authText = document.getElementById('authBtnText');
    if (user) {
      if (authText) authText.innerText = translations[currentLang].logout;
      subscribeFirestore();
    } else {
      if (authText) authText.innerText = translations[currentLang].login;
      transactions = [];
      habits = [];
      updateFinanceUI();
      updateHabitsUI();
      renderCalendar();
    }
  });
}

function subscribeFirestore() {
  if (!currentUser) return;
  
  db.collection('users').doc(currentUser.uid).collection('finance')
    .onSnapshot(snapshot => {
      transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      updateFinanceUI();
      renderCalendar();
    }, err => console.error(err));

  db.collection('users').doc(currentUser.uid).collection('habits')
    .onSnapshot(snapshot => {
      habits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      updateHabitsUI();
      renderCalendar();
    }, err => console.error(err));
}

// --- 5. FINANCE MODULE ---
async function addTransaction(e) {
  e.preventDefault();
  const title = document.getElementById('txTitle').value;
  const amount = parseFloat(document.getElementById('txAmount').value);
  const type = document.getElementById('txType').value;
  const category = document.getElementById('txCategory').value;
  const recurring = document.getElementById('txRecurring').checked;

  const item = { title, amount, type, category, recurring, createdAt: new Date().toISOString() };

  if (currentUser) {
    await db.collection('users').doc(currentUser.uid).collection('finance').add(item);
  } else {
    transactions.push({ id: Date.now().toString(), ...item });
    updateFinanceUI();
    renderCalendar();
  }
  document.getElementById('financeForm').reset();
}

function updateFinanceUI() {
  let income = 0, expense = 0;
  const catSums = { food: 0, transport: 0, shopping: 0, bills: 0, other: 0 };

  transactions.forEach(t => {
    if (t.type === 'income') income += t.amount;
    else {
      expense += t.amount;
      if (catSums[t.category] !== undefined) catSums[t.category] += t.amount;
    }
  });

  const net = income - expense;
  const elInc = document.getElementById('totalIncome');
  const elExp = document.getElementById('totalExpense');
  const elNet = document.getElementById('netBalance');
  if (elInc) elInc.innerText = `฿${income.toLocaleString()}`;
  if (elExp) elExp.innerText = `฿${expense.toLocaleString()}`;
  if (elNet) elNet.innerText = `฿${net.toLocaleString()}`;

  const percent = Math.min((expense / monthlyBudget) * 100, 100);
  const progressBar = document.getElementById('budgetProgressBar');
  if (progressBar) {
    progressBar.style.width = `${percent}%`;
    progressBar.className = `h-3 transition-all duration-300 ${percent > 80 ? 'bg-red-500' : 'bg-indigo-600'}`;
  }
  
  const elSpent = document.getElementById('budgetSpentText');
  const elLimit = document.getElementById('budgetLimitText');
  if (elSpent) elSpent.innerText = `ใช้ไป: ฿${expense.toLocaleString()}`;
  if (elLimit) elLimit.innerText = `งบ: ฿${monthlyBudget.toLocaleString()}`;

  const list = document.getElementById('txList');
  if (list) {
    list.innerHTML = transactions.map(t => `
      <li class="py-2 flex justify-between items-center text-gray-200">
        <div>
          <span class="font-medium">${t.title}</span> ${t.recurring ? '<span class="text-[10px] bg-indigo-900 text-indigo-300 px-1 py-0.5 rounded">Recurring</span>' : ''}
          <p class="text-[10px] text-gray-400">${t.category}</p>
        </div>
        <span class="font-bold ${t.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}">
          ${t.type === 'income' ? '+' : '-'}฿${t.amount.toLocaleString()}
        </span>
      </li>
    `).join('');
  }

  updateChart(catSums);
}

function updateChart(catSums) {
  if (!chartInstance) return;
  chartInstance.data.datasets[0].data = Object.values(catSums);
  chartInstance.update();
}

function renderChart() {
  const canvas = document.getElementById('financeChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['อาหาร', 'เดินทาง', 'ช้อปปิ้ง', 'บิล/ที่พัก', 'อื่นๆ'],
      datasets: [{
        data: [0, 0, 0, 0, 0],
        backgroundColor: ['#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#6b7280']
      }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#ccc' } } } }
  });
}

function setBudgetPrompt() {
  const val = prompt("ตั้งค่าเพดานงบประมาณประจำเดือน (บาท):", monthlyBudget);
  if (val && !isNaN(val)) {
    monthlyBudget = parseFloat(val);
    updateFinanceUI();
  }
}

// --- 6. HABIT TRACKER ---
async function addHabit(e) {
  e.preventDefault();
  const name = document.getElementById('habitName').value;
  const item = { name, streak: 0, completedToday: false, xp: 0, note: '', history: {} };

  if (currentUser) {
    await db.collection('users').doc(currentUser.uid).collection('habits').add(item);
  } else {
    habits.push({ id: Date.now().toString(), ...item });
    updateHabitsUI();
    renderCalendar();
  }
  document.getElementById('habitForm').reset();
}

async function toggleHabit(id) {
  const habit = habits.find(h => h.id === id);
  if (!habit) return;

  const isComplete = !habit.completedToday;
  const newStreak = isComplete ? habit.streak + 1 : Math.max(0, habit.streak - 1);
  const newXP = isComplete ? (habit.xp || 0) + 10 : Math.max(0, (habit.xp || 0) - 10);
  
  const todayStr = new Date().toISOString().split('T')[0];
  const history = habit.history || {};
  history[todayStr] = isComplete;

  const updated = { completedToday: isComplete, streak: newStreak, xp: newXP, history };

  if (currentUser) {
    await db.collection('users').doc(currentUser.uid).collection('habits').doc(id).update(updated);
  } else {
    Object.assign(habit, updated);
    updateHabitsUI();
    renderCalendar();
  }
}

async function saveNote(id, noteVal) {
  if (currentUser) {
    await db.collection('users').doc(currentUser.uid).collection('habits').doc(id).update({ note: noteVal });
  } else {
    const habit = habits.find(h => h.id === id);
    if (habit) habit.note = noteVal;
  }
}

function updateHabitsUI() {
  const habitList = document.getElementById('habitList');
  if (!habitList) return;

  let totalXP = 0;
  let maxStreak = 0;

  habitList.innerHTML = habits.map(h => {
    totalXP += (h.xp || 0);
    if (h.streak > maxStreak) maxStreak = h.streak;

    return `
      <div class="p-3 border rounded-lg border-gray-700 flex flex-col space-y-2 bg-gray-700/50">
        <div class="flex items-center justify-between">
          <label class="flex items-center space-x-3 cursor-pointer">
            <input type="checkbox" ${h.completedToday ? 'checked' : ''} onchange="toggleHabit('${h.id}')" class="w-5 h-5 text-purple-600 rounded">
            <span class="${h.completedToday ? 'line-through text-gray-500' : 'font-medium text-gray-100'}">${h.name}</span>
          </label>
          <span class="text-xs font-bold text-amber-400">🔥 ${h.streak} วัน</span>
        </div>
        <input type="text" value="${h.note || ''}" onchange="saveNote('${h.id}', this.value)" placeholder="+ แนบโน้ตสั้นๆ" class="text-xs p-1 bg-transparent border-b border-gray-600 focus:outline-none text-gray-200 placeholder-gray-500" />
      </div>
    `;
  }).join('');

  const level = Math.floor(totalXP / 100) + 1;
  const elLvl = document.getElementById('userLevel');
  const elXp = document.getElementById('userXP');
  const elNext = document.getElementById('nextLevelXP');
  const elStrk = document.getElementById('streakCounter');

  if (elLvl) elLvl.innerText = `LVL ${level}`;
  if (elXp) elXp.innerText = totalXP;
  if (elNext) elNext.innerText = level * 100;
  if (elStrk) elStrk.innerText = `${maxStreak} 🔥`;

  renderStatsUI();
}

function renderStatsUI() {
  const statsList = document.getElementById('habitStatsList');
  if (!statsList) return;
  statsList.innerHTML = habits.map(h => {
    const rate = h.streak > 0 ? Math.min(100, h.streak * 3.3).toFixed(0) : 0;
    return `
      <div>
        <div class="flex justify-between text-xs mb-1 text-gray-200">
          <span>${h.name}</span>
          <span class="font-bold">${rate}% ความสำเร็จเดือนนี้</span>
        </div>
        <div class="w-full bg-gray-700 rounded-full h-2">
          <div class="bg-purple-600 h-2 rounded-full" style="width: ${rate}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

// --- 7. CALENDAR MODULE ---
function changeMonth(delta) {
  currentCalDate.setMonth(currentCalDate.getMonth() + delta);
  renderCalendar();
  const panel = document.getElementById('dayDetailPanel');
  if (panel) panel.classList.add('hidden');
}

function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;

  const year = currentCalDate.getFullYear();
  const month = currentCalDate.getMonth();
  
  const monthNames = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  const titleEl = document.getElementById('calendarMonthYear');
  if (titleEl) titleEl.innerText = `${monthNames[month]} ${year + 543}`;

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().split('T')[0];

  grid.innerHTML = '';

  for (let i = 0; i < firstDayIndex; i++) {
    grid.innerHTML += `<div class="h-14 bg-transparent"></div>`;
  }

  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    const dayTxs = transactions.filter(t => getDateString(t.createdAt).startsWith(dateStr));
    let dayInc = 0, dayExp = 0;
    dayTxs.forEach(t => {
      if (t.type === 'income') dayInc += t.amount;
      else dayExp += t.amount;
    });

    const habitsDone = habits.filter(h => h.history && h.history[dateStr] === true).length;
    const isToday = todayStr === dateStr;

    grid.innerHTML += `
      <div onclick="selectCalDate('${dateStr}')" 
           class="h-14 p-1 border rounded-lg flex flex-col justify-between cursor-pointer transition ${isToday ? 'border-purple-500 bg-purple-900/40' : 'border-gray-700/60 bg-gray-800/80 hover:bg-gray-700'}">
        <div class="text-[10px] font-bold text-left ${isToday ? 'text-purple-300' : 'text-gray-300'}">${day}</div>
        <div class="text-[8px] leading-tight text-right space-y-0.5">
          ${dayInc > 0 ? `<div class="text-emerald-400 font-semibold">+${dayInc >= 1000 ? (dayInc/1000).toFixed(1)+'k' : dayInc}</div>` : ''}
          ${dayExp > 0 ? `<div class="text-rose-400 font-semibold">-${dayExp >= 1000 ? (dayExp/1000).toFixed(1)+'k' : dayExp}</div>` : ''}
          ${habitsDone > 0 ? `<div class="text-amber-400 font-semibold">✔ ${habitsDone}</div>` : ''}
        </div>
      </div>
    `;
  }
}

function selectCalDate(dateStr) {
  const panel = document.getElementById('dayDetailPanel');
  const title = document.getElementById('selectedDateTitle');
  const content = document.getElementById('selectedDateContent');
  if (!panel || !title || !content) return;
  
  const [y, m, d] = dateStr.split('-');
  title.innerText = `📅 ประวัติวันที่ ${parseInt(d)}/${parseInt(m)}/${parseInt(y) + 543}`;
  
  const dayTxs = transactions.filter(t => getDateString(t.createdAt).startsWith(dateStr));
  const dayHabits = habits.filter(h => h.history && h.history[dateStr] === true);

  let html = '';

  html += `<div class="font-bold text-gray-300 border-b border-gray-700 pb-1 mt-1">💰 รายการการเงิน</div>`;
  if (dayTxs.length === 0) {
    html += `<div class="text-gray-500 py-1">ไม่มีรายการบันทึก</div>`;
  } else {
    dayTxs.forEach(t => {
      html += `
        <div class="flex justify-between py-1 border-b border-gray-700/40">
          <span>${t.title} (${t.category})</span>
          <span class="font-bold ${t.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}">
            ${t.type === 'income' ? '+' : '-'}฿${t.amount.toLocaleString()}
          </span>
        </div>`;
    });
  }

  html += `<div class="font-bold text-gray-300 border-b border-gray-700 pb-1 mt-3">✅ วินัยที่ทำสำเร็จ</div>`;
  if (dayHabits.length === 0) {
    html += `<div class="text-gray-500 py-1">ไม่มีนิสัยที่เช็กอินวันนี้</div>`;
  } else {
    dayHabits.forEach(h => {
      html += `<div class="text-amber-400 py-0.5">✔ ${h.name}</div>`;
    });
  }

  content.innerHTML = html;
  panel.classList.remove('hidden');
}

// --- 8. UI CONTROLS ---
function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  const targetTab = document.getElementById(`tab-${tabName}`);
  if (targetTab) targetTab.classList.remove('hidden');

  document.querySelectorAll('nav button').forEach(btn => btn.className = 'flex flex-col items-center text-gray-400');
  const activeNav = document.getElementById(`nav-${tabName}`);
  if (activeNav) activeNav.className = 'flex flex-col items-center text-indigo-400';

  if (tabName === 'calendar') {
    renderCalendar();
  }
}

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.classList.toggle('dark');
  const icon = document.getElementById('themeIcon');
  if (icon) icon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}

function toggleLanguage() {
  currentLang = currentLang === 'th' ? 'en' : 'th';
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[currentLang] && translations[currentLang][key]) {
      el.innerText = translations[currentLang][key];
    }
  });
  updateFinanceUI();
}
