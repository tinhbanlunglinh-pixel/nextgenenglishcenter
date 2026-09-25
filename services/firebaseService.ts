import { FirebaseConfig } from '../types';

const FIREBASE_CONFIG_KEY = 'nextgen_firebase_config';

/**
 * Default Firebase Configuration for Nextgen English
 */
export const DEFAULT_FIREBASE_CONFIG: FirebaseConfig = {
  apiKey: "AIzaSyAwl9RWxJATZbh_OD7cfOVN_ikC4InK_4k",
  authDomain: "english-mrs-dung.firebaseapp.com",
  databaseURL: "https://english-mrs-dung-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "english-mrs-dung",
  storageBucket: "english-mrs-dung.firebasestorage.app",
  messagingSenderId: "797526955233",
  appId: "1:797526955233:web:75cef3a23e85e8f002d3a0"
};

export const getFirebaseConfig = (): FirebaseConfig => {
  if (typeof window === 'undefined') return DEFAULT_FIREBASE_CONFIG;
  try {
    const raw = localStorage.getItem(FIREBASE_CONFIG_KEY);
    if (!raw) return DEFAULT_FIREBASE_CONFIG;
    const parsed = JSON.parse(raw) as Partial<FirebaseConfig>;
    return {
      ...DEFAULT_FIREBASE_CONFIG,
      ...parsed,
      databaseURL: parsed.databaseURL || DEFAULT_FIREBASE_CONFIG.databaseURL
    };
  } catch {
    return DEFAULT_FIREBASE_CONFIG;
  }
};

export const saveFirebaseConfig = (config: FirebaseConfig): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
};

export const clearFirebaseConfig = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(FIREBASE_CONFIG_KEY);
};

export const isFirebaseConfigured = (): boolean => {
  const cfg = getFirebaseConfig();
  return !!(cfg && cfg.databaseURL && cfg.databaseURL.startsWith('https://'));
};

export const FIREBASE_NAMESPACE = 'nextgen_app';

/**
 * Format Realtime Database REST URL
 */
const getDatabaseEndpoint = (databaseURL: string, path: string): string => {
  const cleanBase = databaseURL.replace(/\/+$/, '');
  const cleanPath = path.replace(/^\/+/, '').replace(/\.json$/, '');
  return `${cleanBase}/${FIREBASE_NAMESPACE}/${cleanPath}.json`;
};

/**
 * Push/Sync data to Firebase Realtime Database using REST API
 * (Safe, lightweight, works seamlessly in browser without extra npm SDK)
 */
