import { AuthUser, UserRole } from '../types';
import { INITIAL_ACCOUNTS, AccountCredential } from '../accounts/credentials';

const CURRENT_USER_KEY = 'mrs_dung_auth_current_user';
const CUSTOM_ACCOUNTS_KEY = 'mrs_dung_custom_accounts';
export const TEACHER_CREDENTIALS_KEY = 'mrs_dung_teacher_custom_credentials';
export const SAVED_TEACHER_LOGIN_KEY = 'mrs_dung_saved_teacher_login';

export interface TeacherCredentials {
  username: string; // default: 'Nextgen'
  password: string; // default: '88889999'
  displayName?: string; // default: 'Giáo viên Nextgen (Nextgen English)'
  updatedAt?: string;
}

export const DEFAULT_TEACHER_CREDENTIALS: TeacherCredentials = {
  username: 'Nextgen',
  password: '88889999',
  displayName: 'Giáo viên Nextgen (Nextgen English)'
};

/**
 * Get configured teacher credentials (defaults to 'Nextgen' & '88889999')
 */
export const getTeacherCredentials = (): TeacherCredentials => {
  if (typeof window === 'undefined') return DEFAULT_TEACHER_CREDENTIALS;
  try {
    const raw = localStorage.getItem(TEACHER_CREDENTIALS_KEY);
    if (!raw) return DEFAULT_TEACHER_CREDENTIALS;
    const parsed = JSON.parse(raw);
    return {
      username: parsed.username?.trim() || DEFAULT_TEACHER_CREDENTIALS.username,
      password: parsed.password?.trim() || DEFAULT_TEACHER_CREDENTIALS.password,
      displayName: parsed.displayName?.trim() || DEFAULT_TEACHER_CREDENTIALS.displayName,
      updatedAt: parsed.updatedAt
    };
  } catch {
    return DEFAULT_TEACHER_CREDENTIALS;
  }
};

/**
 * Save customized teacher credentials (username, password, display name)
 */
export const saveTeacherCredentials = (
  creds: { username: string; password: string; displayName?: string }
): { success: boolean; error?: string } => {
  if (typeof window === 'undefined') return { success: false, error: 'Môi trường không hỗ trợ' };
  const username = creds.username.trim();
  const password = creds.password.trim();
  const displayName = (creds.displayName || 'Giáo viên Nextgen (Nextgen English)').trim();

  if (!username) {
    return { success: false, error: 'Tên đăng nhập không được để trống!' };
  }
  if (!password) {
    return { success: false, error: 'Mật khẩu không được để trống!' };
  }
  if (password.length < 4) {
    return { success: false, error: 'Mật khẩu phải có ít nhất 4 ký tự!' };
  }

  const payload: TeacherCredentials = {
    username,
    password,
    displayName,
    updatedAt: new Date().toISOString()
  };

  localStorage.setItem(TEACHER_CREDENTIALS_KEY, JSON.stringify(payload));

  // If saved login exists on this device, automatically update it with new credentials
  const savedLogin = getSavedTeacherLogin();
  if (savedLogin && savedLogin.remember) {
    setSavedTeacherLogin(username, password, true);
  }

  return { success: true };
};

export interface SavedTeacherLogin {
  username: string;
  password: string;
  remember: boolean;
}

/**
 * Get credentials saved on this device for one-touch login
 */
export const getSavedTeacherLogin = (): SavedTeacherLogin | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SAVED_TEACHER_LOGIN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.remember && parsed.username) {
      return parsed as SavedTeacherLogin;
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Save teacher credentials on this device
 */
export const setSavedTeacherLogin = (username: string, password: string, remember: boolean): void => {
  if (typeof window === 'undefined') return;
  if (remember) {
    localStorage.setItem(SAVED_TEACHER_LOGIN_KEY, JSON.stringify({
      username: username.trim(),
      password: password.trim(),
      remember: true
    }));
  } else {
    localStorage.removeItem(SAVED_TEACHER_LOGIN_KEY);
  }
};

/**
 * Clear saved credentials from this device
 */
export const clearSavedTeacherLogin = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SAVED_TEACHER_LOGIN_KEY);
};

/**
 * Get all available accounts (combining file-based INITIAL_ACCOUNTS with any locally saved overrides)
 */
