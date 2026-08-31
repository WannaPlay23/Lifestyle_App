// --- 1. ระบบขออนุญาตแจ้งเตือนจากเบราว์เซอร์ ---
function requestNotification() {
  if ('Notification' in window) {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        alert('เปิดการแจ้งเตือนเรียบร้อยแล้ว!');
      } else {
        alert('โปรดอนุญาตให้แจ้งเตือนในการตั้งค่าเบราว์เซอร์');
      }
    });
  } else {
    alert('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน');
  }
}

// --- 2. ระบบเพิ่มข้อมูลการบ้าน ---
function addHomework() {
  const subject = document.getElementById('hwSubject').value;
  const assignDate = document.getElementById('hwAssignDate').value;
  const dueDate = document.getElementById('hwDueDate').value;
  const detail = document.getElementById('hwDetail').value;

  if (!subject || !dueDate) {
    alert('กรุณากรอกชื่อวิชาและกำหนดส่ง!');
    return;
  }

  const newHW = {
    id: Date.now(),
    subject: subject,
    assignDate: assignDate || new Date().toISOString().split('T')[0],
    dueDate: dueDate,
    detail: detail,
    completed: false,
    notified: false // เช็คว่าเคยเด้งเตือนไปแล้วหรือยัง
  };

  const homeworks = JSON.parse(localStorage.getItem('homeworks') || '[]');
  homeworks.push(newHW);
  localStorage.setItem('homeworks', JSON.stringify(homeworks));

  // ล้างฟอร์ม
  document.getElementById('hwSubject').value = '';
  document.getElementById('hwDetail').value = '';

  renderHomeworks();
}

// --- 3. แสดงรายการการบ้าน ---
function renderHomeworks() {
  const listDiv = document.getElementById('homeworkList');
  const homeworks = JSON.parse(localStorage.getItem('homeworks') || '[]');

  if (homeworks.length === 0) {
    listDiv.innerHTML = '<p style="color:#94a3b8; text-align:center;">ไม่มีการบ้านที่ค้างอยู่</p>';
    return;
  }

  listDiv.innerHTML = homeworks.map(item => `
    <div style="background:#0f172a; padding:12px; border-radius:8px; margin-bottom:8px; border-left: 4px solid ${item.completed ? '#22c55e' : '#ef4444'}; color:#fff;">
      <div style="display:flex; justify-between; align-items:center;">
        <strong style="text-decoration: ${item.completed ? 'line-through' : 'none'};">${item.subject}</strong>
        <span style="font-size:12px; color:#a855f7;">ส่งวันที่: ${item.dueDate}</span>
      </div>
      <p style="font-size:13px; color:#cbd5e1; margin:4px 0;">${item.detail || '-'}</p>
      <div style="font-size:11px; color:#64748b; display:flex; justify-content:space-between; align-items:center;">
        <span>สั่งเมื่อ: ${item.assignDate}</span>
        <button onclick="toggleHW(${item.id})" style="background:${item.completed ? '#475569' : '#22c55e'}; color:#fff; border:none; border-radius:4px; padding:4px 8px; cursor:pointer;">
          ${item.completed ? 'ยกเลิกส่ง' : 'ส่งแล้ว'}
        </button>
      </div>
    </div>
  `).join('');
}

// --- 4. ระบบตรวจสอบและส่งการแจ้งเตือน (Check Notifications) ---
function checkDueDateNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const homeworks = JSON.parse(localStorage.getItem('homeworks') || '[]');
  const today = new Date();
  today.setHours(0,0,0,0);

  homeworks.forEach(item => {
    if (item.completed || item.notified) return;

    const due = new Date(item.dueDate);
    due.setHours(0,0,0,0);

    // คำนวณจำนวนวันที่เหลือก่อนถึงวันส่ง
    const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));

    // แจ้งเตือนเมื่อเหลือเวลา 1 วัน หรือ ถึงวันส่งวันนี้พอดี
    if (diffDays <= 1 && diffDays >= 0) {
      sendNotification(item, diffDays);
      item.notified = true; // บันทึกว่าแจ้งเตือนแล้ว
    }
  });

  localStorage.setItem('homeworks', JSON.stringify(homeworks));
}

// --- 5. ยิงการแจ้งเตือนเด้งเข้ามือถือ/คอม ---
function sendNotification(item, diffDays) {
  const title = diffDays === 0 
    ? `🚨 กำหนดส่งวันนี้! วิชา ${item.subject}` 
    : `⏰ พรุ่งนี้ต้องส่งการบ้านวิชา ${item.subject}`;

  const options = {
    body: `รายละเอียด: ${item.detail || 'ไม่มี'}\nอย่าลืมทำส่งนะ!`,
    icon: 'icon.png' // ใช้รูปไอคอนแอป LifePulse
  };

  if (navigator.serviceWorker && navigator.serviceWorker.ready) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, options);
    });
  } else {
    new Notification(title, options);
  }
}

// โหลดรายการและสั่งเช็คการบ้านทันทีเมื่อเปิดแอป
document.addEventListener('DOMContentLoaded', () => {
  renderHomeworks();
  checkDueDateNotifications();
  // เช็คซ้ำทุกๆ 1 ชั่วโมงขณะเปิดหน้าเว็บค้างไว้
  setInterval(checkDueDateNotifications, 3600000); 
});

