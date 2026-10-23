/**
 * DRUGS EXP ALERT — Backend (Google Apps Script)
 * Database : Google Sheets  (แท็บ druglist = ข้อมูลยา, settings = ตั้งค่า)
 * Frontend : Vercel (เรียกผ่าน /api/gas -> Web App URL นี้)
 * Alerts   : LINE Messaging API (Flex Message) ผ่าน Time-driven trigger
 */

// ====== CONFIG ======
var SPREADSHEET_ID = '1HlchDTgY3pjHWlJwd6Afl99QGvqofkeVRyf_CjkQFMY';
var DATA_SHEET     = 'druglist';
var SETTINGS_SHEET = 'settings';
var LOG_SHEET      = 'alert_log';
var TZ             = 'Asia/Bangkok';
var HEADERS        = ['Timestamp', 'ชื่อยา', 'จำนวน', 'วันที่หมดอายุ', 'Lot', 'Location', 'Remark', 'ผู้บันทึก'];
var TOKEN_TTL_MS   = 12 * 60 * 60 * 1000; // 12 ชั่วโมง
var FLEX_ITEMS_PER_BUBBLE = 25;

var TH_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                 'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
var TH_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

// ====== WEB APP ENTRY ======
function doGet(e) {
  return json_({ ok: true, service: 'DRUGS EXP ALERT', time: nowStr_() });
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, error: 'bad_json' }); }

  try {
    switch (body.action) {
      case 'ping':   return json_(apiPing_());
      case 'login':  return json_(apiLogin_(body));
      case 'data':   return json_(apiData_());
      case 'add':    return json_(apiAdd_(body.record || {}));
      case 'sendAlert': requireAuth_(body); return json_(apiSendAlert_(body));
      default:       return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ====== SHEET HELPERS ======
function ss_() { return SpreadsheetApp.openById(SPREADSHEET_ID); }

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('ไม่พบแท็บ "' + name + '"');
  return sh;
}

function nowStr_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function todayStr_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }

/** อ่านค่าตั้งค่า: Script Properties มาก่อน (ปลอดภัยกว่า) แล้วค่อยอ่านจากแท็บ settings */
function getSetting_(key) {
  var p = PropertiesService.getScriptProperties().getProperty(key);
  if (p) return String(p).trim();
  var rows = sheet_(SETTINGS_SHEET).getDataRange().getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === key) return String(rows[i][1] == null ? '' : rows[i][1]).trim();
  }
  return '';
}

/** แปลงวันที่ทุกรูปแบบเป็น yyyy-MM-dd (รองรับ Date, 2026-06-04, 23/5/2027, ปี พ.ศ.) คืน '' ถ้าอ่านไม่ได้ */
function parseDate_(v) {
  if (v === null || v === undefined || v === '') return '';
  var y, m, d;
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  }
  var s = String(v).trim(), a;
  if ((a = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) { y = +a[1]; m = +a[2]; d = +a[3]; }
  else if ((a = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/))) { d = +a[1]; m = +a[2]; y = +a[3]; }
  else return '';
  if (y > 2400) y -= 543; // ปี พ.ศ.
  if (m < 1 || m > 12 || d < 1 || d > 31) return '';
  var dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1) return '';
  return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
}

function cleanQty_(v) { return String(v == null ? '' : v).replace(/^\\+/, '').trim(); }

/** อ่านทุกแถวในแท็บ druglist แล้วทำให้เป็นรูปแบบมาตรฐาน */
function readRows_() {
  var sh = sheet_(DATA_SHEET);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, 8).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (!String(r[1]).trim() && !String(r[3]).trim()) continue; // ข้ามแถวว่าง
    var exp = parseDate_(r[3]);
    var yr = exp ? +exp.slice(0, 4) : 0;
    out.push({
      row: i + 2,
      timestamp: r[0] instanceof Date ? Utilities.formatDate(r[0], TZ, 'yyyy-MM-dd HH:mm:ss') : String(r[0]).trim(),
      name: String(r[1]).replace(/\s+/g, ' ').trim(),
      qty: cleanQty_(r[2]),
      expiry: exp,
      dateWarn: !exp || yr < 2000 || yr > new Date().getFullYear() + 15, // วันที่ว่าง/ผิดปกติ (เช่น 2070)
      lot: String(r[4]).trim(),
      location: String(r[5]).trim(),
      remark: String(r[6]).trim(),
      recorder: String(r[7]).replace(/\s+/g, ' ').trim()
    });
  }
  return out;
}

// ====== AUTH (token แบบ HMAC) ======
function secret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('_TOKEN_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('_TOKEN_SECRET', s); }
  return s;
}

