const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let selectedEvent = 'Birthday';
let currentPlan = null;
let currentData = null;
let toastTimer;
const STORE_KEY = 'celebrai-planner-v2';
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200); }
function money(n) { return new Intl.NumberFormat('en-IN', {style:'currency',currency:'INR',maximumFractionDigits:0}).format(Number(n)||0); }
function updatePreview() {
  const guests = Math.max(1, Number($('#guests').value)||1), budget = Math.max(0, Number($('#budget').value)||0);
  const name = $('#event-name').value.trim();
  $('#preview-title').textContent = name || `A ${selectedEvent.toLowerCase()} to remember`;
  $('#preview-event').textContent = name || `${selectedEvent} Celebration`;
  $('#preview-guests').textContent = guests.toLocaleString('en-IN');
  $('#preview-budget').textContent = money(budget);
  const date = $('#event-date').value;
  if (date) { const d = Math.ceil((new Date(date+'T12:00:00')-new Date())/86400000); $('#preview-days').textContent = d < 0 ? 'Date passed' : d === 0 ? 'Today!' : `${d} days`; }
  else $('#preview-days').textContent = 'Flexible';
}
function persistDraft() { try { localStorage.setItem(STORE_KEY, JSON.stringify({event_type:selectedEvent,event_name:$('#event-name').value,event_date:$('#event-date').value,guests:$('#guests').value,budget:$('#budget').value,location:$('#location').value,preferences:$('#vibe').value,plan:currentPlan,data:currentData,checked:$$('#result-content [data-task]').map((el)=>el.checked)})); } catch (_) {} }
function restoreDraft() { try { const d=JSON.parse(localStorage.getItem(STORE_KEY)||'null'); if(!d)return; selectedEvent=d.event_type||'Birthday'; $$('.occasion').forEach(b=>b.classList.toggle('selected',b.dataset.event===selectedEvent)); $('#event-type').value=selectedEvent; for(const [key,selector] of [['event_name','#event-name'],['event_date','#event-date'],['guests','#guests'],['budget','#budget'],['location','#location'],['preferences','#vibe']]) if(d[key]!==undefined) $(selector).value=d[key]; updatePreview(); if(d.plan&&d.data){currentPlan=d.plan;currentData=d.data;renderPlan(d.plan,d.data,d.checked||[]);} } catch (_) {} }
$$('.occasion').forEach(btn => btn.addEventListener('click', () => { $$('.occasion').forEach(b=>b.classList.remove('selected')); btn.classList.add('selected'); selectedEvent = btn.dataset.event; $('#event-type').value = selectedEvent; updatePreview(); persistDraft(); }));
['#event-name','#event-date','#guests','#budget','#location','#vibe'].forEach(s => $(s).addEventListener('input',()=>{updatePreview();persistDraft();}));
function safeText(value) { return String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c])); }
function listOf(value, fallback=[]) { return Array.isArray(value) ? value : fallback; }
function renderPlan(plan, data, checked=[]) {
  const budgetItems = listOf(plan.budget_breakdown, []);
  const total = budgetItems.reduce((n,x)=>n+Math.max(0,Number(x.amount)||0),0);
  const budget = Number(data.budget)||0, guests=Number(data.guests)||1;
  const tasks = listOf(plan.checklist, []);
  const timeline = listOf(plan.timeline, []);
  const ideas = listOf(plan.personalized_ideas, []);
  const completed=checked.filter(Boolean).length, progress=tasks.length?Math.round(completed/tasks.length*100):0;
  const generated=plan.ai_generated===true;
  const budgetRows = budgetItems.map(x=>{const amount=Math.max(0,Number(x.amount)||0);return `<div class="budget-row"><span>${safeText(x.category||'Other')}</span><div class="budget-bar"><span style="width:${Math.min(100,total?amount/total*100:0)}%"></span></div><b>${money(amount)}</b></div>`}).join('');
  const checklistHTML = tasks.length ? tasks.map((x,i)=>`<label class="check-row ${checked[i]?'done':''}"><input type="checkbox" data-task="${i}" ${checked[i]?'checked':''}><span>${safeText(typeof x==='string'?x:x.task)}${x.owner?`<small class="task-meta">Suggested owner: ${safeText(x.owner)}</small>`:''}</span></label>`).join('') : '<p>Add your first task after reviewing the plan.</p>';
  const timelineHTML = timeline.length ? timeline.map(x=>`<div class="timeline-item"><span class="timeline-time">${safeText(x.when||x.date||'Soon')}</span><span class="timeline-dot"></span><div><b>${safeText(x.title||x.task||'Planning step')}</b><p>${safeText(x.detail||x.description||'')}</p></div></div>`).join('') : '<p>Choose an event date to refine your schedule.</p>';
  const ideasHTML = ideas.length ? ideas.map(x=>`<span class="idea-chip">${safeText(typeof x==='string'?x:x.title||x.idea)}</span>`).join('') : '<span class="idea-chip">Personalize your celebration</span>';
  const unallocated=Math.max(0,budget-total), over=Math.max(0,total-budget);
  const perGuest=budget/guests;
  const date=data.event_date?new Date(data.event_date+'T12:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'Date to be confirmed';
  $('#result-heading').textContent = plan.event_title || `${selectedEvent} blueprint`;
  $('#result-content').innerHTML = `<div class="progress-shell"><div class="progress-copy"><b>Celebration readiness <span class="saved-indicator">● Saved on this device</span></b><small>Tick tasks as you finish them. Your checklist stays saved in this browser.</small><div class="progress-track"><span id="progress-fill" style="width:${progress}%"></span></div></div><div class="progress-number" id="progress-number">${progress}%</div></div><div class="insight-strip"><div class="insight-tile accent"><span>PLANNED BUDGET</span><b>${money(budget)}</b><small>${money(Math.round(perGuest))} per guest · ${guests.toLocaleString('en-IN')} guests</small></div><div class="insight-tile mint"><span>ALLOCATION CHECK</span><b>${total<=budget?'On budget':'Over budget'}</b><small>${total<=budget?money(unallocated)+' still unallocated':money(over)+' above your limit'}</small></div><div class="insight-tile peach"><span>EVENT DATE</span><b style="font-size:15px">${safeText(date)}</b><small>${safeText(data.location||'Location to be confirmed')}</small></div></div><div class="result-grid"><article class="result-card full"><h3>✦ Your event concept <span class="tiny-label">${generated?'AI-PERSONALIZED':'STARTER BLUEPRINT'}</span></h3><p>${safeText(plan.summary||'Your personalized event plan is ready to review.')}</p><div>${ideasHTML}</div></article><article class="result-card"><h3>◫ Budget blueprint</h3><p>Suggested allocation by category</p>${budgetRows||'<p>Budget allocation will be refined after you review vendor quotes.</p>'}<div class="allocation-total"><span>Allocated estimate</span><b>${money(total)}</b></div><p class="estimate-warning">Planning estimate only. Confirm local vendor quotes, taxes, delivery charges and cancellation terms. Keep emergency funds separate.</p></article><article class="result-card"><h3>☷ Action checklist</h3>${checklistHTML}</article><article class="result-card full"><h3>◷ Suggested timeline</h3>${timelineHTML}</article><article class="result-card"><h3>✧ Risk radar</h3><div class="risk-line"><span class="risk-mark">!</span><div><strong>Budget overrun</strong>${budget>0?'Get written quotes and keep 5–10% aside for unexpected costs.':'Set a realistic spending limit before booking.'}</div></div><div class="risk-line"><span class="risk-mark">⌁</span><div><strong>Guest & dietary needs</strong>Confirm RSVPs, allergies, accessibility, and dietary preferences before paying final balances.</div></div><div class="risk-line"><span class="risk-mark">◷</span><div><strong>Backup plan</strong>Confirm weather backup, setup access, supplier arrival windows, and a day-of contact.</div></div></article><article class="result-card"><h3>✧ Practical tips</h3><p>${safeText(plan.practical_tips||'Confirm local prices and availability with vendors.')}</p><p>Event planning can involve local permits, venue rules, food safety and accessibility requirements. Check what applies to your event.</p></article></div>`;
  $$('#result-content [data-task]').forEach(box=>box.addEventListener('change',()=>{box.closest('.check-row').classList.toggle('done',box.checked);const boxes=$$('#result-content [data-task]'),done=boxes.filter(b=>b.checked).length,pct=boxes.length?Math.round(done/boxes.length*100):0;$('#progress-fill').style.width=pct+'%';$('#progress-number').textContent=pct+'%';persistDraft();}));
  $('#results').classList.remove('hidden'); persistDraft();
}
function demoPlan(){
  selectedEvent='Birthday'; $$('.occasion').forEach(b=>b.classList.toggle('selected',b.dataset.event==='Birthday')); $('#event-type').value='Birthday'; $('#event-name').value='A little garden celebration'; $('#event-date').value=''; $('#guests').value=40; $('#budget').value=20000; $('#location').value='Kolkata, West Bengal'; $('#vibe').value='A relaxed, family-friendly garden birthday. Vegetarian snacks, warm string lights, a photo corner, and low-waste reusable decor.'; updatePreview();
  const data={event_type:selectedEvent,event_name:$('#event-name').value,event_date:'',guests:40,budget:20000,location:$('#location').value,preferences:$('#vibe').value};
  const plan={event_title:'A little garden celebration',summary:'A relaxed, warm birthday for 40 guests with simple vegetarian food, reusable decor, a small photo corner and one memorable group activity. Prioritize food, comfortable seating and weather backup before optional styling.',budget_breakdown:[{category:'Venue & seating',amount:3500},{category:'Food & beverages',amount:6000},{category:'Cake & desserts',amount:2200},{category:'Decor & lighting',amount:2500},{category:'Activities & music',amount:1800},{category:'Invitations & supplies',amount:1000},{category:'Contingency reserve',amount:2000}],checklist:[{task:'Confirm a garden or covered venue and rain backup',owner:'Host'},{task:'Ask guests about dietary needs and allergies',owner:'Guest contact'},{task:'Compare two food quotes and confirm serving costs',owner:'Budget owner'},{task:'Prepare a playlist and one group activity',owner:'Host'},{task:'Borrow or reuse lights, jars and decorations',owner:'Decor lead'},{task:'Confirm cake size, pickup time and storage',owner:'Food lead'},{task:'Pack first-aid basics, rubbish bags and spare supplies',owner:'Coordinator'}],timeline:[{when:'3 weeks before',title:'Confirm venue and guest list',detail:'Check capacity, shade, toilets, access and weather alternatives.'},{when:'2 weeks before',title:'Choose food and cake',detail:'Confirm vegetarian options, allergies, delivery and serving ware.'},{when:'1 week before',title:'Finalize activities and decor',detail:'Borrow reusable items and assign setup helpers.'},{when:'2 days before',title:'Confirm every supplier',detail:'Recheck time, contact details, balances and cancellation terms.'},{when:'Event day',title:'Set up and enjoy',detail:'Arrive early, check food storage and keep the run sheet handy.'}],personalized_ideas:['Reusable jar-and-string-light decor','A shared photo corner with a memory wall','A guest-request playlist','A simple seasonal fruit and dessert table'],practical_tips:'This is an illustrative demo plan, not a vendor quote or live AI response. Check prices, weather arrangements, dietary requirements and venue rules directly.'}; currentData=data;currentPlan=plan;renderPlan(plan,data);toast('Sample plan loaded — try the checklist and export!');}
$('#event-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {event_type:selectedEvent,event_name:$('#event-name').value.trim(),event_date:$('#event-date').value,guests:Number($('#guests').value),budget:Number($('#budget').value),location:$('#location').value.trim(),preferences:$('#vibe').value.trim()};
  if (!Number.isFinite(data.guests)||data.guests<1||data.guests>10000) return toast('Enter a guest count from 1 to 10,000.');
  if (!Number.isFinite(data.budget)||data.budget<500) return toast('Enter a budget of at least ₹500.');
  const btn=$('#generate-btn'); btn.disabled=true; btn.innerHTML='<span class="spinner">✦</span> Creating your plan…';
  try {
    const response = await fetch((window.__HATCHABLE__?.api||'/api')+'/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error||'Could not generate the plan. Please try again.');
    currentPlan=result.plan; currentData=data; renderPlan(result.plan,data); toast(result.meta?.generated?'Your AI-personalized blueprint is ready.':'Your starter blueprint is ready. Review every estimate before booking.');
  } catch(err) { toast(err.message||'Something went wrong. Please retry.'); }
  finally { btn.disabled=false; btn.innerHTML='<span>✦</span> Create my event plan <span class="btn-arrow">↗</span>'; }
});
$('#demo-btn').addEventListener('click',demoPlan);
$('#edit-btn').addEventListener('click',()=>$('#event-form').scrollIntoView({behavior:'smooth',block:'start'}));
$('#agent-review-btn').addEventListener('click', async () => {
  if (!currentPlan || !currentData) return toast('Create or load a plan before asking the AI agent to review it.');
  const btn = $('#agent-review-btn'), panel = $('#agent-review');
  btn.disabled = true; btn.textContent = 'Reviewing…';
  panel.classList.remove('hidden');
  panel.innerHTML = '<div class="agent-review-loading"><span class="spinner">✦</span><b>Planning agent is checking your budget, timeline and risk gaps…</b><small>This can take a few seconds.</small></div>';
  panel.scrollIntoView({behavior:'smooth',block:'start'});
  try {
    const response = await fetch((window.__HATCHABLE__?.api||'/api')+'/review', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:currentData,plan:currentPlan})});
    const result = await response.json();
    if (!response.ok || !result.review) throw new Error(result.error || 'The agent review could not finish. Please try again.');
    const r = result.review;
    const actions = Array.isArray(r.priority_actions) ? r.priority_actions : [];
    const strengths = Array.isArray(r.strengths) ? r.strengths : [];
    const risks = Array.isArray(r.risks) ? r.risks : [];
    const priorityClass = v => String(v).toLowerCase()==='high'?'high':String(v).toLowerCase()==='medium'?'medium':'low';
    panel.innerHTML = `<section class="agent-review-panel"><div class="agent-review-head"><div><span class="eyebrow">CELEBRAI PLANNING AGENT</span><h3>Plan quality review</h3><p>${safeText(r.overall_assessment||'Review complete. Check these recommendations before booking.')}</p></div><div class="readiness-score"><b>${Math.max(0,Math.min(100,Number(r.readiness_score)||0))}</b><small>/ 100 readiness estimate</small></div></div><div class="agent-review-grid"><article class="agent-mini-card"><h4>Budget audit</h4><b>${safeText(r.budget_audit?.status||'See recommendations')}</b><small>Allocated: ${money(r.budget_audit?.allocated_inr??0)} · Remaining: ${money(r.budget_audit?.remaining_inr??0)}</small><small>Budget per guest: ${money(r.budget_audit?.per_guest_inr??(Number(currentData.budget)/Math.max(1,Number(currentData.guests))))}</small></article><article class="agent-mini-card"><h4>What is working</h4>${strengths.length?'<ul>'+strengths.map(x=>'<li>'+safeText(x)+'</li>').join('')+'</ul>':'<p>Use the action list to strengthen your plan.</p>'}</article></div><article class="agent-review-list"><h4>Priority actions</h4>${actions.length?actions.map(x=>'<div class="agent-action"><span class="priority-pill '+priorityClass(x.priority)+'">'+safeText(x.priority||'Suggested')+'</span><div><b>'+safeText(x.action||'Review this item')+'</b><p>'+safeText(x.reason||'Helps make the plan more reliable.')+'</p></div></div>').join(''):'<p>No priority actions returned. Still confirm vendor details directly.</p>'}</article><article class="agent-review-list"><h4>Risk radar</h4>${risks.length?'<ul>'+risks.map(x=>'<li>'+safeText(x)+'</li>').join('')+'</ul>':'<p>No additional risks were flagged by this review.</p>'}<p class="agent-disclaimer">Readiness is an AI estimate, not a certification. Prices, permits, venue conditions and supplier availability are not independently verified.</p></article><p class="agent-summary">${safeText(r.agent_summary||'Review your highest-priority actions before making payments.')}</p></section>`;
    toast('AI planning agent review is ready.');
  } catch (err) {
    panel.innerHTML = '<div class="agent-review-loading"><b>Review could not finish</b><small>'+safeText(err.message||'Please try again later.')+'</small></div>';
    toast(err.message||'Agent review failed.');
  } finally { btn.disabled = false; btn.textContent = '✦ AI agent review'; }
});
$('#export-btn').addEventListener('click',()=>{if(!currentPlan||!currentData)return toast('Create a plan first.');const blob=new Blob([JSON.stringify({app:'CelebrAI',exported_at:new Date().toISOString(),event:currentData,plan:currentPlan,checked:$$('#result-content [data-task]').map(el=>el.checked)},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='celebrai-event-plan.json';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);toast('Plan exported as JSON.');});
$('#print-btn').addEventListener('click',()=>window.print());
$('#reset-btn').addEventListener('click',()=>{ $('#event-form').reset(); selectedEvent='Birthday'; $$('.occasion').forEach(b=>b.classList.toggle('selected',b.dataset.event==='Birthday')); $('#event-type').value='Birthday'; $('#results').classList.add('hidden');currentPlan=null;currentData=null;try{localStorage.removeItem(STORE_KEY)}catch(_){} updatePreview(); toast('Planner reset. Start fresh!'); });
$$('.nav-item').forEach(btn=>btn.addEventListener('click',()=>{const target=btn.dataset.view; $$('.nav-item').forEach(x=>x.classList.toggle('active',x===btn)); if(target==='planner'){ $('#event-form').scrollIntoView({behavior:'smooth',block:'start'}); return; } if(!currentPlan){ demoPlan(); } const heading=target==='budget'?'Budget blueprint':target==='checklist'?'Action checklist':'Suggested timeline'; const card=$$('#result-content .result-card').find(el=>el.querySelector('h3')?.textContent.includes(heading)); if(card){card.scrollIntoView({behavior:'smooth',block:'start'});card.animate([{outline:'2px solid #9b8df0'},{outline:'2px solid transparent'}],{duration:1200});} else $('#results').scrollIntoView({behavior:'smooth',block:'start'}); }));
const dateInput=$('#event-date'); const today=new Date(); dateInput.min=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
restoreDraft();updatePreview();