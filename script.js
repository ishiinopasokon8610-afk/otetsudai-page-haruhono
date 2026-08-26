// --- ユーザーごとのデータを管理する変数 ---
let currentUser = 'honoka'; // 最初はほのかちゃん
let tasks = [];
let records = {};

let currentCalYear = new Date().getFullYear();
let currentCalMonth = new Date().getMonth(); 

// --- Firebase関連の変数 ---
let db;
let tasksRef = null;
let recordsRef = null;
let firebaseReady = false;

window.onload = function() {
    let today = new Date();
    let yyyy = today.getFullYear();
    let mm = String(today.getMonth() + 1).padStart(2, '0');
    let dd = String(today.getDate()).padStart(2, '0');
    document.getElementById('record-date').value = `${yyyy}-${mm}-${dd}`;

    initFirebase();
    migrateLocalStorageIfNeeded();

    // 初期設定としてほのかちゃんのデータを読み込む
    switchUser('honoka');
    showPage('home'); 
};

// ==========================================
// ▼ 📦 昔のlocalStorageデータをクラウドへ「追加」する引っ越し処理 ▼
// ==========================================
// ※上書きではなく「クラウドにまだ無いものだけ足す」ので、
//   古い端末のデータが消えてしまうことはありません。
//   一度成功したら二度と実行しないよう、フラグを立てます。
const MIGRATION_FLAG_KEY = 'firebase_migration_done_v1';

function migrateLocalStorageIfNeeded() {
    if (!firebaseReady) return;
    if (localStorage.getItem(MIGRATION_FLAG_KEY)) return; // すでに引っ越し済み

    let users = ['honoka', 'haruto'];
    Promise.all(users.map(userId => migrateUserData(userId)))
        .then(() => {
            localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
            console.log('ローカルの古いデータをクラウドへ引き継ぎました');
        })
        .catch((e) => {
            console.error('データ引き継ぎでエラー:', e);
            // 失敗した場合は次回また試せるようフラグは立てない
        });
}

function migrateUserData(userId) {
    let localTasks = JSON.parse(localStorage.getItem(userId + '_tasks')) || [];
    let localRecords = JSON.parse(localStorage.getItem(userId + '_records')) || {};

    // この端末に古いデータが無ければ何もしない
    if (localTasks.length === 0 && Object.keys(localRecords).length === 0) {
        return Promise.resolve();
    }

    return db.ref(userId).once('value').then((snapshot) => {
        let cloudData = snapshot.val() || {};
        let cloudTasks = cloudData.tasks || [];
        let cloudRecords = cloudData.records || {};

        // --- タスクをマージ（クラウドに無いidだけ追加） ---
        let cloudTaskIds = new Set(cloudTasks.map(t => t.id));
        let mergedTasks = cloudTasks.slice();
        localTasks.forEach((t) => {
            if (!cloudTaskIds.has(t.id)) {
                mergedTasks.push(t);
                cloudTaskIds.add(t.id);
            }
        });

        // --- 記録をマージ（日付ごと・お手伝いごとに、クラウドに無いものだけ追加） ---
        let mergedRecords = {};
        for (let date in cloudRecords) {
            mergedRecords[date] = cloudRecords[date].slice();
        }
        for (let date in localRecords) {
            if (!mergedRecords[date]) {
                mergedRecords[date] = localRecords[date].slice();
            } else {
                let existingTaskIds = new Set(mergedRecords[date].map(r => r.taskId));
                localRecords[date].forEach((r) => {
                    if (!existingTaskIds.has(r.taskId)) {
                        mergedRecords[date].push(r);
                        existingTaskIds.add(r.taskId);
                    }
                });
            }
        }

        return db.ref(userId).set({
            tasks: mergedTasks,
            records: mergedRecords
        });
    });
}

// ==========================================
// ▼ 🔥 Firebase 初期化・同期機能 ▼
// ==========================================
function initFirebase() {
    let statusEl = document.getElementById('sync-status');
    try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        firebaseReady = true;

        // 接続状態の表示（他の端末との同期が生きているか分かるように）
        db.ref('.info/connected').on('value', (snap) => {
            if (!statusEl) return;
            if (snap.val() === true) {
                statusEl.innerText = '🟢 同期中（他の端末と繋がっています）';
                statusEl.style.color = 'green';
            } else {
                statusEl.innerText = '🔴 未接続（この端末だけの表示です）';
                statusEl.style.color = 'red';
            }
        });
    } catch (e) {
        firebaseReady = false;
        if (statusEl) {
            statusEl.innerText = '⚠️ Firebaseに接続できません（firebase-config.jsを確認してください）';
            statusEl.style.color = 'red';
        }
        console.error('Firebase init error:', e);
    }
}