function sign_(payload) {
  var sig = Utilities.computeHmacSha256Signature(payload, secret_());
  return Utilities.base64EncodeWebSafe(sig);
}

function makeToken_(user) {
  var payload = user + '|' + (Date.now() + TOKEN_TTL_MS);
  return Utilities.base64EncodeWebSafe(payload) + '.' + sign_(payload);
}

function requireAuth_(body) {
  var t = String(body.token || '').split('.');
  if (t.length !== 2) throw new Error('unauthorized');
  var payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(t[0])).getDataAsString();
  if (sign_(payload) !== t[1]) throw new Error('unauthorized');
  if (Date.now() > Number(payload.split('|')[1])) throw new Error('session_expired');
  return payload.split('|')[0];
}

function safeEq_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ====== API ======
function apiPing_() {
  var t0 = Date.now();
  var sh = sheet_(DATA_SHEET); // ถ้าเปิดฐานข้อมูลไม่ได้ จะ throw -> ฝั่งหน้าเว็บแสดง "ขาดการเชื่อมต่อ"
  return { ok: true, database: ss_().getName(), rows: Math.max(0, sh.getLastRow() - 1), serverMs: Date.now() - t0, time: nowStr_() };
}

function apiLogin_(b) {
  var u = getSetting_('username'), p = getSetting_('password');
  if (!u || !p) throw new Error('ยังไม่ได้ตั้งค่า username/password ในแท็บ settings');
  if (!(safeEq_(b.username || '', u) && safeEq_(b.password || '', p))) {
    Utilities.sleep(800);
    return { ok: false, error: 'invalid_credentials' };
  }
  return { ok: true, token: makeToken_(u), user: u };
}

function apiData_() {
  var rows = readRows_();
  var loc = {}, rec = {}, names = {};
  rows.forEach(function (r) {
    if (r.location) loc[r.location] = (loc[r.location] || 0) + 1;
    if (r.recorder) rec[r.recorder] = (rec[r.recorder] || 0) + 1;
    if (r.name) names[r.name] = 1;
  });
  var top = function (o) { return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }); };
  return {
    ok: true, today: todayStr_(), rows: rows,
    options: { locations: top(loc), recorders: top(rec), names: Object.keys(names).sort() },
    alertDays: Number(getSetting_('alert_days')) || 1
  };
}

function apiAdd_(r) {
  var name = String(r.name || '').trim();
  var exp = parseDate_(r.expiry);
  if (!name) throw new Error('กรุณากรอกชื่อยา');
  if (!exp) throw new Error('วันที่หมดอายุไม่ถูกต้อง');
  var yr = +exp.slice(0, 4);
  if (yr < 2000 || yr > new Date().getFullYear() + 15) throw new Error('ปีของวันที่หมดอายุผิดปกติ (' + yr + ')');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_(DATA_SHEET);
    var row = sh.getLastRow() + 1;
    var rng = sh.getRange(row, 1, 1, 8);
    rng.setNumberFormat('@'); // เก็บเป็นข้อความ กัน Sheets แปลงวันที่/จำนวนเอง
    rng.setValues([[nowStr_(), name, String(r.qty || '').trim(), exp, String(r.lot || '').trim(),
      String(r.location || '').trim(), String(r.remark || '').trim(), String(r.recorder || '').trim()]]);
    SpreadsheetApp.flush();
    return { ok: true, row: row };
  } finally { lock.releaseLock(); }
}

// ====== DATE HELPERS สำหรับแจ้งเตือน ======
function addDays_(ymd, n) {
  var p = ymd.split('-');
  var d = new Date(+p[0], +p[1] - 1, +p[2] + n);
  return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
}
function thDate_(ymd) { // 21 ต.ค. 2569
  var p = ymd.split('-');
  return (+p[2]) + ' ' + TH_MONTHS_SHORT[+p[1] - 1] + ' ' + (+p[0] + 543);
}
function sortByExpiry_(a, b) { return a.expiry < b.expiry ? -1 : a.expiry > b.expiry ? 1 : a.name.localeCompare(b.name); }

// ====== FLEX MESSAGE ======
function flexItemRow_(it, showDate) {
  var sub = [];
  if (it.qty) sub.push('จำนวน ' + it.qty);
  if (it.location) sub.push(it.location);
  if (it.lot) sub.push('Lot ' + it.lot);
  var box = {
    type: 'box', layout: 'vertical', spacing: 'xs', margin: 'md',
    contents: [
      { type: 'text', text: it.name || '-', weight: 'bold', size: 'sm', color: '#423d38', wrap: true }
    ]
  };
  if (showDate) box.contents.push({ type: 'text', text: 'หมดอายุ ' + thDate_(it.expiry), size: 'xs', color: '#fe6e00', weight: 'bold' });
  if (sub.length) box.contents.push({ type: 'text', text: sub.join(' · '), size: 'xs', color: '#797067', wrap: true });
  return box;
}

