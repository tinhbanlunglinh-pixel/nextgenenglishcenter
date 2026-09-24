import {
  ClassRoom,
  Student,
  DeletedStudentRecord,
  Assignment,
  Submission,
  DailySummary,
  DeadlineStatus,
  LessonPlan,
  MonthlyReport,
  MonthlySessionConfig,
  MonthlySessionColumn,
  StudentMonthlyScore,
  WeeklyReportRecord,
  WeeklySessionConfig,
  StudentWeeklyScore,
  ClassScheduleConfig,
  WeeklyTimeSlot,
  AttendanceRecord,
  AttendanceStudentItem,
  AttendanceStatus,
  AnnualReport,
  StudentAnnualScore
} from '../types';
import {
  syncToFirebaseIfConfigured,
  pullAllFromFirebase,
  pullSubmissionsOnlyFromFirebase,
  seedFirebaseIfEmpty,
  syncSingleSubmissionToFirebase,
  subscribeToFirebaseRealtime,
  getFirebaseConfig
} from './firebaseService';
import { ensureCompletePracticeContent } from '../utils/practiceBuilder';

// Storage keys
const CLASSES_KEY = 'nextgen_classes';
export const DELETED_CLASSES_KEY = 'nextgen_deleted_classes';
const STUDENTS_KEY = 'nextgen_students';
export const DELETED_STUDENTS_KEY = 'nextgen_deleted_students';
const ASSIGNMENTS_KEY = 'nextgen_assignments';
export const DELETED_ASSIGNMENTS_KEY = 'nextgen_deleted_assignments';
const SUBMISSIONS_KEY = 'nextgen_submissions';
const MONTHLY_REPORTS_KEY = 'nextgen_monthly_reports';
const WEEKLY_REPORTS_KEY = 'nextgen_weekly_reports';
const ANNUAL_REPORTS_KEY = 'nextgen_annual_reports';
const CLASS_SCHEDULES_KEY = 'nextgen_class_schedules';
const ATTENDANCE_RECORDS_KEY = 'nextgen_attendance_records';
const DATA_CLEANED_KEY = 'nextgen_data_cleaned';

// BroadcastChannel for instant multi-tab sync
const SYNC_CHANNEL_NAME = 'nextgen_sync_channel';
let broadcastChannel: BroadcastChannel | null = null;

if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    broadcastChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
  } catch (e) {
    console.warn('BroadcastChannel not supported or error:', e);
  }
}

export const notifySync = (type: string, data?: any) => {
  if (broadcastChannel) {
    broadcastChannel.postMessage({ type, data, timestamp: Date.now() });
  }
  // Also dispatch CustomEvent on window for single-tab state reactivity
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nextgen_local_sync', { detail: { type, data } }));
  }
};

export const subscribeToSync = (callback: (event: { type: string; data?: any }) => void): (() => void) => {
  const handleMessage = (e: MessageEvent) => {
    if (e.data && e.data.type) {
      callback(e.data);
    }
  };

  const handleLocalEvent = (e: any) => {
    if (e.detail) {
      callback(e.detail);
    }
  };

  if (broadcastChannel) {
    broadcastChannel.addEventListener('message', handleMessage);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('nextgen_local_sync', handleLocalEvent);
  }

  return () => {
    if (broadcastChannel) {
      broadcastChannel.removeEventListener('message', handleMessage);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('nextgen_local_sync', handleLocalEvent);
    }
  };
};

// ==================== DEFAULT SEED DATA (EMPTY - PURE REAL DATA) ====================
const DEFAULT_CLASSES: ClassRoom[] = [];
const DEFAULT_STUDENTS: Student[] = [];
export const DEFAULT_CLASS_SCHEDULES: ClassScheduleConfig[] = [];

// Helper to get today's date in YYYY-MM-DD
export const getTodayString = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Helper to get local date string (YYYY-MM-DD) taking Vietnam timezone into account
export const getLocalDateString = (dateInput?: string | Date): string => {
  if (!dateInput) return getTodayString();
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) {
    return typeof dateInput === 'string' ? dateInput.split('T')[0] : getTodayString();
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// ==================== DATA RESET & CLEANUP ====================
export const isDataCleaned = (): boolean => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(DATA_CLEANED_KEY) === 'true';
};

export const clearAllDemoData = async (): Promise<void> => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DATA_CLEANED_KEY, 'true');
  localStorage.setItem(CLASSES_KEY, JSON.stringify([]));
  localStorage.setItem(DELETED_CLASSES_KEY, JSON.stringify([]));
  localStorage.setItem(STUDENTS_KEY, JSON.stringify([]));
  localStorage.setItem(DELETED_STUDENTS_KEY, JSON.stringify([]));
  localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify([]));
  localStorage.setItem(DELETED_ASSIGNMENTS_KEY, JSON.stringify([]));
  localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([]));
  localStorage.setItem(MONTHLY_REPORTS_KEY, JSON.stringify([]));
  localStorage.setItem(WEEKLY_REPORTS_KEY, JSON.stringify([]));
  localStorage.setItem(ANNUAL_REPORTS_KEY, JSON.stringify([]));
  localStorage.setItem(CLASS_SCHEDULES_KEY, JSON.stringify([]));
  localStorage.setItem(ATTENDANCE_RECORDS_KEY, JSON.stringify([]));
  localStorage.setItem(ADMIN_NOTIFICATIONS_KEY, JSON.stringify([]));
  localStorage.removeItem('lesson_history');

  // Also clean old legacy mrs_dung keys
  const legacyKeys = [
    'mrs_dung_classes', 'mrs_dung_students', 'mrs_dung_deleted_students',
    'mrs_dung_assignments', 'mrs_dung_submissions', 'mrs_dung_monthly_reports',
    'mrs_dung_weekly_reports', 'mrs_dung_annual_reports', 'mrs_dung_class_schedules',
    'mrs_dung_attendance_records', 'mrs_dung_admin_notifications', 'mrs_dung_active_assignments',
    'mrs_dung_active_student_name', 'mrs_dung_active_class_name', 'mrs_dung_selected_student',
    'mrs_dung_selected_class', 'mrs_dung_user_role', 'mrs_dung_report_zoom',
    'nextgen_students_cleared_v1'
  ];
  legacyKeys.forEach(k => localStorage.removeItem(k));

  // Sync empty arrays to Firebase so cloud is also cleaned
  await Promise.all([
    syncToFirebaseIfConfigured('classes', []),
    syncToFirebaseIfConfigured('deleted_classes', []),
    syncToFirebaseIfConfigured('students', []),
    syncToFirebaseIfConfigured('deleted_students', []),
    syncToFirebaseIfConfigured('assignments', []),
    syncToFirebaseIfConfigured('deleted_assignments', []),
    syncToFirebaseIfConfigured('submissions', []),
    syncToFirebaseIfConfigured('monthly_reports', []),
    syncToFirebaseIfConfigured('weekly_reports', []),
    syncToFirebaseIfConfigured('class_schedules', []),
    syncToFirebaseIfConfigured('attendance_records', [])
  ]);

  notifySync('data_reset_all', { timestamp: Date.now() });
};

// ── Nextgen Master Clean Slate (Wipe repository, classes, students, notifications, visits) ──
const NEXTGEN_MASTER_CLEAN_KEY = 'nextgen_master_cleaned_v3';

export const ensureNextgenMasterClean = (): void => {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(NEXTGEN_MASTER_CLEAN_KEY) !== 'true') {
      // 1. Clean all legacy mrs_dung keys
      try {
        const allKeys = Object.keys(localStorage);
        allKeys.forEach(k => {
          if (k.startsWith('mrs_dung_') && !k.includes('firebase_config') && !k.includes('credentials')) {
            localStorage.removeItem(k);
          }
        });
      } catch {}

      // 2. Wipe repository, classes, students, notifications, visits
      localStorage.setItem(CLASSES_KEY, JSON.stringify([]));
      localStorage.setItem(DELETED_CLASSES_KEY, JSON.stringify([]));
      localStorage.setItem(STUDENTS_KEY, JSON.stringify([]));
      localStorage.setItem(DELETED_STUDENTS_KEY, JSON.stringify([]));
      localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify([]));
      localStorage.setItem(DELETED_ASSIGNMENTS_KEY, JSON.stringify([]));
      localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([]));
      localStorage.setItem(MONTHLY_REPORTS_KEY, JSON.stringify([]));
      localStorage.setItem(WEEKLY_REPORTS_KEY, JSON.stringify([]));
      localStorage.setItem(ANNUAL_REPORTS_KEY, JSON.stringify([]));
      localStorage.setItem(CLASS_SCHEDULES_KEY, JSON.stringify([]));
      localStorage.setItem(ATTENDANCE_RECORDS_KEY, JSON.stringify([]));
      localStorage.setItem(ADMIN_NOTIFICATIONS_KEY, JSON.stringify([]));
      localStorage.removeItem('lesson_history');
      localStorage.removeItem('nextgen_active_student_name');
      localStorage.removeItem('nextgen_active_class_name');
      localStorage.removeItem('nextgen_selected_student');
      localStorage.removeItem('nextgen_selected_class');

      // 3. Set marker
      localStorage.setItem(NEXTGEN_MASTER_CLEAN_KEY, 'true');
      localStorage.setItem(DATA_CLEANED_KEY, 'true');

      // 4. Clean Firebase cloud
      Promise.all([
        syncToFirebaseIfConfigured('classes', []),
        syncToFirebaseIfConfigured('deleted_classes', []),
        syncToFirebaseIfConfigured('students', []),
        syncToFirebaseIfConfigured('deleted_students', []),
        syncToFirebaseIfConfigured('assignments', []),
        syncToFirebaseIfConfigured('deleted_assignments', []),
        syncToFirebaseIfConfigured('submissions', []),
        syncToFirebaseIfConfigured('monthly_reports', []),
        syncToFirebaseIfConfigured('weekly_reports', []),
        syncToFirebaseIfConfigured('class_schedules', []),
        syncToFirebaseIfConfigured('attendance_records', [])
      ]).catch(e => console.warn('Firebase wipe note:', e));

      notifySync('data_reset_all', { timestamp: Date.now() });
    }
  } catch (err) {
    console.warn('ensureNextgenMasterClean error:', err);
  }
};

// Run automatically on module load
ensureNextgenMasterClean();

export const clearAllStudents = async (): Promise<void> => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STUDENTS_KEY, JSON.stringify([]));
  localStorage.setItem(DELETED_STUDENTS_KEY, JSON.stringify([]));

  const classes = getClasses();
  const updatedClasses = classes.map(c => ({ ...c, studentCount: 0 }));
  saveClasses(updatedClasses);

  await Promise.all([
    syncToFirebaseIfConfigured('students', []),
    syncToFirebaseIfConfigured('deleted_students', [])
  ]);

  notifySync('students_updated', []);
  notifySync('classes_updated', updatedClasses);
};

export const clearStudentsByClass = async (classId: string): Promise<void> => {
  if (typeof window === 'undefined' || !classId) return;
  const current = getStudents();
  const remaining = current.filter(s => s.classId !== classId);
  saveStudents(remaining);
  notifySync('students_updated', remaining);
};

const MOCK_CLASS_IDS = new Set(['class_6a1', 'class_6a2', 'class_7b1', 'class_8a1']);
const MOCK_STUDENT_IDS = new Set(Array.from({ length: 17 }, (_, i) => `std_${i + 1}`));

// ==================== CLASS MANAGEMENT ====================
export const getDeletedClasses = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DELETED_CLASSES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveDeletedClasses = (ids: string[]): void => {
  if (typeof window === 'undefined') return;
  const deduped = Array.from(new Set(ids));
  localStorage.setItem(DELETED_CLASSES_KEY, JSON.stringify(deduped));
  syncToFirebaseIfConfigured('deleted_classes', deduped);
};

export const getClasses = (): ClassRoom[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CLASSES_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const deletedIds = new Set(getDeletedClasses());
        return parsed.filter(c => c && c.id && !MOCK_CLASS_IDS.has(c.id) && !deletedIds.has(c.id));
      }
      return [];
    }
    return [];
  } catch {
    return [];
  }
};

export const saveClasses = (classes: ClassRoom[]): void => {
  if (typeof window === 'undefined') return;
  const deletedIds = new Set(getDeletedClasses());
  const cleanClasses = classes.filter(c => c && c.id && !MOCK_CLASS_IDS.has(c.id) && !deletedIds.has(c.id));
  localStorage.setItem(CLASSES_KEY, JSON.stringify(cleanClasses));
  notifySync('classes_updated', cleanClasses);
  syncToFirebaseIfConfigured('classes', cleanClasses);
};

export const formatScheduleSummary = (slots?: WeeklyTimeSlot[]): string => {
  if (!slots || slots.length === 0) return '';
  const dayOrder = [2, 3, 4, 5, 6, 7, 1];
  const sorted = [...slots].sort((a, b) => dayOrder.indexOf(a.dayOfWeek) - dayOrder.indexOf(b.dayOfWeek));
  const dayNames = sorted.map(s => s.dayLabel || (s.dayOfWeek === 1 ? 'Chủ Nhật' : `Thứ ${s.dayOfWeek}`)).join(' & ');
  const time = sorted[0]?.startTime && sorted[0]?.endTime ? ` (${sorted[0].startTime} - ${sorted[0].endTime})` : '';
  return `${dayNames}${time}`;
};

