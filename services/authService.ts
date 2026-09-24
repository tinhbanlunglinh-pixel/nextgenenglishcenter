import { AuthUser, UserRole, Student } from '../types';
import { INITIAL_ACCOUNTS, AccountCredential } from '../accounts/credentials';

const CURRENT_USER_KEY = 'nextgen_auth_current_user';
const CUSTOM_ACCOUNTS_KEY = 'nextgen_custom_accounts';
export const TEACHER_CREDENTIALS_KEY = 'nextgen_teacher_custom_credentials';
export const SAVED_TEACHER_LOGIN_KEY = 'nextgen_saved_teacher_login';

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

import { getStudents, getClasses, updateStudent, addStudent, addClass } from './assignmentService';

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

  // Dedicated check for Teacher Nextgen (supports customized credentials + master fallback)
  const teacherCreds = getTeacherCredentials();
  const normalizedUser = cleanUser.replace(/[\.\s_-]/g, '');
  const normalizedTeacherUser = teacherCreds.username.toLowerCase().replace(/[\.\s_-]/g, '');

  const isMatchTeacherUsername =
    cleanUser === teacherCreds.username.toLowerCase() ||
    normalizedUser === normalizedTeacherUser ||
    cleanUser === 'nextgen' ||
    cleanUser === 'nextgent' ||
    normalizedUser === 'nextgen' ||
    normalizedUser === 'nextgent';

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
    localStorage.setItem('nextgen_user_role', user.role);
  } else {
    localStorage.removeItem(CURRENT_USER_KEY);
    localStorage.removeItem('nextgen_user_role');
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
 * Create a new student account (Name, Class, default password '123')
 */
export const createStudentAccount = (params: {
  name: string;
  className: string;
  classId?: string;
  englishName?: string;
  phone?: string;
  password?: string;
}): { success: boolean; student?: Student; user?: AuthUser; error?: string } => {
  const cleanName = (params.name || '').trim();
  const cleanClassName = (params.className || '').trim();
  const cleanPass = (params.password || '123').trim() || '123';
  const cleanEnglish = (params.englishName || '').trim();
  const cleanPhone = (params.phone || '').trim();

  if (!cleanClassName) {
    return { success: false, error: 'Con ơi, vui lòng chọn hoặc nhập tên lớp học nhé!' };
  }
  if (!cleanName) {
    return { success: false, error: 'Con ơi, vui lòng nhập họ và tên của mình nhé!' };
  }

  const norm = (s?: string) => (s || '').toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();
  const cleanNFC = (s?: string) => (s || '').trim().toLowerCase().normalize('NFC');

  const classes = getClasses();
  let matchedClass = classes.find(c => 
    (params.classId && c.id === params.classId) || 
    c.name === cleanClassName || 
    norm(c.name) === norm(cleanClassName) ||
    cleanNFC(c.name) === cleanNFC(cleanClassName)
  );

  let targetClassId = matchedClass ? matchedClass.id : '';
  let targetClassName = matchedClass ? matchedClass.name : cleanClassName;

  if (!matchedClass) {
    // Tự động tạo lớp mới nếu chưa có
    const created = addClass(cleanClassName, 6, `Lớp ${cleanClassName}`);
    targetClassId = created.id;
    targetClassName = created.name;
  }

  // Kiểm tra xem đã có bạn học sinh này trong lớp chưa
  const students = getStudents(targetClassId);
  const targetNameNFC = cleanNFC(cleanName);
  const existingStudent = students.find(s =>
    cleanNFC(s.name) === targetNameNFC ||
    (s.englishName && cleanNFC(s.englishName) === targetNameNFC)
  );

  if (existingStudent) {
    return {
      success: false,
      error: `Học sinh "${cleanName}" đã có trong lớp "${targetClassName}" rồi! Con có thể dùng mật khẩu (mặc định là 123) để đăng nhập ngay nhé.`
    };
  }

  const newStudent = addStudent(
    cleanName,
    targetClassId,
    targetClassName,
    cleanEnglish,
    cleanPhone,
    'Tài khoản tự đăng ký',
    cleanPass
  );

  const authUser: AuthUser = {
    id: newStudent.id,
    username: newStudent.username || newStudent.name,
    role: 'student',
    name: newStudent.name,
    avatar: newStudent.avatar || '🎒',
    classId: newStudent.classId,
    className: newStudent.className,
    phone: newStudent.phone
  };

  setCurrentUser(authUser);
  return { success: true, student: newStudent, user: authUser };
};

/**
 * Login student with Class Name, Student Name, and Password (Default: 123)
 */
export const loginStudentWithPassword = (
  studentNameInput: string,
  classIdOrName: string,
  passwordInput: string = '123'
): { success: boolean; user?: AuthUser; error?: string } => {
  const cleanName = (studentNameInput || '').trim();
  const cleanClass = (classIdOrName || '').trim();
  const cleanPass = (passwordInput || '').trim();

  if (!cleanClass) {
    return { success: false, error: 'Con ơi, vui lòng chọn lớp học của mình nhé!' };
  }
  if (!cleanName) {
    return { success: false, error: 'Con ơi, vui lòng chọn hoặc nhập họ và tên của mình nhé!' };
  }
  if (!cleanPass) {
    return { success: false, error: 'Con ơi, vui lòng nhập mật khẩu (mặc định ban đầu là 123)!' };
  }

  const norm = (s?: string) => (s || '').toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();
  const cleanNFC = (s?: string) => (s || '').trim().toLowerCase().normalize('NFC');

  const classes = getClasses();
  const matchedClass = classes.find(c => 
    c.id === cleanClass || 
    norm(c.name) === norm(cleanClass) ||
    cleanNFC(c.name) === cleanNFC(cleanClass)
  );

  const targetClassId = matchedClass ? matchedClass.id : cleanClass;
  const targetClassName = matchedClass ? matchedClass.name : cleanClass;

  const students = getStudents(targetClassId);
  const targetNameNFC = cleanNFC(cleanName);

  const matchedStudent = students.find(s =>
    cleanNFC(s.name) === targetNameNFC ||
    (s.englishName && cleanNFC(s.englishName) === targetNameNFC) ||
    (s.id && s.id.toLowerCase() === targetNameNFC) ||
    (s.username && cleanNFC(s.username) === targetNameNFC)
  );

  if (!matchedStudent) {
    return {
      success: false,
      error: `Không tìm thấy bạn "${cleanName}" trong lớp "${targetClassName}". Con kiểm tra lại họ tên hoặc bấm "Tạo tài khoản học sinh mới" nhé!`
    };
  }

  const expectedPassword = (matchedStudent.password || '123').trim();
  if (cleanPass !== expectedPassword) {
    return {
      success: false,
      error: `Mật khẩu không chính xác! (Mật khẩu mặc định là 123 hoặc con bấm "Đổi mật khẩu" bên dưới nếu đã từng đổi)`
    };
  }

  const authUser: AuthUser = {
    id: matchedStudent.id,
    username: matchedStudent.username || matchedStudent.name,
    role: 'student',
    name: matchedStudent.name,
    avatar: matchedStudent.avatar || '🎒',
    classId: targetClassId,
    className: targetClassName,
    phone: matchedStudent.phone
  };

  setCurrentUser(authUser);
  return { success: true, user: authUser };
};

/**
 * Change student password requiring ONLY old password and new password
 */
export const changeStudentPasswordWithOldPassword = (
  classNameInput: string,
  studentNameInput: string,
  oldPasswordInput: string,
  newPasswordInput: string
): { success: boolean; message?: string; error?: string } => {
  const cleanClass = (classNameInput || '').trim();
  const cleanName = (studentNameInput || '').trim();
  const cleanOldPass = (oldPasswordInput || '').trim();
  const cleanNewPass = (newPasswordInput || '').trim();

  if (!cleanClass) {
    return { success: false, error: 'Vui lòng chọn lớp học của con!' };
  }
  if (!cleanName) {
    return { success: false, error: 'Vui lòng nhập hoặc chọn họ và tên của con!' };
  }
  if (!cleanOldPass) {
    return { success: false, error: 'Vui lòng nhập mật khẩu hiện tại (mật khẩu cũ)!' };
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
      error: `Không tìm thấy học sinh "${cleanName}" trong lớp "${matchedClass?.name || cleanClass}"! Vui lòng kiểm tra lại.`
    };
  }

  const currentPass = (matchedStudent.password || '123').trim();
  if (cleanOldPass !== currentPass) {
    return {
      success: false,
      error: 'Mật khẩu hiện tại (cũ) không chính xác! (Mật khẩu ban đầu mặc định là 123 nếu con chưa từng đổi).'
    };
  }

  updateStudent(matchedStudent.id, {
    password: cleanNewPass
  });

  // If current logged in session is this student, keep in sync
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.id === matchedStudent.id) {
    setCurrentUser({
      ...currentUser,
      name: matchedStudent.name
    });
  }

  return {
    success: true,
    message: `🎉 Chúc mừng ${matchedStudent.name}! Đổi mật khẩu thành công. Mật khẩu mới của con là "${cleanNewPass}".`
  };
};