export const syncToFirebaseIfConfigured = async (path: string, data: any): Promise<boolean> => {
  const cfg = getFirebaseConfig();
  if (!cfg || !cfg.databaseURL) return false;

  try {
    const url = getDatabaseEndpoint(cfg.databaseURL, path);
    const authParam = cfg.apiKey ? `?auth=${cfg.apiKey}` : '';
    const res = await fetch(`${url}${authParam}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.ok;
  } catch (error) {
    console.warn(`Firebase sync for ${path} failed (app continues in offline/local mode):`, error);
    return false;
  }
};

/**
 * Fetch data from Firebase Realtime Database if configured
 */
export const fetchFromFirebaseIfConfigured = async <T>(path: string): Promise<T | null> => {
  const cfg = getFirebaseConfig();
  if (!cfg || !cfg.databaseURL) return null;

  try {
    const url = getDatabaseEndpoint(cfg.databaseURL, path);
    const authParam = cfg.apiKey ? `?auth=${cfg.apiKey}` : '';
    const res = await fetch(`${url}${authParam}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (error) {
    console.warn(`Firebase fetch for ${path} failed:`, error);
    return null;
  }
};

/**
 * Test Firebase Realtime Database connection
 */
export const testFirebaseConnection = async (): Promise<{ success: boolean; message: string }> => {
  const cfg = getFirebaseConfig();
  if (!cfg.databaseURL) {
    return { success: false, message: 'Chưa cấu hình Realtime Database URL' };
  }
  try {
    const testEndpoint = getDatabaseEndpoint(cfg.databaseURL, '_ping');
    const authParam = cfg.apiKey ? `?auth=${cfg.apiKey}` : '';
    const res = await fetch(`${testEndpoint}${authParam}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timestamp: Date.now(), client: 'Nextgen English App' })
    });
    if (res.ok) {
      return { success: true, message: 'Kết nối Firebase Realtime Database thành công! 🟢' };
    } else {
      const errText = await res.text();
      return { success: false, message: `Lỗi kết nối Firebase (HTTP ${res.status}): ${errText}` };
    }
  } catch (err: any) {
    return { success: false, message: `Không thể kết nối đến Firebase: ${err?.message || err}` };
  }
};

/**
 * Helper to safely convert Firebase response (Array or Object) to Array
 */
export const normalizeFirebaseList = (val: any): any[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === 'object') return Object.values(val).filter(Boolean);
  return [];
};

/**
 * Sync an individual submission directly to Firebase without overwriting other submissions
 * Includes automatic retry (up to 3 times) and pending offline queue
 */
export const syncSingleSubmissionToFirebase = async (submission: any, retryCount = 0): Promise<boolean> => {
  if (!submission || !submission.id) return false;
  const cfg = getFirebaseConfig();
  if (!cfg || !cfg.databaseURL) return false;

  try {
    const url = getDatabaseEndpoint(cfg.databaseURL, `submissions/${submission.id}`);
    const authParam = cfg.apiKey ? `?auth=${cfg.apiKey}` : '';
    const res = await fetch(`${url}${authParam}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submission)
    });

    if (res.ok) {
      // If was in pending queue, remove it
      removePendingSubmission(submission.id);
      return true;
    }

    if (retryCount < 2) {
      await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)));
      return syncSingleSubmissionToFirebase(submission, retryCount + 1);
    }

    savePendingSubmission(submission);
    return false;
  } catch (error) {
    console.warn(`Firebase single submission sync attempt ${retryCount + 1} failed:`, error);
    if (retryCount < 2) {
      await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)));
      return syncSingleSubmissionToFirebase(submission, retryCount + 1);
    }
    savePendingSubmission(submission);
    return false;
  }
};

const PENDING_SUBMISSIONS_KEY = 'nextgen_pending_submissions';

let pendingSyncInterval: any = null;

export const startPendingSyncQueue = () => {
  if (typeof window === 'undefined') return;
  if (pendingSyncInterval) return;
  pendingSyncInterval = setInterval(async () => {
    try {
      const raw = localStorage.getItem(PENDING_SUBMISSIONS_KEY);
      if (!raw) {
        clearInterval(pendingSyncInterval);
        pendingSyncInterval = null;
        return;
      }
      const list = JSON.parse(raw);
      if (!Array.isArray(list) || list.length === 0) {
        clearInterval(pendingSyncInterval);
        pendingSyncInterval = null;
        return;
      }
      await syncPendingSubmissions();
    } catch {
      // Quiet
    }
  }, 4000);
};

export const savePendingSubmission = (submission: any): void => {
  if (typeof window === 'undefined' || !submission || !submission.id) return;
  try {
    const raw = localStorage.getItem(PENDING_SUBMISSIONS_KEY);
    const list: any[] = raw ? JSON.parse(raw) : [];
    if (!list.some(s => s.id === submission.id)) {
      list.push(submission);
      localStorage.setItem(PENDING_SUBMISSIONS_KEY, JSON.stringify(list));
    }
    startPendingSyncQueue();
  } catch {}
};

export const removePendingSubmission = (submissionId: string): void => {
  if (typeof window === 'undefined' || !submissionId) return;
  try {
    const raw = localStorage.getItem(PENDING_SUBMISSIONS_KEY);
    if (!raw) return;
    const list: any[] = JSON.parse(raw);
    const filtered = list.filter(s => s.id !== submissionId);
    localStorage.setItem(PENDING_SUBMISSIONS_KEY, JSON.stringify(filtered));
  } catch {}
};

export const syncPendingSubmissions = async (): Promise<void> => {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(PENDING_SUBMISSIONS_KEY);
    if (!raw) return;
    const list: any[] = JSON.parse(raw);
    if (!Array.isArray(list) || list.length === 0) return;

    for (const sub of list) {
      const ok = await syncSingleSubmissionToFirebase(sub, 2);
      if (ok) {
        removePendingSubmission(sub.id);
      }
    }
  } catch {}
};