export const parseScheduleFromText = (
  text: string,
  defaultRoom: string = 'Phòng A1'
): { slots: WeeklyTimeSlot[]; formattedSummary: string } | null => {
  if (!text || !text.trim()) return null;
  const raw = text.toLowerCase();

  let startTime = '17:30';
  let endTime = '19:00';
  const timeMatch = text.match(/(\d{1,2})[h:](\d{2})?\s*[-–—]\s*(\d{1,2})[h:](\d{2})?/i);
  if (timeMatch) {
    const h1 = String(timeMatch[1]).padStart(2, '0');
    const m1 = timeMatch[2] ? String(timeMatch[2]).padStart(2, '0') : '00';
    const h2 = String(timeMatch[3]).padStart(2, '0');
    const m2 = timeMatch[4] ? String(timeMatch[4]).padStart(2, '0') : '00';
    startTime = `${h1}:${m1}`;
    endTime = `${h2}:${m2}`;
  }

  const matchedDays = new Set<number>();
  if (raw.includes('chủ nhật') || raw.includes('chu nhat') || /\bcn\b/.test(raw)) {
    matchedDays.add(1);
  }
  if (raw.includes('thứ hai') || raw.includes('thu hai') || raw.includes('thứ 2') || raw.includes('thu 2') || /\bt2\b/.test(raw)) {
    matchedDays.add(2);
  }
  if (raw.includes('thứ ba') || raw.includes('thu ba') || raw.includes('thứ 3') || raw.includes('thu 3') || /\bt3\b/.test(raw)) {
    matchedDays.add(3);
  }
  if (raw.includes('thứ tư') || raw.includes('thu tu') || raw.includes('thứ 4') || raw.includes('thu 4') || /\bt4\b/.test(raw)) {
    matchedDays.add(4);
  }
  if (raw.includes('thứ năm') || raw.includes('thu nam') || raw.includes('thứ 5') || raw.includes('thu 5') || /\bt5\b/.test(raw)) {
    matchedDays.add(5);
  }
  if (raw.includes('thứ sáu') || raw.includes('thu sau') || raw.includes('thứ 6') || raw.includes('thu 6') || /\bt6\b/.test(raw)) {
    matchedDays.add(6);
  }
  if (raw.includes('thứ bảy') || raw.includes('thu bay') || raw.includes('thứ 7') || raw.includes('thu 7') || /\bt7\b/.test(raw)) {
    matchedDays.add(7);
  }

  if (/t2\s*[-–]\s*t?4\s*[-–]\s*t?6/i.test(raw) || /2\s*[-–]\s*4\s*[-–]\s*6/i.test(raw)) {
    matchedDays.add(2);
    matchedDays.add(4);
    matchedDays.add(6);
  }
  if (/t3\s*[-–]\s*t?5\s*[-–]\s*t?7/i.test(raw) || /3\s*[-–]\s*5\s*[-–]\s*7/i.test(raw)) {
    matchedDays.add(3);
    matchedDays.add(5);
    matchedDays.add(7);
  }

  if (matchedDays.size === 0) return null;

  const dayOrder = [2, 3, 4, 5, 6, 7, 1];
  const sortedDays = Array.from(matchedDays).sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));

  const dayLabelsMap: Record<number, string> = {
    1: 'Chủ Nhật',
    2: 'Thứ Hai',
    3: 'Thứ Ba',
    4: 'Thứ Tư',
    5: 'Thứ Năm',
    6: 'Thứ Sáu',
    7: 'Thứ Bảy'
  };

  const slots: WeeklyTimeSlot[] = sortedDays.map((d, idx) => ({
    id: `slot_${Date.now()}_${idx + 1}`,
    dayOfWeek: d,
    dayLabel: dayLabelsMap[d] || `Thứ ${d}`,
    startTime,
    endTime,
    room: defaultRoom
  }));

  const daySummary = sortedDays.map(d => dayLabelsMap[d]).join(' & ');
  const formattedSummary = `${daySummary} (${startTime} - ${endTime})`;

  return { slots, formattedSummary };
};

export const addClass = (
  name: string,
  grade: number,
  description = '',
  customSlots?: WeeklyTimeSlot[]
): ClassRoom => {
  const current = getClasses();
  const now = new Date().toISOString();
  const newClass: ClassRoom = {
    id: `class_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: name.trim(),
    grade,
    description: description.trim(),
    studentCount: 0,
    createdAt: now,
    updatedAt: now,
    teacherModifiedAt: now,
    teacherModified: true
  };
  const updated = [...current, newClass];
  saveClasses(updated);

  // Nếu giáo viên có sắp lịch học (slots hoặc mô tả), lưu ngay ClassScheduleConfig và đồng bộ buổi học
  if (customSlots && customSlots.length > 0) {
    const schedConfig: ClassScheduleConfig = {
      id: `sched_${newClass.id}`,
      classId: newClass.id,
      className: newClass.name,
      sessionsPerWeek: customSlots.length,
      slots: customSlots,
      roomDefault: customSlots[0]?.room || 'Phòng A1',
      notes: `Lịch học ${newClass.name}`,
      updatedAt: now,
      teacherModifiedAt: now,
      teacherModified: true
    };
    saveClassSchedule(schedConfig);
  } else if (description.trim()) {
    const parsed = parseScheduleFromText(description);
    if (parsed && parsed.slots.length > 0) {
      const schedConfig: ClassScheduleConfig = {
        id: `sched_${newClass.id}`,
        classId: newClass.id,
        className: newClass.name,
        sessionsPerWeek: parsed.slots.length,
        slots: parsed.slots,
        roomDefault: 'Phòng A1',
        notes: `Lịch học ${newClass.name}`,
        updatedAt: now,
        teacherModifiedAt: now,
        teacherModified: true
      };
      saveClassSchedule(schedConfig);
    }
  }

  return newClass;
};

export const updateClass = (
  id: string,
  updates: Partial<ClassRoom>,
  customSlots?: WeeklyTimeSlot[]
): void => {
  const current = getClasses();
  const now = new Date().toISOString();
  const updated = current.map(c => (c.id === id ? {
    ...c,
    ...updates,
    updatedAt: now,
    teacherModifiedAt: now,
    teacherModified: true
  } : c));
  saveClasses(updated);

  if (customSlots && customSlots.length > 0) {
    const targetClass = updated.find(c => c.id === id);
    const schedConfig: ClassScheduleConfig = {
      id: `sched_${id}`,
      classId: id,
      className: targetClass ? targetClass.name : '',
      sessionsPerWeek: customSlots.length,
      slots: customSlots,
      roomDefault: customSlots[0]?.room || 'Phòng A1',
      notes: `Lịch học ${targetClass?.name || ''}`,
      updatedAt: now,
      teacherModifiedAt: now,
      teacherModified: true
    };
    saveClassSchedule(schedConfig);
  } else if (updates.description) {
    const parsed = parseScheduleFromText(updates.description);
    if (parsed && parsed.slots.length > 0) {
      const targetClass = updated.find(c => c.id === id);
      const schedConfig: ClassScheduleConfig = {
        id: `sched_${id}`,
        classId: id,
        className: targetClass ? targetClass.name : '',
        sessionsPerWeek: parsed.slots.length,
        slots: parsed.slots,
        roomDefault: 'Phòng A1',
        notes: `Lịch học ${targetClass?.name || ''}`,
        updatedAt: now,
        teacherModifiedAt: now,
        teacherModified: true
      };
      saveClassSchedule(schedConfig);
    }
  }
};

export const deleteClass = (id: string): void => {
  const current = getClasses();
  const updated = current.filter(c => c.id !== id);
  saveClasses(updated);

  // Ghi nhận tombstone lớp đã xóa để đồng bộ Firebase không phục hồi lại lớp đã xóa
  const deletedClasses = getDeletedClasses();
  if (!deletedClasses.includes(id)) {
    saveDeletedClasses([...deletedClasses, id]);
  }

  // Also clean up students of this class
  const students = getStudents();
  const remainingStudents = students.filter(s => s.classId !== id);
  saveStudents(remainingStudents);
};

// ==================== STUDENT MANAGEMENT & MATCHING ====================

/**
 * Chuẩn hóa họ tên tiếng Việt: bỏ dấu, viết thường, loại bỏ khoảng trắng thừa
 */
export const normalizeStudentName = (str?: string): string => {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Kiểm tra đối soát thông minh giữa học sinh trong danh sách lớp và bài nộp
 */
export const isStudentMatch = (
  std: { id?: string; name: string; englishName?: string; rollNumber?: string },
  sub: { studentId?: string; studentName: string }
): boolean => {
  // 1. Khớp tuyệt đối qua studentId
  if (sub.studentId && std.id && sub.studentId === std.id) {
    return true;
  }

  // 2. Khớp tuyệt đối theo tên (Unicode NFC)
  const stdNameNFC = (std.name || '').trim().normalize('NFC').toLowerCase();
  const subNameNFC = (sub.studentName || '').trim().normalize('NFC').toLowerCase();
  if (stdNameNFC && subNameNFC && stdNameNFC === subNameNFC) {
    return true;
  }

  // 3. Khớp tên không dấu tiếng Việt
  const normStd = normalizeStudentName(std.name);
  const normSub = normalizeStudentName(sub.studentName);
  if (normStd && normSub && normStd === normSub) {
    return true;
  }

  // 4. Khớp tên tiếng Anh (E.NAME)
  if (std.englishName) {
    const normStdEn = normalizeStudentName(std.englishName);
    if (normStdEn && normSub && normStdEn === normSub) {
      return true;
    }
    if (normStdEn && normStdEn.length >= 3 && (normSub.includes(normStdEn) || normStdEn.includes(normSub))) {
      return true;
    }
  }

  // 5. Khớp họ tên con (nếu một bên nhập tắt hoặc bao gồm nhau với độ dài >= 2 từ)
  if (normStd && normSub && (normSub.length >= 5 || normSub.split(' ').length >= 2)) {
    if (normStd.includes(normSub) || normSub.includes(normStd)) {
      return true;
    }
  }

  return false;
};

// ==================== DELETED STUDENTS (TOMBSTONE / NGHỈ HỌC) ====================
export const getDeletedStudents = (): DeletedStudentRecord[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DELETED_STUDENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveDeletedStudents = (records: DeletedStudentRecord[]): void => {
  if (typeof window === 'undefined') return;
  // Khử trùng lặp ID
  const map = new Map<string, DeletedStudentRecord>();
  records.forEach(r => {
    if (r && r.id) map.set(r.id, r);
  });
  const deduped = Array.from(map.values());
  localStorage.setItem(DELETED_STUDENTS_KEY, JSON.stringify(deduped));
  notifySync('deleted_students_updated', deduped);
  syncToFirebaseIfConfigured('deleted_students', deduped);
};

export const isStudentDeleted = (studentId: string): boolean => {
  if (!studentId) return false;
  const deleted = getDeletedStudents();
  return deleted.some(d => d.id === studentId);
};

export const restoreDeletedStudent = (studentId: string): Student | null => {
  const deletedList = getDeletedStudents();
  const target = deletedList.find(d => d.id === studentId);
  if (!target) return null;

  // 1. Loại bỏ khỏi danh sách đã xóa
  const remaining = deletedList.filter(d => d.id !== studentId);
  saveDeletedStudents(remaining);

  // 2. Khôi phục lại danh sách học sinh hiện hành
  const current = getStudents();
  const now = new Date().toISOString();
  const restoredStudent: Student = {
    id: target.id,
    name: target.name,
    englishName: target.englishName || '',
    phone: target.phone || '',
    classId: target.classId,
    className: target.className,
    avatar: target.avatar || '🎒',
    notes: target.notes || '',
    password: target.password || '123',
    createdAt: target.deletedAt || now,
    updatedAt: now,
    teacherModifiedAt: now,
    teacherModified: true
  };

  saveStudents([...current, restoredStudent]);
  notifySync('student_restored', restoredStudent);
  return restoredStudent;
};

export const getStudents = (classIdOrName?: string): Student[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STUDENTS_KEY);
    let all: Student[] = [];
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      all = Array.isArray(parsed) ? parsed : [];
    }

    // Danh sách ID học sinh cô đã xóa vĩnh viễn (nghỉ học)
    const deletedIds = new Set(getDeletedStudents().map(d => d.id));

    // Khử trùng lặp ID, loại bỏ học sinh mẫu, và loại bỏ triệt để học sinh đã xóa vĩnh viễn
    const seenIds = new Set<string>();
    const deduped: Student[] = [];
    for (const s of all) {
      if (!s || !s.id) continue;
      if (deletedIds.has(s.id)) continue; // Tuyệt đối không nạp học sinh đã xóa
      if (!seenIds.has(s.id)) {
        seenIds.add(s.id);
        deduped.push({
          ...s,
          password: (s.password && s.password.trim().length > 0) ? s.password.trim() : '123'
        });
      }
    }

    if (classIdOrName && classIdOrName !== 'ALL') {
      const norm = (str?: string) => (str || '').toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();
      const targetNorm = norm(classIdOrName);
      const classes = getClasses();
      const matchedClass = classes.find(c => c.id === classIdOrName || norm(c.name) === targetNorm);
      const targetId = matchedClass ? matchedClass.id : classIdOrName;
      const targetNameNorm = matchedClass ? norm(matchedClass.name) : targetNorm;

      return deduped.filter(s =>
        s.classId === targetId ||
        s.classId === classIdOrName ||
        (s.className && norm(s.className) === targetNameNorm)
      );
    }
    return deduped;
  } catch {
    return [];
  }
};

export const saveStudents = (students: Student[]): void => {
  if (typeof window === 'undefined') return;
  const deletedIds = new Set(getDeletedStudents().map(d => d.id));
  const validStudents = students.filter(s => s && s.id && !deletedIds.has(s.id));

  localStorage.setItem(STUDENTS_KEY, JSON.stringify(validStudents));
  notifySync('students_updated', validStudents);
  syncToFirebaseIfConfigured('students', validStudents);

  // Update studentCount in classes
  const classes = getClasses();
  const norm = (str?: string) => (str || '').toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();
  const updatedClasses = classes.map(c => {
    const count = validStudents.filter(s => s.classId === c.id || (s.className && norm(s.className) === norm(c.name))).length;
    return { ...c, studentCount: count };
  });
  saveClasses(updatedClasses);
};

const RANDOM_AVATARS = ['🌸', '🚀', '⭐', '⚡', '🦄', '🦁', '🌻', '🎯', '🐱', '⚽', '🎨', '🎸', '🌺', '🏹', '🍀', '👑', '💎', '🌈', '🐬', '☀️'];

export const addStudent = (
  name: string,
  classId: string,
  className: string,
  englishName = '',
  phone = '',
  notes = '',
  password = '123'
): Student => {
  const current = getStudents();
  const avatar = RANDOM_AVATARS[Math.floor(Math.random() * RANDOM_AVATARS.length)];
  const rollNumber = String(current.filter(s => s.classId === classId).length + 1).padStart(2, '0');
  const now = new Date().toISOString();
  const newStudent: Student = {
    id: `std_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: name.trim(),
    englishName: englishName.trim(),
    phone: phone.trim(),
    classId,
    className,
    avatar,
    rollNumber,
    notes: notes.trim(),
    password: password.trim() || '123',
    createdAt: now,
    updatedAt: now,
    teacherModifiedAt: now,
    teacherModified: true
  };
  saveStudents([...current, newStudent]);
  return newStudent;
};

