'use strict';
/* =====================================================================
   Olliver's Gym — app logic
   Data is stored on the phone: localStorage (workouts, food, body)
   and IndexedDB (progress photos).
   ===================================================================== */

// ---------- small helpers ----------
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => new Date(s + 'T00:00:00');
const todayStr = () => ymd(new Date());
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
const fmtDate = s => parseYmd(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const shortDate = s => parseYmd(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const num = n => Math.round(n * 10) / 10;
const kfmt = v => Math.abs(v) >= 1000 ? num(v / 1000) + 'k' : String(num(v));
const cap = s => s[0].toUpperCase() + s.slice(1);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const e1rm = (w, r) => r <= 1 ? w : w * (1 + r / 30); // Epley formula
const fmtClock = sec => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`; };
function weekStart(s) { const d = parseYmd(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return ymd(d); } // Monday
function toast(msg, ms = 1800) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms); }
function download(blob, name) { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000); }

// ---------- storage ----------
const KEY = 'olliversgym.v1';
const OLD_KEY = 'gymtracker.v1'; // data from the first simple version of the app
const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

function blankDb() {
  return {
    sessions: [], routines: [], customEx: [], body: [],
    food: { targets: { kcal: 2400, p: 150, c: 270, f: 75, sugar: 50, fiber: 30, sodium: 2000 }, log: [], myFoods: [] },
    settings: { rest: 90, autoRest: true, sound: true, vibrate: true, wake: true, goalWeight: null },
    active: null
  };
}
function normalise(d) {
  const out = Object.assign(blankDb(), d);
  out.food = Object.assign(blankDb().food, d.food || {});
  out.food.targets = Object.assign(blankDb().food.targets, out.food.targets || {});
  out.settings = Object.assign(blankDb().settings, d.settings || {});
  ['sessions', 'routines', 'customEx', 'body'].forEach(k => { if (!Array.isArray(out[k])) out[k] = []; });
  ['log', 'myFoods'].forEach(k => { if (!Array.isArray(out.food[k])) out.food[k] = []; });
  return out;
}
function exIdForName(name, d) {
  const lower = name.toLowerCase();
  const found = EXERCISES.find(e => e.name.toLowerCase() === lower) || d.customEx.find(e => e.name.toLowerCase() === lower);
  if (found) return found.id;
  const ex = { id: 'c_' + uid(), name, m: [], s: [], eq: 'Other', cue: '' };
  d.customEx.push(ex);
  return ex.id;
}
// Convert data from the first version ({workouts, body}) into the new format
function migrateOld(d, old) {
  if (!old) return;
  const byDate = {};
  (old.workouts || []).forEach(w => (byDate[w.date] = byDate[w.date] || []).push(w));
  Object.keys(byDate).sort().forEach(date => d.sessions.push({
    id: uid(), name: 'Workout', date, start: null, end: null, prs: [],
    exercises: byDate[date].map(w => ({ exId: exIdForName(w.exercise, d), name: w.exercise, sets: (w.sets || []).map(s => ({ w: +s.w || 0, r: +s.r || 0, rpe: '' })) }))
  }));
  (old.body || []).forEach(b => d.body.push({ date: b.date, weight: b.kg }));
}
function load() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { }
  if (!d || typeof d !== 'object') {
    d = blankDb();
    try { migrateOld(d, JSON.parse(localStorage.getItem(OLD_KEY))); } catch (e) { }
  }
  return normalise(d);
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { alert('Could not save data: ' + e.message); }
}
let db = load();
save();

// ---------- photo storage (IndexedDB) ----------
const idb = {
  _db: null,
  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('olliversgym-photos', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id' });
      r.onsuccess = () => { this._db = r.result; res(r.result); };
      r.onerror = () => rej(r.error);
    });
  },
  async run(mode, fn) {
    const d = await this.open();
    return new Promise((res, rej) => {
      const t = d.transaction('photos', mode);
      const req = fn(t.objectStore('photos'));
      t.oncomplete = () => res(req ? req.result : undefined);
      t.onerror = () => rej(t.error);
    });
  },
  all() { return this.run('readonly', s => s.getAll()); },
  put(p) { return this.run('readwrite', s => s.put(p)); },
  del(id) { return this.run('readwrite', s => s.delete(id)); },
  clear() { return this.run('readwrite', s => s.clear()); }
};

// ---------- exercise helpers ----------
const allEx = () => EXERCISES.concat(db.customEx);
const exById = id => allEx().find(e => e.id === id);
const exName = id => (exById(id) || {}).name || 'Unknown exercise';
const muscleChips = ex => ex ? ex.m.map(m => `<span class="chip on">${m}</span>`).join('') + ex.s.map(m => `<span class="chip">${m}</span>`).join('') : '';
const sessionsSorted = () => [...db.sessions].sort((a, b) => b.date.localeCompare(a.date) || (b.start || 0) - (a.start || 0));
const sessionVolume = s => s.exercises.reduce((a, e) => a + e.sets.reduce((b, x) => b + x.w * x.r, 0), 0);
const sessionSets = s => s.exercises.reduce((a, e) => a + e.sets.length, 0);
const allSetsFor = exId => db.sessions.flatMap(s => s.exercises.filter(e => e.exId === exId).flatMap(e => e.sets));
function lastSetsFor(exId) {
  for (const s of sessionsSorted()) { const e = s.exercises.find(x => x.exId === exId); if (e && e.sets.length) return e.sets; }
  return null;
}

// ---------- pop-up sheets ----------
function openSheet(title, html, mount) {
  const el = document.createElement('div');
  el.className = 'sheet open';
  el.innerHTML = `<div class="panel"><div class="phead"><h3>${esc(title)}</h3><button class="iconbtn" data-close aria-label="Close">✕</button></div><div class="pbody">${html}</div></div>`;
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-close]')) closeSheet(el); });
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
  if (mount) mount(el.querySelector('.pbody'), el);
  return el;
}
function closeSheet(el) {
  if (!el || !el.isConnected) return;
  if (el._onclose) el._onclose();
  el.remove();
  if (!document.querySelector('.sheet')) document.body.style.overflow = '';
}
const closeAllSheets = () => document.querySelectorAll('.sheet').forEach(closeSheet);
window.addEventListener('keydown', e => { if (e.key === 'Escape') { const s = [...document.querySelectorAll('.sheet')].pop(); closeSheet(s); } });

// ---------- tabs ----------
let currentTab = 'train';
document.querySelectorAll('nav button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
function showTab(t) {
  currentTab = t;
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x.dataset.tab === t));
  document.querySelectorAll('section.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + t));
  window.scrollTo(0, 0);
  renderTab();
}
function renderTab() {
  ({ train: renderTrain, library: renderLibrary, stats: renderStats, body: renderBody, food: renderFood })[currentTab]();
}

/* =====================================================================
   1. TRAIN — start workouts, routines, active workout logger
   ===================================================================== */
function renderTrain() { db.active ? renderActive() : renderTrainHome(); }

const templateToRoutine = t => ({ id: null, name: t.name, exercises: t.ex.map(([exId, sets, reps]) => ({ exId, sets, reps })) });
function routineCard(r, isTpl, i) {
  const list = r.exercises.map(e => `${esc(exName(e.exId))} <span style="color:#b5b5b5">${e.sets}×${e.reps}</span>`).join('<br>');
  const attr = isTpl ? `data-tpl="${i}"` : `data-rid="${r.id}"`;
  return `<div class="routine"><div class="top"><h3>${esc(r.name)}</h3><button class="btn sm primary" data-act="startRoutine" ${attr}>Start</button></div>
    <small class="muted" style="display:block;margin-top:8px;line-height:1.7">${list || 'No exercises'}</small>
    <button class="btn sm ghost" style="margin-top:10px" data-act="${isTpl ? 'copyTpl' : 'editRoutine'}" ${attr}>${isTpl ? 'Copy to my routines' : 'Edit routine'}</button></div>`;
}
let anatRange = 'today';
function muscleCounts(sessions) {
  const c = {}; MUSCLES.forEach(m => c[m] = 0);
  sessions.forEach(s => s.exercises.forEach(e => {
    const ex = exById(e.exId); if (!ex) return;
    const n = e.sets.length;
    ex.m.forEach(m => c[m] += n);
    ex.s.forEach(m => c[m] += n / 2);
  }));
  return c;
}
function anatomyHtml(counts, emptyMsg) {
  const any = Object.values(counts).some(v => v > 0);
  return `<div class="anat"><div>${bodySvg('front', m => heatColor(counts, m))}<small>Front</small></div><div>${bodySvg('back', m => heatColor(counts, m))}<small>Back</small></div></div>` +
    (any ? `<div class="heatkey"><span><i style="background:${HEAT[0]}"></i>Light</span><span><i style="background:${HEAT[1]}"></i>Medium</span><span><i style="background:${HEAT[2]}"></i>Most worked</span></div>
      <div style="margin-top:10px;text-align:center">${MUSCLES.filter(m => counts[m] > 0).sort((a, b) => counts[b] - counts[a]).map(m => `<span class="chip">${m} · ${num(counts[m])} sets</span>`).join('')}</div>`
      : `<p class="muted" style="text-align:center;font-size:13px;margin-top:8px">${emptyMsg}</p>`);
}
function renderTrainHome() {
  const today = todayStr(), wk = weekStart(today), td = trainedDates(), last = sessionsSorted()[0];
  const week = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((d, i) => {
    const day = addDays(wk, i);
    return `<div><small>${d}</small><div class="dot ${td.has(day) ? 'on' : ''} ${day === today ? 'today' : ''}">${td.has(day) ? '✓' : ''}</div></div>`;
  }).join('');
  const sess = anatRange === 'today' ? db.sessions.filter(x => x.date === today) : db.sessions.filter(x => x.date >= wk && x.date <= addDays(wk, 6));
  $('tab-train').innerHTML = `
    <div class="ttl"><span>Today's</span><b>Workout</b></div>
    <div class="week">${week}</div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px">
        <h3 style="margin:0">Muscles trained</h3>
        <div class="seg"><button data-act="anat" data-r="today" class="${anatRange === 'today' ? 'on' : ''}">Today</button><button data-act="anat" data-r="week" class="${anatRange === 'week' ? 'on' : ''}">This week</button></div>
      </div>
      ${anatomyHtml(muscleCounts(sess), anatRange === 'today' ? 'No workout logged today yet. Let\'s go! 💪' : 'No workouts this week yet.')}
      ${sess.length && anatRange === 'week' ? `<button class="btn ghost" data-act="shareWeek">Share my week</button>` : ''}
    </div>
    <button class="btn primary" data-act="startEmpty">Start empty workout</button>
    <p class="muted" style="font-size:12px;text-align:center;margin-top:8px">${last ? `Last workout: ${esc(last.name)} · ${fmtDate(last.date)}` : 'Log your first workout today.'}</p>
    <div class="ttl" style="margin-top:26px"><span>Choose a</span><b>Workout</b></div>
    <h2 style="margin-top:0">Area <a data-act="lib">See all exercises</a></h2>
    <div class="tiles">${AREAS.map((a, i) => `<div class="tile" data-act="area" data-i="${i}">${areaIcon(a)}<span>${a.name}</span></div>`).join('')}</div>
    <h2>My routines <a data-act="newRoutine">+ NEW</a></h2>
    ${db.routines.length ? db.routines.map(r => routineCard(r, false)).join('') : '<div class="card empty">No routines yet. Create one, or copy a template below.</div>'}
    <h2>Templates</h2>
    ${TEMPLATES.map((t, i) => routineCard(templateToRoutine(t), true, i)).join('')}`;
}
function newWorkoutEx(exId, sets, reps) {
  const prev = lastSetsFor(exId);
  const n = sets || (prev ? prev.length : 3);
  return { exId, name: exName(exId), sets: Array.from({ length: n }, () => ({ w: '', r: '', rpe: '', done: false, tr: reps || '' })) };
}
function startWorkout(r) {
  db.active = {
    id: uid(), name: r ? r.name : 'Workout', date: todayStr(), start: Date.now(),
    exercises: r ? r.exercises.map(e => newWorkoutEx(e.exId, e.sets, e.reps)) : []
  };
  save(); renderTrain(); window.scrollTo(0, 0); keepAwake(true);
}

const RPE = ['', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10'];
const rpeOptions = v => RPE.map(x => `<option value="${x}" ${String(v) === x ? 'selected' : ''}>${x || '–'}</option>`).join('');

function renderActive() {
  const a = db.active;
  let h = `<div class="wk-head"><input id="wkName" value="${esc(a.name)}" aria-label="Workout name"><span class="elapsed" id="elapsed">⏱ ${fmtClock((Date.now() - a.start) / 1000)}</span></div>
    <div style="margin-bottom:12px"><label>Workout date</label><input type="date" id="wkDate" value="${a.date}"></div>`;
  a.exercises.forEach((e, i) => {
    const ex = exById(e.exId), prev = lastSetsFor(e.exId) || [];
    h += `<div class="card ex-card">
      <div class="ex-title"><div><b data-act="exInfo" data-id="${e.exId}">${esc(ex ? ex.name : e.name)} ⓘ</b><div style="margin-top:4px">${muscleChips(ex)}</div></div>
      <button class="del" data-act="rmEx" data-ex="${i}">Remove</button></div>
      <div class="setgrid head"><span>Set</span><span>Previous</span><span>kg</span><span>Reps</span><span>RPE</span><span>✓</span></div>
      <div class="setgrid">`;
    e.sets.forEach((s, j) => {
      const p = prev[j];
      h += `<div class="setrow ${s.done ? 'done' : ''}" data-row="${i}-${j}">
        <span class="n" data-act="delSet" data-ex="${i}" data-set="${j}">${j + 1}</span>
        <span class="prev">${p ? `${num(p.w)}×${p.r}${p.rpe ? `<br>@${p.rpe}` : ''}` : '–'}</span>
        <input type="number" inputmode="decimal" step="0.5" min="0" data-f="w" data-ex="${i}" data-set="${j}" value="${esc(s.w)}" placeholder="${p ? num(p.w) : ''}">
        <input type="number" inputmode="numeric" min="0" data-f="r" data-ex="${i}" data-set="${j}" value="${esc(s.r)}" placeholder="${s.tr || (p ? p.r : '')}">
        <select data-f="rpe" data-ex="${i}" data-set="${j}">${rpeOptions(s.rpe)}</select>
        <button class="chk" data-act="chk" data-ex="${i}" data-set="${j}" aria-label="Set done">✓</button>
      </div>`;
    });
    h += `</div><button class="btn ghost" data-act="addSet" data-ex="${i}" style="padding:9px">+ Add set</button></div>`;
  });
  if (!a.exercises.length) h += `<div class="card empty">No exercises yet. Add your first one 👇</div>`;
  h += `<button class="btn blue" data-act="addEx">+ Add exercise</button>
    <div class="btnrow" style="margin-top:4px"><button class="btn primary" data-act="finish">Finish workout</button><button class="btn danger" data-act="discard">Discard</button></div>
    <p class="muted" style="font-size:12px;margin-top:12px;text-align:center;line-height:1.5">Tap ✓ after each set — the rest timer starts automatically.<br>Grey numbers = what you did last time. Tap a set number to delete it.<br>RPE: 10 = max effort, 8 = 2 reps left in the tank.</p>`;
  $('tab-train').innerHTML = h;
}

function toggleSet(i, j) {
  const s = db.active.exercises[i].sets[j];
  const row = document.querySelector(`[data-row="${i}-${j}"]`);
  if (!s.done) {
    const wIn = row.querySelector('[data-f=w]'), rIn = row.querySelector('[data-f=r]');
    // empty box + grey hint → use the hint value
    if (s.w === '' && wIn.placeholder !== '') { s.w = wIn.placeholder; wIn.value = s.w; }
    if (s.r === '' && rIn.placeholder !== '') { s.r = rIn.placeholder; rIn.value = s.r; }
    if (!(+s.r > 0)) { toast('Enter your reps first'); rIn.focus(); return; }
    s.done = true;
    if (db.settings.autoRest) startRest();
  } else s.done = false;
  row.classList.toggle('done', s.done);
  save();
}

$('tab-train').addEventListener('input', e => {
  const t = e.target;
  if (!db.active) return;
  if (t.id === 'wkName') { db.active.name = t.value; save(); return; }
  if (t.id === 'wkDate') { if (t.value) { db.active.date = t.value; save(); } return; }
  if (t.dataset.f) { db.active.exercises[+t.dataset.ex].sets[+t.dataset.set][t.dataset.f] = t.value; save(); }
});

$('tab-train').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const getR = () => b.dataset.tpl !== undefined ? templateToRoutine(TEMPLATES[+b.dataset.tpl]) : db.routines.find(r => r.id === b.dataset.rid);
  const i = +b.dataset.ex, j = +b.dataset.set;
  switch (b.dataset.act) {
    case 'startEmpty': startWorkout(null); break;
    case 'anat': anatRange = b.dataset.r; renderTrainHome(); break;
    case 'area': libMus = AREAS[+b.dataset.i].name; libQ = ''; $('libSearch').value = ''; showTab('library'); break;
    case 'lib': libMus = 'All'; showTab('library'); break;
    case 'shareWeek': { const wk = weekStart(todayStr()); openShare(weekSummary(wk)); break; }
    case 'startRoutine': startWorkout(getR()); break;
    case 'copyTpl': { const r = getR(); r.id = uid(); db.routines.push(r); save(); toast('Added to My routines — tap Edit to change it'); renderTrain(); break; }
    case 'newRoutine': openRoutineEditor(null); break;
    case 'editRoutine': openRoutineEditor(getR()); break;
    case 'chk': toggleSet(i, j); break;
    case 'addSet': {
      const sets = db.active.exercises[i].sets, last = sets[sets.length - 1];
      sets.push({ w: last ? last.w : '', r: last ? last.r : '', rpe: '', done: false, tr: last ? last.tr : '' });
      save(); renderActive(); break;
    }
    case 'delSet':
      if (confirm(`Delete set ${j + 1}?`)) { db.active.exercises[i].sets.splice(j, 1); save(); renderActive(); }
      break;
    case 'rmEx':
      if (confirm(`Remove ${db.active.exercises[i].name} from this workout?`)) { db.active.exercises.splice(i, 1); save(); renderActive(); }
      break;
    case 'exInfo': openExInfo(b.dataset.id); break;
    case 'addEx': openExPicker(id => { db.active.exercises.push(newWorkoutEx(id)); save(); renderActive(); window.scrollTo(0, document.body.scrollHeight); }); break;
    case 'finish': finishWorkout(); break;
    case 'discard': if (confirm('Discard this workout? Nothing will be saved.')) endActive(); break;
  }
});

function endActive() { db.active = null; stopRest(); keepAwake(false); save(); renderTrain(); }

function finishWorkout() {
  const a = db.active;
  const notTicked = a.exercises.reduce((n, e) => n + e.sets.filter(s => !s.done && +s.r > 0).length, 0);
  if (notTicked && !confirm(`${notTicked} set(s) have reps but are not ticked ✓.\nOnly ticked sets are saved. Finish anyway?`)) return;
  const exercises = a.exercises.map(e => ({
    exId: e.exId, name: exName(e.exId),
    sets: e.sets.filter(s => s.done && +s.r > 0).map(s => ({ w: +s.w || 0, r: +s.r, rpe: s.rpe }))
  })).filter(e => e.sets.length);
  if (!exercises.length) { if (confirm('No completed sets. Discard this workout?')) endActive(); return; }

  // personal record check (compared with all earlier workouts)
  const prs = [];
  exercises.forEach(e => {
    const hist = allSetsFor(e.exId);
    if (!hist.length) return;
    const pw = Math.max(...hist.map(x => x.w)), pe = Math.max(...hist.map(x => e1rm(x.w, x.r)));
    const nw = Math.max(...e.sets.map(x => x.w)), ne = Math.max(...e.sets.map(x => e1rm(x.w, x.r)));
    if (nw > pw) prs.push(`${e.name}: heaviest weight ${num(nw)} kg`);
    else if (ne > pe + 0.05) prs.push(`${e.name}: est. 1RM ${num(ne)} kg`);
    else if (pw === 0 && nw === 0) {
      const pr = Math.max(...hist.map(x => x.r)), nr = Math.max(...e.sets.map(x => x.r));
      if (nr > pr) prs.push(`${e.name}: ${nr} reps`);
    }
  });
  const s = { id: a.id, name: a.name.trim() || 'Workout', date: a.date, start: a.start, end: Date.now(), exercises, prs };
  db.sessions.push(s);
  endActive();
  openSessionSheet(s, true);
}

function openSessionSheet(s, justFinished) {
  if (!s) return;
  const dur = s.start && s.end ? fmtClock((s.end - s.start) / 1000) : '–';
  let h = justFinished ? `<div style="text-align:center;font-size:44px">🎉</div><p style="text-align:center;margin-bottom:14px">Great work! Workout saved.</p>` : '';
  h += `<div class="grid3" style="margin-bottom:12px"><div class="stat"><b>${dur}</b><small>Duration</small></div><div class="stat"><b>${sessionSets(s)}</b><small>Sets</small></div><div class="stat"><b>${kfmt(sessionVolume(s))}</b><small>kg lifted</small></div></div>`;
  if (s.prs && s.prs.length) h += `<div class="card"><b class="pr" style="font-size:15px">🏆 New personal records!</b><br><small>${s.prs.map(esc).join('<br>')}</small></div>`;
  if (!s.week) h += `<div class="card"><h3>Muscles worked</h3>${anatomyHtml(muscleCounts([s]), '')}</div>
    <button class="btn primary" data-a="share" style="margin-bottom:14px">📤 Share workout</button>`;
  h += `<div class="card">${s.exercises.map(e => `<div class="list-item" style="cursor:default"><div><b>${esc(exById(e.exId) ? exName(e.exId) : e.name)}</b><small class="muted">${e.sets.map((x, k) => `${k + 1}. ${num(x.w)} kg × ${x.r}${x.rpe ? ` @ RPE ${x.rpe}` : ''}`).join('<br>')}</small></div></div>`).join('')}</div>
    <button class="btn ghost" data-a="asRoutine">Save as routine</button>
    ${justFinished ? '<button class="btn primary" data-close>Done</button>' : '<button class="btn danger" data-a="del">Delete workout</button>'}`;
  const el = openSheet(`${s.name} · ${shortDate(s.date)}`, h, body => body.addEventListener('click', ev => {
    const a = ev.target.dataset.a;
    if (a === 'share') openShare(s);
    if (a === 'asRoutine') {
      const name = prompt('Routine name:', s.name); if (!name) return;
      db.routines.push({ id: uid(), name: name.trim(), exercises: s.exercises.map(e => ({ exId: e.exId, sets: e.sets.length, reps: e.sets[0].r })) });
      save(); toast('Routine saved'); if (currentTab === 'train') renderTrain();
    }
    if (a === 'del' && confirm('Delete this workout from your history?')) {
      db.sessions = db.sessions.filter(x => x.id !== s.id); save(); closeSheet(el); renderTab();
    }
  }));
}

// ----- routine builder -----
function openRoutineEditor(r) {
  const isNew = !r;
  const draft = r ? JSON.parse(JSON.stringify(r)) : { id: uid(), name: '', exercises: [] };
  const el = openSheet(isNew ? 'New routine' : 'Edit routine', '<div id="reBody"></div>', body => {
    const draw = () => {
      body.querySelector('#reBody').innerHTML = `
        <label>Routine name</label><input id="reName" value="${esc(draft.name)}" placeholder="e.g. Push Day, Leg Day">
        <h2>Exercises</h2>
        <div class="card">${draft.exercises.length ? draft.exercises.map((e, i) => `
          <div class="list-item" style="cursor:default;align-items:flex-start"><div style="flex:1"><b>${i + 1}. ${esc(exName(e.exId))}</b>
            <div class="grid2" style="margin-top:6px"><div><label>Sets</label><input type="number" inputmode="numeric" data-i="${i}" data-k="sets" value="${e.sets}"></div>
            <div><label>Target reps</label><input type="number" inputmode="numeric" data-i="${i}" data-k="reps" value="${e.reps}"></div></div></div>
            <div style="display:flex;flex-direction:column"><button class="del" data-up="${i}" style="color:var(--muted)" aria-label="Move up">▲</button><button class="del" data-rm="${i}" aria-label="Remove">✕</button></div>
          </div>`).join('') : '<div class="empty">No exercises yet</div>'}</div>
        <button class="btn blue" id="reAdd">+ Add exercise</button>
        <button class="btn primary" id="reSave">Save routine</button>
        ${isNew ? '' : '<button class="btn danger" id="reDel">Delete routine</button>'}`;
    };
    draw();
    body.addEventListener('input', ev => {
      const t = ev.target;
      if (t.id === 'reName') draft.name = t.value;
      if (t.dataset.k) draft.exercises[+t.dataset.i][t.dataset.k] = Math.max(1, parseInt(t.value, 10) || 1);
    });
    body.addEventListener('click', ev => {
      const t = ev.target;
      if (t.id === 'reAdd') openExPicker(id => { draft.exercises.push({ exId: id, sets: 3, reps: 10 }); draw(); });
      else if (t.dataset.rm !== undefined) { draft.exercises.splice(+t.dataset.rm, 1); draw(); }
      else if (t.dataset.up !== undefined) {
        const i = +t.dataset.up;
        if (i > 0) { [draft.exercises[i - 1], draft.exercises[i]] = [draft.exercises[i], draft.exercises[i - 1]]; draw(); }
      }
      else if (t.id === 'reSave') {
        if (!draft.name.trim()) return toast('Give your routine a name');
        if (!draft.exercises.length) return toast('Add at least one exercise');
        draft.name = draft.name.trim();
        const k = db.routines.findIndex(x => x.id === draft.id);
        if (k >= 0) db.routines[k] = draft; else db.routines.push(draft);
        save(); closeSheet(el); renderTrain(); toast('Routine saved ✓');
      }
      else if (t.id === 'reDel' && confirm('Delete this routine?')) {
        db.routines = db.routines.filter(x => x.id !== draft.id); save(); closeSheet(el); renderTrain();
      }
    });
  });
}

// ----- exercise picker / library -----
const FILTERS = ['All', 'Chest', 'Back', 'Shoulders', 'Arms', 'Biceps', 'Triceps', 'Forearms', 'Abs', 'Legs', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Custom'];
const chipsHtml = sel => FILTERS.map(m => `<span class="chip ${m === sel ? 'on' : ''}" data-mus="${m}">${m}</span>`).join('');
function filterEx(q, mus) {
  q = q.trim().toLowerCase();
  return allEx().filter(e =>
    (mus === 'All' || (mus === 'Custom' ? e.id.startsWith('c_') : MUSCLES.includes(mus) ? e.m.includes(mus) : (AREAS.find(a => a.name === mus) || { muscles: [] }).muscles.some(m => e.m.includes(m)))) &&
    (!q || e.name.toLowerCase().includes(q) || e.eq.toLowerCase().includes(q) || e.m.some(m => m.toLowerCase().includes(q)))
  ).sort((a, b) => a.name.localeCompare(b.name));
}
function exListHtml(q, mus, mode) {
  const list = filterEx(q, mus);
  if (!list.length) return '<div class="empty">No exercises found</div>';
  return list.map(e => `<div class="lib-item" data-${mode}="${e.id}"><b>${esc(e.name)}</b>${e.m.map(m => `<span class="chip on">${m}</span>`).join('')}<span class="chip">${esc(e.eq)}</span></div>`).join('');
}
function openExPicker(onPick) {
  let q = '', mus = 'All';
  const el = openSheet('Add exercise', `<input id="pkQ" placeholder="🔍 Search exercises" autocomplete="off"><div class="chips" id="pkChips" style="margin-top:8px"></div><div class="card" id="pkList"></div><button class="btn ghost" id="pkCustom">+ Create custom exercise</button>`, body => {
    const draw = () => { body.querySelector('#pkChips').innerHTML = chipsHtml(mus); body.querySelector('#pkList').innerHTML = exListHtml(q, mus, 'pick'); };
    draw();
    body.querySelector('#pkQ').oninput = e => { q = e.target.value; draw(); };
    body.addEventListener('click', e => {
      const c = e.target.closest('[data-mus]'); if (c) { mus = c.dataset.mus; draw(); return; }
      const it = e.target.closest('[data-pick]'); if (it) { closeSheet(el); onPick(it.dataset.pick); return; }
      if (e.target.id === 'pkCustom') openCustomEx(id => { closeSheet(el); onPick(id); });
    });
  });
}
function openCustomEx(onDone) {
  const sel = new Set();
  const el = openSheet('Custom exercise', `
    <label>Name</label><input id="cxName" placeholder="e.g. Smith Machine Squat">
    <div style="height:10px"></div><label>Equipment</label>
    <select id="cxEq">${['Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight', 'Kettlebell', 'Other'].map(x => `<option>${x}</option>`).join('')}</select>
    <div style="height:10px"></div><label>Main muscles worked (tap to select)</label><div id="cxMus" style="margin-bottom:10px"></div>
    <label>Form notes (optional)</label><textarea id="cxCue" rows="3"></textarea>
    <button class="btn primary" id="cxSave">Save exercise</button>`, body => {
    const draw = () => body.querySelector('#cxMus').innerHTML = MUSCLES.map(m => `<span class="chip ${sel.has(m) ? 'on' : ''}" data-m="${m}" style="font-size:13px;padding:6px 10px;cursor:pointer">${m}</span>`).join('');
    draw();
    body.addEventListener('click', e => {
      if (e.target.dataset.m) { const m = e.target.dataset.m; sel.has(m) ? sel.delete(m) : sel.add(m); draw(); }
      if (e.target.id === 'cxSave') {
        const name = body.querySelector('#cxName').value.trim();
        if (!name) return toast('Enter a name');
        if (allEx().some(x => x.name.toLowerCase() === name.toLowerCase())) return toast('That exercise already exists');
        const ex = { id: 'c_' + uid(), name, m: [...sel], s: [], eq: body.querySelector('#cxEq').value, cue: body.querySelector('#cxCue').value.trim() };
        db.customEx.push(ex); save(); closeSheet(el); toast('Exercise created ✓');
        if (onDone) onDone(ex.id); else renderLibrary();
      }
    });
  });
}
function openExInfo(id) {
  const ex = exById(id); if (!ex) return;
  const hist = sessionsSorted().filter(s => s.exercises.some(e => e.exId === id));
  const sets = allSetsFor(id);
  const best = sets.length ? Math.max(...sets.map(x => x.w)) : 0, best1 = sets.length ? Math.max(...sets.map(x => e1rm(x.w, x.r))) : 0;
  const yt = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(ex.name + ' exercise proper form');
  let h = `<div style="margin-bottom:10px">${muscleChips(ex)}<span class="chip">${esc(ex.eq)}</span></div>
    <div class="card"><b>How to do it</b><p class="muted" style="margin-top:6px;line-height:1.55">${esc(ex.cue || 'No notes added.')}</p>
    <a class="btn blue" href="${yt}" target="_blank" rel="noopener" style="text-align:center;text-decoration:none">▶ Watch form videos</a></div>
    <div class="grid3" style="margin-bottom:12px"><div class="stat"><b>${sets.length ? num(best) : '–'}</b><small>Heaviest kg</small></div><div class="stat"><b>${sets.length ? num(best1) : '–'}</b><small>Best est. 1RM</small></div><div class="stat"><b>${hist.length}</b><small>Sessions</small></div></div>`;
  if (hist.length) h += `<div class="card"><b>Recent history</b>${hist.slice(0, 6).map(s => { const e = s.exercises.find(x => x.exId === id); return `<div class="list-item" style="cursor:default"><div><small class="muted">${fmtDate(s.date)}</small><br><small>${e.sets.map(x => `${num(x.w)}×${x.r}`).join(', ')}</small></div></div>`; }).join('')}</div>`;
  if (id.startsWith('c_')) h += `<button class="btn danger" data-a="delEx">Delete custom exercise</button>`;
  const el = openSheet(ex.name, h, body => body.addEventListener('click', e => {
    if (e.target.dataset.a !== 'delEx') return;
    const used = hist.length || db.routines.some(r => r.exercises.some(x => x.exId === id)) || (db.active && db.active.exercises.some(x => x.exId === id));
    if (used) return alert("This exercise is used in your history, routines or current workout, so it can't be deleted.");
    if (confirm('Delete this exercise?')) { db.customEx = db.customEx.filter(x => x.id !== id); save(); closeSheet(el); renderTab(); }
  }));
}

let libQ = '', libMus = 'All';
function renderLibrary() {
  $('libChips').innerHTML = chipsHtml(libMus);
  $('libList').innerHTML = exListHtml(libQ, libMus, 'info');
}
$('libSearch').oninput = e => { libQ = e.target.value; renderLibrary(); };
$('libChips').onclick = e => { const c = e.target.closest('[data-mus]'); if (c) { libMus = c.dataset.mus; renderLibrary(); } };
$('libList').onclick = e => { const it = e.target.closest('[data-info]'); if (it) openExInfo(it.dataset.info); };
$('addCustomEx').onclick = () => openCustomEx(null);

// ----- rest timer -----
const rest = { end: 0, total: 0, iv: null, alerted: false };
let audioCtx = null;
function unlockAudio() { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) { } }
function beep() {
  if (!db.settings.sound || !audioCtx) return;
  try {
    const t0 = audioCtx.currentTime;
    [0, 0.28, 0.56].forEach(d => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.5, t0 + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.2);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0 + d); o.stop(t0 + d + 0.22);
    });
  } catch (e) { }
}
function startRest(sec) {
  sec = sec || db.settings.rest;
  unlockAudio();
  rest.total = sec; rest.end = Date.now() + sec * 1000; rest.alerted = false;
  persistRest(); runRest();
}
function runRest() {
  document.body.classList.add('timer-on');
  clearInterval(rest.iv); rest.iv = setInterval(tickRest, 250); tickRest();
}
function tickRest() {
  if (!rest.end) return;
  const left = (rest.end - Date.now()) / 1000, bar = $('restBar');
  if (left > 0) {
    $('restTime').textContent = fmtClock(Math.ceil(left));
    bar.classList.remove('over');
    $('restFill').style.width = (100 * (1 - left / rest.total)) + '%';
  } else {
    $('restTime').textContent = '+' + fmtClock(-left);
    bar.classList.add('over');
    $('restFill').style.width = '100%';
    if (!rest.alerted) {
      rest.alerted = true; beep();
      if (db.settings.vibrate && navigator.vibrate) navigator.vibrate([300, 150, 300]);
      toast('Rest over — next set! 💪');
    }
    if (left < -60) stopRest();
  }
}
function stopRest() { clearInterval(rest.iv); rest.iv = null; rest.end = 0; document.body.classList.remove('timer-on'); persistRest(); }
function persistRest() { if (db.active) { db.active.restEnd = rest.end; db.active.restTotal = rest.total; save(); } }
$('restPlus').onclick = () => { rest.end += 15000; rest.total += 15; rest.alerted = false; persistRest(); tickRest(); };
$('restMinus').onclick = () => { rest.end -= 15000; rest.total = Math.max(15, rest.total - 15); persistRest(); tickRest(); };
$('restSkip').onclick = stopRest;

// keep the workout clock ticking
setInterval(() => { const el = $('elapsed'); if (el && db.active) el.textContent = '⏱ ' + fmtClock((Date.now() - db.active.start) / 1000); }, 1000);

// keep the screen on during a workout
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && db.settings.wake && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { if (db.active) keepAwake(true); if (rest.end) tickRest(); }
});

/* =====================================================================
   2. STATS — calendar, streaks, strength, volume, muscle balance
   ===================================================================== */
let calMonth = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();
let histShow = 15;
function renderStats() { renderCalendar(); renderStreaks(); renderProgress(); renderVolume(); renderBalance(); renderHistory(); }
const trainedDates = () => new Set(db.sessions.map(s => s.date));

function renderCalendar() {
  const td = trainedDates(), today = todayStr();
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  $('calTitle').textContent = calMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
  let h = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < first; i++) h += '<div class="d blank"></div>';
  for (let d = 1; d <= days; d++) {
    const s = ymd(new Date(y, m, d)), t = td.has(s);
    h += `<div class="d ${t ? 'trained' : ''} ${s === today ? 'today' : ''} ${s > today ? 'future' : ''}" ${t ? `data-day="${s}"` : ''}>${d}</div>`;
  }
  $('calGrid').innerHTML = h;
}
$('calPrev').onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderCalendar(); };
$('calNext').onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderCalendar(); };
$('calGrid').onclick = e => {
  const d = e.target.dataset.day; if (!d) return;
  const ss = db.sessions.filter(s => s.date === d);
  if (ss.length === 1) return openSessionSheet(ss[0]);
  const el = openSheet(fmtDate(d), `<div class="card">${ss.map(s => `<div class="list-item" data-sid="${s.id}"><div><b>${esc(s.name)}</b><small class="muted">${sessionSets(s)} sets · ${kfmt(sessionVolume(s))} kg</small></div><span class="muted">›</span></div>`).join('')}</div>`,
    body => body.addEventListener('click', ev => { const it = ev.target.closest('[data-sid]'); if (it) { closeSheet(el); openSessionSheet(db.sessions.find(s => s.id === it.dataset.sid)); } }));
};

function renderStreaks() {
  const td = trainedDates(), today = todayStr(), wk = weekStart(today);
  const thisWeek = db.sessions.filter(s => s.date >= wk && s.date <= addDays(wk, 6)).length;
  const weeks = new Set([...td].map(weekStart));
  let streak = 0, w = weeks.has(wk) ? wk : addDays(wk, -7);
  while (weeks.has(w)) { streak++; w = addDays(w, -7); }
  const monthDays = [...td].filter(d => d.startsWith(today.slice(0, 7)) && d <= today).length;
  $('streakStats').innerHTML = `
    <div class="stat"><b>${thisWeek}</b><small>Workouts this week</small></div>
    <div class="stat"><b>${streak} 🔥</b><small>Week streak</small></div>
    <div class="stat"><b>${monthDays}/${+today.slice(8)}</b><small>Days trained this month</small></div>`;
}

function renderProgress() {
  const used = [...new Map(db.sessions.flatMap(s => s.exercises).map(e => [e.exId, exById(e.exId) ? exName(e.exId) : e.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const sel = $('progEx'), cur = sel.value;
  sel.innerHTML = used.length ? used.map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join('') : '<option value="">No workouts yet</option>';
  if (used.some(u => u[0] === cur)) sel.value = cur;
  const id = sel.value, metric = $('progMetric').value;
  const byDate = {};
  const sets = [];
  db.sessions.forEach(s => s.exercises.filter(e => e.exId === id).forEach(e => e.sets.forEach(x => {
    const d = byDate[s.date] = byDate[s.date] || { max: 0, e1rm: 0, vol: 0, reps: 0 };
    d.max = Math.max(d.max, x.w); d.e1rm = Math.max(d.e1rm, e1rm(x.w, x.r)); d.vol += x.w * x.r; d.reps = Math.max(d.reps, x.r);
    sets.push({ ...x, date: s.date });
  })));
  const dates = Object.keys(byDate).sort();
  drawLine($('progChart'), dates.map(d => ({ x: d, y: byDate[d][metric] })), 'Finish a workout to see your progress');
  if (!sets.length) { $('prList').innerHTML = '<div class="empty">Your personal records will show here.</div>'; return; }
  const top = f => sets.reduce((a, b) => f(b) > f(a) ? b : a);
  const hw = top(x => x.w), he = top(x => e1rm(x.w, x.r)), hr = top(x => x.r), hv = top(x => x.w * x.r);
  $('prList').innerHTML = '<b>🏆 Personal records</b>' + [
    ['Heaviest weight', `${num(hw.w)} kg × ${hw.r}`, hw.date],
    ['Best est. 1-rep max', `${num(e1rm(he.w, he.r))} kg (${num(he.w)}×${he.r})`, he.date],
    ['Most reps in a set', `${hr.r} reps @ ${num(hr.w)} kg`, hr.date],
    ['Best single set', `${kfmt(hv.w * hv.r)} kg (${num(hv.w)}×${hv.r})`, hv.date]
  ].map(([a, b, c]) => `<div class="list-item" style="cursor:default"><div><small class="muted">${a}</small><b>${b}</b></div><small class="muted">${shortDate(c)}</small></div>`).join('');
}
$('progEx').onchange = renderProgress;
$('progMetric').onchange = renderProgress;

function renderVolume() {
  const wk = weekStart(todayStr()), labels = [], vals = [];
  for (let i = 11; i >= 0; i--) {
    const w = addDays(wk, -7 * i);
    labels.push(w);
    vals.push(db.sessions.filter(s => weekStart(s.date) === w).reduce((a, s) => a + sessionVolume(s), 0));
  }
  drawBars($('volChart'), labels, vals, 'No workouts in the last 12 weeks');
}

function renderBalance() {
  const days = +$('balRange').value, from = addDays(todayStr(), -(days - 1));
  const c = {}; MUSCLES.forEach(m => c[m] = 0);
  db.sessions.filter(s => s.date >= from).forEach(s => s.exercises.forEach(e => {
    const ex = exById(e.exId); if (!ex) return;
    const n = e.sets.length;
    ex.m.forEach(m => c[m] += n);
    ex.s.forEach(m => c[m] += n / 2);
  }));
  const max = Math.max(...Object.values(c));
  if (!max) { $('balance').innerHTML = '<div class="empty">No sets in this period.</div>'; return; }
  $('balance').innerHTML = MUSCLES.map(m => `<div class="hbar"><span>${m}</span><div class="track"><i style="width:${100 * c[m] / max}%"></i></div><span>${num(c[m])}</span></div>`).join('') +
    `<p class="muted" style="font-size:12px;margin-top:10px;line-height:1.5">Sets per muscle group. Main muscle = 1 set, helper muscle = ½ set. Short bars = muscles you may be under-training.</p>`;
}
$('balRange').onchange = renderBalance;

function renderHistory() {
  const ss = sessionsSorted();
  if (!ss.length) { $('historyList').innerHTML = '<div class="empty">No workouts yet.</div>'; return; }
  $('historyList').innerHTML = ss.slice(0, histShow).map(s => `<div class="list-item" data-sid="${s.id}"><div><b>${esc(s.name)} ${s.prs && s.prs.length ? '<span class="pr">🏆 PR</span>' : ''}</b>
    <small class="muted">${fmtDate(s.date)} · ${sessionSets(s)} sets · ${kfmt(sessionVolume(s))} kg${s.start && s.end ? ' · ' + fmtClock((s.end - s.start) / 1000) : ''}</small></div><span class="muted">›</span></div>`).join('') +
    (ss.length > histShow ? '<button class="btn ghost" id="histMore">Show more</button>' : '');
}
$('historyList').onclick = e => {
  if (e.target.id === 'histMore') { histShow += 15; renderHistory(); return; }
  const it = e.target.closest('[data-sid]'); if (it) openSessionSheet(db.sessions.find(s => s.id === it.dataset.sid));
};

// ----- charts (drawn by hand, no internet library needed) -----
function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 300, H = canvas.clientHeight || 210;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
  c.font = '12px system-ui, sans-serif';
  return { c, W, H };
}
function emptyChart(c, W, H, msg) { c.fillStyle = '#9a9a9a'; c.textAlign = 'center'; c.fillText(msg, W / 2, H / 2); }
function yGrid(c, W, H, L, R, T, B, min, max) {
  const Y = v => T + (max - v) * (H - T - B) / (max - min);
  c.strokeStyle = '#eeeeee'; c.fillStyle = '#9a9a9a'; c.textAlign = 'right'; c.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = min + (max - min) * i / 4, y = Y(v);
    c.beginPath(); c.moveTo(L, y); c.lineTo(W - R, y); c.stroke();
    c.fillText(kfmt(v), L - 6, y + 4);
  }
  return Y;
}
function drawLine(canvas, pts, emptyMsg) {
  const { c, W, H } = setupCanvas(canvas);
  if (!pts.length) return emptyChart(c, W, H, emptyMsg);
  const L = 44, R = 12, T = 18, B = 26;
  let min = Math.min(...pts.map(p => p.y)), max = Math.max(...pts.map(p => p.y));
  if (min === max) { min -= 1; max += 1; }
  const padv = (max - min) * 0.12; min -= padv; max += padv;
  const X = i => pts.length === 1 ? L + (W - L - R) / 2 : L + i * (W - L - R) / (pts.length - 1);
  const Y = yGrid(c, W, H, L, R, T, B, min, max);
  c.fillStyle = '#9a9a9a';
  if (pts.length > 1) {
    c.textAlign = 'left'; c.fillText(shortDate(pts[0].x), L, H - 6);
    c.textAlign = 'right'; c.fillText(shortDate(pts[pts.length - 1].x), W - R, H - 6);
  } else { c.textAlign = 'center'; c.fillText(shortDate(pts[0].x), X(0), H - 6); }
  c.strokeStyle = '#141414'; c.lineWidth = 2.5; c.lineJoin = 'round'; c.beginPath();
  pts.forEach((p, i) => i ? c.lineTo(X(i), Y(p.y)) : c.moveTo(X(i), Y(p.y)));
  c.stroke();
  c.fillStyle = '#141414';
  pts.forEach((p, i) => { c.beginPath(); c.arc(X(i), Y(p.y), 3.5, 0, Math.PI * 2); c.fill(); });
  const lp = pts[pts.length - 1];
  c.fillStyle = '#141414'; c.textAlign = 'right'; c.font = 'bold 13px system-ui, sans-serif';
  c.fillText('Latest: ' + num(lp.y), W - R, 12);
}
function drawBars(canvas, labels, vals, emptyMsg) {
  const { c, W, H } = setupCanvas(canvas);
  if (!vals.some(v => v > 0)) return emptyChart(c, W, H, emptyMsg);
  const L = 44, R = 8, T = 12, B = 26;
  const Y = yGrid(c, W, H, L, R, T, B, 0, Math.max(...vals) * 1.1);
  const bw = (W - L - R) / vals.length;
  vals.forEach((v, i) => {
    c.fillStyle = i === vals.length - 1 ? '#141414' : '#cfcfcf';
    c.fillRect(L + i * bw + bw * 0.18, Y(v), bw * 0.64, Y(0) - Y(v));
  });
  c.fillStyle = '#9a9a9a'; c.textAlign = 'center';
  labels.forEach((l, i) => { if (i % 3 === 2 || i === labels.length - 1) c.fillText(i === labels.length - 1 ? 'This wk' : shortDate(l), L + i * bw + bw / 2, H - 6); });
}

// ----- share card (Strava-style image with muscle map) -----
function weekSummary(wk) {
  const ss = db.sessions.filter(x => x.date >= wk && x.date <= addDays(wk, 6));
  return { week: true, id: 'week', name: 'My training week', date: wk, sessions: ss, exercises: ss.flatMap(x => x.exercises), prs: ss.flatMap(x => x.prs || []), dur: ss.reduce((a, x) => a + (x.start && x.end ? (x.end - x.start) / 1000 : 0), 0) };
}
function fitFont(c, text, max, size, weight, F) {
  do { c.font = `${weight} ${size}px ${F}`; size -= 2; } while (c.measureText(text).width > max && size > 30);
  let t = text;
  while (c.measureText(t).width > max && t.length > 3) t = t.slice(0, -2);
  return t === text ? t : t + '…';
}
async function makeShareCard(s) {
  const W = 1080, H = 1350, F = "'Montserrat','Poppins',system-ui,-apple-system,sans-serif";
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const rr = (x, y, w, h, r, fill) => { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); c.fillStyle = fill; c.fill(); };
  c.fillStyle = '#f2f2f2'; c.fillRect(0, 0, W, H);
  rr(40, 40, W - 80, H - 80, 48, '#ffffff');
  // header
  c.fillStyle = '#141414'; c.beginPath(); c.arc(132, 140, 44, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#fff'; c.font = `800 32px ${F}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('OG', 132, 142);
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillStyle = '#141414'; c.font = `800 34px ${F}`; c.fillText("OLLIVER'S GYM", 198, 132);
  const when = s.week ? `Week of ${fmtDate(s.date)} · ${s.sessions.length} workout${s.sessions.length === 1 ? '' : 's'}`
    : fmtDate(s.date) + (s.start ? ' · ' + new Date(s.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '');
  c.fillStyle = '#8d8d8d'; c.font = `500 28px ${F}`; c.fillText(when, 198, 174);
  // title
  c.fillStyle = '#141414';
  const title = fitFont(c, s.name, W - 180, 66, 800, F); c.fillText(title, 90, 290);
  // stats
  const secs = s.week ? s.dur : (s.start && s.end ? (s.end - s.start) / 1000 : 0);
  const sets = s.exercises.reduce((a, e) => a + e.sets.length, 0);
  const vol = s.exercises.reduce((a, e) => a + e.sets.reduce((b, x) => b + x.w * x.r, 0), 0);
  [['Time', secs ? fmtClock(secs) : '–'], ['Sets', String(sets)], ['Total volume', Math.round(vol).toLocaleString() + ' kg']].forEach(([l, v], i) => {
    const x = 90 + i * 310;
    c.fillStyle = '#8d8d8d'; c.font = `600 26px ${F}`; c.fillText(l, x, 362);
    c.fillStyle = '#141414'; c.font = `800 50px ${F}`; c.fillText(v, x, 420);
  });
  c.fillStyle = '#ececec'; c.fillRect(90, 455, W - 180, 3);
  // muscle map
  const counts = muscleCounts(s.week ? s.sessions : [s]);
  const size = 'width="330" height="663"';
  const [fi, bi] = await Promise.all(['front', 'back'].map(v => svgToImage(bodySvg(v, m => heatColor(counts, m), { size }))));
  c.drawImage(fi, 160, 482, 330, 663); c.drawImage(bi, 590, 482, 330, 663);
  c.fillStyle = '#8d8d8d'; c.font = `700 24px ${F}`; c.textAlign = 'center';
  c.fillText('FRONT', 325, 1178); c.fillText('BACK', 755, 1178);
  // muscles + highlight line
  const top = MUSCLES.filter(m => counts[m] > 0).sort((a, b) => counts[b] - counts[a]).slice(0, 5);
  c.fillStyle = '#141414'; c.font = `700 30px ${F}`;
  c.fillText(fitFont(c, top.join(' · ') || 'Workout', W - 200, 30, 700, F), W / 2, 1228);
  let line;
  if (s.prs && s.prs.length) line = `🏆 ${s.prs.length} new personal record${s.prs.length > 1 ? 's' : ''}`;
  else {
    let best = null;
    s.exercises.forEach(e => e.sets.forEach(x => { if (!best || e1rm(x.w, x.r) > e1rm(best.w, best.r)) best = { ...x, n: exById(e.exId) ? exName(e.exId) : e.name }; }));
    line = best ? `Top set: ${best.n} ${num(best.w)} kg × ${best.r}` : '';
  }
  c.fillStyle = s.prs && s.prs.length ? '#ff6a1a' : '#8d8d8d';
  c.fillText(fitFont(c, line, W - 200, 28, 600, F), W / 2, 1272);
  return new Promise(res => cv.toBlob(res, 'image/png'));
}
async function openShare(s) {
  const el = openSheet(s.week ? 'Share my week' : 'Share workout', '<p class="muted" style="text-align:center;padding:40px 0">Creating your image…</p>');
  try {
    const blob = await makeShareCard(s);
    const url = URL.createObjectURL(blob), name = `olliversgym-${s.week ? 'week' : 'workout'}-${s.date}.png`;
    el._onclose = () => URL.revokeObjectURL(url);
    const body = el.querySelector('.pbody');
    body.innerHTML = `<img class="share-preview" src="${url}" alt="Workout share card">
      <div class="btnrow"><button class="btn primary" data-a="share">Share</button><button class="btn ghost" data-a="save">Save image</button></div>
      <p class="muted" style="font-size:12px;text-align:center;margin-top:10px">Post it to Instagram, WhatsApp status, Strava…</p>`;
    body.addEventListener('click', async e => {
      const a = e.target.dataset.a; if (!a) return;
      const file = new File([blob], name, { type: 'image/png' });
      if (a === 'share') {
        if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: s.name }); } catch (err) { } }
        else { download(blob, name); toast('Sharing not available here — image saved instead'); }
      }
      if (a === 'save') { download(blob, name); toast('Image saved ✓'); }
    });
  } catch (err) { el.querySelector('.pbody').innerHTML = `<p class="empty">Could not create the image: ${esc(err.message)}</p>`; }
}

