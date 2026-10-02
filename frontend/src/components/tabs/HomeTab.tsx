'use client';

import React, { useState } from 'react';
import { 
  Trophy, 
  ArrowRight, 
  User as UserIcon, 
  Lock, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Sparkles
} from 'lucide-react';
import { Problem, User } from '@/types';
import { loginUser } from '@/lib/api';

interface HomeTabProps {
  onNavigate: (tab: string) => void;
  problems: Problem[];
  currentUser: User | null;
  onLoginSuccess: (user: User) => void;
  onLogout: () => void;
}

export const HomeTab: React.FC<HomeTabProps> = ({ 
  onNavigate, 
  problems,
  currentUser,
  onLoginSuccess,
  onLogout
}) => {
  // Form states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMsg('Vui lòng điền tài khoản và mật khẩu.');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const user = await loginUser(username.trim(), password);
      // setSuccessMsg(`Chào mừng ${user.full_name}!`);
      onLoginSuccess(user);
    } catch (err: any) {
      setErrorMsg(err.message || 'Tài khoản hoặc mật khẩu không chính xác.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 border border-blue-900/40 text-white p-6 sm:p-10 lg:p-12 shadow-2xl">
        {/* Glow ambient background effects */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-red-600/20 rounded-full blur-3xl pointer-events-none" />

        {currentUser ? (
          /* ĐÃ ĐĂNG NHẬP: Bỏ "Xin chào,...", giữ nguyên vị trí badge ở góc trái, nội dung dịch ra giữa */
          <div className="relative z-10">
            {/* Vị trí badge giữ nguyên ở góc trái */}
            <div>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-400/30 text-blue-300 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                <span>Học viện Kỹ thuật Mật mã • KMA AI 2026</span>
              </div>
            </div>

            {/* Phần nội dung dịch ra giữa */}
            <div className="mt-6 sm:mt-8 flex flex-col items-center text-center space-y-6 max-w-3xl mx-auto">
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-[46px] xl:text-5xl font-black tracking-tight text-white leading-tight">
                Olympic Trí Tuệ Nhân Tạo <br />
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-sky-300 to-red-400">
                  OLP AI KMA 2026
                </span>
              </h1>

              <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl mx-auto">
                Hệ thống thi Olympic Trí tuệ Nhân tạo cấp Học viện Kỹ thuật Mật mã năm 2026. Sân chơi học thuật uy tín dành cho sinh viên đam mê nghiên cứu Machine Learning, Deep Learning, An toàn thông tin và Khoa học dữ liệu.
              </p>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-wrap items-center justify-center gap-3.5">
                <button
                  onClick={() => onNavigate('problems')}
                  className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 flex items-center gap-2 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <span>Khám phá đề bài</span>
                </button>

                <button
                  onClick={() => onNavigate('leaderboard')}
                  className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-sm border border-white/20 flex items-center gap-2 backdrop-blur-xs transition-all hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <span>Xem Bảng xếp hạng</span>
                </button>

                <button
                  onClick={() => onNavigate('submit')}
                  className="px-5 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm shadow-lg shadow-red-600/30 flex items-center gap-2 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <span>Cổng Nộp bài</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* CHƯA ĐĂNG NHẬP: Grid 2 cột: Left Hero Info & Actions, Right Form đăng nhập */
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
            
            {/* Left Column: Hero Information & Actions */}
            <div className="lg:col-span-7 xl:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-400/30 text-blue-300 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                <span>Học viện Kỹ thuật Mật mã • KMA AI 2026</span>
              </div>

              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-[46px] xl:text-5xl font-black tracking-tight text-white leading-tight">
                Olympic Trí Tuệ Nhân Tạo <br />
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-sky-300 to-red-400">
                  OLP AI KMA 2026
                </span>
              </h1>

              <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl">
                Hệ thống thi Olympic Trí tuệ Nhân tạo cấp Học viện Kỹ thuật Mật mã năm 2026. Sân chơi học thuật uy tín dành cho sinh viên đam mê nghiên cứu Machine Learning, Deep Learning, An toàn thông tin và Khoa học dữ liệu.
              </p>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-wrap items-center gap-3.5">
                <button
                  onClick={() => onNavigate('problems')}
                  className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 flex items-center gap-2 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <span>Khám phá đề bài</span>
                </button>

                <button
                  onClick={() => onNavigate('leaderboard')}
                  className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-sm border border-white/20 flex items-center gap-2 backdrop-blur-xs transition-all hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <span>Xem Bảng xếp hạng</span>
                </button>

                <button
                  onClick={() => onNavigate('submit')}
                  className="px-5 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm shadow-lg shadow-red-600/30 flex items-center gap-2 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <span>Cổng Nộp bài</span>
                </button>
              </div>

              {/* Quick Feature Badges */}
              <div className="pt-4 flex flex-wrap items-center gap-4 text-xs text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Chấm điểm tự động real-time</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span>Leaderboard Public & Private</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  <span>Bảo mật chống rò rỉ Ground-Truth</span>
                </div>
              </div>
            </div>

            {/* Right Column: Login Form */}
            <div className="lg:col-span-5 xl:col-span-5 w-full">
              <div className="relative rounded-2xl bg-white text-slate-900 p-6 sm:p-7 shadow-2xl border border-slate-100 overflow-hidden">

                {/* Success Notification */}
                {successMsg && (
                  <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-medium">{successMsg}</span>
                  </div>
                )}

                {/* Error Notification */}
                {errorMsg && (
                  <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span className="font-medium">{errorMsg}</span>
                  </div>
                )}

                {/* Form fields */}
                <form onSubmit={handleFormSubmit} className="space-y-4">
                  {/* Tài khoản */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Tài khoản
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <UserIcon className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Tên đăng nhập hoặc email..."
                        autoComplete="username"
                        required
                        className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all"
                      />
                    </div>
                  </div>

                  {/* Mật khẩu */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Mật khẩu
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Nhập mật khẩu..."
                        autoComplete="current-password"
                        required
                        className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                        tabIndex={-1}
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Remember Me */}
                  <div className="flex items-center justify-between pt-0.5">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-xs text-slate-600">
                        Ghi nhớ đăng nhập
                      </span>
                    </label>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full mt-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Đang đăng nhập...</span>
                      </>
                    ) : (
                      <>
                        <span>Đăng nhập</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

          </div>
        )}
      </section>
    </div>
  );
};