export const batchAddStudents = (names: string[], classId: string, className: string): Student[] => {
  const current = getStudents();
  const existingCount = current.filter(s => s.classId === classId).length;
  const now = new Date().toISOString();
  const newStudents: Student[] = names
    .map(n => n.trim())
    .filter(n => n.length > 0)
    .map((name, idx) => ({
      id: `std_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      name,
      englishName: '',
      classId,
      className,
      avatar: RANDOM_AVATARS[(existingCount + idx) % RANDOM_AVATARS.length],
      rollNumber: String(existingCount + idx + 1).padStart(2, '0'),
      password: '123',
      createdAt: now,
      updatedAt: now,
      teacherModifiedAt: now,
      teacherModified: true
    }));

  saveStudents([...current, ...newStudents]);
  return newStudents;
};

export const batchAddStudentsWithDetails = (
  items: Array<{ name: string; englishName?: string; phone?: string; notes?: string; password?: string }>,
  classId: string,
  className: string
): Student[] => {
  const current = getStudents();
  const existingCount = current.filter(s => s.classId === classId).length;
  const now = new Date().toISOString();
  const newStudents: Student[] = items
    .map(it => ({
      name: it.name.trim(),
      englishName: (it.englishName || '').trim(),
      phone: (it.phone || '').trim(),
      notes: (it.notes || '').trim(),
      password: (it.password || '123').trim() || '123'
    }))
    .filter(it => it.name.length > 0)
    .map((item, idx) => ({
      id: `std_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      name: item.name,
      englishName: item.englishName,
      phone: item.phone,
      classId,
      className,
      avatar: RANDOM_AVATARS[(existingCount + idx) % RANDOM_AVATARS.length],
      rollNumber: String(existingCount + idx + 1).padStart(2, '0'),
      notes: item.notes,
      password: item.password,
      createdAt: now,
      updatedAt: now,
      teacherModifiedAt: now,
      teacherModified: true
    }));

  saveStudents([...current, ...newStudents]);
  return newStudents;
};

export const updateStudent = (id: string, updates: Partial<Student>): void => {
  const current = getStudents();
  const now = new Date().toISOString();
  const classes = getClasses();

  const updated = current.map(s => {
    if (s.id !== id) return s;

    let targetClassName = updates.className || s.className;
    if (updates.classId && updates.classId !== s.classId) {
      const foundClass = classes.find(c => c.id === updates.classId);
      if (foundClass) {
        targetClassName = foundClass.name;
      }
    }

    return {
      ...s,
      ...updates,
      className: targetClassName,
      updatedAt: now,
      teacherModifiedAt: now,
      teacherModified: true
    };
  });

  saveStudents(updated);
  notifySync('student_updated', { id, updates, timestamp: now });
};

export const deleteStudent = (id: string, reason = 'Học sinh nghỉ học / chuyển trường'): void => {
  const current = getStudents();
  const target = current.find(s => s.id === id);

  if (target) {
    const deletedRecord: DeletedStudentRecord = {
      id: target.id,
      name: target.name,
      englishName: target.englishName,
      phone: target.phone,
      classId: target.classId,
      className: target.className,
      avatar: target.avatar,
      notes: target.notes,
      password: target.password,
      deletedAt: new Date().toISOString(),
      reason
    };

    const deletedList = getDeletedStudents();
    if (!deletedList.some(d => d.id === target.id)) {
      saveDeletedStudents([...deletedList, deletedRecord]);
    }
  }

  const remaining = current.filter(s => s.id !== id);
  saveStudents(remaining);
  notifySync('student_deleted', { id, timestamp: Date.now() });
};

const DEFAULT_SAMPLE_LESSON: LessonPlan = {
  topic: "Unit 1: My New School",
  vocabulary: [
    { word: "school bag", emoji: "🎒", ipa: "/ˈskuːl bæɡ/", meaning: "cặp sách", example: "I have a new school bag.", sentenceMeaning: "tôi có một chiếc cặp sách mới.", type: "noun" },
    { word: "calculator", emoji: "🔢", ipa: "/ˈkælkjuleɪtə/", meaning: "máy tính cầm tay", example: "She uses a calculator in maths.", sentenceMeaning: "cô ấy dùng máy tính trong giờ toán.", type: "noun" },
    { word: "pencil sharpener", emoji: "✏️", ipa: "/ˈpensl ʃɑːpnə/", meaning: "gọt bút chì", example: "This is my pencil sharpener.", sentenceMeaning: "đây là chiếc gọt bút chì của tôi.", type: "noun" },
    { word: "compass", emoji: "🧭", ipa: "/ˈkʌmpəs/", meaning: "com-pa", example: "We draw circles with a compass.", sentenceMeaning: "chúng tôi vẽ hình tròn bằng com-pa.", type: "noun" },
    { word: "uniform", emoji: "👔", ipa: "/ˈjuːnɪfɔːm/", meaning: "đồng phục", example: "Students wear uniform on Mondays.", sentenceMeaning: "học sinh mặc đồng phục vào thứ hai.", type: "noun" },
    { word: "classmate", emoji: "🤝", ipa: "/ˈklɑːsmeɪt/", meaning: "bạn cùng lớp", example: "Nam is my favourite classmate.", sentenceMeaning: "nam là bạn cùng lớp yêu thích của tôi.", type: "noun" },
  ],
  grammar: {
    topic: "The Present Simple Tense (Thì hiện tại đơn)",
    explanation: "Thì hiện tại đơn diễn tả hành động lặp đi lặp lại hoặc sự thật hiển nhiên. Với ngôi He/She/It, động từ thêm 's' hoặc 'es'.",
    examples: [
      "I go to school every morning. → Tôi đi học mỗi buổi sáng.",
      "She wears her uniform on Monday. → Cô ấy mặc đồng phục vào thứ Hai.",
      "They play football in the playground. → Họ chơi bóng đá ở sân trường."
    ]
  },
  reading: {
    title: "Lan's New School",
    passage: "Hello! My name is Lan. I am eleven years old. Today is my first day at my new school. The school is big and beautiful. I wear my new uniform and carry my school bag. I have many new classmates. We are very excited!",
    translation: "Xin chào! Mình tên là Lan. Mình 11 tuổi. Hôm nay là ngày đầu tiên ở trường mới của mình. Ngôi trường to và rất đẹp. Mình mặc đồng phục mới và mang cặp sách. Mình có nhiều bạn cùng lớp mới. Chúng mình rất hào hứng!",
    comprehension: [
      { id: "comp_1", question: "How old is Lan?", options: ["Ten", "Eleven", "Twelve", "Nine"], correctAnswer: "Eleven", explanation: "Trong bài: 'I am eleven years old.' (Lan 11 tuổi)" },
      { id: "comp_2", question: "How is Lan's new school?", options: ["Small and old", "Big and beautiful", "Noisy", "Crowded"], correctAnswer: "Big and beautiful", explanation: "Trong bài: 'The school is big and beautiful.'" },
      { id: "comp_3", question: "What does Lan wear today?", options: ["A dress", "Her new uniform", "Jeans", "A jacket"], correctAnswer: "Her new uniform", explanation: "Trong bài: 'I wear my new uniform.'" },
      { id: "comp_4", question: "What does Lan carry?", options: ["A book", "Her school bag", "A lunch box", "A bottle"], correctAnswer: "Her school bag", explanation: "Trong bài: 'and carry my school bag.'" },
      { id: "comp_5", question: "How do the students feel?", options: ["Tired", "Sad", "Very excited", "Bored"], correctAnswer: "Very excited", explanation: "Trong bài: 'We are very excited!'" }
    ]
  },
  homework: {
    title: "Ôn tập Unit 1",
    description: "Học thuộc 6 từ vựng và làm đầy đủ bài tập MegaChallenge",
    instructions: "Làm bài trực tuyến trên app Nextgen English"
  },
  teacherTips: "Khuyến khích các con nghe phát âm chuẩn bằng cách bấm vào biểu tượng loa cạnh từng từ vựng.",
  practice: {
    listening: [
      { id: "lis_1", audioText: "I have a new school bag.", options: ["I have a new school bag.", "I have an old school bag.", "She has a new school bag.", "I have a big school bag."], correctAnswer: 0, explanation: "Câu đọc: 'I have a new school bag.'" },
      { id: "lis_2", audioText: "Students wear uniform on Mondays.", options: ["Students wear uniform on Sundays.", "Students wear uniform on Mondays.", "Students buy uniform on Mondays.", "Teachers wear uniform on Mondays."], correctAnswer: 1, explanation: "Câu đọc: 'Students wear uniform on Mondays.'" },
      { id: "lis_3", audioText: "Nam is my favourite classmate.", options: ["Nam is my favourite classmate.", "Lan is my favourite classmate.", "Nam is my friendly classmate.", "Nam is my new teacher."], correctAnswer: 0, explanation: "Câu đọc: 'Nam is my favourite classmate.'" },
      { id: "lis_4", audioText: "We draw circles with a compass.", options: ["We draw squares with a ruler.", "We draw circles with a pencil.", "We draw circles with a compass.", "We draw flowers with a brush."], correctAnswer: 2, explanation: "Câu đọc: 'We draw circles with a compass.'" },
      { id: "lis_5", audioText: "She uses a calculator in maths.", options: ["She uses a calculator in maths.", "He uses a calculator in physics.", "She loses a calculator in class.", "She needs a computer in maths."], correctAnswer: 0, explanation: "Câu đọc: 'She uses a calculator in maths.'" }
    ],
    megaTest: {
      multipleChoice: [
        { id: "mc_1", question: "I put my books in my ____.", options: ["school bag", "calculator", "compass", "uniform"], correctAnswer: 0, explanation: "school bag = cặp sách (đựng sách)" },
        { id: "mc_2", question: "She ____ to school every morning.", options: ["go", "goes", "going", "went"], correctAnswer: 1, explanation: "Chủ ngữ ngôi 3 số ít 'She' chia động từ thêm 'es' (goes)" },
        { id: "mc_3", question: "Students wear ____ to school every Monday.", options: ["uniform", "compass", "sharpener", "calculator"], correctAnswer: 0, explanation: "uniform = đồng phục" },
        { id: "mc_4", question: "We use a ____ to draw circles.", options: ["compass", "bag", "pencil", "book"], correctAnswer: 0, explanation: "compass = com-pa dùng để vẽ đường tròn" },
        { id: "mc_5", question: "Nam is my ____. We are in the same class.", options: ["classmate", "brother", "teacher", "parent"], correctAnswer: 0, explanation: "classmate = bạn cùng lớp" },
        { id: "mc_6", question: "She uses a ____ to do difficult math calculations.", options: ["calculator", "compass", "bag", "ruler"], correctAnswer: 0, explanation: "calculator = máy tính bỏ túi" },
        { id: "mc_7", question: "My pencil is broken. I need a pencil ____.", options: ["sharpener", "case", "bag", "box"], correctAnswer: 0, explanation: "pencil sharpener = gọt bút chì" },
        { id: "mc_8", question: "They ____ football after school.", options: ["plays", "play", "playing", "played"], correctAnswer: 1, explanation: "Chủ ngữ 'They' số nhiều nên động từ 'play' giữ nguyên mẫu" },
        { id: "mc_9", question: "Is your new school ____ and beautiful?", options: ["big", "bigness", "bigly", "bigger"], correctAnswer: 0, explanation: "Dùng tính từ 'big' sau động từ to be" },
        { id: "mc_10", question: "We are very ____ on the first day of school.", options: ["excited", "exciting", "excite", "excitement"], correctAnswer: 0, explanation: "excited (tính từ chỉ cảm xúc hào hứng của con người)" }
      ],
      scramble: [
        { id: "sc_1", scrambled: ["new", "a", "have", "I", "school", "bag."], correctSentence: "I have a new school bag.", translation: "Tôi có một chiếc cặp sách mới." },
        { id: "sc_2", scrambled: ["wears", "She", "uniform.", "her"], correctSentence: "She wears her uniform.", translation: "Cô ấy mặc đồng phục của mình." },
        { id: "sc_3", scrambled: ["is", "Nam", "classmate.", "my"], correctSentence: "Nam is my classmate.", translation: "Nam là bạn cùng lớp của tôi." },
        { id: "sc_4", scrambled: ["draw", "We", "a", "circles", "with", "compass."], correctSentence: "We draw circles with a compass.", translation: "Chúng tôi vẽ hình tròn bằng com-pa." },
        { id: "sc_5", scrambled: ["beautiful.", "new", "My", "is", "school"], correctSentence: "My new school is beautiful.", translation: "Ngôi trường mới của tôi rất đẹp." },
        { id: "sc_6", scrambled: ["pencil", "need", "I", "sharpener.", "a"], correctSentence: "I need a pencil sharpener.", translation: "Tôi cần một cái gọt bút chì." },
        { id: "sc_7", scrambled: ["uses", "He", "a", "calculator.", "maths"], correctSentence: "He uses a maths calculator.", translation: "Cậu ấy dùng một máy tính toán." },
        { id: "sc_8", scrambled: ["play", "They", "the", "in", "playground."], correctSentence: "They play in the playground.", translation: "Họ chơi ở sân trường." },
        { id: "sc_9", scrambled: ["love", "my", "I", "school.", "new"], correctSentence: "I love my new school.", translation: "Tôi yêu trường mới của mình." },
        { id: "sc_10", scrambled: ["excited", "Students", "are", "very."], correctSentence: "Students are very excited.", translation: "Học sinh rất hào hứng." }
      ],
      readingMCPassage: "Lan is eleven years old. Today is her first day at her new secondary school. The school is big and beautiful with twenty classrooms and a large playground. Lan wears her crisp new uniform and carries a heavy school bag. She meets her new classmate, Nam, who helps her find the maths room. They both love English and maths very much.",
      readingMC: [
        { id: "rmc_1", question: "How old is Lan?", options: ["Ten years old", "Eleven years old", "Twelve years old", "Seven years old"], correctAnswer: 1, explanation: "Trong bài: 'Lan is eleven years old.'" },
        { id: "rmc_2", question: "What is Lan's new school like?", options: ["Small and old", "Big and beautiful", "Noisy and crowded", "Quiet and dark"], correctAnswer: 1, explanation: "Trong bài: 'The school is big and beautiful with twenty classrooms...'" },
        { id: "rmc_3", question: "What does Lan wear on her first day?", options: ["Casual clothes", "Sportswear", "A new uniform", "A raincoat"], correctAnswer: 2, explanation: "Trong bài: 'Lan wears her crisp new uniform...'" },
        { id: "rmc_4", question: "Who helps Lan find the maths room?", options: ["Her teacher", "Her brother", "Nam, her new classmate", "Her mother"], correctAnswer: 2, explanation: "Trong bài: 'She meets her new classmate, Nam, who helps her find the maths room.'" },
        { id: "rmc_5", question: "Which subjects do Lan and Nam both love?", options: ["History and art", "Music and physical education", "English and maths", "Science and geography"], correctAnswer: 2, explanation: "Trong bài: 'They both love English and maths very much.'" }
      ],
      pronunciation: [
        { id: "pron_1", question: "Chọn từ có phần gạch chân phát âm khác với các từ còn lại:", targetSound: "Phát âm nguyên âm 'a'", underlinedPart: "a", options: ["bag", "cat", "classmate", "hat"], displayOptions: ["b<u>a</u>g", "c<u>a</u>t", "cl<u>a</u>ssmate", "h<u>a</u>t"], correctAnswer: 2, explanation: "A. bag /bæɡ/ | B. cat /kæt/ | C. classmate /ˈklɑːsmeɪt/ | D. hat /hæt/ → 'classmate' phát âm là /ɑː/, còn lại phát âm là /æ/." },
        { id: "pron_2", question: "Chọn từ có phần gạch chân phát âm khác với các từ còn lại:", targetSound: "Đuôi '-s/-es'", underlinedPart: "s", options: ["books", "desks", "rulers", "caps"], displayOptions: ["book<u>s</u>", "desk<u>s</u>", "ruler<u>s</u>", "cap<u>s</u>"], correctAnswer: 2, explanation: "A. books /bʊks/ | B. desks /desks/ | C. rulers /ˈruːləz/ | D. caps /kæps/ → 'rulers' phát âm đuôi là /z/, các từ còn lại có đuôi vô thanh phát âm là /s/." },
        { id: "pron_3", question: "Chọn từ có phần gạch chân phát âm khác với các từ còn lại:", targetSound: "Phát âm 'ch'", underlinedPart: "ch", options: ["teacher", "school", "chair", "children"], displayOptions: ["tea<u>ch</u>er", "s<u>ch</u>ool", "<u>ch</u>air", "<u>ch</u>ildren"], correctAnswer: 1, explanation: "A. teacher /ˈtiːtʃə/ | B. school /skuːl/ | C. chair /tʃeə/ | D. children /ˈtʃɪldrən/ → 'school' phát âm 'ch' là /k/, các từ còn lại phát âm là /tʃ/." },
        { id: "pron_4", question: "Chọn từ có phần gạch chân phát âm khác với các từ còn lại:", targetSound: "Phát âm nguyên âm 'u'", underlinedPart: "u", options: ["uniform", "calculator", "ruler", "rubber"], displayOptions: ["<u>u</u>niform", "calc<u>u</u>lator", "r<u>u</u>ler", "r<u>u</u>bber"], correctAnswer: 3, explanation: "A. uniform /ˈjuːnɪfɔːm/ | B. calculator /ˈkælkjuleɪtə/ | C. ruler /ˈruːlə/ | D. rubber /ˈrʌbə/ → 'rubber' phát âm là /ʌ/, các từ còn lại phát âm là /juː/ hoặc /uː/." },
        { id: "pron_5", question: "Chọn từ có phần gạch chân phát âm khác với các từ còn lại:", targetSound: "Phát âm nguyên âm 'i'", underlinedPart: "i", options: ["big", "circle", "excited", "compass"], displayOptions: ["b<u>i</u>g", "c<u>i</u>rcle", "exc<u>i</u>ted", "compass"], correctAnswer: 2, explanation: "A. big /bɪɡ/ | B. circle /ˈsɜːkl/ | C. excited /ɪkˈsaɪtɪd/ | D. compass (từ kiểm tra) → Chữ 'i' trong 'excited' phát âm là /aɪ/, trong 'big' phát âm là /ɪ/." }
      ],
      vocabTranslation: [
        { id: "vt_1", word: "school bag", options: ["cặp sách", "bút chì", "thước kẻ", "com-pa"], correctAnswer: 0 },
        { id: "vt_2", word: "uniform", options: ["áo khoác", "quần bò", "đồng phục", "giày thể thao"], correctAnswer: 2 },
        { id: "vt_3", word: "calculator", options: ["máy vi tính", "máy tính cầm tay", "đồng hồ", "điện thoại"], correctAnswer: 1 },
        { id: "vt_4", word: "compass", options: ["thước kẻ", "com-pa", "hộp bút", "tẩy"], correctAnswer: 1 },
        { id: "vt_5", word: "pencil sharpener", options: ["gọt bút chì", "bút dạ", "bút máy", "kéo"], correctAnswer: 0 },
        { id: "vt_6", word: "classmate", options: ["thầy giáo", "bạn cùng lớp", "anh em", "hàng xóm"], correctAnswer: 1 },
        { id: "vt_7", word: "excited", options: ["buồn bã", "mệt mỏi", "hào hứng, phấn khởi", "lo lắng"], correctAnswer: 2 },
        { id: "vt_8", word: "playground", options: ["phòng học", "sân chơi, sân trường", "thư viện", "căng tin"], correctAnswer: 1 },
        { id: "vt_9", word: "beautiful", options: ["xinh đẹp, đẹp đẽ", "xấu xí", "to lớn", "nhỏ nhắn"], correctAnswer: 0 },
        { id: "vt_10", word: "subject", options: ["môn học", "trường học", "bài thi", "điểm số"], correctAnswer: 0 }
      ],
      trueFalsePassage: "Lan is eleven years old. Today is her first day at her new school. The school is big and beautiful. She wears her new uniform and carries a new school bag. Lan has many friendly classmates. She loves her new school very much.",
      trueFalse: [
        { id: "tf_1", statement: "Lan is twelve years old.", isTrue: false, explanation: "Trong đoạn văn: 'Lan is eleven years old.' (Lan 11 tuổi, không phải 12)" },
        { id: "tf_2", statement: "Today is Lan's first day at her new school.", isTrue: true, explanation: "Trong đoạn văn: 'Today is her first day at her new school.'" },
        { id: "tf_3", statement: "Her new school is small and old.", isTrue: false, explanation: "Trong đoạn văn: 'The school is big and beautiful.'" },
        { id: "tf_4", statement: "Lan wears her new uniform.", isTrue: true, explanation: "Trong đoạn văn: 'She wears her new uniform.'" },
        { id: "tf_5", statement: "Lan hates her new school.", isTrue: false, explanation: "Trong đoạn văn: 'She loves her new school very much.'" },
        { id: "tf_6", statement: "Lan carries a new school bag to school.", isTrue: true, explanation: "Trong đoạn văn: 'carries a new school bag.'" },
        { id: "tf_7", statement: "Lan has many friendly classmates.", isTrue: true, explanation: "Trong đoạn văn: 'Lan has many friendly classmates.'" },
        { id: "tf_8", statement: "Students wear uniform only on Sundays.", isTrue: false, explanation: "Học sinh mặc đồng phục vào các ngày đi học trong tuần." },
        { id: "tf_9", statement: "Nam is in the same class with Lan.", isTrue: true, explanation: "Nam là bạn cùng lớp của Lan." },
        { id: "tf_10", statement: "Learning English helps students communicate with friends around the world.", isTrue: true, explanation: "Học tiếng Anh giúp các con giao tiếp tốt hơn với bạn bè quốc tế." }
      ],
      matching: [
        { id: "m_1", left: "school bag", right: "cặp sách" },
        { id: "m_2", left: "uniform", right: "đồng phục" },
        { id: "m_3", left: "calculator", right: "máy tính cầm tay" },
        { id: "m_4", left: "compass", right: "com-pa" },
        { id: "m_5", left: "classmate", right: "bạn cùng lớp" },
        { id: "m_6", left: "pencil sharpener", right: "gọt bút chì" },
        { id: "m_7", left: "playground", right: "sân trường" },
        { id: "m_8", left: "excited", right: "hào hứng" },
        { id: "m_9", left: "beautiful", right: "xinh đẹp" },
        { id: "m_10", left: "wear", right: "mặc (trang phục)" }
      ]
    }
  }
};

