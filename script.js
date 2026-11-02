/* --- GITHUB AUTO-SYNC CONFIGURATION --- */
const GITHUB_TOKEN = "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";
const GITHUB_OWNER = "ShubhSarwara"; 
const GITHUB_REPO = "business-suite-data"; 
const GITHUB_FILE_PATH = "data.json";

async function syncWithGitHub(manual = false) {
    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) return;
    try {
        const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`;
        const response = await fetch(url, {
            headers: { "Authorization": `token ${GITHUB_TOKEN}`, "Accept": "application/vnd.github.v3+json" }
        });

        if (response.ok) {
            const fileData = await response.json();
            const content = JSON.parse(atob(fileData.content));
            
            let updated = false;
            Object.keys(content).forEach(key => {
                if (key.startsWith('balanceSheetData_')) {
                    localStorage.setItem(key, content[key]);
                    updated = true;
                }
            });
            if (updated) {
                calculateAndSetInitialHighestBusiness();
                loadDataByDate(true);
                if (manual) showToast("Synced with GitHub successfully!");
            }
        }
    } catch (e) {
        console.error("GitHub Sync Pull Error:", e);
    }
}

async function pushToGitHub() {
    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) return;
    try {
        const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`;
        let allData = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith('balanceSheetData_')) {
                allData[key] = localStorage.getItem(key);
            }
        }
        const contentEncoded = btoa(unescape(encodeURIComponent(JSON.stringify(allData, null, 2))));

        let sha = "";
        const getRes = await fetch(url, {
            headers: { "Authorization": `token ${GITHUB_TOKEN}`, "Accept": "application/vnd.github.v3+json" }
        });
        if (getRes.ok) {
            const fileInfo = await getRes.json();
            sha = fileInfo.sha;
        }

        await fetch(url, {
            method: "PUT",
            headers: {
                "Authorization": `token ${GITHUB_TOKEN}`,
                "Accept": "application/vnd.github.v3+json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: "Auto-sync business data",
                content: contentEncoded,
                sha: sha ? sha : undefined
            })
        });
    } catch (e) {
        console.error("GitHub Sync Push Error:", e);
    }
}

function openTab(evt, tabName) {
  const tabcontent = document.getElementsByClassName("tab-content");
  for (let i = 0; i < tabcontent.length; i++) { tabcontent[i].classList.remove("active"); }
  const tablinks = document.getElementsByClassName("tab-link");
  for (let i = 0; i < tablinks.length; i++) { tablinks[i].classList.remove("active"); }
  document.getElementById(tabName).classList.add("active");
  evt.currentTarget.classList.add("active");
}

function openSettingsModal() { playSound(); document.getElementById('settings-modal').style.display = 'flex'; }
function closeSettingsModal() { playSound(); document.getElementById('settings-modal').style.display = 'none'; }
function openTrackDataModal() { playSound(); document.getElementById('track-data-modal').style.display = 'flex'; }
function closeTrackDataModal() { playSound(); document.getElementById('track-data-modal').style.display = 'none'; }
function closeReportSelection() { playSound(); document.getElementById('report-selection-overlay').style.display = 'none'; }
function closeCustomMonthSelection() { playSound(); document.getElementById('custom-month-selection-overlay').style.display = 'none'; }

const themes = ['midnight-gold', 'vibrant-dark', 'deep-ocean', 'crimson-night', 'forest-haze', 'royal-purple'];
let currentThemeIndex = 0;
let isLightMode = false;

function applyTheme(themeName) { document.documentElement.setAttribute('data-theme', themeName); localStorage.setItem('businessSuiteTheme', themeName); }
function cycleTheme() {
    playSound();
    currentThemeIndex = (currentThemeIndex + 1) % themes.length;
    const newTheme = themes[currentThemeIndex];
    applyTheme(newTheme);
    const themeName = newTheme.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    showToast(`Theme: ${themeName}`);
}

function toggleLightDarkMode() { playSound(); isLightMode = !isLightMode; applyLightDarkMode(isLightMode); showToast(isLightMode ? "Light Mode Enabled" : "Dark Mode Enabled"); }
function applyLightDarkMode(isLight) {
    const toggleBtn = document.getElementById('theme-mode-toggle');
    if (isLight) { document.documentElement.setAttribute('data-theme-mode', 'light'); toggleBtn.textContent = '🌙'; localStorage.setItem('businessSuiteMode', 'light'); } 
    else { document.documentElement.removeAttribute('data-theme-mode'); toggleBtn.textContent = '☀️'; localStorage.setItem('businessSuiteMode', 'dark'); }
}

function loadTheme() {
    const savedTheme = localStorage.getItem('businessSuiteTheme');
    if (savedTheme && themes.includes(savedTheme)) { currentThemeIndex = themes.indexOf(savedTheme); applyTheme(savedTheme); } 
    else { applyTheme(themes[0]); }
    const savedMode = localStorage.getItem('businessSuiteMode');
    if (savedMode === 'light') { isLightMode = true; applyLightDarkMode(true); } 
    else { isLightMode = false; applyLightDarkMode(false); }
}

const tableBody = document.getElementById("tableBody");
const MAX_ROWS = 200; 
let displayedRows = 0;
let currentlyDisplayedDate = new Date();
let lastMilestoneReached = 0;
const HIGHEST_BUSINESS_KEY = 'highestDailyBusiness';
const HIGHEST_BUSINESS_DATE_KEY = 'highestDailyBusinessDate'; 
const SOUND_URL = "https://cdn.pixabay.com/audio/2022/10/18/audio_82c6b4125a.mp3"; 

function playSound() { try { const audio = new Audio(SOUND_URL); const p = audio.play(); if(p) p.catch(e => console.error(e)); } catch (e) {} }

function toggleSearch() {
  playSound();
  const searchContainer = document.getElementById('search-container');
  if (searchContainer.style.display === 'block') { clearSearch(); } 
  else { searchContainer.style.display = 'block'; document.getElementById('search-input').focus(); }
}

