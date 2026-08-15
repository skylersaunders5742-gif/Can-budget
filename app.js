const KEY='can-budget-v123';
const defaults={
  accounts:[
    {id:1,name:'Checking',type:'Checking',balance:0,available:0,institution:'',last4:'',lastReconciled:''},
    {id:2,name:'Savings',type:'Savings',balance:0,available:0,institution:'',last4:'',lastReconciled:''}
  ],
  income:[], expenses:[], bills:[], transfers:[], bankTransactions:[], reconciliations:[],
  settings:{frequency:'Every 2 weeks',payAmount:0,nextPayday:''},
  savings:{goal:75,buffer:100},
  receipts:[]
};
let state=load(), current='home';

function load(){
  try{const x=JSON.parse(localStorage.getItem(KEY));return x?merge(defaults,x):structuredClone(defaults)}
  catch(e){return structuredClone(defaults)}
}
function merge(a,b){
  const accounts=(Array.isArray(b.accounts)?b.accounts:a.accounts).map((x,i)=>({
    id:x.id??(i+1),name:x.name||`Account ${i+1}`,type:x.type||'Checking',balance:Number(x.balance)||0,
    available:x.available==null?Number(x.balance)||0:Number(x.available)||0,institution:x.institution||'',last4:x.last4||'',lastReconciled:x.lastReconciled||''
  }));
  const bills=(Array.isArray(b.bills)?b.bills:[]).map(x=>({...x,date:x.date||x.due||'',frequency:x.frequency||'One-time',reminders:Array.isArray(x.reminders)?x.reminders:(x.reminder?[x.reminder]:['7 days before','3 days before','1 day before'])}));
  return {...structuredClone(a),...b,accounts,income:Array.isArray(b.income)?b.income:[],expenses:Array.isArray(b.expenses)?b.expenses:[],bills,transfers:Array.isArray(b.transfers)?b.transfers:[],bankTransactions:Array.isArray(b.bankTransactions)?b.bankTransactions:[],reconciliations:Array.isArray(b.reconciliations)?b.reconciliations:[],receipts:Array.isArray(b.receipts)?b.receipts:[],settings:{...a.settings,...(b.settings||{})},savings:{...a.savings,...(b.savings||{})}}
}
function save(){
  try{localStorage.setItem(KEY,JSON.stringify(state));render();return true}
  catch(err){console.error('Can Budget save failed',err);showSaveError(err);return false}
}
function showSaveError(err){
  const msg=err?.name==='QuotaExceededError'?'Can Budget is out of storage space on this device. Try deleting a few older receipt photos or clearing other browser storage.':(err?.message||'Something unexpected prevented Can Budget from saving this entry. Your existing data was not changed.');
  let box=document.getElementById('saveError');
  if(!box){box=document.createElement('div');box.id='saveError';box.className='save-error';document.body.appendChild(box)}
  box.innerHTML=`<strong>Can Budget</strong><div>${esc(msg)}</div><button data-dismiss-save-error>OK</button>`;
}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function money(n){return new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(Number(n)||0)}
function today(){return new Date().toISOString().slice(0,10)}
function uid(){return Date.now()+Math.floor(Math.random()*10000)}
function fmt(d){if(!d)return 'Not set';return new Date(d+'T12:00:00').toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric'})}
function dateObj(s){return s?new Date(s+'T12:00:00'):null}
function accountById(id){return state.accounts.find(a=>String(a.id)===String(id))}
function accountFor(item){return accountById(item?.accountId)||state.accounts.find(a=>a.name===item?.account)||null}
function accountId(item){return accountFor(item)?.id||''}
function accountName(item){return accountFor(item)?.name||item?.account||'Unknown account'}
function adjustAccount(id,delta){const a=accountById(id);if(a){a.balance=Number(a.balance||0)+Number(delta||0);a.available=Number(a.available==null?a.balance:a.available)+Number(delta||0)}}
function daysBetween(a,b){return Math.round((b-a)/86400000)}

const MEDIA_DB='can-budget-media-v1', MEDIA_STORE='receiptImages';
function mediaDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(MEDIA_DB,1);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(MEDIA_STORE))db.createObjectStore(MEDIA_STORE,{keyPath:'id'})};
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error||new Error('Could not open receipt photo storage.'));
  });
}
async function saveReceiptImage(id,blob){
  const db=await mediaDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(MEDIA_STORE,'readwrite');
    tx.objectStore(MEDIA_STORE).put({id:String(id),blob,updatedAt:Date.now()});
    tx.oncomplete=()=>{db.close();resolve(true)}; tx.onerror=()=>{db.close();reject(tx.error||new Error('Could not save the receipt photo.'))};
  });
}
async function getReceiptImage(id){
  const db=await mediaDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(MEDIA_STORE,'readonly'),req=tx.objectStore(MEDIA_STORE).get(String(id));
    req.onsuccess=()=>{db.close();resolve(req.result?.blob||null)};req.onerror=()=>{db.close();reject(req.error||new Error('Could not load the receipt photo.'))};
  });
}
async function deleteReceiptImage(id){
  const db=await mediaDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(MEDIA_STORE,'readwrite');tx.objectStore(MEDIA_STORE).delete(String(id));
    tx.oncomplete=()=>{db.close();resolve(true)};tx.onerror=()=>{db.close();reject(tx.error||new Error('Could not delete the receipt photo.'))};
  });
}
async function compressReceiptImage(file){
  if(!file)throw new Error('Please take a photo or choose a receipt image.');
  if(!String(file.type||'').startsWith('image/'))throw new Error('That file is not an image. Please choose a receipt photo.');
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('Can Budget could not read that image. Try taking another photo.'));im.src=url});
    // OCR needs small receipt characters. Preserve substantially more detail than the
    // storage thumbnail/compressed copy.
    const max=3200,scale=Math.min(1,max/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
    const w=Math.max(1,Math.round((img.naturalWidth||img.width)*scale)),h=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(img,0,0,w,h);

    // Light grayscale + contrast boost improves thermal receipt digits without
    // changing the photo that gets stored in the receipt library.
    const data=ctx.getImageData(0,0,w,h);
    const px=data.data;
    for(let i=0;i<px.length;i+=4){
      const gray=Math.round(px[i]*0.299+px[i+1]*0.587+px[i+2]*0.114);
      const c=Math.max(0,Math.min(255,(gray-128)*1.35+128));
      px[i]=px[i+1]=px[i+2]=c;
    }
    ctx.putImageData(data,0,0);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.94));
    if(!blob)throw new Error('Can Budget could not prepare that receipt photo.');
    return blob;
  }finally{URL.revokeObjectURL(url)}
}
async function hydrateReceiptImages(){
  const nodes=[...document.querySelectorAll('[data-receipt-thumb]')];
  for(const node of nodes){
    try{
      const blob=await getReceiptImage(node.dataset.receiptThumb);
      if(!blob)continue;
      const url=URL.createObjectURL(blob);node.src=url;node.classList.add('loaded');
      node.addEventListener('load',()=>URL.revokeObjectURL(url),{once:true});
    }catch(e){console.warn('Receipt thumbnail unavailable',e)}
  }
}

