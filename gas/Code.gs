/**
 * DRUGS EXP ALERT - Backend (Google Apps Script)
 * Script Properties ที่ต้องตั้ง: API_KEY, LINE_TOKEN, (ไม่บังคับ) LINE_TO
 * - LINE_TO ว่าง = broadcast ถึงทุกคนที่เพิ่มเพื่อน OA ; ใส่ userId/groupId = push เฉพาะ
 * Deploy: Web app / Execute as: Me / Who has access: Anyone
 */
const SHEET_ID = '1HlchDTgY3pjHWlJwd6Afl99QGvqofkeVRyf_CjkQFMY';
const SHEET_NAME = 'druglist';
const TZ = 'Asia/Bangkok';
const P = PropertiesService.getScriptProperties();
const TH_M = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

/* ---------- Helpers ---------- */
function sh_() { return SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function iso_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  const m = String(v || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
}
function thDate_(iso) { const [y, m, d] = iso.split('-'); return d + '/' + m + '/' + (+y + 543); }
function rows_() {
  const s = sh_(), n = s.getLastRow();
  if (n < 2) return [];
  return s.getRange(2, 1, n - 1, 8).getValues().map((r, i) => ({
    row: i + 2,
    ts: r[0] instanceof Date ? Utilities.formatDate(r[0], TZ, 'yyyy-MM-dd HH:mm:ss') : String(r[0]),
    name: String(r[1]).trim(), qty: String(r[2]).replace(/[^\d.]/g, ''), exp: iso_(r[3]),
    lot: String(r[4]), loc: String(r[5]), remark: String(r[6]), by: String(r[7])
  })).filter(r => r.name && r.exp).sort((a, b) => a.exp < b.exp ? -1 : 1);
}

/* ---------- Web API ---------- */
function doGet() { return json_({ ok: true, app: 'DRUGS EXP ALERT' }); }
function doPost(e) {
  try {
    const b = JSON.parse(e.postData.contents);
    if (b.key !== P.getProperty('API_KEY')) return json_({ ok: false, error: 'unauthorized' });
    if (b.action === 'ping') return json_({ ok: true, time: new Date().toISOString() });
    if (b.action === 'list') return json_({ ok: true, rows: rows_() });
    if (b.action === 'add') return json_(add_(b));
    if (b.action === 'pdf') return json_({ ok: true, base64: makePdf_(b.rows || [], b.title || '') });
    return json_({ ok: false, error: 'unknown action' });
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}
function add_(b) {
  const name = String(b.name || '').trim(), exp = iso_(b.exp);
  if (!name || !exp) return { ok: false, error: 'กรุณากรอกชื่อยาและวันที่หมดอายุ' };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const s = sh_();
    s.appendRow([new Date(), name, Number(b.qty) || 0, '', b.lot || '', b.loc || '', b.remark || '', b.by || '']);
    s.getRange(s.getLastRow(), 4).setNumberFormat('@').setValue(exp);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

/* ---------- PDF (Google Docs -> PDF, A4 portrait, Thai: Sarabun) ---------- */
function makePdf_(rows, title) {
  const FONT = 'Sarabun';
  const doc = DocumentApp.create('tmp-exp-' + Date.now()), b = doc.getBody();
  b.setPageWidth(595.28).setPageHeight(841.89).setMarginLeft(85).setMarginRight(57).setMarginTop(70).setMarginBottom(57);
  const A = DocumentApp.Attribute;
  const st = (size, bold) => ({ [A.FONT_FAMILY]: FONT, [A.FONT_SIZE]: size, [A.BOLD]: !!bold });
  b.clear();
  b.appendParagraph('บัญชีรายการยาใกล้หมดอายุ').setAlignment(DocumentApp.HorizontalAlignment.CENTER).setAttributes(st(20, true));
  b.appendParagraph(title).setAlignment(DocumentApp.HorizontalAlignment.CENTER).setAttributes(st(16, false));
  b.appendParagraph('');
  const data = [['ลำดับ', 'ชื่อยา', 'จำนวน', 'วันที่หมดอายุ', 'Lot', 'สถานที่เก็บ']]
    .concat(rows.map((r, i) => [String(i + 1), r.name, r.qty, thDate_(r.exp), r.lot || '-', r.loc || '-']));
  const t = b.appendTable(data);
  t.setAttributes(st(14, false));
  [38, 155, 45, 85, 52, 78].forEach((w, i) => t.setColumnWidth(i, w));
  const hdr = t.getRow(0);
  for (let c = 0; c < 6; c++) {
    const cell = hdr.getCell(c);
    cell.setBackgroundColor('#E7E6E6').setAttributes(st(14, true));
    cell.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  }
  b.appendParagraph('');
  b.appendParagraph('รวมทั้งสิ้น ' + rows.length + ' รายการ').setAttributes(st(16, false));
  b.appendParagraph('พิมพ์เมื่อ ' + thDate_(iso_(new Date())) + ' ' + Utilities.formatDate(new Date(), TZ, 'HH:mm') + ' น.').setAttributes(st(14, false));
  doc.saveAndClose();
  const f = DriveApp.getFileById(doc.getId());
  const b64 = Utilities.base64Encode(f.getAs('application/pdf').getBytes());
  f.setTrashed(true);
  return b64;
}

/* ---------- LINE Flex ---------- */
function line_(messages) {
  const to = (P.getProperty('LINE_TO') || '').trim();
  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/' + (to ? 'push' : 'broadcast'), {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + P.getProperty('LINE_TOKEN') },
    payload: JSON.stringify(to ? { to, messages } : { messages })
  });
  if (res.getResponseCode() !== 200) throw new Error('LINE ' + res.getResponseCode() + ' ' + res.getContentText());
}
function flex_(title, sub, items, color) {
  const chunks = [];
  for (let i = 0; i < items.length; i += 12) chunks.push(items.slice(i, i + 12));
  const bubbles = chunks.slice(0, 12).map((c, k) => ({
    type: 'bubble', size: 'mega',
    header: { type: 'box', layout: 'vertical', backgroundColor: color, paddingAll: '16px', contents: [
      { type: 'text', text: title, weight: 'bold', size: 'lg', color: '#FFFFFF', wrap: true },
      { type: 'text', text: sub + (chunks.length > 1 ? ' (' + (k + 1) + '/' + chunks.length + ')' : ''), size: 'sm', color: '#FFFFFF' }] },
    body: { type: 'box', layout: 'vertical', spacing: 'md', contents: c.reduce((a, r, i) => {
      if (i) a.push({ type: 'separator' });
      a.push({ type: 'box', layout: 'vertical', spacing: 'xs', contents: [
        { type: 'text', text: (i + 1 + k * 12) + '. ' + r.name, weight: 'bold', wrap: true, color: '#423D38' },
        { type: 'text', text: 'หมดอายุ ' + thDate_(r.exp) + '  |  จำนวน ' + (r.qty || '-'), size: 'sm', color: '#FE6E00', wrap: true },
        { type: 'text', text: 'Lot: ' + (r.lot || '-') + '  |  ' + (r.loc || '-'), size: 'xs', color: '#797067', wrap: true }] });
      return a;
    }, []) }
  }));
  return { type: 'flex', altText: title + ' ' + sub, contents: bubbles.length > 1 ? { type: 'carousel', contents: bubbles } : bubbles[0] };
}

/* ---------- Jobs ---------- */
function dailyJob() {
  const now = new Date();
  const tmr = iso_(new Date(now.getTime() + 864e5));
  const list = rows_().filter(r => r.exp === tmr);
  if (list.length) line_([flex_('⚠️ ยาหมดอายุพรุ่งนี้', thDate_(tmr) + ' • ' + list.length + ' รายการ', list, '#FB2C36')]);
  const ym = Utilities.formatDate(now, TZ, 'yyyy-MM');
  if (Utilities.formatDate(now, TZ, 'd') === '1' && P.getProperty('LAST_MONTHLY') !== ym) {
    monthlyJob_(ym); P.setProperty('LAST_MONTHLY', ym);
  }
}
function monthlyJob_(ym) {
  const [y, m] = ym.split('-'), label = TH_M[+m - 1] + ' ปี ' + (+y + 543);
  const list = rows_().filter(r => r.exp.slice(0, 7) === ym);
  line_([list.length
    ? flex_('📋 ยาหมดอายุประจำเดือน', label + ' • ' + list.length + ' รายการ', list, '#FE6E00')
    : { type: 'text', text: 'ไม่พบรายการยาใกล้หมดอายุในเดือน' + TH_M[+m - 1] + ' ปี ' + (+y + 543) }]);
}

/* ---------- Setup / Test (รันจาก editor) ---------- */
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dailyJob').timeBased().everyDays(1).atHour(8).inTimezone(TZ).create();
}
function testMonthly() { monthlyJob_(Utilities.formatDate(new Date(), TZ, 'yyyy-MM')); }
function testPdf() { Logger.log(makePdf_(rows_().slice(0, 5), 'ทดสอบ').length); }
