// ค่าเริ่มต้น: เรียกผ่าน Vercel Serverless Function (/api/gas) ซึ่งซ่อน URL ของ Apps Script และเลี่ยงปัญหา CORS
// (ถ้าต้องการเรียก Apps Script ตรง ๆ ให้ใส่ URL /exec แทน เช่น API: 'https://script.google.com/macros/s/XXXX/exec')
window.APP_CONFIG = { API: 'https://script.google.com/macros/s/AKfycbyVMIm2JbDAEH4sC6RrSoatyoT3R3rbalzetS0LSWZ-8qzJYNYoP8mmPoGI9exStX_jlA/exec' };