function displaySearchResults(results, summaryText) {
  const resultsContainer = document.getElementById('search-results');
  const summaryContainer = document.getElementById('search-results-summary');
  document.getElementById('main-content').style.display = 'none';
  resultsContainer.innerHTML = ''; 
  if (results.length > 0) {
      let tableHTML = '<table><thead><tr><th>Date</th><th>ID No.</th><th>P Type</th><th>Amount</th></tr></thead><tbody>';
      results.forEach(t => {
          const amountClass = (t.id.startsWith('AC') || t.id.startsWith('BW') || t.id.startsWith('TAC')) ? 'text-red' : 'text-green';
          tableHTML += `<tr><td>${t.date}</td><td class="${amountClass}">${t.id}</td><td>${t.ptype}</td><td class="${amountClass}">₹ ${formatBalance(t.amount)}</td></tr>`;
      });
      tableHTML += '</tbody></table>';
      resultsContainer.innerHTML = tableHTML;
      summaryContainer.innerHTML = summaryText;
  } else {
      resultsContainer.innerHTML = '<p style="text-align:center;">No transactions found matching your criteria.</p>';
      summaryContainer.innerHTML = '';
  }
}

function getSelectedFilters(yearFilterId, monthFilterId) {
    return { year: document.getElementById(yearFilterId).value, month: document.getElementById(monthFilterId).value };
}

function performIdSearch() {
  playSound();
  const query = document.getElementById('search-input').value.trim().toUpperCase();
  if (!query) return showToast("Please enter an ID to search.");
  const { year: yearFilter, month: monthFilter } = getSelectedFilters('search-year-filter', 'search-month-filter');
  const typeFilter = document.getElementById('search-type-filter').value;
  let results = []; let totalAmount = 0;
  
  for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('balanceSheetData_')) {
          const datePart = key.substring(17);
          const keyYear = datePart.substring(0, 4);
          const keyMonth = datePart.substring(5, 7);
          if (yearFilter !== 'all' && keyYear !== yearFilter) continue;
          if (monthFilter !== 'all' && keyMonth !== monthFilter) continue;
          
          const data = JSON.parse(localStorage.getItem(key));
          data.forEach(t => {
              const idNo = (t[2] || '').toUpperCase();
              if (idNo && idNo.includes(query)) {
                  if (typeFilter === 'AD' && !(idNo.startsWith('AD') || idNo.startsWith('ABD'))) return;
                  if (typeFilter === 'AC' && !idNo.startsWith('AC')) return;
                  const amount = parseFloat((t[4] || '0').replace(/,/g, ''));
                  results.push({ date: datePart, id: t[2], ptype: t[3], amount: isNaN(amount) ? 0 : amount });
                  if (!isNaN(amount) && !idNo.startsWith('BW') && !idNo.startsWith('BD')) totalAmount += amount;
              }
          });
      }
  }
  results.sort((a, b) => a.date.localeCompare(b.date));
  displaySearchResults(results, `Found <span>${results.length}</span> transactions. Total Business: <span>₹ ${formatBalance(totalAmount)}</span>`);
}

function performAmountSearch() {
  playSound();
  const query = document.getElementById('search-input').value.trim();
  const queryAmount = parseFloat(query.replace(/,/g, ''));
  if (isNaN(queryAmount)) return showToast("Please enter a valid amount.");
  const { year: yearFilter, month: monthFilter } = getSelectedFilters('search-year-filter', 'search-month-filter');
  const typeFilter = document.getElementById('search-type-filter').value;
  let results = []; let totalAmount = 0;

  for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('balanceSheetData_')) {
          const datePart = key.substring(17);
          const keyYear = datePart.substring(0, 4);
          const keyMonth = datePart.substring(5, 7);
          if (yearFilter !== 'all' && keyYear !== yearFilter) continue;
          if (monthFilter !== 'all' && keyMonth !== monthFilter) continue;
          const data = JSON.parse(localStorage.getItem(key));
          data.forEach(t => {
              const transactionAmount = parseFloat((t[4] || '0').replace(/,/g, ''));
              if (transactionAmount === queryAmount) {
                  const idNo = (t[2] || '').toUpperCase();
                  if (typeFilter === 'AD' && !(idNo.startsWith('AD') || idNo.startsWith('ABD'))) return;
                  if (typeFilter === 'AC' && !idNo.startsWith('AC')) return;
                  results.push({ date: datePart, id: t[2], ptype: t[3], amount: transactionAmount });
                  totalAmount += transactionAmount;
              }
          });
      }
  }
  displaySearchResults(results, `Found <span>${results.length}</span> transactions for <span>₹ ${formatBalance(queryAmount)}</span>. Total: <span>₹ ${formatBalance(totalAmount)}</span>`);
}

function clearSearch() {
  playSound();
  document.getElementById('search-input').value = '';
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('search-results-summary').innerHTML = '';
  document.getElementById('search-container').style.display = 'none';
  document.getElementById('main-content').style.display = 'block';
}

function updateHighestBusinessDisplay() {
  const highestBusiness = parseFloat(localStorage.getItem(HIGHEST_BUSINESS_KEY)) || 0;
  const displayEl = document.getElementById('highest-business-display');
  if (displayEl) { displayEl.textContent = `Highest Business: ₹ ${formatBalance(highestBusiness)}`; }
}

function loadHighestBusinessDate() {
  const dateStr = localStorage.getItem(HIGHEST_BUSINESS_DATE_KEY);
  if (!dateStr) return showToast("No highest business date recorded.");
  playSound();
  document.getElementById('date-checker').value = dateStr;
  loadDataByDate();
  document.getElementById('back-to-today-btn').style.display = 'inline-block';
  showToast(`Loading log for high score date: ${dateStr}`);
}

function loadToday() {
  playSound();
  document.getElementById('date-checker').value = '';
  loadDataByDate(true);
  document.getElementById('back-to-today-btn').style.display = 'none';
}