/* =====================================================================
   3. BODY — measurements and progress photos
   ===================================================================== */
const BM = ['weight', 'chest', 'arms', 'waist', 'hips', 'thighs'];
function fillBmForm() {
  const e = db.body.find(b => b.date === $('bmDate').value) || {};
  BM.forEach(k => $('bm-' + k).value = e[k] ?? '');
}
$('bmDate').onchange = fillBmForm;
$('saveBm').onclick = () => {
  const date = $('bmDate').value;
  if (!date) return toast('Pick a date');
  const vals = {};
  BM.forEach(k => { const v = parseFloat($('bm-' + k).value); if (!isNaN(v) && v > 0) vals[k] = v; });
  if (!Object.keys(vals).length) return toast('Enter at least one measurement');
  let e = db.body.find(b => b.date === date);
  if (!e) { e = { date }; db.body.push(e); }
  BM.forEach(k => delete e[k]);
  Object.assign(e, vals);
  save(); toast('Saved ✓'); renderBody();
};
$('bmMetric').onchange = () => renderBody(true);
$('bmList').onclick = e => {
  const d = e.target.dataset.bmdel;
  if (d && confirm('Delete measurements for ' + fmtDate(d) + '?')) { db.body = db.body.filter(b => b.date !== d); save(); fillBmForm(); renderBody(); }
};
function bodyChange(k, days = 30) {
  const list = db.body.filter(b => b[k] != null).sort((a, b) => a.date.localeCompare(b.date));
  if (list.length < 2) return null;
  const last = list[list.length - 1], cut = addDays(last.date, -days);
  const base = [...list].reverse().find(b => b.date <= cut) || list[0];
  return last[k] - base[k];
}
function renderBodyTop() {
  const goal = db.settings.goalWeight;
  const ws = db.body.filter(b => b.weight != null).sort((a, b) => a.date.localeCompare(b.date));
  const cur = ws.length ? ws[ws.length - 1].weight : null;
  let prog = '';
  if (goal && cur != null) {
    const start = ws[0].weight, total = Math.abs(start - goal), done = Math.abs(start - cur);
    const pct = total ? Math.max(0, Math.min(100, 100 * done / total)) : 100;
    const left = num(Math.abs(cur - goal));
    prog = `<div class="macro" style="margin-top:12px"><div class="top"><span>Now <b>${num(cur)} kg</b></span><span>${left > 0 ? left + ' kg to go' : 'Goal reached 🎉'}</span></div><div class="track"><i style="width:${pct}%;background:var(--text)"></i></div></div>`;
  } else if (cur != null) prog = `<p class="muted" style="font-size:13px;margin-top:8px">Current weight: <b style="color:var(--text)">${num(cur)} kg</b></p>`;
  $('goalCard').innerHTML = `<div class="goal"><div><small class="muted" style="font-weight:700">Your goal</small><br><b>${goal ? num(goal) + ' kg.' : '— kg.'}</b></div><button class="btn sm ghost" id="setGoal">${goal ? 'Edit goal' : 'Set goal'}</button></div>${prog}`;
  const circ = (label, k, unit) => { const d = bodyChange(k); return `<div><small>${label}</small><div class="c">${d == null ? '–' : (d > 0 ? '+ ' : d < 0 ? '- ' : '') + num(Math.abs(d)) + ' ' + unit}</div></div>`; };
  $('bodyCircles').innerHTML = circ('Weight', 'weight', 'kg') + circ('Waist', 'waist', 'cm') + circ('Arms', 'arms', 'cm');
}
$('goalCard').addEventListener('click', e => {
  if (e.target.id !== 'setGoal') return;
  const v = prompt('Your goal body weight (kg):', db.settings.goalWeight || '');
  if (v === null) return;
  const n = parseFloat(v);
  db.settings.goalWeight = n > 0 ? n : null; save(); renderBodyTop();
});
function renderBody(skipPhotos) {
  renderBodyTop();
  if (!$('bmDate').value) { $('bmDate').value = todayStr(); fillBmForm(); }
  if (!$('phDate').value) $('phDate').value = todayStr();
  const k = $('bmMetric').value;
  const list = [...db.body].sort((a, b) => a.date.localeCompare(b.date));
  const pts = list.filter(b => b[k] != null).map(b => ({ x: b.date, y: b[k] }));
  drawLine($('bmChart'), pts, 'No entries yet');
  let change = '';
  if (pts.length > 1) { const d = pts[pts.length - 1].y - pts[0].y; change = `<p class="muted" style="font-size:13px;margin-top:8px">Change since ${shortDate(pts[0].x)}: <b style="color:var(--text)">${d >= 0 ? '+' : ''}${num(d)} ${k === 'weight' ? 'kg' : 'cm'}</b></p>`; }
  $('bmChart').nextElementSibling?.remove();
  $('bmChart').insertAdjacentHTML('afterend', `<div>${change}</div>`);
  $('bmList').innerHTML = list.length ? '<b>History</b>' + [...list].reverse().slice(0, 40).map(b => `<div class="list-item" style="cursor:default"><div><b>${fmtDate(b.date)}</b><small class="muted">${BM.filter(x => b[x] != null).map(x => `${cap(x)} ${num(b[x])} ${x === 'weight' ? 'kg' : 'cm'}`).join(' · ')}</small></div><button class="del" data-bmdel="${b.date}">Delete</button></div>`).join('') : '<div class="empty">No measurements yet.</div>';
  if (!skipPhotos) renderPhotos();
}
const weightOn = date => { const e = db.body.filter(b => b.weight != null && b.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0]; return e ? e.weight : null; };

