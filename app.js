
const KEY='can-budget-v123';
const defaults={
  accounts:[{id:1,name:'Checking',balance:0},{id:2,name:'Savings',balance:0}],
  income:[], expenses:[], bills:[],
  settings:{frequency:'Every 2 weeks',payAmount:0,nextPayday:''},
  savings:{goal:75,buffer:100}
};
let state=load(), current='home';

function load(){try{const x=JSON.parse(localStorage.getItem(KEY));return x?merge(defaults,x):structuredClone(defaults)}catch(e){return structuredClone(defaults)}}
function merge(a,b){return {...structuredClone(a),...b,settings:{...a.settings,...(b.settings||{})},savings:{...a.savings,...(b.savings||{})}}}
function save(){localStorage.setItem(KEY,JSON.stringify(state));render()}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function money(n){return new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(Number(n)||0)}
function today(){return new Date().toISOString().slice(0,10)}
function uid(){return Date.now()+Math.floor(Math.random()*10000)}
function fmt(d){if(!d)return 'Not set';return new Date(d+'T12:00:00').toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric'})}
function dateObj(s){return s?new Date(s+'T12:00:00'):null}
function daysBetween(a,b){return Math.round((b-a)/86400000)}

function nextPayPeriod(){
  const end=dateObj(state.settings.nextPayday); if(!end)return null;
  let start=new Date(end);
  const f=state.settings.frequency;
  if(f==='Weekly') start.setDate(start.getDate()-7);
  else if(f==='Every 2 weeks') start.setDate(start.getDate()-14);
  else if(f==='Twice a month') start.setDate(start.getDate()-14);
  else start.setMonth(start.getMonth()-1);
  return {start,end};
}

function periodLengthDays(){
  const f=state.settings.frequency;
  if(f==='Weekly')return 7;
  if(f==='Every 2 weeks')return 14;
  if(f==='Twice a month')return 14;
  return 30;
}
function shiftPeriod(period,offset){
  if(!period)return null;
  const days=periodLengthDays();
  const start=new Date(period.start), end=new Date(period.end);
  if(state.settings.frequency==='Monthly' && days===30){
    start.setMonth(start.getMonth()+offset);
    end.setMonth(end.getMonth()+offset);
  }else{
    start.setDate(start.getDate()+days*offset);
    end.setDate(end.getDate()+days*offset);
  }
  return {start,end};
}
function projectedIncome(period){
  if(!period || !state.settings.payAmount)return 0;
  return Number(state.settings.payAmount)||0;
}
function periodSummary(period){
  if(!period)return null;
  const bills=billTotal(period);
  const income=projectedIncome(period);
  const savings=Number(state.savings.goal||0);
  const buffer=Number(state.savings.buffer||0);
  return {income,bills,savings,buffer,after:income-bills-savings};
}
function forecastRows(period){
  if(!period)return [];
  return state.bills.map(b=>{
    const d=dateObj(b.date);
    if(!d)return null;
    let due=new Date(d);
    let guard=0;
    while(due < period.start && guard++<36){
      if(b.frequency==='Weekly') due.setDate(due.getDate()+7);
      else if(b.frequency==='Every 2 weeks') due.setDate(due.getDate()+14);
      else if(b.frequency==='Monthly') due.setMonth(due.getMonth()+1);
      else break;
    }
    if(due>=period.start && due<=period.end) return {...b,due:due.toISOString().slice(0,10)};
    return null;
  }).filter(Boolean);
}
function allocationFor(period){
  const rows=forecastRows(period);
  const bills=rows.reduce((s,b)=>s+Number(b.amount||0),0);
  const income=projectedIncome(period);
  const savings=Number(state.savings.goal||0);
  return {income,bills,savings,left:income-bills-savings,rows};
}

function occurrences(bill,period){
  const anchor=dateObj(bill.date); if(!anchor||!period)return false;
  if(bill.frequency==='One-time') return anchor>=period.start&&anchor<=period.end;
  let d=new Date(anchor);
  while(d<period.start){
    if(bill.frequency==='Weekly')d.setDate(d.getDate()+7);
    else if(bill.frequency==='Every 2 weeks')d.setDate(d.getDate()+14);
    else if(bill.frequency==='Monthly')d.setMonth(d.getMonth()+1);
    else if(bill.frequency==='Yearly')d.setFullYear(d.getFullYear()+1);
    else break;
  }
  return d>=period.start&&d<=period.end;
}
function billTotal(period){return state.bills.filter(b=>occurrences(b,period)).reduce((s,b)=>s+Number(b.amount||0),0)}
function incomeForPeriod(period){return state.income.filter(x=>period&&dateObj(x.date)>=period.start&&dateObj(x.date)<=period.end).reduce((s,x)=>s+Number(x.amount||0),0)}

function render(){
  const el=document.getElementById('screen');
  if(current==='home')el.innerHTML=home();
  if(current==='budget')el.innerHTML=budget();
  if(current==='activity')el.innerHTML=activity();
  if(current==='accounts')el.innerHTML=accounts();
}
function headerTitle(t){return `<h2>${t}</h2>`}

function home(){
 const checking=state.accounts.find(a=>a.name==='Checking')||{balance:0};
 const savings=state.accounts.find(a=>a.name==='Savings')||{balance:0};
 const p=nextPayPeriod();
 const bills=p?billTotal(p):0;
 const periodIncome=p?incomeForPeriod(p):0;
 const safe=Math.max(0,(Number(checking.balance)||0)-bills-Number(state.savings.goal||0)-Number(state.savings.buffer||0));
 const nextIncome=[...state.income].filter(x=>dateObj(x.date)>=new Date()).sort((a,b)=>dateObj(a.date)-dateObj(b.date))[0];
 const recent=[...state.income.map(x=>({...x,type:'Income'})),...state.expenses.map(x=>({...x,type:'Expense'}))]
   .sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,5);

 return `${p?`<div class="muted" style="text-transform:uppercase;font-weight:800;letter-spacing:.05em">Your next pay period</div><h2 style="font-size:27px;margin-top:4px">${fmt(p.start.toISOString().slice(0,10))} → ${fmt(p.end.toISOString().slice(0,10))}</h2>`:''}
 <div class="hero"><div class="label">Safe to spend</div><div class="amount">${money(safe)}</div><p>${p?`Bills, planned savings and your safety buffer are accounted for.`:'Set your next payday to build your plan.'}</p></div>

 <div class="grid2">
  <div class="card"><div class="muted">Checking</div><div class="money">${money(checking.balance)}</div></div>
  <div class="card"><div class="muted">Savings</div><div class="money">${money(savings.balance)}</div></div>
 </div>

 <div class="sectionhead"><h2>Next income</h2><button class="link" data-action="addIncome">+ Income</button></div>
 ${nextIncome?`<div class="row"><div><strong>${esc(nextIncome.description)}</strong><span class="muted">${esc(nextIncome.frequency)} · ${fmt(nextIncome.date)}</span></div><div class="right"><b class="positive">+${money(nextIncome.amount)}</b><br><button class="link" data-action="editIncome" data-id="${nextIncome.id}">Edit</button></div></div>`:'<div class="empty">No upcoming income. Add your next paycheque to build your plan.</div>'}

 <div class="sectionhead"><h2>Money plan</h2><button class="link" data-nav="budget">Open plan</button></div>
 <div class="card plan">
  <div class="line"><span>Checking balance</span><b>${money(checking.balance)}</b></div>
  <div class="line"><span>Income in pay period</span><b class="positive">+${money(periodIncome)}</b></div>
  <div class="line"><span>Upcoming bills</span><b class="negative">−${money(bills)}</b></div>
  <div class="line"><span>Suggested savings</span><b class="negative">−${money(state.savings.goal)}</b></div>
  <div class="line"><span>Safety buffer</span><b class="negative">−${money(state.savings.buffer)}</b></div>
  <div class="line"><span>Safe to spend</span><b>${money(safe)}</b></div>
 </div>

 <div class="sectionhead"><h2>Before payday</h2><button class="link" data-nav="budget">See all</button></div>
 ${p?state.bills.filter(b=>occurrences(b,p)).map(b=>`<div class="row"><div><strong>${esc(b.name)}</strong><span class="muted">${esc(b.frequency)} · ${fmt(b.date)} · Reminders: ${(b.reminders||[b.reminder||'7 days before']).map(esc).join(', ')}</span></div><div class="money">${money(b.amount)}</div></div>`).join(''):'<div class="empty">No pay period yet.</div>'}

 <div class="sectionhead"><h2>Plan check</h2><button class="link" data-nav="budget">Open plan</button></div>
 ${p?(()=>{
   const actual=state.expenses.filter(x=>dateObj(x.date)>=p.start&&dateObj(x.date)<=p.end).reduce((s,x)=>s+Number(x.amount||0),0);
   const planned=currentBills+Number(state.savings.goal||0);
   return `<div class="card"><div class="line"><span>Planned obligations</span><b>${money(planned)}</b></div><div class="line"><span>Actual spending this period</span><b>${money(actual)}</b></div><div class="line"><span>Difference</span><b class="${actual>planned?'negative':'positive'}">${actual>planned?'−':'+'}${money(Math.abs(planned-actual))}</b></div></div>`;
 })():''}

 <div class="sectionhead"><h2>Recent activity</h2><button class="link" data-nav="activity">See all</button></div>
 ${recent.map(x=>`<div class="row"><div><strong>${esc(x.description)}</strong><span class="muted">${x.type} · ${esc(x.category||'Income')} · ${fmt(x.date)}</span></div><div class="right"><div class="${x.type==='Income'?'positive':'negative'} money">${x.type==='Income'?'+':'−'}${money(x.amount)}</div><button class="link" data-action="${x.type==='Income'?'editIncome':'editExpense'}" data-id="${x.id}">Edit</button></div></div>`).join('')||'<div class="empty">No activity yet.</div>'}`;
}
function budget(){
 const p=nextPayPeriod();
 const p2=shiftPeriod(p,1);
 const p3=shiftPeriod(p,2);
 const bal=state.accounts.find(a=>a.name==='Checking')?.balance||0;
 const currentBills=p?billTotal(p):0;
 const currentIncome=p?incomeForPeriod(p):0;
 const safe=Math.max(0,bal-currentBills-state.savings.goal-state.savings.buffer);
 const s2=periodSummary(p2), s3=periodSummary(p3);
 const billRows=state.bills.map(b=>`<div class="row"><div><strong>${esc(b.name)}</strong><span class="muted">${esc(b.frequency)} · ${fmt(b.date)} · ${(b.reminders||[b.reminder||'7 days before']).map(esc).join(', ')}</span></div><div class="right"><button class="link" data-action="editBill" data-id="${b.id}">Edit</button><b>${money(b.amount)}</b></div></div>`).join('');
 return `${headerTitle('Your Money Plan')}
 <div class="card"><div class="muted">Current pay period</div><h3>${p?fmt(p.start.toISOString().slice(0,10))+' → '+fmt(p.end.toISOString().slice(0,10)):'Not set'}</h3><div class="notice">${p?'Your current plan uses the bills that fall inside this pay period.':'Set your pay schedule below.'}</div>
 <div class="plan"><div class="line"><span>Current checking</span><b>${money(bal)}</b></div><div class="line"><span>Income in period</span><b class="positive">+${money(currentIncome)}</b></div><div class="line"><span>Upcoming bills</span><b class="negative">−${money(currentBills)}</b></div><div class="line"><span>Suggested savings</span><b class="negative">−${money(state.savings.goal)}</b></div><div class="line"><span>Safety buffer</span><b class="negative">−${money(state.savings.buffer)}</b></div><div class="line"><span>Safe to spend</span><b>${money(safe)}</b></div></div></div>

 <div class="sectionhead"><h2>Plan ahead</h2><span class="muted">2 paycycles ahead</span></div>
 <div class="card">
  <div class="notice">Can Budget can forecast the next two paycycles using your pay frequency, expected pay amount, recurring bills, savings goal and safety buffer.</div>
  ${p2?`<div style="padding:12px 0;border-bottom:1px solid #e4edf4"><div class="muted">Next paycycle · ${fmt(p2.start.toISOString().slice(0,10))} → ${fmt(p2.end.toISOString().slice(0,10))}</div><div class="plan"><div class="line"><span>Expected income</span><b class="positive">+${money(s2.income)}</b></div><div class="line"><span>Bills</span><b class="negative">−${money(s2.bills)}</b></div><div class="line"><span>Savings goal</span><b class="negative">−${money(s2.savings)}</b></div><div class="line"><span>After planned obligations</span><b>${money(s2.after)}</b></div></div></div>`:''}
  ${p3?`<div style="padding:12px 0"><div class="muted">Following paycycle · ${fmt(p3.start.toISOString().slice(0,10))} → ${fmt(p3.end.toISOString().slice(0,10))}</div><div class="plan"><div class="line"><span>Expected income</span><b class="positive">+${money(s3.income)}</b></div><div class="line"><span>Bills</span><b class="negative">−${money(s3.bills)}</b></div><div class="line"><span>Savings goal</span><b class="negative">−${money(s3.savings)}</b></div><div class="line"><span>After planned obligations</span><b>${money(s3.after)}</b></div></div></div>`:''}
 </div>

 <div class="sectionhead"><h2>Pay schedule</h2><button class="link" data-action="editPay">Edit</button></div>
 <div class="card"><div class="grid2"><div><div class="muted">Frequency</div><b>${esc(state.settings.frequency)}</b></div><div><div class="muted">Pay amount</div><b>${money(state.settings.payAmount)}</b></div></div><div style="margin-top:12px"><div class="muted">Next payday</div><b>${fmt(state.settings.nextPayday)}</b></div></div>

 <div class="sectionhead"><h2>Next paycheque plan</h2><span class="muted">Plan it before payday</span></div>
 ${p2?(()=>{
   const a=allocationFor(p2);
   return `<div class="card">
    <div class="notice">When your next paycheque arrives, this is the job Can Budget expects that money to do.</div>
    <div class="plan">
     <div class="line"><span>Expected paycheque</span><b class="positive">+${money(a.income)}</b></div>
     <div class="line"><span>Bills to reserve</span><b class="negative">−${money(a.bills)}</b></div>
     <div class="line"><span>Savings to reserve</span><b class="negative">−${money(a.savings)}</b></div>
     <div class="line"><span>Left for flexible spending</span><b>${money(a.left)}</b></div>
    </div>
    ${a.rows.length?`<div style="margin-top:10px">${a.rows.map(b=>`<div class="row"><div><strong>${esc(b.name)}</strong><span class="muted">Due ${fmt(b.due)}</span></div><b>${money(b.amount)}</b></div>`).join('')}</div>`:'<div class="empty" style="margin-top:10px">No bills are expected in this paycycle.</div>'}
   </div>`;
 })():''}

 <div class="sectionhead"><h2>Upcoming bills</h2><button class="link" data-action="addBill">+ Bill</button></div>
 ${billRows||'<div class="empty">No bills yet.</div>'}

 <div class="sectionhead"><h2>Savings</h2><button class="link" data-action="editSavings">Edit</button></div>
 <div class="card"><b>${money(state.savings.goal)} recommended</b><p class="muted">Goal for this pay period: ${money(state.savings.goal)}. Safety buffer: ${money(state.savings.buffer)}.</p></div>`;
}
function activity(){
 const totalIncome=state.income.reduce((s,x)=>s+Number(x.amount||0),0);
 const totalExpenses=state.expenses.reduce((s,x)=>s+Number(x.amount||0),0);
 const items=[...state.income.map(x=>({...x,type:'Income'})),...state.expenses.map(x=>({...x,type:'Expense'}))]
   .sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 const cats={};
 state.expenses.forEach(x=>{const c=x.category||'Other';cats[c]=(cats[c]||0)+Number(x.amount||0);});
 const catRows=Object.entries(cats).sort((a,b)=>b[1]-a[1]);
 return `${headerTitle('Activity')}
 <div class="grid2">
  <div class="card"><div class="muted">Total income</div><div class="money positive">${money(totalIncome)}</div></div>
  <div class="card"><div class="muted">Total spending</div><div class="money negative">${money(totalExpenses)}</div></div>
 </div>
 <div class="sectionhead"><h2>Spending by category</h2><span class="muted">All recorded spending</span></div>
 ${catRows.length?`<div class="card">${catRows.map(([c,v])=>`<div class="line"><span>${esc(c)}</span><b>${money(v)}</b></div>`).join('')}</div>`:'<div class="empty">Add some expenses to see your spending breakdown.</div>'}

 <div class="sectionhead"><h2>Transactions</h2><button class="link" data-action="addExpense">+ Expense</button></div>
 ${items.map(x=>`<div class="row"><div><strong>${esc(x.description)}</strong><span class="muted">${x.type} · ${esc(x.category||'Income')} · ${fmt(x.date)} · ${esc(x.account||'')}</span></div><div class="right"><div class="${x.type==='Income'?'positive':'negative'} money">${x.type==='Income'?'+':'−'}${money(x.amount)}</div><button class="link" data-action="${x.type==='Income'?'editIncome':'editExpense'}" data-id="${x.id}">Edit</button></div></div>`).join('')||'<div class="empty">No transactions yet.</div>'}`;
}
function accounts(){
 return `${headerTitle('Accounts')}${state.accounts.map(a=>`<div class="row"><div><strong>${esc(a.name)}</strong><span class="muted">Account balance</span></div><div class="right"><b>${money(a.balance)}</b><br><button class="link" data-action="editAccount" data-id="${a.id}">Edit</button></div></div>`).join('')}`;
}