// Listen to online event to flush pending submissions immediately
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncPendingSubmissions();
  });
}

/**
 * Subscribe to Real-time Firebase RTDB events via native Server-Sent Events (SSE).
 * Delivers sub-second instant updates to Teacher Dashboard whenever any student submits.
 * Equipped with automatic reconnection, backoff, patch listener, and tab-focus restoration.
 */
export const subscribeToFirebaseRealtime = (onSubmissionChange: (submission: any) => void): (() => void) => {
  if (typeof window === 'undefined' || !('EventSource' in window)) return () => {};
  const cfg = getFirebaseConfig();
  if (!cfg || !cfg.databaseURL) return () => {};

  let eventSource: EventSource | null = null;
  let isClosed = false;
  let reconnectTimer: any = null;
  let retryDelay = 1000;

  const handlePayload = (payload: any) => {
    if (!payload) return;
    const { path, data } = payload;
    if (!data) return;

    // 1. Single submission directly: data has studentName
    if (typeof data === 'object') {
      const derivedId = data.id || (path ? path.replace(/^\/+/, '') : '');
      if (derivedId && data.studentName) {
        onSubmissionChange({ ...data, id: derivedId });
        return;
      }

      // 2. Map of submissions (e.g. initial snapshot or full collection on path '/')
      if (path === '/' || path === '') {
        Object.entries(data).forEach(([key, val]: [string, any]) => {
          if (val && typeof val === 'object') {
            const subId = val.id || key;
            if (subId && val.studentName) {
              onSubmissionChange({ ...val, id: subId });
            }
          }
        });
        return;
      }

      // 3. Nested path e.g. /sub_123
      if (path && path.startsWith('/')) {
        const cleanKey = path.substring(1);
        if (cleanKey && data.studentName) {
          onSubmissionChange({ ...data, id: data.id || cleanKey });
        }
      }
    }
  };

  const connect = () => {
    if (isClosed) return;
    try {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }

      const cleanBase = cfg.databaseURL.replace(/\/+$/, '');
      const authParam = cfg.apiKey ? `?auth=${cfg.apiKey}` : '';
      const streamUrl = `${cleanBase}/${FIREBASE_NAMESPACE}/submissions.json${authParam}`;

      eventSource = new EventSource(streamUrl);

      const onMessage = (e: MessageEvent) => {
        if (isClosed) return;
        retryDelay = 1000; // Reset delay on successful data reception
        try {
          const payload = JSON.parse(e.data);
          handlePayload(payload);
        } catch (err) {
          console.debug('Firebase SSE parse error:', err);
        }
      };

      eventSource.addEventListener('put', onMessage);
      eventSource.addEventListener('patch', onMessage);

      eventSource.onerror = () => {
        if (isClosed) return;
        // If EventSource is closed or errored, force reconnect with backoff
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 1.5, 15000);
          connect();
        }, retryDelay);
      };
    } catch (err) {
      console.warn('Firebase EventSource connect error:', err);
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 3000);
    }
  };

  connect();

  // Watchdog & Reconnect on Tab Focus / Network Online
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible' && (!eventSource || eventSource.readyState === EventSource.CLOSED)) {
      connect();
    }
  };

  const handleOnline = () => {
    connect();
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
  }

  // Periodic heartbeat watchdog every 15s to guarantee connection stays active
  const watchdog = setInterval(() => {
    if (isClosed) return;
    if (!eventSource || eventSource.readyState === EventSource.CLOSED) {
      connect();
    }
  }, 15000);

  return () => {
    isClosed = true;
    clearInterval(watchdog);
    clearTimeout(reconnectTimer);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
};

/**
 * Super lightweight submissions fetch (~100ms) - only checks submissions
 * instead of pulling all 8 collections. Used for fast background synchronization.
 */