function nextPayPeriod(){
  const end=dateObj(state.settings.nextPayday); if(!end)return null;
  let start=new Date(end),f=state.settings.frequency;
  if(f==='Weekly')start.setDate(start.getDate()-7); else if(f==='Every 2 weeks')start.setDate(start.getDate()-14); else if(f==='Twice a month')start.setDate(start.getDate()-14); else start.setMonth(start.getMonth()-1);
  return {start,end};
}
function periodLengthDays(){const f=state.settings.frequency;if(f==='Weekly')return 7;if(f==='Every 2 weeks')return 14;if(f==='Twice a month')return 14;return 30}
function shiftPeriod(period,offset){
  if(!period)return null;const days=periodLengthDays(),start=new Date(period.start),end=new Date(period.end);
  if(state.settings.frequency==='Monthly'&&days===30){start.setMonth(start.getMonth()+offset);end.setMonth(end.getMonth()+offset)}else{start.setDate(start.getDate()+days*offset);end.setDate(end.getDate()+days*offset)}
  return {start,end};
}
function projectedIncome(period){return period&&state.settings.payAmount?Number(state.settings.payAmount)||0:0}
function forecastRows(period){
  if(!period)return [];
  return state.bills.map(b=>{const d=dateObj(b.date);if(!d)return null;let due=new Date(d),guard=0;
    while(due<period.start&&guard++<36){if(b.frequency==='Weekly')due.setDate(due.getDate()+7);else if(b.frequency==='Every 2 weeks')due.setDate(due.getDate()+14);else if(b.frequency==='Monthly')due.setMonth(due.getMonth()+1);else if(b.frequency==='Yearly')due.setFullYear(due.getFullYear()+1);else break}
    return due>=period.start&&due<=period.end?{...b,due:due.toISOString().slice(0,10)}:null;
  }).filter(Boolean)
}
function occurrences(bill,period){
  const anchor=dateObj(bill.date);if(!anchor||!period)return false;if(bill.frequency==='One-time')return anchor>=period.start&&anchor<=period.end;
  let d=new Date(anchor);while(d<period.start){if(bill.frequency==='Weekly')d.setDate(d.getDate()+7);else if(bill.frequency==='Every 2 weeks')d.setDate(d.getDate()+14);else if(bill.frequency==='Monthly')d.setMonth(d.getMonth()+1);else if(bill.frequency==='Yearly')d.setFullYear(d.getFullYear()+1);else break}
  return d>=period.start&&d<=period.end;
}
function billTotal(period){return state.bills.filter(b=>occurrences(b,period)).reduce((s,b)=>s+Number(b.amount||0),0)}
function incomeForPeriod(period){return state.income.filter(x=>period&&dateObj(x.date)>=period.start&&dateObj(x.date)<=period.end).reduce((s,x)=>s+Number(x.amount||0),0)}
function allocationFor(period){const rows=forecastRows(period),bills=rows.reduce((s,b)=>s+Number(b.amount||0),0),income=projectedIncome(period),savings=Number(state.savings.goal||0);return{income,bills,savings,left:income-bills-savings,rows}}
function periodSummary(period){if(!period)return null;const a=allocationFor(period);return{income:a.income,bills:a.bills,savings:a.savings,buffer:Number(state.savings.buffer||0),after:a.left}}