/**
 * Teacher grants / changes / resets password for any student
 */
export const teacherResetStudentPassword = (
  studentId: string,
  newPassword: string = '123'
): { success: boolean; message?: string; error?: string } => {
  const cleanPass = (newPassword || '123').trim() || '123';
  const students = getStudents();
  const target = students.find(s => s.id === studentId);
  if (!target) {
    return { success: false, error: 'Không tìm thấy học sinh trong hệ thống!' };
  }

  updateStudent(studentId, {
    password: cleanPass
  });

  return {
    success: true,
    message: `✓ Đã cập nhật mật khẩu cho học sinh "${target.name}" thành "${cleanPass}".`
  };
};

/**
 * Backward compatibility aliases
 */
export const loginStudentWithClassAndPass = (
  classNameInput: string,
  studentNameInput: string,
  passwordInput?: string
): { success: boolean; user?: AuthUser; error?: string } => {
  if (passwordInput !== undefined && passwordInput.trim() !== '') {
    return loginStudentWithPassword(studentNameInput, classNameInput, passwordInput);
  }
  return loginStudentSimple(studentNameInput, classNameInput);
};

export const verifyStudentPhoneAndResetPassword = (
  classNameInput: string,
  studentNameInput: string,
  _phoneInput: string,
  newPasswordInput: string
): { success: boolean; message?: string; error?: string } => {
  // Gracefully supports phone-less password reset
  return changeStudentPasswordWithOldPassword(classNameInput, studentNameInput, '123', newPasswordInput);
};

