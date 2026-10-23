# DRUGS EXP ALERT

ระบบบันทึกรายการยาใกล้หมดอายุ + แจ้งเตือน LINE OA (Flex card)
**Database** Google Sheets · **Backend** Google Apps Script · **Frontend/Deploy** Vercel

```
apps-script/Code.gs, appsscript.json   ← backend + ตัวส่งแจ้งเตือน (trigger)
frontend/                              ← deploy ขึ้น Vercel (Root Directory = frontend)
  index.html, config.js, vercel.json
  api/gas.js                           ← proxy ไป Apps Script (ใช้ env GAS_URL)
  assets/ app.css, app.js, pdf-report.js, pdfmake.min.js, fonts/Sarabun-*.ttf
```

## 1) Backend (Google Apps Script)
1. เปิด Google Sheet ฐานข้อมูล → **ส่วนขยาย > Apps Script** (หรือสร้างโปรเจกต์ใหม่ที่ script.google.com)
2. วางเนื้อหา `Code.gs` และเปิด *Project Settings > Show appsscript.json* วางไฟล์ `appsscript.json`
3. รันฟังก์ชัน `selfTest` หนึ่งครั้ง → กดอนุญาตสิทธิ์ → ดู Log ว่า `line_token=OK target=OK`
4. รันฟังก์ชัน `setupTriggers` หนึ่งครั้ง → ตั้งเวลา: ทุกวัน 08:00 (แจ้งก่อนหมดอายุ) และ 08:05 (ตรวจวันที่ 1 ของเดือน → ส่งสรุปรายเดือน 1 ครั้ง)
5. **Deploy > New deployment > Web app** — Execute as: *Me*, Who has access: *Anyone* → คัดลอก URL ที่ลงท้าย `/exec`
   (แก้โค้ดภายหลังต้อง *Manage deployments > Edit > New version* ทุกครั้ง)

## 2) Frontend (Vercel)
1. อัปโฟลด์โฟลเดอร์ `frontend` ขึ้น Git แล้ว Import ใน Vercel (Framework: *Other*, ไม่ต้อง build) หรือใช้ `vercel --prod` ในโฟลเดอร์ `frontend`
2. Settings > Environment Variables: `GAS_URL` = URL `/exec` จากข้อ 1.5 แล้ว Redeploy

> หน้าแรก (แดชบอร์ด), บันทึกรายการ และรายงาน เปิดใช้ได้โดยไม่ต้อง login — เฉพาะเมนู "แจ้งเตือน LINE" (ทดสอบส่งไลน์) ที่ต้อง login

## 3) แท็บ settings ในชีต (ที่ระบบอ่าน)
`line_channel_access_token`, `line_user_or_group_id`, `alert_days` (ค่าเริ่มต้น 1), `username`, `password`
> แนะนำให้ย้ายค่าที่เป็นความลับไปไว้ที่ **Apps Script > Project Settings > Script Properties** (ใช้ชื่อ key เดียวกัน) —
> โค้ดจะอ่านจาก Script Properties ก่อนเสมอ แล้วลบค่าออกจากแท็บ settings และอย่าแชร์ชีตแบบ "ทุกคนที่มีลิงก์"

## กติกาการแจ้งเตือน
| ประเภท | เวลา | เงื่อนไข |
|---|---|---|
| ก่อนหมดอายุ | ทุกวัน 08:00 | ยาที่ `วันที่หมดอายุ = วันนี้ + alert_days` รวมทุกรายการใน Flex card เดียว (เกิน 25 รายการจะแบ่งหน้าเป็น carousel) · ไม่มีรายการ = ไม่ส่ง |
| สรุปรายเดือน | วันที่ 1 ของเดือน 08:05 | ยาทุกรายการที่หมดอายุในเดือนนั้น ส่งครั้งเดียว/เดือน · ไม่มี = ข้อความ "ไม่พบรายการยาใกล้หมดอายุในเดือน<เดือน> ปี <พ.ศ.>" |

ประวัติการส่งบันทึกที่แท็บ `alert_log` (สร้างอัตโนมัติ)

## หมายเหตุข้อมูล
- ระบบอ่านวันที่ได้หลายรูปแบบ: `2026-06-04`, `23/5/2027`, ปี พ.ศ. (`2570-12-11` → 2027-12-11)
- วันที่ที่ผิดปกติ (เช่น ปี 2070) จะถูกแสดงป้าย "ตรวจสอบวันที่" และไม่ถูกนับ/ไม่ถูกแจ้งเตือน → ควรแก้ในชีต
- จำนวนที่เป็น `\10` จะแสดงเป็น `10`
- PDF ใช้ฟอนต์ Sarabun (OFL) ขอบกระดาษแบบหนังสือราชการ (ซ้าย 3 / บน 2.5 / ขวา 2 / ล่าง 2 ซม.)