export const pullSubmissionsOnlyFromFirebase = async (): Promise<boolean> => {
  try {
    const raw = await fetchFromFirebaseIfConfigured<any>('submissions');
    if (!raw) return false;
    const cloudSubmissions = normalizeFirebaseList(raw);
    if (!Array.isArray(cloudSubmissions) || cloudSubmissions.length === 0) return false;

    const rawLocal = localStorage.getItem('nextgen_submissions');
    let localList: any[] = [];
    try {
      if (rawLocal) localList = JSON.parse(rawLocal);
    } catch {
      localList = [];
    }
    if (!Array.isArray(localList)) localList = [];

    const map = new Map<string, any>();
    cloudSubmissions.forEach(item => {
      if (item && item.id && !String(item.id).startsWith('sub_seed_')) {
        map.set(String(item.id), item);
      }
    });

    let hasNewFromCloud = false;
    cloudSubmissions.forEach(item => {
      if (item && item.id && !localList.some(l => l && l.id === item.id)) {
        hasNewFromCloud = true;
      }
    });

    localList.forEach(item => {
      if (item && item.id && !String(item.id).startsWith('sub_seed_')) {
        if (!map.has(String(item.id))) {
          map.set(String(item.id), item);
        }
      }
    });

    const merged = Array.from(map.values());
    localStorage.setItem('nextgen_submissions', JSON.stringify(merged));
    return hasNewFromCloud;
  } catch {
    return false;
  }
};

/**
 * Pull initial data from Firebase Realtime Database and synchronize with LocalStorage safely
 */
