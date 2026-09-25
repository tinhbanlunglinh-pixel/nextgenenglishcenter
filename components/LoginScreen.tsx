import React, { useState, useEffect } from 'react';
import { UserRole, AuthUser, ClassRoom, Student } from '../types';
import {
  login,
  loginStudentSimple,
  loginStudentWithPassword,
  getSavedTeacherLogin,
  setSavedTeacherLogin,
  clearSavedTeacherLogin,
  getTeacherCredentials,
  saveTeacherCredentials
} from '../services/authService';
import { getClasses, getStudents, subscribeToSync } from '../services/assignmentService';
import { StudentLeaderboardHonor } from './student/StudentLeaderboardHonor';
import { StudentChangePasswordModal } from './student/StudentChangePasswordModal';
import { StudentRegisterModal } from './student/StudentRegisterModal';

interface LoginScreenProps {
  onLoginSuccess: (user: AuthUser) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  // Default to student role
  const [selectedRole, setSelectedRole] = useState<UserRole>('student');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Student password & registration states
  const [studentPassword, setStudentPassword] = useState('123');
  const [showStudentPassword, setShowStudentPassword] = useState(false);
  const [showStudentChangePassModal, setShowStudentChangePassModal] = useState(false);
  const [showStudentRegisterModal, setShowStudentRegisterModal] = useState(false);