// ----- photos -----
let phFilter = 'All', compareMode = false, compareSel = [], photoUrls = [], photoCache = [];
async function renderPhotos() {
  let photos = [];
  try { photos = await idb.all(); } catch (e) { $('photoGrid').innerHTML = '<div class="empty" style="grid-column:1/-1">Photos are not available in this browser.</div>'; return; }
  photos.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  photoCache = photos;
  photoUrls.forEach(u => URL.revokeObjectURL(u)); photoUrls = [];
  $('phFilter').innerHTML = ['All', 'Front', 'Side', 'Back'].map(p => `<span class="chip ${p === phFilter ? 'on' : ''}" data-pf="${p}">${p}</span>`).join('');
  $('comparePhotos').textContent = compareMode ? 'Cancel compare' : 'Compare';
  const list = photos.filter(p => phFilter === 'All' || p.pose === phFilter);
  if (!list.length) { $('photoGrid').innerHTML = '<div class="empty" style="grid-column:1/-1">No photos yet. Tip: same pose, place and lighting every 2–4 weeks.</div>'; return; }
  $('photoGrid').innerHTML = list.map(p => {
    const u = URL.createObjectURL(p.blob); photoUrls.push(u);
    const k = compareSel.indexOf(p.id);
    return `<div class="ph ${k >= 0 ? 'sel' : ''}" data-ph="${p.id}"><img src="${u}" alt=""><span>${parseYmd(p.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · ${p.pose}</span>${k >= 0 ? `<div class="badge">${k + 1}</div>` : ''}</div>`;
  }).join('');
}
function compressImage(file, max, q) {
  return new Promise((res, rej) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.naturalWidth * s); cv.height = Math.round(img.naturalHeight * s);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(u);
      cv.toBlob(b => b ? res(b) : rej(new Error('Could not process image')), 'image/jpeg', q);
    };
    img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Could not read this image')); };
    img.src = u;
  });
}
$('phCamera').onclick = () => $('phFileCam').click();
$('phGallery').onclick = () => $('phFileGal').click();
[$('phFileCam'), $('phFileGal')].forEach(inp => inp.onchange = async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const blob = await compressImage(f, 1280, 0.85);
    await idb.put({ id: uid(), date: $('phDate').value || todayStr(), pose: $('phPose').value, blob });
    toast('Photo saved ✓'); renderPhotos();
  } catch (err) { alert('Could not save photo: ' + err.message); }
});
$('phFilter').onclick = e => { const p = e.target.dataset.pf; if (p) { phFilter = p; renderPhotos(); } };
$('comparePhotos').onclick = () => {
  if (!compareMode && photoCache.length < 2) return toast('Add at least 2 photos to compare');
  compareMode = !compareMode; compareSel = [];
  if (compareMode) toast('Tap 2 photos to compare');
  renderPhotos();
};
$('photoGrid').onclick = e => {
  const t = e.target.closest('[data-ph]'); if (!t) return;
  const id = t.dataset.ph;
  if (compareMode) {
    const k = compareSel.indexOf(id);
    if (k >= 0) compareSel.splice(k, 1); else if (compareSel.length < 2) compareSel.push(id);
    renderPhotos();
    if (compareSel.length === 2) openCompare();
  } else openPhoto(id);
};
function openPhoto(id) {
  const p = photoCache.find(x => x.id === id); if (!p) return;
  const u = URL.createObjectURL(p.blob);
  const w = weightOn(p.date);
  const el = openSheet(`${p.pose} · ${fmtDate(p.date)}`, `<img src="${u}" style="width:100%;border-radius:12px" alt="">${w ? `<p class="muted" style="margin-top:8px">Body weight around this date: ${num(w)} kg</p>` : ''}<button class="btn danger" data-a="del">Delete photo</button>`,
    body => body.addEventListener('click', async e => {
      if (e.target.dataset.a === 'del' && confirm('Delete this photo?')) { await idb.del(id); closeSheet(el); renderPhotos(); }
    }));
  el._onclose = () => URL.revokeObjectURL(u);
}
function openCompare() {
  const [a, b] = compareSel.map(id => photoCache.find(p => p.id === id)).sort((x, y) => x.date.localeCompare(y.date));
  const ua = URL.createObjectURL(a.blob), ub = URL.createObjectURL(b.blob);
  const capOf = p => { const w = weightOn(p.date); return `${fmtDate(p.date)}${w ? ` · ${num(w)} kg` : ''}`; };
  const diff = daysBetween(a.date, b.date), wa = weightOn(a.date), wb = weightOn(b.date);
  const summary = `${diff} days apart${wa && wb && a.date !== b.date ? ` · ${wb - wa >= 0 ? '+' : ''}${num(wb - wa)} kg` : ''}`;
  const el = openSheet('Compare progress', `
    <p style="text-align:center;margin-bottom:10px;font-weight:800">${summary}</p>
    <div class="compare">
      <figure><img src="${ua}" alt=""><figcaption><b>BEFORE</b><br>${capOf(a)}</figcaption></figure>
      <figure><img src="${ub}" alt=""><figcaption><b>AFTER</b><br>${capOf(b)}</figcaption></figure>
    </div>
    <button class="btn primary" data-a="share">Save / share comparison image</button>`,
    body => body.addEventListener('click', e => { if (e.target.dataset.a === 'share') saveCompareImage(a, b, ua, ub, [capOf(a), capOf(b)], summary); }));
  el._onclose = () => { URL.revokeObjectURL(ua); URL.revokeObjectURL(ub); compareMode = false; compareSel = []; renderPhotos(); };
}
async function saveCompareImage(a, b, ua, ub, caps, summary) {
  const loadImg = u => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = u; });
  const [ia, ib] = await Promise.all([loadImg(ua), loadImg(ub)]);
  const W = 600, H = 800, top = 80, gap = 10;
  const cv = document.createElement('canvas'); cv.width = W * 2 + gap; cv.height = H + top;
  const c = cv.getContext('2d');
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, cv.width, cv.height);
  c.textAlign = 'center'; c.fillStyle = '#141414'; c.font = 'bold 32px system-ui, sans-serif';
  c.fillText("Olliver's Gym · " + summary, cv.width / 2, 52);
  [[ia, 0, caps[0], 'BEFORE'], [ib, W + gap, caps[1], 'AFTER']].forEach(([im, x, cp, lbl]) => {
    const s = Math.max(W / im.width, H / im.height), sw = W / s, sh = H / s;
    c.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, x, top, W, H);
    c.fillStyle = 'rgba(0,0,0,.7)'; c.fillRect(x, top + H - 90, W, 90);
    c.fillStyle = '#fff'; c.font = 'bold 28px system-ui, sans-serif'; c.fillText(lbl, x + W / 2, top + H - 52);
    c.font = '24px system-ui, sans-serif'; c.fillText(cp, x + W / 2, top + H - 18);
  });
  cv.toBlob(async bl => {
    const name = `progress-${a.date}-vs-${b.date}.jpg`;
    const file = new File([bl], name, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'My progress' }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    download(bl, name);
  }, 'image/jpeg', 0.9);
}