export const pullAllFromFirebase = async (): Promise<boolean> => {
  try {
    const [
      rawClasses,
      rawDeletedClasses,
      rawStudents,
      rawDeletedStudents,
      rawAssignments,
      rawDeletedAssignments,
      rawSubmissions,
      rawMonthlyReports,
      rawSchedules,
      rawAttendance
    ] = await Promise.all([
      fetchFromFirebaseIfConfigured<any>('classes'),
      fetchFromFirebaseIfConfigured<any>('deleted_classes'),
      fetchFromFirebaseIfConfigured<any>('students'),
      fetchFromFirebaseIfConfigured<any>('deleted_students'),
      fetchFromFirebaseIfConfigured<any>('assignments'),
      fetchFromFirebaseIfConfigured<any>('deleted_assignments'),
      fetchFromFirebaseIfConfigured<any>('submissions'),
      fetchFromFirebaseIfConfigured<any>('monthly_reports'),
      fetchFromFirebaseIfConfigured<any>('class_schedules'),
      fetchFromFirebaseIfConfigured<any>('attendance_records')
    ]);

    const cloudClasses = normalizeFirebaseList(rawClasses);
    const cloudDeletedClasses = normalizeFirebaseList(rawDeletedClasses);
    const cloudStudents = normalizeFirebaseList(rawStudents);
    const cloudDeletedStudents = normalizeFirebaseList(rawDeletedStudents);
    const cloudAssignments = normalizeFirebaseList(rawAssignments);
    const cloudDeletedAssignments = normalizeFirebaseList(rawDeletedAssignments);
    const cloudSubmissions = normalizeFirebaseList(rawSubmissions);
    const cloudMonthlyReports = normalizeFirebaseList(rawMonthlyReports);
    const cloudSchedules = normalizeFirebaseList(rawSchedules);
    const cloudAttendance = normalizeFirebaseList(rawAttendance);

    // 1. Đồng bộ & hợp nhất danh sách học sinh đã xóa vĩnh viễn (nghỉ học / tombstone)
    const localDeletedRaw = localStorage.getItem('nextgen_deleted_students');
    let localDeletedList: any[] = [];
    try {
      if (localDeletedRaw) localDeletedList = JSON.parse(localDeletedRaw);
    } catch {
      localDeletedList = [];
    }
    if (!Array.isArray(localDeletedList)) localDeletedList = [];

    const deletedMap = new Map<string, any>();
    cloudDeletedStudents.forEach(d => {
      if (d && d.id) deletedMap.set(String(d.id), d);
    });
    let hasNewDeletedToPush = false;
    localDeletedList.forEach(d => {
      if (d && d.id) {
        if (!deletedMap.has(String(d.id))) {
          hasNewDeletedToPush = true;
        }
        deletedMap.set(String(d.id), d);
      }
    });
    const mergedDeleted = Array.from(deletedMap.values());
    localStorage.setItem('nextgen_deleted_students', JSON.stringify(mergedDeleted));
    if (hasNewDeletedToPush) {
      syncToFirebaseIfConfigured('deleted_students', mergedDeleted);
    }
    const deletedIdsSet = new Set<string>(mergedDeleted.map(d => String(d.id)));

    // 1b. Đồng bộ & hợp nhất danh sách LỚP HỌC đã xóa
    const localDeletedClassesRaw = localStorage.getItem('nextgen_deleted_classes');
    let localDeletedClasses: string[] = [];
    try {
      if (localDeletedClassesRaw) localDeletedClasses = JSON.parse(localDeletedClassesRaw);
    } catch {
      localDeletedClasses = [];
    }
    const mergedDeletedClasses = Array.from(new Set([
      ...cloudDeletedClasses.map(c => typeof c === 'string' ? c : c?.id).filter(Boolean),
      ...localDeletedClasses
    ]));
    localStorage.setItem('nextgen_deleted_classes', JSON.stringify(mergedDeletedClasses));
    if (mergedDeletedClasses.length > cloudDeletedClasses.length) {
      syncToFirebaseIfConfigured('deleted_classes', mergedDeletedClasses);
    }
    const deletedClassesSet = new Set<string>(mergedDeletedClasses.map(String));

    // 1c. Đồng bộ & hợp nhất danh sách BÀI TẬP đã xóa
    const localDeletedAssignmentsRaw = localStorage.getItem('nextgen_deleted_assignments');
    let localDeletedAssignments: string[] = [];
    try {
      if (localDeletedAssignmentsRaw) localDeletedAssignments = JSON.parse(localDeletedAssignmentsRaw);
    } catch {
      localDeletedAssignments = [];
    }
    const mergedDeletedAssignments = Array.from(new Set([
      ...cloudDeletedAssignments.map(a => typeof a === 'string' ? a : a?.id).filter(Boolean),
      ...localDeletedAssignments
    ]));
    localStorage.setItem('nextgen_deleted_assignments', JSON.stringify(mergedDeletedAssignments));
    if (mergedDeletedAssignments.length > cloudDeletedAssignments.length) {
      syncToFirebaseIfConfigured('deleted_assignments', mergedDeletedAssignments);
    }
    const deletedAssignmentsSet = new Set<string>(mergedDeletedAssignments.map(String));

    let hasNewData = false;

    const MOCK_CLASS_IDS = new Set(['class_6a1', 'class_6a2', 'class_7b1', 'class_8a1']);
    const MOCK_STUDENT_IDS = new Set(Array.from({ length: 17 }, (_, i) => `std_${i + 1}`));

    const isMockItem = (key: string, item: any): boolean => {
      if (!item || !item.id) return true;
      if (key === 'nextgen_classes') {
        return MOCK_CLASS_IDS.has(item.id) || deletedClassesSet.has(String(item.id));
      }
      if (key === 'nextgen_students') {
        return MOCK_STUDENT_IDS.has(item.id) || MOCK_CLASS_IDS.has(item.classId) || deletedIdsSet.has(String(item.id));
      }
      if (key === 'nextgen_submissions') {
        return item.id.startsWith('sub_seed_') || (item.studentId && (MOCK_STUDENT_IDS.has(item.studentId) || deletedIdsSet.has(String(item.studentId))));
      }
      if (key === 'nextgen_assignments') {
        return item.id === 'assign_unit1_school' || deletedAssignmentsSet.has(String(item.id));
      }
      return false;
    };

    // Helper to merge lists by id, preserving teacher edits and local unsaved changes
    const mergeById = (localKey: string, cloudList: any[], timeField: string = 'updatedAt'): boolean => {
      if (!Array.isArray(cloudList) && localKey !== 'nextgen_students') return false;
      const safeCloudList = Array.isArray(cloudList) ? cloudList : [];
      const rawLocal = localStorage.getItem(localKey);
      let localList: any[] = [];
      try {
        if (rawLocal) localList = JSON.parse(rawLocal);
      } catch {
        localList = [];
      }
      if (!Array.isArray(localList)) localList = [];

      const map = new Map<string, any>();
      safeCloudList.forEach(item => {
        if (item && item.id && !isMockItem(localKey, item)) {
          // Bỏ qua tuyệt đối nếu thực thể đã bị quản trị/giáo viên xóa
          if (localKey === 'nextgen_students' && deletedIdsSet.has(String(item.id))) {
            return;
          }
          if (localKey === 'nextgen_classes' && deletedClassesSet.has(String(item.id))) {
            return;
          }
          if (localKey === 'nextgen_assignments' && deletedAssignmentsSet.has(String(item.id))) {
            return;
          }
          map.set(String(item.id), item);
        }
      });

      let needPushUnsynced = false;
      localList.forEach(item => {
        if (item && item.id && !isMockItem(localKey, item)) {
          const idStr = String(item.id);
          // Bỏ qua tuyệt đối nếu thực thể đã bị quản trị/giáo viên xóa
          if (localKey === 'nextgen_students' && deletedIdsSet.has(idStr)) {
            return;
          }
          if (localKey === 'nextgen_classes' && deletedClassesSet.has(idStr)) {
            return;
          }
          if (localKey === 'nextgen_assignments' && deletedAssignmentsSet.has(idStr)) {
            return;
          }

          const cloudItem = map.get(idStr);
          if (!cloudItem) {
            map.set(idStr, item);
            needPushUnsynced = true;
          } else {
            const localTime = new Date(item.teacherModifiedAt || item[timeField] || item.submittedAt || item.updatedAt || item.createdAt || 0).getTime();
            const cloudTime = new Date(cloudItem.teacherModifiedAt || cloudItem[timeField] || cloudItem.submittedAt || cloudItem.updatedAt || cloudItem.createdAt || 0).getTime();

            // ⭐️ NGUYÊN TẮC VÀNG: Luôn ưu tiên lưu lại thông tin cuối cùng của giáo viên/quản trị viên sửa trên website
            if (item.teacherModified || localTime >= cloudTime) {
              map.set(idStr, item);
              if (item.teacherModified || localTime > cloudTime) {
                needPushUnsynced = true;
              }
            }
          }
        }
      });

      const merged = Array.from(map.values());
      try {
        localStorage.setItem(localKey, JSON.stringify(merged));
      } catch (err) {
        console.warn(`LocalStorage setItem failed for ${localKey}:`, err);
      }

      if (needPushUnsynced) {
        if (localKey === 'nextgen_submissions') {
          // Push only new submissions individually without overwriting the whole collection
          localList.forEach(item => {
            if (item && item.id && !isMockItem(localKey, item) && !safeCloudList.some(c => c && c.id === item.id)) {
              syncSingleSubmissionToFirebase(item);
            }
          });
        } else {
          const path = localKey.replace('nextgen_', '').replace('mrs_dung_', '');
          syncToFirebaseIfConfigured(path, merged);
        }
      }
      return true;
    };

    if (mergeById('nextgen_classes', cloudClasses)) hasNewData = true;
    if (mergeById('nextgen_students', cloudStudents)) hasNewData = true;
    if (mergeById('nextgen_assignments', cloudAssignments)) hasNewData = true;
    if (mergeById('nextgen_submissions', cloudSubmissions, 'submittedAt')) hasNewData = true;
    if (mergeById('nextgen_monthly_reports', cloudMonthlyReports)) hasNewData = true;
    if (mergeById('nextgen_class_schedules', cloudSchedules)) hasNewData = true;
    if (mergeById('nextgen_attendance_records', cloudAttendance, 'date')) hasNewData = true;

    // Background push any offline pending submissions
    syncPendingSubmissions();

    return hasNewData;
  } catch (e) {
    console.warn('Pull from Firebase error:', e);
    return false;
  }
};

/**
 * Seed initial data to Firebase only if explicitly given non-empty real data
 */
export const seedFirebaseIfEmpty = async (defaultData: {
  classes: any[];
  students: any[];
  assignments: any[];
  submissions: any[];
}) => {
  try {
    const rawAssignments = await fetchFromFirebaseIfConfigured<any>('assignments');
    const existingAssignments = normalizeFirebaseList(rawAssignments);
    if (existingAssignments.length === 0 && defaultData.assignments && defaultData.assignments.length > 0) {
      await Promise.all([
        syncToFirebaseIfConfigured('classes', defaultData.classes || []),
        syncToFirebaseIfConfigured('students', defaultData.students || []),
        syncToFirebaseIfConfigured('assignments', defaultData.assignments || []),
        syncToFirebaseIfConfigured('submissions', defaultData.submissions || [])
      ]);
    }
  } catch (e) {
    console.warn('Seed Firebase skipped or failed:', e);
  }
};