const getTomorrowISO = (): string => {
  const tmr = new Date();
  tmr.setDate(tmr.getDate() + 1);
  tmr.setHours(23, 59, 0, 0);
  return tmr.toISOString();
};

const DEFAULT_ASSIGNMENTS: Assignment[] = [];

/**
 * Kiểm tra xem bài tập có thuộc về lớp học chỉ định hay không.
 * Đảm bảo tuyệt đối: Học sinh lớp nào CHỈ nhìn thấy bài tập của lớp đó (hoặc bài giao toàn khối).
 */
export const isAssignmentForClass = (
  a: Assignment,
  classIdOrName?: string,
  classes?: ClassRoom[]
): boolean => {
  if (!a) return false;
  if (!classIdOrName || classIdOrName === 'ALL') return true;

  // 1. Giao cho toàn khối / tất cả các lớp
  if (a.targetClassId === 'ALL' || a.targetClassName === 'Tất cả các lớp') return true;
  if (Array.isArray(a.targetClassIds) && a.targetClassIds.includes('ALL')) return true;
  if (Array.isArray(a.targetClassNames) && a.targetClassNames.some(cn => {
    const cnl = (cn || '').toLowerCase().trim();
    return cnl === 'all' || cnl === 'tất cả các lớp' || cnl === 'tat ca cac lop' || cnl === 'toàn khối';
  })) return true;

  const norm = (str?: string) => (str || '').toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();
  const targetNorm = norm(classIdOrName);
  const allCls = classes || getClasses();
  const matchedClass = allCls.find(c => c.id === classIdOrName || norm(c.name) === targetNorm);

  const targetId = matchedClass ? matchedClass.id : classIdOrName;
  const targetNameNorm = matchedClass ? norm(matchedClass.name) : targetNorm;

  // 2. Khớp trực tiếp theo Class ID
  if (a.targetClassId && (a.targetClassId === targetId || a.targetClassId === classIdOrName)) return true;
  if (Array.isArray(a.targetClassIds) && (a.targetClassIds.includes(targetId) || a.targetClassIds.includes(classIdOrName))) return true;

  // 3. Khớp trực tiếp theo Class Name
  if (a.targetClassName && norm(a.targetClassName) === targetNameNorm) return true;
  if (Array.isArray(a.targetClassNames) && a.targetClassNames.some(cn => norm(cn) === targetNameNorm)) return true;

  // 4. Nếu targetClassName là chuỗi gồm nhiều lớp phân tách dấu phẩy (vd: "Lớp 6A1, Lớp 6A2")
  if (a.targetClassName && a.targetClassName.includes(',')) {
    const parts = a.targetClassName.split(',');
    if (parts.some(p => norm(p) === targetNameNorm)) return true;
  }

  return false;
};

// ==================== ASSIGNMENT MANAGEMENT ====================
export const getDeletedAssignments = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DELETED_ASSIGNMENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveDeletedAssignments = (ids: string[]): void => {
  if (typeof window === 'undefined') return;
  const deduped = Array.from(new Set(ids));
  localStorage.setItem(DELETED_ASSIGNMENTS_KEY, JSON.stringify(deduped));
  syncToFirebaseIfConfigured('deleted_assignments', deduped);
};

export const getAssignments = (classId?: string): Assignment[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ASSIGNMENTS_KEY);
    if (!raw) return [];
    const all: Assignment[] = JSON.parse(raw);
    if (!Array.isArray(all) || all.length === 0) return [];

    const deletedIds = new Set(getDeletedAssignments());

    // Filter out legacy default assignment or deleted assignments
    const cleanAll = all.filter(a => a && a.id && a.id !== 'assign_unit1_school' && !deletedIds.has(a.id));

    // Auto-repair any assignments that may have had empty or incomplete exercises
    const sanitizedAll: Assignment[] = cleanAll.map(a => {
      const mega = a.lessonPlan?.practice?.megaTest;
      const mcCount = mega?.multipleChoice?.length || 0;
      const fillCount = mega?.fillBlank?.length || 0;
      const scrambleCount = mega?.scramble?.length || 0;
      const vocabCount = mega?.vocabTranslation?.length || 0;
      const tfCount = mega?.trueFalse?.length || 0;
      const lisCount = a.lessonPlan?.practice?.listening?.length || 0;

      // If all megaTest exercises are 0 or missing, synthesize them from core lesson
      if (!a.lessonPlan?.practice || !mega || (mcCount === 0 && fillCount === 0 && scrambleCount === 0 && vocabCount === 0 && tfCount === 0)) {
        return {
          ...a,
          lessonPlan: {
            ...a.lessonPlan,
            practice: ensureCompletePracticeContent(a.lessonPlan?.practice, a.lessonPlan || {})
          }
        };
      }
      return a;
    });

    // Multi-class filter: match if targeted for ALL, specific class ID, specific class name, or in targetClassIds / targetClassNames
    const allCls = getClasses();
    const filtered = (classId && classId !== 'ALL')
      ? sanitizedAll.filter(a => isAssignmentForClass(a, classId, allCls))
      : sanitizedAll;

    // Sort newest first by assignedDate or createdAt
    return filtered.sort((a, b) => {
      const timeA = new Date(a.createdAt || a.assignedDate).getTime();
      const timeB = new Date(b.createdAt || b.assignedDate).getTime();
      return timeB - timeA;
    });
  } catch {
    return [];
  }
};

export const getAssignmentById = (id: string): Assignment | undefined => {
  const all = getAssignments();
  return all.find(a => a.id === id);
};

export const saveAssignment = (assignment: Assignment): void => {
  if (typeof window === 'undefined') return;

  // Guarantee that practice content has complete non-empty exercises before saving
  const safeLessonPlan: LessonPlan = {
    ...assignment.lessonPlan,
    practice: ensureCompletePracticeContent(assignment.lessonPlan?.practice, assignment.lessonPlan || {})
  };

  const now = new Date().toISOString();
  const safeAssignment: Assignment = {
    ...assignment,
    lessonPlan: safeLessonPlan,
    updatedAt: now,
    teacherModifiedAt: now,
    teacherModified: true
  };

  const all = getAssignments();
  const exists = all.some(a => a.id === safeAssignment.id);
  const updated = exists ? all.map(a => a.id === safeAssignment.id ? safeAssignment : a) : [safeAssignment, ...all];
  localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(updated));
  notifySync('assignment_created', safeAssignment);
  syncToFirebaseIfConfigured('assignments', updated);
};

export const deleteAssignment = (id: string): void => {
  if (typeof window === 'undefined') return;
  const all = getAssignments();
  const updated = all.filter(a => a.id !== id);
  localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(updated));

  // Ghi nhận tombstone bài tập đã xóa để đồng bộ Firebase không phục hồi lại bài đã xóa
  const deleted = getDeletedAssignments();
  if (!deleted.includes(id)) {
    saveDeletedAssignments([...deleted, id]);
  }

  notifySync('assignment_deleted', { id });
  syncToFirebaseIfConfigured('assignments', updated);
};