// ==========================================
// ▼ 👥 ユーザー切り替え機能 ▼
// ==========================================
function loadUserData() {
    // 前のユーザーの監視を止める（多重登録を防ぐ）
    if (tasksRef) tasksRef.off();
    if (recordsRef) recordsRef.off();

    // 切替直後は前のユーザーのデータが一瞬映らないよう空にしておく
    tasks = [];
    records = {};

    if (!firebaseReady) {
        return;
    }

    tasksRef = db.ref(currentUser + '/tasks');
    recordsRef = db.ref(currentUser + '/records');

    // タスク一覧をリアルタイムで監視。他の端末が変更すると自動で反映される
    tasksRef.on('value', (snapshot) => {
        tasks = snapshot.val() || [];
        updateTaskList();
        loadTodayRecord();
        updateSidebarMonthTotals();
        if (document.getElementById('page-calendar').classList.contains('active-page')) {
            drawCalendar();
        }
    });

    // 記録をリアルタイムで監視
    recordsRef.on('value', (snapshot) => {
        records = snapshot.val() || {};
        loadTodayRecord();
        updateSidebarMonthTotals();
        if (document.getElementById('page-calendar').classList.contains('active-page')) {
            drawCalendar();
        }
    });
}

function saveTasksData() {
    if (!firebaseReady) {
        alert("⚠️ クラウドに接続できていません。保存できませんでした。\n（画面上部の同期状態を確認してください）");
        return;
    }
    db.ref(currentUser + '/tasks').set(tasks).catch((e) => {
        console.error('保存エラー:', e);
        alert("⚠️ 保存に失敗しました：" + e.message + "\n（Firebaseのルール設定を確認してください）");
    });
}

function saveRecordsData() {
    if (!firebaseReady) {
        alert("⚠️ クラウドに接続できていません。保存できませんでした。\n（画面上部の同期状態を確認してください）");
        return;
    }
    db.ref(currentUser + '/records').set(records).catch((e) => {
        console.error('保存エラー:', e);
        alert("⚠️ 保存に失敗しました：" + e.message + "\n（Firebaseのルール設定を確認してください）");
    });
}

function switchUser(userId) {
    currentUser = userId;
    loadUserData();

    document.getElementById('btn-honoka').classList.remove('active-user-honoka');
    document.getElementById('btn-haruto').classList.remove('active-user-haruto');
    
    let titleElement = document.getElementById('main-title');
    let sidebarElement = document.getElementById('sidebar');

    if (userId === 'honoka') {
        document.getElementById('btn-honoka').classList.add('active-user-honoka');
        titleElement.innerText = "🌸 ほのか のお手伝い記録帳 🌸";
        titleElement.style.color = "#e67e22";
        sidebarElement.style.backgroundColor = "#ffecd2";
    } else {
        document.getElementById('btn-haruto').classList.add('active-user-haruto');
        titleElement.innerText = "🌟 はると のお手伝い記録帳 🌟";
        titleElement.style.color = "#2980b9";
        sidebarElement.style.backgroundColor = "#d6eaf8";
    }

    updateTaskList();
    loadTodayRecord();
    updateSidebarMonthTotals();
    
    if (document.getElementById('page-calendar').classList.contains('active-page')) {
        drawCalendar();
    }
}

// ==========================================
// ▼ 画面切り替え ▼
// ==========================================
function showPage(pageId) {
    document.getElementById('page-home').classList.remove('active-page');
    document.getElementById('page-add').classList.remove('active-page');
    document.getElementById('page-calendar').classList.remove('active-page');
    document.getElementById('page-settings').classList.remove('active-page');
    
    document.getElementById('link-home').classList.remove('active-link');
    document.getElementById('link-add').classList.remove('active-link');
    document.getElementById('link-calendar').classList.remove('active-link');
    document.getElementById('link-settings').classList.remove('active-link');
    
    document.getElementById('page-' + pageId).classList.add('active-page');
    document.getElementById('link-' + pageId).classList.add('active-link');
    
    if (pageId === 'home') loadTodayRecord();
    if (pageId === 'calendar') drawCalendar(); 
}

