import React, { useState, useEffect, useRef } from 'react';
import {
  AdminNotificationItem,
  getAdminNotifications,
  markNotificationsAsRead,
  clearAdminNotifications,
  subscribeToSync
} from '../../services/assignmentService';

interface AdminNotificationBellProps {
  onSelectSubmission?: (submissionId: string) => void;
}

export const AdminNotificationBell: React.FC<AdminNotificationBellProps> = ({ onSelectSubmission }) => {
  const [notifications, setNotifications] = useState<AdminNotificationItem[]>(() => getAdminNotifications());
  const [isOpen, setIsOpen] = useState(false);
  const [activeToast, setActiveToast] = useState<AdminNotificationItem | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const toastTimeoutRef = useRef<any>(null);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const refreshList = () => {
    setNotifications(getAdminNotifications());
  };

  useEffect(() => {
    refreshList();
    const unsubscribe = subscribeToSync((event) => {
      if (event.type === 'new_admin_notification') {
        refreshList();
        if (event.data) {
          const item = event.data as AdminNotificationItem;
          setActiveToast(item);
          if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
          toastTimeoutRef.current = setTimeout(() => {
            setActiveToast(null);
          }, 7000);
        }
      } else if (event.type === 'admin_notifications_read' || event.type === 'submission_created') {
        refreshList();
      }
    });

    return () => {
      unsubscribe();
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleToggle = () => {
    if (!isOpen && unreadCount > 0) {
      markNotificationsAsRead();
    }
    setIsOpen(prev => !prev);
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearAdminNotifications();
    setNotifications([]);
  };

  const formatTimeAgo = (timestamp?: number, isoDate?: string) => {
    const time = timestamp || (isoDate ? new Date(isoDate).getTime() : 0);
    if (!time) return 'Vừa xong';
    const diff = Math.floor((Date.now() - time) / 1000);
    if (diff < 60) return 'Vừa xong';
    if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
    return new Date(time).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="relative font-sans" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={handleToggle}
        className="relative flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-all cursor-pointer border border-white/15"
        title="Thông báo bài nộp của học sinh"
      >
        <span className="text-lg">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-lg ring-2 ring-brand-700 animate-bounce">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Floating Toast Notification on new submission */}
      {activeToast && (
        <div className="fixed top-20 right-4 z-50 max-w-sm w-full bg-white rounded-2xl shadow-2xl border-2 border-emerald-400 p-4 animate-slide-in text-slate-800">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl animate-pulse">🎉</span>
              <div>
                <h4 className="font-black text-xs uppercase tracking-wider text-emerald-700">
                  Học Sinh Vừa Nộp Bài!
                </h4>
                <p className="text-xs text-slate-400">
                  {formatTimeAgo(activeToast.createdAt, activeToast.submittedAt)}
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveToast(null)}
              className="w-6 h-6 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 font-bold text-xs flex items-center justify-center"
            >
              ✕
            </button>
          </div>

          <div className="mt-2.5 pt-2 border-t border-slate-100 text-xs space-y-1">
            <p className="font-black text-slate-900 text-sm">
              {activeToast.studentName} {activeToast.studentClass ? `(${activeToast.studentClass})` : ''}
            </p>
            <p className="text-slate-600 truncate" title={activeToast.assignmentTitle}>
              📝 {activeToast.assignmentTitle}
            </p>
            <div className="flex items-center justify-between pt-1">
              <span className="font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                ⭐ {activeToast.score.toFixed(1)}/10 điểm ({activeToast.totalCorrect}/{activeToast.totalQuestions} câu đúng)
              </span>
              <button
                onClick={() => {
                  setActiveToast(null);
                  if (onSelectSubmission) onSelectSubmission(activeToast.submissionId);
                }}
                className="text-[11px] font-black text-brand-600 hover:text-brand-800 underline cursor-pointer"
              >
                Xem chi tiết →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border-2 border-brand-200 z-50 overflow-hidden animate-scale-up text-slate-800">
          {/* Header */}
          <div className="bg-gradient-to-r from-brand-700 to-emerald-700 p-3.5 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔔</span>
              <span className="font-black text-sm uppercase tracking-wide">
                Thông Báo Bài Nộp ({notifications.length})
              </span>
            </div>
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="text-[11px] font-bold text-brand-100 hover:text-white underline cursor-pointer"
              >
                Xóa tất cả
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-400 space-y-2">
                <span className="text-4xl block">📭</span>
                <p className="text-xs font-semibold">Chưa có thông báo bài nộp mới nào</p>
                <p className="text-[10px] text-slate-400">
                  Khi học sinh nộp bài, thông báo thời gian thực sẽ hiển thị tại đây!
                </p>
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    if (onSelectSubmission) onSelectSubmission(item.submissionId);
                    setIsOpen(false);
                  }}
                  className={`p-3 hover:bg-brand-50/70 transition-all cursor-pointer flex items-start gap-2.5 ${
                    !item.isRead ? 'bg-emerald-50/40 border-l-4 border-l-emerald-500' : ''
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-black text-sm shrink-0">
                    {item.score >= 8 ? '🌟' : item.score >= 5 ? '👍' : '📝'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="font-black text-xs text-slate-900 truncate">
                        {item.studentName} {item.studentClass ? `(${item.studentClass})` : ''}
                      </p>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {formatTimeAgo(item.createdAt, item.submittedAt)}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 truncate mt-0.5" title={item.assignmentTitle}>
                      {item.assignmentTitle}
                    </p>

                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                        {item.score.toFixed(1)}/10 điểm
                      </span>
                      <span className="text-[10px] text-slate-500 font-semibold">
                        Đúng {item.totalCorrect}/{item.totalQuestions} câu
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
