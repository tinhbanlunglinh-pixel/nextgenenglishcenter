import React, { useState, useEffect } from 'react';
import { UserRole, AuthUser } from './types';
import { hasApiKey } from './services/geminiService';
import { initCloudSync, forceCloudSyncNow } from './services/assignmentService';
import { isFirebaseConfigured } from './services/firebaseService';
import { getCurrentUser, logout } from './services/authService';
import { LoginScreen } from './components/LoginScreen';
import { TeacherDashboard } from './components/teacher/TeacherDashboard';
import { StudentDashboard } from './components/student/StudentDashboard';
import { SettingsModal } from './components/SettingsModal';
import { LearningHistory } from './components/LearningHistory';

interface LogoProps {
  className?: string;
  color?: string;
  alt?: string;
}

export const NextgenLogo = ({ className = "w-16 h-16", alt = "NEXTGEN ENGLISH" }: LogoProps) => (
  <div className={`relative ${className} flex items-center justify-center shrink-0`}>
    <img
      src="/nextgen-logo.png"
      alt={alt}
      onError={(e) => {
        const target = e.target as HTMLImageElement;
        if (!target.src.includes('nextgen-avatar.jpg')) {
          target.src = '/nextgen-avatar.jpg';
        }
      }}
      className="w-full h-full object-contain"
    />
  </div>
);

