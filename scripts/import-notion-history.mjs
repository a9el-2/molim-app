/**
 * سكريبت استيراد بيانات المتطوعين السابقة من Notion إلى قاعدة بيانات مُلَم
 *
 * المصدر: ملف CSV تصدير Notion
 * الهدف:
 *   1. مطابقة كل متطوع بـ access_code حقه في جدول users
 *   2. إضافة سجلات hours_logs باسم كل مجموعة مهام بالساعات المناسبة
 *
 * التشغيل:
 *   node scripts/import-notion-history.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

// ──────────────────────────────────────────────────────────────────
// 1. إعداد الاتصال بقاعدة البيانات
// ──────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');

const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/);
const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);

if (!urlMatch || !keyMatch) {
  console.error('❌ تعذّر إيجاد NEXT_PUBLIC_SUPABASE_URL أو SUPABASE_SERVICE_ROLE_KEY في .env.local');
  process.exit(1);
}

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

// ──────────────────────────────────────────────────────────────────
// 2. محلل CSV بسيط يتعامل مع الاقتباسات والأسطر المتعددة
// ──────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentField.trim());
      if (currentRow.some(c => c.length > 0)) rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }
  return rows;
}

function csvToObjects(rows) {
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
    return obj;
  });
}

// ──────────────────────────────────────────────────────────────────
// 3. تحويل التاريخ العربي إلى ISO (YYYY-MM-DD)
// ──────────────────────────────────────────────────────────────────
const ARABIC_MONTHS = {
  'يناير': '01', 'فبراير': '02', 'مارس': '03', 'أبريل': '04',
  'مايو': '05', 'يونيو': '06', 'يوليو': '07', 'أغسطس': '08',
  'سبتمبر': '09', 'أكتوبر': '10', 'نوفمبر': '11', 'ديسمبر': '12',
};

const ARABIC_DIGITS = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9' };

function arabicToLatin(str) {
  return str.split('').map(c => ARABIC_DIGITS[c] ?? c).join('');
}

function parseArabicDate(arabicDate) {
  if (!arabicDate) return null;
  const clean = arabicToLatin(arabicDate.trim());
  const parts = clean.split(/\s+/);
  if (parts.length !== 3) return null;
  const day = parts[0].padStart(2, '0');
  const month = ARABIC_MONTHS[parts[1]];
  const year = parts[2];
  if (!month) return null;
  return `${year}-${month}-${day}`;
}

// ──────────────────────────────────────────────────────────────────
// 4. تحويل access_code من Notion إلى link_code hash في جدول users
//    النظام يخزن hash(link_code) ولكن هنا نبحث في حقل id لأن
//    access_code قديم قد لا يطابق link_code الجديد.
//    لذا سنبحث عن المتطوع بالـ access_code كـ id مباشرة أو عبر email.
// ──────────────────────────────────────────────────────────────────

async function findUserByAccessCode(accessCode, email) {
  // المحاولة 1: البحث عبر الـ email (الأكثر موثوقية)
  if (email && email.includes('@')) {
    const { data } = await supabase
      .from('users')
      .select('id, first_name, last_name')
      .ilike('email', email.trim())
      .maybeSingle();
    if (data) return data;
  }

  // المحاولة 2: البحث بـ id مباشرة (إذا access_code = MOL-XXXXX)
  if (accessCode && accessCode.startsWith('MOL-')) {
    const { data } = await supabase
      .from('users')
      .select('id, first_name, last_name')
      .eq('id', accessCode.trim())
      .maybeSingle();
    if (data) return data;
  }

  return null;
}

// ──────────────────────────────────────────────────────────────────
// 5. الدالة الرئيسية للاستيراد
// ──────────────────────────────────────────────────────────────────
async function main() {
  // تحديد مسار ملف CSV
  const exportDir = process.argv[2];
  if (!exportDir) {
    console.error('❌ استخدام: node scripts/import-notion-history.mjs <مسار_مجلد_التصدير>');
    process.exit(1);
  }

  const allFiles = fs.readdirSync(exportDir).filter(f => f.endsWith('.csv'));
  const membersFile = allFiles.find(f => f.includes('مصدر بيانات جديد') && f.endsWith('_all.csv'))
                  || allFiles.find(f => f.includes('مصدر بيانات جديد'));

  if (!membersFile) {
    console.error('❌ لم يُعثر على ملف الأعضاء في:', exportDir);
    console.error('الملفات المتاحة:', allFiles);
    process.exit(1);
  }

  console.log('📂 ملف الأعضاء:', membersFile);

  const content = fs.readFileSync(path.join(exportDir, membersFile), 'utf8');
  const rows = parseCSV(content);
  const volunteers = csvToObjects(rows);

  console.log(`👥 إجمالي المتطوعين في Notion: ${volunteers.length}`);
  console.log('');

  const results = {
    matched: [],
    notFound: [],
    skipped: [],
    errors: [],
  };

  for (const vol of volunteers) {
    const accessCode  = (vol['access_code'] || '').trim();
    const email       = (vol['Email'] || '').trim();
    const name        = (vol['names'] || '').trim();
    const hoursRaw    = arabicToLatin((vol['hours'] || vol['عدد الساعات المنجزة (قديم)'] || '0').trim());
    const hours       = parseFloat(hoursRaw) || 0;
    const joinDate    = parseArabicDate(vol['join_date'] || '');
    const tasksText   = (vol['المهام الموحدة'] || '').trim();
    const state       = (vol['State'] || '').trim();

    if (!accessCode) {
      results.skipped.push({ name, reason: 'لا يوجد access_code' });
      continue;
    }

    if (hours <= 0) {
      results.skipped.push({ name, accessCode, reason: 'ساعات = 0' });
      continue;
    }

    process.stdout.write(`🔍 ${name} (${accessCode}) ... `);

    // البحث عن المستخدم في قاعدة البيانات
    const user = await findUserByAccessCode(accessCode, email);

    if (!user) {
      console.log('❓ غير موجود في النظام');
      results.notFound.push({ name, accessCode, email, hours });
      continue;
    }

    console.log(`✅ ${user.id} - ${user.first_name} ${user.last_name ?? ''}`);

    // التحقق من عدم وجود سجل استيراد سابق لهذا المستخدم
    const { data: existing } = await supabase
      .from('hours_logs')
      .select('id')
      .eq('user_id', user.id)
      .ilike('description', '%[استيراد Notion]%')
      .maybeSingle();

    if (existing) {
      console.log(`  ⏩ تم استيراد هذا المستخدم مسبقاً، تخطّي.`);
      results.skipped.push({ name, accessCode, userId: user.id, reason: 'مُستورد مسبقاً' });
      continue;
    }

    // بناء وصف تفصيلي للسجل
    const tasksList = tasksText
      ? tasksText.split(',').map(t => t.trim()).filter(Boolean).join('، ')
      : 'مهام متنوعة';

    // تحديد تاريخ العمل
    const workDate = joinDate ?? '2026-09-01';

    // قاعدة البيانات تحدد 24 ساعة كحد أقصى للسجل الواحد
    // لذا نقسم الساعات الكبيرة على دفعات متعددة (كل دفعة 24 ساعة كحد أقصى)
    const MAX_HOURS_PER_LOG = 24;
    let remainingHours = hours;
    let batchIndex = 1;
    const totalBatches = Math.ceil(hours / MAX_HOURS_PER_LOG);
    const insertedIds = [];
    let hasError = false;

    while (remainingHours > 0) {
      const batchHours = Math.min(remainingHours, MAX_HOURS_PER_LOG);
      const batchSuffix = totalBatches > 1 ? ` (دفعة ${batchIndex} من ${totalBatches})` : '';
      const description = `[استيراد Notion]${batchSuffix} ${hours} ساعة تطوعية مُنجَزة سابقاً.\nالمهام: ${tasksList}`;

      const { data: inserted, error } = await supabase
        .from('hours_logs')
        .insert({
          user_id:          user.id,
          department_id:    null,
          task_id:          null,
          submitted_hours:  batchHours,
          approved_hours:   batchHours,
          date:             workDate,
          description:      description,
          status:           'approved',
          is_self_approved: false,
          reviewed_by:      null,
          reviewed_at:      new Date().toISOString(),
          review_notes:     'تم الاعتماد تلقائياً عند الاستيراد من سجلات Notion السابقة.',
        })
        .select()
        .single();

      if (error) {
        console.error(`  ❌ خطأ في إدراج الدفعة ${batchIndex}:`, error.message);
        results.errors.push({ name, accessCode, userId: user.id, error: error.message });
        hasError = true;
        break;
      }

      insertedIds.push(inserted.id);
      remainingHours -= batchHours;
      batchIndex++;
    }

    if (!hasError) {
      console.log(`  ✅ تم إدراج ${hours} ساعة في ${totalBatches} سجل (IDs: ${insertedIds.join(', ')})`);
      results.matched.push({ name, accessCode, userId: user.id, hours, hoursLogIds: insertedIds });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 6. تقرير النتائج
  // ──────────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('📊 تقرير الاستيراد:');
  console.log('='.repeat(60));
  console.log(`✅ تم الاستيراد بنجاح: ${results.matched.length} متطوع`);
  results.matched.forEach(r =>
    console.log(`   • ${r.name} (${r.userId}): ${r.hours} ساعة`)
  );

  console.log(`\n❓ غير موجودين في النظام: ${results.notFound.length}`);
  results.notFound.forEach(r =>
    console.log(`   • ${r.name} | الكود: ${r.accessCode} | الإيميل: ${r.email} | الساعات: ${r.hours}`)
  );

  console.log(`\n⏩ تم التخطّي: ${results.skipped.length}`);
  results.skipped.forEach(r =>
    console.log(`   • ${r.name} | السبب: ${r.reason}`)
  );

  console.log(`\n❌ أخطاء: ${results.errors.length}`);
  results.errors.forEach(r =>
    console.log(`   • ${r.name}: ${r.error}`)
  );

  console.log('\n' + '='.repeat(60));
  console.log('✔️  انتهى الاستيراد.');

  // حفظ التقرير
  const reportPath = path.join(__dirname, '..', 'db', 'notion_import_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`📄 تقرير مفصّل حُفظ في: ${reportPath}`);
}

main().catch(err => {
  console.error('❌ خطأ غير متوقع:', err);
  process.exit(1);
});
