// --- ユーザーごとのデータを管理する変数 ---
let currentUser = 'honoka'; // 最初はほのかちゃん
let tasks = [];
let records = {};

let currentCalYear = new Date().getFullYear();
let currentCalMonth = new Date().getMonth(); 

window.onload = function() {
    let today = new Date();
    let yyyy = today.getFullYear();
    let mm = String(today.getMonth() + 1).padStart(2, '0');
    let dd = String(today.getDate()).padStart(2, '0');
    document.getElementById('record-date').value = `${yyyy}-${mm}-${dd}`;

    // 初期設定としてほのかちゃんのデータを読み込む
    switchUser('honoka');
    showPage('home'); 
};

// ==========================================
// ▼ 👥 ユーザー切り替え機能 ▼
// ==========================================
function loadUserData() {
    tasks = JSON.parse(localStorage.getItem(currentUser + '_tasks')) || [];
    records = JSON.parse(localStorage.getItem(currentUser + '_records')) || {};
}

function saveTasksData() {
    localStorage.setItem(currentUser + '_tasks', JSON.stringify(tasks));
}

function saveRecordsData() {
    localStorage.setItem(currentUser + '_records', JSON.stringify(records));
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
    if (confirm("【警告】ほのかちゃんと、はると君の、すべての記録が消えます。\n本当にリセットしてもよろしいですか？")) {
        if (confirm("※消えたデータは二度と戻りません。\n本当に本当によろしいですか？")) {
            localStorage.removeItem('honoka_tasks');
            localStorage.removeItem('honoka_records');
            localStorage.removeItem('haruto_tasks');
            localStorage.removeItem('haruto_records');
            
            tasks = [];
            records = {};
            
            updateTaskList();
            loadTodayRecord();
            updateSidebarMonthTotals();
            if(document.getElementById('page-calendar').classList.contains('active-page')) {
                drawCalendar();
            }
            
            alert("すべてのデータを完全にリセットしました。");
        }
    }
}

function exportData() {
    let allData = { 
        honoka_tasks: JSON.parse(localStorage.getItem('honoka_tasks')) || [],
        honoka_records: JSON.parse(localStorage.getItem('honoka_records')) || {},
        haruto_tasks: JSON.parse(localStorage.getItem('haruto_tasks')) || [],
        haruto_records: JSON.parse(localStorage.getItem('haruto_records')) || {}
    };
    let dataString = btoa(unescape(encodeURIComponent(JSON.stringify(allData))));
    let textArea = document.getElementById('data-text');
    textArea.value = dataString;
    textArea.select();
    document.execCommand("copy");
    alert("2人分のデータを出力してコピーしました！\nLINEやメールで別の端末に送ってください。");
}

function importData() {
    let textArea = document.getElementById('data-text');
    let dataString = textArea.value;
    
    if (dataString === "") {
        alert("文字が入力されていません！");
        return;
    }

    if (confirm("入力されたデータで上書きします。今の端末のデータは消えますがよろしいですか？")) {
        try {
            let decodedString = decodeURIComponent(escape(atob(dataString)));
            let allData = JSON.parse(decodedString);
            
            if (allData.honoka_tasks) { 
                localStorage.setItem('honoka_tasks', JSON.stringify(allData.honoka_tasks));
                localStorage.setItem('honoka_records', JSON.stringify(allData.honoka_records || {}));
                localStorage.setItem('haruto_tasks', JSON.stringify(allData.haruto_tasks || []));
                localStorage.setItem('haruto_records', JSON.stringify(allData.haruto_records || {}));
                
                loadUserData();
                
                updateTaskList();
                loadTodayRecord();
                updateSidebarMonthTotals();
                
                alert("2人分のデータの取り込みに成功しました！");
                textArea.value = "";
                showPage('home'); 
            } else {
                alert("データの形式が間違っています。");
            }
        } catch (e) {
            alert("エラー：うまく読み込めませんでした。文字を全部コピーできているか確認してください。");
        }
    }
}