function calculateAndSetInitialHighestBusiness() {
  let maxBusiness = 0; let maxDateKey = ''; 
  for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('balanceSheetData_')) {
          let dailyBusiness = 0;
          const dataStr = localStorage.getItem(key);
          if (dataStr) {
              try {
                  JSON.parse(dataStr).forEach(transaction => {
                      const idNo = (transaction[2] || '').toUpperCase();
                      if (idNo.trim() && !idNo.startsWith('BD') && !idNo.startsWith('BW')) {
                          const amount = parseFloat((transaction[4] || '').replace(/,/g, ''));
                          if (!isNaN(amount)) dailyBusiness += amount;
                      }
                  });
              } catch (e) {}
          }
          if (dailyBusiness > maxBusiness) { maxBusiness = dailyBusiness; maxDateKey = key; }
      }
  }
  localStorage.setItem(HIGHEST_BUSINESS_KEY, maxBusiness);
  if (maxDateKey) localStorage.setItem(HIGHEST_BUSINESS_DATE_KEY, maxDateKey.substring(17));
  updateHighestBusinessDisplay();
}

function getStorageKey(date) { const d = date.getDate().toString().padStart(2, '0'); const m = (date.getMonth() + 1).toString().padStart(2, '0'); const y = date.getFullYear(); return `balanceSheetData_${y}-${m}-${d}`; }
function updateDateDisplay() { 
  const today = new Date(); 
  const isToday = currentlyDisplayedDate.toDateString() === today.toDateString(); 
  document.getElementById("currentDateDisplay").textContent = "DATE: " + currentlyDisplayedDate.toLocaleDateString("en-IN"); 
  document.getElementById('businessLabel').textContent = isToday ? "Total Business:" : "Daily Business:"; 
}
function formatBalance(num) { 
    if (num === null || String(num).trim() === '') return '';
    const parsed = parseFloat(String(num).replace(/,/g, ''));
    if (isNaN(parsed)) return '';
    return parsed.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}
function showToast(message) { 
  const toast = document.getElementById("toast-notification"); toast.textContent = message; toast.classList.add("show"); playSound();
  setTimeout(() => { toast.classList.remove("show"); }, 4000); 
}

function updateSerialNumbers() { 
    let serial = 0; 
    document.querySelectorAll("#tableBody tr").forEach((row) => {
        const idInput = row.querySelector('input[data-col="2"]');
        const serialInput = row.querySelector('input[data-col="1"]');
        const idValue = idInput ? idInput.value.trim().toUpperCase() : '';
        const idPrefix = idValue.substring(0, 2);
        if (idInput && idValue !== '' && idPrefix !== 'BW' && idPrefix !== 'BD') { serialInput.value = ++serial; } else { serialInput.value = ''; }
    });
}

function updateColumnStyles(tr) { 
    const pTypeInput = tr.querySelector('input[data-col="3"]'); 
    const amountInput = tr.querySelector('input[data-col="4"]'); 
    const idInput = tr.querySelector('input[data-col="2"]'); 
    const idNo = idInput ? idInput.value.toUpperCase() : ''; 
    const idPrefix = idNo.substring(0, 2); 
    
    pTypeInput?.classList.remove('text-green', 'text-red'); 
    amountInput?.classList.remove('text-green', 'text-red'); 
    
    if (idPrefix === 'AD' || idPrefix === 'BD' || idNo.startsWith('ABD')) { pTypeInput?.classList.add('text-green'); amountInput?.classList.add('text-green'); } 
    else if (idPrefix === 'AC' || idPrefix === 'BW' || idNo.startsWith('TAC')) { pTypeInput?.classList.add('text-red'); amountInput?.classList.add('text-red'); } 
}

function calculateDailyTotals() {
  let dailyBusiness = 0;
  const rows = document.querySelectorAll("#tableBody tr");
  rows.forEach(row => {
      const idNo = row.querySelector('input[data-col="2"]').value.toUpperCase();
      const amount = parseFloat(row.querySelector('input[data-col="4"]').value.replace(/,/g, ''));
      const idPrefix = idNo.substring(0, 2);
      if (!isNaN(amount) && idPrefix !== 'BD' && idPrefix !== 'BW' && idNo.trim()) { dailyBusiness += amount; }
  });
  document.getElementById("totalBusinessValue").textContent = `₹ ${formatBalance(dailyBusiness)}`;
  let lastBalance = '0';
  const firstRowBalance = rows.length > 0 ? rows[0].querySelector('input[data-col="0"]').value : '';
  if (firstRowBalance.trim() === '') lastBalance = '0';
  else {
    for (let i = rows.length - 1; i >= 0; i--) {
      const input = rows[i].querySelector('input[data-col="0"]');
      if (input && input.value.trim() !== '') { lastBalance = input.value; break; }
    }
  }
  document.getElementById("currentBalanceValue").textContent = `₹ ${lastBalance}`;
}

function updateMonthlySummary() { 
    const year = currentlyDisplayedDate.getFullYear(); 
    const month = currentlyDisplayedDate.getMonth(); 
    let monthlyTotalBusiness = 0; let monthlyTotalTransactions = 0; 
    const daysInMonth = new Date(year, month + 1, 0).getDate(); 
    
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day); 
        const dataStr = localStorage.getItem(getStorageKey(date));
        if (dataStr) {
            try {
                JSON.parse(dataStr).forEach(transaction => {
                    const idNo = (transaction[2] || '').toUpperCase().trim();
                    if (idNo) {
                        const idPrefix = idNo.substring(0, 2); 
                        if (idPrefix !== 'BD' && idPrefix !== 'BW') { 
                            monthlyTotalTransactions++; 
                            const amount = parseFloat((transaction[4] || '0').replace(/,/g, '')); 
                            if (!isNaN(amount)) monthlyTotalBusiness += amount;
                        } 
                    }
                });
            } catch(e) {}
        }
    }
    document.getElementById('monthlyBusinessValue').textContent = `₹ ${formatBalance(monthlyTotalBusiness)}`;
    document.getElementById('monthlyTransactions').textContent = `Monthly Transactions: ${monthlyTotalTransactions.toLocaleString('en-IN')}`;
}

function updateCalculations(idToCheck = null) { calculateBalances(); updateSerialNumbers(); calculateDailyTotals(); saveData(false); }

