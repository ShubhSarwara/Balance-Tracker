// ===============================================
  // BACKEND / CLOUD SYNC (Google Sheets + Firebase + optional REST API)
  // ===============================================
  // Backend priority: Google Sheets URL (Settings) > Custom API URL
  // (Settings) > Firebase config > local-only mode.
  // Wired to the user's Firebase project (balance-suite-775da). You can
  // still override it by pasting a config JSON in Settings (stored in this
  // browser's localStorage under "businessSuiteFirebaseConfig"), or by
  // setting window.BUSINESS_SUITE_FIREBASE_CONFIG before this script runs.
  // Firebase web config values are public-by-design; protect your data with
  // Firestore security rules. NEVER paste private service-account keys here.
  // If no real config is present, the app works exactly as before on
  // localStorage only and shows "Offline — local only".
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyB5ySrQPFLvH_BxDTE8WYY3W-1ZwzZtyVw",
    authDomain: "balance-suite-775da.firebaseapp.com",
    projectId: "balance-suite-775da",
    storageBucket: "balance-suite-775da.firebasestorage.app",
    messagingSenderId: "619616496610",
    appId: "1:619616496610:web:0c47f3176c7a1da0ce27bb"
  };
  const FIREBASE_CONFIG_KEY = 'businessSuiteFirebaseConfig';
  const API_BASE_KEY = 'businessSuiteApiBase';
  const SHEETS_URL_KEY = 'businessSuiteSheetsUrl';
  const SYNC_META_KEY = 'businessSuiteSyncMeta';
  let cloudDb = null;
  let cloudReady = false;

  function isRealFirebaseConfig(cfg) {
    return !!(cfg && cfg.apiKey && cfg.projectId && cfg.apiKey !== 'YOUR_API_KEY' && cfg.projectId !== 'YOUR_PROJECT_ID');
  }

  function getFirebaseConfig() {
    try {
      if (typeof window !== 'undefined' && window.BUSINESS_SUITE_FIREBASE_CONFIG && isRealFirebaseConfig(window.BUSINESS_SUITE_FIREBASE_CONFIG)) {
        return window.BUSINESS_SUITE_FIREBASE_CONFIG;
      }
    } catch (e) { /* ignore */ }
    try {
      const stored = localStorage.getItem(FIREBASE_CONFIG_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (isRealFirebaseConfig(parsed)) return parsed;
      }
    } catch (e) { /* ignore */ }
    if (isRealFirebaseConfig(FIREBASE_CONFIG)) return FIREBASE_CONFIG;
    return null;
  }

  function getApiBase() {
    try {
      return (localStorage.getItem(API_BASE_KEY) || '').trim().replace(/\/+$/, '');
    } catch (e) { return ''; }
  }

  function getSheetsUrl() {
    try {
      return (localStorage.getItem(SHEETS_URL_KEY) || '').trim();
    } catch (e) { return ''; }
  }

  function getSyncMeta() {
    try { return JSON.parse(localStorage.getItem(SYNC_META_KEY) || '{}'); } catch (e) { return {}; }
  }

  function setSyncMeta(meta) {
    try { localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta)); } catch (e) { /* ignore */ }
  }

  function updateBackendStatus(text) {
    const el = document.getElementById('backend-status');
    if (el) el.textContent = text;
  }

  function toMillis(ts) {
    if (!ts) return 0;
    if (typeof ts === 'string' || typeof ts === 'number') {
      const m = new Date(ts).getTime();
      return isNaN(m) ? 0 : m;
    }
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (typeof ts.toDate === 'function') return ts.toDate().getTime();
    if (typeof ts.seconds === 'number') return ts.seconds * 1000;
    return 0;
  }

  // Google Sheets sometimes stores a "YYYY-MM-DD" date as a real date
  // value; the Apps Script then returns it as a long string like
  // "Wed Nov 18 2026 00:00:00 GMT+0530 (India Standard Time)". The app
  // stores logs under 'balanceSheetData_YYYY-MM-DD', so a mangled date
  // would file the cloud data under a key the app never reads — sync
  // reports success but nothing shows. Normalise any such date back to
  // YYYY-MM-DD. Already-clean dates pass through unchanged.
  function normalizeCloudDate(raw) {
    if (!raw) return raw;
    const s = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  // Google Sheets backend: talks to a Google Apps Script web app deployed
  // from the user's Sheet (see google-sheets/Code.gs). IMPORTANT: only
  // plain GET requests with query parameters are used — Apps Script web
  // apps do not answer CORS preflights, and POST bodies can be lost when
  // the request is redirected. Same interface as the other backends:
  // listLogs() / getLog(date) / saveLog(date, data) / deleteLog(date).
  const sheetsAdapter = {
    async call(params) {
      const url = getSheetsUrl();
      if (!url) throw new Error('Google Sheets URL not set.');
      const sep = url.includes('?') ? '&' : '?';
      const res = await fetch(url + sep + new URLSearchParams(params).toString());
      if (!res.ok) throw new Error('Sheets request failed: ' + res.status);
      const json = await res.json();
      if (json && json.error) throw new Error(json.error);
      return json;
    },
    async health() {
      const json = await this.call({ action: 'health' });
      return !!(json && json.ok);
    },
    async listLogs() {
      const json = await this.call({ action: 'list' });
      const logs = Array.isArray(json.logs) ? json.logs : [];
      return logs.map(l => ({
        date: normalizeCloudDate(l.date),
        data: Array.isArray(l.data) ? l.data : [],
        updatedAtMs: l.updatedAt ? toMillis(l.updatedAt) : 0
      }));
    },
    async getLog(dateStr) {
      const json = await this.call({ action: 'get', date: dateStr });
      if (!json || !Array.isArray(json.data)) return null;
      return { date: normalizeCloudDate(json.date), data: json.data, updatedAtMs: json.updatedAt ? toMillis(json.updatedAt) : 0 };
    },
    async saveLog(dateStr, tableData) {
      const json = await this.call({ action: 'save', date: dateStr, data: JSON.stringify(tableData) });
      return {
        date: json.date || dateStr,
        data: Array.isArray(json.data) ? json.data : tableData,
        updatedAtMs: json.updatedAt ? toMillis(json.updatedAt) : 0
      };
    },
    async deleteLog(dateStr) {
      const json = await this.call({ action: 'delete', date: dateStr });
      return !!(json && json.deleted);
    }
  };

  // Initialise the backend. Priority: Google Sheets URL > custom REST API
  // > Firebase config > local-only mode. Never throws.
  function initFirebase() {
    if (getSheetsUrl()) {
      cloudDb = null;
      cloudReady = false;
      updateBackendStatus('Connected — Google Sheets');
      return;
    }
    const apiBase = getApiBase();
    if (apiBase) {
      cloudDb = null;
      cloudReady = false;
      updateBackendStatus('API mode: ' + apiBase);
      return;
    }
    const cfg = getFirebaseConfig();
    if (!cfg) {
      cloudDb = null;
      cloudReady = false;
      updateBackendStatus('Offline — local only');
      return;
    }
    try {
      if (typeof firebase === 'undefined') {
        updateBackendStatus('Offline — local only (Firebase SDK not loaded)');
        return;
      }
      if (!firebase.apps || firebase.apps.length === 0) {
        firebase.initializeApp(cfg);
      }
      cloudDb = firebase.firestore();
      cloudReady = true;
      updateBackendStatus('Connected: Firebase (' + cfg.projectId + ')');
    } catch (e) {
      console.error('Firebase init failed:', e);
      cloudDb = null;
      cloudReady = false;
      updateBackendStatus('Offline — local only (Firebase error)');
    }
  }

  // Push one day's log to the cloud. Returns false when no backend is set.
  // Throws on failure — callers must catch so local use never breaks.
  async function pushDayToCloud(dateStr, tableData) {
    const apiBase = getApiBase();
    const nowIso = new Date().toISOString();
    if (getSheetsUrl()) {
      await sheetsAdapter.saveLog(dateStr, tableData);
    } else if (apiBase) {
      const res = await fetch(apiBase + '/api/logs/' + dateStr, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: tableData })
      });
      if (!res.ok) throw new Error('API push failed: ' + res.status);
    } else if (cloudReady && cloudDb) {
      await cloudDb.collection('balanceSheetLogs').doc(dateStr).set({
        data: tableData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else {
      return false;
    }
    const meta = getSyncMeta();
    meta[dateStr] = nowIso;
    setSyncMeta(meta);
    return true;
  }

  let cloudPushTimer = null;
  function scheduleCloudPush() {
    try { clearTimeout(cloudPushTimer); } catch (e) { /* ignore */ }
    cloudPushTimer = setTimeout(() => {
      try {
        const key = getStorageKey(currentlyDisplayedDate);
        const dateStr = key.substring(17);
        const dataStr = localStorage.getItem(key);
        if (!dataStr) return;
        pushDayToCloud(dateStr, JSON.parse(dataStr)).catch(err => {
          console.error('Cloud sync failed (local data is safe):', err);
        });
      } catch (e) {
        console.error('Cloud sync failed (local data is safe):', e);
      }
    }, 1000);
  }

  async function fetchCloudLogs() {
    if (getSheetsUrl()) {
      return sheetsAdapter.listLogs();
    }
    const apiBase = getApiBase();
    if (apiBase) {
      const res = await fetch(apiBase + '/api/logs');
      if (!res.ok) throw new Error('API fetch failed: ' + res.status);
      const json = await res.json();
      const logs = Array.isArray(json) ? json : (json.logs || []);
      return logs.map(l => ({
        date: l.date,
        data: Array.isArray(l.data) ? l.data : [],
        updatedAtMs: l.updatedAt ? toMillis(l.updatedAt) : 0
      }));
    }
    if (cloudReady && cloudDb) {
      const snap = await cloudDb.collection('balanceSheetLogs').get();
      const out = [];
      snap.forEach(doc => {
        const d = doc.data() || {};
        out.push({ date: doc.id, data: Array.isArray(d.data) ? d.data : [], updatedAtMs: toMillis(d.updatedAt) });
      });
      return out;
    }
    return [];
  }

  // True when a day's log has at least one real transaction (an ID or an
  // amount). A log with only an opening balance and empty rows counts as
  // empty — opening the app on a fresh device creates exactly such a log,
  // and it must never block the real cloud data from coming in.
  function logHasTransactions(tableData) {
    if (!Array.isArray(tableData)) return false;
    return tableData.some(row => {
      if (!Array.isArray(row)) return false;
      return (row[2] || '').trim() !== '' || (row[4] || '').trim() !== '';
    });
  }

  // Pull cloud logs and merge into localStorage. A cloud log with real
  // transactions wins for a date when there is no local log yet, when the
  // local log has no transactions, or when the cloud copy is newer than
  // that date's last sync time. A cloud log with NO transactions never
  // overwrites local data. Returns
  // the number of days merged, or -1 if the cloud could not be reached at
  // all. Never throws.
  async function pullCloudLogs() {
    try {
      const logs = await fetchCloudLogs();
      if (!logs.length) return 0;
      const meta = getSyncMeta();
      let merged = 0;
      logs.forEach(log => {
        if (!log.date || !Array.isArray(log.data)) return;
        const key = 'balanceSheetData_' + log.date;
        const localRaw = localStorage.getItem(key);
        let localHasData = false;
        if (localRaw) {
          try { localHasData = logHasTransactions(JSON.parse(localRaw)); } catch (e) { localHasData = false; }
        }
        const cloudHasData = logHasTransactions(log.data);
        const lastSyncMs = meta[log.date] ? toMillis(meta[log.date]) : 0;
        const cloudIsNewer = !!meta[log.date] && log.updatedAtMs > 0 && log.updatedAtMs > lastSyncMs;
        // An empty cloud log must NEVER overwrite a local log that has
        // transactions — even when it is newer. (Browsing a date on one
        // device creates an empty local log for it; syncing that device
        // then pushes the empty log to the cloud, and a plain "cloud is
        // newer" check would wipe the good data on the other device.)
        if (cloudHasData && (!localHasData || cloudIsNewer)) {
          localStorage.setItem(key, JSON.stringify(log.data));
          meta[log.date] = new Date(log.updatedAtMs || Date.now()).toISOString();
          merged++;
        }
      });
      setSyncMeta(meta);
      return merged;
    } catch (e) {
      console.error('Cloud pull failed (local data is safe):', e);
      return -1;
    }
  }

  // Pull and merge cloud logs FIRST, then push every local log. Pull-first
  // matters: on a device that only has an empty log for today, pushing
  // first would overwrite the good cloud data with the empty log.
  // Never throws.
  async function syncNow() {
    const apiBase = getApiBase();
    const useSheets = !!getSheetsUrl();
    if (!useSheets && !apiBase && !cloudReady) {
      showToast('No backend configured — working locally.');
      updateBackendStatus('Offline — local only');
      return;
    }
    showToast('Syncing...');
    try {
      const merged = await pullCloudLogs();
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('balanceSheetData_')) keys.push(k);
      }
      let pushed = 0, failed = 0;
      for (const k of keys) {
        try {
          await pushDayToCloud(k.substring(17), JSON.parse(localStorage.getItem(k)));
          pushed++;
        } catch (e) {
          failed++;
          console.error('Push failed for', k, e);
        }
        // Google Sheets (Apps Script) is slow and rate-limited — give it a
        // short breather between days.
        if (useSheets) await new Promise(r => setTimeout(r, 200));
      }
      calculateAndSetInitialHighestBusiness();
      loadDataByDate(true);
      const pullFailed = merged < 0;
      if (failed > 0 && pushed === 0 && pullFailed) {
        updateBackendStatus('Cloud not reachable — check backend settings');
        showToast(useSheets ? 'Sync failed — could not reach the Sheet. Check the URL ends with /exec and deployment access is Anyone.' : 'Sync failed — could not reach the cloud. Check backend settings.');
      } else if (failed > 0 || pullFailed) {
        showToast('Sync partial: ' + pushed + ' day(s) saved, ' + failed + ' failed.' + (pullFailed ? ' Could not read from cloud.' : ''));
      } else {
        showToast('Sync complete. ' + merged + ' day(s) updated from cloud.');
      }
    } catch (e) {
      console.error('Sync failed (local data is safe):', e);
      showToast('Sync failed — local data is safe.');
    }
  }

  // ===============================================
  // START: TAB SYSTEM JAVASCRIPT
  // ===============================================
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
  
  // ===============================================
  // START: NEW THEME SWITCHER
  // ===============================================
  const themes = ['vibrant-dark', 'golden-hour'];
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
          if (toggleBtn) toggleBtn.textContent = '🌙'; 
          localStorage.setItem('businessSuiteMode', 'light');
      } else {
          document.documentElement.removeAttribute('data-theme-mode');
          if (toggleBtn) toggleBtn.textContent = '☀️'; 
          localStorage.setItem('businessSuiteMode', 'dark');
      }
  }

  function loadTheme() {
      const savedTheme = localStorage.getItem('businessSuiteTheme');
      if (savedTheme && themes.includes(savedTheme)) {
          currentThemeIndex = themes.indexOf(savedTheme);
          applyTheme(savedTheme);
      } else {
          applyTheme(themes[0]); // Apply default
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

  // ===============================================
  // START: NEW HELPERS
  // ===============================================
  
  function debounce(func, delay) {
      let timeout;
      return function(...args) {
          clearTimeout(timeout);
          timeout = setTimeout(() => func.apply(this, args), delay);
      };
  }

  // Balances are always shown — the hide/show (monkey) toggle was removed.
  function updateMaskableBalance(targetId, newValue) {
      const targetElement = document.getElementById(targetId);
      if (!targetElement) return;
      targetElement.textContent = newValue;
  }


  // ===============================================
  // START: BALANCE SHEET JAVASCRIPT
  // ===============================================
  const tableBody = document.getElementById("tableBody");
  const MAX_ROWS = 200; 
  let displayedRows = 0;
  let currentlyDisplayedDate = new Date();
  let lastMilestoneReached = 0;
  let isLowBalanceAlertShown = false;
  let monthlyAlertsShown = {};
  let currentHighCountResults = []; 
  const HIGHEST_BUSINESS_KEY = 'highestDailyBusiness';
  const HIGHEST_BUSINESS_DATE_KEY = 'highestDailyBusinessDate'; 
  const SOUND_URL = "https://cdn.pixabay.com/audio/2022/10/18/audio_82c6b4125a.mp3"; 
  
  function playSound() {
    try {
        const audio = new Audio(SOUND_URL);
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => console.error("Audio play failed:", error));
        }
    } catch (e) {
        console.error("Could not play sound:", e);
    }
  }
  

  function toggleSearch() {
    playSound();
    const searchContainer = document.getElementById('search-container');
    if (!searchContainer) return;
    if (searchContainer.style.display === 'block') {
        clearSearch();
    } else {
        clearReportResults();
        searchContainer.style.display = 'block';
        const searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.focus();
    }
  }

  function displaySearchResults(results, summaryText) {
    const resultsContainer = document.getElementById('search-results');
    const summaryContainer = document.getElementById('search-results-summary');
    const mainContent = document.getElementById('main-content');
    if (mainContent) mainContent.style.display = 'none';
    if (!resultsContainer || !summaryContainer) return;
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
      const yearEl = document.getElementById(yearFilterId);
      const monthEl = document.getElementById(monthFilterId);
      const year = yearEl ? yearEl.value : 'all';
      const month = monthEl ? monthEl.value : 'all';
      return { year, month };
  }

  function performIdSearch() {
    playSound();
    const searchInput = document.getElementById('search-input');
    const query = searchInput ? searchInput.value.trim().toUpperCase() : '';
    if (!query) { showToast("Please enter an ID to search."); return; }
    const { year: yearFilter, month: monthFilter } = getSelectedFilters('search-year-filter', 'search-month-filter');
    const typeFilterEl = document.getElementById('search-type-filter');
    const typeFilter = typeFilterEl ? typeFilterEl.value : 'both';
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
    const searchInput = document.getElementById('search-input');
    const query = searchInput ? searchInput.value.trim() : '';
    const queryAmount = parseFloat(query.replace(/,/g, ''));
    if (isNaN(queryAmount)) { showToast("Please enter a valid amount to search."); return; }
    const { year: yearFilter, month: monthFilter } = getSelectedFilters('search-year-filter', 'search-month-filter');
    const typeFilterEl = document.getElementById('search-type-filter');
    const typeFilter = typeFilterEl ? typeFilterEl.value : 'both';
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
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    const resultsEl = document.getElementById('search-results');
    if (resultsEl) resultsEl.innerHTML = '';
    const summaryEl = document.getElementById('search-results-summary');
    if (summaryEl) summaryEl.innerHTML = '';
    const searchContainer = document.getElementById('search-container');
    if (searchContainer) searchContainer.style.display = 'none';
    const mainContent = document.getElementById('main-content');
    if (mainContent) mainContent.style.display = 'block';
  }
  
  function getAllTransactorData(yearFilter, monthFilter) {
    const transactorData = {};
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
                const idNo = (t[2] || '').trim(); if (!idNo) return;
                const amount = parseFloat((t[4] || '0').replace(/,/g, '')); if (isNaN(amount)) return;
                if (!transactorData[idNo]) {
                    transactorData[idNo] = { totalBusiness: 0, transactionCount: 0, allTransactions: [] };
                }
                if (!idNo.toUpperCase().startsWith('BW') && !idNo.toUpperCase().startsWith('BD')) {
                    transactorData[idNo].totalBusiness += amount;
                    transactorData[idNo].transactionCount++;
                }
                transactorData[idNo].allTransactions.push({ date: datePart, sno: parseInt(t[1] || '0'), id: t[2], ptype: t[3], amount: amount });
            });
        }
    }
    return transactorData;
  }

  // In-page report filtering stub: reports are generated as PDFs, so the
  // report-results panel is never populated. Kept so the filter dropdown's
  // onchange handler never throws a ReferenceError.
  function filterDisplayedReport() {
    return;
  }
  
  function clearReportResults() {
    playSound();
    const container = document.getElementById('report-results-container');
    if (container) container.style.display = 'none';
    const mainContent = document.getElementById('main-content');
    if (mainContent) mainContent.style.display = 'block';
    currentHighCountResults = [];
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
    const dateChecker = document.getElementById('date-checker');
    if (dateChecker) dateChecker.value = dateStr;
    loadDataByDate();
    const backBtn = document.getElementById('back-to-today-btn');
    if (backBtn) backBtn.style.display = 'inline-block';
    showToast(`Loading log for high score date: ${dateStr}`);
  }

  function loadToday() {
    playSound();
    const dateChecker = document.getElementById('date-checker');
    if (dateChecker) dateChecker.value = '';
    loadDataByDate(true);
    const backBtn = document.getElementById('back-to-today-btn');
    if (backBtn) backBtn.style.display = 'none';
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
                } catch (e) { console.error(`Could not parse data for key ${key}:`, e); }
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
    const dateDisplay = document.getElementById("currentDateDisplay");
    if (dateDisplay) dateDisplay.textContent = "DATE: " + currentlyDisplayedDate.toLocaleDateString("en-IN"); 
    const resetBtn = document.getElementById('reset-data-button');
    if (resetBtn) resetBtn.textContent = `Reset Log`; 
    const businessLabel = document.getElementById('businessLabel');
    if (businessLabel) businessLabel.textContent = isToday ? "Total Business:" : "Daily Business:"; 
  }
  function formatBalance(num) { 
      if (num === null || String(num).trim() === '') return '';
      const parsed = parseFloat(String(num).replace(/,/g, ''));
      if (isNaN(parsed)) return '';
      return parsed.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
  }
  function showToast(message) { 
    const toast = document.getElementById("toast-notification"); 
    if (!toast) return;
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

    const totalBusinessEl = document.getElementById("totalBusinessValue");
    if (totalBusinessEl) totalBusinessEl.textContent = `₹ ${formatBalance(dailyBusiness)}`;

    let lastBalance = '0';
    const firstRowBalance = rows.length > 0 ? rows[0].querySelector('input[data-col="0"]').value : '';
    if (firstRowBalance.trim() === '') {
        lastBalance = '0';
    } else {
      for (let i = rows.length - 1; i >= 0; i--) {
        const input = rows[i].querySelector("input[data-col='0']");
        if (input && input.value.trim() !== '') {
            lastBalance = input.value;
            break;
        }
      }
    }
    updateMaskableBalance("currentBalanceValue", `₹ ${lastBalance}`);
    
    const today = new Date();
    if (currentlyDisplayedDate.toDateString() === today.toDateString()) {
        const currentLakh = Math.floor(dailyBusiness / 100000);
        if (currentLakh > 0 && currentLakh > lastMilestoneReached) {
            lastMilestoneReached = currentLakh;
            showToast(`🎉 Milestone Reached: ₹${formatBalance(lastMilestoneReached * 100000)} in business!`);
        } else if (currentLakh < lastMilestoneReached) {
            lastMilestoneReached = currentLakh;
        }
    }
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
              } catch(e) { /* ignore */ }
          }
      }
      updateMaskableBalance('monthlyBusinessValue', `₹ ${formatBalance(monthlyTotalBusiness)}`);
      const monthlyTxEl = document.getElementById('monthlyTransactions');
      if (monthlyTxEl) monthlyTxEl.textContent = `Monthly Transactions: ${monthlyTotalTransactions.toLocaleString('en-IN')}`;
  }
  
  function checkAndNotifyForMilestone(idNo) { if (!idNo) return; const idPrefix = idNo.substring(0, 2).toUpperCase(); const idNumberPart = idNo.replace(/\D/g, ''); if (!idNumberPart || !(idPrefix === 'AC' || idPrefix === 'AD' || idNo.toUpperCase().startsWith('ABD'))) { return; } const year = currentlyDisplayedDate.getFullYear(); const month = currentlyDisplayedDate.getMonth(); const alertKey = `${year}-${month}-${idNumberPart}`; if (monthlyAlertsShown[alertKey]) { return; } const monthKeyPrefix = `balanceSheetData_${year}-${(month + 1).toString().padStart(2, '0')}`; let count = 0; for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key && key.startsWith(monthKeyPrefix)) { const data = JSON.parse(localStorage.getItem(key) || '[]'); data.forEach(t => { const transactionId = (t[2] || '').trim().toUpperCase(); if (transactionId.replace(/\D/g, '') === idNumberPart) { count++; } }); } } if (count === 10) { showToast('This ID completed 10 transactions.'); monthlyAlertsShown[alertKey] = true; } }
  function updateCalculations(idToCheck = null) { calculateBalances(); updateSerialNumbers(); calculateDailyTotals(); saveData(false); if (idToCheck) { checkAndNotifyForMilestone(idToCheck); } }
  
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
              
              if (newBalance < 0) { 
                  showToast(`CRITICAL ERROR: Balance negative at row ${i + 1}. Transaction invalid.`); 
                  currentRow.querySelector('input[data-col="2"]').value = ''; 
                  currentRow.querySelector('input[data-col="3"]').value = ''; 
                  currentRow.querySelector('input[data-col="4"]').value = ''; 
                  updateColumnStyles(currentRow); 
                  calculateBalances(); 
                  return; 
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
                  const pType = pTypeInput; 
                  
                  if (prefix === 'TAC') pType.value = 'TPD'; 
                  else if (prefix === 'AD' || prefix === 'ABD') pType.value = 'W'; 
                  else if (prefix === 'AC') pType.value = 'D'; 
                  else if (prefix === 'BD') pType.value = 'BD'; 
                  else if (prefix === 'BW') pType.value = 'BW'; 
                  
                  updateColumnStyles(tr); 
              } 
              if (i === 4 || i === 0) { 
                  e.target.value = formatBalance(e.target.value); 
              } 
              updateCalculations(i === 2 ? e.target.value : null); 
          }); 
          input.addEventListener('keydown', e => { 
              const row = parseInt(input.dataset.row, 10); 
              const col = parseInt(input.dataset.col, 10); 
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
      let currentDayBusiness = 0; 
      tableData.forEach(transaction => { 
          const idNo = (transaction[2] || '').toUpperCase(); 
          if (idNo.trim() && !idNo.startsWith('BD') && !idNo.startsWith('BW')) { 
              const amountVal = (transaction[4] || '0').replace(/,/g, ''); 
              const amount = parseFloat(amountVal); 
              if (!isNaN(amount)) { currentDayBusiness += amount; } 
          } 
      }); 
      const storedHighest = parseFloat(localStorage.getItem(HIGHEST_BUSINESS_KEY)) || 0; 
      if (currentDayBusiness > storedHighest) { 
          localStorage.setItem(HIGHEST_BUSINESS_KEY, currentDayBusiness); 
          localStorage.setItem(HIGHEST_BUSINESS_DATE_KEY, key.substring(17)); 
          updateHighestBusinessDisplay(); 
          showToast(`🎉 New High Score! Daily Business: ₹ ${formatBalance(currentDayBusiness)}`); 
      } 
      if (showMsg) { 
          playSound(); 
          showToast("Log Saved!"); 
      } else {
          const statusEl = document.getElementById('autosave-status');
          if (statusEl) statusEl.textContent = 'Auto-saved ✓ ' + new Date().toLocaleTimeString('en-IN');
      }
      updateMonthlySummary(); 
      scheduleCloudPush();
  }
  
  function showCustomConfirm(message, onConfirm) {
    const overlay = document.getElementById('custom-confirm-overlay');
    const msgElement = document.getElementById('custom-confirm-message');
    const yesButton = document.getElementById('confirm-yes');
    const noButton = document.getElementById('confirm-no');
    if (!overlay || !msgElement || !yesButton || !noButton) return;

    msgElement.textContent = message;

    const newYesButton = yesButton.cloneNode(true);
    yesButton.parentNode.replaceChild(newYesButton, yesButton);

    newYesButton.onclick = () => {
        playSound();
        overlay.style.display = 'none';
        if (typeof onConfirm === 'function') {
            onConfirm();
        }
    };

    noButton.onclick = () => {
        playSound();
        overlay.style.display = 'none';
    };

    overlay.style.display = 'flex';
  }

  function resetAllData() {
    const message = `Are you sure you want to reset the log for ${currentlyDisplayedDate.toLocaleDateString("en-IN")}? The opening balance (O.BALANCE) will be kept. This cannot be undone.`;
    showCustomConfirm(message, () => {
        const firstBalanceInput = tableBody.querySelector('input[data-row="0"][data-col="0"]');
        const openingBalance = firstBalanceInput ? firstBalanceInput.value : '';
        fillRows();
        const newFirstBalanceInput = tableBody.querySelector('input[data-row="0"][data-col="0"]');
        if (newFirstBalanceInput) newFirstBalanceInput.value = openingBalance;
        saveData(false);
        updateCalculations();
        showToast('Log has been reset. Opening balance kept.');
    });
  }

  // Delete EVERY day's log stored in THIS browser only (all dates). Used
  // for a clean fresh start. Connection settings (Sheets URL, Firebase
  // config, API URL) are kept. The cloud copy (Google Sheet / Firebase)
  // is NOT touched — clear it separately if you want a full reset. Does
  // not pull from the cloud afterwards, so deleted data cannot come back
  // on this device until the next Sync Now.
  function deleteAllLocalData() {
    const message = 'Are you sure you want to delete ALL logs on THIS device (every date)? This cannot be undone. Your Google Sheet is not affected.';
    showCustomConfirm(message, () => {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('balanceSheetData_')) keys.push(key);
        }
        keys.forEach(k => localStorage.removeItem(k));
        try { localStorage.removeItem(SYNC_META_KEY); } catch (e) { /* ignore */ }
        playSound();
        closeSettings();
        calculateAndSetInitialHighestBusiness();
        loadDataByDate(true);
        showToast('All data deleted from this device.');
    });
  }

  function exportAllData() { playSound(); let allData = {}; for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key?.startsWith('balanceSheetData_')) { allData[key] = localStorage.getItem(key); } } const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' }); let a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `balancesheet_export_${new Date().toISOString().slice(0, 10)}.json`; a.click(); a.remove(); showToast("All data exported!"); }
  function importData(event) { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = function (e) { try { const content = JSON.parse(e.target.result); if (typeof content !== 'object') throw "Invalid format"; let importCount = 0; Object.keys(content).forEach(key => { if (key.startsWith('balanceSheetData_')) { localStorage.setItem(key, content[key]); importCount++; } }); playSound(); showToast(`${importCount} logs imported successfully!`); calculateAndSetInitialHighestBusiness(); loadDataByDate(true); } catch (err) { showToast("Import error: " + err); } }; reader.readAsText(file); event.target.value = ""; }
  
  function getClosingBalanceFromData(data) {
      if (!data || data.length === 0) return '0';
      for (let i = data.length - 1; i >= 0; i--) {
          const rowData = data[i];
          const balance = rowData[0];
          if (balance && String(balance).trim() !== '') {
              return String(balance);
          }
      }
      return '0';
  }

  function loadDataByDate(forceToday = false) {
      playSound();
      const dateChecker = document.getElementById('date-checker');
      const val = dateChecker ? dateChecker.value : '';
      const dateToLoad = forceToday ? new Date() : (val ? new Date(val) : new Date());
      const timezoneOffset = dateToLoad.getTimezoneOffset() * 60000;
      currentlyDisplayedDate = new Date(dateToLoad.getTime() + timezoneOffset);

      const today = new Date();
      if (currentlyDisplayedDate.toDateString() === today.toDateString()) {
          const backBtn = document.getElementById('back-to-today-btn');
          if (backBtn) backBtn.style.display = 'none';
          if (dateChecker) dateChecker.value = ''; 
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
                  if (firstBalanceInput) {
                      firstBalanceInput.value = closingBalance;
                  }
              } catch (e) {
                  console.error("Could not parse previous day's data", e);
              }
          } else {
              const firstBalanceInput = tableBody.querySelector('input[data-row="0"][data-col="0"]');
              if (firstBalanceInput) {
                  firstBalanceInput.value = '21,950';
              }
          }
          updateCalculations();
      }
      updateDateDisplay();
      updateMonthlySummary();
  }
  
  function createStyledPDF() { 
      if (typeof jspdf === 'undefined') { 
          showToast('Report generation failed. PDF library not loaded.'); 
          return null; 
      } 
      const { jsPDF } = jspdf; 
      const doc = new jsPDF(); 
      doc.setFont('helvetica'); 
      return doc; 
  }

  function addWatermarkToPdf(doc) {
      const totalPages = doc.internal.getNumberOfPages();
      const watermarkFont = 'times';
      const watermarkStyle = 'italic';
      const watermarkText = ""; 

      for (let i = 1; i <= totalPages; i++) {
          doc.setPage(i);
          doc.setFont(watermarkFont, watermarkStyle);
          doc.setTextColor(220, 220, 220); 
          doc.setFontSize(45); 
          
          const pageHeight = doc.internal.pageSize.getHeight();
          const pageWidth = doc.internal.pageSize.getWidth();

          doc.text(watermarkText, pageWidth / 2, pageHeight / 2, {
              angle: 0, 
              align: 'center'
          });
      }
      doc.setTextColor(0, 0, 0); 
  }
    
  function getDetailedDataForPeriod(startDate, endDate) { 
      const data = {}; 
      
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) { 
          const key = getStorageKey(d); 
          const dataStr = localStorage.getItem(key); 
          if (dataStr) { 
              const dayTransactions = []; 
              let dailyBusiness = 0; 
              let dailyTransactions = 0; 
              try { 
                  JSON.parse(dataStr).forEach(t => { 
                      const idNo = (t[2] || '').toUpperCase(); 
                      if (idNo.trim()) { 
                          const amountVal = (t[4] || '0').replace(/,/g, ''); 
                          const amount = parseFloat(amountVal); 
                          dayTransactions.push({ sno: t[1] || '', id: idNo, ptype: t[3] || '', amount: amountVal }); 
                          if (!idNo.startsWith('BD') && !idNo.startsWith('BW')) { 
                              dailyTransactions++; 
                              if (!isNaN(amount)) dailyBusiness += amount; 
                          } 
                      } 
                  }); 
              } catch (e) { continue; } 
              if (dayTransactions.length > 0) { 
                  const year = d.getFullYear(); 
                  const month = d.getMonth(); 
                  const monthKey = `${year}-${(month + 1).toString().padStart(2, '0')}`; 
                  const monthName = d.toLocaleString('en-IN', { month: 'long' }); 
                  if (!data[monthKey]) { 
                      data[monthKey] = { monthName, year, totalBusiness: 0, totalTransactions: 0, days: {} }; 
                  } 
                  data[monthKey].totalBusiness += dailyBusiness; 
                  data[monthKey].totalTransactions += dailyTransactions; 
                  data[monthKey].days[key] = { dateStr: d.toLocaleDateString("en-IN"), dailyBusiness, dailyTransactions, transactions: dayTransactions }; 
              } 
          } 
      }
      return data; 
  }
  
  function drawReportHeader(doc) { 
      doc.setFontSize(20).setFont('helvetica', 'bold').setTextColor('#009688').text(`Business Report`, 105, 20, { align: 'center' }); 
      doc.setFontSize(12).setFont('helvetica', 'normal').setTextColor('#424242').text(`Generated on: ${new Date().toLocaleDateString("en-IN")}`, 105, 30, { align: 'center' }); 
      doc.setDrawColor('#424242').line(15, 35, 195, 35); 
      return 45; 
  }

  function addHighCountSummaryToPdf(doc, startDate, endDate) {
    const transactorData = {};
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const key = getStorageKey(d);
        const dataStr = localStorage.getItem(key);
        if (dataStr) {
            try {
                const data = JSON.parse(dataStr);
                data.forEach(t => {
                    const idNo = (t[2] || '').trim(); if (!idNo) return;
                    const amount = parseFloat((t[4] || '0').replace(/,/g, '')); if (isNaN(amount)) return;
                    const datePart = key.substring(17);

                    if (!transactorData[idNo]) {
                        transactorData[idNo] = { transactionCount: 0, allTransactions: [] };
                    }
                    if (!idNo.toUpperCase().startsWith('BW') && !idNo.toUpperCase().startsWith('BD')) {
                        transactorData[idNo].transactionCount++;
                    }
                    transactorData[idNo].allTransactions.push({ 
                        date: datePart, 
                        sno: parseInt(t[1] || '0'), 
                        id: t[2], 
                        amount: amount 
                    });
                });
            } catch (e) {
                console.error(`Could not parse data for key ${key} in high count summary:`, e);
            }
        }
    }

    const finalResults = [];
    for (const id in transactorData) {
        const transactor = transactorData[id];
        if (transactor.transactionCount > 10) {
            transactor.allTransactions.sort((a, b) => a.date.localeCompare(b.date) || a.sno - b.sno);
            const businessTransactions = transactor.allTransactions.filter(t => {
                const idNoUpper = t.id.toUpperCase();
                return !idNoUpper.startsWith('BW') && !idNoUpper.startsWith('BD');
            });
            const totalBusiness = businessTransactions.reduce((sum, t) => sum + t.amount, 0); 
            finalResults.push({
                id: id,
                transactionCount: transactor.transactionCount,
                totalBusiness: totalBusiness
            });
        }
    }
    if (finalResults.length === 0) return;
    finalResults.sort((a, b) => b.transactionCount - a.transactionCount);
    doc.addPage();
    let y = 20;
    doc.setFontSize(16).setFont('helvetica', 'bold').setTextColor('#009688').text(`High-Frequency Transactors Summary`, 105, y, { align: 'center' }); 
    y += 10;
    
    const tableBody = finalResults.map(item => [
        item.id,
        item.transactionCount,
        `₹ ${formatBalance(item.totalBusiness)}` 
    ]);
    
    doc.autoTable({
        startY: y,
        head: [['ID No.', 'Total Transactions', 'Total Business']], 
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [33, 33, 33] }, 
        styles: { font: 'helvetica' }
    });
  }
  
  function generateDetailedReport(data, doc, startDate, endDate) { 
      let y = drawReportHeader(doc); 
      let isFirstMonth = true; 
      const sortedMonthKeys = Object.keys(data).sort(); 
      for (const monthKey of sortedMonthKeys) { 
          const monthData = data[monthKey]; 
          if (!isFirstMonth) { doc.addPage(); y = 20; } 
          else { isFirstMonth = false; } 
          
          doc.setFontSize(16).setFont('helvetica', 'bold').setTextColor('#009688').text(`Report for ${monthData.monthName} ${monthData.year}`, 105, y, { align: 'center' }); 
          y += 10; 
          doc.setFontSize(12).setFont('helvetica', 'bold').setTextColor(0,0,0).text(`Monthly Business: ₹ ${formatBalance(monthData.totalBusiness)}`, 15, y); 
          doc.text(`Monthly Transactions: ${monthData.totalTransactions.toLocaleString('en-IN')}`, 195, y, { align: 'right' }); 
          y += 5; 
          doc.setDrawColor('#424242').line(15, y, 195, y); 
          y += 10; 
          
          const sortedDayKeys = Object.keys(monthData.days).sort(); 
          for (const dayKey of sortedDayKeys) { 
              const dayData = monthData.days[dayKey];
              const tableBody = dayData.transactions.map(t => [t.sno, t.id, t.ptype, { content: formatBalance(t.amount), styles: { halign: 'right' } }]);
              
              if (y > 230) { doc.addPage(); y = 20; }
              
              doc.setFontSize(12).setFont('helvetica', 'bold').setTextColor('#E0E0E0').setFillColor(48, 48, 48).rect(15, y-5, 180, 8, 'F'); 
              doc.text(`Date: ${dayData.dateStr}`, 20, y);
              y += 10;
              doc.setFontSize(10).setFont('helvetica', 'normal').setTextColor(0,0,0).text(`Daily Business: ₹ ${formatBalance(dayData.dailyBusiness)}`, 20, y);
              doc.text(`Total Transactions: ${dayData.transactions.length}`, 190, y, { align: 'right' });
              y += 5;

              doc.autoTable({
                  startY: y,
                  head: [['S.No.', 'ID No.', 'P Type', 'Amount (₹)']],
                  body: tableBody,
                  theme: 'grid',
                  headStyles: { fillColor: [33, 33, 33] }, 
                  styles: { font: 'helvetica', fontSize: 9 },
                  didDrawPage: (data) => { y = data.cursor.y + 5; }
              });
              y = doc.autoTable.previous.finalY + 10;
          } 
      }
      addHighCountSummaryToPdf(doc, startDate, endDate);
  }
  
  function createCurrentMonthPDF() { 
      playSound();
      const doc = createStyledPDF(); if (!doc) return; 
      const year = currentlyDisplayedDate.getFullYear(); 
      const month = currentlyDisplayedDate.getMonth(); 
      const startDate = new Date(year, month, 1); 
      const endDate = new Date(year, month + 1, 0); 
      const data = getDetailedDataForPeriod(startDate, endDate); 
      if (Object.keys(data).length === 0) return showToast("No data available for the current month."); 
      generateDetailedReport(data, doc, startDate, endDate);
      addWatermarkToPdf(doc);
      doc.save(`Monthly_Report_${currentlyDisplayedDate.toLocaleString('en-IN', { month: 'long' })}_${year}.pdf`); 
      showToast('Report generated!'); 
  }
  
  function createAllMonthsPDF() { 
      playSound();
      const doc = createStyledPDF(); if (!doc) return; 
      const keys = Object.keys(localStorage).filter(k => k.startsWith('balanceSheetData_')).sort(); 
      if (keys.length === 0) return showToast("No data available to generate a report."); 
      const firstDateParts = keys[0].substring(17).split('-'); 
      const lastDateParts = keys[keys.length - 1].substring(17).split('-'); 
      const startDate = new Date(parseInt(firstDateParts[0]), parseInt(firstDateParts[1]) - 1, 1); 
      const endDate = new Date(parseInt(lastDateParts[0]), parseInt(lastDateParts[1]) - 1, parseInt(lastDateParts[2])); 
      const data = getDetailedDataForPeriod(startDate, endDate); 
      generateDetailedReport(data, doc, startDate, endDate); 
      addWatermarkToPdf(doc);
      doc.save(`All_Time_Report.pdf`); 
      showToast('All-Time Report generated!'); 
  }
  
  function createCustomMonthPDF() { 
      playSound();
      const selectedMonths = Array.from(document.querySelectorAll('#month-selection-container input:checked')).map(cb => cb.value); 
      if (selectedMonths.length === 0) return showToast("Please select at least one month."); 
      const customOverlay = document.getElementById('custom-month-selection-overlay');
      if (customOverlay) customOverlay.style.display = 'none'; 
      const doc = createStyledPDF(); if (!doc) return; 
      
      let overallStartDate = null;
      let overallEndDate = null;
      const fullData = {}; 

      selectedMonths.sort().forEach(monthKey => { 
          const [year, month] = monthKey.split('-'); 
          const startDate = new Date(year, parseInt(month) - 1, 1); 
          const endDate = new Date(year, parseInt(month), 0); 
          
          if (!overallStartDate) overallStartDate = new Date(startDate);
          overallEndDate = new Date(endDate);

          Object.assign(fullData, getDetailedDataForPeriod(startDate, endDate)); 
      }); 
      
      if (Object.keys(fullData).length === 0) return showToast("No data found for selected months."); 
      generateDetailedReport(fullData, doc, overallStartDate, overallEndDate); 
      addWatermarkToPdf(doc);
      doc.save(`Custom_Report.pdf`); 
      showToast('Custom report generated!');
  }
  
  function showReportSelection() {
    playSound();
    const overlay = document.getElementById('report-selection-overlay');
    if (overlay) overlay.style.display = 'flex';
  }
  
  function showCustomMonthSelection() { 
      playSound();
      const reportOverlay = document.getElementById('report-selection-overlay');
      if (reportOverlay) reportOverlay.style.display = 'none'; 
      const container = document.getElementById('month-selection-container'); 
      if (!container) return;
      container.innerHTML = ''; 
      const availableMonths = {}; 
      const today = new Date(); 
      const currentYear = today.getFullYear(); 
      const currentMonth = today.getMonth(); 
      for (let i = 0; i < localStorage.length; i++) { 
          const key = localStorage.key(i); 
          if (key?.startsWith('balanceSheetData_')) { 
              const [year, month] = key.substring(17).split('-'); 
              const yearNum = parseInt(year); 
              const monthNum = parseInt(month) - 1; 
              if (yearNum >= 2025 && (yearNum < currentYear || (yearNum === currentYear && monthNum <= currentMonth))) { 
                  if (!availableMonths[year]) availableMonths[year] = new Set(); 
                  availableMonths[year].add(month); 
              } 
          } 
      } 
      const sortedYears = Object.keys(availableMonths).sort((a,b) => b-a); 
      if (sortedYears.length === 0) { 
          container.innerHTML = '<p style="text-align: center;">No past data available.</p>'; 
      } 
      sortedYears.forEach(year => { 
          const yearContainer = document.createElement('div'); 
          yearContainer.className = 'year-container'; 
          const yearHeader = document.createElement('div'); 
          yearHeader.className = 'year-header'; 
          yearHeader.textContent = `Year: ${year}`; 
          yearContainer.appendChild(yearHeader); 
          const monthsGrid = document.createElement('div'); 
          monthsGrid.className = 'months-grid'; 
          Array.from(availableMonths[year]).sort((a,b) => a-b).forEach(month => { 
              const monthName = new Date(year, parseInt(month) - 1).toLocaleString('en-IN', { month: 'long' }); 
              const monthId = `month-${year}-${month}`; 
              const label = document.createElement('label'); 
              label.className = 'month-label'; 
              label.htmlFor = monthId; 
              const checkbox = document.createElement('input'); 
              checkbox.type = 'checkbox'; 
              checkbox.id = monthId; 
              checkbox.value = `${year}-${month}`; 
              const span = document.createElement('span'); 
              span.textContent = monthName; 
              label.appendChild(checkbox); 
              label.appendChild(span); 
              monthsGrid.appendChild(label); 
          }); 
          yearContainer.appendChild(monthsGrid); 
          container.appendChild(yearContainer); 
      }); 
      const customOverlay = document.getElementById('custom-month-selection-overlay');
      if (customOverlay) customOverlay.style.display = 'flex'; 
  }
  
  function populateStaticFilters(yearFilterId, monthFilterId) {
    const yearFilter = document.getElementById(yearFilterId);
    const monthFilter = document.getElementById(monthFilterId);
    if (!yearFilter || !monthFilter) return;
    
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
        const monthValue = (i + 1).toString().padStart(2, '0');
        option.value = monthValue;
        option.textContent = monthNames[i];
        monthFilter.appendChild(option);
    }
  }

  // ===============================================
  // START: SETTINGS MODAL LOGIC
  // ===============================================
  function openSettings() {
    playSound();
    const overlay = document.getElementById('settings-modal');
    if (!overlay) return;
    const cfgInput = document.getElementById('firebase-config-input');
    if (cfgInput) {
      try { cfgInput.value = localStorage.getItem(FIREBASE_CONFIG_KEY) || ''; } catch (e) { /* ignore */ }
    }
    const apiInput = document.getElementById('api-base-input');
    if (apiInput) apiInput.value = getApiBase();
    const sheetsInput = document.getElementById('sheets-url-input');
    if (sheetsInput) sheetsInput.value = getSheetsUrl();
    initFirebase(); // refresh the backend status line
    overlay.style.display = 'flex';
  }

  function closeSettings() {
    const overlay = document.getElementById('settings-modal');
    if (overlay) overlay.style.display = 'none';
  }

  function openReportFromSettings() {
    closeSettings();
    showReportSelection();
  }

  function connectFirebaseFromSettings() {
    const input = document.getElementById('firebase-config-input');
    if (!input) return;
    const raw = input.value.trim();
    if (!raw) { showToast('Paste your Firebase config JSON first.'); return; }
    try {
      const cfg = JSON.parse(raw);
      if (!isRealFirebaseConfig(cfg)) { showToast('Invalid config — needs apiKey and projectId.'); return; }
      localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(cfg));
      const alreadyInitialised = (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0);
      initFirebase();
      if (alreadyInitialised) {
        showToast('Config saved — reload the page to apply it.');
      } else {
        showToast('Firebase connected!');
        pullCloudLogs().then(merged => {
          if (merged > 0) {
            calculateAndSetInitialHighestBusiness();
            loadDataByDate(true);
            showToast(merged + ' day(s) restored from cloud.');
          }
        });
      }
    } catch (e) {
      showToast('Invalid JSON — check the pasted config.');
    }
  }

  function saveApiBaseFromSettings() {
    const input = document.getElementById('api-base-input');
    if (!input) return;
    const url = input.value.trim().replace(/\/+$/, '');
    try {
      if (url) localStorage.setItem(API_BASE_KEY, url);
      else localStorage.removeItem(API_BASE_KEY);
    } catch (e) { /* ignore */ }
    initFirebase();
    showToast(url ? 'API URL saved.' : 'API URL cleared — using Firebase/local mode.');
  }

  async function connectSheetsFromSettings() {
    const input = document.getElementById('sheets-url-input');
    if (!input) return;
    const url = input.value.trim();
    if (url && !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec\/?(\?.*)?$/.test(url)) {
      updateBackendStatus('That is not a Web app URL — it must end with /exec');
      showToast('That does not look like a Web app URL. Paste the /exec URL from Deploy, not the Sheet link.');
      return;
    }
    try {
      if (url) localStorage.setItem(SHEETS_URL_KEY, url);
      else localStorage.removeItem(SHEETS_URL_KEY);
    } catch (e) { /* ignore */ }
    initFirebase();
    if (!url) { showToast('Google Sheets URL cleared.'); return; }
    updateBackendStatus('Checking Google Sheets...');
    try {
      const ok = await sheetsAdapter.health();
      if (ok) {
        updateBackendStatus('Connected — Google Sheets');
        showToast('Google Sheets connected!');
        pullCloudLogs().then(merged => {
          if (merged > 0) {
            calculateAndSetInitialHighestBusiness();
            loadDataByDate(true);
            showToast(merged + ' day(s) restored from cloud.');
          }
        });
      } else {
        updateBackendStatus('Google Sheets URL saved, but not reachable');
        showToast('Could not reach the Sheet — URL must end with /exec and deployment access must be Anyone.');
      }
    } catch (e) {
      console.error('Sheets health check failed (local data is safe):', e);
      updateBackendStatus('Google Sheets URL saved, but not reachable');
      showToast('Could not reach the Sheet — URL must end with /exec and deployment access must be Anyone.');
    }
  }

  // ===============================================
  // END: BALANCE SHEET JAVASCRIPT
  // ===============================================


  // ===============================================
  // START: NEW TRACKING FEATURE LOGIC
  // ===============================================
  function generateTrackData() {
      const yearFilterEl = document.getElementById('track-year-filter');
      const monthFilterEl = document.getElementById('track-month-filter');
      const yearFilter = yearFilterEl ? yearFilterEl.value : 'all';
      const monthFilter = monthFilterEl ? monthFilterEl.value : 'all';
      
      const acListEl = document.getElementById('track-ac-list');
      const adListEl = document.getElementById('track-ad-list'); 
      const tacListEl = document.getElementById('track-tac-list');
      
      const acTotalEl = document.getElementById('track-ac-total');
      const adTotalEl = document.getElementById('track-ad-total'); 
      const tacTotalEl = document.getElementById('track-tac-total');
      
      const acCountEl = document.getElementById('track-ac-count');
      const adCountEl = document.getElementById('track-ad-count'); 
      const tacCountEl = document.getElementById('track-tac-count');

      if (!acListEl || !adListEl || !tacListEl) return;

      // Reset
      acListEl.innerHTML = '';
      adListEl.innerHTML = '';
      tacListEl.innerHTML = '';
      
      let acTotal = 0, tacTotal = 0, adTotal = 0;
      let acCount = 0, tacCount = 0, adCount = 0;

      const acItems = [];
      const tacItems = [];
      const adItems = [];

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
                  const idNo = (t[2] || '').toUpperCase().trim();
                  const amount = parseFloat((t[4] || '0').replace(/,/g, ''));
                  
                  if (idNo && !isNaN(amount)) {
                      if (idNo.startsWith('AC')) {
                          acTotal += amount;
                          acCount++;
                          acItems.push({ date: datePart, id: idNo, amount: amount, type: 'AC' });
                      }
                      else if (idNo.startsWith('TAC')) {
                          tacTotal += amount;
                          tacCount++;
                          tacItems.push({ date: datePart, id: idNo, amount: amount, type: 'TAC' });
                      }
                      else if (idNo.startsWith('AD') || idNo.startsWith('ABD')) {
                          adTotal += amount;
                          adCount++;
                          adItems.push({ date: datePart, id: idNo, amount: amount, type: 'AD' });
                      }
                  }
              });
          }
      }

      // Sort by date desc
      acItems.sort((a,b) => b.date.localeCompare(a.date));
      tacItems.sort((a,b) => b.date.localeCompare(a.date));
      adItems.sort((a,b) => b.date.localeCompare(a.date));

      // Update UI Totals
      if (acTotalEl) acTotalEl.textContent = `₹ ${formatBalance(acTotal)}`;
      if (tacTotalEl) tacTotalEl.textContent = `₹ ${formatBalance(tacTotal)}`;
      if (adTotalEl) adTotalEl.textContent = `₹ ${formatBalance(adTotal)}`;
      
      if (acCountEl) acCountEl.textContent = acCount;
      if (tacCountEl) tacCountEl.textContent = tacCount;
      if (adCountEl) adCountEl.textContent = adCount;

      const renderItem = (item) => {
          let colorClass = 'text-green';
          if(item.type === 'AC' || item.type === 'TAC') colorClass = 'text-red';
          
          return `
          <div class="track-list-item">
              <div>
                  <div style="font-weight:700;">${item.id}</div>
                  <div class="track-list-date">${item.date}</div>
              </div>
              <div class="${colorClass}" style="font-weight: 600;">₹ ${formatBalance(item.amount)}</div>
          </div>
      `};

      if (acItems.length > 0) acListEl.innerHTML = acItems.map(renderItem).join('');
      else acListEl.innerHTML = '<p style="text-align:center; padding:20px; color: var(--secondary-color); font-weight: 500;">No AC Transactions</p>';

      if (tacItems.length > 0) tacListEl.innerHTML = tacItems.map(renderItem).join('');
      else tacListEl.innerHTML = '<p style="text-align:center; padding:20px; color: var(--secondary-color); font-weight: 500;">No TAC Transactions</p>';
      
      if (adItems.length > 0) adListEl.innerHTML = adItems.map(renderItem).join('');
      else adListEl.innerHTML = '<p style="text-align:center; padding:20px; color: var(--secondary-color); font-weight: 500;">No AD Transactions</p>';
      
      playSound();
  }

  // ===============================================
  // START: GLOBAL INITIALIZATION
  // ===============================================
  window.addEventListener('DOMContentLoaded', async () => {
    // Generic Modal Close Logic
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if(e.target === overlay) {
                overlay.style.display = 'none';
            }
        });
    });

    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.key.toLowerCase() === 's') {
            const balanceSheetTab = document.getElementById('balanceSheet');
            if (balanceSheetTab && balanceSheetTab.classList.contains('active')) {
                e.preventDefault();
                saveData(false);
                showToast("Saved");
            }
        }
    });

    // Balance Sheet Event Listeners (null-guarded)
    const bindClick = (id, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
    };
    bindClick('select-current-month', createCurrentMonthPDF);
    bindClick('select-all-months', createAllMonthsPDF);
    bindClick('select-custom-month', showCustomMonthSelection);
    bindClick('generate-custom-report', createCustomMonthPDF);
    bindClick('select-cancel', () => { playSound(); const o = document.getElementById('report-selection-overlay'); if (o) o.style.display = 'none'; });
    bindClick('cancel-custom-selection', () => { playSound(); const o = document.getElementById('custom-month-selection-overlay'); if (o) o.style.display = 'none'; });
    bindClick('id-details-close-btn', () => { playSound(); const o = document.getElementById('id-details-modal'); if (o) o.style.display = 'none'; });
    const searchInputEl = document.getElementById('search-input');
    if (searchInputEl) {
        searchInputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && document.getElementById('balanceSheet').classList.contains('active')) {
                const query = e.target.value.trim();
                if (isNaN(query.replace(/,/g, ''))) { performIdSearch(); } 
                else { performAmountSearch(); }
            }
        });
    }
    
    // NEW TRACK DATA LISTENERS
    populateStaticFilters('track-year-filter', 'track-month-filter');
    const trackDataBtn = document.getElementById('track-data-btn');
    if (trackDataBtn) {
        trackDataBtn.addEventListener('click', () => {
            playSound();
            const modal = document.getElementById('track-data-modal');
            if (modal) modal.style.display = 'flex';
            // Auto-select current month/year
            const today = new Date();
            const yearFilter = document.getElementById('track-year-filter');
            const monthFilter = document.getElementById('track-month-filter');
            if (yearFilter) yearFilter.value = today.getFullYear();
            if (monthFilter) monthFilter.value = String(today.getMonth() + 1).padStart(2, '0');
            generateTrackData();
        });
    }

    bindClick('track-data-close-btn', () => {
        playSound();
        const o = document.getElementById('track-data-modal');
        if (o) o.style.display = 'none';
    });

    bindClick('generate-track-report', generateTrackData);

    // SETTINGS LISTENERS
    bindClick('settings-button', openSettings);
    bindClick('settings-close-btn', () => { playSound(); closeSettings(); });
    bindClick('firebase-connect-btn', connectFirebaseFromSettings);
    bindClick('api-base-save-btn', saveApiBaseFromSettings);
    bindClick('sheets-connect-btn', connectSheetsFromSettings);
    bindClick('sync-now-btn', () => { playSound(); syncNow(); });
    
    // Balance Sheet Initializers
    loadTheme();
    populateStaticFilters('search-year-filter', 'search-month-filter');

    // Backend FIRST: initialise and pull cloud logs BEFORE loading today's
    // log. On a fresh device, loading first would create an empty local log
    // for today — and that empty log used to block the real cloud data from
    // merging in. Failures never break local use.
    initFirebase();
    if (getSheetsUrl() || getApiBase() || cloudReady) showToast('Loading from cloud...');
    const merged = await pullCloudLogs();
    calculateAndSetInitialHighestBusiness();
    loadDataByDate(true);
    if (merged > 0) {
        showToast(merged + ' day(s) restored from cloud.');
    }

  });