  // Modal to customize teacher credentials from login screen
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customCurrentPass, setCustomCurrentPass] = useState('');
  const [customNewUsername, setCustomNewUsername] = useState('');
  const [customNewPass, setCustomNewPass] = useState('');
  const [customConfirmPass, setCustomConfirmPass] = useState('');
  const [customErrorMsg, setCustomErrorMsg] = useState('');
  const [customSuccessMsg, setCustomSuccessMsg] = useState('');

  // Student specific selection state
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [studentClassName, setStudentClassName] = useState<string>('');
  const [studentName, setStudentName] = useState<string>('');
  const [classStudents, setClassStudents] = useState<Student[]>([]);

  // Load classes, students, and saved teacher credentials on mount + subscribe to sync
  useEffect(() => {
    const loadClassesAndUrlParams = () => {
      const cls = getClasses();
      setClasses(cls);

      let urlClass = '';
      let urlStudent = '';
      try {
        const search = new URLSearchParams(window.location.search);
        urlClass = search.get('class') || search.get('className') || '';
        urlStudent = search.get('student') || search.get('studentName') || search.get('name') || '';
      } catch {}

      if (urlClass) {
        const norm = (str?: string) => (str || '').toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();
        const found = cls.find(c => c.name === urlClass || norm(c.name) === norm(urlClass));
        const activeName = found ? found.name : urlClass;
        setStudentClassName(activeName);
      } else if (cls.length > 0) {
        setStudentClassName(prev => {
          if (prev && cls.some(c => c.name === prev)) return prev;
          return cls[0].name;
        });
      }

      if (urlStudent) {
        setStudentName(urlStudent);
      }
    };

    loadClassesAndUrlParams();

    // Subscribe to cloud sync so classes appear automatically without manual refresh
    const unsubscribe = subscribeToSync((event) => {
      loadClassesAndUrlParams();
    });

    // Pre-load saved teacher login if present on device
    const saved = getSavedTeacherLogin();
    if (saved) {
      setUsername(saved.username);
      setPassword(saved.password);
      setRememberMe(true);
    } else {
      const defaultCreds = getTeacherCredentials();
      setUsername(defaultCreds.username);
      setPassword(defaultCreds.password);
      setRememberMe(true);
    }

    return () => unsubscribe();
  }, []);

  // Synchronize student list whenever selected class or classes change
  useEffect(() => {
    if (!studentClassName) {
      setClassStudents([]);
      return;
    }
    const norm = (str?: string) => (str || '').toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();
    const clsObj = classes.find(c => c.name === studentClassName || norm(c.name) === norm(studentClassName));
    if (clsObj) {
      setClassStudents(getStudents(clsObj.id));
    } else {
      setClassStudents(getStudents(studentClassName));
    }
  }, [studentClassName, classes]);

  // When class changes, update student list for suggestions
  const handleClassChange = (className: string) => {
    setStudentClassName(className);
    setStudentName('');
    setErrorMsg('');
  };

  // Switch role tabs - populate saved credentials if teacher
  const handleRoleChange = (role: UserRole) => {
    setSelectedRole(role);
    setErrorMsg('');
    if (role === 'teacher') {
      const saved = getSavedTeacherLogin();
      if (saved) {
        setUsername(saved.username);
        setPassword(saved.password);
        setRememberMe(true);
      } else {
        const creds = getTeacherCredentials();
        setUsername(creds.username);
        setPassword(creds.password);
        setRememberMe(true);
      }
    } else {
      setUsername('');
      setPassword('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);

    setTimeout(() => {
      let result;
      if (selectedRole === 'student') {
        // Student login: checks password (default: 123)
        result = loginStudentWithPassword(studentName, studentClassName, studentPassword);
      } else {
        // Teacher login: supports customized credentials
        result = login(username, password, 'teacher');
        if (result.success && result.user) {
          if (rememberMe) {
            setSavedTeacherLogin(username, password, true);
          } else {
            clearSavedTeacherLogin();
          }
        }
      }

      setIsLoading(false);

      if (result.success && result.user) {
        onLoginSuccess(result.user);
      } else {
        setErrorMsg(result.error || 'Đăng nhập không thành công. Vui lòng thử lại!');
      }
    }, 150);
  };

  const handleSaveCustomCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomErrorMsg('');
    setCustomSuccessMsg('');

    const creds = getTeacherCredentials();
    const curPass = customCurrentPass.trim();
    if (curPass !== creds.password && curPass !== '88889999') {
      setCustomErrorMsg('Mật khẩu hiện tại không chính xác!');
      return;
    }

    const newU = customNewUsername.trim();
    const newP = customNewPass.trim();
    const confirmP = customConfirmPass.trim();

    if (!newU) {
      setCustomErrorMsg('Vui lòng nhập tên đăng nhập mới!');
      return;
    }
    if (!newP) {
      setCustomErrorMsg('Vui lòng nhập mật khẩu mới!');
      return;
    }
    if (newP.length < 4) {
      setCustomErrorMsg('Mật khẩu mới phải có ít nhất 4 ký tự!');
      return;
    }
    if (newP !== confirmP) {
      setCustomErrorMsg('Xác nhận mật khẩu mới không trùng khớp!');
      return;
    }

    const res = saveTeacherCredentials({ username: newU, password: newP });
    if (!res.success) {
      setCustomErrorMsg(res.error || 'Không thể lưu tài khoản');
      return;
    }

    setUsername(newU);
    setPassword(newP);
    setSavedTeacherLogin(newU, newP, true);
    setRememberMe(true);

    setCustomSuccessMsg('✓ Đã cập nhật và lưu tài khoản trên thiết bị này thành công!');
    setTimeout(() => {
      setShowCustomModal(false);
      setCustomSuccessMsg('');
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-slate-900 flex flex-col justify-center items-center p-3 sm:p-6 lg:p-8 font-sans relative overflow-hidden">
      {/* Background Glow Decorations */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container: 2-column on desktop (Login Card + Honor Board Leaderboard), 1-column on mobile */}
      <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start relative z-10 my-auto">
        {/* Left Column: Login Card (col-span-12 lg:col-span-5) */}
        <div className="w-full lg:col-span-5 bg-white rounded-3xl shadow-2xl overflow-hidden border border-white/20 relative animate-fade-in">
          {/* Top Header Card */}
        <div className="bg-gradient-to-r from-brand-900 via-brand-800 to-teal-800 p-6 sm:p-8 text-center text-white relative border-b-4 border-brand-500">
          <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-3 bg-white rounded-3xl p-2 shadow-2xl border-2 border-brand-400 flex items-center justify-center transform hover:scale-105 transition-transform">
            <img
              src="/nextgen-logo.png"
              alt="Nextgen English"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (!target.src.includes('nextgen-avatar.jpg')) {
                  target.src = '/nextgen-avatar.jpg';
                }
              }}
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight uppercase font-display text-white">
            <span className="text-[#2dd4bf]">NEXTGEN</span> ENGLISH
          </h1>
          <p className="text-xs sm:text-sm text-brand-200 font-bold mt-1">
            Trung Tâm Ngoại Ngữ Nextgen - Uông Bí
          </p>
          <p className="text-[11px] text-white/80 italic font-serif mt-0.5">
            “Learn English, Lead the way”
          </p>
        </div>

        {/* Form Container */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Role Selection Tabs */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
              1. Chọn Vai Trò Đăng Nhập
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
              <button
                type="button"
                onClick={() => handleRoleChange('student')}
                className={`py-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                  selectedRole === 'student'
                    ? 'bg-white text-emerald-700 shadow-md scale-102 ring-2 ring-emerald-500/20'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="text-base">🎒</span>
                <span>Học Sinh</span>
              </button>

              <button
                type="button"
                onClick={() => handleRoleChange('teacher')}
                className={`py-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                  selectedRole === 'teacher'
                    ? 'bg-white text-brand-700 shadow-md scale-102 ring-2 ring-brand-500/20'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="text-base">👩‍🏫</span>
                <span>Giáo Viên</span>
              </button>
            </div>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            {selectedRole === 'student' ? (
              <div className="space-y-4">
                {/* 1. Chọn Lớp Học Của Con */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    1. Chọn Lớp Học Của Con
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 text-sm pointer-events-none">
                      🏫
                    </span>
                    <select
                      value={studentClassName}
                      onChange={e => handleClassChange(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-sm font-bold bg-white text-slate-800 cursor-pointer"
                    >
                      {classes.length === 0 ? (
                        <option value="">-- Chưa có lớp học nào --</option>
                      ) : (
                        classes.map(c => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                          </option>
                        ))
                      )}
                    </select>
                    {classes.length === 0 && (
                      <p className="text-[11px] text-amber-700 mt-1.5 italic font-medium">
                        ⚠️ Giáo viên đang cập nhật danh sách lớp và bài tập. Các con vui lòng quay lại sau nhé!
                      </p>
                    )}
                  </div>
                </div>

                {/* 2. Chọn Hoặc Nhập Tên Học Sinh */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    2. Chọn Hoặc Nhập Họ Và Tên Của Con
                  </label>

                  {/* Dropdown to pick student from roster if available */}
                  {classStudents.length > 0 && (
                    <div className="mb-2">
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 text-sm pointer-events-none">
                          📋
                        </span>
                        <select
                          value={classStudents.some(s => s.name === studentName) ? studentName : ''}
                          onChange={e => {
                            setStudentName(e.target.value);
                            setErrorMsg('');
                          }}
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50/50 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-sm font-bold text-emerald-950 cursor-pointer"
                        >
                          <option value="">-- Bấm vào đây để chọn tên trong danh sách ({classStudents.length} học sinh) --</option>
                          {classStudents.map(s => (
                            <option key={s.id} value={s.name}>
                              {s.avatar || '👤'} {s.name} {s.englishName ? `(${s.englishName})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Input field */}
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 text-sm pointer-events-none">
                      🎒
                    </span>
                    <input
                      type="text"
                      required
                      value={studentName}
                      onChange={e => setStudentName(e.target.value)}
                      placeholder={classStudents.length > 0 ? "Hoặc tự gõ họ tên con vào đây..." : "Ví dụ: Nguyễn Văn A"}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-sm font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400"
                      autoComplete="off"
                      autoFocus
                    />
                  </div>

                  {/* Quick click suggestions if class has student list */}
                  {classStudents.length > 0 && (
                    <div className="mt-2.5">
                      <span className="text-[11px] font-bold text-slate-400 block mb-1">
                        Hoặc bấm chọn nhanh tên của con:
                      </span>
                      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1.5 bg-slate-50/80 rounded-xl border border-slate-100">
                        {classStudents.map(s => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setStudentName(s.name);
                              setErrorMsg('');
                            }}
                            className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                              studentName === s.name
                                ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm scale-102 ring-2 ring-emerald-500/30'
                                : 'bg-white hover:bg-emerald-50 text-slate-700 border-slate-200'
                            }`}
                          >
                            <span>{s.avatar || '👤'}</span>
                            <span>{s.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Mật Khẩu Học Sinh */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      3. Mật Khẩu Đăng Nhập
                    </label>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                      Mặc định: 123
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 text-sm pointer-events-none">
                      🔒
                    </span>
                    <input
                      type={showStudentPassword ? 'text' : 'password'}
                      required
                      value={studentPassword}
                      onChange={e => setStudentPassword(e.target.value)}
                      placeholder="Mật khẩu (mặc định: 123)..."
                      className="w-full pl-10 pr-11 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-sm font-bold text-slate-900 font-mono"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowStudentPassword(!showStudentPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 text-sm"
                      tabIndex={-1}
                    >
                      {showStudentPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                {/* Quick actions for student: Change password & Register */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowStudentChangePassModal(true)}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-900 underline flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span>🔑</span>
                    <span>Đổi mật khẩu học sinh</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowStudentRegisterModal(true)}
                    className="text-xs font-bold text-brand-600 hover:text-brand-800 underline flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span>✨</span>
                    <span>Tạo tài khoản học sinh mới</span>
                  </button>
                </div>
              </div>
            ) : (
              // TEACHER LOGIN: USERNAME & PASSWORD, NO AUTOFILL
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tên đăng nhập Giáo Viên
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 text-sm pointer-events-none">
                      👩‍🏫
                    </span>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      placeholder="Nhập tên đăng nhập..."
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 outline-none text-sm transition-all font-medium"
                      autoComplete="off"
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mật khẩu Giáo Viên
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 text-sm pointer-events-none">
                      🔒
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Nhập mật khẩu..."
                      className="w-full pl-10 pr-11 py-3 rounded-xl border border-slate-200 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 outline-none text-sm transition-all font-medium"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 text-sm"
                      tabIndex={-1}
                    >
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                {/* Remember Me & Change Credentials Link */}
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={e => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300 cursor-pointer"
                    />
                    <span>Ghi nhớ trên thiết bị này</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      const creds = getTeacherCredentials();
                      setCustomNewUsername(creds.username);
                      setCustomCurrentPass('');
                      setCustomNewPass('');
                      setCustomConfirmPass('');
                      setCustomErrorMsg('');
                      setCustomSuccessMsg('');
                      setShowCustomModal(true);
                    }}
                    className="text-[11px] font-bold text-brand-600 hover:text-brand-800 underline transition-colors cursor-pointer"
                  >
                    ⚙️ Đổi tài khoản / Mật khẩu
                  </button>
                </div>

                {rememberMe && username && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] font-semibold text-emerald-800 flex items-center gap-1.5 animate-fade-in">
                    <span>💾</span>
                    <span>Tài khoản đã được lưu trên thiết bị. Lần sau thầy/cô không cần nhập lại!</span>
                  </div>
                )}
              </div>
            )}

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 animate-shake">
                <span>⚠️</span>
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3.5 rounded-2xl font-black text-sm text-white shadow-xl transition-all flex items-center justify-center gap-2 ${
                selectedRole === 'teacher'
                  ? 'bg-brand-600 hover:bg-brand-700 active:scale-98 shadow-brand-500/30'
                  : 'bg-emerald-600 hover:bg-emerald-700 active:scale-98 shadow-emerald-500/30'
              } disabled:opacity-50`}
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Đang xử lý...</span>
                </>
              ) : selectedRole === 'student' ? (
                <>
                  <span>🚀</span>
                  <span>VÀO LÀM BÀI NGAY</span>
                </>
              ) : (
                <>
                  <span>🔐</span>
                  <span>ĐĂNG NHẬP GIÁO VIÊN</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Right Column: Leaderboard of Hardworking Top Students (col-span-12 lg:col-span-7) */}
      <div className="w-full lg:col-span-7 space-y-4 animate-fade-in">
        <StudentLeaderboardHonor
          initialClassId={studentClassName || 'ALL'}
          title="BẢNG DANH SÁCH THÀNH TÍCH HỌC SINH CHĂM CHỈ ĐANG DẪN ĐẦU ĐIỂM CAO NHẤT"
          subtitle="Tuyên dương các con nỗ lực làm bài tập về nhà chăm chỉ và đạt điểm số cao nhất lớp Nextgen English!"
        />
      </div>
    </div>

    {/* Modal: Customize Teacher Account & Password */}
    {showCustomModal && (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in font-sans">
        <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-brand-100">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔐</span>
              <div>
                <h3 className="text-base font-black text-slate-900">Đổi Tài Khoản Giáo Viên</h3>
                <p className="text-xs text-slate-500">Tùy chỉnh tên đăng nhập & mật khẩu của thầy/cô</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowCustomModal(false)}
              className="text-slate-400 hover:text-slate-600 font-bold p-1 text-lg"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSaveCustomCredentials} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Mật khẩu hiện tại (để xác nhận)
              </label>
              <input
                type="password"
                required
                value={customCurrentPass}
                onChange={e => setCustomCurrentPass(e.target.value)}
                placeholder="Nhập mật khẩu hiện tại (hoặc 88889999)..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tên đăng nhập mới
              </label>
              <input
                type="text"
                required
                value={customNewUsername}
                onChange={e => setCustomNewUsername(e.target.value)}
                placeholder="Ví dụ: Nextgen hoặc tên thầy/cô muốn..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Mật khẩu mới
              </label>
              <input
                type="password"
                required
                value={customNewPass}
                onChange={e => setCustomNewPass(e.target.value)}
                placeholder="Nhập mật khẩu mới (tối thiểu 4 ký tự)..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Nhập lại mật khẩu mới
              </label>
              <input
                type="password"
                required
                value={customConfirmPass}
                onChange={e => setCustomConfirmPass(e.target.value)}
                placeholder="Nhập lại mật khẩu mới..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:border-brand-500"
              />
            </div>

            {customErrorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-1.5">
                <span>⚠️</span>
                <span>{customErrorMsg}</span>
              </div>
            )}

            {customSuccessMsg && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-1.5">
                <span>✓</span>
                <span>{customSuccessMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCustomModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-black shadow-md transition-all cursor-pointer"
              >
                Lưu & Ghi Nhớ Ngay
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* Modal: Đổi Mật Khẩu Học Sinh */}
    <StudentChangePasswordModal
      isOpen={showStudentChangePassModal}
      onClose={() => setShowStudentChangePassModal(false)}
      initialClassName={studentClassName}
      initialStudentName={studentName}
      onSuccess={(newPass) => {
        setStudentPassword(newPass);
      }}
    />

    {/* Modal: Tạo Tài Khoản Học Sinh Mới */}
    <StudentRegisterModal
      isOpen={showStudentRegisterModal}
      onClose={() => setShowStudentRegisterModal(false)}
      initialClassName={studentClassName}
      onRegisterSuccess={(authUser) => {
        onLoginSuccess(authUser);
      }}
    />
  </div>
  );
};
