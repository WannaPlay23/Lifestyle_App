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

const translations = {
  th: {
    login: "เข้าสู่ระบบ", logout: "ออกจากระบบ", income: "รายรับ", expense: "รายจ่าย", balance: "คงเหลือ",
    monthlyBudget: "งบประมาณรายเดือน", edit: "แก้ไข", addTransaction: "เพิ่มรายการ", food: "อาหาร",
    transport: "เดินทาง", shopping: "ช้อปปิ้ง", bills: "บิล/ที่พัก", other: "อื่นๆ", recurringItem: "รายการประจำทุกเดือน (Recurring)",
    add: "บันทึกข้อมูล", chartTitle: "สัดส่วนรายจ่าย", history: "ประวัติรายการ", dayStreak: "วันติดต่อกัน",
    todayHabits: "นิสัยประจำวันนี้", monthlyStats: "สถิตินิสัยรายเดือน", tabFinance: "การเงิน", tabHabits: "วินัยประจำวัน", tabStats: "สถิติ"
  },
  en: {
    login: "Login", logout: "Logout", income: "Income", expense: "Expense", balance: "Balance",
    monthlyBudget: "Monthly Budget", edit: "Edit", addTransaction: "Add Transaction", food: "Food",
    transport: "Transport", shopping: "Shopping", bills: "Bills", other: "Other", recurringItem: "Monthly Recurring Item",
    add: "Save", chartTitle: "Expense Breakdown", history: "History", dayStreak: "Days Streak",
    todayHabits: "Today Habits", monthlyStats: "Monthly Habit Stats", tabFinance: "Finance", tabHabits: "Habits", tabStats: "Stats"
  }
};

// --- 3. INIT & SERVICE WORKER REGISTER ---
window.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initPWA();
  renderChart();
});

function initPWA() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(() => console.log('Service Worker Registered'))
      .catch((err) => console.log('SW registration failed: ', err));
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
      authText.innerText = translations[currentLang].logout;
      subscribeFirestore();
    } else {
      authText.innerText = translations[currentLang].login;
      transactions = [];
      habits = [];
      updateFinanceUI();
      updateHabitsUI();
    }
  });
}

function subscribeFirestore() {
  if (!currentUser) return;
  
  db.collection('users').doc(currentUser.uid).collection('finance')
    .onSnapshot(snapshot => {
      transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      updateFinanceUI();
    });

  db.collection('users').doc(currentUser.uid).collection('habits')
    .onSnapshot(snapshot => {
      habits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      updateHabitsUI();
    });
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
  document.getElementById('totalIncome').innerText = `฿${income.toLocaleString()}`;
  document.getElementById('totalExpense').innerText = `฿${expense.toLocaleString()}`;
  document.getElementById('netBalance').innerText = `฿${net.toLocaleString()}`;

  const percent = Math.min((expense / monthlyBudget) * 100, 100);
  const progressBar = document.getElementById('budgetProgressBar');
  progressBar.style.width = `${percent}%`;
  progressBar.className = `h-3 transition-all duration-300 ${percent > 80 ? 'bg-red-500' : 'bg-indigo-600'}`;
  
  document.getElementById('budgetSpentText').innerText = `ใช้ไป: ฿${expense.toLocaleString()}`;
  document.getElementById('budgetLimitText').innerText = `งบ: ฿${monthlyBudget.toLocaleString()}`;

  const list = document.getElementById('txList');
  list.innerHTML = transactions.map(t => `
    <li class="py-2 flex justify-between items-center text-gray-800 dark:text-gray-200">
      <div>
        <span class="font-medium">${t.title}</span> ${t.recurring ? '<span class="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">Recurring</span>' : ''}
        <p class="text-xs text-gray-500 dark:text-gray-400">${t.category}</p>
      </div>
      <span class="font-bold ${t.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}">
        ${t.type === 'income' ? '+' : '-'}฿${t.amount.toLocaleString()}
      </span>
    </li>
  `).join('');

  updateChart(catSums);
}

function updateChart(catSums) {
  if (!chartInstance) return;
  chartInstance.data.datasets[0].data = Object.values(catSums);
  chartInstance.update();
}

function renderChart() {
  const ctx = document.getElementById('financeChart').getContext('2d');
  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['อาหาร', 'เดินทาง', 'ช้อปปิ้ง', 'บิล/ที่พัก', 'อื่นๆ'],
      datasets: [{
        data: [0, 0, 0, 0, 0],
        backgroundColor: ['#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#6b7280']
      }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });
}