export const updateAssignmentTitle = (id: string, newTitle: string): void => {
  if (typeof window === 'undefined') return;
  const trimmedTitle = newTitle.trim();
  if (!trimmedTitle) return;

  const all = getAssignments();
  const assign = all.find(a => a.id === id);
  if (!assign) return;
  const now = new Date().toISOString();
  const updatedAssign: Assignment = {
    ...assign,
    title: trimmedTitle,
    updatedAt: now,
    teacherModifiedAt: now,
    teacherModified: true
  };
  const updatedList = all.map(a => a.id === id ? updatedAssign : a);
  localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(updatedList));
  notifySync('assignment_updated', updatedAssign);
  syncToFirebaseIfConfigured('assignments', updatedList);

  // Đồng bộ cập nhật tiêu đề trong các bài nộp đã có của học sinh
  try {
    const rawSubs = localStorage.getItem(SUBMISSIONS_KEY);
    if (rawSubs) {
      const subs: Submission[] = JSON.parse(rawSubs);
      if (Array.isArray(subs)) {
        let changed = false;
        const updatedSubs = subs.map(s => {
          if (s.assignmentId === id && s.assignmentTitle !== trimmedTitle) {
            changed = true;
            return { ...s, assignmentTitle: trimmedTitle };
          }
          return s;
        });
        if (changed) {
          localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(updatedSubs));
          notifySync('submissions_updated', updatedSubs);
          syncToFirebaseIfConfigured('submissions', updatedSubs);
        }
      }
    }
  } catch (e) {
    console.warn('Error updating submission titles:', e);
  }
};

// ==================== DEADLINE STATUS CALCULATION ====================
export interface DeadlineInfo {
  status: DeadlineStatus;
  label: string;
  badgeClass: string;
  remainingText: string;
  isExpired: boolean;
  isDueSoon: boolean;
}

export const calculateDeadlineStatus = (dueDateStr: string, hasSubmitted = false): DeadlineInfo => {
  if (hasSubmitted) {
    return {
      status: 'submitted',
      label: 'Đã hoàn thành',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-1 ring-emerald-200',
      remainingText: 'Đã nộp bài thành công',
      isExpired: false,
      isDueSoon: false
    };
  }

  if (!dueDateStr) {
    return {
      status: 'active',
      label: 'Còn thời hạn',
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-300',
      remainingText: 'Không giới hạn thời gian',
      isExpired: false,
      isDueSoon: false
    };
  }

  const now = Date.now();
  const due = new Date(dueDateStr).getTime();
  const diffMs = due - now;

  if (diffMs <= 0) {
    return {
      status: 'expired',
      label: 'Hết hạn',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-300 ring-1 ring-rose-200',
      remainingText: 'Đã quá hạn nộp bài',
      isExpired: true,
      isDueSoon: false
    };
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  const remainingHours = diffHours % 24;

  let timeString = '';
  if (diffDays > 0) {
    timeString = `Còn ${diffDays} ngày ${remainingHours > 0 ? remainingHours + ' giờ' : ''}`;
  } else {
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    timeString = `Còn ${diffHours} giờ ${diffMinutes} phút`;
  }

  // If less than 24 hours remaining -> Due Soon (Sắp hết hạn)
  if (diffHours < 24) {
    return {
      status: 'due_soon',
      label: 'Sắp hết hạn',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-400 ring-2 ring-amber-300 animate-pulse',
      remainingText: timeString,
      isExpired: false,
      isDueSoon: true
    };
  }

  return {
    status: 'active',
    label: 'Còn thời hạn',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    remainingText: timeString,
    isExpired: false,
    isDueSoon: false
  };
};

const DEFAULT_SUBMISSIONS: Submission[] = [];

// ==================== SUBMISSIONS MANAGEMENT ====================
export const getSubmissions = (assignmentId?: string): Submission[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SUBMISSIONS_KEY);
    let all: Submission[] = [];
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        all = parsed;
      }
    }
    const defaultEval = (score: number) => {
      if (score >= 9) return { text: 'Xuất sắc', emoji: '🌟', level: 'EXCELLENT', praise: 'Con làm bài rất xuất sắc! Cô rất tự hào về con!' };
      if (score >= 8) return { text: 'Giỏi', emoji: '🎉', level: 'GREAT', praise: 'Con làm bài rất tốt, tiếp tục phát huy nhé!' };
      if (score >= 6.5) return { text: 'Khá', emoji: '👍', level: 'GOOD', praise: 'Con đã nỗ lực hoàn thành bài!' };
      if (score >= 5) return { text: 'Đạt', emoji: '👌', level: 'PASS', praise: 'Con đã hoàn thành bài tập, cố gắng thêm nhé!' };
      return { text: 'Cố gắng', emoji: '💪', level: 'EFFORT', praise: 'Con chú ý ôn lại bài để làm tốt hơn nhé!' };
    };

    // Filter out legacy mock seed submissions and defensively sanitize each record
    const cleanAll = all
      .filter(s => s && typeof s === 'object' && s.id && !String(s.id).startsWith('sub_seed_'))
      .map(s => {
        const score = typeof s.score === 'number' && !isNaN(s.score) ? s.score : 0;
        const fallback = defaultEval(score);
        const evalObj = s.evaluation && typeof s.evaluation === 'object' ? {
          text: s.evaluation.text || fallback.text,
          emoji: s.evaluation.emoji || fallback.emoji,
          level: s.evaluation.level || fallback.level,
          praise: s.evaluation.praise || fallback.praise
        } : fallback;

        return {
          ...s,
          studentName: (s.studentName ? String(s.studentName) : 'Học Sinh').trim(),
          studentClass: (s.studentClass ? String(s.studentClass) : '').trim(),
          score,
          totalQuestions: typeof s.totalQuestions === 'number' && !isNaN(s.totalQuestions) && s.totalQuestions > 0 ? s.totalQuestions : 55,
          totalCorrect: typeof s.totalCorrect === 'number' && !isNaN(s.totalCorrect) && (s.totalCorrect > 0 || score === 0)
            ? s.totalCorrect
            : (score > 0 ? Math.round((score / 10) * (s.totalQuestions || 55)) : 0),
          submittedAt: s.submittedAt || new Date().toISOString(),
          evaluation: evalObj
        };
      });

    const filtered = assignmentId ? cleanAll.filter(s => s.assignmentId === assignmentId) : cleanAll;
    return filtered.sort((a, b) => {
      const timeA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const timeB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
    });
  } catch {
    return [];
  }
};

export interface RealLearningStats {
  totalVisits: number;
  todayVisits: number;
  myVisits: number;
  activeStudentsCount: number;
  averageScore: number;
}

export const getRealLearningStats = (currentStudentName?: string): RealLearningStats => {
  const submissions = getSubmissions();
  const todayStr = getTodayString();

  // Also include lesson practice history
  let historyRecords: any[] = [];
  try {
    const rawHistory = localStorage.getItem('lesson_history');
    if (rawHistory) {
      historyRecords = JSON.parse(rawHistory) || [];
    }
  } catch {}

  const totalSubmissions = submissions.length;
  const totalHistory = historyRecords.length;
  const totalVisits = totalSubmissions + totalHistory;

  const todaySubmissions = submissions.filter(s => (s.submittedAt || '').startsWith(todayStr)).length;
  const todayHistory = historyRecords.filter((r: any) => (r.date || '').startsWith(todayStr)).length;
  const todayVisits = todaySubmissions + todayHistory;

  const uniqueStudents = new Set(submissions.map(s => s.studentName.trim().toLowerCase())).size;

  let myVisits = 0;
  if (currentStudentName && currentStudentName.trim()) {
    const cleanCurrent = currentStudentName.trim().toLowerCase();
    const mySubs = submissions.filter(s => s.studentName.trim().toLowerCase() === cleanCurrent).length;
    myVisits = mySubs;
  } else {
    myVisits = uniqueStudents;
  }

  const scores = submissions.map(s => s.score);
  const averageScore = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;

  return {
    totalVisits,
    todayVisits,
    myVisits,
    activeStudentsCount: uniqueStudents,
    averageScore
  };
};

export const getStudentSubmission = (
  assignmentId: string,
  studentNameOrId: string,
  studentId?: string,
  studentClass?: string
): Submission | undefined => {
  const submissions = getSubmissions(assignmentId);
  if (!studentNameOrId && !studentId) return undefined;

  // Tránh tài khoản chung 'Học Sinh' hoặc 'hocsinh' khóa nhầm các học sinh khác
  const isGeneric = (str?: string) => {
    const s = (str || '').toLowerCase().trim();
    return s === 'học sinh' || s === 'hocsinh' || s === 'hoc sinh';
  };

  const clean = (str?: string) => (str || '').trim().toLowerCase().normalize('NFC');
  const normClass = (str?: string) => (str || '').trim().toLowerCase().replace(/^(lớp|lop)\s*/i, '');
  const targetName = clean(studentNameOrId);
  const targetId = studentId || (studentNameOrId.startsWith('std_') ? studentNameOrId : undefined);
  const targetClass = normClass(studentClass);

  // 1. Khớp tuyệt đối theo studentId (ngoại trừ student_chung)
  if (targetId && targetId !== 'student_chung') {
    const byId = submissions.find(s => s.studentId === targetId);
    if (byId) return byId;
  }

  // Nếu là tên chung 'Học Sinh' thì không chặn chéo
  if (isGeneric(studentNameOrId)) {
    return undefined;
  }

  // 2. Khớp theo Tên và Lớp (nếu có thông tin lớp)
  const byNameAndClass = submissions.find(s => {
    const nameMatch = clean(s.studentName) === targetName;
    if (!nameMatch) return false;
    if (targetClass && s.studentClass) {
      return normClass(s.studentClass) === targetClass;
    }
    return true;
  });
  if (byNameAndClass) return byNameAndClass;

  // 3. Khớp thông minh bằng isStudentMatch kèm kiểm tra lớp
  return submissions.find(s => {
    if (targetClass && s.studentClass && normClass(s.studentClass) !== targetClass) {
      return false;
    }
    return isStudentMatch({ id: targetId, name: studentNameOrId }, s);
  });
};

// ==================== ADMIN NOTIFICATION SYSTEM ====================
export interface AdminNotificationItem {
  id: string;
  submissionId: string;
  studentName: string;
  studentClass: string;
  assignmentTitle: string;
  score: number;
  totalCorrect: number;
  totalQuestions: number;
  submittedAt: string;
  isRead: boolean;
  createdAt: number;
}

const ADMIN_NOTIFICATIONS_KEY = 'nextgen_admin_notifications';

export const getAdminNotifications = (): AdminNotificationItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ADMIN_NOTIFICATIONS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

export const saveAdminNotifications = (list: AdminNotificationItem[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ADMIN_NOTIFICATIONS_KEY, JSON.stringify(list.slice(0, 100)));
  } catch {}
};

export const playNotificationSound = (): void => {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(698.46, t); // F5
    osc.frequency.setValueAtTime(880, t + 0.08); // A5
    osc.frequency.setValueAtTime(1046.5, t + 0.16); // C6

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  } catch {
    // Ignore audio permission restrictions before first interaction
  }
};

export const addAdminNotification = (sub: Submission): void => {
  if (!sub || !sub.studentName) return;
  const current = getAdminNotifications();
  // Don't add duplicate
  if (sub.id && current.some(n => n.submissionId === sub.id)) return;

  const notif: AdminNotificationItem = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
    submissionId: sub.id,
    studentName: sub.studentName,
    studentClass: sub.studentClass || '',
    assignmentTitle: sub.assignmentTitle || sub.topic || 'Bài tập',
    score: typeof sub.score === 'number' ? sub.score : 0,
    totalCorrect: sub.totalCorrect ?? 0,
    totalQuestions: sub.totalQuestions ?? 55,
    submittedAt: sub.submittedAt || new Date().toISOString(),
    isRead: false,
    createdAt: Date.now()
  };

  const updated = [notif, ...current].slice(0, 100);
  saveAdminNotifications(updated);
  notifySync('new_admin_notification', notif);
  playNotificationSound();
};

export const markNotificationsAsRead = (): void => {
  const current = getAdminNotifications();
  const updated = current.map(n => ({ ...n, isRead: true }));
  saveAdminNotifications(updated);
  notifySync('admin_notifications_read');
};

export const clearAdminNotifications = (): void => {
  saveAdminNotifications([]);
  notifySync('admin_notifications_read');
};

export const saveSubmission = async (
  submission: Submission
): Promise<{ success: boolean; error?: string }> => {
  if (typeof window === 'undefined') return { success: false, error: 'Môi trường không hỗ trợ' };
  const all = getSubmissions();

  // CHÍNH SÁCH QUAN TRỌNG: Link cô giao học sinh chỉ được làm 1 lần duy nhất!
  // Kiểm tra xem học sinh này đã có bài nộp cho assignmentId này chưa
  const existing = all.find(s => {
    if (s.assignmentId !== submission.assignmentId) return false;
    if (submission.studentId && s.studentId && s.studentId === submission.studentId) return true;
    if (isStudentMatch({ id: submission.studentId, name: submission.studentName }, s)) {
      // Nếu có thông tin lớp và 2 lớp khác nhau thì là 2 học sinh khác nhau
      if (submission.studentClass && s.studentClass) {
        const norm = (str?: string) => (str || '').toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();
        if (norm(submission.studentClass) !== norm(s.studentClass)) {
          return false;
        }
      }
      return true;
    }
    return false;
  });

  if (existing) {
    console.warn(
      `[saveSubmission] Học sinh "${submission.studentName}" đã nộp bài trước đó (${existing.submittedAt}). Hệ thống bảo toàn lần nộp đầu tiên và không cho phép làm lại!`
    );
    return { success: false, error: 'Học sinh đã nộp bài trước đó. Hệ thống bảo toàn lần nộp đầu tiên!' };
  }

  const score = typeof submission.score === 'number' && !isNaN(submission.score) ? submission.score : 0;
  const totalQuestions = typeof submission.totalQuestions === 'number' && submission.totalQuestions > 0 ? submission.totalQuestions : 55;
  const totalCorrect = typeof submission.totalCorrect === 'number' && (submission.totalCorrect > 0 || score === 0)
    ? submission.totalCorrect
    : (score > 0 ? Math.round((score / 10) * totalQuestions) : 0);

  const safeEval = submission.evaluation && typeof submission.evaluation === 'object' ? {
    text: submission.evaluation.text || 'Hoàn thành',
    emoji: submission.evaluation.emoji || '⭐',
    level: submission.evaluation.level || 'GOOD',
    praise: submission.evaluation.praise || 'Đã hoàn thành bài tập'
  } : {
    text: score >= 8 ? 'Xuất sắc' : score >= 5 ? 'Đạt' : 'Cố gắng',
    emoji: score >= 8 ? '🌟' : score >= 5 ? '👍' : '💪',
    level: score >= 8 ? 'EXCELLENT' : score >= 5 ? 'PASS' : 'EFFORT',
    praise: 'Đã hoàn thành bài tập'
  };

  const safeSubmission: Submission = {
    ...submission,
    score,
    totalQuestions,
    totalCorrect,
    evaluation: safeEval
  };

  const updated = [safeSubmission, ...all];
  try {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('LocalStorage save failed:', err);
  }

  // Thêm vào thông báo admin và phát tín hiệu sync
  addAdminNotification(safeSubmission);
  notifySync('submission_created', safeSubmission);

  // Push single submission directly to Firebase (safe atomic update, eliminates overwrite risk)
  const cloudSynced = await syncSingleSubmissionToFirebase(safeSubmission);
  return { success: cloudSynced };
};