export const getAllAccounts = (): AccountCredential[] => {
  if (typeof window === 'undefined') return INITIAL_ACCOUNTS;
  try {
    const raw = localStorage.getItem(CUSTOM_ACCOUNTS_KEY);
    if (!raw) return INITIAL_ACCOUNTS;
    const customList = JSON.parse(raw) as AccountCredential[];
    if (!Array.isArray(customList) || customList.length === 0) return INITIAL_ACCOUNTS;

    // Merge: custom overrides file-based by username
    const map = new Map<string, AccountCredential>();
    INITIAL_ACCOUNTS.forEach(a => map.set(a.username.toLowerCase(), a));
    customList.forEach(a => map.set(a.username.toLowerCase(), a));
    return Array.from(map.values());
  } catch {
    return INITIAL_ACCOUNTS;
  }
};

/**
 * Save custom/updated accounts list
 */
export const saveAccounts = (accounts: AccountCredential[]): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CUSTOM_ACCOUNTS_KEY, JSON.stringify(accounts));
};

import { getStudents, getClasses, updateStudent } from './assignmentService';

/**
 * Login verification (supports both teacher/admin accounts and student lookup)
 */
export const login = (
  usernameInput: string,
  passwordInput: string,
  expectedRole?: UserRole,
  classIdFilter?: string
): { success: boolean; user?: AuthUser; error?: string } => {
  const cleanUser = usernameInput.trim().toLowerCase();
  const cleanPass = passwordInput.trim();

  if (!cleanUser) {
    return { success: false, error: 'Vui lòng nhập tên đăng nhập hoặc họ tên học sinh!' };
  }
  if (!cleanPass) {
    return { success: false, error: 'Vui lòng nhập mật khẩu!' };
  }

  // Dedicated check for Teacher Mrs. Dung (supports customized credentials + master fallback)
  const teacherCreds = getTeacherCredentials();
  const normalizedUser = cleanUser.replace(/[\.\s_-]/g, '');
  const normalizedTeacherUser = teacherCreds.username.toLowerCase().replace(/[\.\s_-]/g, '');

  const isMatchTeacherUsername =
    cleanUser === teacherCreds.username.toLowerCase() ||
    normalizedUser === normalizedTeacherUser ||
    cleanUser === 'nextgen' ||
    cleanUser === 'nextgent' ||
    normalizedUser === 'nextgen' ||
    normalizedUser === 'nextgent' ||
    cleanUser === 'mrs. dung' ||
    cleanUser === 'mrs dung' ||
    cleanUser === 'mrsdung' ||
    normalizedUser === 'mrsdung';

  if (isMatchTeacherUsername || expectedRole === 'teacher') {
    // Check if password matches custom password OR default 88889999
    if (cleanPass === teacherCreds.password || cleanPass === '88889999') {
      const authUser: AuthUser = {
        id: 'teacher_nextgen',
        username: teacherCreds.username,
        role: 'teacher',
        name: teacherCreds.displayName || 'Giáo viên Nextgen (Nextgen English)',
        avatar: '👨‍🏫'
      };
      setCurrentUser(authUser);
      return { success: true, user: authUser };
    } else if (isMatchTeacherUsername) {
      return { success: false, error: 'Mật khẩu giáo viên không chính xác. Vui lòng kiểm tra lại!' };
    }
  }

  // If logging in as student, first check student records created by teacher
  if (expectedRole === 'student') {
    const students = getStudents(classIdFilter && classIdFilter !== 'ALL' ? classIdFilter : undefined);
    const matchedStudent = students.find(s => 
      s.name.toLowerCase() === cleanUser ||
      (s.englishName && s.englishName.toLowerCase() === cleanUser) ||
      (s.username && s.username.toLowerCase() === cleanUser) ||
      s.id.toLowerCase() === cleanUser
    );

    if (matchedStudent) {
      const authUser: AuthUser = {
        id: matchedStudent.id,
        username: matchedStudent.username || matchedStudent.name,
        role: 'student',
        name: matchedStudent.name,
        avatar: matchedStudent.avatar || '🎒',
        classId: matchedStudent.classId,
        className: matchedStudent.className,
        phone: matchedStudent.phone
      };
      setCurrentUser(authUser);
      return { success: true, user: authUser };
    }
  }

  // Check file/localStorage based accounts
  const accounts = getAllAccounts();
  const matched = accounts.find(a => a.username.toLowerCase() === cleanUser || a.username.toLowerCase() === usernameInput.trim().toLowerCase());

  if (!matched) {
    // If student role and not found in accounts or students
    if (expectedRole === 'student') {
      return { success: false, error: 'Không tìm thấy học sinh với tên này! Vui lòng kiểm tra lại lớp và họ tên.' };
    }
    return { success: false, error: 'Tên đăng nhập không tồn tại trong hệ thống!' };
  }

  if (matched.password !== cleanPass) {
    return { success: false, error: 'Mật khẩu không chính xác. Vui lòng kiểm tra lại!' };
  }

  if (expectedRole && matched.role !== expectedRole) {
    const roleName = expectedRole === 'teacher' ? 'Giáo viên' : 'Học sinh';
    return {
      success: false,
      error: `Tài khoản này không thuộc vai trò ${roleName}!`
    };
  }

  const authUser: AuthUser = {
    id: matched.id,
    username: matched.username,
    role: matched.role,
    name: matched.name,
    avatar: matched.avatar || (matched.role === 'teacher' ? '👩‍🏫' : '🎒'),
    classId: matched.classId,
    className: matched.className
  };

  setCurrentUser(authUser);
  return { success: true, user: authUser };
};