/* =====================================================================
   4. FOOD — calories, macros, barcode scanner
   ===================================================================== */
// Every nutrient the app tracks. Food values are stored per 100 g.
const NUT = [
  { k: 'kcal', label: 'Calories', unit: 'kcal' },
  { k: 'p', label: 'Protein', unit: 'g' },
  { k: 'c', label: 'Carbs', unit: 'g' },
  { k: 'f', label: 'Fat', unit: 'g' },
  { k: 'sugar', label: 'Sugar', unit: 'g' },
  { k: 'fiber', label: 'Fibre', unit: 'g' },
  { k: 'sat', label: 'Saturated fat', unit: 'g' },
  { k: 'sodium', label: 'Sodium', unit: 'mg' }
];
const NKEYS = NUT.map(n => n.k);
const MAIN = ['kcal', 'p', 'c', 'f'];
let fdDate = todayStr();
const foodDay = d => db.food.log.filter(x => x.date === d);
const totals = items => { const t = {}; NKEYS.forEach(k => t[k] = items.reduce((a, x) => a + (+x[k] || 0), 0)); return t; };
const scale = (per, g) => { const o = {}; NKEYS.forEach(k => o[k] = per[k] == null ? (MAIN.includes(k) ? 0 : null) : per[k] * g / 100); return o; };
const fmtN = (v, k) => v == null ? '–' : (k === 'kcal' || k === 'sodium' ? Math.round(v) : num(v));
function defaultMeal() { const h = new Date().getHours(); return h < 11 ? 'Breakfast' : h < 16 ? 'Lunch' : h < 22 ? 'Dinner' : 'Snacks'; }