// ==========================================
// ▼ カレンダー表示の機能 ▼
// ==========================================
function drawCalendar() {
    let firstDay = new Date(currentCalYear, currentCalMonth, 1).getDay(); 
    let daysInMonth = new Date(currentCalYear, currentCalMonth + 1, 0).getDate();
    let monthlyTotalMoney = 0; 

    let html = '<table class="calendar-table">';
    html += '<tr><th>日</th><th>月</th><th>火</th><th>水</th><th>木</th><th>金</th><th>土</th></tr><tr>';

    let dayOfWeek = 0;
    for (let i = 0; i < firstDay; i++) {
        html += '<td></td>';
        dayOfWeek++;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        let mm = String(currentCalMonth + 1).padStart(2, '0');
        let dd = String(day).padStart(2, '0');
        let dateStr = `${currentCalYear}-${mm}-${dd}`;
        
        let dayTotal = 0;
        if (records[dateStr]) {
            records[dateStr].forEach(rec => {
                let task = tasks.find(t => t.id === rec.taskId);
                if (task) {
                    let money = task.reward;
                    if (rec.status === 'triangle') money = Math.floor(money / 2);
                    dayTotal += money * rec.count;
                }
            });
        }
        
        monthlyTotalMoney += dayTotal;

        let moneyHtml = "";
        if (dayTotal > 0) {
            let moneyColor = currentUser === 'honoka' ? '#e67e22' : '#2980b9';
            moneyHtml = `<div class="day-money" style="color:${moneyColor}">💰 ${dayTotal}円</div>`;
        }

        html += `<td>
                    <div class="day-number">${day}</div>
                    ${moneyHtml}
                 </td>`;
        
        dayOfWeek++;
        if (dayOfWeek % 7 === 0 && day !== daysInMonth) {
            html += '</tr><tr>';
        }
    }

    while (dayOfWeek % 7 !== 0) {
        html += '<td></td>';
        dayOfWeek++;
    }
    html += '</tr></table>';

    document.getElementById('calendar-grid').innerHTML = html;
    document.getElementById('cal-month-label').innerText = 
        `${currentCalYear}年 ${currentCalMonth + 1}月 (合計: ${monthlyTotalMoney}円)`;
}

function changeMonth(offset) {
    currentCalMonth += offset;
    if (currentCalMonth < 0) {
        currentCalMonth = 11; 
        currentCalYear--;
    }
    if (currentCalMonth > 11) {
        currentCalMonth = 0; 
        currentCalYear++;
    }
    drawCalendar();
}

// ==========================================
// ▼ 追加・変更の機能 ▼
// ==========================================
function addTask() {
    let nameInput = document.getElementById('task-name').value;
    let rewardInput = parseInt(document.getElementById('task-reward').value);
    let triangleInput = document.getElementById('task-triangle').checked;

    if (nameInput === "" || isNaN(rewardInput)) {
        alert("お手伝いの名前と金額を正しく入力してください！");
        return;
    }

    let newTask = {
        id: Date.now(),
        name: nameInput,
        reward: rewardInput,
        allowTriangle: triangleInput
    };

    tasks.push(newTask);
    saveTasksData();

    document.getElementById('task-name').value = "";
    document.getElementById('task-reward').value = "";
    document.getElementById('task-triangle').checked = false;

    updateTaskList();
    alert("新しいお手伝いを追加しました！");
}

function deleteTask(id) {
    if (confirm("本当にこのお手伝いを消しますか？")) {
        tasks = tasks.filter(task => task.id !== id);
        saveTasksData();
        updateTaskList();
        loadTodayRecord();
    }
}