function calculateBalances() { 
    const rows = document.querySelectorAll("#tableBody tr"); 
    if (rows.length === 0) return; 
    const firstInput = rows[0].querySelector("input[data-col='0']"); 
    let balance = parseFloat(firstInput.value.trim().replace(/,/g, '')); 
    if (isNaN(balance)) { for (let i = 1; i < rows.length; i++) rows[i].querySelector("input[data-col='0']").value = ''; return; } 
    firstInput.value = formatBalance(balance); 
    
    for (let i = 0; i < rows.length - 1; i++) { 
        const currentRow = rows[i]; const nextRow = rows[i + 1]; 
        const idNo = currentRow.querySelector('input[data-col="2"]').value.toUpperCase(); 
        const amount = parseFloat(currentRow.querySelector('input[data-col="4"]').value.replace(/,/g, '')); 
        const currentBal = parseFloat(currentRow.querySelector("input[data-col='0']").value.replace(/,/g, '')); 
        const idPrefix = idNo.substring(0, 2); 
        const nextBalanceInput = nextRow.querySelector("input[data-col='0']"); 
        
        if (!isNaN(amount) && !isNaN(currentBal) && idNo) { 
            let newBalance = currentBal; 
            if (idPrefix === 'AD' || idPrefix === 'BD' || idNo.startsWith('ABD')) { newBalance += amount; } 
            else if (idPrefix === 'AC' || idPrefix === 'BW' || idNo.startsWith('TAC')) { newBalance -= amount; } 
            
            if (newBalance < 0) { 
                showToast(`CRITICAL ERROR: Balance negative at row ${i + 1}.`); 
                currentRow.querySelector('input[data-col="2"]').value = ''; 
                currentRow.querySelector('input[data-col="3"]').value = ''; 
                currentRow.querySelector('input[data-col="4"]').value = ''; 
                updateColumnStyles(currentRow); calculateBalances(); return; 
            } 
            nextBalanceInput.value = formatBalance(newBalance); 
        } else { 
            for (let j = i + 1; j < rows.length; j++) rows[j].querySelector("input[data-col='0']").value = ''; 
            break; 
        } 
    } 
}

function createRow(index) { 
    const tr = document.createElement('tr'); 
    for (let i = 0; i < 5; i++) { 
        const td = document.createElement('td'); 
        const input = document.createElement('input'); 
        input.setAttribute('data-row', index); input.setAttribute('data-col', i); 
        if ((i === 0 && index !== 0) || i === 1 || i === 3) { input.readOnly = true; input.setAttribute('tabindex', '-1'); } 
        input.addEventListener('input', (e) => { 
            const rowIndex = parseInt(e.target.dataset.row, 10);
            if (rowIndex === displayedRows - 1 && displayedRows < MAX_ROWS) { tableBody.appendChild(createRow(displayedRows)); displayedRows++; }
            if (i === 2) { 
                const pTypeInput = tr.querySelector('input[data-col="3"]'); 
                let value = e.target.value.toUpperCase(); 
                let prefix = '', numbers = ''; 
                if (value.startsWith('TAC')) { prefix = 'TAC'; numbers = value.substring(3).replace(/\D/g, '').slice(0, 4); } 
                else if (value.startsWith('ABD')) { prefix = 'ABD'; numbers = value.substring(3).replace(/\D/g, '').slice(0, 4); } 
                else { 
                    const first2 = value.substring(0, 2); 
                    if (['AD', 'AC', 'BD', 'BW'].includes(first2)) { prefix = first2; numbers = value.substring(2).replace(/\D/g, '').slice(0, 4); } 
                    else { e.target.value = value.replace(/[^A-Z]/g, '').substring(0, 3); pTypeInput.value = ''; updateColumnStyles(tr); updateCalculations(); return; } 
                } 
                e.target.value = prefix + (numbers ? ' ' + numbers : ''); 
                if (prefix === 'TAC') pTypeInput.value = 'TPD'; 
                else if (prefix === 'AD' || prefix === 'ABD') pTypeInput.value = 'W'; 
                else if (prefix === 'AC') pTypeInput.value = 'D'; 
                else if (prefix === 'BD') pTypeInput.value = 'BD'; 
                else if (prefix === 'BW') pTypeInput.value = 'BW'; 
                updateColumnStyles(tr); 
            } 
            if (i === 4 || i === 0) e.target.value = formatBalance(e.target.value); 
            updateCalculations(i === 2 ? e.target.value : null); 
        }); 
        input.addEventListener('keydown', e => { 
            const row = parseInt(input.dataset.row, 10); const col = parseInt(input.dataset.col, 10); 
            if (e.key === 'Backspace' && col === 2) { e.preventDefault(); input.value = ''; const pt = tr.querySelector('input[data-col="3"]'); if (pt) pt.value = ''; const am = tr.querySelector('input[data-col="4"]'); if (am) am.value = ''; updateColumnStyles(tr); updateCalculations(); return; }
            if (e.key === 'Tab') { if (col === 2) { e.preventDefault(); document.querySelector(`input[data-row="${row}"][data-col="4"]`)?.focus(); } else if (col === 4 && row < MAX_ROWS - 1) { e.preventDefault(); document.querySelector(`input[data-row="${row + 1}"][data-col="2"]`)?.focus(); } } 
            if (e.key === 'Enter' && (col === 2 || col === 4) && row < MAX_ROWS - 1) { e.preventDefault(); document.querySelector(`input[data-row="${row + 1}"][data-col="${col}"]`)?.focus(); } 
        }); 
        td.appendChild(input); tr.appendChild(td); 
    } 
    return tr; 
}

function fillRows() { tableBody.innerHTML = ''; const initialRows = 5; for (let i = 0; i < initialRows; i++) { tableBody.appendChild(createRow(i)); } displayedRows = initialRows; }
function getCurrentTableData() { return Array.from(document.querySelectorAll("#tableBody tr")).map(row => Array.from({ length: 5 }, (_, col) => row.querySelector(`input[data-col="${col}"]`).value)); }

