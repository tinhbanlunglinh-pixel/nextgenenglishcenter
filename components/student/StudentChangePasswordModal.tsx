import React, { useState, useEffect } from 'react';
import { getClasses, getStudents } from '../../services/assignmentService';
import { verifyStudentPhoneAndResetPassword } from '../../services/authService';
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
  const [phone, setPhone] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
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
      setPhone('');
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
    const cleanPhone = phone.trim();
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
    if (!cleanPhone) {
      setErrorMsg('Vui lòng nhập số điện thoại phụ huynh để xác minh!');
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
      const result = verifyStudentPhoneAndResetPassword(
        selectedClass,
        cleanName,
        cleanPhone,
        cleanNewPass
      );

      if (!result.success) {
        setErrorMsg(result.error || 'Xác minh thất bại. Vui lòng kiểm tra lại!');
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
      }, 1600);
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
                Xác minh bằng số điện thoại phụ huynh
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
              <b>Mật khẩu ban đầu mặc định là 123.</b>
              <div className="text-[11px] text-amber-800 mt-0.5">
                Để đổi mật khẩu riêng, con/phụ huynh vui lòng nhập chính xác <b>Số điện thoại</b> đã đăng ký với Trung tâm Ngoại Ngữ Nextgen để hệ thống xác thực.
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
            <div className="mb-4 p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs text-emerald-800 font-bold flex items-start gap-2">
              <span className="text-base shrink-0">✅</span>
              <span className="leading-relaxed">{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Class selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                1. Lớp học của con
              </label>
              <select
                value={selectedClass}
                onChange={e => {
                  setSelectedClass(e.target.value);
                  setErrorMsg('');
                }}
                disabled={isSubmitting || !!initialClassName}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-xs font-bold bg-white text-slate-800 cursor-pointer disabled:bg-slate-100 disabled:text-slate-600"
              >
                {classes.map(c => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Student Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                2. Họ và tên của con
              </label>
              <input
                type="text"
                required
                value={studentName}
                onChange={e => {
                  setStudentName(e.target.value);
                  setErrorMsg('');
                }}
                disabled={isSubmitting || !!initialStudentName}
                placeholder="Ví dụ: Nguyễn Minh Anh"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-xs font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-600"
              />

              {/* Quick suggestions if not locked */}
              {!initialStudentName && classStudents.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                  {classStudents.slice(0, 6).map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setStudentName(s.name);
                        setErrorMsg('');
                      }}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-medium border transition-all ${
                        studentName === s.name
                          ? 'bg-emerald-500 text-white border-emerald-600'
                          : 'bg-slate-50 hover:bg-emerald-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Phone Verification */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span>3. Số điện thoại phụ huynh (Xác thực)</span>
                <span className="text-[10px] text-slate-400 font-normal">Đã đăng ký với Nextgen English</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-xs pointer-events-none">
                  📞
                </span>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={e => {
                    setPhone(e.target.value);
                    setErrorMsg('');
                  }}
                  disabled={isSubmitting}
                  placeholder="Ví dụ: 0912345678"
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-xs font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400"
                  autoComplete="tel"
                />
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                4. Mật khẩu mới
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-xs pointer-events-none">
                  🔒
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={e => {
                    setNewPassword(e.target.value);
                    setErrorMsg('');
                  }}
                  disabled={isSubmitting}
                  placeholder="Nhập mật khẩu mới (tối thiểu 3 ký tự)..."
                  className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-xs font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                5. Nhập lại mật khẩu mới
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-xs pointer-events-none">
                  🔑
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={e => {
                    setConfirmPassword(e.target.value);
                    setErrorMsg('');
                  }}
                  disabled={isSubmitting}
                  placeholder="Nhập lại mật khẩu mới để xác nhận..."
                  className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-xs font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs transition-all cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span>Đang xác minh...</span>
                ) : (
                  <>
                    <span>✨ Lưu Mật Khẩu Mới</span>
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
