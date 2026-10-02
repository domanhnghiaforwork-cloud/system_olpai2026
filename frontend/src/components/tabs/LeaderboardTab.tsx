'use client';

import React, { useState } from 'react';
import { LeaderboardItem, Problem, User } from '@/types';
import { 
  Trophy, 
  RefreshCw, 
  Flame, 
  Globe, 
  Lock, 
  ShieldCheck, 
  AlertCircle,
  Eye,
  Info
} from 'lucide-react';

interface LeaderboardTabProps {
  problems: Problem[];
  leaderboard: LeaderboardItem[];
  selectedProblemCode: string;
  onSelectProblemCode: (code: string) => void;
  currentUser: User | null;
  leaderboardType: 'public' | 'private';
  onChangeLeaderboardType: (type: 'public' | 'private') => void;
  onRefresh: () => void;
  isLoading: boolean;
}

export const LeaderboardTab: React.FC<LeaderboardTabProps> = ({
  problems,
  leaderboard,
  selectedProblemCode,
  onSelectProblemCode,
  currentUser,
  leaderboardType,
  onChangeLeaderboardType,
  onRefresh,
  isLoading,
}) => {
  const currentProblem = problems.find((p) => p.code === selectedProblemCode) || problems[0];
  const isAdmin = currentUser?.role === 'admin';
  const [showAdminNotice, setShowAdminNotice] = useState(false);

  const handleTabClick = (type: 'public' | 'private') => {
    if (type === 'private' && !isAdmin) {
      setShowAdminNotice(true);
      return;
    }
    setShowAdminNotice(false);
    onChangeLeaderboardType(type);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header and Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-xs text-white ${
              leaderboardType === 'private' ? 'bg-purple-600' : 'bg-yellow-500'
            }`}>
              <Trophy className="w-4 h-4" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Bảng Xếp Hạng OLP AI KMA 2026
            </h2>
            {leaderboardType === 'private' ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                <ShieldCheck className="w-3 h-3 text-purple-600" />
                <span>PRIVATE • ADMIN ONLY</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                <Globe className="w-3 h-3 text-emerald-600" />
                <span>PUBLIC TEST</span>
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Độ đo hiện tại: <strong className="text-blue-700">{currentProblem?.metric || 'F1-Score'}</strong> • Cập nhật tự động sau mỗi lần nộp hợp lệ
          </p>
        </div>

        {/* Problem Selector & Refresh Button */}
        <div className="flex items-center gap-3 self-start md:self-auto">
          <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl">
            {problems.map((prob) => (
              <button
                key={prob.id}
                onClick={() => onSelectProblemCode(prob.code)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  selectedProblemCode === prob.code
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {prob.code}
              </button>
            ))}
          </div>

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-all cursor-pointer shadow-xs disabled:opacity-50"
            title="Làm mới bảng xếp hạng"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Leaderboard Type Switcher (Public vs Private) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-2 bg-slate-100/80 rounded-2xl border border-slate-200/60">
        <div className="flex items-center gap-1.5 flex-1">
          {/* Public Leaderboard Button */}
          <button
            type="button"
            onClick={() => handleTabClick('public')}
            className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              leaderboardType === 'public'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <Globe className="w-4 h-4 text-blue-600" />
            <span>Bảng Xếp Hạng Public (Công khai)</span>
          </button>

          {/* Private Leaderboard Button */}
          <button
            type="button"
            onClick={() => handleTabClick('private')}
            className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              leaderboardType === 'private'
                ? 'bg-purple-700 text-white shadow-xs'
                : isAdmin
                ? 'text-purple-700 hover:bg-purple-50/80'
                : 'text-slate-400 hover:bg-slate-200/50'
            }`}
            title={isAdmin ? 'Xem bảng xếp hạng Private' : 'Bảng xếp hạng Private chỉ hiển thị cho tài khoản Quản trị viên (Admin)'}
          >
            {isAdmin ? (
              <ShieldCheck className={`w-4 h-4 ${leaderboardType === 'private' ? 'text-white' : 'text-purple-600'}`} />
            ) : (
              <Lock className="w-4 h-4 text-slate-400" />
            )}
            <span>Bảng Xếp Hạng Private</span>
            <span className={`px-1.5 py-0.2 text-[9px] font-black rounded uppercase tracking-wider ${
              leaderboardType === 'private'
                ? 'bg-purple-800 text-purple-200'
                : isAdmin
                ? 'bg-purple-100 text-purple-700'
                : 'bg-slate-200 text-slate-500'
            }`}>
              Admin Only
            </span>
          </button>
        </div>

        <div className="text-xs text-slate-500 font-medium px-2 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-slate-400" />
          <span>
            {leaderboardType === 'public'
              ? 'Xếp hạng dựa trên kết quả chạy tập kiểm thử Public Test'
              : 'Xếp hạng bảo mật đánh giá kết quả tập Private Test (Chung cuộc)'}
          </span>
        </div>
      </div>

      {/* Non-admin Warning Alert if they click Private */}
      {/* {showAdminNotice && !isAdmin && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-sm text-amber-900">Bảng Xếp Hạng Private Được Bảo Mật</div>
            <p className="mt-0.5 text-amber-700">
              Bảng xếp hạng Private được dùng để đánh giá điểm số chung cuộc và được bảo mật tuyệt đối trong suốt thời gian diễn ra kỳ thi.
            </p>
          </div>
        </div>
      )} */}

      {/* Admin Notice Banner when viewing Private Leaderboard */}
      {leaderboardType === 'private' && isAdmin && (
        <div className="p-4 rounded-2xl bg-purple-50/80 border border-purple-200 text-purple-900 text-xs flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-sm text-purple-950 flex items-center gap-2">
              <span>Chế độ Quản trị viên: Đang xem Bảng Xếp Hạng Private (Chung cuộc)</span>
              <span className="px-2 py-0.5 rounded-full bg-purple-200 text-purple-800 text-[10px] font-bold">
                Bảo mật
              </span>
            </div>
            <p className="mt-1 text-purple-700">
              Bảng xếp hạng này được tính dựa trên bài nộp của thí sinh vào tập <strong>Private Test</strong>. Dữ liệu này được ẩn hoàn toàn và không hiển thị cho các tài khoản thí sinh thông thường.
            </p>
          </div>
        </div>
      )}

      {/* Leaderboard Table */}
      <div className={`bg-white rounded-3xl border shadow-xs overflow-hidden ${
        leaderboardType === 'private' ? 'border-purple-200' : 'border-slate-200'
      }`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className={`border-b text-xs font-bold uppercase tracking-wider ${
              leaderboardType === 'private' 
                ? 'bg-purple-50/60 border-purple-100 text-purple-800'
                : 'bg-slate-50/90 border-slate-200 text-slate-500'
            }`}>
              <tr>
                <th className="py-4 px-6 text-center w-20">Hạng</th>
                <th className="py-4 px-6">Đội thi / Thí sinh</th>
                <th className="py-4 px-6">Bài thi</th>
                <th className="py-4 px-6 text-right">
                  Điểm cao nhất ({currentProblem?.metric})
                  {leaderboardType === 'private' && (
                    <span className="block text-[10px] font-semibold text-purple-600 lowercase">(private test)</span>
                  )}
                </th>
                <th className="py-4 px-6 text-right">Thời gian nộp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-500 mb-2" />
                    <p className="text-xs font-medium">Đang tải bảng xếp hạng...</p>
                  </td>
                </tr>
              ) : leaderboard.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400 text-xs sm:text-sm">
                    {leaderboardType === 'private'
                      ? 'Chưa có bài nộp hợp lệ nào trên tập Private Test cho đề bài này.'
                      : 'Chưa có bài nộp hợp lệ nào cho đề bài này.'}
                  </td>
                </tr>
              ) : (
                leaderboard.map((item) => {
                  const isTop1 = item.rank === 1;
                  const isTop2 = item.rank === 2;
                  const isTop3 = item.rank === 3;

                  return (
                    <tr 
                      key={item.user_id} 
                      className={`hover:bg-blue-50/40 transition-colors ${
                        isTop1 ? (leaderboardType === 'private' ? 'bg-purple-50/30' : 'bg-amber-50/20') : ''
                      }`}
                    >
                      <td className="py-4 px-6 text-center">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full font-black text-xs ${
                          isTop1
                            ? 'bg-yellow-400 text-white shadow-sm'
                            : isTop2
                            ? 'bg-slate-300 text-slate-800'
                            : isTop3
                            ? 'bg-amber-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {item.rank}
                        </span>
                      </td>

                      <td className="py-4 px-6">
                        <div className="font-bold text-slate-900 flex items-center gap-2">
                          <span>{item.team_name}</span>
                          {isTop1 && <Flame className="w-4 h-4 text-red-500" />}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{item.full_name}</div>
                      </td>

                      <td className="py-4 px-6">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                          leaderboardType === 'private'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {item.problem_code}
                        </span>
                      </td>

                      <td className="py-4 px-6 text-right">
                        <span className={`font-mono text-base font-extrabold ${
                          isTop1 ? 'text-red-600' : leaderboardType === 'private' ? 'text-purple-700' : 'text-blue-700'
                        }`}>
                          {item.best_score}
                        </span>
                      </td>

                      <td className="py-4 px-6 text-right text-xs text-slate-500 font-mono">
                        {item.last_submission_time ? new Date(item.last_submission_time).toLocaleString('vi-VN') : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
