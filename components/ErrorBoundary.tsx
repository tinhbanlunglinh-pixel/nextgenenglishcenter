import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  isInline?: boolean;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('CRITICAL REACT ERROR CAUGHT BY ERROR_BOUNDARY:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    if (this.props.onReset) {
      try {
        this.props.onReset();
      } catch (e) {
        console.error('Error in onReset callback:', e);
      }
      this.setState({ hasError: false, error: null, errorInfo: null });
      return;
    }

    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  private handleCopyError = () => {
    try {
      const err = this.state.error;
      const info = this.state.errorInfo;
      const text = `=== NEXTGEN ENGLISH DIAGNOSTIC REPORT ===\nTime: ${new Date().toISOString()}\nError Name: ${err?.name || 'Error'}\nError Message: ${err?.message || 'Unknown'}\nStack Trace:\n${err?.stack || 'No stack'}\nComponent Stack:\n${info?.componentStack || 'No component stack'}`;
      navigator.clipboard.writeText(text);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 3000);
    } catch {
      alert('Không thể tự động sao chép mã lỗi vào bộ nhớ tạm.');
    }
  };

  private handleSafeRecovery = () => {
    try {
      // 1. Clear ephemeral cache/session that might contain corrupted pointers
      sessionStorage.clear();
      localStorage.removeItem('nextgen_active_class_name');
      localStorage.removeItem('nextgen_active_student_name');
      localStorage.removeItem('nextgen_selected_class');
      localStorage.removeItem('nextgen_selected_student');
      localStorage.removeItem('nextgen_tts_audio_cache');

      // 2. Protect and ensure critical data structures are valid JSON
      const sanitizeKey = (key: string, defaultVal: string) => {
        try {
          const val = localStorage.getItem(key);
          if (val) JSON.parse(val);
        } catch {
          localStorage.setItem(key, defaultVal);
        }
      };
      sanitizeKey('nextgen_classes', '[]');
      sanitizeKey('nextgen_students', '[]');
      sanitizeKey('nextgen_assignments', '[]');
      sanitizeKey('nextgen_submissions', '[]');
      sanitizeKey('nextgen_deleted_classes', '[]');
      sanitizeKey('nextgen_deleted_assignments', '[]');
      sanitizeKey('nextgen_deleted_students', '[]');
    } catch (e) {
      console.warn('Safe recovery clean status:', e);
    }
    // Safely reload to base application URL
    window.location.href = window.location.pathname;
  };

  public render() {
    if (this.state.hasError) {
      // INLINE TAB / WIDGET ERROR VIEW (keeps outer navbar, headers, and other tabs fully intact!)
      if (this.props.isInline) {
        return (
          <div className="p-6 my-4 bg-white rounded-3xl border-2 border-amber-300 shadow-xl space-y-4 animate-fade-in font-sans">
            <div className="flex items-start gap-3.5">
              <span className="text-3xl p-2 bg-amber-100 rounded-2xl shrink-0">⚠️</span>
              <div className="space-y-1 flex-1">
                <h3 className="text-lg font-black text-slate-900">
                  {this.props.fallbackTitle || 'Sự Cố Hiển Thị Trong Tab Này'}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600">
                  {this.props.fallbackMessage || 'Hệ thống gặp sự cố tạm thời khi vẽ giao diện mục này. Dữ liệu học sinh và bài tập vẫn an toàn, thầy cô có thể chuyển sang các tab khác bình thường.'}
                </p>
                {this.state.error && (
                  <div className="mt-2 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-mono text-xs break-all">
                    <b>Lỗi:</b> {this.state.error.name}: {this.state.error.message}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>🔄</span> Thử Lại Tab Này
              </button>
              <button
                type="button"
                onClick={this.handleCopyError}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>📋</span> {this.state.copied ? '✓ Đã Sao Chép Mã Lỗi!' : 'Sao Chép Chi Tiết Lỗi'}
              </button>
              <button
                type="button"
                onClick={this.handleSafeRecovery}
                className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 border border-amber-200 cursor-pointer ml-auto"
                title="Khôi phục an toàn bộ nhớ tạm mà không làm mất bài nộp, học sinh hay tài khoản"
              >
                <span>🧹</span> Khôi Phục An Toàn
              </button>
            </div>
          </div>
        );
      }

      // FULL PAGE SCREEN ERROR VIEW
      return (
        <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-amber-50 flex items-center justify-center p-4 font-sans text-slate-800">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-emerald-100 p-6 sm:p-8 text-center space-y-5 animate-fade-in">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-amber-100 text-amber-600 rounded-3xl mx-auto flex items-center justify-center text-3xl sm:text-4xl shadow-inner">
              ⚠️
            </div>

            <div className="space-y-2">
              <h2 className="text-xl sm:text-2xl font-black text-slate-800">
                {this.props.fallbackTitle || 'Đã Xảy Ra Sự Cố Hiển Thị'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {this.props.fallbackMessage || 'Hệ thống gặp sự cố tạm thời khi tải giao diện bài học. Đừng lo lắng, bài tập và kết quả của các con đã được bảo vệ trên hệ thống.'}
              </p>
            </div>

            {/* Prominent Error Notice */}
            {this.state.error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-left text-xs text-rose-800 space-y-1 font-mono break-all">
                <p className="font-bold flex items-center gap-1">
                  <span>🚨</span> <span>Chi tiết lỗi:</span>
                </p>
                <p className="text-[11px] text-rose-700">
                  {this.state.error.name}: {this.state.error.message}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2.5 pt-1">
              <button
                onClick={this.handleReset}
                className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl font-black text-sm shadow-md hover:from-emerald-700 hover:to-teal-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>🔄</span>
                <span>Tải Lại Ứng Dụng</span>
              </button>

              <button
                onClick={this.handleCopyError}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>📋</span>
                <span>{this.state.copied ? '✓ Đã Sao Chép Chi Tiết Lỗi!' : 'Sao Chép Chi Tiết Lỗi (Gửi Hỗ Trợ)'}</span>
              </button>

              <button
                onClick={this.handleSafeRecovery}
                className="w-full py-2.5 px-4 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-2xl font-bold text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer"
                title="Khôi phục trạng thái an toàn, làm sạch bộ nhớ đệm tạm thời (bảo toàn 100% tài khoản, bài nộp, lớp học)"
              >
                <span>🧹</span>
                <span>Khôi Phục Dữ Liệu An Toàn & Khởi Động Lại</span>
              </button>
            </div>

            {/* Error detail accordion for diagnostics */}
            {this.state.error && (
              <details className="text-left pt-2 border-t border-slate-100">
                <summary className="text-[11px] font-semibold text-slate-400 cursor-pointer hover:text-slate-600 select-none">
                  Chi tiết kỹ thuật (dành cho quản trị)
                </summary>
                <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-[10px] text-red-600 font-mono overflow-auto max-h-36">
                  <p className="font-bold">{this.state.error.name}: {this.state.error.message}</p>
                  {this.state.error.stack && (
                    <pre className="mt-1 text-slate-500 whitespace-pre-wrap">{this.state.error.stack}</pre>
                  )}
                  {this.state.errorInfo?.componentStack && (
                    <pre className="mt-1 text-slate-400 whitespace-pre-wrap">{this.state.errorInfo.componentStack}</pre>
                  )}
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