export const deleteSubmission = (submissionId: string): void => {
  if (typeof window === 'undefined') return;
  const all = getSubmissions();
  const updated = all.filter(s => s.id !== submissionId);
  try {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('LocalStorage delete failed:', err);
  }
  notifySync('submission_deleted', { id: submissionId });

  // Atomic DELETE from Firebase to prevent overwriting cloud state with local state
  const cfg = getFirebaseConfig();
  if (cfg && cfg.databaseURL) {
    const cleanBase = cfg.databaseURL.replace(/\/+$/, '');
    const authParam = cfg.apiKey ? `?auth=${cfg.apiKey}` : '';
    fetch(`${cleanBase}/submissions/${submissionId}.json${authParam}`, {
      method: 'DELETE'
    }).catch(err => {
      console.warn('Firebase atomic DELETE submission error:', err);
    });
  }
};

// ==================== DAILY SUMMARY & HIGH PERFORMERS ====================
export const getDailySubmissions = (dateStr?: string, classId?: string): Submission[] => {
  const all = getSubmissions();
  const targetDate = dateStr || getTodayString();

  return all.filter(s => {
    const subDate = getLocalDateString(s.submittedAt);
    const matchDate = !dateStr || dateStr === 'ALL' || subDate === targetDate;
    const matchClass = !classId || classId === 'ALL' || s.studentClass === classId;
    return matchDate && matchClass;
  });
};

export const getDailySummary = (dateStr?: string, classId?: string, assignmentId?: string): DailySummary => {
  const targetDate = dateStr || getTodayString();
  let subs = getSubmissions();

  // 1. Lọc theo bài tập nếu có
  if (assignmentId && assignmentId !== 'ALL') {
    subs = subs.filter(s => s.assignmentId === assignmentId);
    // Khi chọn 1 bài tập cụ thể, KHÔNG loại bỏ bài nộp của học sinh theo ngày,
    // đảm bảo toàn bộ học sinh đã làm bài kiểm tra/bài tập này đều được ghi nhận đầy đủ!
  } else if (dateStr && dateStr !== 'ALL') {
    subs = subs.filter(s => getLocalDateString(s.submittedAt) === targetDate);
  }

  const isAll = !classId || classId === 'ALL';
  const norm = (str?: string) => (str || '').toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();

  // Xác định danh sách học sinh:
  let students: Student[] = [];
  if (!isAll) {
    students = getStudents(classId);
  } else if (assignmentId && assignmentId !== 'ALL') {
    // Nếu chưa chọn lớp nhưng đang chọn 1 bài tập cụ thể:
    // Kiểm tra xem bài tập đó giao cho lớp nào thì chỉ tính sĩ số của lớp đó (không bị đội lên 390 học sinh!)
    const allAssigns = getAssignments();
    const assignObj = allAssigns.find(a => a.id === assignmentId);
    if (assignObj && assignObj.targetClassId && assignObj.targetClassId !== 'ALL') {
      students = getStudents(assignObj.targetClassId);
    } else if (assignObj && assignObj.targetClassName && assignObj.targetClassName !== 'Tất cả các lớp') {
      students = getStudents(assignObj.targetClassName);
    } else {
      students = getStudents();
    }
  } else {
    students = getStudents();
  }

  if (!isAll) {
    const classObj = getClasses().find(c => c.id === classId || norm(c.name) === norm(classId));
    const targetClassNameNorm = classObj ? norm(classObj.name) : norm(classId);

    subs = subs.filter(s => {
      // Khớp học sinh có trong danh sách lớp
      if (students.some(std => isStudentMatch(std, s))) return true;
      // Hoặc tên lớp của bài nộp trùng với lớp đang chọn
      if (s.studentClass && (norm(s.studentClass) === targetClassNameNorm || s.studentClass === classId)) return true;
      return false;
    });
  } else if (assignmentId && assignmentId !== 'ALL' && students.length > 0 && students.length < 300) {
    // Khi chọn bài tập giao cho lớp cụ thể mà chưa chọn dropdown lớp, chỉ lấy bài nộp của các học sinh thuộc lớp đó
    subs = subs.filter(s => {
      if (students.some(std => isStudentMatch(std, s))) return true;
      const assignObj = getAssignments().find(a => a.id === assignmentId);
      if (assignObj?.targetClassName && s.studentClass && norm(s.studentClass) === norm(assignObj.targetClassName)) return true;
      return false;
    });
  }

  // Tính toán số liệu thống kê chuẩn theo TỪNG HỌC SINH DUY NHẤT (không bị nhân đôi nếu 1 bạn nộp nhiều lần)
  const uniqueStudentScores: number[] = [];

  if (students.length > 0 && (!isAll || (assignmentId && assignmentId !== 'ALL' && students.length < 300))) {
    // Với lớp cụ thể (hoặc bài tập giao cho lớp cụ thể): tính theo từng học sinh chính thức của lớp
    students.forEach(std => {
      const studentSubs = subs.filter(s => isStudentMatch(std, s));
      if (studentSubs.length > 0) {
        const bestScore = Math.max(...studentSubs.map(s => s.score));
        uniqueStudentScores.push(bestScore);
      }
    });
    // Thêm các bài nộp thuộc lớp mà học sinh chưa có trong danh mục chính thức (nếu có)
    const matchedStdIds = new Set<string>();
    subs.forEach(s => {
      if (!s || typeof s !== 'object') return;
      const matched = students.some(std => isStudentMatch(std, s));
      if (!matched) {
        const rawName = s.studentName ? String(s.studentName).trim() : 'Học Sinh';
        const key = (s.studentId && String(s.studentId).trim()) || normalizeStudentName(rawName) || rawName.toLowerCase() || (s.id ? String(s.id) : 'unknown');
        if (!matchedStdIds.has(key)) {
          matchedStdIds.add(key);
          const score = typeof s.score === 'number' && !isNaN(s.score) ? s.score : 0;
          uniqueStudentScores.push(score);
        }
      }
    });
  } else {
    // Với tất cả các lớp: nhóm theo từng học sinh
    const studentGroupMap = new Map<string, number[]>();
    subs.forEach(s => {
      if (!s || typeof s !== 'object') return;
      const rawName = s.studentName ? String(s.studentName).trim() : 'Học Sinh';
      const key = (s.studentId && String(s.studentId).trim()) || normalizeStudentName(rawName) || rawName.toLowerCase() || (s.id ? String(s.id) : 'unknown');
      if (!studentGroupMap.has(key)) studentGroupMap.set(key, []);
      const score = typeof s.score === 'number' && !isNaN(s.score) ? s.score : 0;
      studentGroupMap.get(key)!.push(score);
    });
    studentGroupMap.forEach(scores => {
      uniqueStudentScores.push(Math.max(...scores));
    });
  }

  const totalSubmitted = uniqueStudentScores.length;
  const totalAssigned = students.length > 0 ? students.length : totalSubmitted;
  const averageScore = totalSubmitted > 0 ? Math.round((uniqueStudentScores.reduce((a, b) => a + b, 0) / totalSubmitted) * 10) / 10 : 0;
  const highestScore = totalSubmitted > 0 ? Math.max(...uniqueStudentScores) : 0;
  const lowestScore = totalSubmitted > 0 ? Math.min(...uniqueStudentScores) : 0;
  const submissionRate = totalAssigned > 0 ? Math.min(100, Math.round((totalSubmitted / totalAssigned) * 100)) : 0;

  return {
    date: targetDate,
    totalAssigned,
    totalSubmitted,
    averageScore,
    highestScore,
    lowestScore,
    submissionRate,
    submissions: subs
  };
};

/**
 * Filter & sort students with high performance (>= 8.0)
 * Returns top performers with rank badge
 */
export interface TopPerformer extends Submission {
  rank: number;
  rankBadge: string;
  isPerfect: boolean;
}

export const getTopPerformers = (submissions: Submission[], threshold = 8.0): TopPerformer[] => {
  if (!Array.isArray(submissions)) return [];
  // Nhóm theo từng học sinh để 1 bạn nộp nhiều lần chỉ vinh danh 1 lần với điểm cao nhất
  const studentBestMap = new Map<string, Submission>();
  submissions.forEach(s => {
    if (!s || typeof s !== 'object') return;
    const score = typeof s.score === 'number' && !isNaN(s.score) ? s.score : 0;
    if (score < threshold) return;
    const rawName = s.studentName ? String(s.studentName).trim() : 'Học Sinh';
    const key = (s.studentId && String(s.studentId).trim()) || normalizeStudentName(rawName) || rawName.toLowerCase() || (s.id ? String(s.id) : 'unknown');
    const existing = studentBestMap.get(key);
    const totalCorrect = typeof s.totalCorrect === 'number' ? s.totalCorrect : 0;
    const existingCorrect = existing && typeof existing.totalCorrect === 'number' ? existing.totalCorrect : 0;
    if (!existing || score > existing.score || (score === existing.score && totalCorrect > existingCorrect)) {
      studentBestMap.set(key, {
        ...s,
        studentName: rawName,
        score,
        totalCorrect
      });
    }
  });

  const uniqueBestList = Array.from(studentBestMap.values());

  // Sort descending by score, then by totalCorrect, then by earliest submittedAt
  const sorted = uniqueBestList.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aCorr = a.totalCorrect || 0;
    const bCorr = b.totalCorrect || 0;
    if (bCorr !== aCorr) return bCorr - aCorr;
    const aTime = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
    const bTime = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
    return (isNaN(aTime) ? 0 : aTime) - (isNaN(bTime) ? 0 : bTime);
  });

  return sorted.map((s, index) => {
    const rank = index + 1;
    let rankBadge = '⭐';
    if (rank === 1) rankBadge = '🥇 Top 1';
    else if (rank === 2) rankBadge = '🥈 Top 2';
    else if (rank === 3) rankBadge = '🥉 Top 3';
    else rankBadge = `⭐ #${rank}`;

    return {
      ...s,
      rank,
      rankBadge,
      isPerfect: s.score >= 9.5
    };
  });
};

export const forceCloudSyncNow = async (): Promise<boolean> => {
  try {
    const updated = await pullAllFromFirebase();
    notifySync('cloud_sync_completed');
    return updated;
  } catch (err) {
    console.warn('Manual cloud sync error:', err);
    return false;
  }
};

/**
 * Initialize cloud sync with Firebase:
 * 1. Seeds Firebase if the cloud database is empty.
 * 2. Pulls latest data from Firebase (classes, students, assignments, submissions).
 * 3. Starts Real-time SSE listener for instant submission push (sub-second latency).
 * 4. Starts background interval polling (every 30s) as reliable fallback.
 */
export const initCloudSync = (): (() => void) => {
  ensureNextgenMasterClean();
  let isMounted = true;

  const doSync = async () => {
    try {
      // Seed if empty
      await seedFirebaseIfEmpty({
        classes: getClasses(),
        students: getStudents(),
        assignments: getAssignments(),
        submissions: getSubmissions()
      });

      // Pull latest
      const updated = await pullAllFromFirebase();
      if (updated && isMounted) {
        notifySync('cloud_sync_completed');
      }
    } catch (e) {
      console.warn('Initial cloud sync error:', e);
    }
  };

  // Run initial sync
  doSync();

  // 1. Real-time Native SSE EventSource Listener:
  // Instantly receives submissions without waiting for polling
  const unsubscribeRealtime = subscribeToFirebaseRealtime((newSub) => {
    if (!isMounted || !newSub || !newSub.id) return;
    try {
      const raw = localStorage.getItem(SUBMISSIONS_KEY);
      let list: Submission[] = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) list = [];

      const subScore = typeof newSub.score === 'number' && !isNaN(newSub.score) ? newSub.score : 0;
      const subTotalQ = typeof newSub.totalQuestions === 'number' && newSub.totalQuestions > 0 ? newSub.totalQuestions : 55;
      const subTotalC = typeof newSub.totalCorrect === 'number' && (newSub.totalCorrect > 0 || subScore === 0)
        ? newSub.totalCorrect
        : (subScore > 0 ? Math.round((subScore / 10) * subTotalQ) : 0);

      const sanitizedSub: Submission = {
        ...newSub,
        score: subScore,
        totalQuestions: subTotalQ,
        totalCorrect: subTotalC
      };

      const existingIndex = list.findIndex(s => s && s.id === sanitizedSub.id);
      const isBrandNew = existingIndex < 0;

      if (existingIndex >= 0) {
        list[existingIndex] = { ...list[existingIndex], ...sanitizedSub };
      } else {
        list.unshift(sanitizedSub);
      }

      localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(list));
      notifySync('submission_created', sanitizedSub);
      notifySync('cloud_sync_completed');

      if (isBrandNew) {
        addAdminNotification(sanitizedSub);
      }
    } catch (err) {
      console.warn('Failed to apply real-time submission update:', err);
    }
  });

  // 2. High-speed submissions-only polling fallback (every 10s)
  // Ensures submissions appear within seconds even if SSE is temporarily blocked
  const fastSubmissionsTimer = setInterval(async () => {
    if (!isMounted) return;
    try {
      const hasNew = await pullSubmissionsOnlyFromFirebase();
      if (hasNew && isMounted) {
        notifySync('submission_created');
        notifySync('cloud_sync_completed');
      }
    } catch {
      // Quiet catch
    }
  }, 10000);

  // 3. Background full collections polling fallback every 25 seconds
  const timer = setInterval(async () => {
    if (!isMounted) return;
    try {
      const updated = await pullAllFromFirebase();
      if (updated && isMounted) {
        notifySync('cloud_sync_completed');
      }
    } catch (e) {
      // Quiet catch
    }
  }, 25000);

  return () => {
    isMounted = false;
    clearInterval(fastSubmissionsTimer);
    clearInterval(timer);
    unsubscribeRealtime();
  };
};

// ==================== MONTHLY REPORT MANAGEMENT ====================
export const getMonthlyReports = (classId?: string): MonthlyReport[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(MONTHLY_REPORTS_KEY);
    if (!raw) return [];
    const all: MonthlyReport[] = JSON.parse(raw);
    if (!Array.isArray(all)) return [];
    if (classId && classId !== 'ALL') {
      return all.filter(r => r.classId === classId);
    }
    return all;
  } catch {
    return [];
  }
};

export const getMonthlyReport = (classId: string, month: number, year: number): MonthlyReport | undefined => {
  const all = getMonthlyReports();
  return all.find(r => r.classId === classId && r.month === month && r.year === year);
};