function setCurrentTableData(data) {
    let lastFilledRowIndex = -1;
    for (let i = data.length - 1; i >= 0; i--) { if ((data[i][2] && data[i][2].trim()) || (data[i][4] && data[i][4].trim())) { lastFilledRowIndex = i; break; } }
    const rowsToShow = Math.min(MAX_ROWS, Math.max(5, lastFilledRowIndex + 2));
    if (rowsToShow > displayedRows) { for (let i = displayedRows; i < rowsToShow; i++) { tableBody.appendChild(createRow(i)); } displayedRows = rowsToShow; }
    data.forEach((rowData, i) => { 
        if (i >= displayedRows) return; 
        let row = tableBody.querySelector(`tr:nth-child(${i + 1})`); 
        if (!row) return; 
        rowData.forEach((cellData, col) => { row.querySelector(`input[data-col="${col}"]`).value = cellData || ''; }); 
        updateColumnStyles(row); 
    }); 
    updateCalculations(); 
}

function propagateBalanceToFutureDates(startDate, closingBalance) {
    let currentBalance = parseFloat(String(closingBalance).replace(/,/g, ''));
    if (isNaN(currentBalance)) return;

    let keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('balanceSheetData_')) keys.push(key);
    }
    keys.sort();

    const startKey = getStorageKey(startDate);
    let startIndex = keys.indexOf(startKey);
    if (startIndex === -1) return;

    for (let i = startIndex + 1; i < keys.length; i++) {
        const nextKey = keys[i];
        let nextDataStr = localStorage.getItem(nextKey);
        if (nextDataStr) {
            try {
                let nextData = JSON.parse(nextDataStr);
                if (nextData.length > 0) {
                    nextData[0][0] = formatBalance(currentBalance);
                    for (let r = 0; r < nextData.length - 1; r++) {
                        const row = nextData[r];
                        const idNo = (row[2] || '').toUpperCase();
                        const amount = parseFloat((row[4] || '0').replace(/,/g, ''));
                        if (!isNaN(amount) && idNo) {
                            const idPrefix = idNo.substring(0, 2);
                            if (idPrefix === 'AD' || idPrefix === 'BD' || idNo.startsWith('ABD')) currentBalance += amount;
                            else if (idPrefix === 'AC' || idPrefix === 'BW' || idNo.startsWith('TAC')) currentBalance -= amount;
                        }
                        nextData[r + 1][0] = formatBalance(currentBalance);
                    }
                    const lastRow = nextData[nextData.length - 1];
                    const lastIdNo = (lastRow[2] || '').toUpperCase();
                    const lastAmount = parseFloat((lastRow[4] || '0').replace(/,/g, ''));
                    if (!isNaN(lastAmount) && lastIdNo) {
                        const idPrefix = lastIdNo.substring(0, 2);
                        if (idPrefix === 'AD' || idPrefix === 'BD' || lastIdNo.startsWith('ABD')) currentBalance += lastAmount;
                        else if (idPrefix === 'AC' || idPrefix === 'BW' || lastIdNo.startsWith('TAC')) currentBalance -= lastAmount;
                    }
                    localStorage.setItem(nextKey, JSON.stringify(nextData));
                }
            } catch (e) { console.error(e); }
        }
    }
}

function saveData(showMsg = true) { 
    const key = getStorageKey(currentlyDisplayedDate); 
    const tableData = getCurrentTableData(); 
    localStorage.setItem(key, JSON.stringify(tableData)); 
    
    let currentDayBusiness = 0; 
    tableData.forEach(transaction => { 
        const idNo = (transaction[2] || '').toUpperCase(); 
        if (idNo.trim() && !idNo.startsWith('BD') && !idNo.startsWith('BW')) { 
            const amount = parseFloat((transaction[4] || '0').replace(/,/g, '')); 
            if (!isNaN(amount)) { currentDayBusiness += amount; } 
        } 
    }); 

    let closingBalance = 0;
    for (let i = tableData.length - 1; i >= 0; i--) {
       if (tableData[i][0] && tableData[i][0].trim() !== '') {
           closingBalance = tableData[i][0];
           break;
       }
    }
    if (closingBalance !== 0) {
        propagateBalanceToFutureDates(currentlyDisplayedDate, closingBalance);
    }

    pushToGitHub();

    const storedHighest = parseFloat(localStorage.getItem(HIGHEST_BUSINESS_KEY)) || 0; 
    if (currentDayBusiness > storedHighest) { 
        localStorage.setItem(HIGHEST_BUSINESS_KEY, currentDayBusiness); 
        localStorage.setItem(HIGHEST_BUSINESS_DATE_KEY, key.substring(17)); 
        updateHighestBusinessDisplay(); 
        showToast(`🎉 New High Score! Daily Business: ₹ ${formatBalance(currentDayBusiness)}`); 
    } 
    if (showMsg) { playSound(); showToast("Log Saved & Synced!"); } 
    updateMonthlySummary(); 
}

function copyAllFilledRowsData() { playSound(); const rows = Array.from(document.querySelectorAll("#tableBody tr")).map(row => [1, 2, 3, 4].map(col => row.querySelector(`input[data-col="${col}"]`).value.trim())).filter(rowArr => rowArr.some(val => val !== '')).map(rowArr => rowArr.join('\t')); if (rows.length === 0) return showToast("No data to copy!"); navigator.clipboard.writeText(rows.join('\n')); showToast("Copied to clipboard!"); }
function showCustomConfirm(message, onConfirm) {
  const overlay = document.getElementById('custom-confirm-overlay');
  document.getElementById('custom-confirm-message').textContent = message;
  const yesButton = document.getElementById('confirm-yes');
  const newYesButton = yesButton.cloneNode(true);
  yesButton.parentNode.replaceChild(newYesButton, yesButton);
  newYesButton.onclick = () => { playSound(); overlay.style.display = 'none'; if (typeof onConfirm === 'function') { onConfirm(); } };
  document.getElementById('confirm-no').onclick = () => { playSound(); overlay.style.display = 'none'; };
  overlay.style.display = 'flex';
}