function flexBubble_(title, subtitle, items, showDate, pageInfo) {
  var body = [];
  items.forEach(function (it, i) {
    if (i > 0) body.push({ type: 'separator', margin: 'md', color: '#e3e0dd' });
    body.push(flexItemRow_(it, showDate));
  });
  var footer = 'รวม ' + pageInfo.total + ' รายการ' + (pageInfo.pages > 1 ? '  ·  หน้า ' + pageInfo.page + '/' + pageInfo.pages : '');
  return {
    type: 'bubble', size: 'mega',
    header: {
      type: 'box', layout: 'vertical', backgroundColor: '#fe6e00', paddingAll: '16px', spacing: 'xs',
      contents: [
        { type: 'text', text: '💊 ' + title, weight: 'bold', size: 'md', color: '#ffffff', wrap: true },
        { type: 'text', text: subtitle, size: 'xs', color: '#ffffff', wrap: true }
      ]
    },
    body: { type: 'box', layout: 'vertical', backgroundColor: '#fcfaf7', paddingAll: '16px', contents: body },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '10px', backgroundColor: '#fcfaf7',
      contents: [{ type: 'text', text: footer, size: 'xs', color: '#797067', align: 'center' }]
    }
  };
}

/** สร้างข้อความ Flex (รวมทุกรายการใน 1 card; ถ้าเกิน 25 รายการจะแบ่งเป็น carousel) */
function buildFlexMessages_(altText, title, subtitle, items, showDate) {
  var pages = [];
  for (var i = 0; i < items.length; i += FLEX_ITEMS_PER_BUBBLE) pages.push(items.slice(i, i + FLEX_ITEMS_PER_BUBBLE));
  var bubbles = pages.map(function (p, idx) {
    return flexBubble_(title, subtitle, p, showDate, { total: items.length, page: idx + 1, pages: pages.length });
  });
  var messages = [];
  for (var j = 0; j < bubbles.length; j += 12) { // carousel สูงสุด 12 bubble
    var chunk = bubbles.slice(j, j + 12);
    messages.push({
      type: 'flex', altText: altText,
      contents: chunk.length === 1 ? chunk[0] : { type: 'carousel', contents: chunk }
    });
  }
  return messages.slice(0, 5); // push สูงสุด 5 ข้อความ/ครั้ง
}

// ====== LINE PUSH ======
function linePush_(messages) {
  var token = getSetting_('line_channel_access_token');
  var to = getSetting_('line_user_or_group_id');
  if (!token || !to) throw new Error('ยังไม่ได้ตั้งค่า line_channel_access_token / line_user_or_group_id');
  var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ to: to, messages: messages })
  });
  var code = res.getResponseCode();
  if (code !== 200) throw new Error('LINE API ' + code + ': ' + res.getContentText());
  return code;
}

function log_(type, count, status, detail) {
  try {
    var s = ss_(), sh = s.getSheetByName(LOG_SHEET);
    if (!sh) { sh = s.insertSheet(LOG_SHEET); sh.appendRow(['เวลา', 'ประเภท', 'จำนวนรายการ', 'สถานะ', 'รายละเอียด']); sh.setFrozenRows(1); }
    sh.appendRow([nowStr_(), type, count, status, String(detail || '').slice(0, 500)]);
  } catch (e) { /* ไม่ให้ log ทำให้งานหลักล้ม */ }
}

// ====== ALERT 1: แจ้งเตือนก่อนหมดอายุ N วัน (ค่าเริ่มต้น 1 วัน) ======
function buildDailyMessages_(rows, days) {
  var target = addDays_(todayStr_(), days);
  var items = rows.filter(function (r) { return r.expiry === target; }).sort(sortByExpiry_);
  if (!items.length) return { items: items, messages: [] };
  var when = days === 1 ? 'พรุ่งนี้' : 'อีก ' + days + ' วัน';
  return {
    items: items,
    messages: buildFlexMessages_('แจ้งเตือนยาหมดอายุ ' + when + ' (' + items.length + ' รายการ)',
      'ยาใกล้หมดอายุ (อีก ' + days + ' วัน)', when + ' · ' + thDate_(target), items, false)
  };
}