function renderFood() {
  const t = db.food.targets, items = foodDay(fdDate), s = totals(items), left = t.kcal - s.kcal;
  $('fdTitle').textContent = fdDate === todayStr() ? 'Today' : fdDate === addDays(todayStr(), -1) ? 'Yesterday' : fmtDate(fdDate);
  const bar = (label, v, goal, color) => `<div class="macro"><div class="top"><span>${label}</span><span><b>${Math.round(v)}</b> / ${goal} g</span></div><div class="track"><i style="width:${Math.min(100, goal ? 100 * v / goal : 0)}%;background:${color}"></i></div></div>`;
  const mini = (label, v, goal, unit, limit) => { const over = limit && v > goal; return `<div class="stat" style="padding:8px 4px"><b style="font-size:16px;color:${over ? 'var(--danger)' : 'var(--text)'}">${Math.round(v)}<span class="muted" style="font-size:11px;font-weight:400"> / ${goal}${unit}</span></b><small>${label}${limit ? ' (max)' : ''}</small></div>`; };
  $('fdSummary').innerHTML = `
    <div class="kcalbig"><div><small class="muted">Calories eaten</small><br><b>${Math.round(s.kcal)}</b> <span class="muted">/ ${t.kcal} kcal</span></div>
      <div style="text-align:right"><small class="muted">${left >= 0 ? 'Remaining' : 'Over by'}</small><br><b style="font-size:22px;color:${left >= 0 ? 'var(--accent)' : 'var(--danger)'}">${Math.abs(Math.round(left))}</b></div></div>
    <div class="macro"><div class="track" style="height:12px"><i style="width:${Math.min(100, t.kcal ? 100 * s.kcal / t.kcal : 0)}%;background:${left >= 0 ? 'var(--accent)' : 'var(--danger)'}"></i></div></div>
    ${bar('Protein', s.p, t.p, 'var(--p)')}${bar('Carbs', s.c, t.c, 'var(--c)')}${bar('Fat', s.f, t.f, 'var(--f)')}
    <div class="grid3" style="margin-top:10px">${mini('Sugar', s.sugar, t.sugar, 'g', true)}${mini('Fibre', s.fiber, t.fiber, 'g', false)}${mini('Sodium', s.sodium, t.sodium, 'mg', true)}</div>
    <button class="btn ghost" id="editTargets" style="padding:10px">✏️ Edit my daily targets</button>`;
  $('fdMeals').innerHTML = MEALS.map(m => {
    const its = items.filter(x => x.meal === m), mk = totals(its);
    return `<div class="card"><div class="meal-head"><b>${m}</b><span><span class="muted" style="font-size:14px">${Math.round(mk.kcal)} kcal</span>
      <button class="btn sm ghost" data-addmeal="${m}" style="margin-left:6px">+ Add</button></span></div>
      ${its.map(x => `<div class="food-line" data-fedit="${x.id}" style="cursor:pointer"><div><b>${esc(x.name)}</b><small>${x.grams ? num(x.grams) + ' g · ' : ''}P ${num(x.p)} · C ${num(x.c)} · F ${num(x.f)}${x.sodium != null ? ` · Na ${Math.round(x.sodium)} mg` : ''}</small></div>
        <div style="display:flex;align-items:center;gap:6px;white-space:nowrap"><span>${Math.round(x.kcal)}</span><span class="muted" style="font-size:13px">✏️</span></div></div>`).join('')}</div>`;
  }).join('') + (items.length ? '<p class="muted" style="text-align:center;font-size:12px">Tap any food to change the amount or the numbers.</p>' : '');
}
$('fdPrev').onclick = () => { fdDate = addDays(fdDate, -1); renderFood(); };
$('fdNext').onclick = () => { fdDate = addDays(fdDate, 1); renderFood(); };
$('scanBtn').onclick = () => openScanner(defaultMeal());
$('manualFoodBtn').onclick = () => openAddFood(defaultMeal());
$('tab-food').addEventListener('click', e => {
  if (e.target.closest('#editTargets')) return openTargets();
  if (e.target.dataset.addmeal) return openAddFood(e.target.dataset.addmeal);
  const line = e.target.closest('[data-fedit]');
  if (line) openLogEdit(db.food.log.find(x => x.id === line.dataset.fedit));
});