function setBudgetPrompt() {
  const val = prompt("ตั้งค่าเพดานงบประมาณประจำเดือน (บาท):", monthlyBudget);
  if (val && !isNaN(val)) {
    monthlyBudget = parseFloat(val);
    updateFinanceUI();
  }
}

// --- 6. HABIT TRACKER & GAMIFICATION (แก้ไขสีข้อความและพื้นหลังตรงนี้) ---
async function addHabit(e) {
  e.preventDefault();
  const name = document.getElementById('habitName').value;
  const item = { name, streak: 0, completedToday: false, xp: 0, note: '', history: {} };

  if (currentUser) {
    await db.collection('users').doc(currentUser.uid).collection('habits').add(item);
  } else {
    habits.push({ id: Date.now().toString(), ...item });
    updateHabitsUI();
  }
  document.getElementById('habitForm').reset();
}

async function toggleHabit(id) {
  const habit = habits.find(h => h.id === id);
  if (!habit) return;

  const isComplete = !habit.completedToday;
  const newStreak = isComplete ? habit.streak + 1 : Math.max(0, habit.streak - 1);
  const newXP = isComplete ? (habit.xp || 0) + 10 : Math.max(0, (habit.xp || 0) - 10);

  const updated = { completedToday: isComplete, streak: newStreak, xp: newXP };

  if (currentUser) {
    await db.collection('users').doc(currentUser.uid).collection('habits').doc(id).update(updated);
  } else {
    Object.assign(habit, updated);
    updateHabitsUI();
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
  let totalXP = 0;
  let maxStreak = 0;

  habitList.innerHTML = habits.map(h => {
    totalXP += (h.xp || 0);
    if (h.streak > maxStreak) maxStreak = h.streak;

    return `
      <div class="p-3 border rounded-lg border-gray-200 dark:border-gray-700 flex flex-col space-y-2 bg-gray-100 dark:bg-gray-700">
        <div class="flex items-center justify-between">
          <label class="flex items-center space-x-3 cursor-pointer">
            <input type="checkbox" ${h.completedToday ? 'checked' : ''} onchange="toggleHabit('${h.id}')" class="w-5 h-5 text-purple-600 rounded">
            <span class="${h.completedToday ? 'line-through text-gray-400 dark:text-gray-500' : 'font-medium text-gray-800 dark:text-gray-100'}">${h.name}</span>
          </label>
          <span class="text-xs font-bold text-amber-500">🔥 ${h.streak} วัน</span>
        </div>
        <input type="text" value="${h.note || ''}" onchange="saveNote('${h.id}', this.value)" placeholder="+ แนบโน้ตสั้นๆ" class="text-xs p-1 bg-transparent border-b border-gray-300 dark:border-gray-600 focus:outline-none text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-400" />
      </div>
    `;
  }).join('');

  const level = Math.floor(totalXP / 100) + 1;
  document.getElementById('userLevel').innerText = `LVL ${level}`;
  document.getElementById('userXP').innerText = totalXP;
  document.getElementById('nextLevelXP').innerText = level * 100;
  document.getElementById('streakCounter').innerText = `${maxStreak} 🔥`;

  renderStatsUI();
}

function renderStatsUI() {
  const statsList = document.getElementById('habitStatsList');
  statsList.innerHTML = habits.map(h => {
    const rate = h.streak > 0 ? Math.min(100, h.streak * 3.3).toFixed(0) : 0;
    return `
      <div>
        <div class="flex justify-between text-xs mb-1 text-gray-700 dark:text-gray-200">
          <span>${h.name}</span>
          <span class="font-bold">${rate}% ความสำเร็จเดือนนี้</span>
        </div>
        <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div class="bg-purple-600 h-2 rounded-full" style="width: ${rate}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

// --- 7. UI CONTROLS ---
function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.getElementById(`tab-${tabName}`).classList.remove('hidden');

  document.querySelectorAll('nav button').forEach(btn => btn.className = 'flex flex-col items-center text-gray-400');
  document.getElementById(`nav-${tabName}`).className = 'flex flex-col items-center text-indigo-600 dark:text-indigo-400';
}

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.classList.toggle('dark');
  document.getElementById('themeIcon').className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}

function toggleLanguage() {
  currentLang = currentLang === 'th' ? 'en' : 'th';
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[currentLang][key]) {
      el.innerText = translations[currentLang][key];
    }
  });
  updateFinanceUI();
}

