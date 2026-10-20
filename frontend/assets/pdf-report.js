/* สร้างเอกสารรายงานบัญชียาใกล้หมดอายุ — A4 แนวตั้ง รูปแบบหนังสือราชการ
   ขอบกระดาษ: ซ้าย 3 ซม. บน 2.5 ซม. ขวา 2 ซม. ล่าง 2 ซม. | ฟอนต์ Sarabun (ตระกูล TH Sarabun) */
(function (root) {
  var TH_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  var TH_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  var CM = 28.3465;

  function thShort(ymd) { if (!ymd) return '-'; var p = ymd.split('-'); return (+p[2]) + ' ' + TH_SHORT[+p[1] - 1] + ' ' + (+p[0] + 543); }
  function thLong(ymd) { var p = ymd.split('-'); return (+p[2]) + ' ' + TH_MONTHS[+p[1] - 1] + ' พ.ศ. ' + (+p[0] + 543); }
  function toThaiDigits(s) { return String(s).replace(/\d/g, function (d) { return '๐๑๒๓๔๕๖๗๘๙'[d]; }); }

  /**
   * @param rows  รายการ [{name, qty, expiry, lot, location, remark}] เรียงแล้ว
   * @param meta  {periodText, today, org, selectedOnly}
   */
  function buildDocDefinition(rows, meta) {
    meta = meta || {};
    var cell = function (t, opts) { return Object.assign({ text: t == null || t === '' ? '-' : String(t), fontSize: 13 }, opts || {}); };
    var head = ['ที่', 'รายการยา', 'จำนวน', 'วันหมดอายุ', 'Lot', 'สถานที่เก็บ'].map(function (h) {
      return { text: h, bold: true, alignment: 'center', fontSize: 13, fillColor: '#eeeeee', margin: [0, 2, 0, 2] };
    });
    var body = [head];
    rows.forEach(function (r, i) {
      body.push([
        cell(i + 1, { alignment: 'center' }),
        cell(r.name + (r.remark ? '\n(' + r.remark + ')' : '')),
        cell(r.qty, { alignment: 'center' }),
        cell(thShort(r.expiry), { alignment: 'center' }),
        cell(r.lot, { alignment: 'center' }),
        cell(r.location, { alignment: 'center' })
      ]);
    });
    if (!rows.length) body.push([{ text: 'ไม่พบรายการยาตามเงื่อนไขที่เลือก', colSpan: 6, alignment: 'center', fontSize: 14, margin: [0, 8, 0, 8] }, {}, {}, {}, {}, {}]);

    var content = [
      { text: 'บัญชีรายการยาใกล้หมดอายุ', alignment: 'center', bold: true, fontSize: 20, margin: [0, 0, 0, 2] },
      meta.org ? { text: meta.org, alignment: 'center', fontSize: 16 } : null,
      { text: meta.periodText || '', alignment: 'center', fontSize: 16, bold: true },
      {
        text: 'ข้อมูล ณ วันที่ ' + (meta.today ? thLong(meta.today) : '') + '   จำนวนรวม ' + rows.length + ' รายการ' + (meta.selectedOnly ? ' (เฉพาะรายการที่เลือก)' : ''),
        alignment: 'center', fontSize: 16, margin: [0, 0, 0, 12]
      },
      {
        table: { headerRows: 1, dontBreakRows: true, widths: [22, '*', 42, 74, 58, 82], body: body },
        layout: {
          hLineWidth: function () { return 0.6; }, vLineWidth: function () { return 0.6; },
          hLineColor: function () { return '#444444'; }, vLineColor: function () { return '#444444'; },
          paddingLeft: function () { return 3; }, paddingRight: function () { return 3; },
          paddingTop: function () { return 2; }, paddingBottom: function () { return 2; }
        }
      },
      {
        unbreakable: true, margin: [0, 28, 0, 0],
        columns: [
          { width: '*', alignment: 'center', stack: [{ text: 'ลงชื่อ ...................................... ผู้จัดทำ', fontSize: 16 }, { text: '(......................................)', fontSize: 16, margin: [0, 6, 0, 0] }] },
          { width: '*', alignment: 'center', stack: [{ text: 'ลงชื่อ ...................................... ผู้ตรวจสอบ', fontSize: 16 }, { text: '(......................................)', fontSize: 16, margin: [0, 6, 0, 0] }] }
        ]
      }
    ].filter(Boolean);

    return {
      pageSize: 'A4', pageOrientation: 'portrait',
      pageMargins: [3 * CM, 2.5 * CM, 2 * CM, 2 * CM],
      defaultStyle: { font: 'Sarabun', fontSize: 16, lineHeight: 1.0 },
      info: { title: 'บัญชีรายการยาใกล้หมดอายุ', author: 'DRUGS EXP ALERT' },
      footer: function (page, pages) {
        return { text: 'หน้า ' + page + ' / ' + pages, alignment: 'center', fontSize: 14, margin: [0, 10, 0, 0] };
      },
      content: content
    };
  }

  var api = { buildDocDefinition: buildDocDefinition, thShort: thShort, thLong: thLong, TH_MONTHS: TH_MONTHS, TH_SHORT: TH_SHORT, toThaiDigits: toThaiDigits };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PdfReport = api;
})(typeof window !== 'undefined' ? window : globalThis);
