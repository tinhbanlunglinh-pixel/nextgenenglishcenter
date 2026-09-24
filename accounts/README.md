# 🔐 Hướng dẫn Quản lý Tài khoản & Mật khẩu (User & Password) - Nextgen English

Thư mục này chứa danh sách các tài khoản đăng nhập của **Giáo viên** và **Học sinh**.

---

## 📍 File cấu hình chính:
👉 **[`accounts/credentials.ts`](./credentials.ts)**

---

## 🔑 Tài khoản mặc định sẵn có:

### 1. Tài khoản Giáo viên (Teacher)
- **Tên đăng nhập (Username)**: `Nextgen`
- **Mật khẩu (Password)**: `88889999`
- **Quyền hạn**: Soạn bài tập AI, quản lý danh sách học sinh theo lớp, tổng hợp kết quả và xem Bảng Vàng vinh danh.

### 2. Tài khoản Học sinh (Student)
- **Tên đăng nhập (Username)**: `hocsinh`
- **Mật khẩu (Password)**: `123`
- Học sinh chỉ cần chọn đúng Tên và Lớp học của mình để vào làm bài nhanh chóng mà không bắt buộc nhớ mật khẩu phức tạp.

---

## 🛠️ Cách thay đổi hoặc thêm tài khoản mới:

1. Mở file `accounts/credentials.ts`.
2. Tìm đến mục tài khoản bạn muốn sửa:
   - Thay đổi `username`: Tên đăng nhập mới.
   - Thay đổi `password`: Mật khẩu mới.
   - Thay đổi `name`: Tên hiển thị của thầy/cô giáo hoặc học sinh.
3. Để **thêm tài khoản mới**, bạn chỉ cần copy 1 khối tài khoản và dán tiếp vào danh sách:
   ```typescript
   {
     id: 'student_custom',
     username: 'hocsinh1',
     password: '123',
     role: 'student',
     name: 'Nguyễn Văn A',
     avatar: '🎒',
     className: 'Lớp 6A'
   },
   ```
4. Nhấn **Ctrl + S** để lưu lại file. Tải lại trang web là tài khoản mới sẽ có hiệu lực ngay lập tức!