function updateTaskList() {
    let tbody = document.getElementById('task-list-tbody');
    tbody.innerHTML = ""; 

    tasks.forEach(task => {
        let tr = document.createElement('tr');
        let triangleText = task.allowTriangle ? "〇 許可" : "× なし";
        tr.innerHTML = `
            <td>${task.name}</td>
            <td>${task.reward}円</td>
            <td>${triangleText}</td>
            <td><button class="btn-red" onclick="deleteTask(${task.id})" style="padding: 5px 10px; margin: 0;">消す</button></td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// ▼ 記録・ホームの機能 ▼
// ==========================================
function loadTodayRecord() {
    let selectedDate = document.getElementById('record-date').value;
    let todayRecords = records[selectedDate] || []; 
    let tbody = document.getElementById('home-tbody');
    tbody.innerHTML = "";

    if (tasks.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4">まだお手伝いがありません。「追加・変更」から作ってください！</td></tr>`;
        return;
    }

    tasks.forEach(task => {
        let tr = document.createElement('tr');
        let pastRecord = todayRecords.find(r => r.taskId === task.id);
        let status = pastRecord ? pastRecord.status : "none"; 
        let count = pastRecord ? pastRecord.count : 1; 

        let options = "";
        for(let i=1; i<=10; i++){
            let selected = (i == count) ? "selected" : "";
            options += `<option value="${i}" ${selected}>${i}回</option>`;
        }

        let triangleDisabled = task.allowTriangle ? "" : "disabled";

        tr.innerHTML = `
            <td>${task.name} <br><small>(${task.reward}円)</small></td>
            <td>
                <input type="radio" name="status_${task.id}" value="full" ${status === 'full' ? 'checked' : ''} style="transform: scale(1.5);">
            </td>
            <td>
                <input type="radio" name="status_${task.id}" value="triangle" ${status === 'triangle' ? 'checked' : ''} ${triangleDisabled} style="transform: scale(1.5);">
            </td>
            <td>
                <select id="count_${task.id}" style="width: auto; padding: 5px;">${options}</select>
            </td>
            <input type="radio" name="status_${task.id}" value="none" style="display:none;" ${status === 'none' ? 'checked' : ''}>
        `;
        tbody.appendChild(tr);
    });
}

function saveTodayRecord() {
    let selectedDate = document.getElementById('record-date').value;
    if (!selectedDate) {
        alert("日付を選んでください！");
        return;
    }

    let todayRecords = [];
    
    tasks.forEach(task => {
        let radios = document.getElementsByName(`status_${task.id}`);
        let selectedStatus = "none";
        for (let r of radios) {
            if (r.checked) {
                selectedStatus = r.value;
            }
        }

        if (selectedStatus === 'full' || selectedStatus === 'triangle') {
            let countVal = document.getElementById(`count_${task.id}`).value;
            todayRecords.push({
                taskId: task.id,
                status: selectedStatus,
                count: parseInt(countVal)
            });
        }
    });

    records[selectedDate] = todayRecords;
    saveRecordsData();

    let msg = document.getElementById('save-message');
    msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 2000);

    updateSidebarMonthTotals();
}

// ==========================================
// ▼ PCの左メニュー用の合計計算 ▼
// ==========================================
function updateSidebarMonthTotals() {
    let monthlyTotals = {};

    for (let dateString in records) {
        let yyyy_mm = dateString.substring(0, 7); 
        if (!monthlyTotals[yyyy_mm]) monthlyTotals[yyyy_mm] = 0;

        let dayRecords = records[dateString];
        dayRecords.forEach(rec => {
            let task = tasks.find(t => t.id === rec.taskId);
            if (task) {
                let money = task.reward;
                if (rec.status === 'triangle') money = Math.floor(money / 2); 
                monthlyTotals[yyyy_mm] += money * rec.count;
            }
        });
    }

    let sidebarList = document.getElementById('sidebar-month-list');
    sidebarList.innerHTML = "";

    let months = Object.keys(monthlyTotals).sort().reverse(); 
    if (months.length === 0) {
        sidebarList.innerHTML = "<p>まだ記録がありません</p>";
        return;
    }

    months.forEach(month => {
        let year = month.split('-')[0];
        let mon = month.split('-')[1];
        let text = `${year}年 ${mon}月: ${monthlyTotals[month]}円`;

        let div = document.createElement('div');
        div.className = 'month-summary';
        if (currentUser === 'haruto') div.style.borderLeftColor = '#3498db';
        div.innerText = text;
        sidebarList.appendChild(div);
    });
}

// ==========================================
// ▼ リセット・引き継ぎの機能 ▼
// ==========================================
function resetAllData() {
    if (confirm("【警告】ほのかちゃんと、はると君の、すべての記録が消えます。\n（すべての端末から消えます）\n本当にリセットしてもよろしいですか？")) {
        if (confirm("※消えたデータは二度と戻りません。\n本当に本当によろしいですか？")) {
            if (firebaseReady) {
                db.ref('honoka').remove();
                db.ref('haruto').remove();
                // ↑ 削除すると各端末のリアルタイム監視（on value）が反応して
                //   自動的に画面が空の状態に更新されます
            } else {
                tasks = [];
                records = {};
                updateTaskList();
                loadTodayRecord();
                updateSidebarMonthTotals();
                if (document.getElementById('page-calendar').classList.contains('active-page')) {
                    drawCalendar();
                }
            }
            
            alert("すべてのデータを完全にリセットしました。");
        }
    }
}