function openTargets() {
  const t = db.food.targets;
  const f = (id, label, v) => `<div><label>${label}</label><input type="number" inputmode="decimal" id="${id}" value="${v}"></div>`;
  const el = openSheet('My daily targets', `
    <div class="grid2">
      ${f('tgK', 'Calories (kcal)', t.kcal)}${f('tgP', 'Protein (g)', t.p)}
      ${f('tgC', 'Carbs (g)', t.c)}${f('tgF', 'Fat (g)', t.f)}
      ${f('tgS', 'Sugar — max (g)', t.sugar)}${f('tgFb', 'Fibre (g)', t.fiber)}
      ${f('tgNa', 'Sodium — max (mg)', t.sodium)}
    </div>
    <p class="muted" id="tgInfo" style="font-size:13px;margin-top:10px"></p>
    <button class="btn ghost" id="tgCalc">Set calories from my macros</button>
    <button class="btn primary" id="tgSave">Save targets</button>`, body => {
    const g = id => parseFloat(body.querySelector(id).value) || 0;
    const info = () => body.querySelector('#tgInfo').textContent = `Your protein, carbs and fat add up to ${Math.round(g('#tgP') * 4 + g('#tgC') * 4 + g('#tgF') * 9)} kcal (protein & carbs 4 kcal/g, fat 9 kcal/g).`;
    info(); body.addEventListener('input', info);
    body.querySelector('#tgCalc').onclick = () => { body.querySelector('#tgK').value = Math.round(g('#tgP') * 4 + g('#tgC') * 4 + g('#tgF') * 9); };
    body.querySelector('#tgSave').onclick = () => {
      db.food.targets = { kcal: Math.round(g('#tgK')), p: Math.round(g('#tgP')), c: Math.round(g('#tgC')), f: Math.round(g('#tgF')), sugar: Math.round(g('#tgS')), fiber: Math.round(g('#tgFb')), sodium: Math.round(g('#tgNa')) };
      save(); closeSheet(el); toast('Targets saved ✓'); renderFood();
    };
  });
}