export const saveMonthlyReport = (report: MonthlyReport): void => {
  if (typeof window === 'undefined') return;
  const all = getMonthlyReports();
  const isMatch = (r: MonthlyReport) =>
    r.id === report.id ||
    (r.classId === report.classId && Number(r.month) === Number(report.month) && Number(r.year) === Number(report.year));
  const exists = all.some(isMatch);
  const updated = exists ? all.map(r => isMatch(r) ? report : r) : [report, ...all];
  localStorage.setItem(MONTHLY_REPORTS_KEY, JSON.stringify(updated));
  notifySync('monthly_report_updated', report);
  syncToFirebaseIfConfigured('monthly_reports', updated);
};

export const deleteMonthlyReport = (id: string): void => {
  if (typeof window === 'undefined') return;
  const all = getMonthlyReports();
  const updated = all.filter(r => r.id !== id);
  localStorage.setItem(MONTHLY_REPORTS_KEY, JSON.stringify(updated));
  notifySync('monthly_report_deleted', { id });
  syncToFirebaseIfConfigured('monthly_reports', updated);
};

export const parseScoreNumber = (val: any): number | null => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return isNaN(val) ? null : val;
  }
  const str = String(val).trim().replace(',', '.');
  if (str === '' || str.toLowerCase() === 'x') return null;
  const num = parseFloat(str);
  return (!isNaN(num) && num >= 0 && num <= 10) ? num : null;
};

/**
 * Calculate arithmetic mean of valid scores (excluding 'x' and empty strings)
 * Rounded to 2 decimal places. Handles exact strings like "8.5", "8,5", "9.0", 10.
 */
export const calculateStudentMonthlyAverage = (
  scores: Record<string, Record<string, number | string>>
): number => {
  const numericScores: number[] = [];
  if (!scores) return 0;
  Object.values(scores).forEach(sessionCols => {
    if (!sessionCols) return;
    Object.values(sessionCols).forEach(val => {
      const parsed = parseScoreNumber(val);
      if (parsed !== null) {
        numericScores.push(parsed);
      }
    });
  });

  if (numericScores.length === 0) return 0;
  const sum = numericScores.reduce((acc, s) => acc + s, 0);
  return Math.round((sum / numericScores.length) * 100) / 100;
};

/**
 * Tự động đồng bộ điểm Link từ các bài làm / bài nộp hệ thống vào Báo cáo Tháng
 */
export const syncLinkScoresForMonthlyReport = (
  classId: string,
  month: number,
  year: number,
  sessions: MonthlySessionConfig[],
  studentScores: StudentMonthlyScore[],
  forceOverwrite: boolean = false
): { updatedScores: StudentMonthlyScore[]; syncedCount: number } => {
  const allSubmissions = getSubmissions();
  const classAssignments = getAssignments(classId);

  // Helper date convert DMY -> YMD
  const toYMD = (dmy: string): string => {
    if (!dmy) return '';
    const parts = dmy.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return dmy;
  };

  const monthStr = String(month).padStart(2, '0');
  const monthPrefix = `${year}-${monthStr}`;

  // Assignments targeted for this class in this month/year, sorted by date asc
  const monthAssignments = classAssignments
    .filter(a => {
      const d = a.assignedDate || (a.createdAt ? a.createdAt.slice(0, 10) : '');
      return d && d.startsWith(monthPrefix);
    })
    .sort((a, b) => {
      const ta = new Date(a.assignedDate || a.createdAt).getTime();
      const tb = new Date(b.assignedDate || b.createdAt).getTime();
      return ta - tb;
    });

  let syncedCount = 0;

  const updatedScores: StudentMonthlyScore[] = studentScores.map(std => {
    // Find submissions for this student (using full identity: id, name, englishName)
    const studentSubs = allSubmissions.filter(sub => {
      return isStudentMatch({ id: std.studentId, name: std.studentName, englishName: std.englishName }, sub);
    });

    const studentScoresMap = { ...(std.scores || {}) };
    let hasChanges = false;

    sessions.forEach((sess, sessIdx) => {
      const sessScores = { ...(studentScoresMap[sess.id] || {}) };
      const currentLinkScore = sessScores['linkScore'];

      const isCurrentEmpty = currentLinkScore === undefined || currentLinkScore === null || String(currentLinkScore).trim() === '';
      if (!forceOverwrite && !isCurrentEmpty) {
        return; // Không ghi đè nếu giáo viên đã nhập điểm thủ công, trừ khi chọn forceOverwrite
      }

      const sessionDateYMD = toYMD(sess.date);

      // Tìm bài nộp phù hợp nhất theo các cấp độ ưu tiên (luôn chọn bài có điểm cao nhất):
      let matchedSub: Submission | undefined;

      // 1. Khớp bài tập theo ngày giao hoặc hạn nộp trùng với ngày buổi học
      if (sessionDateYMD) {
        const targetAssign = classAssignments.find(a => 
          a.assignedDate === sessionDateYMD || 
          (a.dueDate && a.dueDate.startsWith(sessionDateYMD))
        );
        if (targetAssign) {
          const assignSubs = studentSubs.filter(s => s.assignmentId === targetAssign.id);
          if (assignSubs.length > 0) {
            matchedSub = assignSubs.reduce((best, curr) => (curr.score > best.score ? curr : best));
          }
        }
      }

      // 2. Khớp bài nộp có ngày nộp (theo giờ VN) đúng ngày diễn ra buổi học hoặc ngày liền kề (+1 ngày)
      if (!matchedSub && sessionDateYMD) {
        const dateSubs = studentSubs.filter(s => {
          if (!s.submittedAt) return false;
          const subDate = getLocalDateString(new Date(s.submittedAt));
          if (subDate === sessionDateYMD) return true;
          try {
            const nextDay = new Date(sessionDateYMD);
            nextDay.setDate(nextDay.getDate() + 1);
            if (subDate === getLocalDateString(nextDay)) return true;
          } catch {
            // ignore date parse error
          }
          return false;
        });
        if (dateSubs.length > 0) {
          matchedSub = dateSubs.reduce((best, curr) => (curr.score > best.score ? curr : best));
        }
      }

      // 3. Khớp theo tên/tiêu đề bài tập trùng với chủ đề buổi học hoặc số thứ tự buổi học
      if (!matchedSub && sess.topic) {
        const cleanTopic = sess.topic.toLowerCase().trim();
        const matchedAssigns = classAssignments.filter(a => {
          const cleanTitle = (a.title || '').toLowerCase().trim();
          return cleanTitle.includes(cleanTopic) || cleanTopic.includes(cleanTitle);
        });
        const assignIds = new Set(matchedAssigns.map(a => a.id));
        const topicSubs = studentSubs.filter(s => assignIds.has(s.assignmentId));
        if (topicSubs.length > 0) {
          matchedSub = topicSubs.reduce((best, curr) => (curr.score > best.score ? curr : best));
        }
      }

      // 4. Khớp theo thứ tự bài tập trong tháng tương ứng với thứ tự buổi học
      if (!matchedSub && monthAssignments[sessIdx]) {
        const idxSubs = studentSubs.filter(s => s.assignmentId === monthAssignments[sessIdx].id);
        if (idxSubs.length > 0) {
          matchedSub = idxSubs.reduce((best, curr) => (curr.score > best.score ? curr : best));
        }
      }

      // 5. Nếu chưa có, lấy bài nộp gần nhất của học sinh cho bài tập trong tháng
      if (!matchedSub && studentSubs.length > 0 && monthAssignments.length > 0) {
        const monthAssignIds = new Set(monthAssignments.map(ma => ma.id));
        const relevantSubs = studentSubs.filter(s => monthAssignIds.has(s.assignmentId));
        if (relevantSubs.length > 0 && sessIdx === 0) {
          matchedSub = relevantSubs.reduce((best, curr) => (curr.score > best.score ? curr : best));
        }
      }

      // Nếu tìm thấy bài nộp, gán điểm link chuẩn hóa 10 (CHỈ GHI ĐÈ DUY NHẤT linkScore, giữ nguyên các cột khác)
      if (matchedSub) {
        const rawScore = typeof matchedSub.scaledScore10 === 'number' 
          ? matchedSub.scaledScore10 
          : (typeof matchedSub.score === 'number' ? matchedSub.score : 0);
        if (typeof rawScore === 'number' && !isNaN(rawScore)) {
          const rounded = Math.round(rawScore * 10) / 10;
          const formattedScore = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
          sessScores['linkScore'] = formattedScore;
          studentScoresMap[sess.id] = sessScores;
          hasChanges = true;
          syncedCount++;
        }
      }
    });

    if (hasChanges) {
      return {
        ...std,
        scores: studentScoresMap,
        averageScore: calculateStudentMonthlyAverage(studentScoresMap)
      };
    }
    return std;
  });

  return { updatedScores, syncedCount };
};

// ==================== WEEKLY REPORT AGGREGATOR ====================
export const getWeeklyReports = (classId?: string): WeeklyReportRecord[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(WEEKLY_REPORTS_KEY);
    if (!raw) return [];
    const all: WeeklyReportRecord[] = JSON.parse(raw);
    if (!Array.isArray(all)) return [];
    if (classId && classId !== 'ALL') {
      return all.filter(r => r.classId === classId);
    }
    return all;
  } catch {
    return [];
  }
};

export const getWeeklyReport = (
  classId: string,
  year: number,
  month: number,
  weekNumber: number
): WeeklyReportRecord | undefined => {
  const all = getWeeklyReports();
  return all.find(
    r => r.classId === classId && r.year === year && r.month === month && r.weekNumber === weekNumber
  );
};

export const saveWeeklyReport = (report: WeeklyReportRecord): void => {
  if (typeof window === 'undefined') return;
  const all = getWeeklyReports();
  const exists = all.some(r => r.id === report.id);
  const updated = exists ? all.map(r => (r.id === report.id ? report : r)) : [report, ...all];
  localStorage.setItem(WEEKLY_REPORTS_KEY, JSON.stringify(updated));
  notifySync('weekly_report_updated', report);
  syncToFirebaseIfConfigured('weekly_reports', updated);
};

export const deleteWeeklyReport = (id: string): void => {
  if (typeof window === 'undefined') return;
  const all = getWeeklyReports();
  const updated = all.filter(r => r.id !== id);
  localStorage.setItem(WEEKLY_REPORTS_KEY, JSON.stringify(updated));
  notifySync('weekly_report_deleted', { id });
  syncToFirebaseIfConfigured('weekly_reports', updated);
};

export const calculateStudentWeeklyAverage = (
  scores: Record<string, Record<string, number | string>>
): number => {
  return calculateStudentMonthlyAverage(scores);
};

// ==================== CLASS SCHEDULE MANAGEMENT ====================
export const getClassSchedules = (): ClassScheduleConfig[] => {
  if (typeof window === 'undefined') return DEFAULT_CLASS_SCHEDULES;
  try {
    const raw = localStorage.getItem(CLASS_SCHEDULES_KEY);
    if (!raw) {
      localStorage.setItem(CLASS_SCHEDULES_KEY, JSON.stringify(DEFAULT_CLASS_SCHEDULES));
      return DEFAULT_CLASS_SCHEDULES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Đảm bảo tất cả các lớp chuẩn có trong danh sách
      const merged = [...parsed];
      DEFAULT_CLASS_SCHEDULES.forEach(def => {
        if (!merged.some(m => m.classId === def.classId)) {
          merged.push(def);
        }
      });
      return merged;
    }
    localStorage.setItem(CLASS_SCHEDULES_KEY, JSON.stringify(DEFAULT_CLASS_SCHEDULES));
    return DEFAULT_CLASS_SCHEDULES;
  } catch {
    return DEFAULT_CLASS_SCHEDULES;
  }
};

export const getClassSchedule = (classId: string): ClassScheduleConfig | null => {
  if (!classId) return null;
  const all = getClassSchedules();
  const cleanId = classId.trim().toLowerCase();

  // 1. Khớp chính xác classId
  const directMatch = all.find(s => s.classId.toLowerCase() === cleanId);
  if (directMatch) return directMatch;

  // 2. Khớp gần đúng qua tên hoặc mã
  const fuzzyMatch = all.find(s => {
    const sId = s.classId.toLowerCase();
    const sName = (s.className || '').toLowerCase();
    return sId.includes(cleanId) || cleanId.includes(sId) || sName.includes(cleanId) || cleanId.includes(sName);
  });
  if (fuzzyMatch) return fuzzyMatch;

  // 3. Tự động tạo lịch chuẩn theo khối lớp nếu chưa có
  const classes = getClasses();
  const matchedClass = classes.find(c => c.id === classId || c.name.toLowerCase().includes(cleanId));
  const className = matchedClass ? matchedClass.name : `Lớp ${classId}`;
  const grade = matchedClass?.grade || (className.includes('7') ? 7 : className.includes('8') ? 8 : 6);

  let defaultSlots: WeeklyTimeSlot[];
  let notes = '';
  if (grade === 7) {
    defaultSlots = [
      { id: `slot_${classId}_1`, dayOfWeek: 4, dayLabel: 'Thứ Tư', startTime: '17:30', endTime: '19:00', room: 'Phòng B1' },
      { id: `slot_${classId}_2`, dayOfWeek: 7, dayLabel: 'Thứ Bảy', startTime: '17:30', endTime: '19:00', room: 'Phòng B1' }
    ];
    notes = `Lịch học chính khóa ${className} (Thứ 4 & Thứ 7)`;
  } else if (grade === 8) {
    defaultSlots = [
      { id: `slot_${classId}_1`, dayOfWeek: 7, dayLabel: 'Thứ Bảy', startTime: '19:15', endTime: '20:45', room: 'Phòng C1' },
      { id: `slot_${classId}_2`, dayOfWeek: 1, dayLabel: 'Chủ Nhật', startTime: '17:30', endTime: '19:00', room: 'Phòng C1' }
    ];
    notes = `Lịch học chính khóa ${className} (Thứ 7 & Chủ Nhật)`;
  } else {
    defaultSlots = [
      { id: `slot_${classId}_1`, dayOfWeek: 2, dayLabel: 'Thứ Hai', startTime: '17:30', endTime: '19:00', room: 'Phòng A1' },
      { id: `slot_${classId}_2`, dayOfWeek: 5, dayLabel: 'Thứ Năm', startTime: '17:30', endTime: '19:00', room: 'Phòng A1' }
    ];
    notes = `Lịch học chính khóa ${className} (Thứ 2 & Thứ 5)`;
  }

  const newSched: ClassScheduleConfig = {
    id: `sched_${classId}`,
    classId: classId,
    className: className,
    sessionsPerWeek: 2,
    roomDefault: defaultSlots[0].room,
    slots: defaultSlots,
    notes: notes,
    updatedAt: new Date().toISOString()
  };

  saveClassSchedule(newSched);
  return newSched;
};