function resetAllData() { showCustomConfirm(`Are you sure you want to reset the log for ${currentlyDisplayedDate.toLocaleDateString("en-IN")}?`, () => { fillRows(); saveData(false); updateCalculations(); showToast('Log has been reset.'); }); }
function exportAllData() { playSound(); let allData = {}; for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key?.startsWith('balanceSheetData_')) { allData[key] = localStorage.getItem(key); } } const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' }); let a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `balancesheet_export_${new Date().toISOString().slice(0, 10)}.json`; a.click(); a.remove(); showToast("All data exported!"); }
function importData(event) { 
    const file = event.target.files[0]; if (!file) return; 
    const reader = new FileReader(); 
    reader.onload = function (e) { 
        try { 
            const content = JSON.parse(e.target.result); let importCount = 0; 
            Object.keys(content).forEach(key => { if (key.startsWith('balanceSheetData_')) { localStorage.setItem(key, content[key]); importCount++; } }); 
            playSound(); showToast(`${importCount} logs imported successfully!`); 
            calculateAndSetInitialHighestBusiness(); loadDataByDate(true); pushToGitHub();
        } catch (err) { showToast("Import error: " + err); } 
    }; 
    reader.readAsText(file); event.target.value = ""; 
}

function loadDataByDate(forceToday = false) {
    playSound();
    const val = document.getElementById('date-checker').value;
    const dateToLoad = forceToday ? new Date() : (val ? new Date(val) : new Date());
    currentlyDisplayedDate = new Date(dateToLoad.getTime() + (dateToLoad.getTimezoneOffset() * 60000));
    const today = new Date();
    if (currentlyDisplayedDate.toDateString() === today.toDateString()) { document.getElementById('back-to-today-btn').style.display = 'none'; document.getElementById('date-checker').value = ''; }
    fillRows(); 
    const dataStr = localStorage.getItem(getStorageKey(currentlyDisplayedDate));
    if (dataStr) { setCurrentTableData(JSON.parse(dataStr)); } 
    else {
        const prevDate = new Date(currentlyDisplayedDate); prevDate.setDate(prevDate.getDate() - 1);
        const prevDataStr = localStorage.getItem(getStorageKey(prevDate));
        if (prevDataStr) {
            try {
                const prevData = JSON.parse(prevDataStr);
                let closingBalance = '0';
                for (let i = prevData.length - 1; i >= 0; i--) { if (prevData[i][0] && String(prevData[i][0]).trim() !== '') { closingBalance = String(prevData[i][0]); break; } }
                const firstBalanceInput = tableBody.querySelector('input[data-row="0"][data-col="0"]');
                if (firstBalanceInput) firstBalanceInput.value = closingBalance;
            } catch (e) {}
        } else {
            const firstBalanceInput = tableBody.querySelector('input[data-row="0"][data-col="0"]');
            if (firstBalanceInput) firstBalanceInput.value = '21,950';
        }
        updateCalculations();
    }
    updateDateDisplay(); updateMonthlySummary();
}

function createStyledPDF() { if (typeof jspdf === 'undefined') { showToast('Report generation failed. PDF library not loaded.'); return null; } const { jsPDF } = jspdf; const doc = new jsPDF(); doc.setFont('helvetica'); return doc; }

function getDetailedDataForPeriod(startDate, endDate) { 
    const data = {}; 
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) { 
        const key = getStorageKey(d); const dataStr = localStorage.getItem(key); 
        if (dataStr) { 
            const dayTransactions = []; let dailyBusiness = 0; let dailyTransactions = 0; 
            try { 
                JSON.parse(dataStr).forEach(t => { 
                    const idNo = (t[2] || '').toUpperCase(); 
                    if (idNo.trim()) { 
                        const amount = parseFloat((t[4] || '0').replace(/,/g, '')); 
                        dayTransactions.push({ sno: t[1] || '', id: idNo, ptype: t[3] || '', amount: (t[4] || '0') }); 
                        if (!idNo.startsWith('BD') && !idNo.startsWith('BW')) { dailyTransactions++; if (!isNaN(amount)) dailyBusiness += amount; } 
                    } 
                }); 
            } catch (e) { continue; } 
            if (dayTransactions.length > 0) { 
                const year = d.getFullYear(); const month = d.getMonth(); const monthKey = `${year}-${(month + 1).toString().padStart(2, '0')}`; 
                if (!data[monthKey]) { data[monthKey] = { monthName: d.toLocaleString('en-IN', { month: 'long' }), year, totalBusiness: 0, totalTransactions: 0, days: {} }; } 
                data[monthKey].totalBusiness += dailyBusiness; data[monthKey].totalTransactions += dailyTransactions; 
                data[monthKey].days[key] = { dateStr: d.toLocaleDateString("en-IN"), dailyBusiness, dailyTransactions, transactions: dayTransactions }; 
            } 
        } 
    }
    return data; 
}

function drawReportHeader(doc) { doc.setFontSize(20).setFont('helvetica', 'bold').setTextColor('#009688').text(`Business Report`, 105, 20, { align: 'center' }); doc.setFontSize(12).setFont('helvetica', 'normal').setTextColor('#424242').text(`Generated on: ${new Date().toLocaleDateString("en-IN")}`, 105, 30, { align: 'center' }); doc.setDrawColor('#424242').line(15, 35, 195, 35); return 45; }

