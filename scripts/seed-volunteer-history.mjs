/**
 * سكريبت إنشاء جدول volunteer_notion_history وتعبئته من ملف CSV
 *
 * التشغيل:
 *   node scripts/seed-volunteer-history.mjs <مسار_مجلد_التصدير>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/);
const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
if (!urlMatch || !keyMatch) { console.error('❌ متغيرات البيئة مفقودة'); process.exit(1); }
const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

// ── CSV Parser ───────────────────────────────────────────────────
function parseCSV(text) {
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i+1];
    if (c === '"') { if (inQ && n === '"') { field += '"'; i++; } else inQ = !inQ; }
    else if (c === ',' && !inQ) { row.push(field.trim()); field = ''; }
    else if ((c === '\r' || c === '\n') && !inQ) {
      if (c === '\r' && n === '\n') i++;
      row.push(field.trim());
      if (row.some(x => x)) rows.push(row);
      row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field.trim()); rows.push(row); }
  return rows;
}
function toObjects(rows) {
  const h = rows[0];
  return rows.slice(1).map(r => Object.fromEntries(h.map((k,i) => [k, r[i] ?? ''])));
}

// ── Arabic Date → ISO ────────────────────────────────────────────
const MONTHS = {'يناير':'01','فبراير':'02','مارس':'03','أبريل':'04','مايو':'05','يونيو':'06','يوليو':'07','أغسطس':'08','سبتمبر':'09','أكتوبر':'10','نوفمبر':'11','ديسمبر':'12'};
const AD = {'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'};
function al(s) { return s.split('').map(c => AD[c]??c).join(''); }
function parseDate(d) {
  if (!d) return null;
  const p = al(d.trim()).split(/\s+/);
  if (p.length !== 3) return null;
  const m = MONTHS[p[1]]; if (!m) return null;
  return `${p[2]}-${m}-${p[0].padStart(2,'0')}`;
}

// ── Extract access_codes from members field ─────────────────────
function extractCodes(field) {
  if (!field) return [];
  const matches = field.match(/[A-Za-z0-9#@-]{5,15}/g) || [];
  return [...new Set(matches)];
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  const exportDir = process.argv[2];
  if (!exportDir) { console.error('❌ استخدام: node scripts/seed-volunteer-history.mjs <مسار_مجلد>'); process.exit(1); }

  const files = fs.readdirSync(exportDir).filter(f => f.endsWith('.csv'));
  const membersFile = files.find(f => f.includes('مصدر بيانات جديد') && f.endsWith('_all.csv'));
  const tasksFile   = files.find(f => f.includes('molim_members') && f.endsWith('.csv'));
  if (!membersFile || !tasksFile) { console.error('❌ ملفات CSV مفقودة'); process.exit(1); }

  // قراءة ملف الأعضاء
  const membersRows = parseCSV(fs.readFileSync(path.join(exportDir, membersFile), 'utf8'));
  const volunteers  = toObjects(membersRows);

  // قراءة ملف المهام وبناء خريطة: access_code → [{title,hours,date,dept,description}]
  const tasksRows = parseCSV(fs.readFileSync(path.join(exportDir, tasksFile), 'utf8'));
  const tasks     = toObjects(tasksRows);

  // بناء خريطة: access_code → list of tasks
  const codeToTasks = {};
  for (const task of tasks) {
    const title      = (task['Name'] || '').trim();
    const hours      = parseFloat(al((task['الساعات المحسوبة']||'0').trim())) || 0;
    const dept       = (task['القسم / الفريق'] || '').trim();
    const desc       = (task['وصف المهمة'] || '').trim();
    const endDate    = parseDate(task['تاريخ الإنجاز'] || '');
    const startDate  = parseDate(task['تاريخ البدء'] || '');
    const status     = (task['حالة المهمة'] || '').trim();
    const members    = (task['أعضاء المهمة'] || '') + ' ' + (task['task_members (قديم)'] || '') + ' ' + (task['مدير الفريق / مدير المهمة'] || '');

    if (!title || status !== 'مكتملة' || hours <= 0) continue;

    const codes = extractCodes(members);
    for (const code of codes) {
      if (!codeToTasks[code]) codeToTasks[code] = [];
      // الساعات كاملة للمهمة لكل عضو مشارك فيها
      codeToTasks[code].push({
        title,
        hours,
        date: startDate ?? endDate ?? '2026-09-01',
        department: dept,
        description: desc
      });
    }
  }

  console.log(`👥 عدد المتطوعين: ${volunteers.length}`);
  console.log(`📋 عدد المهام المصنّفة: ${Object.values(codeToTasks).flat().length}`);

  // إدراج/تحديث كل متطوع في جدول volunteer_notion_history
  let inserted = 0, updated = 0, skipped = 0, errors = 0;

  for (const vol of volunteers) {
    const code       = (vol['access_code'] || '').trim();
    const name       = (vol['names'] || '').trim();
    const email      = (vol['Email'] || '').trim() || null;
    const hoursRaw   = parseFloat(al((vol['hours'] || vol['عدد الساعات المنجزة (قديم)'] || '0').trim())) || 0;
    const volTasks   = codeToTasks[code] || [];

    if (!code || !name) { skipped++; continue; }

    // إذا كانت الساعات صفر والمهام فارغة، نتخطى
    if (hoursRaw === 0 && volTasks.length === 0) { skipped++; continue; }

    process.stdout.write(`  ${name} (${code}) ... `);

    const { error } = await supabase
      .from('volunteer_notion_history')
      .upsert({
        access_code:  code,
        name,
        email,
        total_hours:  hoursRaw,
        tasks:        volTasks,
        claimed_by:   null, // تصفير أي مطالبة سابقة
        claimed_at:   null,
        updated_at:   new Date().toISOString(),
      }, { onConflict: 'access_code' });

    if (error) {
      console.log(`❌ ${error.message}`);
      errors++;
    } else {
      console.log(`✅ ${volTasks.length} مهمة، ${hoursRaw} ساعة`);
      inserted++;
    }
  }

  console.log('\n───────────────────────────────────────');
  console.log(`✨ اكتملت التعبئة:`);
  console.log(`   تم الحفظ: ${inserted}`);
  console.log(`   تخطي (بدون بيانات): ${skipped}`);
  console.log(`   أخطاء: ${errors}`);
}

main().catch(console.error);