function openModal(content){document.getElementById('modal').innerHTML=content;document.getElementById('modalBackdrop').classList.remove('hidden')}
function closeModal(){document.getElementById('modalBackdrop').classList.add('hidden');document.getElementById('modal').innerHTML=''}
function formShell(title,body,saveLabel,kind,id=''){return `<div class="modalhead"><h2>${title}</h2><button class="close" data-close>×</button></div><form id="entryForm" data-kind="${kind}" data-id="${id}">${body}<button class="primary" type="submit">${saveLabel}</button></form>`}

function addIncome(id=null){
 const x=id?state.income.find(v=>v.id==id):null;
 openModal(formShell(x?'Edit income':'Add income',`
 <div class="field"><label>Description</label><input name="description" value="${esc(x?.description||'Paycheque')}" required></div>
 <div class="field"><label>Amount (CAD)</label><input name="amount" type="number" step="0.01" min="0" value="${x?.amount||''}" required></div>
 <div class="field"><label>Frequency</label><select name="frequency">${['One-time','Weekly','Every 2 weeks','Twice a month','Monthly'].map(v=>`<option ${x?.frequency===v?'selected':''}>${v}</option>`).join('')}</select></div>
 <div class="field"><label>Account</label><select name="account">${state.accounts.map(a=>`<option ${x?.account===a.name?'selected':''}>${esc(a.name)}</option>`).join('')}</select></div>
 <div class="field"><label>Date</label><input name="date" type="date" value="${x?.date||today()}" required></div>
 ${x ? "<button type=\"button\" class=\"primary danger\" data-delete-income>Delete income</button>" : ""}`,'Save income','income',id||''))
}
function addExpense(id=null){
 const x=id?state.expenses.find(v=>v.id==id):null;
 openModal(formShell(x?'Edit expense':'Add expense',`
 <div class="field"><label>Description</label><input name="description" value="${esc(x?.description||'')}" required></div>
 <div class="field"><label>Amount (CAD)</label><input name="amount" type="number" step="0.01" min="0" value="${x?.amount||''}" required></div>
 <div class="field"><label>Category</label><select name="category">${['Groceries','Restaurants','Transportation','Shopping','Entertainment','Bills','Healthcare','Other'].map(v=>`<option ${x?.category===v?'selected':''}>${v}</option>`).join('')}</select></div>
 <div class="field"><label>Account</label><select name="account">${state.accounts.map(a=>`<option ${x?.account===a.name?'selected':''}>${esc(a.name)}</option>`).join('')}</select></div>
 <div class="field"><label>Date</label><input name="date" type="date" value="${x?.date||today()}" required></div>
 ${x ? "<button type=\"button\" class=\"primary danger\" data-delete-expense>Delete expense</button>" : ""}`,'Save expense','expense',id||''))
}

