import { UserRole } from '../types';

export interface AccountCredential {
  id: string;
  username: string;       // Tên đăng nhập
  password: string;       // Mật khẩu (Bạn có thể đổi mật khẩu tại đây)
  role: UserRole;         // 'teacher' (Giáo viên) hoặc 'student' (Học sinh)
  name: string;           // Tên hiển thị của người dùng
  avatar?: string;        // Biểu tượng icon đại diện
  classId?: string;       // Mã lớp (chỉ dành cho học sinh, tùy chọn)
  className?: string;     // Tên lớp (chỉ dành cho học sinh, tùy chọn)
}

/**
 * ════════════════════════════════════════════════════════════════════════════════
 * 📁 THƯ MỤC TÙY CHỈNH TÀI KHOẢN VÀ MẬT KHẨU (USER & PASSWORD)
 * ════════════════════════════════════════════════════════════════════════════════
 * Bạn có thể tự do chỉnh sửa, đổi tên đăng nhập, đổi mật khẩu hoặc thêm tài khoản
 * mới trực tiếp tại danh sách dưới đây. 
 *
 * ⚠️ LƯU Ý: Sau khi chỉnh sửa, lưu file và tải lại trang ứng dụng để áp dụng.
 */

export const INITIAL_ACCOUNTS: AccountCredential[] = [
  // ─────────────────────────────────────────────────────────────────────────────
  // 👩‍🏫 1. TÀI KHOẢN GIÁO VIÊN (TEACHER)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'teacher_nextgen',
    username: 'Nextgen',      // 👈 Tên đăng nhập Giáo viên
    password: '88889999',     // 👈 Mật khẩu Giáo viên
    role: 'teacher',
    name: 'Giáo viên Nextgen (Nextgen English)',
    avatar: '👨‍🏫'
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 🎒 2. TÀI KHOẢN HỌC SINH (STUDENT)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'student_chung',
    username: 'hocsinh',       // 👈 Tên đăng nhập chung cho Học sinh
    password: '123',           // 👈 Mật khẩu Học sinh (Bạn có thể đổi tùy ý)
    role: 'student',
    name: 'Học Sinh',
    avatar: '🎒'
  }
];