/**
 * Tự động đồng bộ toàn bộ ngày của 8 buổi học trong các báo cáo tháng của lớp
 * theo đúng lịch học thực tế được giáo viên sắp xếp
 */
export const syncMonthlyReportsWithClassSchedule = (
  classId: string,
  schedule?: ClassScheduleConfig | null
): void => {
  if (typeof window === 'undefined' || !classId) return;
  const sched = schedule || getClassSchedule(classId);
  if (!sched || !sched.slots || sched.slots.length === 0) return;

  const allReports = getMonthlyReports();
  let hasChanges = false;

  const updatedReports = allReports.map(report => {
    if (report.classId !== classId) return report;

    // Sinh 8 buổi học chuẩn theo lịch của lớp cho tháng & năm của báo cáo này
    const stdSessions = generate8SessionsFromSchedule(classId, report.month, report.year);

    // Cập nhật ngày cho các buổi học, bảo toàn id, tên cột tùy chỉnh và điểm học sinh
    const updatedSessions: MonthlySessionConfig[] = (report.sessions || []).map((oldSess, idx) => {
      const stdSess = stdSessions[idx];
      const useDate = (oldSess.isManualDate && oldSess.date) ? oldSess.date : (stdSess ? stdSess.date : oldSess.date);
      return {
        ...oldSess,
        date: useDate,
        dayLabel: stdSess?.dayLabel || oldSess.dayLabel || '',
        timeSlot: stdSess?.timeSlot || oldSess.timeSlot || '',
        name: oldSess.name || (stdSess ? stdSess.name : `Buổi ${idx + 1}`),
        columns: (oldSess.columns && oldSess.columns.length === 3)
          ? oldSess.columns
          : (stdSess?.columns || [
              { key: 'vocab', label: 'Từ Vựng' },
              { key: 'test', label: 'Test' },
              { key: 'linkScore', label: 'điểm Link' }
            ])
      };
    });

    // Nếu số buổi chưa đủ 8 thì bổ sung
    while (updatedSessions.length < 8 && updatedSessions.length < stdSessions.length) {
      const stdSess = stdSessions[updatedSessions.length];
      if (stdSess) {
        updatedSessions.push(stdSess);
      }
    }

    hasChanges = true;
    return {
      ...report,
      sessions: updatedSessions,
      updatedAt: new Date().toISOString()
    };
  });

  if (hasChanges) {
    localStorage.setItem(MONTHLY_REPORTS_KEY, JSON.stringify(updatedReports));
    notifySync('monthly_report_updated', { classId, bulkSync: true });
    syncToFirebaseIfConfigured('monthly_reports', updatedReports);
  }
};

/**
 * Tự động tạo 8 buổi học chuẩn xác theo lịch học thực tế của lớp trong tháng và năm bất kỳ
 * Hoạt động chính xác tuyệt đối cho năm 2026 và mọi năm thực tế tiếp theo (2027, 2028, 2029...)
 */
export const generate8SessionsFromSchedule = (
  classId: string,
  month: number,
  year: number
): MonthlySessionConfig[] => {
  const schedule = classId ? getClassSchedule(classId) : null;
  const daysInMonth = new Date(year, month, 0).getDate();

  interface MatchedDateInfo {
    dateStr: string;
    dayNum: number;
    dow: number;
    slot?: WeeklyTimeSlot;
  }
  const matchedDates: MatchedDateInfo[] = [];

  const dayLabelsMap: Record<number, string> = {
    1: 'Chủ Nhật',
    2: 'Thứ Hai',
    3: 'Thứ Ba',
    4: 'Thứ Tư',
    5: 'Thứ Năm',
    6: 'Thứ Sáu',
    7: 'Thứ Bảy'
  };

  if (schedule && schedule.slots && schedule.slots.length > 0) {
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month - 1, d);
      const jsDay = dateObj.getDay(); // 0 = CN, 1 = T2, ..., 6 = T7
      const dow = jsDay === 0 ? 1 : jsDay + 1; // 1 = CN, 2 = T2, ..., 7 = T7
      const matchingSlot = schedule.slots.find(slot => slot.dayOfWeek === dow);
      if (matchingSlot) {
        matchedDates.push({
          dateStr: `${String(d).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
          dayNum: d,
          dow,
          slot: matchingSlot
        });
      }
    }
  }

  // Nếu số buổi khớp ít hơn 8 (tháng ngắn hoặc lịch 1 buổi/tuần), bổ sung tiếp các ngày trong tháng
  if (matchedDates.length < 8) {
    for (let d = 1; d <= daysInMonth && matchedDates.length < 8; d++) {
      const str = `${String(d).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
      if (!matchedDates.some(m => m.dateStr === str)) {
        const dateObj = new Date(year, month - 1, d);
        const jsDay = dateObj.getDay();
        const dow = jsDay === 0 ? 1 : jsDay + 1;
        matchedDates.push({
          dateStr: str,
          dayNum: d,
          dow
        });
      }
    }
  }

  // Sắp xếp ngày tăng dần theo trình tự thời gian
  matchedDates.sort((a, b) => a.dayNum - b.dayNum);

  const final8 = matchedDates.slice(0, 8);

  const defaultCols: MonthlySessionColumn[] = [
    { key: 'vocab', label: 'Từ Vựng' },
    { key: 'test', label: 'Test' },
    { key: 'linkScore', label: 'điểm Link' }
  ];

  return final8.map((item, idx) => ({
    id: `s_buoi_${idx + 1}`,
    name: `Buổi ${idx + 1}`,
    date: item.dateStr,
    dayLabel: item.slot?.dayLabel || dayLabelsMap[item.dow] || `Thứ ${item.dow}`,
    timeSlot: item.slot?.startTime && item.slot?.endTime ? `${item.slot.startTime} - ${item.slot.endTime}` : undefined,
    columns: defaultCols
  }));
};

export const saveClassSchedule = (config: ClassScheduleConfig): void => {
  if (typeof window === 'undefined') return;
  const all = getClassSchedules();
  const exists = all.some(s => s.classId === config.classId);
  const updated = exists
    ? all.map(s => (s.classId === config.classId ? config : s))
    : [...all, config];
  localStorage.setItem(CLASS_SCHEDULES_KEY, JSON.stringify(updated));

  // Tự động đồng bộ mô tả lịch học vào thông tin lớp (class.description)
  if (config.classId) {
    const classes = getClasses();
    const targetClass = classes.find(c => c.id === config.classId);
    if (targetClass) {
      const formattedDesc = formatScheduleSummary(config.slots);
      if (formattedDesc && targetClass.description !== formattedDesc) {
        targetClass.description = formattedDesc;
        saveClasses(classes);
      }
    }
  }

  // Tự động đồng bộ toàn bộ ngày của 8 buổi học trong báo cáo tháng của lớp
  syncMonthlyReportsWithClassSchedule(config.classId, config);

  notifySync('class_schedule_updated', config);
  syncToFirebaseIfConfigured('class_schedules', updated);
};

export const deleteClassSchedule = (classId: string): void => {
  if (typeof window === 'undefined') return;
  const all = getClassSchedules();
  const updated = all.filter(s => s.classId !== classId);
  localStorage.setItem(CLASS_SCHEDULES_KEY, JSON.stringify(updated));
  notifySync('class_schedule_deleted', { classId });
  syncToFirebaseIfConfigured('class_schedules', updated);
};

// ==================== ATTENDANCE MANAGEMENT ====================
export const getAttendanceRecords = (classId?: string, date?: string): AttendanceRecord[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ATTENDANCE_RECORDS_KEY);
    if (!raw) return [];
    let list: AttendanceRecord[] = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    if (classId && classId !== 'ALL') {
      list = list.filter(r => r.classId === classId);
    }
    if (date && date !== 'ALL') {
      list = list.filter(r => r.date === date);
    }
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch {
    return [];
  }
};

export const getAttendanceRecord = (classId: string, date: string): AttendanceRecord | null => {
  const records = getAttendanceRecords(classId);
  return records.find(r => r.date === date) || null;
};

export const saveAttendanceRecord = (record: AttendanceRecord): void => {
  if (typeof window === 'undefined') return;
  const all = getAttendanceRecords();
  const exists = all.some(r => r.id === record.id || (r.classId === record.classId && r.date === record.date));
  const updated = exists
    ? all.map(r => (r.id === record.id || (r.classId === record.classId && r.date === record.date) ? record : r))
    : [record, ...all];
  localStorage.setItem(ATTENDANCE_RECORDS_KEY, JSON.stringify(updated));
  notifySync('attendance_record_updated', record);
  syncToFirebaseIfConfigured('attendance_records', updated);
};

export const deleteAttendanceRecord = (id: string): void => {
  if (typeof window === 'undefined') return;
  const all = getAttendanceRecords();
  const updated = all.filter(r => r.id !== id);
  localStorage.setItem(ATTENDANCE_RECORDS_KEY, JSON.stringify(updated));
  notifySync('attendance_record_deleted', { id });
  syncToFirebaseIfConfigured('attendance_records', updated);
};

// ==================== ANNUAL REPORT AGGREGATOR ====================
export const getAnnualReports = (classId?: string, year?: number): AnnualReport[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ANNUAL_REPORTS_KEY);
    if (!raw) return [];
    let list: AnnualReport[] = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    if (classId && classId !== 'ALL') {
      list = list.filter(r => r.classId === classId);
    }
    if (year) {
      list = list.filter(r => r.year === year);
    }
    return list;
  } catch {
    return [];
  }
};

export const getAnnualReport = (classId: string, year: number): AnnualReport | undefined => {
  const all = getAnnualReports();
  return all.find(r => r.classId === classId && r.year === year);
};

export const saveAnnualReport = (report: AnnualReport): void => {
  if (typeof window === 'undefined') return;
  const all = getAnnualReports();
  const exists = all.some(r => r.id === report.id || (r.classId === report.classId && r.year === report.year));
  const updated = exists
    ? all.map(r => (r.id === report.id || (r.classId === report.classId && r.year === report.year) ? report : r))
    : [report, ...all];
  localStorage.setItem(ANNUAL_REPORTS_KEY, JSON.stringify(updated));
  notifySync('annual_report_updated', report);
  syncToFirebaseIfConfigured('annual_reports', updated);
};

export const deleteAnnualReport = (id: string): void => {
  if (typeof window === 'undefined') return;
  const all = getAnnualReports();
  const updated = all.filter(r => r.id !== id);
  localStorage.setItem(ANNUAL_REPORTS_KEY, JSON.stringify(updated));
  notifySync('annual_report_deleted', { id });
  syncToFirebaseIfConfigured('annual_reports', updated);
};

/**
 * Tự động tổng hợp dữ liệu cả năm (12 tháng) từ các Báo cáo tháng và bài nộp
 */
export const buildOrAggregateAnnualReport = (
  classId: string,
  year: number,
  forceReaggregate: boolean = false
): AnnualReport => {
  const classes = getClasses();
  const targetClass = classes.find(c => c.id === classId) || classes[0];
  const className = targetClass ? targetClass.name : 'Lớp học';
  const existingSaved = getAnnualReport(classId, year);
  const classStudents = getStudents(classId);
  const monthlyReports = getMonthlyReports(classId).filter(r => r.year === year);
  const allSubmissions = getSubmissions();

  const studentScores: StudentAnnualScore[] = classStudents.map(std => {
    const existingStd = existingSaved?.studentScores?.find(s => s.studentId === std.id || s.studentName === std.name);
    const monthlyScores: Record<number, number | null> = {};
    const validScores: number[] = [];

    for (let m = 1; m <= 12; m++) {
      let scoreForMonth: number | null = null;

      // 1. Nếu không phải forceReaggregate và giáo viên đã chỉnh sửa điểm tháng này trong báo cáo năm, giữ nguyên
      if (!forceReaggregate && existingStd?.monthlyScores && existingStd.monthlyScores[m] !== undefined && existingStd.monthlyScores[m] !== null) {
        scoreForMonth = existingStd.monthlyScores[m];
      }

      // 2. Lấy điểm TB từ Báo Cáo Tháng của lớp
      if (scoreForMonth === null) {
        const mRep = monthlyReports.find(r => r.month === m);
        if (mRep) {
          const found = mRep.studentScores?.find(s => s.studentId === std.id || s.studentName === std.name);
          if (found && typeof found.averageScore === 'number' && found.averageScore > 0) {
            scoreForMonth = found.averageScore;
          }
        }
      }

      // 3. Nếu chưa có báo cáo tháng, kiểm tra điểm bài nộp trên hệ thống trong tháng đó
      if (scoreForMonth === null) {
        const monthSubs = allSubmissions.filter(sub => {
          if (sub.studentId !== std.id && sub.studentName.trim().toLowerCase() !== std.name.trim().toLowerCase()) return false;
          if (!sub.submittedAt) return false;
          const d = new Date(sub.submittedAt);
          return d.getFullYear() === year && d.getMonth() + 1 === m;
        });
        if (monthSubs.length > 0) {
          const sum = monthSubs.reduce((acc, cur) => {
            const sc = typeof cur.scaledScore10 === 'number' ? cur.scaledScore10 : cur.score;
            return acc + (sc || 0);
          }, 0);
          scoreForMonth = Math.round((sum / monthSubs.length) * 100) / 100;
        }
      }

      monthlyScores[m] = scoreForMonth;
      if (scoreForMonth !== null && scoreForMonth > 0) {
        validScores.push(scoreForMonth);
      }
    }

    const annualAverage = validScores.length > 0
      ? Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 100) / 100
      : 0;

    let classification: StudentAnnualScore['classification'] = 'Cần cố gắng';
    if (annualAverage >= 9.0) classification = 'Xuất sắc';
    else if (annualAverage >= 8.0) classification = 'Giỏi';
    else if (annualAverage >= 6.5) classification = 'Khá';
    else if (annualAverage >= 5.0) classification = 'Trung bình';

    return {
      studentId: std.id,
      studentName: std.name,
      englishName: std.englishName || existingStd?.englishName || '',
      monthlyScores,
      annualAverage,
      completedMonthsCount: validScores.length,
      classification,
      teacherRemarks: existingStd?.teacherRemarks || ''
    };
  });

  // Sort by annualAverage desc and assign rank
  const sorted = [...studentScores].sort((a, b) => b.annualAverage - a.annualAverage);
  sorted.forEach((std, idx) => {
    std.rank = idx + 1;
  });

  return {
    id: existingSaved?.id || `annual_${classId}_${year}`,
    classId,
    className,
    year,
    centerName: existingSaved?.centerName || 'NEXTGEN ENGLISH',
    studentScores: sorted,
    generalNote: existingSaved?.generalNote || '',
    updatedAt: existingSaved?.updatedAt || new Date().toISOString()
  };
};