function render(){
  const el=document.getElementById('screen');
  try{if(current==='home')el.innerHTML=home();if(current==='budget')el.innerHTML=budget();if(current==='activity')el.innerHTML=activity();if(current==='annual')el.innerHTML=annual();if(current==='receipts')el.innerHTML=receipts();if(current==='accounts')el.innerHTML=accounts();updateNav();if(current==='receipts')setTimeout(hydrateReceiptImages,0)}
  catch(err){console.error('Can Budget render failed',err);el.innerHTML=`<div class="card"><h2>Can Budget needs a refresh</h2><p class="muted">Your saved information is still stored. Reload the app and try again.</p><button class="primary" onclick="location.reload()">Refresh Can Budget</button></div>`;updateNav()}
}
function updateNav(){document.querySelectorAll('.bottom [data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===current))}
function headerTitle(t){return `<h2>${t}</h2>`}

function home(){
 const checking=state.accounts.find(a=>a.type==='Checking'||a.name==='Checking')||{balance:0},savings=state.accounts.find(a=>a.type==='Savings'||a.name==='Savings')||{balance:0};
 const p=nextPayPeriod(),bills=p?billTotal(p):0,periodIncome=p?incomeForPeriod(p):0;
 const safe=Math.max(0,Number(checking.balance||0)-bills-Number(state.savings.goal||0)-Number(state.savings.buffer||0));
 const nextIncome=[...state.income].filter(x=>dateObj(x.date)>=new Date()).sort((a,b)=>dateObj(a.date)-dateObj(b.date))[0];
 const recent=[...state.income.map(x=>({...x,type:'Income'})),...state.expenses.map(x=>({...x,type:'Expense'}))].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,5);
 return `${p?`<div class="muted" style="text-transform:uppercase;font-weight:800;letter-spacing:.05em">Your next pay period</div><h2 style="font-size:27px;margin-top:4px">${fmt(p.start.toISOString().slice(0,10))} → ${fmt(p.end.toISOString().slice(0,10))}</h2>`:''}
 <div class="hero"><div class="label">Safe to spend</div><div class="amount">${money(safe)}</div><p>${p?'Bills, planned savings and your safety buffer are accounted for.':'Set your next payday to build your plan.'}</p></div>
 <div class="grid2"><div class="card"><div class="muted">Checking</div><div class="money">${money(checking.balance)}</div></div><div class="card"><div class="muted">Savings</div><div class="money">${money(savings.balance)}</div></div></div>
 <div class="sectionhead"><h2>Next income</h2><button class="link" data-action="addIncome">+ Income</button></div>
 ${nextIncome?`<div class="row"><div><strong>${esc(nextIncome.description)}</strong><span class="muted">${esc(nextIncome.frequency)} · ${fmt(nextIncome.date)}</span></div><div class="right"><b class="positive">+${money(nextIncome.amount)}</b><br><button class="link" data-action="editIncome" data-id="${nextIncome.id}">Edit</button></div></div>`:'<div class="empty">No upcoming income. Add your next paycheque to build your plan.</div>'}
 <div class="sectionhead"><h2>Money plan</h2><button class="link" data-nav="budget">Open plan</button></div>
 <div class="card plan"><div class="line"><span>Checking balance</span><b>${money(checking.balance)}</b></div><div class="line"><span>Income in pay period</span><b class="positive">+${money(periodIncome)}</b></div><div class="line"><span>Upcoming bills</span><b class="negative">−${money(bills)}</b></div><div class="line"><span>Suggested savings</span><b class="negative">−${money(state.savings.goal)}</b></div><div class="line"><span>Safety buffer</span><b class="negative">−${money(state.savings.buffer)}</b></div><div class="line"><span>Safe to spend</span><b>${money(safe)}</b></div></div>
 <div class="sectionhead"><h2>Before payday</h2><button class="link" data-nav="budget">See all</button></div>
 ${p?state.bills.filter(b=>occurrences(b,p)).map(b=>`<div class="row"><div><strong>${esc(b.name)}</strong><span class="muted">${esc(b.frequency)} · ${fmt(b.date)} · Reminders: ${(b.reminders||[b.reminder||'7 days before']).map(esc).join(', ')}</span></div><div class="money">${money(b.amount)}</div></div>`).join(''):'<div class="empty">No pay period yet.</div>'}
 <div class="sectionhead"><h2>Plan check</h2><button class="link" data-nav="budget">Open plan</button></div>
 ${p?(()=>{const actual=state.expenses.filter(x=>dateObj(x.date)>=p.start&&dateObj(x.date)<=p.end).reduce((s,x)=>s+Number(x.amount||0),0);const planned=bills+Number(state.savings.goal||0);return `<div class="card"><div class="line"><span>Planned obligations</span><b>${money(planned)}</b></div><div class="line"><span>Actual spending this period</span><b>${money(actual)}</b></div><div class="line"><span>Difference</span><b class="${actual>planned?'negative':'positive'}">${actual>planned?'−':'+'}${money(Math.abs(planned-actual))}</b></div></div>`})():''}
 <div class="sectionhead"><h2>Recent activity</h2><button class="link" data-nav="activity">See all</button></div>
 ${recent.map(x=>`<div class="row"><div><strong>${esc(x.description)}</strong><span class="muted">${x.type} · ${esc(x.category||'Income')} · ${fmt(x.date)}</span></div><div class="right"><div class="${x.type==='Income'?'positive':'negative'} money">${x.type==='Income'?'+':'−'}${money(x.amount)}</div><button class="link" data-action="${x.type==='Income'?'editIncome':'editExpense'}" data-id="${x.id}">Edit</button></div></div>`).join('')||'<div class="empty">No activity yet.</div>'}`;
}

function budget(){
 const p=nextPayPeriod(),p2=shiftPeriod(p,1),p3=shiftPeriod(p,2),bal=state.accounts.find(a=>a.type==='Checking'||a.name==='Checking')?.balance||0,currentBills=p?billTotal(p):0,currentIncome=p?incomeForPeriod(p):0,safe=Math.max(0,bal-currentBills-state.savings.goal-state.savings.buffer),s2=periodSummary(p2),s3=periodSummary(p3);
 const billRows=state.bills.map(b=>`<div class="row"><div><strong>${esc(b.name)}</strong><span class="muted">${esc(b.frequency)} · ${fmt(b.date)} · ${(b.reminders||[b.reminder||'7 days before']).map(esc).join(', ')}</span></div><div class="right"><button class="link" data-action="editBill" data-id="${b.id}">Edit</button><b>${money(b.amount)}</b></div></div>`).join('');
 return `${headerTitle('Your Money Plan')}
 <div class="card"><div class="muted">Current pay period</div><h3>${p?fmt(p.start.toISOString().slice(0,10))+' → '+fmt(p.end.toISOString().slice(0,10)):'Not set'}</h3><div class="notice">${p?'Your current plan uses the bills that fall inside this pay period.':'Set your pay schedule below.'}</div><div class="plan"><div class="line"><span>Current checking</span><b>${money(bal)}</b></div><div class="line"><span>Income in period</span><b class="positive">+${money(currentIncome)}</b></div><div class="line"><span>Upcoming bills</span><b class="negative">−${money(currentBills)}</b></div><div class="line"><span>Suggested savings</span><b class="negative">−${money(state.savings.goal)}</b></div><div class="line"><span>Safety buffer</span><b class="negative">−${money(state.savings.buffer)}</b></div><div class="line"><span>Safe to spend</span><b>${money(safe)}</b></div></div></div>
 <div class="sectionhead"><h2>Plan ahead</h2><span class="muted">2 paycycles ahead</span></div><div class="card"><div class="notice">Can Budget can forecast the next two paycycles using your pay frequency, expected pay amount, recurring bills, savings goal and safety buffer.</div>${p2?`<div style="padding:12px 0;border-bottom:1px solid #e4edf4"><div class="muted">Next paycycle · ${fmt(p2.start.toISOString().slice(0,10))} → ${fmt(p2.end.toISOString().slice(0,10))}</div><div class="plan"><div class="line"><span>Expected income</span><b class="positive">+${money(s2.income)}</b></div><div class="line"><span>Bills</span><b class="negative">−${money(s2.bills)}</b></div><div class="line"><span>Savings goal</span><b class="negative">−${money(s2.savings)}</b></div><div class="line"><span>After planned obligations</span><b>${money(s2.after)}</b></div></div></div>`:''}${p3?`<div style="padding:12px 0"><div class="muted">Following paycycle · ${fmt(p3.start.toISOString().slice(0,10))} → ${fmt(p3.end.toISOString().slice(0,10))}</div><div class="plan"><div class="line"><span>Expected income</span><b class="positive">+${money(s3.income)}</b></div><div class="line"><span>Bills</span><b class="negative">−${money(s3.bills)}</b></div><div class="line"><span>Savings goal</span><b class="negative">−${money(s3.savings)}</b></div><div class="line"><span>After planned obligations</span><b>${money(s3.after)}</b></div></div></div>`:''}</div>
 <div class="sectionhead"><h2>Pay schedule</h2><button class="link" data-action="editPay">Edit</button></div><div class="card"><div class="grid2"><div><div class="muted">Frequency</div><b>${esc(state.settings.frequency)}</b></div><div><div class="muted">Pay amount</div><b>${money(state.settings.payAmount)}</b></div></div><div style="margin-top:12px"><div class="muted">Next payday</div><b>${fmt(state.settings.nextPayday)}</b></div></div>
 <div class="sectionhead"><h2>Next paycheque plan</h2><span class="muted">Plan it before payday</span></div>${p2?(()=>{const a=allocationFor(p2);return `<div class="card"><div class="notice">When your next paycheque arrives, this is the job Can Budget expects that money to do.</div><div class="plan"><div class="line"><span>Expected paycheque</span><b class="positive">+${money(a.income)}</b></div><div class="line"><span>Bills to reserve</span><b class="negative">−${money(a.bills)}</b></div><div class="line"><span>Savings to reserve</span><b class="negative">−${money(a.savings)}</b></div><div class="line"><span>Left for flexible spending</span><b>${money(a.left)}</b></div></div>${a.rows.length?`<div style="margin-top:10px">${a.rows.map(b=>`<div class="row"><div><strong>${esc(b.name)}</strong><span class="muted">Due ${fmt(b.due)}</span></div><b>${money(b.amount)}</b></div>`).join('')}</div>`:'<div class="empty" style="margin-top:10px">No bills are expected in this paycycle.</div>'}</div>`})():''}
 <div class="sectionhead"><h2>Upcoming bills</h2><button class="link" data-action="addBill">+ Bill</button></div>${billRows||'<div class="empty">No bills yet.</div>'}
 <div class="sectionhead"><h2>Savings</h2><button class="link" data-action="editSavings">Edit</button></div><div class="card"><b>${money(state.savings.goal)} recommended</b><p class="muted">Goal for this pay period: ${money(state.savings.goal)}. Safety buffer: ${money(state.savings.buffer)}.</p></div>`;
}

function activity(){
 const totalIncome=state.income.reduce((s,x)=>s+Number(x.amount||0),0),totalExpenses=state.expenses.reduce((s,x)=>s+Number(x.amount||0),0);
 const items=[...state.income.map(x=>({...x,type:'Income'})),...state.expenses.map(x=>({...x,type:'Expense'}))].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 const cats={};state.expenses.forEach(x=>{const c=x.category||'Other';cats[c]=(cats[c]||0)+Number(x.amount||0)});const catRows=Object.entries(cats).sort((a,b)=>b[1]-a[1]);
 return `${headerTitle('Activity')}<div class="grid2"><div class="card"><div class="muted">Total income</div><div class="money positive">${money(totalIncome)}</div></div><div class="card"><div class="muted">Total spending</div><div class="money negative">${money(totalExpenses)}</div></div></div><div class="sectionhead"><h2>Spending by category</h2><span class="muted">All recorded spending</span></div>${catRows.length?`<div class="card">${catRows.map(([c,v])=>`<div class="line"><span>${esc(c)}</span><b>${money(v)}</b></div>`).join('')}</div>`:'<div class="empty">Add some expenses to see your spending breakdown.</div>'}<div class="sectionhead"><h2>Transactions</h2><button class="link" data-action="addExpense">+ Expense</button></div>${items.map(x=>`<div class="row"><div><strong>${esc(x.description)}</strong><span class="muted">${x.type} · ${esc(x.category||'Income')} · ${fmt(x.date)} · ${esc(accountName(x))}</span></div><div class="right"><div class="${x.type==='Income'?'positive':'negative'} money">${x.type==='Income'?'+':'−'}${money(x.amount)}</div><button class="link" data-action="${x.type==='Income'?'editIncome':'editExpense'}" data-id="${x.id}">Edit</button></div></div>`).join('')||'<div class="empty">No transactions yet.</div>'}`;
}

function annual(){
 const year=Number(document.getElementById('annualYear')?.value)||new Date().getFullYear();
 const inYear=x=>x?.date&&String(x.date).slice(0,4)==String(year);
 const income=state.income.filter(inYear).reduce((s,x)=>s+Number(x.amount||0),0);
 const spending=state.expenses.filter(inYear).reduce((s,x)=>s+Number(x.amount||0),0);
 const net=income-spending;
 const months=Array.from({length:12},(_,i)=>{const m=String(i+1).padStart(2,'0');const inc=state.income.filter(x=>inYear(x)&&String(x.date).slice(5,7)===m).reduce((s,x)=>s+Number(x.amount||0),0);const exp=state.expenses.filter(x=>inYear(x)&&String(x.date).slice(5,7)===m).reduce((s,x)=>s+Number(x.amount||0),0);return {i,inc,exp,net:inc-exp}});
 const cats={};state.expenses.filter(inYear).forEach(x=>{const c=x.category||'Other';cats[c]=(cats[c]||0)+Number(x.amount||0)});const catRows=Object.entries(cats).sort((a,b)=>b[1]-a[1]);
 const receipts=state.receipts.filter(inYear).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
 return `${headerTitle('Annual & Long Term')}
 <div class="card"><div class="sectionhead" style="margin-top:0"><div><div class="muted">Financial year</div><h3 style="margin:4px 0 0">${year}</h3></div><select id="annualYear" style="padding:9px;border:1px solid #cbdce8;border-radius:10px;background:white">${[year-2,year-1,year,year+1].map(y=>`<option ${y===year?'selected':''}>${y}</option>`).join('')}</select></div></div>
 <div class="grid2"><div class="card"><div class="muted">Income</div><div class="money positive">${money(income)}</div></div><div class="card"><div class="muted">Spent</div><div class="money negative">${money(spending)}</div></div><div class="card"><div class="muted">Net saved</div><div class="money ${net>=0?'positive':'negative'}">${money(net)}</div></div><div class="card"><div class="muted">Savings rate</div><div class="money">${income?Math.round(net/income*100):0}%</div></div></div>
 <div class="sectionhead"><h2>Monthly history</h2><span class="muted">Income · spending · net</span></div><div class="card">${months.map(m=>`<div class="line"><span>${monthNames[m.i]}</span><span><b class="positive">+${money(m.inc)}</b> <b class="negative">−${money(m.exp)}</b> <b>${money(m.net)}</b></span></div>`).join('')}</div>
 <div class="sectionhead"><h2>Where your money went</h2><span class="muted">By category</span></div>${catRows.length?`<div class="card">${catRows.map(([c,v])=>`<div class="line"><span>${esc(c)}</span><b>${money(v)}</b></div>`).join('')}</div>`:'<div class="empty">Your spending categories will appear here as you use Can Budget.</div>'}

 <div class="sectionhead"><h2>Long-term picture</h2><span class="muted">Recorded in Can Budget</span></div><div class="card"><div class="line"><span>All-time income</span><b class="positive">${money(state.income.reduce((s,x)=>s+Number(x.amount||0),0))}</b></div><div class="line"><span>All-time spending</span><b class="negative">${money(state.expenses.reduce((s,x)=>s+Number(x.amount||0),0))}</b></div><div class="line"><span>All-time net</span><b>${money(state.income.reduce((s,x)=>s+Number(x.amount||0),0)-state.expenses.reduce((s,x)=>s+Number(x.amount||0),0))}</b></div></div>`;
}


let receiptOCRWorker=null;

function normalizeOCRText(text){
  return String(text||'')
    .replace(/\r/g,'')
    .replace(/[|]/g,'I')
    .replace(/[ \t]+/g,' ')
    .trim();
}
function cleanMoneyCandidate(s){
  if(!s)return null;
  const cleaned=String(s).replace(/[^\d.,-]/g,'').replace(/,/g,'');
  const n=Number(cleaned);
  return Number.isFinite(n)&&n>=0?n:null;
}
function parseReceiptDate(text){
  const lines=String(text||'').split('\n');
  const fullYear=y=>{
    y=Number(y);
    if(y<100)return y<=69?2000+y:1900+y;
    return y;
  };
  const valid=(y,m,d)=>y>=2000&&y<=2100&&m>=1&&m<=12&&d>=1&&d<=31;
  const found=[];

  const pushDate=(y,m,d,sourceLine)=>{
    y=fullYear(y);m=Number(m);d=Number(d);
    if(!valid(y,m,d))return;
    found.push({
      iso:`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,
      line:String(sourceLine||'')
    });
  };

  for(const line of lines){
    // YYYY-MM-DD or YYYY/MM/DD
    for(const m of line.matchAll(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)){
      pushDate(m[1],m[2],m[3],line);
    }

    // MM/DD/YY, MM-DD-YY, etc. North-American retail default.
    for(const m of line.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g)){
      const a=Number(m[1]),b=Number(m[2]);
      let mo=a,d=b;
      if(a>12){d=a;mo=b}
      pushDate(m[3],mo,d,line);
    }
  }

  if(!found.length)return '';

  // Score by frequency first. Receipts often print the same transaction date
  // more than once, which makes repeated agreement more trustworthy than one OCR hit.
  const counts=new Map();
  for(const item of found)counts.set(item.iso,(counts.get(item.iso)||0)+1);

  let best=[...counts.entries()]
    .sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0]))[0]?.[0] || '';

  // OCR often confuses 5/6 and 3/8. If two candidates are exactly one day apart,
  // prefer the one that appears more often. If tied, prefer a candidate that appears
  // on a line with a time, since transaction date/time lines are usually authoritative.
  const entries=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
  if(entries.length>1){
    const [first,second]=entries;
    const d1=new Date(first[0]+'T12:00:00');
    const d2=new Date(second[0]+'T12:00:00');
    const diff=Math.abs((d1-d2)/86400000);
    if(diff===1 && first[1]===second[1]){
      const firstTimeHits=found.filter(x=>x.iso===first[0]&&/\b\d{1,2}:\d{2}(?::\d{2})?\b/.test(x.line)).length;
      const secondTimeHits=found.filter(x=>x.iso===second[0]&&/\b\d{1,2}:\d{2}(?::\d{2})?\b/.test(x.line)).length;
      if(secondTimeHits>firstTimeHits)best=second[0];
    }
  }

  return best;
}
function parseReceiptTotal(text){
  const lines=String(text||'').split('\n').map(x=>x.trim()).filter(Boolean);

  const amountsIn=line=>[...String(line||'').matchAll(/(?:\$|CAD\s*)?(\d{1,6}[.,]\d{2})\b/gi)]
    .map(m=>cleanMoneyCandidate(m[1]))
    .filter(v=>v!==null&&v>=0&&v<100000);

  // Highest priority: explicit "you paid" / out-of-pocket amounts.
  // Receipts can contain per-item "You Paid" values AND one final summary
  // "YOU PAID" amount. We collect them all and prefer the final summary.
  const paidLabels=[
    /\byou\s+paid\b/i,
    /\bamount\s+paid\b/i,
    /\bcustomer\s+paid\b/i,
    /\bpaid\s+by\s+customer\b/i,
    /\bout\s+of\s+pocket\b/i,
    /\bpatient\s+(?:paid|pay)\b/i,
    /\bmember\s+(?:paid|pay)\b/i
  ];

  const paidCandidates=[];
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(!paidLabels.some(rx=>rx.test(line)))continue;

    let vals=amountsIn(line);
    if(!vals.length && lines[i+1])vals=amountsIn(lines[i+1]);

    for(const value of vals){
      let score=100;

      // Final summary lines are commonly printed as uppercase "YOU PAID".
      if(/\bYOU\s+PAID\b/.test(line))score+=35;

      // Strongly prefer a paid amount that appears just after the receipt's
      // subtotal/total section rather than a per-item copay line.
      const nearby=lines.slice(Math.max(0,i-5),i).join(' ');
      if(/\b(sub\s*total|subtotal|total|total\s+tax|tax)\b/i.test(nearby))score+=45;

      // Later explicit paid lines are more likely to be the final summary.
      score+=i*0.5;

      paidCandidates.push({value,score,index:i,line});
    }
  }

  if(paidCandidates.length){
    paidCandidates.sort((a,b)=>b.score-a.score || b.value-a.value || b.index-a.index);
    return paidCandidates[0].value;
  }

  // Standard retail receipts: TOTAL / GRAND TOTAL / AMOUNT DUE.
  const strongWords=/\b(grand\s+total|amount\s+due|balance\s+due|total\s+due|total)\b/i;
  const rejectWords=/\b(sub\s*total|subtotal|tax|hst|gst|pst|change|tip|discount|saving|savings|third\s*party|insurance)\b/i;
  const totalCandidates=[];
  lines.forEach((line,i)=>{
    if(!strongWords.test(line)||rejectWords.test(line))return;
    amountsIn(line).forEach(v=>totalCandidates.push({value:v,score:100-i}));
  });
  if(totalCandidates.length)return totalCandidates.sort((a,b)=>b.score-a.score)[0].value;

  // Next best: payment/tender amount, excluding third-party or insurer payments.
  const paymentCandidates=[];
  lines.forEach((line,i)=>{
    if(/\b(third\s*party|insurance|benefit|coverage)\b/i.test(line))return;
    if(/\b(debit|credit|visa|mastercard|amex|interac|purchase|tender)\b/i.test(line)){
      amountsIn(line).forEach(v=>paymentCandidates.push({value:v,score:80+i}));
    }
  });
  if(paymentCandidates.length)return paymentCandidates.sort((a,b)=>b.score-a.score)[0].value;

  // Last-resort fallback.
  const fallback=[];
  lines.slice(Math.floor(lines.length*.45)).forEach((line,i)=>{
    if(rejectWords.test(line))return;
    amountsIn(line).forEach(v=>fallback.push({value:v,score:i}));
  });
  if(!fallback.length)return null;
  fallback.sort((a,b)=>(b.score-a.score)||(b.value-a.value));
  return fallback[0].value;
}
function normalizeMerchantOCR(s){
  return String(s||'').toLowerCase().replace(/0/g,'o').replace(/1/g,'l').replace(/[^a-z0-9]/g,'');
}
function editDistance(a,b){
  a=normalizeMerchantOCR(a);b=normalizeMerchantOCR(b);
  const row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    let prev=row[0];row[0]=i;
    for(let j=1;j<=b.length;j++){
      const old=row[j];
      row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));
      prev=old;
    }
  }
  return row[b.length];
}
function merchantAliases(){
  try{return JSON.parse(localStorage.getItem('can-budget-merchant-aliases')||'{}')}catch(e){return {}}
}
function saveMerchantAlias(raw,canonical){
  const key=normalizeMerchantOCR(raw),value=String(canonical||'').trim();
  if(!key||!value)return;
  const aliases=merchantAliases();aliases[key]=value;
  localStorage.setItem('can-budget-merchant-aliases',JSON.stringify(aliases));
}
function knownMerchants(){
  return ['Walmart','Costco','Loblaws','No Frills','Sobeys','Metro','Food Basics','FreshCo','Farm Boy','Lawtons Drugs','Shoppers Drug Mart','Rexall','Canadian Tire','Dollarama','Amazon','Best Buy','Tim Hortons','Starbucks','McDonald\'s','Shell','Esso','Petro-Canada','Home Depot','RONA'];
}
function canonicalMerchant(raw,text){
  const normalizedRaw=normalizeMerchantOCR(raw),aliases=merchantAliases(),whole=normalizeMerchantOCR(text);
  if(aliases[normalizedRaw])return aliases[normalizedRaw];
  for(const name of knownMerchants()){
    if(whole.includes(normalizeMerchantOCR(name)))return name;
  }
  let best=raw,bestScore=Infinity;
  for(const name of knownMerchants()){
    const target=normalizeMerchantOCR(name);
    const ratio=editDistance(normalizedRaw,target)/Math.max(normalizedRaw.length,target.length,1);
    if(ratio<bestScore){bestScore=ratio;best=name}
  }
  return bestScore<=0.42?best:raw;
}
function parseReceiptMerchant(text){
  const lines=String(text||'').split('\n').map(x=>x.trim()).filter(x=>x.length>=2);
  const junk=/^(receipt|invoice|customer|merchant|store|thank\s*you|welcome|tel\b|phone\b|www\.|http|date\b|time\b|cashier\b|transaction\b|order\b|subtotal\b|total\b|tax\b|hst\b|gst\b|pst\b|served\b|pharmacy\b)/i;
  const numeric=/^[\d\s#*:+\-./]+$/;
  const candidates=[];
  lines.slice(0,18).forEach((line,i)=>{
    if(junk.test(line)||numeric.test(line)||!/[A-Za-z]{3}/.test(line))return;
    let score=42-i*2;
    if(line.length>40)score-=12;
    candidates.push({line,score,norm:normalizeMerchantOCR(line)});
  });
  for(const c of candidates){
    for(const d of candidates){
      if(c===d||!c.norm||!d.norm)continue;
      if(c.norm.includes(d.norm)||d.norm.includes(c.norm))c.score+=12;
      else{
        const ratio=editDistance(c.norm,d.norm)/Math.max(c.norm.length,d.norm.length,1);
        if(ratio<=0.35)c.score+=7;
      }
    }
  }
  candidates.sort((a,b)=>b.score-a.score);
  const raw=candidates[0]?.line.replace(/[^\w&'(). -]/g,'').trim()||'';
  return canonicalMerchant(raw,text);
}
function suggestReceiptCategory(merchant,text){
  const s=`${merchant} ${text}`.toLowerCase();
  const rules=[
    ['Groceries',/(walmart|costco|loblaws|nofrills|no frills|sobeys|metro|food basics|superstore|grocery|market|freshco|farm boy)/],
    ['Restaurants',/(restaurant|cafe|coffee|tim hortons|starbucks|mcdonald|burger|pizza|subway|wendy|diner|grill)/],
    ['Transportation',/(shell|esso|petro|canadian tire gas|fuel|gasoline|uber|lyft|transit|parking)/],
    ['Healthcare',/(pharmacy|drug mart|shoppers|rexall|clinic|dental|medical)/],
    ['Shopping',/(amazon|best buy|canadian tire|dollarama|winners|homesense|ikea|home depot|rona|staples)/],
    ['Entertainment',/(cineplex|netflix|spotify|theatre|cinema|game|entertainment)/]
  ];
  return rules.find(([,rx])=>rx.test(s))?.[0]||'Other';
}
function fillReceiptField(form,name,value){
  const el=form?.elements?.namedItem(name);
  if(!el||value===null||value===undefined||value==='')return false;
  el.value=String(value);
  el.dispatchEvent(new Event('change',{bubbles:true}));
  return true;
}
async function getReceiptOCRWorker(){
  if(receiptOCRWorker)return receiptOCRWorker;
  if(!window.Tesseract?.createWorker)throw new Error('The receipt reader could not load. Check your internet connection and try again.');
  receiptOCRWorker=await Tesseract.createWorker('eng',1,{
    logger:m=>{
      const status=document.getElementById('receiptOCRStatus');
      const bar=document.getElementById('receiptOCRProgress');
      if(status&&m.status)status.textContent=m.status.replace(/_/g,' ');
      if(bar&&Number.isFinite(m.progress))bar.style.width=`${Math.round(m.progress*100)}%`;
    }
  });
  return receiptOCRWorker;
}
async function scanReceiptImage(file){
  const form=document.getElementById('entryForm');
  const statusBox=document.getElementById('receiptOCRBox');
  const status=document.getElementById('receiptOCRStatus');
  const raw=document.getElementById('receiptOCRRaw');
  if(!form||!file)return;
  statusBox?.classList.remove('hidden');
  if(status)status.textContent='Preparing receipt…';
  try{
    const blob=await compressReceiptImage(file);
    const worker=await getReceiptOCRWorker();
    if(status)status.textContent='Reading receipt…';
    const result=await worker.recognize(blob);
    const text=normalizeOCRText(result?.data?.text);
    if(!text)throw new Error('No readable text was found. Try retaking the photo in brighter light with the whole receipt visible.');
    const merchant=parseReceiptMerchant(text);
    const total=parseReceiptTotal(text);
    const date=parseReceiptDate(text);
    const category=suggestReceiptCategory(merchant,text);

    fillReceiptField(form,'merchant',merchant);if(form)form.dataset.ocrMerchant=merchant||'';
    if(total!==null)fillReceiptField(form,'amount',total.toFixed(2));
    const dateField=form?.elements?.namedItem('date');
    if(date) fillReceiptField(form,'date',date);
    else if(dateField) dateField.value='';
    fillReceiptField(form,'category',category);

    const found=[];
    if(merchant)found.push(`merchant: ${merchant}`);
    if(total!==null)found.push(`paid: ${money(total)}`);
    if(date)found.push(`date: ${fmt(date)}`);
    if(category)found.push(`category: ${category}`);
    if(status)status.textContent=found.length?`Filled ${found.join(' · ')}. Date detection checks all date-like lines and prefers repeated agreement. Please check the details before saving.`:'Text was read, but the main receipt details were unclear. Please fill in the missing fields.';
    if(raw){raw.textContent=text;raw.parentElement?.classList.remove('hidden')}
  }catch(err){
    console.error('Receipt OCR failed:',err);
    if(status)status.textContent=err?.message||'Can Budget could not read this receipt. You can still enter the details manually.';
  }
}

function receipts(){
 const all=[...(state.receipts||[])].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 const groups={};
 all.forEach(r=>{const key=(r.date||'').slice(0,7)||'Undated';(groups[key]??=[]).push(r)});
 const blocks=Object.entries(groups).sort((a,b)=>b[0].localeCompare(a[0])).map(([key,rows])=>{
   let label=key;
   if(/^\d{4}-\d{2}$/.test(key)){const [y,m]=key.split('-');label=new Date(Number(y),Number(m)-1,1).toLocaleDateString('en-CA',{month:'long',year:'numeric'})}
   const total=rows.reduce((s,r)=>s+Number(r.amount||0),0);
   return `<div class="receipt-month">
    <div class="sectionhead receipt-month-head"><h2>${esc(label)}</h2><span class="muted">${rows.length} receipt${rows.length===1?'':'s'} · ${money(total)}</span></div>
    ${rows.map(r=>`<button class="receipt-card" data-action="viewReceipt" data-id="${r.id}">
      <div class="receipt-thumb-wrap">${r.imageId?`<img data-receipt-thumb="${r.imageId}" alt="Receipt photo">`:`<div class="receipt-no-photo">▧</div>`}</div>
      <div class="receipt-info"><strong>${esc(r.merchant)}</strong><span class="muted">${esc(r.category||'Other')} · ${fmt(r.date)}</span>${r.note?`<span class="muted">${esc(r.note)}</span>`:''}</div>
      <div class="receipt-amount">${money(r.amount)}<span>›</span></div>
    </button>`).join('')}
   </div>`;
 }).join('');
 const total=all.reduce((s,r)=>s+Number(r.amount||0),0);
 return `${headerTitle('Receipts')}
 <div class="hero receipt-hero"><div class="label">Receipt history</div><div class="amount">${all.length}</div><p>${money(total)} logged across all saved receipts.</p></div>
 <div class="sectionhead"><h2>Receipt library</h2><button class="link" data-action="addReceipt">+ Add receipt</button></div>
 <div class="notice">Take a photo or choose one from your iPhone. Can Budget compresses the image and stores it separately from your budget data on this device.</div>
 ${blocks||'<div class="empty">No receipts yet. Grab one and tap + Add receipt.</div>'}`;
}

function openModal(content){
  const modal=document.getElementById('modal');
  const backdrop=document.getElementById('modalBackdrop');
  if(!modal||!backdrop)throw new Error('Can Budget could not open this form because the modal container is missing.');
  modal.innerHTML=content;
  backdrop.classList.remove('hidden');
}
function closeModal(){
  const modal=document.getElementById('modal');
  const backdrop=document.getElementById('modalBackdrop');
  if(modal)modal.innerHTML='';
  if(backdrop)backdrop.classList.add('hidden');
}
function formShell(title,body,saveLabel,kind,id=''){
  return `<div class="modalhead"><h2>${esc(title)}</h2><button type="button" class="close" data-close>×</button></div>
  <form id="entryForm" data-kind="${esc(kind)}" data-id="${esc(id)}">
    ${body}
    <button class="primary" type="submit">${esc(saveLabel)}</button>
  </form>`;
}

function openAddMenu(){
  openModal(`<div class="modalhead add-sheet-head">
    <div class="add-sheet-title"><div class="add-sheet-plus">+</div><div><h2>Add</h2><p>What would you like to add?</p></div></div>
    <button type="button" class="close" data-close>×</button>
  </div>
  <div class="add-choice-list">
    <button class="add-choice" data-action="addIncome">
      <span class="add-choice-icon income">💵</span>
      <span class="add-choice-copy"><strong>Add income</strong><small>Add money you've received</small></span>
      <span class="add-choice-arrow">›</span>
    </button>
    <button class="add-choice" data-action="addExpense">
      <span class="add-choice-icon expense">🛒</span>
      <span class="add-choice-copy"><strong>Add expense</strong><small>Add a purchase or spending</small></span>
      <span class="add-choice-arrow">›</span>
    </button>
    <button class="add-choice" data-action="addBill">
      <span class="add-choice-icon bill">🧾</span>
      <span class="add-choice-copy"><strong>Add bill</strong><small>Add a bill you need to pay</small></span>
      <span class="add-choice-arrow">›</span>
    </button>
    <button class="add-choice featured" data-action="addReceipt">
      <span class="add-choice-icon receipt">📷</span>
      <span class="add-choice-copy"><strong>Add receipt</strong><small>Take a photo or upload a receipt</small></span>
      <span class="add-choice-arrow">›</span>
    </button>
    <button class="add-choice" data-action="bankTransaction">
      <span class="add-choice-icon bank">🏦</span>
      <span class="add-choice-copy"><strong>Bank transaction</strong><small>Record a manual account transaction</small></span>
      <span class="add-choice-arrow">›</span>
    </button>
  </div>`);
}

function addReceipt(){openModal(formShell('Add receipt',`
 <div class="notice"><strong>Automatic receipt reader</strong><br>Take a clear photo of the full receipt. Can Budget will try to fill in the merchant, total, date, and category for you. Always check the detected details before saving.</div>
 <div class="field"><label>Receipt image</label><label class="receipt-photo-picker" for="receiptImage"><span class="receipt-camera">📷</span><span><strong>Take / choose photo</strong><small>Keep the receipt flat, bright, and fully inside the photo</small></span></label><input id="receiptImage" class="receipt-file-input" name="receiptImage" type="file" accept="image/*" capture="environment" required></div>
 <div id="receiptPreviewBox" class="receipt-preview hidden"><img id="receiptPreview" alt="Selected receipt preview"><div id="receiptFileName" class="muted"></div></div>
 <div id="receiptOCRBox" class="receipt-ocr-box hidden"><div class="receipt-ocr-title"><span>✨ Reading receipt</span><span id="receiptOCRStatus">Waiting…</span></div><div class="receipt-ocr-track"><div id="receiptOCRProgress"></div></div></div>
 <div class="field"><label>Merchant <span class="autofill-label">Auto-fill</span></label><input name="merchant" placeholder="Scanning will try to fill this" required></div>
 <div class="field"><label>Amount paid (CAD) <span class="autofill-label">Auto-fill</span></label><input name="amount" type="number" min="0" step=".01" placeholder="0.00" required></div>
 <div class="field"><label>Category <span class="autofill-label">Suggested</span></label><select name="category">${['Groceries','Restaurants','Transportation','Shopping','Entertainment','Bills','Healthcare','Other'].map(x=>`<option>${x}</option>`).join('')}</select></div>
 <div class="field"><label>Date <span class="autofill-label">Auto-fill</span></label><input name="date" type="date" value="" required></div>
 <div class="field"><label>Note</label><input name="note" placeholder="Optional"></div>
 <details class="receipt-raw-wrap hidden"><summary>Detected receipt text</summary><pre id="receiptOCRRaw"></pre></details>
 <div class="notice">Can Budget's receipt reading is a convenience feature and can make mistakes. Confirm the merchant, total, and date before saving. Saving a receipt still does not create an expense automatically in this test build.</div>`,'Save receipt','receipt'))}
async function viewReceipt(id){
 const r=state.receipts.find(x=>String(x.id)===String(id));if(!r)return;
 openModal(`<div class="modalhead"><h2>${esc(r.merchant)}</h2><button class="close" data-close>×</button></div>
  <div id="receiptDetailImage" class="receipt-detail-image"><div class="receipt-image-loading">Loading receipt photo…</div></div>
  <div class="card receipt-detail-card"><div class="line"><span>Amount</span><b>${money(r.amount)}</b></div><div class="line"><span>Date</span><b>${fmt(r.date)}</b></div><div class="line"><span>Category</span><b>${esc(r.category||'Other')}</b></div>${r.note?`<div class="line"><span>Note</span><b>${esc(r.note)}</b></div>`:''}</div>
  <button class="primary danger" data-delete-receipt="${r.id}">Delete receipt</button>`);
 try{
   const blob=r.imageId?await getReceiptImage(r.imageId):null,box=document.getElementById('receiptDetailImage');
   if(!box)return;
   if(!blob){box.innerHTML='<div class="empty">No receipt photo is stored for this entry.</div>';return}
   const url=URL.createObjectURL(blob);box.innerHTML=`<img src="${url}" alt="Receipt from ${esc(r.merchant)}">`;
   box.querySelector('img')?.addEventListener('load',()=>URL.revokeObjectURL(url),{once:true});
 }catch(e){document.getElementById('receiptDetailImage').innerHTML='<div class="empty">The receipt photo could not be loaded.</div>'}
}
function addIncome(id=null){const x=id?state.income.find(v=>v.id==id):null;openModal(formShell(x?'Edit income':'Add income',`
 <div class="field"><label>Description</label><input name="description" value="${esc(x?.description||'Paycheque')}" required></div><div class="field"><label>Amount (CAD)</label><input name="amount" type="number" step="0.01" min="0" value="${x?.amount||''}" required></div><div class="field"><label>Frequency</label><select name="frequency">${['One-time','Weekly','Every 2 weeks','Twice a month','Monthly'].map(v=>`<option ${x?.frequency===v?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label>Deposit account</label><select name="accountId">${accountOptions(accountId(x)||state.accounts[0]?.id)}</select></div><div class="field"><label>Date</label><input name="date" type="date" value="${x?.date||today()}" required></div>${x?'<button type="button" class="primary danger" data-delete-income>Delete income</button>':''}`,'Save income','income',id||''))}
function addExpense(id=null){const x=id?state.expenses.find(v=>v.id==id):null;openModal(formShell(x?'Edit expense':'Add expense',`
 <div class="field"><label>Description</label><input name="description" value="${esc(x?.description||'')}" required></div><div class="field"><label>Amount (CAD)</label><input name="amount" type="number" step="0.01" min="0" value="${x?.amount||''}" required></div><div class="field"><label>Category</label><select name="category">${['Groceries','Restaurants','Transportation','Shopping','Entertainment','Bills','Healthcare','Other'].map(v=>`<option ${x?.category===v?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label>Payment account</label><select name="accountId">${accountOptions(accountId(x)||state.accounts[0]?.id)}</select></div><div class="field"><label>Date</label><input name="date" type="date" value="${x?.date||today()}" required></div>${x?'<button type="button" class="primary danger" data-delete-expense>Delete expense</button>':''}`,'Save expense','expense',id||''))}
function addBill(id=null){const b=id?state.bills.find(x=>x.id==id):null;openModal(formShell(b?'Edit bill':'Add bill',`
 <div class="field"><label>Bill name</label><input name="name" value="${esc(b?.name||'')}" required></div><div class="field"><label>Amount (CAD)</label><input name="amount" type="number" step="0.01" min="0" value="${b?.amount||''}" required></div><div class="field"><label>Due / anchor date</label><input name="date" type="date" value="${b?.date||today()}" required></div><div class="field"><label>Frequency</label><select name="frequency">${['One-time','Weekly','Every 2 weeks','Monthly','Yearly'].map(x=>`<option ${b?.frequency===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Category</label><select name="category">${['Housing','Utilities','Insurance','Debt','Subscriptions','Other'].map(x=>`<option ${b?.category===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Reminders</label><div class="notice">Choose as many as you want. Can Budget will keep this schedule with the bill.</div><div style="display:grid;gap:8px">${['14 days before','7 days before','3 days before','1 day before'].map(v=>{const selected=Array.isArray(b?.reminders)?b.reminders:(b?.reminder?[b.reminder]:['7 days before','3 days before','1 day before']);return `<label style="display:flex;align-items:center;gap:9px;padding:9px 11px;border:1px solid #dbe8f2;border-radius:10px;background:#fbfdff"><input type="checkbox" name="reminders" value="${v}" ${selected.includes(v)?'checked':''}> ${v}</label>`}).join('')}</div></div>${b?'<button type="button" class="primary danger" data-delete-bill>Delete bill</button>':''}`,'Save bill','bill',id||''))}
function editPay(){openModal(formShell('Pay schedule',`<div class="field"><label>Pay frequency</label><select name="frequency">${['Weekly','Every 2 weeks','Twice a month','Monthly'].map(x=>`<option ${state.settings.frequency===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Typical paycheque (CAD)</label><input name="amount" type="number" step=".01" min="0" value="${state.settings.payAmount}" required></div><div class="field"><label>Next payday</label><input name="date" type="date" value="${state.settings.nextPayday}" required></div>`,'Save pay schedule','pay'))}
function editSavings(){openModal(formShell('Savings plan',`<div class="field"><label>Suggested savings per pay period (CAD)</label><input name="goal" type="number" step=".01" min="0" value="${state.savings.goal}" required></div><div class="field"><label>Safety buffer (CAD)</label><input name="buffer" type="number" step=".01" min="0" value="${state.savings.buffer}" required></div>`,'Save savings plan','savings'))}
function editAccount(id){const a=state.accounts.find(x=>x.id==id);if(!a)return;openModal(formShell('Edit account',`<div class="field"><label>Account name</label><input name="name" value="${esc(a.name)}" required></div><div class="field"><label>Account type</label><select name="type">${['Checking','Savings','Credit card','Cash','Other'].map(v=>`<option ${a.type===v?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label>Institution</label><input name="institution" value="${esc(a.institution||'')}" placeholder="e.g. TD"></div><div class="field"><label>Last 4 digits</label><input name="last4" inputmode="numeric" maxlength="4" value="${esc(a.last4||'')}" placeholder="Optional"></div><div class="field"><label>Current balance (CAD)</label><input name="balance" type="number" step=".01" value="${a.balance}" required></div><div class="notice">Changing the balance here is treated as a manual bank-balance correction. Use Reconcile when you want a dated adjustment.</div>`,'Save account','account',id))}
function addAccount(){openModal(formShell('Add bank account',`<div class="field"><label>Account name</label><input name="name" placeholder="e.g. Emergency savings" required></div><div class="field"><label>Account type</label><select name="type">${['Checking','Savings','Credit card','Cash','Other'].map(v=>`<option>${v}</option>`).join('')}</select></div><div class="field"><label>Institution</label><input name="institution" placeholder="e.g. RBC"></div><div class="field"><label>Last 4 digits</label><input name="last4" inputmode="numeric" maxlength="4" placeholder="Optional"></div><div class="field"><label>Starting balance (CAD)</label><input name="balance" type="number" step=".01" value="0" required></div>`,'Add account','newAccount'))}
function transfer(){if(state.accounts.length<2){alert('Add at least two accounts before transferring money.');return}openModal(formShell('Transfer money',`<div class="notice">Transfers move money between your Can Budget accounts without counting as income or spending.</div><div class="field"><label>From</label><select name="fromId">${accountOptions(state.accounts[0].id)}</select></div><div class="field"><label>To</label><select name="toId">${accountOptions(state.accounts[1]?.id)}</select></div><div class="field"><label>Amount (CAD)</label><input name="amount" type="number" min="0.01" step=".01" required></div><div class="field"><label>Date</label><input name="date" type="date" value="${today()}" required></div><div class="field"><label>Note</label><input name="description" placeholder="e.g. Move money to savings"></div>`,'Transfer','transfer'))}
function bankTransaction(){openModal(formShell('Record bank transaction',`<div class="notice">Use this for a bank transaction that is not already being recorded as income or an expense.</div><div class="field"><label>Description</label><input name="description" placeholder="e.g. ATM cash withdrawal" required></div><div class="field"><label>Account</label><select name="accountId">${accountOptions(state.accounts[0]?.id)}</select></div><div class="field"><label>Transaction type</label><select name="direction"><option value="deposit">Deposit / credit</option><option value="withdrawal">Withdrawal / debit</option></select></div><div class="field"><label>Amount (CAD)</label><input name="amount" type="number" min="0.01" step=".01" required></div><div class="field"><label>Date</label><input name="date" type="date" value="${today()}" required></div>`,'Record transaction','bankTransaction'))}
function reconcileAccount(id){const a=accountById(id);if(!a)return;openModal(formShell(`Reconcile ${esc(a.name)}`,`<div class="notice">Enter the balance shown by your bank. Can Budget will calculate the difference and create a dated adjustment if needed.</div><div class="card"><div class="line"><span>Can Budget balance</span><b>${money(a.balance)}</b></div></div><div class="field"><label>Bank balance (CAD)</label><input name="actual" type="number" step=".01" value="${a.balance}" required></div><div class="field"><label>Date</label><input name="date" type="date" value="${today()}" required></div>`,'Reconcile account','reconcile',id))}

document.addEventListener('click',e=>{
 const nav=e.target.closest('[data-nav]');if(nav){current=nav.dataset.nav;render();return}
 if(e.target.closest('#addBtn')){openAddMenu();return}
 if(e.target.closest('[data-close]')){closeModal();return}
 if(e.target.closest('[data-dismiss-save-error]')){document.getElementById('saveError')?.remove();return}
 if(e.target.id==='annualYear'){return}
 const a=e.target.closest('[data-action]');if(a){const act=a.dataset.action;if(act==='addIncome')addIncome();if(act==='addExpense')addExpense();if(act==='addBill')addBill();if(act==='editIncome')addIncome(a.dataset.id);if(act==='editExpense')addExpense(a.dataset.id);if(act==='editBill')addBill(a.dataset.id);if(act==='editPay')editPay();if(act==='editSavings')editSavings();if(act==='editAccount')editAccount(a.dataset.id);if(act==='addAccount')addAccount();if(act==='addReceipt')addReceipt();if(act==='viewReceipt')viewReceipt(a.dataset.id);if(act==='transfer')transfer();if(act==='bankTransaction')bankTransaction();if(act==='reconcile')reconcileAccount(a.dataset.id)}
 if(e.target.closest('[data-delete-bill]')){const f=document.getElementById('entryForm'),id=f.dataset.id;state.bills=state.bills.filter(x=>x.id!=id);save();closeModal()}
 if(e.target.closest('[data-delete-income]')){const f=document.getElementById('entryForm'),id=f.dataset.id,x=state.income.find(v=>v.id==id);if(x)adjustAccount(accountId(x),-Number(x.amount));state.income=state.income.filter(x=>x.id!=id);save();closeModal()}
 if(e.target.closest('[data-delete-expense]')){const f=document.getElementById('entryForm'),id=f.dataset.id,x=state.expenses.find(v=>v.id==id);if(x)adjustAccount(accountId(x),Number(x.amount));state.expenses=state.expenses.filter(x=>x.id!=id);save();closeModal()}
 if(e.target.closest('[data-delete-receipt]')){
   const id=e.target.closest('[data-delete-receipt]').dataset.deleteReceipt,r=state.receipts.find(x=>String(x.id)===String(id));
   if(r?.imageId)deleteReceiptImage(r.imageId).catch(()=>{});
   state.receipts=state.receipts.filter(x=>String(x.id)!==String(id));current='receipts';save();closeModal();
 }
 if(e.target.closest('#settingsBtn'))alert('Bank connections are not live yet. This version builds the manual banking foundation first: accounts, transfers, bank transactions and reconciliation.');
});
document.getElementById('modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeModal()});
const mainAddButton=document.getElementById('addBtn');
if(mainAddButton){
  mainAddButton.addEventListener('click',e=>{
    e.preventDefault();
    e.stopPropagation();
    openAddMenu();
  });
}

document.addEventListener('change',e=>{
 if(e.target.id==='annualYear'){render();return}
 if(e.target.id==='receiptImage'){
   const file=e.target.files?.[0],box=document.getElementById('receiptPreviewBox'),img=document.getElementById('receiptPreview'),name=document.getElementById('receiptFileName');
   if(!file||!box||!img)return;
   const url=URL.createObjectURL(file);img.src=url;name.textContent=`${file.name || 'Receipt photo'} · ${Math.max(1,Math.round(file.size/1024))} KB`;box.classList.remove('hidden');
   img.addEventListener('load',()=>URL.revokeObjectURL(url),{once:true});
   scanReceiptImage(file);
 }
});

document.addEventListener('submit',async e=>{
 if(e.target.id!=='entryForm')return;e.preventDefault();e.stopPropagation();const f=e.target,d=Object.fromEntries(new FormData(f).entries()),kind=f.dataset.kind;
 try{
  const requiredLabels={income:{description:'Please enter an income description.',amount:'Please enter an income amount greater than $0.',accountId:'Please choose the account receiving this income.',date:'Please choose the income date.'},expense:{description:'Please enter a description for this expense.',amount:'Please enter an expense amount greater than $0.',accountId:'Please choose the account paying this expense.',date:'Please choose the expense date.'},bill:{name:'Please enter a name for this bill.',amount:'Please enter a bill amount greater than $0.',date:'Please choose the bill due date.'},receipt:{merchant:'Please enter the merchant name.',amount:'Please enter a receipt amount greater than $0.',date:'Please choose the receipt date.'}};
  const labels=requiredLabels[kind]||{};
  for(const key of Object.keys(labels)){ if(d[key]===undefined || String(d[key]).trim()==='' || (key==='amount' && (!(Number(d[key])>0)))) throw new Error(labels[key]); }
  if(['income','expense','bill','receipt'].includes(kind) && d.date){ const dt=new Date(d.date+'T12:00:00'); if(Number.isNaN(dt.getTime())) throw new Error('Please choose a valid date.'); }
  if(kind==='income' && !accountById(Number(d.accountId))) throw new Error('The selected deposit account could not be found. Please choose another account.');
  if(kind==='expense' && !accountById(Number(d.accountId))) throw new Error('The selected payment account could not be found. Please choose another account.');
  if(kind==='income'){
   const old=f.dataset.id?state.income.find(x=>x.id==f.dataset.id):null,item={id:f.dataset.id?Number(f.dataset.id):uid(),description:d.description,amount:Number(d.amount),frequency:d.frequency,accountId:Number(d.accountId),date:d.date};
   if(old){adjustAccount(accountId(old),-Number(old.amount));adjustAccount(item.accountId,Number(item.amount));state.income=state.income.map(x=>x.id==f.dataset.id?item:x)}else{state.income.push(item);adjustAccount(item.accountId,item.amount)}
   state.settings.frequency=d.frequency;state.settings.payAmount=item.amount;state.settings.nextPayday=item.date;
  }
  if(kind==='expense'){
   const old=f.dataset.id?state.expenses.find(x=>x.id==f.dataset.id):null,item={id:f.dataset.id?Number(f.dataset.id):uid(),description:d.description,amount:Number(d.amount),category:d.category,accountId:Number(d.accountId),date:d.date};
   if(old){adjustAccount(accountId(old),Number(old.amount));adjustAccount(item.accountId,-Number(item.amount));state.expenses=state.expenses.map(x=>x.id==f.dataset.id?item:x)}else{state.expenses.push(item);adjustAccount(item.accountId,-item.amount)}
  }
  if(kind==='bill'){const reminderValues=[...f.querySelectorAll('input[name="reminders"]:checked')].map(x=>x.value),item={id:f.dataset.id?Number(f.dataset.id):uid(),name:d.name,amount:Number(d.amount),date:d.date,frequency:d.frequency,category:d.category,reminders:reminderValues,reminder:reminderValues[0]||null};if(f.dataset.id)state.bills=state.bills.map(x=>x.id==f.dataset.id?item:x);else state.bills.push(item)}
  if(kind==='pay')state.settings={frequency:d.frequency,payAmount:Number(d.amount),nextPayday:d.date};
  if(kind==='savings')state.savings={goal:Number(d.goal),buffer:Number(d.buffer)};
  if(kind==='account'){const id=Number(f.dataset.id),a=accountById(id),oldBalance=Number(a.balance);const newBalance=Number(d.balance);state.accounts=state.accounts.map(x=>x.id===id?{...x,name:d.name,type:d.type,institution:d.institution||'',last4:String(d.last4||'').slice(-4),balance:newBalance,available:Number(x.available||oldBalance)+(newBalance-oldBalance),lastReconciled:x.lastReconciled||''}:x)}
  if(kind==='newAccount'){const balance=Number(d.balance)||0;state.accounts.push({id:uid(),name:d.name,type:d.type,institution:d.institution||'',last4:String(d.last4||'').slice(-4),balance,available:balance,lastReconciled:''})}
  if(kind==='transfer'){const from=Number(d.fromId),to=Number(d.toId),amount=Number(d.amount);if(!amount||amount<=0)throw new Error('Invalid transfer amount');if(from===to)throw new Error('From and To accounts must be different');const src=accountById(from);if(amount>Number(src?.balance||0))throw new Error('Transfer exceeds the source account balance');adjustAccount(from,-amount);adjustAccount(to,amount);state.transfers.push({id:uid(),fromId:from,toId:to,amount,date:d.date,description:d.description||'Transfer'})}
  if(kind==='bankTransaction'){const amount=Math.abs(Number(d.amount));if(!amount)throw new Error('Invalid amount');const signed=d.direction==='withdrawal'?-amount:amount;adjustAccount(Number(d.accountId),signed);state.bankTransactions.push({id:uid(),accountId:Number(d.accountId),description:d.description,amount:signed,date:d.date})}
  if(kind==='receipt'){
   const amount=Math.abs(Number(d.amount));if(!amount)throw new Error('Please enter a receipt amount greater than $0.');
   const file=f.querySelector('#receiptImage')?.files?.[0];if(!file)throw new Error('Please take a photo or choose a receipt image before saving.');
   const id=uid(),imageId=`receipt-${id}`,blob=await compressReceiptImage(file);
   try{await saveReceiptImage(imageId,blob)}catch(mediaErr){throw new Error('Can Budget could not save the receipt photo on this device. '+(mediaErr?.message||''))}
   if(f.dataset.ocrMerchant&&normalizeMerchantOCR(f.dataset.ocrMerchant)!==normalizeMerchantOCR(d.merchant))saveMerchantAlias(f.dataset.ocrMerchant,d.merchant);
   state.receipts.push({id,merchant:d.merchant,amount,date:d.date,category:d.category,note:d.note||'',imageId,createdAt:Date.now()});current='receipts';
  }
  if(kind==='reconcile'){ const id=Number(f.dataset.id),a=accountById(id),actual=Number(d.actual);if(!a||Number.isNaN(actual))throw new Error('Invalid bank balance');const adjustment=actual-Number(a.balance);if(Math.abs(adjustment)>0.004){adjustAccount(id,adjustment);state.reconciliations.push({id:uid(),accountId:id,adjustment,date:d.date,actualBalance:actual})}a.lastReconciled=d.date;
  }
  if(!save()) return; closeModal();
 }catch(err){console.error(err);showSaveError(err)}
});
render();
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}))}