function addBill(id=null){
 const b=id?state.bills.find(x=>x.id==id):null;
 openModal(formShell(b?'Edit bill':'Add bill',`
 <div class="field"><label>Bill name</label><input name="name" value="${esc(b?.name||'')}" required></div>
 <div class="field"><label>Amount (CAD)</label><input name="amount" type="number" step="0.01" min="0" value="${b?.amount||''}" required></div>
 <div class="field"><label>Due / anchor date</label><input name="date" type="date" value="${b?.date||today()}" required></div>
 <div class="field"><label>Frequency</label><select name="frequency">${['One-time','Weekly','Every 2 weeks','Monthly','Yearly'].map(x=>`<option ${b?.frequency===x?'selected':''}>${x}</option>`).join('')}</select></div>
 <div class="field"><label>Category</label><select name="category">${['Housing','Utilities','Insurance','Debt','Subscriptions','Other'].map(x=>`<option ${b?.category===x?'selected':''}>${x}</option>`).join('')}</select></div>
 <div class="field"><label>Reminders</label>
 <div class="notice">Choose as many as you want. Can Budget will keep this schedule with the bill.</div>
 <div style="display:grid;gap:8px">
 ${['14 days before','7 days before','3 days before','1 day before'].map((v,i)=>{
   const selected=Array.isArray(b?.reminders)?b.reminders:(b?.reminder?[b.reminder]:['7 days before','3 days before','1 day before']);
   return `<label style="display:flex;align-items:center;gap:9px;padding:9px 11px;border:1px solid #dbe8f2;border-radius:10px;background:#fbfdff">
    <input type="checkbox" name="reminders" value="${v}" ${selected.includes(v)?'checked':''}> ${v}
   </label>`;
 }).join('')}
 </div></div>
 ${b?'<button type="button" class="primary danger" data-delete-bill>Delete bill</button>':''}`,'Save bill','bill',id||''))
}
function editPay(){
 openModal(formShell('Pay schedule',`
 <div class="field"><label>Pay frequency</label><select name="frequency">${['Weekly','Every 2 weeks','Twice a month','Monthly'].map(x=>`<option ${state.settings.frequency===x?'selected':''}>${x}</option>`).join('')}</select></div>
 <div class="field"><label>Typical paycheque (CAD)</label><input name="amount" type="number" step=".01" min="0" value="${state.settings.payAmount}" required></div>
 <div class="field"><label>Next payday</label><input name="date" type="date" value="${state.settings.nextPayday}" required></div>`,'Save pay schedule','pay'))}
