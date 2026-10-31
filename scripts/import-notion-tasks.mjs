/**
 * سكريبت استيراد المهام السابقة من Notion إلى قاعدة بيانات مُلَم
 *
 * لكل مهمة مكتملة من Notion:
 *   1. ننشئ سجل في جدول tasks (lifecycle_status='completed', status='completed')
 *   2. لكل عضو شارك في المهمة: ننشئ task_assignment بحالة submitted (الوحيدة المسموحة مباشرة)
 *      ثم نُحدّثها إلى approved عبر update مباشر (service_role)
 *   3. ننشئ سجل hours_log مرتبط بالمهمة والتكليف
 *
 * التشغيل:
 *   node scripts/import-notion-tasks.mjs <مسار_مجلد_التصدير>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');

const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/);
const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
if (!urlMatch || !keyMatch) {
  console.error('❌ تعذّر إيجاد متغيرات البيئة في .env.local');
  process.exit(1);
}

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

// ──────────────────────────────────────────────────────────────────
// CSV Parser
// ──────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const rows = [];
  let currentRow = [], currentField = '', insideQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i], nextChar = text[i + 1];
    if (char === '"') {
      if (insideQuotes && nextChar === '"') { currentField += '"'; i++; }
      else insideQuotes = !insideQuotes;
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentField.trim()); currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentField.trim());
      if (currentRow.some(c => c.length > 0)) rows.push(currentRow);
      currentRow = []; currentField = '';
    } else currentField += char;
  }
  if (currentField || currentRow.length > 0) { currentRow.push(currentField.trim()); rows.push(currentRow); }
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
// تحويل التاريخ العربي → ISO
// ──────────────────────────────────────────────────────────────────
const ARABIC_MONTHS = {
  'يناير':'01','فبراير':'02','مارس':'03','أبريل':'04',
  'مايو':'05','يونيو':'06','يوليو':'07','أغسطس':'08',
  'سبتمبر':'09','أكتوبر':'10','نوفمبر':'11','ديسمبر':'12',
};
const ARABIC_DIGITS = {'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'};
function arabicToLatin(s) { return s.split('').map(c => ARABIC_DIGITS[c] ?? c).join(''); }
function parseArabicDate(d) {
  if (!d) return null;
  const parts = arabicToLatin(d.trim()).split(/\s+/);
  if (parts.length !== 3) return null;
  const month = ARABIC_MONTHS[parts[1]];
  if (!month) return null;
  return `${parts[2]}-${month}-${parts[0].padStart(2,'0')}`;
}

// ──────────────────────────────────────────────────────────────────
// استخراج access_codes من حقل "أعضاء المهمة" في Notion
// الصيغة: "CODE1 (link1), CODE2 (link2), ..."
// ──────────────────────────────────────────────────────────────────
function extractAccessCodes(membersField) {
  if (!membersField) return [];
  // كل عنصر: "1wDx56cP4 (url...)" أو "1wDx56cP4 (url...), ..."
  const codes = [];
  // نبحث عن النمط: كلمة متبوعة بمسافة ثم قوس
  const regex = /([^\s,]+)\s+\(/g;
  let match;
  while ((match = regex.exec(membersField)) !== null) {
    codes.push(match[1].trim());
  }
  return [...new Set(codes)];
}

// ──────────────────────────────────────────────────────────────────
// ربط access_code بـ user_id في قاعدة البيانات
// الكاش لتجنب الاستعلام مرات متعددة
// ──────────────────────────────────────────────────────────────────
const userCache = {};

async function findUserByEmail(email) {
  if (!email || !email.includes('@')) return null;
  if (userCache[email] !== undefined) return userCache[email];
  const { data } = await supabase.from('users').select('id').ilike('email', email.trim()).maybeSingle();
  userCache[email] = data?.id ?? null;
  return userCache[email];
}

// ──────────────────────────────────────────────────────────────────
// بناء خريطة access_code → user_id من ملف الأعضاء
// ──────────────────────────────────────────────────────────────────
async function buildAccessCodeMap(membersFile, exportDir) {
  const content = fs.readFileSync(path.join(exportDir, membersFile), 'utf8');
  const rows = parseCSV(content);
  const volunteers = csvToObjects(rows);

  const map = {}; // access_code → user_id (قد يكون null إذا لم يُوجد)
  for (const vol of volunteers) {
    const code = (vol['access_code'] || '').trim();
    const email = (vol['Email'] || '').trim();
    if (!code) continue;
    const userId = await findUserByEmail(email);
    map[code] = userId; // null = غير موجود في النظام بعد
  }
  return map;
}

// ──────────────────────────────────────────────────────────────────
// بناء خريطة اسم القسم → id
// ──────────────────────────────────────────────────────────────────
async function buildDeptMap() {
  const { data: depts } = await supabase.from('departments').select('id, name');
  const map = {};
  for (const d of depts ?? []) {
    map[d.name.trim()] = d.id;
    // اسم مختصر
    if (d.name.includes('الدعم')) map['الدعم'] = d.id;
    if (d.name.includes('التصميم')) map['التصميم'] = d.id;
    if (d.name.includes('الإدارة العامة')) map['قسم الادارة العامة'] = d.id;
    if (d.name.includes('الكتابة')) map['قسم الكتابة والتحرير'] = d.id;
    if (d.name.includes('البرمجة')) map['البرمجة'] = d.id;
    if (d.name.includes('المونتاج')) map['المونتاج'] = d.id;
    if (d.name.includes('الإعلام')) map['الإعلام'] = d.id;
    if (d.name.includes('البحث')) map['البحث'] = d.id;
  }
  // أسماء شائعة في Notion
  map['قسم الدعم'] = map['الدعم'] ?? null;
  map['قسم التصميم'] = map['التصميم'] ?? null;
  map['قسم التطوير'] = map['التطوير'] ?? null;
  return map;
}

// ──────────────────────────────────────────────────────────────────
// الدالة الرئيسية
// ──────────────────────────────────────────────────────────────────
async function main() {
  const exportDir = process.argv[2];
  if (!exportDir) {
    console.error('❌ استخدام: node scripts/import-notion-tasks.mjs <مسار_مجلد_التصدير>');
    process.exit(1);
  }

  const allFiles = fs.readdirSync(exportDir).filter(f => f.endsWith('.csv'));
  const tasksFile  = allFiles.find(f => f.includes('molim_members') && f.endsWith('.csv'));
  const membersFile = allFiles.find(f => f.includes('مصدر بيانات جديد') && f.endsWith('_all.csv'))
                   || allFiles.find(f => f.includes('مصدر بيانات جديد'));

  if (!tasksFile || !membersFile) {
    console.error('❌ لم يُعثر على ملفات CSV اللازمة. الملفات:', allFiles);
    process.exit(1);
  }

  console.log('📂 ملف المهام:', tasksFile);
  console.log('📂 ملف الأعضاء:', membersFile);
  console.log('⏳ بناء خريطة الأعضاء...');
  const accessCodeMap = await buildAccessCodeMap(membersFile, exportDir);
  console.log(`✅ خريطة الأعضاء: ${Object.keys(accessCodeMap).length} عضو`);

  console.log('⏳ بناء خريطة الأقسام...');
  const deptMap = await buildDeptMap();

  // قراءة المستخدم الافتراضي الذي سيُنشئ المهام (SUPER_ADMIN)
  const { data: adminUser } = await supabase.from('users').select('id').eq('role','SUPER_ADMIN').maybeSingle();
  const adminId = adminUser?.id ?? 'MOL-00001';
  console.log('👤 منشئ المهام الافتراضي:', adminId);

  // قراءة ملف المهام
  const tasksContent = fs.readFileSync(path.join(exportDir, tasksFile), 'utf8');
  const tasksRows = parseCSV(tasksContent);
  const tasks = csvToObjects(tasksRows);
  console.log(`\n📋 إجمالي المهام في Notion: ${tasks.length}`);

  const results = { imported: [], skipped: [], errors: [] };
  const MAX_HOURS_PER_LOG = 24;

  for (const task of tasks) {
    const title        = (task['Name'] || '').trim();
    const description  = (task['وصف المهمة'] || '').trim() || null;
    const hoursRaw     = arabicToLatin((task['الساعات المحسوبة'] || '0').trim());
    const totalHours   = parseFloat(hoursRaw) || 0;
    const deptNameRaw  = (task['القسم / الفريق'] || '').trim();
    const endDateRaw   = task['تاريخ الإنجاز'] || '';
    const startDateRaw = task['تاريخ البدء'] || '';
    const statusRaw    = (task['حالة المهمة'] || '').trim();
    const membersField = task['أعضاء المهمة'] || '';

    if (!title) { results.skipped.push({ title: '(بلا عنوان)', reason: 'عنوان فارغ' }); continue; }
    if (statusRaw !== 'مكتملة') { results.skipped.push({ title, reason: `حالة: ${statusRaw}` }); continue; }
    if (totalHours <= 0) { results.skipped.push({ title, reason: 'ساعات = 0' }); continue; }

    const endDate   = parseArabicDate(endDateRaw);
    const startDate = parseArabicDate(startDateRaw) ?? endDate ?? '2026-09-01';
    const deptId    = deptMap[deptNameRaw] ?? null;

    // استخراج المشاركين من الحقل
    const memberCodes = extractAccessCodes(membersField);
    // فلترة من عندهم حسابات في النظام
    const memberUserIds = memberCodes
      .map(code => accessCodeMap[code])
      .filter(uid => uid != null);

    process.stdout.write(`\n📌 ${title} (${totalHours}س, ${memberUserIds.length}/${memberCodes.length} أعضاء) ... `);

    // ── 1. إنشاء سجل المهمة ──────────────────────────────────────
    const { data: newTask, error: taskErr } = await supabase
      .from('tasks')
      .insert({
        title,
        description,
        target_type: memberUserIds.length === 1 ? 'person' : (deptId ? 'department' : 'all_departments'),
        target_user_id: memberUserIds.length === 1 ? memberUserIds[0] : null,
        target_department_ids: deptId ? [deptId] : [],
        department_id: deptId,
        status: 'completed',
        lifecycle_status: 'completed',
        priority: 'normal',
        required_assignees: memberUserIds.length || 1,
        requested_hours: Math.min(totalHours, MAX_HOURS_PER_LOG),
        due_date: endDate,
        created_by: adminId,
        assigned_to: memberUserIds[0] ?? adminId,
        closed_at: endDate ? new Date(endDate).toISOString() : new Date().toISOString(),
      })
      .select('id')
      .single();

    if (taskErr) {
      console.log(`❌ خطأ في إنشاء المهمة: ${taskErr.message}`);
      results.errors.push({ title, error: taskErr.message });
      continue;
    }

    const taskId = newTask.id;
    console.log(`✅ task=${taskId}`);

    // ── 2. إنشاء تكليف + ساعات لكل عضو ──────────────────────────
    // توزيع الساعات على الأعضاء بالتساوي
    const membersCount = memberUserIds.length || 1;
    const hoursPerMember = Math.round((totalHours / membersCount) * 10) / 10;
    const usersToProcess = memberUserIds.length > 0 ? memberUserIds : [adminId];

    for (const userId of usersToProcess) {
      const memberHours = memberUserIds.length > 0 ? hoursPerMember : totalHours;

      // أ. إنشاء سجل ساعات (بدفعات إذا > 24)
      let remainingHours = memberHours;
      let batchIdx = 1;
      const totalBatches = Math.ceil(memberHours / MAX_HOURS_PER_LOG);
      let firstHoursLogId = null;
      let hoursImportOk = true;

      while (remainingHours > 0) {
        const batchHours = Math.min(remainingHours, MAX_HOURS_PER_LOG);
        const suffix = totalBatches > 1 ? ` (${batchIdx}/${totalBatches})` : '';
        const { data: log, error: logErr } = await supabase
          .from('hours_logs')
          .insert({
            user_id: userId,
            department_id: deptId,
            task_id: taskId,
            submitted_hours: batchHours,
            approved_hours: batchHours,
            date: startDate,
            description: `[إنجاز مهمة: ${title}]${suffix}`,
            status: 'approved',
            is_self_approved: false,
            reviewed_by: adminId,
            reviewed_at: new Date().toISOString(),
            review_notes: 'مُستورد من سجلات Notion السابقة',
          })
          .select('id')
          .single();

        if (logErr) {
          console.log(`  ⚠️ خطأ ساعات للمستخدم ${userId}: ${logErr.message}`);
          hoursImportOk = false;
          break;
        }
        if (!firstHoursLogId) firstHoursLogId = log.id;
        remainingHours -= batchHours;
        batchIdx++;
      }

      if (!hoursImportOk) continue;

      // ب. إنشاء تكليف بحالة submitted أولاً
      const now = new Date().toISOString();
      const { data: assignment, error: taErr } = await supabase
        .from('task_assignments')
        .insert({
          task_id: taskId,
          user_id: userId,
          status: 'submitted',
          offered_by: adminId,
          accepted_at: now,
          submitted_at: now,
        })
        .select('id')
        .single();

      if (taErr) {
        console.log(`  ⚠️ خطأ تكليف للمستخدم ${userId}: ${taErr.message}`);
        continue;
      }

      // ج. تحديث التكليف إلى approved مع ربط hours_log
      const { error: updateErr } = await supabase
        .from('task_assignments')
        .update({
          status: 'approved',
          reviewed_by: adminId,
          reviewed_at: now,
          approved_hours: Math.min(memberHours, MAX_HOURS_PER_LOG),
          hours_log_id: firstHoursLogId,
          review_notes: 'مُعتمد تلقائياً - استيراد من Notion',
        })
        .eq('id', assignment.id);

      if (updateErr) {
        console.log(`  ⚠️ خطأ تحديث التكليف: ${updateErr.message}`);
      } else {
        console.log(`  👤 ${userId}: ${memberHours}س ✅`);
      }
    }

    results.imported.push({ title, taskId, hours: totalHours, members: usersToProcess.length });
  }

  // ── تقرير ──────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('📊 تقرير استيراد المهام:');
  console.log('='.repeat(60));
  console.log(`✅ مهام مُستوردة: ${results.imported.length}`);
  results.imported.forEach(r => console.log(`   • ${r.title} (${r.hours}س، ${r.members} عضو)`));
  console.log(`\n⏩ مهام مُتخطّاة: ${results.skipped.length}`);
  results.skipped.forEach(r => console.log(`   • ${r.title} | ${r.reason}`));
  console.log(`\n❌ أخطاء: ${results.errors.length}`);
  results.errors.forEach(r => console.log(`   • ${r.title}: ${r.error}`));

  // حفظ التقرير
  const reportPath = path.join(__dirname, '..', 'db', 'notion_tasks_import_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n📄 تقرير حُفظ في: ${reportPath}`);
  console.log('✔️  انتهى استيراد المهام.');
}

main().catch(err => { console.error('❌ خطأ:', err); process.exit(1); });
