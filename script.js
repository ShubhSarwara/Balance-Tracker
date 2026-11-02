function openTab(evt, tabName) {
  const tabcontent = document.getElementsByClassName("tab-content");
  for (let i = 0; i < tabcontent.length; i++) {
      tabcontent[i].classList.remove("active");
  }
  const tablinks = document.getElementsByClassName("tab-link");
  for (let i = 0; i < tablinks.length; i++) {
      tablinks[i].classList.remove("active");
  }
  document.getElementById(tabName).classList.add("active");
  evt.currentTarget.classList.add("active");
}

function openSettingsModal() {
    playSound();
    document.getElementById('settings-modal').style.display = 'flex';
}

function closeSettingsModal() {
    playSound();
    document.getElementById('settings-modal').style.display = 'none';
}

const themes = ['vibrant-dark', 'deep-ocean', 'crimson-night', 'forest-haze', 'royal-purple'];
let currentThemeIndex = 0;
let isLightMode = false;

function applyTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('businessSuiteTheme', themeName);
}

function cycleTheme() {
    playSound();
    currentThemeIndex = (currentThemeIndex + 1) % themes.length;
    const newTheme = themes[currentThemeIndex];
    applyTheme(newTheme);
    const themeName = newTheme.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    showToast(`Theme: ${themeName}`);
}

function toggleLightDarkMode() {
    playSound();
    isLightMode = !isLightMode;
    applyLightDarkMode(isLightMode);
    showToast(isLightMode ? "Light Mode Enabled" : "Dark Mode Enabled");
}

function applyLightDarkMode(isLight) {
    const toggleBtn = document.getElementById('theme-mode-toggle');
    if (isLight) {
        document.documentElement.setAttribute('data-theme-mode', 'light');
        toggleBtn.textContent = '🌙'; 
        localStorage.setItem('businessSuiteMode', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme-mode');
        toggleBtn.textContent = '☀️'; 
        localStorage.setItem('businessSuiteMode', 'dark');
    }
}

function loadTheme() {
    const savedTheme = localStorage.getItem('businessSuiteTheme');
    if (savedTheme && themes.includes(savedTheme)) {
        currentThemeIndex = themes.indexOf(savedTheme);
        applyTheme(savedTheme);
    } else {
        applyTheme(themes[0]);
    }

    const savedMode = localStorage.getItem('businessSuiteMode');
    if (savedMode === 'light') {
        isLightMode = true;
        applyLightDarkMode(true);
    } else {
        isLightMode = false;
        applyLightDarkMode(false);
    }
}

// GitHub Cloud Sync Configuration
const GITHUB_USER = "Shubhamsarwara";
const GITHUB_REPO = "Balance-Suite";
const GITHUB_TOKEN = "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";

async function saveToCloud() {
    const allData = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('balanceSheetData_') || key === 'highestDailyBusiness' || key === 'highestDailyBusinessDate') {
            allData[key] = localStorage.getItem(key);
        }
    }
    const contentEncoded = btoa(unescape(encodeURIComponent(JSON.stringify(allData, null, 2))));
    const filePath = "database.json";
    const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${filePath}`;

    try {
        let sha = "";
        const getRes = await fetch(url, {
            headers: { "Authorization": `token ${GITHUB_TOKEN}` }
        });
        if (getRes.ok) {
            const fileData = await getRes.json();
            sha = fileData.sha;
        }

        await fetch(url, {
            method: "PUT",
            headers: {
                "Authorization": `token ${GITHUB_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: "Auto-sync database update",
                content: contentEncoded,
                sha: sha ? sha : undefined
            })
        });
    } catch (e) {
        console.error("Cloud sync failed:", e);
    }
}