function openAddFood(meal) {
  let q = '';
  const el = openSheet(`Add to ${meal}`, `
    <div class="btnrow" style="margin-bottom:6px"><button class="btn primary" id="afScan">📷 Scan barcode</button><button class="btn ghost" id="afNew">＋ New food</button></div>
    <button class="btn ghost" id="afQuick" style="margin-bottom:12px">⚡ Quick add (just type calories)</button>
    <input id="afQ" placeholder="🔍 Search my foods" autocomplete="off"><h2>My foods</h2><div class="card" id="afList"></div>`, body => {
    const draw = () => {
      const list = db.food.myFoods.filter(f => !q || (f.name + ' ' + (f.brand || '')).toLowerCase().includes(q.toLowerCase())).sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
      body.querySelector('#afList').innerHTML = list.length ? list.map(f => `<div class="list-item" data-fid="${f.id}"><div><b>${esc(f.name)}</b><small class="muted">${f.brand ? esc(f.brand) + ' · ' : ''}${Math.round(f.per.kcal)} kcal / 100 g${f.serving ? ` · serving ${num(f.serving)} g` : ''}</small></div><button class="del" data-fdelmy="${f.id}" aria-label="Remove">✕</button></div>`).join('')
        : '<div class="empty">Foods you scan or add are saved here for quick logging next time.</div>';
    };
    draw();
    body.querySelector('#afQ').oninput = e => { q = e.target.value; draw(); };
    body.addEventListener('click', e => {
      if (e.target.id === 'afScan') { closeSheet(el); openScanner(meal); return; }
      if (e.target.id === 'afNew') { closeSheet(el); openFoodForm(null, meal); return; }
      if (e.target.id === 'afQuick') { closeSheet(el); openQuickAdd(meal); return; }
      if (e.target.dataset.fdelmy) {
        if (confirm('Remove from My foods? (Entries you already logged stay.)')) { db.food.myFoods = db.food.myFoods.filter(f => f.id !== e.target.dataset.fdelmy); save(); draw(); }
        return;
      }
      const it = e.target.closest('[data-fid]');
      if (it) { closeSheet(el); openFoodPortion(db.food.myFoods.find(f => f.id === it.dataset.fid), meal); }
    });
  });
}

function upsertMyFood(food) {
  let f = (food.id && db.food.myFoods.find(x => x.id === food.id)) || (food.barcode && db.food.myFoods.find(x => x.barcode === food.barcode));
  if (!f) { f = { ...food, id: uid() }; db.food.myFoods.push(f); }
  else if (f !== food) Object.assign(f, food, { id: f.id });
  f.lastUsed = Date.now();
  return f;
}

// grid of nutrient boxes for an amount of food
function nutrientBoxes(v) {
  const box = (k, label) => `<div><b>${fmtN(v[k], k)}</b><small>${label}</small></div>`;
  return `<div class="macgrid">${box('kcal', 'kcal')}${box('p', 'Protein g', 'var(--p)')}${box('c', 'Carbs g', 'var(--c)')}${box('f', 'Fat g', 'var(--f)')}</div>
    <div class="macgrid" style="margin-top:-4px">${box('sugar', 'Sugar g')}${box('fiber', 'Fibre g')}${box('sat', 'Sat. fat g')}${box('sodium', 'Sodium mg')}</div>`;
}

// food: { id?, barcode, name, brand, image, per:{kcal,p,c,f,sugar,fiber,sat,sodium} per 100 g, serving (g) }
function openFoodPortion(food, meal) {
  const start = food.serving || 100;
  const el = openSheet('Log food', `
    <div style="display:flex;gap:12px;align-items:center">
      ${food.image ? `<img src="${esc(food.image)}" alt="" style="width:64px;height:64px;object-fit:contain;background:#fff;border-radius:10px">` : ''}
      <div><h3 style="margin:0">${esc(food.name)}</h3><small class="muted">${esc(food.brand || '')}${food.barcode ? ` · ${esc(food.barcode)}` : ''}</small></div>
    </div>
    <p class="muted" style="font-size:12px;margin-top:12px">Nutrients for the amount below:</p>
    <div id="fpMac"></div>
    <div class="grid2"><div><label>Amount (g or ml)</label><input type="number" id="fpG" inputmode="decimal" value="${num(start)}"></div>
      <div><label>Meal</label><select id="fpMeal">${MEALS.map(m => `<option ${m === meal ? 'selected' : ''}>${m}</option>`).join('')}</select></div></div>
    <div class="btnrow" style="margin-top:8px">${food.serving ? `<button class="btn sm ghost" data-g="${food.serving}">1 serving (${num(food.serving)} g)</button><button class="btn sm ghost" data-g="${food.serving * 2}">2 servings</button>` : ''}<button class="btn sm ghost" data-g="100">100 g</button></div>
    <label style="margin-top:12px">Date</label><input type="date" id="fpDate" value="${fdDate}">
    <button class="btn primary" id="fpLog">Log it</button>
    <button class="btn ghost" id="fpEdit">Edit nutrition values</button>`, body => {
    const grams = () => parseFloat(body.querySelector('#fpG').value) || 0;
    const calc = () => { body.querySelector('#fpMac').innerHTML = nutrientBoxes(scale(food.per, grams())); };
    calc();
    body.querySelector('#fpG').oninput = calc;
    body.addEventListener('click', e => {
      if (e.target.dataset.g) { body.querySelector('#fpG').value = num(+e.target.dataset.g); calc(); }
      if (e.target.id === 'fpLog') {
        const g = grams(); if (!(g > 0)) return toast('Enter an amount');
        const saved = upsertMyFood(food);
        db.food.log.push({ id: uid(), date: body.querySelector('#fpDate').value || fdDate, meal: body.querySelector('#fpMeal').value, foodId: saved.id, name: food.name, grams: g, per: { ...food.per }, ...scale(food.per, g) });
        save(); closeAllSheets(); toast('Logged ✓');
        if (currentTab === 'food') renderFood();
      }
      if (e.target.id === 'fpEdit') { closeSheet(el); openFoodForm(food, meal); }
    });
  });
}

// inputs for every nutrient, used by the food form, quick add and the edit sheet
const nutrientInputs = (prefix, vals, onlyMain) => `<div class="grid2">${NUT.filter(n => !onlyMain || MAIN.includes(n.k)).map(n =>
  `<div><label>${n.label} (${n.unit})${MAIN.includes(n.k) ? '' : ' – optional'}</label><input type="number" inputmode="decimal" id="${prefix}${n.k}" value="${vals && vals[n.k] != null ? fmtN(vals[n.k], n.k) : ''}"></div>`).join('')}</div>`;
const readNutrients = (body, prefix) => { const o = {}; NKEYS.forEach(k => { const inp = body.querySelector('#' + prefix + k); const v = inp ? parseFloat(inp.value) : NaN; o[k] = isNaN(v) ? null : v; }); return o; };