function runDailyAlert() {
  var days = Number(getSetting_('alert_days')) || 1;
  var b = buildDailyMessages_(readRows_(), days);
  if (!b.items.length) { log_('daily', 0, 'ข้าม', 'ไม่มียาหมดอายุวันที่ ' + addDays_(todayStr_(), days)); return { sent: false, count: 0 }; }
  try { linePush_(b.messages); log_('daily', b.items.length, 'สำเร็จ', ''); return { sent: true, count: b.items.length }; }
  catch (e) { log_('daily', b.items.length, 'ผิดพลาด', e.message); throw e; }
}

// ====== ALERT 2: สรุปประจำเดือน (ทุกวันที่ 1 ส่งครั้งเดียว) ======
function buildMonthlyMessages_(rows, ym) {
  var items = rows.filter(function (r) { return r.expiry && r.expiry.slice(0, 7) === ym; }).sort(sortByExpiry_);
  var y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  var label = TH_MONTHS[m - 1] + ' ' + (y + 543);
  if (!items.length) {
    return { items: items, messages: [{ type: 'text', text: 'ไม่พบรายการยาใกล้หมดอายุในเดือน' + TH_MONTHS[m - 1] + ' ปี ' + (y + 543) }] };
  }
  return {
    items: items,
    messages: buildFlexMessages_('สรุปยาหมดอายุเดือน' + label + ' (' + items.length + ' รายการ)',
      'ยาหมดอายุประจำเดือน', 'เดือน' + label, items, true)
  };
}

/** @param force true = ข้ามเงื่อนไข "วันที่ 1" และกันส่งซ้ำ (ใช้ทดสอบ) */
function runMonthlyAlert(force) {
  var today = todayStr_();
  var ym = today.slice(0, 7);
  var props = PropertiesService.getScriptProperties();
  if (force !== true) {
    if (today.slice(8, 10) !== '01') return { sent: false, reason: 'ไม่ใช่วันที่ 1' };
    if (props.getProperty('_LAST_MONTHLY') === ym) return { sent: false, reason: 'ส่งแล้วในเดือนนี้' };
  }
  var b = buildMonthlyMessages_(readRows_(), ym);
  try {
    linePush_(b.messages);
    if (force !== true) props.setProperty('_LAST_MONTHLY', ym);
    log_('monthly', b.items.length, 'สำเร็จ', force === true ? 'ทดสอบ' : '');
    return { sent: true, count: b.items.length };
  } catch (e) { log_('monthly', b.items.length, 'ผิดพลาด', e.message); throw e; }
}

/** ใช้จากหน้าเว็บ: ทดสอบ/ดูตัวอย่างข้อความ (preview=true จะไม่ส่งจริง) */
function apiSendAlert_(b) {
  var rows = readRows_();
  var days = Number(getSetting_('alert_days')) || 1;
  var built;
  if (b.type === 'daily') built = buildDailyMessages_(rows, days);
  else if (b.type === 'monthly') built = buildMonthlyMessages_(rows, todayStr_().slice(0, 7));
  else throw new Error('type ไม่ถูกต้อง');
  if (!built.messages.length) return { ok: true, sent: false, count: 0, note: 'ไม่มีรายการที่ต้องแจ้งเตือน (ระบบจะไม่ส่ง)' };
  if (b.preview) return { ok: true, sent: false, count: built.items.length, preview: built.messages };
  linePush_(built.messages);
  log_(b.type, built.items.length, 'สำเร็จ', 'ส่งทดสอบจากหน้าเว็บ');
  return { ok: true, sent: true, count: built.items.length };
}

// ====== ติดตั้ง TRIGGER (รันฟังก์ชันนี้ครั้งเดียวจากตัวแก้ไข Apps Script) ======
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'runDailyAlert' || f === 'runMonthlyAlertTrigger') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runDailyAlert').timeBased().atHour(8).nearMinute(0).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('runMonthlyAlertTrigger').timeBased().atHour(8).nearMinute(5).everyDays(1).inTimezone(TZ).create();
  Logger.log('ตั้งเวลาแล้ว: ทุกวัน 08:00 (ก่อนหมดอายุ) และ 08:05 (ตรวจวันที่ 1 ของเดือน)');
}
function runMonthlyAlertTrigger() { runMonthlyAlert(false); } // trigger ส่งอาร์กิวเมนต์เป็น event จึงต้องมีตัวห่อ

/** ทดสอบจากตัวแก้ไข: ตรวจสอบสิทธิ์ครั้งแรก + ตรวจค่าตั้งค่า */
function selfTest() {
  Logger.log(JSON.stringify(apiPing_()));
  Logger.log('rows=' + readRows_().length + ' line_token=' + (getSetting_('line_channel_access_token') ? 'OK' : 'MISSING') +
    ' target=' + (getSetting_('line_user_or_group_id') ? 'OK' : 'MISSING'));
}