function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => getCurrentUser());
  const [currentRole, setCurrentRole] = useState<UserRole>(() => {
    const user = getCurrentUser();
    if (user) return user.role;
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('nextgen_user_role') as UserRole;
      if (saved === 'teacher' || saved === 'student') return saved;
    }
    return 'teacher'; // default role
  });

  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [isHeaderSyncing, setIsHeaderSyncing] = useState(false);

  useEffect(() => {
    const cleanupCloudSync = initCloudSync();
    return () => {
      cleanupCloudSync();
    };
  }, []);

  useEffect(() => {
    const valid = hasApiKey();
    setHasKey(valid);
    if (!valid && currentRole === 'teacher' && currentUser) {
      // Prompt settings on launch for teacher if no key configured
      setShowSettings(true);
    }
  }, [currentRole, currentUser]);

  const handleRoleChange = (role: UserRole) => {
    setCurrentRole(role);
    localStorage.setItem('nextgen_user_role', role);
  };

  const handleLoginSuccess = (user: AuthUser) => {
    setCurrentUser(user);
    setCurrentRole(user.role);
    if (user.role === 'student' && user.name) {
      if (user.username !== 'hocsinh' && user.name !== 'Học Sinh') {
        localStorage.setItem('nextgen_selected_student', user.name);
        localStorage.setItem('nextgen_active_student_name', user.name);
        if (user.className) {
          localStorage.setItem('nextgen_selected_class', user.className);
          localStorage.setItem('nextgen_active_class_name', user.className);
        }
      }
    }
  };

  const handleLogout = () => {
    logout();
    setCurrentUser(null);
  };

  // If not logged in, show Login Screen
  if (!currentUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-brand-50 flex flex-col font-serif text-slate-900">
      {/* Header */}
      <header className="bg-brand-900 border-b-4 border-brand-800 sticky top-0 z-50 shadow-xl font-sans">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-2">
          {/* Logo & Brand */}
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="bg-white rounded-xl sm:rounded-2xl p-1 sm:p-1.5 shadow-lg border-2 border-brand-400">
              <NextgenLogo className="w-9 h-9 sm:w-11 sm:h-11" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-base sm:text-xl md:text-2xl font-black text-white uppercase tracking-tight font-display leading-tight flex items-center gap-1.5">
                <span className="text-highlight-400">NEXTGEN</span> ENGLISH
              </h1>
              <span className="text-[8px] sm:text-[10px] font-black text-brand-200 uppercase tracking-[0.12em] sm:tracking-[0.2em] opacity-95 hidden xs:block">
                Learn English, Lead the way
              </span>
            </div>
          </div>

          {/* Center: Role Switcher / Student Identity */}
          {currentUser.role === 'teacher' ? (
            <div className="flex items-center bg-brand-800/80 p-1 rounded-2xl border border-white/10 shadow-inner">
              <button
                onClick={() => handleRoleChange('teacher')}
                className={`px-3 sm:px-5 py-1.5 sm:py-2 rounded-xl font-black text-xs sm:text-sm flex items-center gap-1.5 transition-all ${
                  currentRole === 'teacher'
                    ? 'bg-brand-500 text-white shadow-lg scale-102 ring-2 ring-white/30'
                    : 'text-brand-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <span className="text-base">👩‍🏫</span>
                <span>Giáo Viên</span>
              </button>

              <button
                onClick={() => handleRoleChange('student')}
                className={`px-3 sm:px-5 py-1.5 sm:py-2 rounded-xl font-black text-xs sm:text-sm flex items-center gap-1.5 transition-all ${
                  currentRole === 'student'
                    ? 'bg-emerald-500 text-white shadow-lg scale-102 ring-2 ring-white/30'
                    : 'text-brand-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <span className="text-base">🎒</span>
                <span>Xem giao diện HS</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-emerald-800/80 px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl border border-white/10 text-white shadow-inner">
              <span className="text-base">{currentUser.avatar || '🎒'}</span>
              <span className="text-xs sm:text-sm font-black tracking-wide">Học Sinh: {currentUser.name}</span>
              {currentUser.className && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-[10px] font-bold hidden sm:inline-block">
                  {currentUser.className}
                </span>
              )}
            </div>
          )}

          {/* Right Action Icons */}
          <div className="flex items-center gap-2">
            {/* Firebase Connected / Cloud Sync Button */}
            {isFirebaseConfigured() && (
              <button
                onClick={async () => {
                  if (isHeaderSyncing) return;
                  setIsHeaderSyncing(true);
                  try {
                    await forceCloudSyncNow();
                  } finally {
                    setTimeout(() => setIsHeaderSyncing(false), 700);
                  }
                }}
                className="hidden sm:flex items-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
                title="Đã kết nối Firebase Realtime Database. Bấm để đồng bộ ngay dữ liệu mới nhất từ đám mây!"
              >
                <span className={`text-xs ${isHeaderSyncing ? 'animate-spin inline-block' : 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse'}`} />
                <span className="hidden md:inline">{isHeaderSyncing ? 'Đang đồng bộ...' : '🔥 Cloud Sync'}</span>
                <span className="md:hidden">{isHeaderSyncing ? '...' : '🔥 Sync'}</span>
              </button>
            )}

            {/* History Button */}
            <button
              onClick={() => setShowHistory(true)}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all"
              title="Xem lịch sử học tập"
            >
              <span className="text-base">📊</span>
              <span className="hidden sm:inline">Lịch sử</span>
            </button>

            {/* Settings Button (For teacher) */}
            {currentUser.role === 'teacher' && (
              <button
                onClick={() => setShowSettings(true)}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all"
                title="Cài đặt API & Đồng bộ"
              >
                <span className="text-base">⚙️</span>
                <span className="hidden sm:inline">Cài đặt</span>
                {!hasKey && (
                  <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" title="Chưa có API key" />
                )}
              </button>
            )}

            {/* User Profile Info & Logout */}
            <div className="flex items-center gap-1.5 pl-2 border-l border-white/20">
              <div className="hidden sm:flex flex-col text-right text-white leading-tight">
                <span className="text-xs font-black truncate max-w-[120px]">{currentUser.name}</span>
                <span className="text-[9px] text-brand-200 uppercase font-semibold">
                  {currentUser.role === 'teacher' ? 'Giáo viên' : 'Học sinh'}
                </span>
              </div>

              <button
                onClick={handleLogout}
                className="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-rose-500/80 hover:bg-rose-600 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1 shadow-sm"
                title="Đăng xuất khỏi hệ thống"
              >
                <span>🚪</span>
                <span className="hidden md:inline">Đăng xuất</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace based on Active Role */}
      <main className="max-w-[1500px] mx-auto px-3 sm:px-6 py-6 sm:py-10 flex-grow w-full relative">
        {currentRole === 'teacher' ? (
          <TeacherDashboard
            onOpenSettings={() => setShowSettings(true)}
            onSwitchToStudent={() => handleRoleChange('student')}
          />
        ) : (
          <StudentDashboard />
        )}
      </main>

      {/* Modals */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSaved={() => setHasKey(hasApiKey())}
      />

      {showHistory && (
        <LearningHistory onClose={() => setShowHistory(false)} />
      )}

      {/* Footer with Full School Information matching media_1789946906981.png */}
      <footer className="bg-[#13443e] text-white border-t-4 border-[#0f3933] pt-12 pb-8 font-sans">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12 items-center mb-10">
            {/* Column 1: Logo & Brand Name */}
            <div className="md:col-span-4 lg:col-span-3 flex flex-col items-center md:items-start text-center md:text-left">
              <div className="w-24 h-24 sm:w-28 sm:h-28 bg-white rounded-3xl p-3 shadow-xl border-2 border-[#2dd4bf] flex items-center justify-center mb-4 transition-transform hover:scale-105">
                <NextgenLogo className="w-full h-full" />
              </div>
              <h3 className="font-black text-xl sm:text-2xl text-[#2dd4bf] uppercase tracking-wide font-display">
                NEXTGEN ENGLISH
              </h3>
              <p className="text-white/90 text-sm font-serif italic mt-1">
                “Learn English, Lead the way”
              </p>
            </div>

            {/* Column 2: Liên Hệ */}
            <div className="md:col-span-5 lg:col-span-5 space-y-3 text-center md:text-left">
              <h4 className="font-black text-[#2dd4bf] text-sm sm:text-base uppercase tracking-[0.25em] mb-4">
                LIÊN HỆ
              </h4>
              <div className="space-y-2.5 text-xs sm:text-sm font-medium text-white/90">
                <p className="flex items-start gap-2.5 justify-center md:justify-start leading-relaxed">
                  <span className="text-base text-rose-400 shrink-0">📍</span>
                  <span>Số 32 Tổ 31B K9, Quang Trung, Phường Uông Bí, Quảng Ninh</span>
                </p>
                <p className="flex items-center gap-2.5 justify-center md:justify-start">
                  <span className="text-base text-rose-400 shrink-0">📞</span>
                  <span>
                    Hotline:{' '}
                    <a href="tel:0986197229" className="font-bold hover:text-[#2dd4bf] transition-colors">
                      0986 197 229
                    </a>
                    {' '}/{' '}
                    <a href="tel:0334141989" className="font-bold hover:text-[#2dd4bf] transition-colors">
                      0334 141 989
                    </a>
                  </span>
                </p>
                <p className="flex items-center gap-2.5 justify-center md:justify-start">
                  <span className="text-base text-slate-300 shrink-0">✉️</span>
                  <a href="mailto:nextgen.uongbi@gmail.com" className="hover:text-[#2dd4bf] transition-colors font-medium">
                    nextgen.uongbi@gmail.com
                  </a>
                </p>
                <p className="flex items-center gap-2.5 justify-center md:justify-start">
                  <span className="text-base text-sky-400 shrink-0">🌐</span>
                  <a
                    href="https://www.facebook.com/people/Trung-T%C3%A2m-Ngoa%CC%A3i-Ng%C6%B0%CC%83-Nextgen-U%C3%B4ng-Bi%CC%81/61575042515566/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#2dd4bf] transition-colors underline font-medium"
                  >
                    Fanpage Facebook
                  </a>
                </p>
              </div>
            </div>

            {/* Column 3: Slogan Card & Visit Counter */}
            <div className="md:col-span-3 lg:col-span-4 flex flex-col items-center md:items-start w-full">
              <h4 className="font-black text-[#2dd4bf] text-sm sm:text-base uppercase tracking-[0.25em] mb-4 w-full text-center md:text-left">
                SLOGAN
              </h4>
              <div className="w-full bg-[#184e47]/90 rounded-3xl p-5 sm:p-6 border border-teal-600/30 shadow-xl space-y-2">
                <p className="text-white font-serif font-bold text-base sm:text-lg italic leading-snug">
                  “Learn English, Lead the way”
                </p>
                <p className="text-[#2dd4bf] font-black text-xs sm:text-sm tracking-wider uppercase">
                  HỌC TIẾNG ANH . DẪN LỐI TƯƠNG LAI.
                </p>
              </div>
            </div>
          </div>

          {/* Bottom Copyright bar */}
          <div className="pt-6 border-t border-teal-800/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-teal-100/70">
            <p className="text-center sm:text-left">
              © 2026 Nextgen English. Một trường Anh ngữ chuyên nghiệp & hiện đại.
            </p>
            <div className="flex items-center gap-3">
              <span className="hover:text-white cursor-pointer transition-colors">Chính sách bảo mật</span>
              <span>|</span>
              <span className="hover:text-white cursor-pointer transition-colors">Điều khoản dịch vụ</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