/**
 * Simple student login by Name and Class (NO PASSWORD REQUIRED)
 */
export const loginStudentSimple = (
  studentName: string,
  classIdOrName: string
): { success: boolean; user?: AuthUser; error?: string } => {
  const cleanName = (studentName || '').trim();
  const cleanClass = (classIdOrName || '').trim();

  if (!cleanClass) {
    return { success: false, error: 'Con ơi, vui lòng chọn lớp học của mình nhé!' };
  }
  if (!cleanName) {
    return { success: false, error: 'Con ơi, vui lòng chọn hoặc nhập họ và tên của mình nhé!' };
  }

  const norm = (s?: string) => (s || '').toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();
  const cleanNFC = (s?: string) => (s || '').trim().toLowerCase().normalize('NFC');

  const classes = getClasses();
  const targetClassNorm = norm(cleanClass);
  const matchedClass = classes.find(c => 
    c.id === cleanClass || 
    norm(c.name) === targetClassNorm ||
    cleanNFC(c.name) === cleanNFC(cleanClass)
  );

  const targetClassId = matchedClass ? matchedClass.id : cleanClass;
  const targetClassName = matchedClass ? matchedClass.name : cleanClass;

  // Check if student already exists in this class
  const students = getStudents(targetClassId);
  const targetNameNFC = cleanNFC(cleanName);

  const matchedStudent = students.find(s =>
    cleanNFC(s.name) === targetNameNFC ||
    (s.englishName && cleanNFC(s.englishName) === targetNameNFC) ||
    (s.id && s.id.toLowerCase() === targetNameNFC) ||
    (s.username && cleanNFC(s.username) === targetNameNFC)
  );

  const authUser: AuthUser = {
    id: matchedStudent ? matchedStudent.id : `std_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    username: matchedStudent?.username || cleanName,
    role: 'student',
    name: matchedStudent?.name || cleanName,
    avatar: matchedStudent?.avatar || '🎒',
    classId: targetClassId,
    className: targetClassName,
    phone: matchedStudent?.phone
  };

  setCurrentUser(authUser);
  return { success: true, user: authUser };
};

/**
 * Direct student login by Class ID and Student Name (No password required)
 */
export const loginStudentByClassAndName = (
  classId: string,
  studentNameOrId: string,
  _passwordInput?: string
): { success: boolean; user?: AuthUser; error?: string } => {
  return loginStudentSimple(studentNameOrId, classId);
};

/**
 * Get current logged in user
 */
export const getCurrentUser = (): AuthUser | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
};

/**
 * Set current logged in user
 */
export const setCurrentUser = (user: AuthUser | null): void => {
  if (typeof window === 'undefined') return;
  if (user) {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    // Also sync mrs_dung_user_role for compatibility
    localStorage.setItem('mrs_dung_user_role', user.role);
  } else {
    localStorage.removeItem(CURRENT_USER_KEY);
  }
};

/**
 * Logout
 */
export const logout = (): void => {
  setCurrentUser(null);
};

/**
 * Check if logged in
 */
export const isAuthenticated = (): boolean => {
  return !!getCurrentUser();
};

/**
 * Normalize phone number for consistent matching (09xxx, +84xxx, 84xxx, strips spaces, dots, dashes)
 */
export const normalizePhoneNumber = (phone: string): string => {
  if (!phone) return '';
  let clean = phone.replace(/[\s\.\-\(\)]/g, '').trim();
  if (clean.startsWith('+84')) {
    clean = '0' + clean.slice(3);
  } else if (clean.startsWith('84') && clean.length >= 10) {
    clean = '0' + clean.slice(2);
  }
  return clean;
};

/**
 * Login student with Class Name and Student Name (No password required)
 */
export const loginStudentWithClassAndPass = (
  classNameInput: string,
  studentNameInput: string,
  _passwordInput?: string
): { success: boolean; user?: AuthUser; error?: string } => {
  return loginStudentSimple(studentNameInput, classNameInput);
};

/**
 * Verify student's registered phone number and update/reset password
 */
export const verifyStudentPhoneAndResetPassword = (
  classNameInput: string,
  studentNameInput: string,
  phoneInput: string,
  newPasswordInput: string
): { success: boolean; message?: string; error?: string } => {
  const cleanClass = (classNameInput || '').trim();
  const cleanName = (studentNameInput || '').trim();
  const cleanPhone = normalizePhoneNumber(phoneInput);
  const cleanNewPass = (newPasswordInput || '').trim();

  if (!cleanClass) {
    return { success: false, error: 'Vui lòng chọn lớp học của con!' };
  }
  if (!cleanName) {
    return { success: false, error: 'Vui lòng nhập hoặc chọn họ và tên của con!' };
  }
  if (!cleanPhone) {
    return { success: false, error: 'Vui lòng nhập số điện thoại phụ huynh để xác minh!' };
  }
  if (cleanPhone.length < 9 || cleanPhone.length > 11) {
    return { success: false, error: 'Số điện thoại không đúng định dạng (cần 10 số, ví dụ: 0912345678)!' };
  }
  if (!cleanNewPass) {
    return { success: false, error: 'Vui lòng nhập mật khẩu mới!' };
  }
  if (cleanNewPass.length < 3) {
    return { success: false, error: 'Mật khẩu mới phải có ít nhất 3 ký tự!' };
  }

  const norm = (s?: string) => (s || '').toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();
  const cleanNFC = (s?: string) => (s || '').trim().toLowerCase().normalize('NFC');

  const classes = getClasses();
  const matchedClass = classes.find(c => c.id === cleanClass || norm(c.name) === norm(cleanClass));
  const targetClassId = matchedClass ? matchedClass.id : cleanClass;

  const students = getStudents(targetClassId);
  const targetNameNFC = cleanNFC(cleanName);

  const matchedStudent = students.find(s =>
    cleanNFC(s.name) === targetNameNFC ||
    (s.englishName && cleanNFC(s.englishName) === targetNameNFC) ||
    (s.id && s.id.toLowerCase() === targetNameNFC)
  );

  if (!matchedStudent) {
    return {
      success: false,
      error: `Không tìm thấy học sinh "${cleanName}" trong lớp "${matchedClass?.name || cleanClass}"! Vui lòng kiểm tra lại họ tên.`
    };
  }

  const studentCurrentPhone = normalizePhoneNumber(matchedStudent.phone || '');

  // Case 1: Student already has a phone number registered with teacher
  if (studentCurrentPhone) {
    if (cleanPhone !== studentCurrentPhone) {
      return {
        success: false,
        error: `Số điện thoại "${phoneInput}" không khớp với số điện thoại phụ huynh đã đăng ký cho bạn ${matchedStudent.name}! Vui lòng kiểm tra lại hoặc liên hệ Trung tâm Nextgen để kiểm tra SĐT trên hệ thống.`
      };
    }
  }

  // Case 2: Match confirmed (or student has no phone on record yet, so we bind this official phone)
  updateStudent(matchedStudent.id, {
    password: cleanNewPass,
    phone: cleanPhone
  });

  return {
    success: true,
    message: `🎉 Chúc mừng ${matchedStudent.name}! Mật khẩu mới đã được cập nhật thành công. Con có thể dùng mật khẩu mới này để đăng nhập ngay bây giờ!`
  };
};

