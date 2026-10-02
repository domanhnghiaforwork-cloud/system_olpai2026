'use client';

import React from 'react';
import { Lock, LogIn } from 'lucide-react';

interface AccessDeniedProps {
  currentTab?: string;
  onNavigateHome: () => void;
  onGoToLogin?: () => void;
  onNavigateLeaderboard?: () => void;
  isAdminOnly?: boolean;
}

export const AccessDenied: React.FC<AccessDeniedProps> = ({
  onNavigateHome,
  onGoToLogin,
}) => {
  const handleLoginClick = () => {
    if (onGoToLogin) {
      onGoToLogin();
    } else {
      onNavigateHome();
      setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>('input[autoComplete="username"]');
        if (input) {
          input.focus();
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
    }
  };

  return (
    <div className="min-h-[50vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200/90 shadow-xl p-8 sm:p-10 text-center">
        
        {/* Lock Icon */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-5 border border-red-100 shadow-xs">
          <Lock className="w-8 h-8 stroke-[2.2]" />
        </div>

        {/* Heading */}
        <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-2.5">
          Bạn không có quyền truy cập
        </h2>

        {/* Subtitle */}
        <p className="text-sm text-slate-600 font-medium mb-8 leading-relaxed">
          Vui lòng đăng nhập tài khoản để xem nội dung trang này.
        </p>

        {/* Button: Đăng nhập ngay */}
        <button
          onClick={handleLoginClick}
          className="w-full py-3 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
        >
          <LogIn className="w-4 h-4" />
          <span>Đăng nhập ngay</span>
        </button>

      </div>
    </div>
  );
};
