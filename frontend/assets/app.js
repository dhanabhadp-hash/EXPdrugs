/* DRUGS EXP ALERT — Frontend (vanilla JS, no build step) */
(function () {
  'use strict';
  var CFG = window.APP_CONFIG || { API: '/api/gas' };
  var PR = window.PdfReport;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  var S = {
    token: localStorage.getItem('dea_token') || '', user: localStorage.getItem('dea_user') || '',
    rows: [], options: { locations: [], recorders: [], names: [] }, today: '', alertDays: 1, loaded: 0,
    rep: { year: '', month: '', q: '', loc: '', page: 1, per: 20, sel: {} },
    timer: null
  };

  /* ---------- date helpers ---------- */
  function ymdNow() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function dayNum(ymd) { var p = ymd.split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000); }
  function daysLeft(ymd) { return dayNum(ymd) - dayNum(S.today || ymdNow()); }
  function badgeFor(r) {
    if (r.dateWarn) return { cls: 'b-warn', t: 'ตรวจสอบวันที่' };
    var d = daysLeft(r.expiry);
    if (d < 0) return { cls: 'b-exp', t: 'หมดอายุแล้ว ' + (-d) + ' วัน' };
    if (d === 0) return { cls: 'b-exp', t: 'หมดอายุวันนี้' };
    if (d <= 30) return { cls: 'b-soon', t: 'อีก ' + d + ' วัน' };
    if (d <= 90) return { cls: 'b-mid', t: 'อีก ' + d + ' วัน' };
    return { cls: 'b-ok', t: 'อีก ' + d + ' วัน' };
  }
  function badge(r) { var b = badgeFor(r); return '<span class="badge ' + b.cls + '">' + b.t + '</span>'; }
  function byExpiry(a, b) { return a.expiry < b.expiry ? -1 : a.expiry > b.expiry ? 1 : a.name.localeCompare(b.name); }

  /* ---------- API ---------- */
  function api(action, payload) {
    var body = Object.assign({ action: action, token: S.token }, payload || {});
    var direct = /^https:\/\/script\.google(usercontent)?\.com/.test(CFG.API);
    return fetch(CFG.API, {
      method: 'POST', body: JSON.stringify(body),
      headers: { 'Content-Type': direct ? 'text/plain;charset=utf-8' : 'application/json' }
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok && (j.error === 'unauthorized' || j.error === 'session_expired')) { logout(true); throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'); }
      if (!j.ok && action !== 'login') throw new Error(j.error || 'เกิดข้อผิดพลาด');
      return j;
    });
  }

  function toast(msg, bad) {
    var el = document.createElement('div'); el.className = 'toast' + (bad ? ' err' : ''); el.textContent = msg;
    $('#toast').appendChild(el); setTimeout(function () { el.remove(); }, bad ? 6000 : 3500);
  }

  /* ---------- icons ---------- */
  var IC = {
    dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
    add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/><rect x="3" y="3" width="18" height="18" rx="3"/></svg>',
    report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
    pill: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 20.5a5 5 0 0 1-7-7l10-10a5 5 0 0 1 7 7z"/><path d="m8.5 8.5 7 7"/></svg>'
  };

  /* ---------- shell ---------- */
  var NAV = [
    { id: 'dashboard', label: 'แดชบอร์ด', ic: IC.dash },
    { id: 'entry', label: 'บันทึกรายการยาใกล้ Exp', ic: IC.add },
    { id: 'report', label: 'รายงานบัญชียาใกล้หมดอายุ', ic: IC.report },
    { id: 'alerts', label: 'แจ้งเตือน LINE', ic: IC.bell }
  ];

  function buildShell() {
    $('#nav').innerHTML = NAV.map(function (n) {
      return '<a class="nav-item" href="#/' + n.id + '" data-id="' + n.id + '">' + n.ic + '<span>' + n.label + '</span></a>';
    }).join('');
    $('#btn-menu').innerHTML = IC.menu; $('#btn-out').innerHTML = IC.out; $('.logo').innerHTML = IC.pill;
    syncAuth();
  }

  function syncAuth() {
    $('#user').textContent = S.token ? (S.user || 'admin') : '';
    $('#btn-out').hidden = !S.token; $('#btn-login').hidden = !!S.token;
  }
  function setConn(state, text) { var c = $('#conn'); c.className = 'conn ' + state; $('.txt', c).textContent = text; }
  function checkConn() {
    var t0 = Date.now();
    setConn('', 'กำลังตรวจสอบฐานข้อมูล…');
    return api('ping').then(function (j) {
      if (j.ok) setConn('ok', 'เชื่อมต่อฐานข้อมูลแล้ว · ' + (Date.now() - t0) + ' ms'); else setConn('bad', 'ฐานข้อมูลขัดข้อง');
      return j;
    }).catch(function () { setConn('bad', 'ขาดการเชื่อมต่อฐานข้อมูล'); });
  }

  function loadData(force) {
    if (!force && S.loaded && Date.now() - S.loaded < 30000) return Promise.resolve();
    return api('data').then(function (j) {
      S.rows = j.rows; S.options = j.options; S.today = j.today; S.alertDays = j.alertDays; S.loaded = Date.now();
      setConn('ok', 'เชื่อมต่อฐานข้อมูลแล้ว · ' + S.rows.length + ' รายการ');
    }).catch(function (e) { setConn('bad', 'ขาดการเชื่อมต่อฐานข้อมูล'); throw e; });
  }

  /* ---------- router ---------- */
  var PAGES = {};
  function route() {
    var id = (location.hash.replace('#/', '') || 'dashboard');
    if (!PAGES[id]) id = 'dashboard';
    $$('.nav-item').forEach(function (a) { a.classList.toggle('active', a.dataset.id === id); });
    document.body.classList.remove('open-side');
    var v = $('#view');
    v.innerHTML = '<div class="container"><div class="grid g4"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div></div>';
    loadData(false).then(function () { PAGES[id](v); window.scrollTo(0, 0); })
      .catch(function (e) { v.innerHTML = '<div class="container"><div class="card"><h2>โหลดข้อมูลไม่สำเร็จ</h2><p class="muted">' + esc(e.message) + '</p><button class="btn btn-primary" id="retry">ลองใหม่</button></div></div>'; $('#retry').onclick = route; });
  }

  /* ================= Dashboard ================= */
  PAGES.dashboard = function (v) {
    var R = S.rows.filter(function (r) { return !r.dateWarn; });
    var warn = S.rows.length - R.length;
    var exp = 0, d7 = 0, d30 = 0, d90 = 0;
    R.forEach(function (r) { var d = daysLeft(r.expiry); if (d < 0) exp++; else { if (d <= 7) d7++; if (d <= 30) d30++; else if (d <= 90) d90++; } });

    var t = S.today.split('-'), y0 = +t[0], m0 = +t[1] - 1, months = [];
    for (var i = 0; i < 12; i++) { var m = (m0 + i) % 12, y = y0 + Math.floor((m0 + i) / 12); months.push({ key: y + '-' + ('0' + (m + 1)).slice(-2), label: PR.TH_SHORT[m] + ' ' + String(y + 543).slice(2), n: 0 }); }
    R.forEach(function (r) { var k = r.expiry.slice(0, 7); months.forEach(function (mm) { if (mm.key === k) mm.n++; }); });
    var mx = Math.max.apply(null, months.map(function (m) { return m.n; }).concat([1]));

    var loc = {}; R.forEach(function (r) { if (daysLeft(r.expiry) >= 0) { var k = r.location || '(ไม่ระบุ)'; loc[k] = (loc[k] || 0) + 1; } });
    var locs = Object.keys(loc).sort(function (a, b) { return loc[b] - loc[a]; }).slice(0, 6), lmx = Math.max.apply(null, locs.map(function (k) { return loc[k]; }).concat([1]));

    var next = R.filter(function (r) { return daysLeft(r.expiry) >= 0; }).sort(byExpiry).slice(0, 10);

    v.innerHTML = '<div class="container stack">' +
      '<div class="page-head"><div><h1>แดชบอร์ด</h1><p>ภาพรวมยาใกล้หมดอายุ · ข้อมูล ณ ' + PR.thLong(S.today) + '</p></div><div class="spacer"></div>' +
      '<button class="btn btn-outline" id="d-refresh">' + IC.refresh + ' รีเฟรชข้อมูล</button></div>' +
      '<div class="grid g4">' +
      metric('danger', 'หมดอายุแล้ว', exp, 'รายการที่ควรนำออก') +
      metric('warn', 'หมดอายุภายใน 30 วัน', d30, 'ใน 7 วัน: ' + d7 + ' รายการ') +
      metric('info', 'หมดอายุใน 31–90 วัน', d90, 'วางแผนจัดการล่วงหน้า') +
      metric('neutral', 'รายการทั้งหมดในระบบ', S.rows.length, warn ? 'วันที่ผิดปกติ ' + warn + ' รายการ' : 'ข้อมูลวันที่ถูกต้องทั้งหมด') +
      '</div>' +
      '<div class="grid g2"><div class="card"><h2>จำนวนรายการหมดอายุรายเดือน</h2><p class="card-sub">12 เดือนข้างหน้า (เดือนปัจจุบันเป็นสีเข้ม)</p><div class="chart">' +
      months.map(function (m, i) { return '<div class="bar-col" title="' + m.label + ': ' + m.n + ' รายการ"><div class="bar-n">' + m.n + '</div><div class="bar' + (i === 0 ? ' cur' : '') + '" data-h="' + Math.round(m.n / mx * 100) + '" style="height:0"></div><div class="bar-l">' + m.label + '</div></div>'; }).join('') +
      '</div></div><div class="card"><h2>สถานที่จัดเก็บ</h2><p class="card-sub">รายการที่ยังไม่หมดอายุ แยกตามสถานที่</p>' +
      (locs.length ? locs.map(function (k) { return '<div class="hbar"><span title="' + esc(k) + '">' + esc(k) + '</span><div class="track"><div class="fill" style="width:' + Math.round(loc[k] / lmx * 100) + '%"></div></div><span>' + loc[k] + '</span></div>'; }).join('') : '<div class="empty">ไม่มีข้อมูล</div>') + '</div></div>' +
      '<div class="card"><h2>10 รายการที่ใกล้หมดอายุที่สุด</h2><p class="card-sub">เรียงตามวันหมดอายุ (ไม่รวมที่หมดอายุแล้ว)</p>' + tableHtml(next, false) + '</div></div>';

    requestAnimationFrame(function () { setTimeout(function () { $$('.bar', v).forEach(function (b) { b.style.height = b.dataset.h + '%'; }); }, 30); });
    $$('.val[data-n]', v).forEach(countUp);
    $('#d-refresh').onclick = function () { S.loaded = 0; route(); };
  };
  function metric(cls, lbl, n, note) { return '<div class="card metric ' + cls + '"><div class="lbl">' + lbl + '</div><div class="val" data-n="' + n + '">0</div><div class="note">' + note + '</div></div>'; }
  function countUp(el) {
    var n = +el.dataset.n, t0 = performance.now(), dur = 600;
    (function f(t) { var p = Math.min(1, (t - t0) / dur); el.textContent = Math.round(n * (1 - Math.pow(1 - p, 3))).toLocaleString('th-TH'); if (p < 1) requestAnimationFrame(f); })(t0);
  }
  function tableHtml(list, withSel) {
    if (!list.length) return '<div class="table-wrap"><div class="empty">ไม่พบรายการ</div></div>';
    return '<div class="table-wrap"><table><thead><tr>' + (withSel ? '<th style="width:36px"><input type="checkbox" id="sel-all" aria-label="เลือกทั้งหมดในหน้านี้"></th>' : '') +
      '<th>ชื่อยา</th><th class="num">จำนวน</th><th>วันหมดอายุ</th><th>สถานะ</th><th>Lot</th><th>สถานที่เก็บ</th></tr></thead><tbody>' +
      list.map(function (r) {
        return '<tr>' + (withSel ? '<td><input type="checkbox" class="sel" data-row="' + r.row + '"' + (S.rep.sel[r.row] ? ' checked' : '') + '></td>' : '') +
          '<td><b>' + esc(r.name) + '</b>' + (r.remark ? '<span class="sub">' + esc(r.remark) + '</span>' : '') + '</td><td class="num">' + esc(r.qty || '-') + '</td>' +
          '<td>' + (r.expiry ? PR.thShort(r.expiry) : '<span class="muted">-</span>') + '</td><td>' + badge(r) + '</td><td class="mono">' + esc(r.lot || '-') + '</td><td>' + esc(r.location || '-') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ================= Entry ================= */
  PAGES.entry = function (v) {
    var O = S.options, rec = localStorage.getItem('dea_recorder') || '';
    var recent = S.rows.slice().sort(function (a, b) { return b.row - a.row; }).slice(0, 8);
    v.innerHTML = '<div class="container"><div class="page-head"><div><h1>บันทึกรายการยาใกล้ Exp</h1><p>กรอกข้อมูลตามคอลัมน์ของตาราง Google Sheets · ระบบบันทึกวันเวลาให้อัตโนมัติ</p></div></div>' +
      '<div class="grid g2"><div class="card"><form id="f" autocomplete="off" novalidate><div id="f-err"></div><div class="form-grid">' +
      '<div class="field full"><label for="f-name">ชื่อยา <span class="req">*</span></label><input class="input" id="f-name" list="dl-names" placeholder="เช่น Paracetamol 500 mg tab" required><datalist id="dl-names">' + O.names.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist></div>' +
      '<div class="field"><label for="f-qty">จำนวน</label><input class="input" id="f-qty" placeholder="เช่น 10 กล่อง"></div>' +
      '<div class="field"><label for="f-exp">วันที่หมดอายุ <span class="req">*</span></label><input class="input" id="f-exp" type="date" required><span class="hint" id="f-exp-h"></span></div>' +
      '<div class="field"><label for="f-lot">Lot</label><input class="input" id="f-lot" placeholder="เลข Lot (ถ้ามี)"></div>' +
      '<div class="field"><label for="f-loc">Location</label>' + selectWithOther('f-loc', O.locations, '') + '</div>' +
      '<div class="field full"><label for="f-rem">Remark</label><textarea class="textarea" id="f-rem" placeholder="หมายเหตุ (ถ้ามี)"></textarea></div>' +
      '<div class="field full"><label for="f-rec">ผู้บันทึก</label>' + selectWithOther('f-rec', O.recorders, rec) + '</div>' +
      '</div><div style="display:flex;gap:12px"><button class="btn btn-primary" id="f-save" type="submit">บันทึกข้อมูล</button><button class="btn btn-outline" type="reset" id="f-reset">ล้างฟอร์ม</button></div></form></div>' +
      '<div class="card"><h2>บันทึกล่าสุด</h2><p class="card-sub">8 รายการล่าสุดในฐานข้อมูล</p><ul class="recent" id="recent">' + recentHtml(recent) + '</ul></div></div></div>';

    $$('select[data-other]', v).forEach(function (s) {
      s.onchange = function () { var o = $('#' + s.id + '-o'); o.hidden = s.value !== '__other'; if (!o.hidden) o.focus(); };
    });
    $('#f-exp').onchange = function () {
      var val = this.value, h = $('#f-exp-h'); if (!val) { h.textContent = ''; return; }
      var d = daysLeft(val); h.textContent = PR.thLong(val) + (d < 0 ? ' · หมดอายุแล้ว' : ' · อีก ' + d + ' วัน');
      h.style.color = d < 0 ? 'var(--danger)' : '';
    };
    $('#f').onsubmit = function (ev) {
      ev.preventDefault();
      var g = function (id) { var el = $('#' + id), o = $('#' + id + '-o'); return (el.value === '__other' && o) ? o.value.trim() : el.value.trim(); };
      var rec = { name: $('#f-name').value.trim(), qty: $('#f-qty').value.trim(), expiry: $('#f-exp').value, lot: $('#f-lot').value.trim(), location: g('f-loc'), remark: $('#f-rem').value.trim(), recorder: g('f-rec') };
      var err = $('#f-err'); err.innerHTML = '';
      if (!rec.name) return fail('กรุณากรอกชื่อยา');
      if (!rec.expiry) return fail('กรุณาเลือกวันที่หมดอายุ');
      if (+rec.expiry.slice(0, 4) > +S.today.slice(0, 4) + 15) return fail('ปีของวันที่หมดอายุผิดปกติ กรุณาตรวจสอบ');
      function fail(m) { err.innerHTML = '<div class="err">' + esc(m) + '</div>'; }
      var btn = $('#f-save'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> กำลังบันทึก…';
      api('add', { record: rec }).then(function () {
        if (rec.recorder) localStorage.setItem('dea_recorder', rec.recorder);
        toast('บันทึก "' + rec.name + '" เรียบร้อย'); S.loaded = 0;
        $('#f-name').value = ''; $('#f-qty').value = ''; $('#f-lot').value = ''; $('#f-rem').value = ''; $('#f-exp').value = ''; $('#f-exp-h').textContent = '';
        return loadData(true).then(function () { $('#recent').innerHTML = recentHtml(S.rows.slice().sort(function (a, b) { return b.row - a.row; }).slice(0, 8)); $('#f-name').focus(); });
      }).catch(function (e) { fail(e.message); toast(e.message, true); })
        .then(function () { btn.disabled = false; btn.textContent = 'บันทึกข้อมูล'; });
    };
  };
  function selectWithOther(id, list, sel) {
    var has = !sel || list.indexOf(sel) >= 0;
    return '<select class="select" id="' + id + '" data-other><option value="">— เลือก —</option>' + list.map(function (x) { return '<option' + (x === sel ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') +
      (has ? '' : '<option selected>' + esc(sel) + '</option>') + '<option value="__other">+ พิมพ์เอง…</option></select><input class="input" id="' + id + '-o" placeholder="พิมพ์ค่าใหม่" hidden style="margin-top:6px">';
  }
  function recentHtml(list) {
    return list.map(function (r) { return '<li><b>' + esc(r.name) + '</b><span class="muted">หมดอายุ ' + (r.expiry ? PR.thShort(r.expiry) : '-') + ' · ' + esc(r.qty || '-') + ' · ' + esc(r.location || '-') + '</span></li>'; }).join('') || '<li class="muted">ยังไม่มีข้อมูล</li>';
  }

  /* ================= Report ================= */
  function filtered() {
    var f = S.rep, q = f.q.toLowerCase();
    return S.rows.filter(function (r) {
      if (f.year && (!r.expiry || r.expiry.slice(0, 4) !== f.year)) return false;
      if (f.month && (!r.expiry || r.expiry.slice(5, 7) !== f.month)) return false;
      if (f.loc && r.location !== f.loc) return false;
      if (q && (r.name + ' ' + r.lot + ' ' + r.remark).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(byExpiry);
  }
  var repInit = false;
  PAGES.report = function (v) {
    var f = S.rep;
    if (!repInit) { f.year = S.today.slice(0, 4); f.month = S.today.slice(5, 7); repInit = true; }
    var years = {}; S.rows.forEach(function (r) { if (r.expiry && !r.dateWarn) years[r.expiry.slice(0, 4)] = 1; });
    years[S.today.slice(0, 4)] = 1;
    var yl = Object.keys(years).sort();
    v.innerHTML = '<div class="container"><div class="page-head"><div><h1>รายงานบัญชียาใกล้หมดอายุ</h1><p>กรองตามเดือน/ปีที่หมดอายุ แล้วส่งออกเป็น PDF (A4 แนวตั้ง)</p></div><div class="spacer"></div>' +
      '<button class="btn btn-primary" id="r-pdf">' + IC.pdf + ' ส่งออกรายงาน PDF</button></div>' +
      '<div class="toolbar"><div class="field"><label for="r-m">เดือนที่หมดอายุ</label><select class="select" id="r-m"><option value="">ทุกเดือน</option>' +
      PR.TH_MONTHS.map(function (m, i) { var k = ('0' + (i + 1)).slice(-2); return '<option value="' + k + '"' + (f.month === k ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="r-y">ปี (พ.ศ.)</label><select class="select" id="r-y"><option value="">ทุกปี</option>' + yl.map(function (y) { return '<option value="' + y + '"' + (f.year === y ? ' selected' : '') + '>' + (+y + 543) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="r-l">สถานที่เก็บ</label><select class="select" id="r-l"><option value="">ทั้งหมด</option>' + S.options.locations.map(function (l) { return '<option' + (f.loc === l ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field grow"><label for="r-q">ค้นหา</label><input class="input" id="r-q" placeholder="ชื่อยา / Lot / หมายเหตุ" value="' + esc(f.q) + '"></div></div>' +
      '<div id="r-body"></div></div>';
    $('#r-m').onchange = function () { f.month = this.value; f.page = 1; draw(); };
    $('#r-y').onchange = function () { f.year = this.value; f.page = 1; draw(); };
    $('#r-l').onchange = function () { f.loc = this.value; f.page = 1; draw(); };
    var tm; $('#r-q').oninput = function () { var val = this.value; clearTimeout(tm); tm = setTimeout(function () { f.q = val.trim(); f.page = 1; draw(); }, 200); };
    $('#r-pdf').onclick = exportPdf;
    draw();

    function draw() {
      var list = filtered(), pages = Math.max(1, Math.ceil(list.length / f.per)); if (f.page > pages) f.page = pages;
      var slice = list.slice((f.page - 1) * f.per, f.page * f.per), nsel = Object.keys(f.sel).length;
      $('#r-body').innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px"><span class="muted">พบ <b style="color:var(--fg)">' + list.length + '</b> รายการ' +
        (nsel ? ' · เลือกไว้ <b style="color:var(--primary)">' + nsel + '</b> รายการ (PDF จะออกเฉพาะที่เลือก)' : ' · PDF จะออกทุกรายการที่กรอง') + '</span>' +
        (nsel ? '<button class="btn btn-outline btn-sm" id="r-clr">ล้างการเลือก</button>' : '') + '</div>' + tableHtml(slice, true) +
        '<div class="pager"><span>หน้า ' + f.page + ' / ' + pages + '</span><div class="btns"><button class="btn btn-outline btn-sm" id="p-prev"' + (f.page <= 1 ? ' disabled' : '') + '>ก่อนหน้า</button><button class="btn btn-outline btn-sm" id="p-next"' + (f.page >= pages ? ' disabled' : '') + '>ถัดไป</button></div></div>';
      var all = $('#sel-all'); if (all) { all.checked = slice.length > 0 && slice.every(function (r) { return f.sel[r.row]; }); all.onchange = function () { slice.forEach(function (r) { if (all.checked) f.sel[r.row] = 1; else delete f.sel[r.row]; }); draw(); }; }
      $$('.sel').forEach(function (c) { c.onchange = function () { if (c.checked) f.sel[c.dataset.row] = 1; else delete f.sel[c.dataset.row]; draw(); }; });
      var clr = $('#r-clr'); if (clr) clr.onclick = function () { f.sel = {}; draw(); };
      $('#p-prev').onclick = function () { f.page--; draw(); }; $('#p-next').onclick = function () { f.page++; draw(); };
    }
  };

  var fontCache = null;
  function loadFonts() {
    if (fontCache) return fontCache;
    var b64 = function (url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error('โหลดฟอนต์ไม่สำเร็จ'); return r.arrayBuffer(); }).then(function (buf) { var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); }); };
    fontCache = Promise.all([b64('assets/fonts/Sarabun-Regular.ttf'), b64('assets/fonts/Sarabun-Bold.ttf')]).then(function (f) {
      return { vfs: { 'Sarabun-Regular.ttf': f[0], 'Sarabun-Bold.ttf': f[1] }, fonts: { Sarabun: { normal: 'Sarabun-Regular.ttf', bold: 'Sarabun-Bold.ttf', italics: 'Sarabun-Regular.ttf', bolditalics: 'Sarabun-Bold.ttf' } } };
    }).catch(function (e) { fontCache = null; throw e; });
    return fontCache;
  }
  function exportPdf() {
    var f = S.rep, list = filtered(), sel = Object.keys(f.sel), selectedOnly = sel.length > 0;
    if (selectedOnly) list = S.rows.filter(function (r) { return f.sel[r.row]; }).sort(byExpiry);
    if (!list.length) return toast('ไม่มีรายการสำหรับส่งออก', true);
    var period = 'ยาที่หมดอายุ' + (f.month ? 'ประจำเดือน' + PR.TH_MONTHS[+f.month - 1] : 'ทุกเดือน') + (f.year ? ' พ.ศ. ' + (+f.year + 543) : ' ทุกปี') + (f.loc ? ' · ' + f.loc : '');
    var btn = $('#r-pdf'), old = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span> กำลังสร้าง PDF…';
    loadFonts().then(function (F) {
      var def = PR.buildDocDefinition(list, { periodText: period, today: S.today, selectedOnly: selectedOnly });
      var name = 'บัญชียาใกล้หมดอายุ_' + (f.year ? +f.year + 543 : 'ทุกปี') + (f.month ? '-' + f.month : '') + '.pdf';
      return new Promise(function (res) { window.pdfMake.createPdf(def, null, F.fonts, F.vfs).download(name, res); });
    }).then(function () { toast('สร้างไฟล์ PDF เรียบร้อย'); }).catch(function (e) { toast('สร้าง PDF ไม่สำเร็จ: ' + e.message, true); })
      .then(function () { btn.disabled = false; btn.innerHTML = old; });
  }

  /* ================= Alerts ================= */
  PAGES.alerts = function (v) {
    if (!S.token) return loginView(v);
    alertsView(v);
  };
  function loginView(v) {
    v.innerHTML = '<div class="container"><div class="page-head"><div><h1>แจ้งเตือน LINE</h1><p>ส่วนนี้ใช้ทดสอบส่งข้อความเข้า LINE จึงต้องเข้าสู่ระบบก่อน</p></div></div>' +
      '<div class="login-card" style="margin:24px auto"><h1>เข้าสู่ระบบ</h1><p class="sub">สำหรับผู้ดูแลระบบ</p><div id="l-err"></div>' +
      '<form id="l-form"><div class="field"><label for="l-user">ชื่อผู้ใช้</label><input class="input" id="l-user" autocomplete="username" required></div>' +
      '<div class="field"><label for="l-pass">รหัสผ่าน</label><input class="input" id="l-pass" type="password" autocomplete="current-password" required></div>' +
      '<button class="btn btn-primary" id="l-btn" style="width:100%" type="submit">เข้าสู่ระบบ</button></form></div></div>';
    $('#l-user').focus();
    $('#l-form').onsubmit = function (e) {
      e.preventDefault(); var b = $('#l-btn'); b.disabled = true; b.innerHTML = '<span class="spin"></span> กำลังเข้าสู่ระบบ…'; $('#l-err').innerHTML = '';
      api('login', { username: $('#l-user').value.trim(), password: $('#l-pass').value }).then(function (j) {
        if (!j.ok) { $('#l-err').innerHTML = '<div class="err">' + (j.error === 'invalid_credentials' ? 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' : esc(j.error || 'เข้าสู่ระบบไม่สำเร็จ')) + '</div>'; return; }
        S.token = j.token; S.user = j.user; localStorage.setItem('dea_token', j.token); localStorage.setItem('dea_user', j.user); syncAuth(); alertsView(v);
      }).catch(function (e) { $('#l-err').innerHTML = '<div class="err">เชื่อมต่อเซิร์ฟเวอร์ไม่ได้: ' + esc(e.message) + '</div>'; })
        .then(function () { var bb = $('#l-btn'); if (bb) { bb.disabled = false; bb.textContent = 'เข้าสู่ระบบ'; } });
    };
  }
  function alertsView(v) {
    var days = S.alertDays, target = addDays(S.today, days);
    var daily = S.rows.filter(function (r) { return r.expiry === target && !r.dateWarn; }).sort(byExpiry);
    var ym = S.today.slice(0, 7);
    var monthly = S.rows.filter(function (r) { return r.expiry && r.expiry.slice(0, 7) === ym; }).sort(byExpiry);
    var mLabel = PR.TH_MONTHS[+ym.slice(5, 7) - 1] + ' ' + (+ym.slice(0, 4) + 543);
    v.innerHTML = '<div class="container"><div class="page-head"><div><h1>แจ้งเตือน LINE</h1><p>ตรวจสอบรายการที่ระบบจะส่งและทดสอบส่งเข้า LINE OA</p></div></div><div class="grid g2e">' +
      alertCard('daily', 'แจ้งเตือนก่อนหมดอายุ ' + days + ' วัน', 'ส่งอัตโนมัติทุกวัน 08:00 น. · รวมทุกรายการของวันเดียวกันใน 1 Flex card · ถ้าไม่มีรายการจะไม่ส่ง', 'ยาที่หมดอายุวันที่ ' + PR.thShort(target), daily) +
      alertCard('monthly', 'สรุปรายเดือน (ทุกวันที่ 1)', 'ส่งอัตโนมัติวันที่ 1 ของเดือน เวลา 08:05 น. ครั้งเดียวต่อเดือน · ถ้าไม่มีรายการจะส่งข้อความ "ไม่พบรายการยาใกล้หมดอายุในเดือน…"', 'ยาที่หมดอายุเดือน' + mLabel, monthly) +
      '</div><div class="card" style="margin-top:16px"><h2>การตั้งค่าระบบแจ้งเตือน</h2><p class="card-sub">ติดตั้ง trigger ครั้งเดียวใน Apps Script: เปิดไฟล์ Code.gs แล้วรันฟังก์ชัน <span class="mono">setupTriggers</span> · ประวัติการส่งดูได้ที่แท็บ <span class="mono">alert_log</span> ใน Google Sheets</p></div></div>';
    $$('[data-send]', v).forEach(function (b) {
      b.onclick = function () {
        var type = b.dataset.send;
        if (!confirm('ส่งข้อความทดสอบเข้า LINE จริงตอนนี้ใช่หรือไม่?')) return;
        var old = b.innerHTML; b.disabled = true; b.innerHTML = '<span class="spin"></span> กำลังส่ง…';
        api('sendAlert', { type: type }).then(function (j) { toast(j.sent ? 'ส่ง ' + j.count + ' รายการเข้า LINE แล้ว' : (j.note || 'ไม่มีรายการที่ต้องส่ง')); })
          .catch(function (e) { toast(e.message, true); }).then(function () { b.disabled = false; b.innerHTML = old; });
      };
    });
  }
  function alertCard(type, title, desc, label, items) {
    return '<div class="card"><h2>' + title + '</h2><p class="card-sub">' + desc + '</p><div class="alert-box"><b>' + label + '</b> · ' + items.length + ' รายการ' +
      (items.length ? '<ol>' + items.slice(0, 8).map(function (r) { return '<li>' + esc(r.name) + ' <span class="muted">(' + esc(r.qty || '-') + ')</span></li>'; }).join('') + (items.length > 8 ? '<li class="muted">… และอีก ' + (items.length - 8) + ' รายการ</li>' : '') + '</ol>' : '<div class="muted">ไม่มีรายการ — ' + (type === 'daily' ? 'วันนี้ระบบจะไม่ส่ง' : 'ระบบจะส่งข้อความแจ้งว่าไม่พบรายการ') + '</div>') + '</div>' +
      '<button class="btn btn-outline" data-send="' + type + '">' + IC.bell + ' ส่งทดสอบเข้า LINE</button></div>';
  }
  function addDays(ymd, n) { var p = ymd.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }

  /* ---------- boot ---------- */
  function showApp() {
    buildShell();
    if (!location.hash) location.hash = '#/dashboard';
    checkConn(); route();
    clearInterval(S.timer); S.timer = setInterval(function () { checkConn(); if (document.visibilityState === 'visible' && Date.now() - S.loaded > 300000) { S.loaded = 0; if (/dashboard|^$/.test(location.hash.replace('#/', ''))) route(); } }, 60000);
  }
  function logout(expired) {
    localStorage.removeItem('dea_token'); S.token = ''; syncAuth();
    if (expired) toast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', true); else toast('ออกจากระบบแล้ว');
    if (location.hash === '#/alerts') route();
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('#btn-out').onclick = function () { logout(false); };
    $('#btn-menu').onclick = function () { if (window.innerWidth <= 900) document.body.classList.toggle('open-side'); else document.body.classList.toggle('collapsed'); };
    $('.scrim').onclick = function () { document.body.classList.remove('open-side'); };
    window.addEventListener('hashchange', route);
    $('#btn-login').onclick = function () { location.hash = '#/alerts'; };
    showApp();
  });
})();