function editSavings(){
 openModal(formShell('Savings plan',`
 <div class="field"><label>Suggested savings per pay period (CAD)</label><input name="goal" type="number" step=".01" min="0" value="${state.savings.goal}" required></div>
 <div class="field"><label>Safety buffer (CAD)</label><input name="buffer" type="number" step=".01" min="0" value="${state.savings.buffer}" required></div>`,'Save savings plan','savings'))}
function editAccount(id){
 const a=state.accounts.find(x=>x.id==id);
 openModal(formShell('Edit account',`<div class="field"><label>Account name</label><input name="name" value="${esc(a.name)}" required></div><div class="field"><label>Balance (CAD)</label><input name="balance" type="number" step=".01" value="${a.balance}" required></div>`,'Save account','account',id))
}

document.addEventListener('click',e=>{
 const nav=e.target.closest('[data-nav]'); if(nav){current=nav.dataset.nav;render();return}
 if(e.target.closest('#addBtn')){openModal(`<div class="modalhead"><h2>Add</h2><button class="close" data-close>×</button></div><button class="primary" data-action="addIncome">Add income</button><button class="primary" data-action="addExpense">Add expense</button><button class="primary" data-action="addBill">Add bill</button>`);return}
 if(e.target.closest('[data-close]')){closeModal();return}
 const a=e.target.closest('[data-action]'); if(a){
  const act=a.dataset.action;
  if(act==='addIncome')addIncome(); if(act==='addExpense')addExpense(); if(act==='addBill')addBill(); if(act==='editIncome')addIncome(a.dataset.id); if(act==='editExpense')addExpense(a.dataset.id); if(act==='editBill')addBill(a.dataset.id);
  if(act==='editPay')editPay(); if(act==='editSavings')editSavings(); if(act==='editAccount')editAccount(a.dataset.id);
 }
 if(e.target.closest('[data-delete-bill]')){
  const f=document.getElementById('entryForm'),id=f.dataset.id;state.bills=state.bills.filter(x=>x.id!=id);save();closeModal();
 }
 if(e.target.closest('[data-delete-income]')){
  const f=document.getElementById('entryForm'),id=f.dataset.id;state.income=state.income.filter(x=>x.id!=id);save();closeModal();
 }
 if(e.target.closest('[data-delete-expense]')){
  const f=document.getElementById('entryForm'),id=f.dataset.id;state.expenses=state.expenses.filter(x=>x.id!=id);save();closeModal();
 }
 if(e.target.closest('#settingsBtn')){alert('Can Budget V1.2.3 stores prototype data only in this browser. Bank connections and receipt scanning will come later.')}
});
document.getElementById('modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeModal()});

document.addEventListener('submit',e=>{
 if(e.target.id!=='entryForm')return;
 e.preventDefault(); e.stopPropagation();
 const f=e.target, d=Object.fromEntries(new FormData(f).entries()), kind=f.dataset.kind;
 try{
  if(kind==='income'){
   const item={id:f.dataset.id?Number(f.dataset.id):uid(),description:d.description,amount:Number(d.amount),frequency:d.frequency,account:d.account,date:d.date};
   if(f.dataset.id)state.income=state.income.map(x=>x.id==f.dataset.id?item:x);
   else {
    state.income.push(item);
    const a=state.accounts.find(x=>x.name===d.account); if(a)a.balance+=item.amount;
   }
   state.settings.frequency=d.frequency; state.settings.payAmount=item.amount; state.settings.nextPayday=item.date;
  }
  if(kind==='expense'){
   const item={id:f.dataset.id?Number(f.dataset.id):uid(),description:d.description,amount:Number(d.amount),category:d.category,account:d.account,date:d.date};
   if(f.dataset.id)state.expenses=state.expenses.map(x=>x.id==f.dataset.id?item:x);
   else {
    state.expenses.push(item);
    const a=state.accounts.find(x=>x.name===d.account); if(a)a.balance-=item.amount;
   }
  }
  if(kind==='bill'){
   const reminderValues=[...f.querySelectorAll('input[name="reminders"]:checked')].map(x=>x.value);
   const item={id:f.dataset.id?Number(f.dataset.id):uid(),name:d.name,amount:Number(d.amount),date:d.date,frequency:d.frequency,category:d.category,reminders:reminderValues,reminder:reminderValues[0]||null};
   if(f.dataset.id)state.bills=state.bills.map(x=>x.id==f.dataset.id?item:x);else state.bills.push(item);
  }
  if(kind==='pay')state.settings={frequency:d.frequency,payAmount:Number(d.amount),nextPayday:d.date};
  if(kind==='savings')state.savings={goal:Number(d.goal),buffer:Number(d.buffer)};
  if(kind==='account'){const id=Number(f.dataset.id);state.accounts=state.accounts.map(a=>a.id===id?{...a,name:d.name,balance:Number(d.balance)}:a)}
  save();closeModal();
 }catch(err){console.error(err);alert('Can Budget could not save this entry. Please try again.')}
});
render();