async function loadFromCloud() {
    const filePath = "database.json";
    const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${filePath}`;

    try {
        const res = await fetch(url, {
            headers: { "Authorization": `token ${GITHUB_TOKEN}` }
        });
        if (res.ok) {
            const fileData = await res.json();
            const decodedContent = decodeURIComponent(escape(atob(fileData.content)));
            const parsedData = JSON.parse(decodedContent);

            Object.keys(parsedData).forEach(key => {
                localStorage.setItem(key, parsedData[key]);
            });
            loadDataByDate(true);
        }
    } catch (e) {
        console.error("Failed to load from cloud:", e);
    }
}

const tableBody = document.getElementById("tableBody");
const MAX_ROWS = 200; 
let displayedRows = 0;
let currentlyDisplayedDate = new Date();
let lastMilestoneReached = 0;
const HIGHEST_BUSINESS_KEY = 'highestDailyBusiness';
const HIGHEST_BUSINESS_DATE_KEY = 'highestDailyBusinessDate'; 
const SOUND_URL = "https://cdn.pixabay.com/audio/2022/10/18/audio_82c6b4125a.mp3"; 

function playSound() {
  try {
      const audio = new Audio(SOUND_URL);
      audio.play().catch(() => {});
  } catch (e) {}
}

function toggleSearch() {
  playSound();
  const searchContainer = document.getElementById('search-container');
  if (searchContainer.style.display === 'block') {
      clearSearch();
  } else {
      clearReportResults();
      searchContainer.style.display = 'block';
      document.getElementById('search-input').focus();
  }
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
    const year = document.getElementById(yearFilterId).value;
    const month = document.getElementById(monthFilterId).value;
    return { year, month };
}

function performIdSearch() {
  playSound();
  const query = document.getElementById('search-input').value.trim().toUpperCase();
  if (!query) { showToast("Please enter an ID to search."); return; }
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
  const summary = `Found <span>${results.length}</span> transactions. Total Business: <span>₹ ${formatBalance(totalAmount)}</span>`;
  displaySearchResults(results, summary);
}

function performAmountSearch() {
  playSound();
  const query = document.getElementById('search-input').value.trim();
  const queryAmount = parseFloat(query.replace(/,/g, ''));
  if (isNaN(queryAmount)) { showToast("Please enter a valid amount to search."); return; }
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
  const summary = `Found <span>${results.length}</span> transactions for amount <span>₹ ${formatBalance(queryAmount)}</span>. Total: <span>₹ ${formatBalance(totalAmount)}</span>`;
  displaySearchResults(results, summary);
}

function clearSearch() {
  playSound();
  document.getElementById('search-input').value = '';
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('search-results-summary').innerHTML = '';
  document.getElementById('search-container').style.display = 'none';
  document.getElementById('main-content').style.display = 'block';
}

function clearReportResults() {
  playSound();
  document.getElementById('report-results-container').style.display = 'none';
  document.getElementById('main-content').style.display = 'block';
}

function updateHighestBusinessDisplay() {
  const highestBusiness = parseFloat(localStorage.getItem(HIGHEST_BUSINESS_KEY)) || 0;
  const displayEl = document.getElementById('highest-business-display');
  if (displayEl) { displayEl.textContent = `Highest Business: ₹ ${formatBalance(highestBusiness)}`; }
}

function loadHighestBusinessDate() {
  const dateStr = localStorage.getItem(HIGHEST_BUSINESS_DATE_KEY);
  if (!dateStr) {
      showToast("No highest business date recorded.");
      return;
  }
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
  let maxBusiness = 0;
  let maxDateKey = ''; 
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
                          const amountVal = (transaction[4] || '').replace(/,/g, '');
                          const amount = parseFloat(amountVal);
                          if (!isNaN(amount)) { dailyBusiness += amount; }
                      }
                  });
              } catch (e) {}
          }
          if (dailyBusiness > maxBusiness) {
              maxBusiness = dailyBusiness;
              maxDateKey = key;
          }
      }
  }
  localStorage.setItem(HIGHEST_BUSINESS_KEY, maxBusiness);
  if (maxDateKey) {
      localStorage.setItem(HIGHEST_BUSINESS_DATE_KEY, maxDateKey.substring(17));
  }
  updateHighestBusinessDisplay();
}

function getStorageKey(date) { const d = date.getDate().toString().padStart(2, '0'); const m = (date.getMonth() + 1).toString().padStart(2, '0'); const y = date.getFullYear(); return `balanceSheetData_${y}-${m}-${d}`; }

function updateDateDisplay() { 
  const today = new Date(); 
  const isToday = currentlyDisplayedDate.toDateString() === today.toDateString(); 
  document.getElementById("currentDateDisplay").textContent = "DATE: " + currentlyDisplayedDate.toLocaleDateString("en-IN"); 
  document.getElementById('reset-data-button').textContent = `Reset Log`; 
  document.getElementById('businessLabel').textContent = isToday ? "Total Business:" : "Daily Business:"; 
}

function formatBalance(num) { 
    if (num === null || String(num).trim() === '') return '';
    const parsed = parseFloat(String(num).replace(/,/g, ''));
    if (isNaN(parsed)) return '';
    return parsed.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

function showToast(message) { 
  const toast = document.getElementById("toast-notification"); 
  toast.textContent = message; 
  toast.classList.add("show"); 
  playSound();
  setTimeout(() => { toast.classList.remove("show"); }, 4000); 
}

function updateSerialNumbers() { 
    let serial = 0; 
    document.querySelectorAll("#tableBody tr").forEach((row) => {
        const idInput = row.querySelector('input[data-col="2"]');
        const serialInput = row.querySelector('input[data-col="1"]');
        const idValue = idInput ? idInput.value.trim().toUpperCase() : '';
        const idPrefix = idValue.substring(0, 2);

        if (idInput && idValue !== '' && idPrefix !== 'BW' && idPrefix !== 'BD') {
            serialInput.value = ++serial;
        } else {
            serialInput.value = '';
        }
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
    
    if (idPrefix === 'AD' || idPrefix === 'BD' || idNo.startsWith('ABD')) { 
        pTypeInput?.classList.add('text-green'); 
        amountInput?.classList.add('text-green'); 
    } 
    else if (idPrefix === 'AC' || idPrefix === 'BW' || idNo.startsWith('TAC')) { 
        pTypeInput?.classList.add('text-red'); 
        amountInput?.classList.add('text-red'); 
    } 
}

function calculateDailyTotals() {
  let dailyBusiness = 0;
  const rows = document.querySelectorAll("#tableBody tr");
  rows.forEach(row => {
      const idNo = row.querySelector('input[data-col="2"]').value.toUpperCase();
      const amountVal = row.querySelector('input[data-col="4"]').value.replace(/,/g, '');
      const amount = parseFloat(amountVal);
      const idPrefix = idNo.substring(0, 2);
      if (!isNaN(amount) && idPrefix !== 'BD' && idPrefix !== 'BW' && idNo.trim()) {
          dailyBusiness += amount;
      }
  });

  document.getElementById("totalBusinessValue").textContent = `₹ ${formatBalance(dailyBusiness)}`;

  let lastBalance = '0';
  const firstRowBalance = rows.length > 0 ? rows[0].querySelector('input[data-col="0"]').value : '';
  if (firstRowBalance.trim() === '') {
      lastBalance = '0';
  } else {
    for (let i = rows.length - 1; i >= 0; i--) {
      const input = rows[i].querySelector('input[data-col="0"]');
      if (input && input.value.trim() !== '') {
          lastBalance = input.value;
          break;
      }
    }
  }
  document.getElementById("currentBalanceValue").textContent = `₹ ${lastBalance}`;
}

function updateMonthlySummary() { 
    const year = currentlyDisplayedDate.getFullYear(); 
    const month = currentlyDisplayedDate.getMonth(); 
    let monthlyTotalBusiness = 0; 
    let monthlyTotalTransactions = 0; 
    const daysInMonth = new Date(year, month + 1, 0).getDate(); 
    
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day); 
        const key = getStorageKey(date); 
        const dataStr = localStorage.getItem(key);
        if (dataStr) {
            try {
                JSON.parse(dataStr).forEach(transaction => {
                    const idNo = (transaction[2] || '').toUpperCase().trim();
                    if (idNo) {
                        const idPrefix = idNo.substring(0, 2); 
                        if (idPrefix !== 'BD' && idPrefix !== 'BW') { 
                            monthlyTotalTransactions++; 
                            const amount = parseFloat((transaction[4] || '0').replace(/,/g, '')); 
                            if (!isNaN(amount)) { 
                                monthlyTotalBusiness += amount;
                            } 
                        } 
                    }
                });
            } catch(e) {}
        }
    }
    document.getElementById('monthlyBusinessValue').textContent = `₹ ${formatBalance(monthlyTotalBusiness)}`;
    document.getElementById('monthlyTransactions').textContent = `Monthly Transactions: ${monthlyTotalTransactions.toLocaleString('en-IN')}`;
}

function updateCalculations(idToCheck = null) { 
    calculateBalances(); 
    updateSerialNumbers(); 
    calculateDailyTotals(); 
    saveData(false); 
}

function calculateBalances() { 
    const rows = document.querySelectorAll("#tableBody tr"); 
    if (rows.length === 0) return; 
    const firstInput = rows[0].querySelector("input[data-col='0']"); 
    let balance = parseFloat(firstInput.value.trim().replace(/,/g, '')); 
    if (isNaN(balance)) { 
        for (let i = 1; i < rows.length; i++) { rows[i].querySelector("input[data-col='0']").value = ''; } 
        return; 
    } 
    firstInput.value = formatBalance(balance); 
    
    for (let i = 0; i < rows.length - 1; i++) { 
        const currentRow = rows[i]; 
        const nextRow = rows[i + 1]; 
        const idNo = currentRow.querySelector('input[data-col="2"]').value.toUpperCase(); 
        const amountVal = currentRow.querySelector('input[data-col="4"]').value.replace(/,/g, ''); 
        const amount = parseFloat(amountVal); 
        const currentBalVal = currentRow.querySelector("input[data-col='0']").value.replace(/,/g, ''); 
        const currentBal = parseFloat(currentBalVal); 
        const idPrefix = idNo.substring(0, 2); 
        const nextBalanceInput = nextRow.querySelector("input[data-col='0']"); 
        
        if (!isNaN(amount) && !isNaN(currentBal) && idNo) { 
            let newBalance = currentBal; 
            if (idPrefix === 'AD' || idPrefix === 'BD' || idNo.startsWith('ABD')) { 
                newBalance += amount; 
            } 
            else if (idPrefix === 'AC' || idPrefix === 'BW' || idNo.startsWith('TAC')) { 
                newBalance -= amount; 
            } 
            nextBalanceInput.value = formatBalance(newBalance); 
        } else { 
            for (let j = i + 1; j < rows.length; j++) { rows[j].querySelector("input[data-col='0']").value = ''; } 
            break; 
        } 
    } 
}

function createRow(index) { 
    const tr = document.createElement('tr'); 
    for (let i = 0; i < 5; i++) { 
        const td = document.createElement('td'); 
        const input = document.createElement('input'); 
        input.setAttribute('data-row', index); 
        input.setAttribute('data-col', i); 
        if ((i === 0 && index !== 0) || i === 1 || i === 3) { 
            input.readOnly = true; 
            input.setAttribute('tabindex', '-1'); 
        } 
        
        input.addEventListener('input', (e) => { 
            const rowIndex = parseInt(e.target.dataset.row, 10);
            if (rowIndex === displayedRows - 1 && displayedRows < MAX_ROWS) {
                tableBody.appendChild(createRow(displayedRows));
                displayedRows++;
            }
            
            if (i === 2) { 
                const pTypeInput = tr.querySelector('input[data-col="3"]'); 
                let value = e.target.value.toUpperCase(); 
                let prefix = '', numbers = ''; 
                
                if (value.startsWith('TAC')) {
                    prefix = 'TAC';
                    numbers = value.substring(3).replace(/\D/g, '').slice(0, 4);
                } 
                else if (value.startsWith('ABD')) { 
                    prefix = 'ABD'; numbers = value.substring(3).replace(/\D/g, '').slice(0, 4); 
                } else { 
                    const first2 = value.substring(0, 2); 
                    if (['AD', 'AC', 'BD', 'BW'].includes(first2)) { 
                        prefix = first2; numbers = value.substring(2).replace(/\D/g, '').slice(0, 4); 
                    } else { 
                        e.target.value = value.replace(/[^A-Z]/g, '').substring(0, 3); 
                        pTypeInput.value = ''; 
                        updateColumnStyles(tr); 
                        updateCalculations(); 
                        return; 
                    } 
                } 
                e.target.value = prefix + (numbers ? ' ' + numbers : ''); 
                
                if (prefix === 'TAC') pTypeInput.value = 'TPD'; 
                else if (prefix === 'AD' || prefix === 'ABD') pTypeInput.value = 'W'; 
                else if (prefix === 'AC') pTypeInput.value = 'D'; 
                else if (prefix === 'BD') pTypeInput.value = 'BD'; 
                else if (prefix === 'BW') pTypeInput.value = 'BW'; 
                
                updateColumnStyles(tr); 
            } 
            if (i === 4 || i === 0) { 
                e.target.value = formatBalance(e.target.value); 
            } 
            updateCalculations(); 
        }); 

        input.addEventListener('keydown', e => { 
            const row = parseInt(input.dataset.row, 10); 
            const col = parseInt(input.dataset.col, 10); 
            
            if (e.key === 'Backspace' && col === 2) {
                e.preventDefault();
                input.value = '';
                const pTypeInput = tr.querySelector('input[data-col="3"]');
                if (pTypeInput) pTypeInput.value = '';
                const amountInput = tr.querySelector('input[data-col="4"]');
                if (amountInput) amountInput.value = '';
                updateColumnStyles(tr);
                updateCalculations();
                return;
            }

            if (e.key === 'Tab') { 
                if (col === 2) { 
                    e.preventDefault(); 
                    document.querySelector(`input[data-row="${row}"][data-col="4"]`)?.focus(); 
                } else if (col === 4 && row < MAX_ROWS - 1) { 
                    e.preventDefault(); 
                    document.querySelector(`input[data-row="${row + 1}"][data-col="2"]`)?.focus(); 
                } 
            } 
            if (e.key === 'Enter' && (col === 2 || col === 4) && row < MAX_ROWS - 1) { 
                e.preventDefault(); 
                document.querySelector(`input[data-row="${row + 1}"][data-col="${col}"]`)?.focus(); 
            } 
        }); 

        td.appendChild(input); 
        tr.appendChild(td); 
    } 
    return tr; 
}

function fillRows() { 
    tableBody.innerHTML = ''; 
    const initialRows = 5;
    for (let i = 0; i < initialRows; i++) { 
        tableBody.appendChild(createRow(i)); 
    } 
    displayedRows = initialRows;
}

function getCurrentTableData() { return Array.from(document.querySelectorAll("#tableBody tr")).map(row => Array.from({ length: 5 }, (_, col) => row.querySelector(`input[data-col="${col}"]`).value)); }

function setCurrentTableData(data) {
    let lastFilledRowIndex = -1;
    for (let i = data.length - 1; i >= 0; i--) {
        const row = data[i]; 
        if ((row[2] && row[2].trim()) || (row[4] && row[4].trim())) {
            lastFilledRowIndex = i;
            break;
        }
    }
    
    const rowsToShow = Math.min(MAX_ROWS, Math.max(5, lastFilledRowIndex + 2));
    if (rowsToShow > displayedRows) {
        for (let i = displayedRows; i < rowsToShow; i++) {
            tableBody.appendChild(createRow(i));
        }
        displayedRows = rowsToShow;
    }
    
    data.forEach((rowData, i) => { 
        if (i >= displayedRows) return; 
        let row = tableBody.querySelector(`tr:nth-child(${i + 1})`); 
        if (!row) return; 
        rowData.forEach((cellData, col) => { 
            row.querySelector(`input[data-col="${col}"]`).value = cellData || ''; 
        }); 
        updateColumnStyles(row); 
    }); 
    updateCalculations(); 
}

function saveData(showMsg = true) { 
    const key = getStorageKey(currentlyDisplayedDate); 
    const tableData = getCurrentTableData(); 
    localStorage.setItem(key, JSON.stringify(tableData)); 
    
    saveToCloud();

    if (showMsg) { 
        playSound(); 
        showToast("Log Saved & Synced!"); 
    } 
    updateMonthlySummary(); 
}

function copyAllFilledRowsData() { 
    playSound(); 
    const rows = Array.from(document.querySelectorAll("#tableBody tr")).map(row => [1, 2, 3, 4].map(col => row.querySelector(`input[data-col="${col}"]`).value.trim())).filter(rowArr => rowArr.some(val => val !== '')).map(rowArr => rowArr.join('\t')); 
    if (rows.length === 0) return showToast("No data to copy!"); 
    navigator.clipboard.writeText(rows.join('\n')); 
    showToast("Copied to clipboard!"); 
}

function showCustomConfirm(message, onConfirm) {
  const overlay = document.getElementById('custom-confirm-overlay');
  const msgElement = document.getElementById('custom-confirm-message');
  const yesButton = document.getElementById('confirm-yes');
  const noButton = document.getElementById('confirm-no');
  msgElement.textContent = message;
  const newYesButton = yesButton.cloneNode(true);
  yesButton.parentNode.replaceChild(newYesButton, yesButton);

  newYesButton.onclick = () => {
      playSound();
      overlay.style.display = 'none';
      if (typeof onConfirm === 'function') { onConfirm(); }
  };
  noButton.onclick = () => {
      playSound();
      overlay.style.display = 'none';
  };
  overlay.style.display = 'flex';
}

function resetAllData() {
  const message = `Are you sure you want to reset the log for ${currentlyDisplayedDate.toLocaleDateString("en-IN")}? This cannot be undone.`;
  showCustomConfirm(message, () => {
      fillRows();
      saveData(false);
      updateCalculations();
      showToast('Log has been reset.');
  });
}

function exportAllData() { 
    playSound(); 
    let allData = {}; 
    for (let i = 0; i < localStorage.length; i++) { 
        const key = localStorage.key(i); 
        if (key?.startsWith('balanceSheetData_')) { allData[key] = localStorage.getItem(key); } 
    } 
    const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' }); 
    let a = document.createElement('a'); 
    a.href = URL.createObjectURL(blob); 
    a.download = `balancesheet_export_${new Date().toISOString().slice(0, 10)}.json`; 
    a.click(); 
    a.remove(); 
    showToast("All data exported!"); 
}

function importData(event) { 
    const file = event.target.files[0]; 
    if (!file) return; 
    const reader = new FileReader(); 
    reader.onload = function (e) { 
        try { 
            const content = JSON.parse(e.target.result); 
            if (typeof content !== 'object') throw "Invalid format"; 
            let importCount = 0; 
            Object.keys(content).forEach(key => { 
                if (key.startsWith('balanceSheetData_')) { 
                    localStorage.setItem(key, content[key]); 
                    importCount++; 
                } 
            }); 
            playSound(); 
            showToast(`${importCount} logs imported successfully!`); 
            calculateAndSetInitialHighestBusiness(); 
            loadDataByDate(true); 
            saveToCloud();
        } catch (err) { showToast("Import error: " + err); } 
    }; 
    reader.readAsText(file); 
    event.target.value = ""; 
}

function getClosingBalanceFromData(data) {
    if (!data || data.length === 0) return '0';
    for (let i = data.length - 1; i >= 0; i--) {
        const rowData = data[i];
        const balance = rowData[0];
        if (balance && String(balance).trim() !== '') { return String(balance); }
    }
    return '0';
}

function loadDataByDate(forceToday = false) {
    playSound();
    const val = document.getElementById('date-checker').value;
    const dateToLoad = forceToday ? new Date() : (val ? new Date(val) : new Date());
    const timezoneOffset = dateToLoad.getTimezoneOffset() * 60000;
    currentlyDisplayedDate = new Date(dateToLoad.getTime() + timezoneOffset);

    const today = new Date();
    if (currentlyDisplayedDate.toDateString() === today.toDateString()) {
        document.getElementById('back-to-today-btn').style.display = 'none';
        document.getElementById('date-checker').value = ''; 
    }
    
    fillRows(); 
    const storageKey = getStorageKey(currentlyDisplayedDate);
    const dataStr = localStorage.getItem(storageKey);

    if (dataStr) {
        setCurrentTableData(JSON.parse(dataStr)); 
    } else {
        const prevDate = new Date(currentlyDisplayedDate);
        prevDate.setDate(prevDate.getDate() - 1);
        const prevStorageKey = getStorageKey(prevDate);
        const prevDataStr = localStorage.getItem(prevStorageKey);

        if (prevDataStr) {
            try {
                const prevData = JSON.parse(prevDataStr);
                const closingBalance = getClosingBalanceFromData(prevData);
                const firstBalanceInput = tableBody.querySelector('input[data-row="0"][data-col="0"]');
                if (firstBalanceInput) { firstBalanceInput.value = closingBalance; }
            } catch (e) {}
        } else {
            const firstBalanceInput = tableBody.querySelector('input[data-row="0"][data-col="0"]');
            if (firstBalanceInput) { firstBalanceInput.value = '21,950'; }
        }
        updateCalculations();
    }
    updateDateDisplay();
    updateMonthlySummary();
}

function populateStaticFilters(yearFilterId, monthFilterId) {
  const yearFilter = document.getElementById(yearFilterId);
  const monthFilter = document.getElementById(monthFilterId);
  yearFilter.innerHTML = '<option value="all">All Years</option>';
  monthFilter.innerHTML = '<option value="all">All Months</option>';

  for (let year = 2025; year <= 2050; year++) {
      const option = document.createElement('option');
      option.value = year;
      option.textContent = year;
      yearFilter.appendChild(option);
  }

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  for (let i = 0; i < monthNames.length; i++) {
      const option = document.createElement('option');
      option.value = (i + 1).toString().padStart(2, '0');
      option.textContent = monthNames[i];
      monthFilter.appendChild(option);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
          if(e.target === overlay) { overlay.style.display = 'none'; }
      });
  });

  loadTheme();
  populateStaticFilters('search-year-filter', 'search-month-filter');
  
  await loadFromCloud();

  calculateAndSetInitialHighestBusiness();
  loadDataByDate(true);
});