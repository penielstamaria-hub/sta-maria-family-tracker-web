/* STA. MARIA Family Tracker — GitHub Pages + Supabase, or local demo mode. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const cfg = window.FAMILY_CONFIG || {};
  const configured = /^https:\/\/.+\.supabase\.co\/?$/.test(cfg.supabaseUrl || '') &&
    !!cfg.supabasePublishableKey && !cfg.supabasePublishableKey.includes('PASTE_');
  const hasSupabase = configured && !!window.supabase?.createClient;
  const db = hasSupabase ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey) : null;
  const STORAGE_KEY = 'sta-maria-tracker-demo-v1';
  const categories = { Birthday:'🎂', Anniversary:'💗', Health:'♡', Renewal:'▤', Other:'✿' };
  const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const state = { mode: null, household: null, session: null, events: [], view: 'home',
    calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1), selectedDate: null, busy: false };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const key = (d) => [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const parseDate = (s) => { const [y,m,d] = (s||'').split('-').map(Number); return new Date(y,m-1,d,12); };
  const today = () => key(new Date());
  const formatDate = (s, opts={month:'short', day:'numeric', year:'numeric'}) => parseDate(s).toLocaleDateString('en-US',opts);
  const uid = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const announcement = (msg) => { $('status-msg').textContent=msg; const t=$('toast');t.textContent=msg;t.hidden=false; clearTimeout(announcement.timeout);announcement.timeout=setTimeout(()=>t.hidden=true,3200); };
  const startOfMonth = (date) => new Date(date.getFullYear(),date.getMonth(),1);

  function occurrenceOnYear(ev, year) {
    if (ev.recurrence !== 'yearly') return (Number(ev.event_date.slice(0,4))===year) ? ev.event_date : null;
    const month=Number(ev.event_date.slice(5,7)); const originalDay=Number(ev.event_date.slice(8,10));
    const lastDay = new Date(year,month,0).getDate();
    return `${year}-${String(month).padStart(2,'0')}-${String(Math.min(originalDay,lastDay)).padStart(2,'0')}`;
  }
  function nextDate(ev){
    if(ev.recurrence !== 'yearly') return ev.event_date;
    const year = new Date().getFullYear();
    const thisYear = occurrenceOnYear(ev,year);
    return thisYear >= today() && ev.last_completed_year !== year ? thisYear : occurrenceOnYear(ev,year+1);
  }
  function isDone(ev, when){
    return ev.recurrence === 'yearly' ? Number(ev.last_completed_year) === Number(when?.slice(0,4)) : !!ev.completed;
  }
  function recordsSorted(){return [...state.events].sort((a,b)=>(isDone(a,nextDate(a))?1:0)-(isDone(b,nextDate(b))?1:0)||nextDate(a).localeCompare(nextDate(b)));}
  function eventsOnDate(s) {return state.events.filter(ev => occurrenceOnYear(ev, Number(s.slice(0,4))) === s);}
  function eventsInMonth(month){return state.events.filter(ev => {const s=occurrenceOnYear(ev,month.getFullYear());return s && s.slice(0,7)===key(month).slice(0,7);});}
  function sampleEvents() {
    const future=(days)=>{const d=new Date();d.setDate(d.getDate()+days);return key(d)};
    return [
      {id:uid(), title:'Family dentist appointment', event_date:future(3), event_type:'Health', assigned_to:'Whole Family', recurrence:'none',notes:'Demo appointment — change to your own schedule.',completed:false,last_completed_year:null},
      {id:uid(), title:'Renew membership card', event_date:future(10), event_type:'Renewal', assigned_to:'Daddy', recurrence:'none',notes:'Demo reminder',completed:false,last_completed_year:null},
      {id:uid(), title:'Family celebration', event_date:future(18), event_type:'Anniversary', assigned_to:'Whole Family', recurrence:'yearly',notes:'A sample recurring family event',completed:false,last_completed_year:null},
      {id:uid(), title:'Sample birthday', event_date:future(25), event_type:'Birthday', assigned_to:'Mommy', recurrence:'yearly',notes:'Sample birthday — edit or delete',completed:false,last_completed_year:null}
    ];
  }
  function loadDemo(){
    state.mode='demo';state.household=null;state.session=null;
    try {const d=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');state.events=Array.isArray(d)?d:sampleEvents();} catch {state.events=sampleEvents();}
    storeDemo();showApp();announcement('Demo mode: events save to this browser only.');
  }
  function storeDemo(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state.events));}
  function showApp(){
    $('auth-modal').hidden=true; $('mode-pill').textContent=state.mode==='demo'?'Demo mode':'Private family data';
    $('account-btn').title=state.mode==='demo'?'Exit demo':'Sign out';
    render();
  }
  async function connectSession(session){
    if (!session?.user) return;
    try {
      const {data,error}=await db.from('household_members').select('household_id').eq('user_id',session.user.id).limit(1).maybeSingle();
      if(error) throw error;
      if(!data?.household_id){await db.auth.signOut();showAuth('This account has no family access yet. Add its user ID to household_members in Supabase (see README).');return;}
      state.mode='online';state.session=session;state.household=data.household_id;
      await fetchEvents();showApp();
    }catch(e){showAuth('Could not connect to the family database: '+e.message);}
  }
  async function fetchEvents(){
    if(state.mode!=='online') return;
    const {data,error}=await db.from('family_events').select('*').eq('household_id',state.household).order('event_date',{ascending:true});
    if(error) throw error;
    state.events=data||[];
  }
  function showAuth(msg=''){
    $('auth-modal').hidden=false;$('auth-error').hidden=!msg;$('auth-error').textContent=msg;
    if (!configured) {$('auth-error').textContent='Supabase is not configured yet. You can try the working demo now, then connect your private database using README.md.';$('auth-error').hidden=false;$('login-btn').disabled=true;}
    else if(!hasSupabase) {$('auth-error').textContent='Supabase JavaScript did not load. Check your internet connection and reload the page.';$('auth-error').hidden=false;$('login-btn').disabled=true;}
  }
  const fullDate = (ev) => nextDate(ev);
  function eventRow(ev, when=fullDate(ev)){
    const done=isDone(ev,when);
    const overdue=ev.recurrence!=='yearly' && !done && ev.event_date < today();
    const details=[ev.assigned_to,formatDate(when,{month:'short',day:'numeric',year:'numeric'}),ev.recurrence==='yearly'?'Repeats yearly':'',overdue?'Overdue':''].filter(Boolean).join(' · ');
    return `<article class="event-row ${done?'event-done':''}"><div class="event-icon">${categories[ev.event_type]||categories.Other}</div><div class="event-row-body"><span class="event-title">${esc(ev.title)}</span><div class="event-meta">${esc(details)}</div></div><div class="event-actions"><button type="button" class="tiny-btn ${done?'done':''}" data-action="complete" data-id="${esc(ev.id)}" data-year="${when.slice(0,4)}" title="${done?'Mark not done':'Mark completed'}">${done?'↶ Undo':'✓ Done'}</button><button type="button" class="tiny-btn" data-action="edit" data-id="${esc(ev.id)}">Edit</button></div></article>`;
  }
  function render(){
    document.querySelectorAll('[data-tab]').forEach(x=>x.classList?.toggle('active',x.dataset.tab===state.view));
    ['home','events','calendar'].forEach(t=>$(t+'-view').hidden=state.view!==t);
    $('page-title').textContent={home:'Dashboard',events:'All events',calendar:'Family calendar'}[state.view];
    $('section-title').textContent={home:'Your family at a glance',events:'All your family events',calendar:'Family calendar'}[state.view];
    $('section-subtitle').textContent={home:'Everything important, in one warm place.',events:'Manage reminders and special moments.',calendar:'See everything coming up this month.'}[state.view];
    const upcoming=recordsSorted().filter(e=>e.recurrence==='yearly'||(!e.completed && e.event_date>=today()));
    const allDone=state.events.filter(e=>e.recurrence==='yearly'?e.last_completed_year===new Date().getFullYear():e.completed);
    $('stat-upcoming').textContent=upcoming.length;
    $('stat-month').textContent=eventsInMonth(new Date()).length;
    $('stat-completed').textContent=allDone.length;
    $('upcoming-list').innerHTML=upcoming.length?upcoming.slice(0,5).map(e=>eventRow(e)).join(''):'<div class="empty-state">No upcoming events yet.<br>Add one to get started. ♡</div>';
    renderCalendar($('mini-calendar'),new Date(),'mini');
    const query=$('event-search').value.trim().toLowerCase(); const type=$('event-filter').value;
    const filtered=recordsSorted().filter(e=>(type==='all'||e.event_type===type)&&(!query||(e.title+' '+e.assigned_to+' '+(e.notes||'')).toLowerCase().includes(query)));
    $('all-events-list').innerHTML=filtered.length?filtered.map(e=>eventRow(e)).join(''):'<div class="empty-state">No matching events. Try changing the search or add a new event.</div>';
    $('calendar-title').textContent=state.calendarMonth.toLocaleDateString('en-US',{month:'long',year:'numeric'});
    renderCalendar($('full-calendar'),state.calendarMonth,'full');
    renderSelectedDate();
  }
  function renderCalendar(el,month,style){
    const year=month.getFullYear(),monthNum=month.getMonth();
    const first=new Date(year,monthNum,1); const days=new Date(year,monthNum+1,0).getDate();
    const start=first.getDay(); const grid=[];
    if(style==='mini')grid.push(`<div class="mini-month">${month.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</div>`);
    let html=`<div class="${style==='mini'?'mini-grid':'full-grid'}">`;
    for(const d of weekdays)html+=`<div class="calendar-weekday">${d}</div>`;
    for(let i=0;i<start;i++)html+='<div></div>';
    for(let d=1;d<=days;d++){
      const date=key(new Date(year,monthNum,d));const count=eventsOnDate(date).length;
      const classes=['day',date===today()?'today':'',date===state.selectedDate?'selected':'',count?'has-events':''].filter(Boolean).join(' ');
      html+=`<button type="button" class="${classes}" data-action="day" data-date="${date}" aria-label="${esc(formatDate(date))}, ${count} events" title="${count} event(s)">${d}</button>`;
    }
    html+='</div>';
    el.innerHTML=(style==='mini'?grid.join(''):'')+html;
  }
  function renderSelectedDate(){
    const date=state.selectedDate||today();const evs=eventsOnDate(date);
    $('selected-day-list').innerHTML=`<h3>${esc(formatDate(date,{weekday:'long',month:'long',day:'numeric',year:'numeric'}))}</h3>`+(evs.length?evs.map(e=>eventRow(e,date)).join(''):'<p class="empty-state">No events for this day.</p>');
  }
  function openEventForm(ev){
    $('event-form').reset();$('event-id').value=ev?.id||'';
    $('event-title').value=ev?.title||'';
    $('event-date').value=ev?.event_date||state.selectedDate||today();
    $('event-type').value=ev?.event_type||'Health';
    $('event-person').value=ev?.assigned_to||'Whole Family';
    $('event-repeat').value=ev?.recurrence||'none';
    $('event-notes').value=ev?.notes||'';
    $('delete-event-btn').hidden=!ev;
    $('dialog-title').textContent=ev?'Edit event':'Add an event';
    $('event-modal').hidden=false;setTimeout(()=>$('event-title').focus(),30);
  }
  function closeEventForm(){ $('event-modal').hidden=true; }
  function findEvent(id){return state.events.find(e=>String(e.id)===String(id));}
  async function persistEvent(payload,id){
    if (state.mode==='demo'){
      if(id){const index=state.events.findIndex(e=>e.id===id); if(index>=0)state.events[index]={...state.events[index],...payload};}
      else state.events.push({...payload,id:uid(),completed:false,last_completed_year:null});
      storeDemo();return;
    }
    if(!state.household)throw Error('You are not assigned to a family account.');
    const query=id?
      db.from('family_events').update(payload).eq('id',id).eq('household_id',state.household):
      db.from('family_events').insert({...payload,household_id:state.household});
    const {error}=await query;
    if(error)throw error;
    await fetchEvents();
  }
  async function deleteEvent(id){
    if(state.mode==='demo'){state.events=state.events.filter(e=>e.id!==id);storeDemo();return;}
    const {error}=await db.from('family_events').delete().eq('id',id).eq('household_id',state.household);
    if(error)throw error;await fetchEvents();
  }
  async function toggleDone(ev,year){
    const when=occurrenceOnYear(ev,Number(year))||ev.event_date;
    const payload=ev.recurrence==='yearly'?{last_completed_year:isDone(ev,when)?null:Number(year)}:{completed:!ev.completed};
    await persistEvent(payload,ev.id);
  }
  async function busy(action){
    if(state.busy)return;state.busy=true;
    try {await action();render();}catch(e){announcement('Error: '+e.message);}finally{state.busy=false;}
  }
  function switchTab(t){state.view=t;render();$('sidebar').classList.remove('show');window.scrollTo({top:0,behavior:'smooth'});}
  document.addEventListener('click',(e)=>{
    const btn=e.target.closest('button'); if(!btn)return;
    if(btn.dataset.tab){switchTab(btn.dataset.tab);return;}
    if(btn.dataset.action==='edit'){const ev=findEvent(btn.dataset.id);if(ev)openEventForm(ev);return;}
    if(btn.dataset.action==='complete'){const ev=findEvent(btn.dataset.id);if(ev)busy(async()=>{await toggleDone(ev,btn.dataset.year);announcement('Event updated.');});return;}
    if(btn.dataset.action==='day'){state.selectedDate=btn.dataset.date;if(state.view==='home')switchTab('calendar');else render();return;}
    if(btn.classList.contains('close-modal')){closeEventForm();return;}
  });
  $('add-event-btn').addEventListener('click',()=>openEventForm());
  $('event-search').addEventListener('input',render);
  $('event-filter').addEventListener('change',render);
  $('prev-month').addEventListener('click',()=>{state.calendarMonth=new Date(state.calendarMonth.getFullYear(),state.calendarMonth.getMonth()-1,1);state.selectedDate=null;render();});
  $('next-month').addEventListener('click',()=>{state.calendarMonth=new Date(state.calendarMonth.getFullYear(),state.calendarMonth.getMonth()+1,1);state.selectedDate=null;render();});
  $('menu-btn').addEventListener('click',()=>$('sidebar').classList.toggle('show'));
  $('event-form').addEventListener('submit',(e)=>{e.preventDefault();const id=$('event-id').value;
    const payload={title:$('event-title').value.trim(),event_date:$('event-date').value,event_type:$('event-type').value,assigned_to:$('event-person').value,recurrence:$('event-repeat').value,notes:$('event-notes').value.trim()};
    if(!payload.title||!payload.event_date){announcement('Please provide a name and date.');return;}
    busy(async()=>{await persistEvent(payload,id||null);closeEventForm();announcement(id?'Event updated successfully.':'Event added successfully.');});
  });
  $('delete-event-btn').addEventListener('click',()=>{const id=$('event-id').value;if(!id||!window.confirm('Delete this event permanently?'))return;
    busy(async()=>{await deleteEvent(id);closeEventForm();announcement('Event deleted.');});
  });
  $('login-form').addEventListener('submit',async(e)=>{e.preventDefault();if(!db)return;
    $('login-btn').disabled=true;$('auth-error').hidden=true;
    try {const {data,error}=await db.auth.signInWithPassword({email:$('login-email').value.trim(),password:$('login-password').value});if(error)throw error;await connectSession(data.session);}
    catch(err){showAuth(err.message);}finally{$('login-btn').disabled=false;}
  });
  $('demo-btn').addEventListener('click',loadDemo);
  $('account-btn').addEventListener('click',async()=>{
    if(state.mode==='online'){
      if(window.confirm('Sign out from your family tracker?')){await db.auth.signOut();state.events=[];state.mode=null;showAuth();}
    }else if(window.confirm('Exit demo mode? Your demo entries will stay saved in this browser.')){state.mode=null;state.events=[];showAuth();}
  });
  async function start(){
    state.selectedDate=today();render();
    if(!db){showAuth();return;}
    try {const {data,error}=await db.auth.getSession();if(error)throw error;
      if(data?.session)await connectSession(data.session);else showAuth();
    }catch(e){showAuth(e.message);}
  }
  start();
})();
