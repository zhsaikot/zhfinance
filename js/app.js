(function(){
  "use strict";

  /* ================= Storage / State ================= */
  const STORAGE_KEY = "zhs_finance_data_v1";
  const PALETTE = ["#d97757","#8fbf8a","#7ea8d9","#d9b357","#b57ed9","#d9748f","#6fc2c2","#c2a97e","#9aa5d9","#e0916f","#87c9a6","#c99bd9"];

  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
  function todayISO(){ return new Date().toISOString().slice(0,10); }

  function defaultState(){
    return {
      profile: { name: "", image: "" },
      accounts: [
        { id: uid(), name: "Cash", initial: 0 }
      ],
      categories: [
        { id: uid(), name: "Salary", type: "income" },
        { id: uid(), name: "Business", type: "income" },
        { id: uid(), name: "Gift", type: "income" },
        { id: uid(), name: "Other Income", type: "income" },
        { id: uid(), name: "Food", type: "expense" },
        { id: uid(), name: "Transport", type: "expense" },
        { id: uid(), name: "Bills & Utilities", type: "expense" },
        { id: uid(), name: "Shopping", type: "expense" },
        { id: uid(), name: "Health", type: "expense" },
        { id: uid(), name: "Other Expense", type: "expense" }
      ],
      transactions: [],
      loans: []
    };
  }

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if(!parsed.accounts || !parsed.categories) return defaultState();
      return parsed;
    }catch(e){
      console.error("Failed to load saved data, starting fresh.", e);
      return defaultState();
    }
  }

  function saveState(){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }catch(e){
      console.error("Failed to save data", e);
      alert("Could not save data to this browser's storage.");
    }
  }

  let state = loadState();

  /* ================= Helpers ================= */
  function fmtMoney(n){
    n = Number(n) || 0;
    const neg = n < 0;
    n = Math.abs(n);
    const parts = n.toFixed(2).split(".");
    let intPart = parts[0];
    // Bangladeshi-style grouping: last 3 digits, then groups of 2
    let lastThree = intPart.slice(-3);
    let rest = intPart.slice(0, -3);
    if(rest !== ""){
      rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
      lastThree = "," + lastThree;
    }
    const grouped = rest + lastThree;
    const dec = parts[1] === "00" ? "" : "." + parts[1];
    return (neg ? "-" : "") + "৳" + grouped + dec;
  }

  function findCategory(id){ return state.categories.find(c => c.id === id); }
  function findAccount(id){ return state.accounts.find(a => a.id === id); }
  function categoryColor(id){
    const idx = state.categories.findIndex(c => c.id === id);
    return PALETTE[idx >= 0 ? idx % PALETTE.length : 0];
  }
  function initials(name){
    if(!name) return "Z";
    return name.trim().split(/\s+/).slice(0,2).map(w => w[0].toUpperCase()).join("");
  }
  function monthKey(dateStr){ return (dateStr || "").slice(0,7); }
  function monthLabelFromKey(key){
    const [y,m] = key.split("-").map(Number);
    const d = new Date(y, m-1, 1);
    return d.toLocaleString('en-US', { month:'long', year:'numeric' });
  }

  /* ================= Current dashboard month ================= */
  let currentMonth = new Date().toISOString().slice(0,7); // YYYY-MM
  let chartType = "expense";

  /* ================= Navigation ================= */
  const views = document.querySelectorAll(".view");
  const navItems = document.querySelectorAll(".nav-item, .sidebar-profile");
  const viewTitle = document.getElementById("viewTitle");
  const dashboardMonthNav = document.getElementById("dashboardMonthNav");
  const sidebar = document.getElementById("sidebar");
  const sidebarBackdrop = document.getElementById("sidebarBackdrop");

  const VIEW_TITLES = {
    dashboard: "Dashboard", transactions: "Transactions", categories: "Categories",
    accounts: "Accounts", loans: "Loans", history: "History", profile: "Profile"
  };

  function goToView(name){
    views.forEach(v => v.classList.remove("active"));
    const target = document.getElementById("view-" + name);
    if(target) target.classList.add("active");
    navItems.forEach(n => n.classList.toggle("active", n.dataset.view === name));
    viewTitle.textContent = VIEW_TITLES[name] || "ZHS";
    dashboardMonthNav.style.display = name === "dashboard" ? "flex" : "none";
    closeSidebarMobile();
    if(name === "dashboard") renderDashboard();
    if(name === "transactions") renderTransactions();
    if(name === "categories") renderCategories();
    if(name === "accounts") renderAccounts();
    if(name === "loans") renderLoans();
    if(name === "history") renderHistory();
    if(name === "profile") renderProfile();
  }

  navItems.forEach(el => {
    el.addEventListener("click", () => goToView(el.dataset.view));
  });
  document.querySelectorAll("[data-view-link]").forEach(el=>{
    el.addEventListener("click", ()=> goToView(el.dataset.viewLink));
  });

  document.getElementById("hamburgerBtn").addEventListener("click", () => {
    sidebar.classList.add("open");
    sidebarBackdrop.classList.add("active");
  });
  sidebarBackdrop.addEventListener("click", closeSidebarMobile);
  function closeSidebarMobile(){
    sidebar.classList.remove("open");
    sidebarBackdrop.classList.remove("active");
  }

  document.getElementById("prevMonthBtn").addEventListener("click", ()=>{
    currentMonth = shiftMonth(currentMonth, -1);
    renderDashboard();
  });
  document.getElementById("nextMonthBtn").addEventListener("click", ()=>{
    currentMonth = shiftMonth(currentMonth, 1);
    renderDashboard();
  });
  function shiftMonth(key, delta){
    const [y,m] = key.split("-").map(Number);
    const d = new Date(y, m-1+delta, 1);
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0");
  }

  document.getElementById("chartTypeSeg").addEventListener("click", (e)=>{
    const btn = e.target.closest("button");
    if(!btn) return;
    chartType = btn.dataset.type;
    document.querySelectorAll("#chartTypeSeg button").forEach(b=>b.classList.toggle("active", b===btn));
    renderDashboard();
  });

  // Dashboard account selector change handler
  document.getElementById("dashboardAccountSelect").addEventListener("change", ()=>{
    renderDashboard();
  });

  /* ================= Modal system ================= */
  const modalOverlay = document.getElementById("modalOverlay");
  const modalEl = document.getElementById("modal");

  function openModal(html){
    modalEl.innerHTML = html;
    modalOverlay.classList.add("active");
  }
  function closeModal(){
    modalOverlay.classList.remove("active");
    modalEl.innerHTML = "";
  }
  modalOverlay.addEventListener("click", (e)=>{ if(e.target === modalOverlay) closeModal(); });

  function confirmDelete(message, onConfirm){
    openModal(`
      <div class="modal-head"><h3>Delete Record</h3><button class="modal-close" data-close>&times;</button></div>
      <p class="confirm-text">${message}</p>
      <div class="modal-actions">
        <button class="btn" data-close>Cancel</button>
        <button class="btn btn-accent" style="background:var(--danger); border-color:var(--danger); color:#fff;" id="confirmDeleteBtn">Delete</button>
      </div>
    `);
    modalEl.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeModal));
    modalEl.querySelector("#confirmDeleteBtn").addEventListener("click", ()=>{
      onConfirm();
      closeModal();
    });
  }

  /* ================= Select option builders ================= */
  function accountOptions(selectedId){
    return state.accounts.map(a => `<option value="${a.id}" ${a.id===selectedId?"selected":""}>${escapeHtml(a.name)}</option>`).join("");
  }
  function categoryOptions(type, selectedId){
    return state.categories.filter(c=>c.type===type).map(c => `<option value="${c.id}" ${c.id===selectedId?"selected":""}>${escapeHtml(c.name)}</option>`).join("");
  }
  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  }

  /* ================= Transaction modal ================= */
  function openTransactionModal(existing){
    const isEdit = !!existing;
    let type = existing ? existing.type : "expense";

    function bodyHtml(){
      return `
        <div class="type-toggle">
          <button type="button" class="tx-type-btn ${type==='income'?'active income':''}" data-type="income">Income</button>
          <button type="button" class="tx-type-btn ${type==='expense'?'active expense':''}" data-type="expense">Expense</button>
        </div>
        <div class="form-group">
          <label>Amount</label>
          <div class="amount-input-wrap"><span>৳</span>
            <input type="number" min="0" step="0.01" id="txAmount" placeholder="0.00" value="${existing? existing.amount : ''}" required />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Category</label>
            <select class="full" id="txCategory">${categoryOptions(type, existing?existing.categoryId:null)}</select>
          </div>
          <div class="form-group">
            <label>Account</label>
            <select class="full" id="txAccount">${accountOptions(existing?existing.accountId:null)}</select>
          </div>
        </div>
        <div class="form-group">
          <label>Date</label>
          <input type="date" id="txDate" value="${existing? existing.date : todayISO()}" />
        </div>
        <div class="form-group">
          <label>Note (optional)</label>
          <input type="text" id="txNote" placeholder="e.g. Lunch with client" value="${existing? escapeHtml(existing.note||'') : ''}" />
        </div>
      `;
    }

    openModal(`
      <div class="modal-head"><h3>${isEdit? "Edit Record" : "Add Record"}</h3><button class="modal-close" data-close>&times;</button></div>
      <form id="txForm">${bodyHtml()}
        <div class="modal-actions">
          <button type="button" class="btn" data-close>Cancel</button>
          <button type="submit" class="btn btn-accent">${isEdit? "Save Changes" : "Add Record"}</button>
        </div>
      </form>
    `);

    function rebind(){
      modalEl.querySelectorAll(".tx-type-btn").forEach(b=>{
        b.addEventListener("click", ()=>{
          type = b.dataset.type;
          const catSel = modalEl.querySelector("#txCategory");
          modalEl.querySelectorAll(".tx-type-btn").forEach(x=>{
            x.classList.remove("active","income","expense");
          });
          b.classList.add("active", type);
          catSel.innerHTML = categoryOptions(type, null);
        });
      });
    }
    rebind();

    modalEl.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeModal));
    modalEl.querySelector("#txForm").addEventListener("submit", (e)=>{
      e.preventDefault();
      const amount = parseFloat(modalEl.querySelector("#txAmount").value);
      if(!amount || amount <= 0){ alert("Please enter a valid amount."); return; }
      const categoryId = modalEl.querySelector("#txCategory").value;
      const accountId = modalEl.querySelector("#txAccount").value;
      const date = modalEl.querySelector("#txDate").value || todayISO();
      const note = modalEl.querySelector("#txNote").value.trim();
      if(!categoryId){ alert("Please add a category of this type first."); return; }
      if(!accountId){ alert("Please add an account first."); return; }

      if(isEdit){
        Object.assign(existing, { type, amount, categoryId, accountId, date, note });
      } else {
        state.transactions.push({ id: uid(), type, amount, categoryId, accountId, date, note });
      }
      saveState();
      closeModal();
      refreshCurrentView();
    });
  }

  /* ================= Category modal ================= */
  function openCategoryModal(type, existing){
    const isEdit = !!existing;
    openModal(`
      <div class="modal-head"><h3>${isEdit? "Edit Category" : "Add " + (type==='income'?'Income':'Expense') + " Category"}</h3><button class="modal-close" data-close>&times;</button></div>
      <form id="catForm">
        <div class="form-group">
          <label>Category Name</label>
          <input type="text" id="catName" placeholder="e.g. Groceries" value="${existing? escapeHtml(existing.name):''}" required />
        </div>
        <div class="modal-actions">
          <button type="button" class="btn" data-close>Cancel</button>
          <button type="submit" class="btn btn-accent">${isEdit? "Save Changes" : "Add Category"}</button>
        </div>
      </form>
    `);
    modalEl.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeModal));
    modalEl.querySelector("#catForm").addEventListener("submit", (e)=>{
      e.preventDefault();
      const name = modalEl.querySelector("#catName").value.trim();
      if(!name) return;
      if(isEdit){ existing.name = name; }
      else { state.categories.push({ id: uid(), name, type }); }
      saveState();
      closeModal();
      renderCategories();
      populateTxFilterOptions();
    });
  }

  /* ================= Account modal ================= */
  function openAccountModal(existing){
    const isEdit = !!existing;
    openModal(`
      <div class="modal-head"><h3>${isEdit? "Edit Account" : "Add Account"}</h3><button class="modal-close" data-close>&times;</button></div>
      <form id="accForm">
        <div class="form-group">
          <label>Account Name</label>
          <input type="text" id="accName" placeholder="e.g. My Wife's Account" value="${existing? escapeHtml(existing.name):''}" required />
        </div>
        <div class="form-group">
          <label>Opening Balance</label>
          <div class="amount-input-wrap"><span>৳</span>
            <input type="number" step="0.01" id="accInitial" placeholder="0.00" value="${existing? existing.initial : 0}" />
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn" data-close>Cancel</button>
          <button type="submit" class="btn btn-accent">${isEdit? "Save Changes" : "Add Account"}</button>
        </div>
      </form>
    `);
    modalEl.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeModal));
    modalEl.querySelector("#accForm").addEventListener("submit", (e)=>{
      e.preventDefault();
      const name = modalEl.querySelector("#accName").value.trim();
      const initial = parseFloat(modalEl.querySelector("#accInitial").value) || 0;
      if(!name) return;
      if(isEdit){ existing.name = name; existing.initial = initial; }
      else { state.accounts.push({ id: uid(), name, initial }); }
      saveState();
      closeModal();
      renderAccounts();
      populateTxFilterOptions();
      renderDashboard();
    });
  }

  /* ================= Loan modal ================= */
  function openLoanModal(existing){
    const isEdit = !!existing;
    let type = existing ? existing.type : "given";
    openModal(`
      <div class="modal-head"><h3>${isEdit? "Edit Loan" : "Add Loan"}</h3><button class="modal-close" data-close>&times;</button></div>
      <form id="loanForm">
        <div class="type-toggle">
          <button type="button" class="loan-type-btn ${type==='given'?'active income':''}" data-type="given">Given (they owe me)</button>
          <button type="button" class="loan-type-btn ${type==='taken'?'active expense':''}" data-type="taken">Taken (I owe them)</button>
        </div>
        <div class="form-group">
          <label>Person's Name</label>
          <input type="text" id="loanPerson" placeholder="e.g. Sister" value="${existing? escapeHtml(existing.person):''}" required />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Amount</label>
            <div class="amount-input-wrap"><span>৳</span>
              <input type="number" min="0" step="0.01" id="loanAmount" placeholder="0.00" value="${existing? existing.amount:''}" required/>
            </div>
          </div>
          <div class="form-group">
            <label>Date</label>
            <input type="date" id="loanDate" value="${existing? existing.date : todayISO()}" />
          </div>
        </div>
        <div class="form-group">
          <label>Note (optional)</label>
          <input type="text" id="loanNote" placeholder="e.g. For medical bill" value="${existing? escapeHtml(existing.note||''):''}" />
        </div>
        <div class="modal-actions">
          <button type="button" class="btn" data-close>Cancel</button>
          <button type="submit" class="btn btn-accent">${isEdit? "Save Changes" : "Add Loan"}</button>
        </div>
      </form>
    `);
    modalEl.querySelectorAll(".loan-type-btn").forEach(b=>{
      b.addEventListener("click", ()=>{
        type = b.dataset.type;
        modalEl.querySelectorAll(".loan-type-btn").forEach(x=>x.classList.remove("active","income","expense"));
        b.classList.add("active", type === 'given' ? 'income' : 'expense');
      });
    });
    modalEl.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeModal));
    modalEl.querySelector("#loanForm").addEventListener("submit", (e)=>{
      e.preventDefault();
      const person = modalEl.querySelector("#loanPerson").value.trim();
      const amount = parseFloat(modalEl.querySelector("#loanAmount").value);
      const date = modalEl.querySelector("#loanDate").value || todayISO();
      const note = modalEl.querySelector("#loanNote").value.trim();
      if(!person || !amount || amount<=0) return;
      if(isEdit){ Object.assign(existing, { type, person, amount, date, note }); }
      else { state.loans.push({ id: uid(), type, person, amount, date, note, paid:false }); }
      saveState();
      closeModal();
      renderLoans();
    });
  }

  /* ================= Quick add (topbar +) ================= */
  document.getElementById("quickAddBtn").addEventListener("click", ()=>{
    openTransactionModal(null);
  });

  /* ================= Pie chart drawing ================= */
  function drawPieChart(container, data, totalLabel){
    // data: [{label, value, color}]
    const total = data.reduce((s,d)=>s+d.value,0);
    const size = window.innerWidth <= 900 ? 170 : 190;
    const cx = size/2, cy = size/2, rOuter = size/2 - 6, rInner = rOuter*0.6;

    if(total <= 0){
      container.innerHTML = `<div class="empty">
        <div class="empty-icon">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="12" r="9"/><path d="M12 8v5l3 2"/></svg>
        </div>
        No records for this period yet.
      </div>`;
      return;
    }

    let cumulative = -Math.PI/2;
    let paths = "";
    data.forEach(d=>{
      const angle = (d.value/total) * Math.PI * 2;
      const start = cumulative;
      const end = cumulative + angle;
      const x1 = cx + rOuter*Math.cos(start), y1 = cy + rOuter*Math.sin(start);
      const x2 = cx + rOuter*Math.cos(end), y2 = cy + rOuter*Math.sin(end);
      const largeArc = angle > Math.PI ? 1 : 0;
      if(data.length === 1){
        paths += `<circle cx="${cx}" cy="${cy}" r="${rOuter}" fill="${d.color}"></circle>`;
      } else {
        paths += `<path d="M${cx},${cy} L${x1},${y1} A${rOuter},${rOuter} 0 ${largeArc} 1 ${x2},${y2} Z" fill="${d.color}"><title>${escapeHtml(d.label)}</title></path>`;
      }
      cumulative = end;
    });

    const legendRows = data.map(d=>{
      const pct = total>0 ? Math.round((d.value/total)*100) : 0;
      return `<div class="legend-row">
        <span class="legend-dot" style="background:${d.color}"></span>
        <span class="legend-name">${escapeHtml(d.label)}</span>
        <span class="legend-pct">${pct}%</span>
        <span class="legend-amt">${fmtMoney(d.value)}</span>
      </div>`;
    }).join("");

    container.innerHTML = `
      <div class="pie-wrap">
        <div class="pie-canvas-box" style="width:${size}px;height:${size}px;">
          <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
            ${paths}
            <circle cx="${cx}" cy="${cy}" r="${rInner}" fill="var(--bg-card)"></circle>
          </svg>
          <div class="pie-center">
            <div class="pie-center-value">${fmtMoney(total)}</div>
            <div class="pie-center-label">${totalLabel}</div>
          </div>
        </div>
        <div class="legend">${legendRows}</div>
      </div>
    `;
  }

  /* ================= Dashboard ================= */
  function computeMonthTotals(monthKeyStr){
    const txs = state.transactions.filter(t => monthKey(t.date) === monthKeyStr);
    const income = txs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
    const expense = txs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
    return { txs, income, expense, incomeCount: txs.filter(t=>t.type==='income').length, expenseCount: txs.filter(t=>t.type==='expense').length };
  }

  function computeAccountBalance(accountId){
    const acc = findAccount(accountId);
    if(!acc) return 0;
    let bal = Number(acc.initial) || 0;
    state.transactions.forEach(t=>{
      if(t.accountId !== accountId) return;
      bal += t.type === 'income' ? t.amount : -t.amount;
    });
    return bal;
  }

  function renderDashboard(){
    // Get selected account from dropdown
    const selectedAccountId = document.getElementById("dashboardAccountSelect").value;
    
    // Populate account selector
    const accountSelect = document.getElementById("dashboardAccountSelect");
    accountSelect.innerHTML = '<option value="all">All Accounts</option>' + state.accounts.map(a => `<option value="${a.id}" ${a.id===selectedAccountId?"selected":""}>${escapeHtml(a.name)}</option>`).join("");

    // Update balance subtitle based on selection
    const balanceSubEl = document.getElementById("statBalanceSub");
    if(selectedAccountId === "all"){
      balanceSubEl.textContent = "Across all accounts";
    } else {
      const acc = findAccount(selectedAccountId);
      balanceSubEl.textContent = acc ? "For " + escapeHtml(acc.name) : "";
    }

    document.getElementById("monthLabel").textContent = monthLabelFromKey(currentMonth);
    
    // Compute totals filtered by selected account
    let income, expense, incomeCount, expenseCount;
    if(selectedAccountId === "all"){
      const { txs, income: inc, expense: exp, incomeCount: ic, expenseCount: ec } = computeMonthTotals(currentMonth);
      income = inc;
      expense = exp;
      incomeCount = ic;
      expenseCount = ec;
    } else {
      const allTxs = state.transactions.filter(t => monthKey(t.date) === currentMonth && t.accountId === selectedAccountId);
      income = allTxs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
      expense = allTxs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
      incomeCount = allTxs.filter(t=>t.type==='income').length;
      expenseCount = allTxs.filter(t=>t.type==='expense').length;
    }

    // Display balance for selected account only (or total if "all")
    let totalBalance;
    if(selectedAccountId === "all"){
      totalBalance = state.accounts.reduce((s,a)=>s+computeAccountBalance(a.id), 0);
    } else {
      totalBalance = computeAccountBalance(selectedAccountId);
    }
    
    document.getElementById("statBalance").textContent = fmtMoney(totalBalance);
    document.getElementById("statIncome").textContent = fmtMoney(income);
    document.getElementById("statExpense").textContent = fmtMoney(expense);
    document.getElementById("statIncomeCount").textContent = incomeCount + " record" + (incomeCount===1?"":"s");
    document.getElementById("statExpenseCount").textContent = expenseCount + " record" + (expenseCount===1?"":"s");
    const net = income - expense;
    const netEl = document.getElementById("statNet");
    netEl.textContent = fmtMoney(net);
    netEl.className = "stat-value " + (net >= 0 ? "income" : "expense");

    document.getElementById("chartSub").textContent = (chartType === 'expense' ? "Spending" : "Earning") + " by category · " + monthLabelFromKey(currentMonth);

    // Filter transactions by selected account for chart
    let relevantTxs;
    if(selectedAccountId === "all"){
      relevantTxs = state.transactions.filter(t => monthKey(t.date) === currentMonth && t.type === chartType);
    } else {
      relevantTxs = state.transactions.filter(t => monthKey(t.date) === currentMonth && t.accountId === selectedAccountId && t.type === chartType);
    }
    
    const byCategory = {};
    relevantTxs.forEach(t=>{
      byCategory[t.categoryId] = (byCategory[t.categoryId]||0) + t.amount;
    });
    const chartData = Object.keys(byCategory).map(cid=>{
      const cat = findCategory(cid);
      return { label: cat ? cat.name : "Uncategorized", value: byCategory[cid], color: categoryColor(cid) };
    }).sort((a,b)=>b.value-a.value);

    drawPieChart(document.getElementById("pieChartArea"), chartData, chartType === 'expense' ? 'Spent' : 'Earned');

    // Recent list - filter by selected account if not "all"
    let recent;
    if(selectedAccountId === "all"){
      recent = [...state.transactions].sort((a,b)=> (b.date || "").localeCompare(a.date) || 0).slice(0,6);
    } else {
      recent = state.transactions.filter(t => t.accountId === selectedAccountId).sort((a,b)=> (b.date || "").localeCompare(a.date) || 0).slice(0,6);
    }
    
    const recentList = document.getElementById("recentList");
    if(recent.length === 0){
      recentList.innerHTML = `<div class="empty">No records yet. Tap "Add Record" to start tracking.</div>`;
    } else {
      recentList.innerHTML = recent.map(t => transactionRowHtml(t)).join("");
      bindTxRowActions(recentList);
    }
  }

  /* ================= Transactions view ================= */
  function transactionRowHtml(t){
    const cat = findCategory(t.categoryId);
    const acc = findAccount(t.accountId);
    const color = categoryColor(t.categoryId);
    return `
      <div class="row" data-id="${t.id}">
        <div class="row-icon" style="background:${color}22;color:${color};">${cat ? cat.name[0].toUpperCase() : '?'}</div>
        <div class="row-main">
          <div class="row-title">${cat ? escapeHtml(cat.name) : "Uncategorized"}${t.note ? " · " + escapeHtml(t.note) : ""}</div>
          <div class="row-sub">${t.date} · ${acc ? escapeHtml(acc.name) : "Unknown account"}</div>
        </div>
        <div class="row-amt ${t.type}">${t.type==='income'?'+':'-'}${fmtMoney(t.amount)}</div>
        <div class="row-actions">
          <button class="icon-btn edit-tx" aria-label="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
          <button class="icon-btn danger delete-tx" aria-label="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/></svg></button>
        </div>
      </div>
    `;
  }

  function bindTxRowActions(container){
    container.querySelectorAll(".edit-tx").forEach(btn=>{
      btn.addEventListener("click", (e)=>{
        const id = e.target.closest(".row").dataset.id;
        const tx = state.transactions.find(t=>t.id===id);
        if(tx) openTransactionModal(tx);
      });
    });
    container.querySelectorAll(".delete-tx").forEach(btn=>{
      btn.addEventListener("click", (e)=>{
        const id = e.target.closest(".row").dataset.id;
        confirmDelete("This record will be permanently removed.", ()=>{
          state.transactions = state.transactions.filter(t=>t.id!==id);
          saveState();
          refreshCurrentView();
        });
      });
    });
  }

  function populateTxFilterOptions(){
    const accSel = document.getElementById("txFilterAccount");
    const catSel = document.getElementById("txFilterCategory");
    const accVal = accSel.value, catVal = catSel.value;
    accSel.innerHTML = `<option value="all">All accounts</option>` + state.accounts.map(a=>`<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");
    catSel.innerHTML = `<option value="all">All categories</option>` + state.categories.map(c=>`<option value="${c.id}">${escapeHtml(c.name)} (${c.type})</option>`).join("");
    accSel.value = [...accSel.options].some(o=>o.value===accVal) ? accVal : "all";
    catSel.value = [...catSel.options].some(o=>o.value===catVal) ? catVal : "all";
  }

  function renderTransactions(){
    populateTxFilterOptions();
    const typeF = document.getElementById("txFilterType").value;
    const accF = document.getElementById("txFilterAccount").value;
    const catF = document.getElementById("txFilterCategory").value;
    const monthF = document.getElementById("txFilterMonth").value;

    let list = [...state.transactions].sort((a,b)=> (b.date||"").localeCompare(a.date));
    if(typeF !== 'all') list = list.filter(t=>t.type===typeF);
    if(accF !== 'all') list = list.filter(t=>t.accountId===accF);
    if(catF !== 'all') list = list.filter(t=>t.categoryId===catF);
    if(monthF) list = list.filter(t=>monthKey(t.date)===monthF);

    const txList = document.getElementById("txList");
    if(list.length === 0){
      txList.innerHTML = `<div class="empty">No records match these filters.</div>`;
    } else {
      txList.innerHTML = list.map(t=>transactionRowHtml(t)).join("");
      bindTxRowActions(txList);
    }
  }

  ["txFilterType","txFilterAccount","txFilterCategory","txFilterMonth"].forEach(id=>{
    document.getElementById(id).addEventListener("change", renderTransactions);
  });
  document.getElementById("txClearFilters").addEventListener("click", ()=>{
    document.getElementById("txFilterType").value = "all";
    document.getElementById("txFilterAccount").value = "all";
    document.getElementById("txFilterCategory").value = "all";
    document.getElementById("txFilterMonth").value = "";
    renderTransactions();
  });

  /* ================= Categories view ================= */
  function categoryTileHtml(c){
    const color = categoryColor(c.id);
    const usageCount = state.transactions.filter(t=>t.categoryId===c.id).length;
    return `
      <div class="tile" data-id="${c.id}">
        <div class="tile-top">
          <div class="tile-icon" style="background:${color}22;color:${color};">${c.name[0].toUpperCase()}</div>
          <div style="flex:1;min-width:0;">
            <div class="tile-name">${escapeHtml(c.name)}</div>
            <div class="tile-type">${c.type}</div>
          </div>
        </div>
        <div class="row-sub">${usageCount} record${usageCount===1?"":"s"}</div>
        <div class="tile-actions">
          <button class="btn btn-sm btn-ghost edit-cat">Edit</button>
          <button class="btn btn-sm btn-ghost btn-danger delete-cat">Delete</button>
        </div>
      </div>
    `;
  }

  function renderCategories(){
    const income = state.categories.filter(c=>c.type==='income');
    const expense = state.categories.filter(c=>c.type==='expense');
    const incomeGrid = document.getElementById("incomeCategoryGrid");
    const expenseGrid = document.getElementById("expenseCategoryGrid");

    incomeGrid.innerHTML = income.length ? income.map(categoryTileHtml).join("") : `<div class="empty">No income categories yet.</div>`;
    expenseGrid.innerHTML = expense.length ? expense.map(categoryTileHtml).join("") : `<div class="empty">No expense categories yet.</div>`;

    [incomeGrid, expenseGrid].forEach(grid=>{
      grid.querySelectorAll(".edit-cat").forEach(btn=>{
        btn.addEventListener("click",(e)=>{
          const id = e.target.closest(".tile").dataset.id;
          const cat = findCategory(id);
          if(cat) openCategoryModal(cat.type, cat);
        });
      });
      grid.querySelectorAll(".delete-cat").forEach(btn=>{
        btn.addEventListener("click",(e)=>{
          const id = e.target.closest(".tile").dataset.id;
          confirmDelete("Existing records using this category will show as 'Uncategorized'. This cannot be undone.", ()=>{
            state.categories = state.categories.filter(c=>c.id!==id);
            saveState();
            renderCategories();
          });
        });
      });
    });
  }

  document.querySelectorAll("[data-add-category]").forEach(btn=>{
    btn.addEventListener("click", ()=> openCategoryModal(btn.dataset.addCategory, null));
  });

  /* ================= Accounts view ================= */
  function accountTileHtml(a){
    const bal = computeAccountBalance(a.id);
    const count = state.transactions.filter(t=>t.accountId===a.id).length;
    return `
      <div class="tile" data-id="${a.id}">
        <div class="tile-top">
          <div class="tile-icon" style="background:var(--accent-soft);color:var(--accent);">${initials(a.name)}</div>
          <div style="flex:1;min-width:0;">
            <div class="tile-name">${escapeHtml(a.name)}</div>
            <div class="tile-type">${count} record${count===1?"":"s"}</div>
          </div>
        </div>
        <div class="tile-value ${bal<0?'expense':''}">${fmtMoney(bal)}</div>
        <div class="tile-actions">
          <button class="btn btn-sm btn-ghost edit-acc">Edit</button>
          <button class="btn btn-sm btn-ghost btn-danger delete-acc">Delete</button>
        </div>
      </div>
    `;
  }

  function renderAccounts(){
    const grid = document.getElementById("accountGrid");
    grid.innerHTML = state.accounts.length ? state.accounts.map(accountTileHtml).join("") : `<div class="empty">No accounts yet. Add your first one.</div>`;
    grid.querySelectorAll(".edit-acc").forEach(btn=>{
      btn.addEventListener("click",(e)=>{
        const id = e.target.closest(".tile").dataset.id;
        const acc = findAccount(id);
        if(acc) openAccountModal(acc);
      });
    });
    grid.querySelectorAll(".delete-acc").forEach(btn=>{
      btn.addEventListener("click",(e)=>{
        const id = e.target.closest(".tile").dataset.id;
        confirmDelete("Records under this account will show as 'Unknown account'. This cannot be undone.", ()=>{
          state.accounts = state.accounts.filter(a=>a.id!==id);
          saveState();
          renderAccounts();
          populateTxFilterOptions();
          renderDashboard();
        });
      });
    });
  }
  document.getElementById("addAccountBtn").addEventListener("click", ()=> openAccountModal(null));

  /* ================= Loans view ================= */
  function loanRowHtml(l){
    return `
      <div class="row" data-id="${l.id}">
        <div class="row-icon" style="background:${l.type==='given'?'var(--income-soft)':'var(--expense-soft)'};color:${l.type==='given'?'var(--income)':'var(--expense)'};">${initials(l.person)}</div>
        <div class="row-main">
          <div class="row-title">${escapeHtml(l.person)} ${l.paid ? '<span class="chip">Settled</span>' : ''}</div>
          <div class="row-sub">${l.date} · ${l.type==='given'?'You lent':'You borrowed'}${l.note ? " · " + escapeHtml(l.note) : ""}</div>
        </div>
        <div class="row-amt ${l.type==='given'?'income':'expense'}" style="${l.paid?'opacity:.45;text-decoration:line-through;':''}">${fmtMoney(l.amount)}</div>
        <div class="row-actions">
          <button class="icon-btn toggle-paid" aria-label="Toggle settled" title="Mark ${l.paid?'unsettled':'settled'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 6L9 17l-5-5"/></svg>
          </button>
          <button class="icon-btn edit-loan" aria-label="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
          <button class="icon-btn danger delete-loan" aria-label="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/></svg></button>
        </div>
      </div>
    `;
  }

  function renderLoans(){
    const given = state.loans.filter(l=>l.type==='given' && !l.paid).reduce((s,l)=>s+l.amount,0);
    const taken = state.loans.filter(l=>l.type==='taken' && !l.paid).reduce((s,l)=>s+l.amount,0);
    document.getElementById("statLoanGiven").textContent = fmtMoney(given);
    document.getElementById("statLoanTaken").textContent = fmtMoney(taken);
    const netEl = document.getElementById("statLoanNet");
    netEl.textContent = fmtMoney(given - taken);
    netEl.className = "stat-value " + (given-taken>=0 ? "income":"expense");

    const list = document.getElementById("loanList");
    const sorted = [...state.loans].sort((a,b)=>(b.date||"").localeCompare(a.date));
    list.innerHTML = sorted.length ? sorted.map(loanRowHtml).join("") : `<div class="empty">No loans recorded yet.</div>`;

    list.querySelectorAll(".edit-loan").forEach(btn=>{
      btn.addEventListener("click",(e)=>{
        const id = e.target.closest(".row").dataset.id;
        const loan = state.loans.find(l=>l.id===id);
        if(loan) openLoanModal(loan);
      });
    });
    list.querySelectorAll(".delete-loan").forEach(btn=>{
      btn.addEventListener("click",(e)=>{
        const id = e.target.closest(".row").dataset.id;
        confirmDelete("This loan record will be permanently removed.", ()=>{
          state.loans = state.loans.filter(l=>l.id!==id);
          saveState();
          renderLoans();
        });
      });
    });
    list.querySelectorAll(".toggle-paid").forEach(btn=>{
      btn.addEventListener("click",(e)=>{
        const id = e.target.closest(".row").dataset.id;
        const loan = state.loans.find(l=>l.id===id);
        if(loan){ loan.paid = !loan.paid; saveState(); renderLoans(); }
      });
    });
  }
  document.getElementById("addLoanBtn").addEventListener("click", ()=> openLoanModal(null));

  /* ================= History view ================= */
  function renderHistory(){
    const container = document.getElementById("historyList");
    const keys = new Set();
    state.transactions.forEach(t => keys.add(monthKey(t.date)));
    const sortedKeys = [...keys].sort().reverse();

    if(sortedKeys.length === 0){
      container.innerHTML = `<div class="card"><div class="empty">No monthly history yet. Records will appear here grouped by month.</div></div>`;
      return;
    }

    container.innerHTML = sortedKeys.map(k=>{
      const { txs, income, expense } = computeMonthTotals(k);
      const net = income - expense;
      const sortedTx = [...txs].sort((a,b)=>(b.date||"").localeCompare(a.date));
      return `
        <div class="month-group" data-key="${k}">
          <div class="month-group-head">
            <div class="month-group-title">${monthLabelFromKey(k)}</div>
            <div class="month-group-stats">
              <div class="mgs-item income">Income <b>${fmtMoney(income)}</b></div>
              <div class="mgs-item expense">Expense <b>${fmtMoney(expense)}</b></div>
              <div class="mgs-item">Net <b>${fmtMoney(net)}</b></div>
            </div>
            <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
          </div>
          <div class="month-group-body">
            <div class="list">${sortedTx.map(transactionRowHtml).join("")}</div>
          </div>
        </div>
      `;
    }).join("");

    container.querySelectorAll(".month-group-head").forEach(head=>{
      head.addEventListener("click", ()=>{
        head.closest(".month-group").classList.toggle("open");
      });
    });
    container.querySelectorAll(".month-group-body").forEach(body=>{
      bindTxRowActions(body);
    });
  }

  /* ================= Profile view ================= */
  function renderProfile(){
    document.getElementById("profileNameInput").value = state.profile.name || "";
    const preview = document.getElementById("profileAvatarPreview");
    preview.innerHTML = state.profile.image ? `<img src="${state.profile.image}" alt="Profile photo" />` : initials(state.profile.name);
    document.getElementById("profileToast").textContent = "";
    populateImportExportAccountSelect();
  }

  document.getElementById("uploadImageBtn").addEventListener("click", ()=>{
    document.getElementById("profileImageInput").click();
  });
  document.getElementById("profileImageInput").addEventListener("change", (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    if(file.size > 3*1024*1024){ alert("Please choose an image smaller than 3MB."); return; }
    const reader = new FileReader();
    reader.onload = ()=>{
      state.profile.image = reader.result;
      renderProfile();
    };
    reader.readAsDataURL(file);
  });
  document.getElementById("removeImageBtn").addEventListener("click", ()=>{
    state.profile.image = "";
    renderProfile();
  });
  document.getElementById("saveProfileBtn").addEventListener("click", ()=>{
    state.profile.name = document.getElementById("profileNameInput").value.trim();
    saveState();
    renderProfile();
    updateSidebarProfile();
    document.getElementById("profileToast").textContent = "Profile saved.";
  });
  
  // Populate import/export account selector
  function populateImportExportAccountSelect(selectedId){
    const select = document.getElementById("importExportAccountSelect");
    select.innerHTML = '<option value="all">All Accounts</option>' + 
      state.accounts.map(a => `<option value="${a.id}" ${a.id===selectedId?"selected":""}>${escapeHtml(a.name)}</option>`).join("");
  }
  
  // Export data functionality
  document.getElementById("exportDataBtn").addEventListener("click", ()=>{
    const accountId = document.getElementById("importExportAccountSelect").value;
    let exportData;
    
    if(accountId === "all"){
      // Export all data
      exportData = {
        profile: state.profile,
        accounts: state.accounts,
        categories: state.categories,
        transactions: state.transactions,
        loans: state.loans,
        exportedAt: new Date().toISOString()
      };
    } else {
      // Export only selected account data
      const account = findAccount(accountId);
      const accountTransactions = state.transactions.filter(t => t.accountId === accountId);
      
      // Get categories used by this account's transactions
      const usedCategoryIds = [...new Set(accountTransactions.map(t => t.categoryId))];
      const accountCategories = state.categories.filter(c => usedCategoryIds.includes(c.id));
      
      exportData = {
        profile: state.profile,
        accounts: [account],
        categories: accountCategories,
        transactions: accountTransactions,
        loans: state.loans,
        exportedAt: new Date().toISOString(),
        exportType: "single_account"
      };
    }
    
    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const accountName = accountId === "all" ? "all_accounts" : (account?.name || "account");
    a.download = `zhs_finance_${accountName}_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    document.getElementById("importExportToast").textContent = "Data exported successfully!";
    setTimeout(() => {
      document.getElementById("importExportToast").textContent = "";
    }, 3000);
  });
  
  // Import data functionality
  document.getElementById("importDataBtn").addEventListener("click", ()=>{
    document.getElementById("importFileInput").click();
  });
  
  document.getElementById("importFileInput").addEventListener("change", (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    
    const reader = new FileReader();
    reader.onload = (evt)=>{
      try {
        const importedData = JSON.parse(evt.target.result);
        
        // Validate the imported data structure
        if(!importedData.accounts || !Array.isArray(importedData.accounts)){
          throw new Error("Invalid data format: missing accounts array");
        }
        
        // Determine what to import based on selection
        const accountId = document.getElementById("importExportAccountSelect").value;
        
        if(accountId === "all"){
          // Import all data - merge with existing
          confirmDelete("This will merge imported data with your existing data. Continue?", ()=>{
            // Merge accounts (avoid duplicates by name)
            const existingAccountNames = new Set(state.accounts.map(a => a.name));
            const newAccounts = importedData.accounts.filter(a => !existingAccountNames.has(a.name));
            
            // Create mapping of old account IDs to new ones
            const accountMap = {};
            newAccounts.forEach(acc => {
              const newId = uid();
              accountMap[acc.id] = newId;
              acc.id = newId;
              state.accounts.push(acc);
            });
            existingAccountNames.forEach(name => {
              const existing = state.accounts.find(a => a.name === name);
              importedData.accounts.filter(a => a.name === name).forEach(a => {
                accountMap[a.id] = existing.id;
              });
            });
            
            // Merge categories (avoid duplicates by name and type)
            const existingCategoryKeys = new Set(state.categories.map(c => `${c.name}|${c.type}`));
            const newCategories = importedData.categories.filter(c => !existingCategoryKeys.has(`${c.name}|${c.type}`));
            
            const categoryMap = {};
            newCategories.forEach(cat => {
              const newId = uid();
              categoryMap[cat.id] = newId;
              cat.id = newId;
              state.categories.push(cat);
            });
            importedData.categories.filter(c => existingCategoryKeys.has(`${c.name}|${c.type}`)).forEach(c => {
              const existing = state.categories.find(x => x.name === c.name && x.type === c.type);
              categoryMap[c.id] = existing.id;
            });
            
            // Import transactions with mapped IDs
            if(importedData.transactions && Array.isArray(importedData.transactions)){
              importedData.transactions.forEach(tx => {
                const newTx = {...tx};
                newTx.id = uid();
                newTx.accountId = accountMap[tx.accountId] || state.accounts.find(a => a.name === (findAccount(tx.accountId)?.name || ""))?.id;
                newTx.categoryId = categoryMap[tx.categoryId] || state.categories.find(c => c.name === (findCategory(tx.categoryId)?.name || ""))?.id;
                if(newTx.accountId && newTx.categoryId){
                  state.transactions.push(newTx);
                }
              });
            }
            
            // Import loans
            if(importedData.loans && Array.isArray(importedData.loans)){
              importedData.loans.forEach(loan => {
                const newLoan = {...loan};
                newLoan.id = uid();
                state.loans.push(newLoan);
              });
            }
            
            saveState();
            refreshCurrentView();
            document.getElementById("importExportToast").textContent = "Data imported successfully!";
            setTimeout(() => {
              document.getElementById("importExportToast").textContent = "";
            }, 3000);
          });
        } else {
          // Import to specific account
          const targetAccount = findAccount(accountId);
          if(!targetAccount){
            document.getElementById("importExportToast").textContent = "Selected account not found!";
            return;
          }
          
          confirmDelete(`This will import transactions to "${targetAccount.name}". Continue?`, ()=>{
            // Find the matching account in imported data or use first one
            let sourceAccount = importedData.accounts.find(a => a.id === accountId) || 
                               importedData.accounts.find(a => a.name === targetAccount.name) ||
                               importedData.accounts[0];
            
            if(!sourceAccount){
              document.getElementById("importExportToast").textContent = "No matching account found in import file!";
              return;
            }
            
            // Filter transactions for this account
            const transactionsToImport = (importedData.transactions || []).filter(tx => tx.accountId === sourceAccount.id);
            
            // Get or create categories
            const categoryMap = {};
            transactionsToImport.forEach(tx => {
              const importedCat = importedData.categories?.find(c => c.id === tx.categoryId);
              if(importedCat){
                let existingCat = state.categories.find(c => c.name === importedCat.name && c.type === importedCat.type);
                if(!existingCat){
                  const newCat = {...importedCat, id: uid()};
                  state.categories.push(newCat);
                  existingCat = newCat;
                }
                categoryMap[tx.categoryId] = existingCat.id;
              }
            });
            
            // Import transactions
            transactionsToImport.forEach(tx => {
              const newTx = {
                ...tx,
                id: uid(),
                accountId: accountId,
                categoryId: categoryMap[tx.categoryId] || state.categories[0]?.id
              };
              state.transactions.push(newTx);
            });
            
            saveState();
            refreshCurrentView();
            document.getElementById("importExportToast").textContent = `Imported ${transactionsToImport.length} transactions to "${targetAccount.name}"!`;
            setTimeout(() => {
              document.getElementById("importExportToast").textContent = "";
            }, 3000);
          });
        }
      } catch(err){
        console.error("Import error:", err);
        document.getElementById("importExportToast").textContent = "Error importing data: " + err.message;
        setTimeout(() => {
          document.getElementById("importExportToast").textContent = "";
        }, 5000);
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // Reset file input
  });
  
  document.getElementById("resetAllBtn").addEventListener("click", ()=>{
    confirmDelete("Every account, category, transaction and loan on this device will be permanently erased. Your profile name and photo will be kept.", ()=>{
      const keptProfile = state.profile;
      state = defaultState();
      state.profile = keptProfile;
      saveState();
      goToView("dashboard");
      updateSidebarProfile();
    });
  });

  function updateSidebarProfile(){
    document.getElementById("sidebarName").textContent = state.profile.name || "Your Profile";
    const av = document.getElementById("sidebarAvatar");
    av.innerHTML = state.profile.image ? `<img src="${state.profile.image}" alt="" />` : initials(state.profile.name);
  }

  /* ================= Refresh dispatch ================= */
  function refreshCurrentView(){
    const active = document.querySelector(".view.active");
    if(!active) return;
    const name = active.id.replace("view-","");
    if(name === "dashboard") renderDashboard();
    if(name === "transactions") renderTransactions();
    if(name === "categories") renderCategories();
    if(name === "accounts") renderAccounts();
    if(name === "loans") renderLoans();
    if(name === "history") renderHistory();
    if(name === "profile") renderProfile();
    updateSidebarProfile();
  }

  window.addEventListener("resize", ()=>{
    const active = document.querySelector(".view.active");
    if(active && active.id === "view-dashboard") renderDashboard();
  });

  /* ================= Init ================= */
  updateSidebarProfile();
  renderDashboard();
  dashboardMonthNav.style.display = "flex";

})();