function generateDetailedReport(data, doc, startDate, endDate) { 
    let y = drawReportHeader(doc); let isFirstMonth = true; 
    const sortedMonthKeys = Object.keys(data).sort(); 
    for (const monthKey of sortedMonthKeys) { 
        const monthData = data[monthKey]; 
        if (!isFirstMonth) { doc.addPage(); y = 20; } else { isFirstMonth = false; } 
        doc.setFontSize(16).setFont('helvetica', 'bold').setTextColor('#009688').text(`Report for ${monthData.monthName} ${monthData.year}`, 105, y, { align: 'center' }); y += 10; 
        doc.setFontSize(12).setFont('helvetica', 'bold').setTextColor(0,0,0).text(`Monthly Business: ₹ ${formatBalance(monthData.totalBusiness)}`, 15, y); doc.text(`Monthly Transactions: ${monthData.totalTransactions.toLocaleString('en-IN')}`, 195, y, { align: 'right' }); y += 5; 
        doc.setDrawColor('#424242').line(15, y, 195, y); y += 10; 
        
        const sortedDayKeys = Object.keys(monthData.days).sort(); 
        for (const dayKey of sortedDayKeys) { 
            const dayData = monthData.days[dayKey];
            const tableBody = dayData.transactions.map(t => [t.sno, t.id, t.ptype, { content: formatBalance(t.amount), styles: { halign: 'right' } }]);
            if (y > 230) { doc.addPage(); y = 20; }
            doc.setFontSize(12).setFont('helvetica', 'bold').setTextColor('#E0E0E0').setFillColor(48, 48, 48).rect(15, y-5, 180, 8, 'F'); doc.text(`Date: ${dayData.dateStr}`, 20, y); y += 10;
            doc.setFontSize(10).setFont('helvetica', 'normal').setTextColor(0,0,0).text(`Daily Business: ₹ ${formatBalance(dayData.dailyBusiness)}`, 20, y); doc.text(`Total Transactions: ${dayData.transactions.length}`, 190, y, { align: 'right' }); y += 5;
            doc.autoTable({ startY: y, head: [['S.No.', 'ID No.', 'P Type', 'Amount (₹)']], body: tableBody, theme: 'grid', headStyles: { fillColor: [33, 33, 33] }, styles: { font: 'helvetica', fontSize: 9 }, didDrawPage: (data) => { y = data.cursor.y + 5; } });
            y = doc.autoTable.previous.finalY + 10;
        } 
    }
}

function createCurrentMonthPDF() { 
    playSound(); const doc = createStyledPDF(); if (!doc) return; 
    const year = currentlyDisplayedDate.getFullYear(); const month = currentlyDisplayedDate.getMonth(); 
    const startDate = new Date(year, month, 1); const endDate = new Date(year, month + 1, 0); 
    const data = getDetailedDataForPeriod(startDate, endDate); 
    if (Object.keys(data).length === 0) return showToast("No data available for the current month."); 
    generateDetailedReport(data, doc, startDate, endDate); doc.save(`Monthly_Report_${currentlyDisplayedDate.toLocaleString('en-IN', { month: 'long' })}_${year}.pdf`); showToast('Report generated!'); 
}

function createAllMonthsPDF() { 
    playSound(); const doc = createStyledPDF(); if (!doc) return; 
    const keys = Object.keys(localStorage).filter(k => k.startsWith('balanceSheetData_')).sort(); 
    if (keys.length === 0) return showToast("No data available to generate a report."); 
    const firstDateParts = keys[0].substring(17).split('-'); const lastDateParts = keys[keys.length - 1].substring(17).split('-'); 
    const startDate = new Date(parseInt(firstDateParts[0]), parseInt(firstDateParts[1]) - 1, 1); const endDate = new Date(parseInt(lastDateParts[0]), parseInt(lastDateParts[1]) - 1, parseInt(lastDateParts[2])); 
    const data = getDetailedDataForPeriod(startDate, endDate); generateDetailedReport(data, doc, startDate, endDate); doc.save(`All_Time_Report.pdf`); showToast('All-Time Report generated!'); 
}

function createCustomMonthPDF() { 
    playSound(); const selectedMonths = Array.from(document.querySelectorAll('#month-selection-container input:checked')).map(cb => cb.value); 
    if (selectedMonths.length === 0) return showToast("Please select at least one month."); 
    document.getElementById('custom-month-selection-overlay').style.display = 'none'; 
    const doc = createStyledPDF(); if (!doc) return; 
    let overallStartDate = null; let overallEndDate = null; const fullData = {}; 
    selectedMonths.sort().forEach(monthKey => { 
        const [year, month] = monthKey.split('-'); const startDate = new Date(year, parseInt(month) - 1, 1); const endDate = new Date(year, parseInt(month), 0); 
        if (!overallStartDate) overallStartDate = new Date(startDate); overallEndDate = new Date(endDate); Object.assign(fullData, getDetailedDataForPeriod(startDate, endDate)); 
    }); 
    if (Object.keys(fullData).length === 0) return showToast("No data found for selected months."); 
    generateDetailedReport(fullData, doc, overallStartDate, overallEndDate); doc.save(`Custom_Report.pdf`); showToast('Custom report generated!');
}

function showReportSelection() { playSound(); document.getElementById('report-selection-overlay').style.display = 'flex'; }
function showCustomMonthSelection() { 
    playSound(); document.getElementById('report-selection-overlay').style.display = 'none'; 
    const container = document.getElementById('month-selection-container'); container.innerHTML = ''; const availableMonths = {}; const today = new Date(); const currentYear = today.getFullYear(); const currentMonth = today.getMonth(); 
    for (let i = 0; i < localStorage.length; i++) { 
        const key = localStorage.key(i); 
        if (key?.startsWith('balanceSheetData_')) { 
            const [year, month] = key.substring(17).split('-'); const yearNum = parseInt(year); const monthNum = parseInt(month) - 1; 
            if (yearNum >= 2025 && (yearNum < currentYear || (yearNum === currentYear && monthNum <= currentMonth))) { if (!availableMonths[year]) availableMonths[year] = new Set(); availableMonths[year].add(month); } 
        } 
    } 
    const sortedYears = Object.keys(availableMonths).sort((a,b) => b-a); 
    if (sortedYears.length === 0) { container.innerHTML = '<p style="text-align: center;">No past data available.</p>'; } 
    sortedYears.forEach(year => { 
        const yearContainer = document.createElement('div'); yearContainer.className = 'year-container'; const yearHeader = document.createElement('div'); yearHeader.className = 'year-header'; yearHeader.textContent = `Year: ${year}`; yearContainer.appendChild(yearHeader); const monthsGrid = document.createElement('div'); monthsGrid.className = 'months-grid'; 
        Array.from(availableMonths[year]).sort((a,b) => a-b).forEach(month => { 
            const monthName = new Date(year, parseInt(month) - 1).toLocaleString('en-IN', { month: 'long' }); const monthId = `month-${year}-${month}`; 
            const label = document.createElement('label'); label.className = 'month-label'; label.htmlFor = monthId; const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.id = monthId; checkbox.value = `${year}-${month}`; const span = document.createElement('span'); span.textContent = monthName; label.appendChild(checkbox); label.appendChild(span); monthsGrid.appendChild(label); 
        }); 
        yearContainer.appendChild(monthsGrid); container.appendChild(yearContainer); 
    }); 
    document.getElementById('custom-month-selection-overlay').style.display = 'flex'; 
}

