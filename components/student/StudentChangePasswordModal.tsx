import React, { useState, useEffect } from 'react';
import { getClasses, getStudents } from '../../services/assignmentService';
import { changeStudentPasswordWithOldPassword } from '../../services/authService';
import { ClassRoom, Student } from '../../types';

interface StudentChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialClassName?: string;
  initialStudentName?: string;
  onSuccess?: (newPassword: string) => void;
}

export const StudentChangePasswordModal: React.FC<StudentChangePasswordModalProps> = ({
  isOpen,
  onClose,
  initialClassName = '',
  initialStudentName = '',
  onSuccess,
}) => {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>(initialClassName);
  const [studentName, setStudentName] = useState<string>(initialStudentName);
  const [classStudents, setClassStudents] = useState<Student[]>([]);
  const [oldPassword, setOldPassword] = useState<string>('123');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showOldPassword, setShowOldPassword] = useState<boolean>(false);
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Sync initial props when opened
  useEffect(() => {
    if (isOpen) {
      const cls = getClasses();
      setClasses(cls);

      const targetClass = initialClassName || (cls.length > 0 ? cls[0].name : '');
      setSelectedClass(targetClass);
      setStudentName(initialStudentName);
      setOldPassword('123'); // Pre-fill default 123 so student doesn't even need to type it if not changed!
      setNewPassword('');
      setConfirmPassword('');
      setErrorMsg('');
      setSuccessMsg('');
      setIsSubmitting(false);
    }
  }, [isOpen, initialClassName, initialStudentName]);

  // Load students of selected class
  useEffect(() => {
    if (!selectedClass) {
      setClassStudents([]);
      return;
    }
    const norm = (str?: string) => (str || '').toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();
    const clsObj = classes.find(c => c.name === selectedClass || norm(c.name) === norm(selectedClass));
    if (clsObj) {
      setClassStudents(getStudents(clsObj.id));
    } else {
      setClassStudents(getStudents(selectedClass));
    }
  }, [selectedClass, classes]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanName = studentName.trim();
    const cleanOldPass = oldPassword.trim();
    const cleanNewPass = newPassword.trim();
    const cleanConfirmPass = confirmPassword.trim();

    if (!selectedClass) {
      setErrorMsg('Vui lòng chọn lớp học của con!');
      return;
    }
    if (!cleanName) {
      setErrorMsg('Vui lòng nhập hoặc chọn họ và tên của con!');
      return;
    }
    if (!cleanOldPass) {
      setErrorMsg('Vui lòng nhập mật khẩu cũ (mật khẩu mặc định là 123)!');
      return;
    }
    if (!cleanNewPass) {
      setErrorMsg('Vui lòng nhập mật khẩu mới!');
      return;
    }
    if (cleanNewPass.length < 3) {
      setErrorMsg('Mật khẩu mới phải có ít nhất 3 ký tự!');
      return;
    }
    if (cleanNewPass !== cleanConfirmPass) {
      setErrorMsg('Mật khẩu xác nhận không trùng khớp với mật khẩu mới!');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = changeStudentPasswordWithOldPassword(
        selectedClass,
        cleanName,
        cleanOldPass,
        cleanNewPass
      );

      if (!result.success) {
        setErrorMsg(result.error || 'Đổi mật khẩu thất bại. Vui lòng kiểm tra lại!');
        setIsSubmitting(false);
        return;
      }

      setSuccessMsg(result.message || '🎉 Đổi mật khẩu thành công!');
      if (onSuccess) {
        onSuccess(cleanNewPass);
      }

      // Automatically close modal after brief delay so user can read message
      setTimeout(() => {
        setIsSubmitting(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Có lỗi xảy ra, vui lòng thử lại sau!');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in font-sans">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200 animate-scale-up relative max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white p-5 relative shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white font-black text-sm flex items-center justify-center transition-all cursor-pointer"
            title="Đóng"
          >
            ✕
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-2xl border border-white/30">
              🔑
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight leading-tight">
                Đổi Mật Khẩu Học Sinh
              </h3>
              <p className="text-xs text-emerald-100 font-medium mt-0.5">
                Chỉ cần nhập mật khẩu cũ & mật khẩu mới
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1">
          {/* Note */}
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 leading-relaxed flex items-start gap-2.5">
            <span className="text-base shrink-0">💡</span>
            <div>
              <b>Mật khẩu mặc định ban đầu là 123.</b>
              <div className="text-[11px] text-amber-800 mt-0.5">
                Nếu con chưa từng đổi mật khẩu thì mật khẩu cũ là <b>123</b>. Con chỉ cần nhập mật khẩu mới và xác nhận là xong!
              </div>
            </div>
          </div>

          {/* Feedback Messages */}
          {errorMsg && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 font-medium flex items-start gap-2 animate-shake">
              <span className="text-base shrink-0">⚠️</span>
              <span className="leading-relaxed">{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 font-bold flex items-start gap-2 animate-fade-in">
              <span className="text-base shrink-0">✅</span>
              <span className="leading-relaxed">{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5" autoComplete="off">
            {/* 1. Lớp học */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                1. Lớp Học Của Con
              </label>
              <select
                value={selectedClass}
                onChange={e => {
                  setSelectedClass(e.target.value);
                  setStudentName('');
                  setErrorMsg('');
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-sm font-bold bg-white text-slate-800 cursor-pointer"
              >
                {classes.length === 0 ? (
                  <option value="">-- Chưa có lớp --</option>
                ) : (
                  classes.map(c => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* 2. Họ và tên học sinh */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                2. Họ và Tên Của Con
              </label>

              {classStudents.length > 0 && (
                <div className="mb-2">
                  <select
                    value={classStudents.some(s => s.name === studentName) ? studentName : ''}
                    onChange={e => {
                      setStudentName(e.target.value);
                      setErrorMsg('');
                    }}
                    className="w-full px-3.5 py-2 rounded-xl border border-emerald-300 bg-emerald-50/50 focus:border-emerald-500 outline-none text-xs font-bold text-emerald-950 cursor-pointer"
                  >
                    <option value="">-- Chọn tên con trong danh sách ({classStudents.length} bạn) --</option>
                    {classStudents.map(s => (
                      <option key={s.id} value={s.name}>
                        {s.avatar || '👤'} {s.name} {s.englishName ? `(${s.englishName})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <input
                type="text"
                required
                value={studentName}
                onChange={e => setStudentName(e.target.value)}
                placeholder="Hoặc tự gõ họ và tên của con..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-sm font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400"
              />
            </div>

            {/* 3. Mật khẩu cũ (hiện tại) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">
                  3. Mật Khẩu Hiện Tại (Mật khẩu cũ)
                </label>
                <button
                  type="button"
                  onClick={() => setOldPassword('123')}
                  className="text-[11px] text-emerald-700 hover:text-emerald-900 font-bold underline cursor-pointer"
                >
                  Điền mặc định (123)
                </button>
              </div>
              <div className="relative">
                <input
                  type={showOldPassword ? 'text' : 'password'}
                  required
                  value={oldPassword}
                  onChange={e => setOldPassword(e.target.value)}
                  placeholder="Nhập mật khẩu hiện tại (mặc định: 123)..."
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-sm font-mono font-bold text-slate-800"
                />
                <button
                  type="button"
                  onClick={() => setShowOldPassword(!showOldPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 text-xs font-bold"
                  tabIndex={-1}
                >
                  {showOldPassword ? 'Ẩn' : 'Hiện'}
                </button>
              </div>
            </div>

            {/* 4. Mật khẩu mới */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                4. Mật Khẩu Mới
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Nhập mật khẩu mới (tối thiểu 3 ký tự)..."
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-sm font-mono font-bold text-slate-800"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 text-xs font-bold"
                  tabIndex={-1}
                >
                  {showNewPassword ? 'Ẩn' : 'Hiện'}
                </button>
              </div>
            </div>

            {/* 5. Nhập lại mật khẩu mới */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                5. Xác Nhận Mật Khẩu Mới
              </label>
              <input
                type={showNewPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu mới..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-sm font-mono font-bold text-slate-800"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-lg shadow-emerald-500/20 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Đang cập nhật...</span>
                  </>
                ) : (
                  <>
                    <span>💾</span>
                    <span>LƯU MẬT KHẨU MỚI</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default StudentChangePasswordModal;