// edit something already logged
function openLogEdit(entry) {
  if (!entry) return;
  // older entries have no per-100 g values: work them out from the totals
  if (!entry.per && entry.grams > 0) { entry.per = {}; NKEYS.forEach(k => entry.per[k] = entry[k] == null ? null : entry[k] * 100 / entry.grams); }
  const el = openSheet('Edit food', `
    <label>Food name</label><input id="leName" value="${esc(entry.name)}">
    <div class="grid2" style="margin-top:10px">
      ${entry.per ? `<div><label>Amount (g or ml)</label><input type="number" inputmode="decimal" id="leG" value="${num(entry.grams)}"></div>` : ''}
      <div><label>Meal</label><select id="leMeal">${MEALS.map(m => `<option ${m === entry.meal ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
      <div><label>Date</label><input type="date" id="leDate" value="${entry.date}"></div>
    </div>
    <h2>Nutrients</h2>${entry.per ? '<p class="muted" style="font-size:12px;margin:-4px 4px 10px">These update automatically when you change the amount. You can also type your own numbers.</p>' : ''}
    ${nutrientInputs('le_', entry)}
    <button class="btn primary" id="leSave">Save changes</button>
    <button class="btn danger" id="leDel">Delete this food</button>`, body => {
    const gIn = body.querySelector('#leG');
    if (gIn) gIn.oninput = () => {
      const g = parseFloat(gIn.value) || 0, v = scale(entry.per, g);
      NKEYS.forEach(k => { body.querySelector('#le_' + k).value = v[k] == null ? '' : fmtN(v[k], k); });
    };
    body.querySelector('#leSave').onclick = () => {
      const v = readNutrients(body, 'le_');
      if (v.kcal == null) return toast('Enter the calories');
      entry.name = body.querySelector('#leName').value.trim() || entry.name;
      entry.meal = body.querySelector('#leMeal').value;
      entry.date = body.querySelector('#leDate').value || entry.date;
      if (gIn) entry.grams = parseFloat(gIn.value) || entry.grams;
      NKEYS.forEach(k => entry[k] = v[k] == null ? (MAIN.includes(k) ? 0 : null) : v[k]);
      save(); closeSheet(el); toast('Updated ✓'); renderFood();
    };
    body.querySelector('#leDel').onclick = () => {
      if (!confirm('Delete this food from your log?')) return;
      db.food.log = db.food.log.filter(x => x.id !== entry.id); save(); closeSheet(el); renderFood();
    };
  });
}

// log calories without saving a food (e.g. a meal at a restaurant)
function openQuickAdd(meal) {
  const el = openSheet('Quick add', `
    <label>What did you eat?</label><input id="qaName" placeholder="e.g. Chicken rice">
    <div class="grid2" style="margin-top:10px">
      <div><label>Meal</label><select id="qaMeal">${MEALS.map(m => `<option ${m === meal ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
      <div><label>Date</label><input type="date" id="qaDate" value="${fdDate}"></div>
    </div>
    <h2>Nutrients</h2>
    ${nutrientInputs('qa_', null)}
    <button class="btn primary" id="qaSave">Log it</button>`, body => {
    body.querySelector('#qaSave').onclick = () => {
      const v = readNutrients(body, 'qa_');
      if (v.kcal == null) return toast('Enter the calories');
      const entry = { id: uid(), date: body.querySelector('#qaDate').value || fdDate, meal: body.querySelector('#qaMeal').value, name: body.querySelector('#qaName').value.trim() || 'Quick add', grams: null, per: null };
      NKEYS.forEach(k => entry[k] = v[k] == null ? (MAIN.includes(k) ? 0 : null) : v[k]);
      db.food.log.push(entry); save(); closeSheet(el); toast('Logged ✓'); renderFood();
    };
  });
}

function openFoodForm(pre, meal, note) {
  pre = pre || {};
  const el = openSheet(pre.name ? 'Check food values' : 'New food', `
    ${note ? `<div class="card" style="border-color:var(--warn)"><small>${note}</small></div>` : ''}
    <p class="muted" style="font-size:13px;margin-bottom:10px">Copy the numbers from the "Nutrition Information" table on the pack. You only need to do this once — next time it's saved.</p>
    <label>Food name</label><input id="ffName" value="${esc(pre.name || '')}" placeholder="e.g. Nasi lemak, Milo 3-in-1">
    <div class="grid2" style="margin-top:10px">
      <div><label>Brand (optional)</label><input id="ffBrand" value="${esc(pre.brand || '')}"></div>
      <div><label>Barcode (optional)</label><input id="ffCode" inputmode="numeric" value="${esc(pre.barcode || '')}"></div>
      <div><label>Values below are per</label><select id="ffBasis"><option value="100">100 g / ml</option><option value="serving">1 serving</option></select></div>
      <div><label>Serving size (g)</label><input type="number" id="ffServ" inputmode="decimal" value="${pre.serving ? num(pre.serving) : ''}" placeholder="optional"></div>
    </div>
    <h2>Nutrition</h2>
    ${nutrientInputs('ff_', pre.per)}
    <button class="btn primary" id="ffSave">Save & continue</button>`, body => {
    body.querySelector('#ffSave').onclick = () => {
      const name = body.querySelector('#ffName').value.trim();
      if (!name) return toast('Enter a food name');
      const v = readNutrients(body, 'ff_');
      if (v.kcal == null && v.p != null && v.c != null && v.f != null) v.kcal = v.p * 4 + v.c * 4 + v.f * 9;
      if (v.kcal == null) return toast('Enter the calories (or protein, carbs and fat)');
      const sv = parseFloat(body.querySelector('#ffServ').value) || null;
      let factor = 1;
      if (body.querySelector('#ffBasis').value === 'serving') {
        if (!sv) return toast('Enter the serving size in grams');
        factor = 100 / sv;
      }
      const per = {};
      NKEYS.forEach(k => per[k] = v[k] == null ? (MAIN.includes(k) ? 0 : null) : v[k] * factor);
      const food = { id: pre.id, barcode: body.querySelector('#ffCode').value.replace(/\D/g, '') || null, name, brand: body.querySelector('#ffBrand').value.trim(), image: pre.image || null, per, serving: sv };
      const saved = upsertMyFood(food); save();
      closeSheet(el); openFoodPortion(saved, meal);
    };
  });
}

async function openScanner(meal) {
  let stream = null, iv = null, done = false;
  const supported = 'BarcodeDetector' in window;
  const stop = () => { clearInterval(iv); if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; };
  const found = code => {
    if (done) return; done = true; stop();
    if (navigator.vibrate) navigator.vibrate(80);
    closeSheet(el); lookupBarcode(code, meal);
  };
  const el = openSheet('Scan barcode', `
    ${supported ? `<div id="scanVideoWrap"><video id="scanVideo" playsinline muted></video><div class="frame"></div></div>
      <p class="muted" id="scanMsg" style="text-align:center;margin:10px 0;font-size:14px">Starting camera…</p>`
      : `<p class="muted" style="margin-bottom:12px;line-height:1.5">Live scanning isn't supported in this browser. Open the app in <b>Chrome on Android</b>, or type the barcode number below.</p>`}
    <label>Or type the barcode number</label>
    <div style="display:flex;gap:8px"><input id="scanCode" inputmode="numeric" placeholder="e.g. 9556001234567"><button class="btn sm primary" id="scanGo">Look up</button></div>`, body => {
    body.querySelector('#scanGo').onclick = () => {
      const c = body.querySelector('#scanCode').value.replace(/\D/g, '');
      if (c.length < 6) return toast('Enter a valid barcode');
      found(c);
    };
  });
  el._onclose = stop;
  if (!supported) return;
  try {
    const want = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];
    const fmts = (await BarcodeDetector.getSupportedFormats()).filter(f => want.includes(f));
    const det = fmts.length ? new BarcodeDetector({ formats: fmts }) : new BarcodeDetector();
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    if (!el.isConnected) { stop(); return; }
    const v = el.querySelector('#scanVideo');
    v.srcObject = stream; await v.play();
    el.querySelector('#scanMsg').textContent = 'Point the camera at the barcode';
    let busy = false;
    iv = setInterval(async () => {
      if (busy || done || v.readyState < 2) return;
      busy = true;
      try { const codes = await det.detect(v); if (codes.length) found(codes[0].rawValue); } catch (e) { }
      busy = false;
    }, 250);
  } catch (err) {
    const m = el.querySelector('#scanMsg');
    if (m) m.textContent = err.name === 'NotAllowedError' ? 'Camera permission was blocked. Allow camera access for this site in Chrome, or type the number below.' : 'Could not start camera: ' + err.message;
  }
}

// Read nutrition values from an Open Food Facts product, converting everything to "per 100 g".
// Products can store values per 100 g, per serving, or without a suffix, so try each.
function parseOffNutrients(p) {
  const n = p.nutriments || {};
  const servQ = parseFloat(p.serving_quantity) || null;
  const perServing = p.nutrition_data_per === 'serving';
  const val = k => { const x = parseFloat(n[k]); return isNaN(x) ? null : x; };
  const per100 = base => {
    let v = val(base + '_100g');
    if (v != null) return v;
    v = val(base + '_serving');
    if (v != null && servQ) return v * 100 / servQ;
    v = val(base) ?? val(base + '_value');
    if (v != null) return perServing ? (servQ ? v * 100 / servQ : null) : v;
    return null;
  };
  let kcal = per100('energy-kcal');
  if (kcal == null) { const kj = per100('energy-kj') ?? per100('energy'); if (kj != null) kcal = kj / 4.184; }
  const out = { kcal, p: per100('proteins'), c: per100('carbohydrates'), f: per100('fat'), sugar: per100('sugars'), fiber: per100('fiber'), sat: per100('saturated-fat') };
  let na = per100('sodium');                       // grams
  if (na == null) { const salt = per100('salt'); if (salt != null) na = salt / 2.5; }
  out.sodium = na == null ? null : na * 1000;      // → mg
  if (out.kcal == null && out.p != null && out.c != null && out.f != null) out.kcal = out.p * 4 + out.c * 4 + out.f * 9;
  return out;
}

async function lookupBarcode(code, meal) {
  const mine = db.food.myFoods.find(f => f.barcode === code);
  if (mine) return openFoodPortion(mine, meal);
  const loading = openSheet('Looking up…', `<p class="muted" style="text-align:center;padding:24px 0">Searching the Open Food Facts database for<br><b>${esc(code)}</b>…</p>`);
  try {
    const fields = 'product_name,product_name_en,product_name_ms,generic_name,brands,nutriments,serving_quantity,serving_size,nutrition_data_per,image_front_small_url';
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`);
    const j = await r.json();
    closeSheet(loading);
    if (j.status !== 1 || !j.product) {
      return openFoodForm({ barcode: code }, meal, `Barcode <b>${esc(code)}</b> isn't in the Open Food Facts database yet. Type the values from the pack once and the app will remember it.`);
    }
    const p = j.product;
    const per = parseOffNutrients(p);
    const food = {
      barcode: code,
      name: (p.product_name_en || p.product_name || p.product_name_ms || p.generic_name || 'Unnamed product').trim(),
      brand: (p.brands || '').split(',')[0].trim(),
      image: p.image_front_small_url || null,
      per, serving: parseFloat(p.serving_quantity) || null
    };
    const missing = MAIN.filter(k => per[k] == null);
    if (missing.length === 4) {
      return openFoodForm(food, meal, `Found <b>${esc(food.name)}</b>, but nobody has added its nutrition facts to the database yet. Copy them from the pack once — the app saves them for next time.`);
    }
    if (missing.length) {
      const names = missing.map(k => NUT.find(n => n.k === k).label.toLowerCase()).join(', ');
      return openFoodForm(food, meal, `Found <b>${esc(food.name)}</b>, but the database is missing: <b>${names}</b>. Please fill in the empty boxes from the pack.`);
    }
    NKEYS.forEach(k => { if (per[k] == null && MAIN.includes(k)) per[k] = 0; });
    openFoodPortion(food, meal);
  } catch (e) {
    closeSheet(loading);
    openFoodForm({ barcode: code }, meal, "Couldn't reach the food database — check your internet connection. You can still add the food by typing the values.");
  }
}

/* =====================================================================
   SETTINGS & BACKUP
   ===================================================================== */
const blobToDataUrl = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
async function exportBackup(withPhotos) {
  const data = { app: "Olliver's Gym", version: 1, exported: new Date().toISOString(), db };
  if (withPhotos) {
    const ps = await idb.all();
    data.photos = await Promise.all(ps.map(async p => ({ id: p.id, date: p.date, pose: p.pose, data: await blobToDataUrl(p.blob) })));
  }
  download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `olliversgym-backup-${todayStr()}.json`);
  toast('Backup downloaded ✓');
}
async function importBackup(file) {
  let d;
  try { d = JSON.parse(await file.text()); } catch (e) { return alert('This is not a valid backup file.'); }
  let newDb;
  if (d.db) newDb = normalise(d.db);
  else if (Array.isArray(d.workouts)) { newDb = blankDb(); migrateOld(newDb, d); newDb = normalise(newDb); }
  else return alert("This file is not an Olliver's Gym backup.");
  if (!confirm('Replace ALL current data with this backup?')) return;
  stopRest();
  db = newDb; save();
  if (Array.isArray(d.photos)) {
    await idb.clear();
    for (const p of d.photos) { const blob = await (await fetch(p.data)).blob(); await idb.put({ id: p.id, date: p.date, pose: p.pose, blob }); }
  }
  closeAllSheets(); toast('Backup restored ✓'); renderTab();
}
function openSettings() {
  const s = db.settings;
  const sw = (k, label) => `<label class="switch" style="font-size:15px;color:var(--text)"><span>${label}</span><input type="checkbox" data-s="${k}" ${s[k] ? 'checked' : ''}></label>`;
  const el = openSheet('Settings', `
    <h2 style="margin-top:0">Rest timer</h2>
    <div class="card">
      <label>Default rest time</label>
      <select id="stRest">${[30, 45, 60, 75, 90, 120, 150, 180, 240, 300].map(x => `<option value="${x}" ${x === s.rest ? 'selected' : ''}>${fmtClock(x)}</option>`).join('')}</select>
      ${sw('autoRest', 'Start timer automatically after each set')}
      ${sw('sound', 'Beep when rest is over')}
      ${sw('vibrate', 'Vibrate when rest is over')}
      ${sw('wake', 'Keep screen on during workouts')}
    </div>
    <h2>Nutrition</h2>
    <button class="btn ghost" id="stTargets" style="margin-top:0">Edit calorie & macro targets</button>
    <h2>Backup</h2>
    <div class="card">
      <small class="muted">All your data is stored only on this phone. Export a backup regularly (e.g. save it to Google Drive) so you don't lose it if you clear Chrome's data or change phones.</small>
      ${sw('_photos', 'Include progress photos (bigger file)')}
      <button class="btn ghost" id="stExport">⬇️ Export backup</button>
      <button class="btn ghost" id="stImport">⬆️ Import backup</button>
      <input type="file" id="stFile" accept=".json,application/json" hidden>
    </div>
    <button class="btn danger" id="stWipe">Delete all data</button>
    <p class="muted" style="text-align:center;font-size:12px;margin-top:16px">Olliver's Gym v2.0 · Food data from Open Food Facts</p>`, body => {
    let withPhotos = false;
    body.querySelector('#stRest').onchange = e => { s.rest = +e.target.value; save(); };
    body.addEventListener('change', e => {
      const k = e.target.dataset.s; if (!k) return;
      if (k === '_photos') { withPhotos = e.target.checked; return; }
      s[k] = e.target.checked; save();
      if (k === 'wake') keepAwake(s.wake && !!db.active);
    });
    body.querySelector('#stTargets').onclick = () => { closeSheet(el); openTargets(); };
    body.querySelector('#stExport').onclick = () => exportBackup(withPhotos);
    body.querySelector('#stImport').onclick = () => body.querySelector('#stFile').click();
    body.querySelector('#stFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importBackup(f); };
    body.querySelector('#stWipe').onclick = async () => {
      if (!confirm('Delete ALL workouts, food logs, measurements and photos?')) return;
      if (!confirm('Are you really sure? This cannot be undone.')) return;
      stopRest();
      localStorage.removeItem(KEY); localStorage.removeItem(OLD_KEY);
      try { await idb.clear(); } catch (e) { }
      db = blankDb(); save(); closeAllSheets(); toast('All data deleted'); showTab('train');
    };
  });
}
$('settingsBtn').onclick = openSettings;

/* =====================================================================
   START UP
   ===================================================================== */
if (db.active) {
  keepAwake(true);
  if (db.active.restEnd && db.active.restEnd > Date.now() - 60000) {
    rest.end = db.active.restEnd; rest.total = db.active.restTotal || db.settings.rest;
    rest.alerted = rest.end < Date.now();
    runRest();
  }
}
renderTab();
let resizeT;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (currentTab === 'stats' || currentTab === 'body') renderTab(); }, 200); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
