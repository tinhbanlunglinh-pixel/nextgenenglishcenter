import React, { useState, useEffect } from 'react';
import { getClasses } from '../../services/assignmentService';
import { createStudentAccount } from '../../services/authService';
import { ClassRoom, AuthUser } from '../../types';

interface StudentRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialClassName?: string;
  onRegisterSuccess: (user: AuthUser) => void;
}

export const StudentRegisterModal: React.FC<StudentRegisterModalProps> = ({
  isOpen,
  onClose,
  initialClassName = '',
  onRegisterSuccess
}) => {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>(initialClassName);
  const [customClassName, setCustomClassName] = useState<string>('');
  const [studentName, setStudentName] = useState<string>('');
  const [englishName, setEnglishName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [password, setPassword] = useState<string>('123');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      const cls = getClasses();
      setClasses(cls);
      setSelectedClass(initialClassName || (cls.length > 0 ? cls[0].name : ''));
      setCustomClassName('');
      setStudentName('');
      setEnglishName('');
      setPhone('');
      setPassword('123');
      setErrorMsg('');
      setIsSubmitting(false);
    }
  }, [isOpen, initialClassName]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const activeClassName = selectedClass === '__NEW__' ? customClassName.trim() : selectedClass.trim();
    const cleanName = studentName.trim();
    const cleanPass = password.trim() || '123';

    if (!activeClassName) {
      setErrorMsg('Con ơi, vui lòng chọn hoặc nhập tên lớp học của mình nhé!');
      return;
    }
    if (!cleanName) {
      setErrorMsg('Con ơi, vui lòng nhập họ và tên của mình nhé!');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = createStudentAccount({
        name: cleanName,
        className: activeClassName,
        englishName: englishName.trim(),
        phone: phone.trim(),
        password: cleanPass
      });

      if (!result.success || !result.user) {
        setErrorMsg(result.error || 'Không thể tạo tài khoản. Vui lòng thử lại!');
        setIsSubmitting(false);
        return;
      }

      onRegisterSuccess(result.user);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Có lỗi xảy ra, vui lòng thử lại!');
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
              ✨
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight leading-tight">
                Tạo Tài Khoản Học Sinh Mới
              </h3>
              <p className="text-xs text-emerald-100 font-medium mt-0.5">
                Mật khẩu mặc định ban đầu là 123
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1">
          {/* Information badge */}
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 leading-relaxed flex items-start gap-2.5">
            <span className="text-base shrink-0">🎒</span>
            <div>
              <b>Chưa có tên trong danh sách lớp?</b>
              <div className="text-[11px] text-emerald-800 mt-0.5">
                Con chỉ cần nhập <b>Lớp</b> và <b>Họ tên</b> là hệ thống sẽ tạo tài khoản ngay với mật khẩu mặc định là <b>123</b>. Sau đó con có thể tự đổi mật khẩu bất kỳ lúc nào!
              </div>
            </div>
          </div>

          {/* Feedback message */}
          {errorMsg && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 font-medium flex items-start gap-2 animate-shake">
              <span className="text-base shrink-0">⚠️</span>
              <span className="leading-relaxed">{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5" autoComplete="off">
            {/* 1. Chọn Lớp */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                1. Chọn Lớp Học Của Con *
              </label>
              <select
                value={selectedClass}
                onChange={e => {
                  setSelectedClass(e.target.value);
                  setErrorMsg('');
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-sm font-bold bg-white text-slate-800 cursor-pointer"
              >
                {classes.map(c => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
                <option value="__NEW__">➕ Nhập tên lớp mới khác...</option>
              </select>

              {/* If user selected custom class */}
              {selectedClass === '__NEW__' && (
                <input
                  type="text"
                  required
                  value={customClassName}
                  onChange={e => setCustomClassName(e.target.value)}
                  placeholder="Nhập tên lớp học (VD: Lớp 6A1, Lớp 7B...)"
                  className="w-full mt-2 px-3.5 py-2 rounded-xl border border-emerald-300 focus:border-emerald-500 outline-none text-sm font-bold"
                  autoFocus
                />
              )}
            </div>

            {/* 2. Họ và Tên */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                2. Họ và Tên Học Sinh *
              </label>
              <input
                type="text"
                required
                value={studentName}
                onChange={e => setStudentName(e.target.value)}
                placeholder="VD: Hoàng Sơn Tùng"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-sm font-bold text-slate-900"
              />
            </div>

            {/* 3. Tên tiếng Anh (Tùy chọn) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                3. Tên Tiếng Anh / E.NAME (Tùy chọn)
              </label>
              <input
                type="text"
                value={englishName}
                onChange={e => setEnglishName(e.target.value)}
                placeholder="VD: Arty, Kelvin, Batman, Elsa..."
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:border-emerald-500 outline-none text-sm"
              />
            </div>

            {/* 4. Số điện thoại phụ huynh (Tùy chọn) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                4. Số Điện Thoại Phụ Huynh (Tùy chọn)
              </label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="VD: 0987654321"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:border-emerald-500 outline-none text-sm font-mono"
              />
            </div>

            {/* 5. Mật khẩu mặc định */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">
                  5. Mật Khẩu Đăng Nhập
                </label>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                  Mặc định: 123
                </span>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="123"
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-sm font-mono font-bold text-slate-800"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 text-xs font-bold"
                  tabIndex={-1}
                >
                  {showPassword ? 'Ẩn' : 'Hiện'}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 italic">
                * Con có thể để nguyên mật khẩu là <b>123</b> hoặc tự đặt mật khẩu riêng.
              </p>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-xl shadow-emerald-500/20 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Đang khởi tạo tài khoản...</span>
                  </>
                ) : (
                  <>
                    <span>🚀</span>
                    <span>TẠO TÀI KHOẢN & VÀO LÀM BÀI NGAY</span>
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

export default StudentRegisterModal;