function populateStaticFilters(yearFilterId, monthFilterId) {
  const yearFilter = document.getElementById(yearFilterId); const monthFilter = document.getElementById(monthFilterId);
  yearFilter.innerHTML = '<option value="all">All Years</option>'; monthFilter.innerHTML = '<option value="all">All Months</option>';
  for (let year = 2025; year <= 2050; year++) { const option = document.createElement('option'); option.value = year; option.textContent = year; yearFilter.appendChild(option); }
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  for (let i = 0; i < monthNames.length; i++) { const option = document.createElement('option'); option.value = (i + 1).toString().padStart(2, '0'); option.textContent = monthNames[i]; monthFilter.appendChild(option); }
}

function generateTrackData() {
    const yearFilter = document.getElementById('track-year-filter').value; const monthFilter = document.getElementById('track-month-filter').value;
    const acListEl = document.getElementById('track-ac-list'); const adListEl = document.getElementById('track-ad-list'); const tacListEl = document.getElementById('track-tac-list');
    const acTotalEl = document.getElementById('track-ac-total'); const adTotalEl = document.getElementById('track-ad-total'); const tacTotalEl = document.getElementById('track-tac-total');
    const acCountEl = document.getElementById('track-ac-count'); const adCountEl = document.getElementById('track-ad-count'); const tacCountEl = document.getElementById('track-tac-count');

    acListEl.innerHTML = ''; adListEl.innerHTML = ''; tacListEl.innerHTML = '';
    let acTotal = 0, tacTotal = 0, adTotal = 0; let acCount = 0, tacCount = 0, adCount = 0;
    const acItems = []; const tacItems = []; const adItems = [];

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('balanceSheetData_')) {
            const datePart = key.substring(17); const keyYear = datePart.substring(0, 4); const keyMonth = datePart.substring(5, 7);
            if (yearFilter !== 'all' && keyYear !== yearFilter) continue;
            if (monthFilter !== 'all' && keyMonth !== monthFilter) continue;
            const data = JSON.parse(localStorage.getItem(key));
            data.forEach(t => {
                const idNo = (t[2] || '').toUpperCase().trim(); const amount = parseFloat((t[4] || '0').replace(/,/g, ''));
                if (idNo && !isNaN(amount)) {
                    if (idNo.startsWith('AC')) { acTotal += amount; acCount++; acItems.push({ date: datePart, id: idNo, amount: amount, type: 'AC' }); }
                    else if (idNo.startsWith('TAC')) { tacTotal += amount; tacCount++; tacItems.push({ date: datePart, id: idNo, amount: amount, type: 'TAC' }); }
                    else if (idNo.startsWith('AD') || idNo.startsWith('ABD')) { adTotal += amount; adCount++; adItems.push({ date: datePart, id: idNo, amount: amount, type: 'AD' }); }
                }
            });
        }
    }

    acItems.sort((a,b) => b.date.localeCompare(a.date)); tacItems.sort((a,b) => b.date.localeCompare(a.date)); adItems.sort((a,b) => b.date.localeCompare(a.date));
    acTotalEl.textContent = `₹ ${formatBalance(acTotal)}`; tacTotalEl.textContent = `₹ ${formatBalance(tacTotal)}`; adTotalEl.textContent = `₹ ${formatBalance(adTotal)}`;
    acCountEl.textContent = acCount; tacCountEl.textContent = tacCount; adCountEl.textContent = adCount;

    const renderItem = (item) => { let colorClass = 'text-green'; if(item.type === 'AC' || item.type === 'TAC') colorClass = 'text-red'; return `<div class="track-list-item"><div><div style="font-weight:700;">${item.id}</div><div class="track-list-date">${item.date}</div></div><div class="${colorClass}" style="font-weight: 600;">₹ ${formatBalance(item.amount)}</div></div>`; };

    if (acItems.length > 0) acListEl.innerHTML = acItems.map(renderItem).join(''); else acListEl.innerHTML = '<p style="text-align:center; padding:20px; color: var(--secondary-color); font-weight: 500;">No AC Transactions</p>';
    if (tacItems.length > 0) tacListEl.innerHTML = tacItems.map(renderItem).join(''); else tacListEl.innerHTML = '<p style="text-align:center; padding:20px; color: var(--secondary-color); font-weight: 500;">No TAC Transactions</p>';
    if (adItems.length > 0) adListEl.innerHTML = adItems.map(renderItem).join(''); else adListEl.innerHTML = '<p style="text-align:center; padding:20px; color: var(--secondary-color); font-weight: 500;">No AD Transactions</p>';
    playSound();
}

document.addEventListener('DOMContentLoaded', async () => {
  const greetingPopup = document.getElementById('greeting-popup');
  if (greetingPopup) { greetingPopup.classList.add('show'); setTimeout(() => { greetingPopup.classList.remove('show'); }, 2500); }
  document.querySelectorAll('.modal-overlay').forEach(overlay => { overlay.addEventListener('click', (e) => { if(e.target === overlay) { overlay.style.display = 'none'; } }); });
  
  populateStaticFilters('search-year-filter', 'search-month-filter');
  populateStaticFilters('track-year-filter', 'track-month-filter');
  loadTheme();
  
  await syncWithGitHub(false);

  loadDataByDate(true);
  calculateAndSetInitialHighestBusiness();
});
