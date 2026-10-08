'use client';

import React, { useState } from 'react';
import { LeaderboardItem, OverallLeaderboardItem, Problem, User } from '@/types';
import { formatPoints, formatScore } from '@/lib/scoreDisplay';
import { 
  RefreshCw, 
  ShieldCheck, 
  AlertCircle,
  CheckCircle2
} from 'lucide-react';

interface LeaderboardTabProps {
  problems: Problem[];
  leaderboard: LeaderboardItem[];
  overallLeaderboard: OverallLeaderboardItem[];
  selectedProblemCode: string;
  onSelectProblemCode: (code: string) => void;
  currentUser: User | null;
  leaderboardType: 'overall' | 'overall-private' | 'public' | 'private';
  onChangeLeaderboardType: (type: 'overall' | 'overall-private' | 'public' | 'private') => void;
  onRefresh: () => void;
  isLoading: boolean;
  isRealtimeConnected: boolean;
}

export const LeaderboardTab: React.FC<LeaderboardTabProps> = ({
  problems,
  leaderboard,
  overallLeaderboard,
  selectedProblemCode,
  onSelectProblemCode,
  currentUser,
  leaderboardType,
  onChangeLeaderboardType,
  onRefresh,
  isLoading,
  isRealtimeConnected,
}) => {
  const currentProblem = problems.find((p) => p.code === selectedProblemCode) || problems[0];
  const isAdmin = currentUser?.role === 'admin';
  const isOverall = leaderboardType === 'overall' || leaderboardType === 'overall-private';
  const isPrivate = leaderboardType === 'private' || leaderboardType === 'overall-private';
  const splitLabel = isPrivate ? 'Private' : 'Public';
  const [showAdminNotice, setShowAdminNotice] = useState(false);

  const handleTabClick = (type: 'overall' | 'overall-private' | 'public' | 'private') => {
    if ((type === 'private' || type === 'overall-private') && !isAdmin) {
      setShowAdminNotice(true);
      return;
    }
    setShowAdminNotice(false);
    onChangeLeaderboardType(type);
  };

  return (
    <div className="space-y-3 max-w-5xl mx-auto">
      {/* Header and Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Bảng Xếp Hạng OLP AI KMA 2026
            </h2>
            {isPrivate ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                <ShieldCheck className="w-3 h-3 text-purple-600" />
                <span>PRIVATE • ADMIN ONLY</span>
              </span>
            ) : null}
          </div>
        </div>

        {/* Refresh Button */}
        <div className="flex items-center gap-3 self-start md:self-auto">
          <span
            role="status"
            aria-live="polite"
            aria-label={isRealtimeConnected ? 'Đã kết nối cập nhật thời gian thực' : 'Đang kết nối cập nhật thời gian thực'}
            className={`whitespace-nowrap text-[11px] font-semibold ${isRealtimeConnected ? 'text-green-600' : 'text-red-600'}`}
          >
            Real time{!isRealtimeConnected && <span className="leaderboard-connecting-dots" aria-hidden="true">...</span>}
          </span>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-all cursor-pointer shadow-xs disabled:opacity-50"
            title="Làm mới bảng xếp hạng"
            aria-label="Làm mới bảng xếp hạng"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Leaderboard Type Switcher (Overall vs Public vs Private) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-2 bg-slate-100/80 rounded-2xl border border-slate-200/60">
        <div className="flex items-center gap-1.5 flex-1 flex-wrap">
          {/* Overall Leaderboard Button */}
          <button
            type="button"
            onClick={() => handleTabClick('overall')}
            aria-pressed={leaderboardType === 'overall'}
            className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              leaderboardType === 'overall'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <span>Tổng điểm public</span>
          </button>

          {/* Public Leaderboard Button */}
          <button
            type="button"
            onClick={() => handleTabClick('public')}
            aria-pressed={leaderboardType === 'public'}
            className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              leaderboardType === 'public'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <span>Điểm public từng đề</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => handleTabClick('overall-private')}
              aria-pressed={leaderboardType === 'overall-private'}
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                leaderboardType === 'overall-private' ? 'bg-purple-700 text-white shadow-xs' : 'text-purple-700 hover:bg-purple-50/80'
              }`}
            >
              <span>Tổng điểm private</span>
              <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[9px] font-black">ADMIN</span>
            </button>
          )}

          {/* Private Leaderboard Button */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => handleTabClick('private')}
              aria-pressed={leaderboardType === 'private'}
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                leaderboardType === 'private'
                  ? 'bg-purple-700 text-white shadow-xs'
                  : 'text-purple-700 hover:bg-purple-50/80'
              }`}
              title="Xem bảng xếp hạng Private"
            >
              <span>Điểm private từng đề</span>
              <span className={`px-1.5 py-0.2 text-[9px] font-black rounded uppercase tracking-wider ${
                leaderboardType === 'private'
                  ? 'bg-purple-800 text-purple-200'
                  : 'bg-purple-100 text-purple-700'
              }`}>
                Admin
              </span>
            </button>
          )}
        </div>

      </div>

      {!isOverall && (!isPrivate || isAdmin) && (
        <div className="flex flex-wrap items-center justify-start gap-2" role="group" aria-label="Chọn đề thi">
          {([
            { category: 'CV', label: 'Computer Vision' },
            { category: 'NLP', label: 'Natural Language Processing' },
          ] as const).map(({ category, label }) => {
            const problem = currentProblem?.category === category
              ? currentProblem
              : problems.find((item) => item.category === category);
            const isSelected = currentProblem?.category === category;

            return (
              <button
                key={category}
                type="button"
                aria-pressed={isSelected}
                disabled={!problem}
                onClick={() => { if (problem) onSelectProblemCode(problem.code); }}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  isSelected
                    ? 'bg-green-600 border-green-600 text-white shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-green-50 hover:border-green-300 hover:text-green-700'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* OVERALL LEADERBOARD TABLE */}
      {isPrivate && !isAdmin ? (
        <p role="alert" className="p-6 text-center text-slate-500">Bảng xếp hạng Private chỉ dành cho Admin.</p>
      ) : isOverall ? (
        <div className={`bg-white rounded-3xl border shadow-xs overflow-hidden ${isPrivate ? 'border-purple-200' : 'border-amber-200/80'}`}>
          <div className="max-h-[min(60vh,560px)] overflow-auto overscroll-contain [scrollbar-gutter:stable]" role="region" aria-label={`Bảng xếp hạng tổng ${splitLabel}`} tabIndex={0}>
            <table className="w-full text-left text-sm">
              <thead className={`sticky top-0 z-10 border-b text-xs font-bold uppercase tracking-wider ${isPrivate ? 'bg-purple-50 border-purple-100 text-purple-800' : 'bg-amber-50 border-amber-100 text-amber-900'}`}>
                <tr>
                  <th className="py-4 px-6 text-center w-20">Hạng</th>
                  <th className="py-4 px-6">Đội thi</th>
                  <th className="py-4 px-6 text-center w-36">Bài thi</th>
                  <th className="py-4 px-6 text-right min-w-[260px]">
                    Tổng điểm {splitLabel}
                  </th>
                  <th className="py-4 px-6 text-right w-44">Thời gian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-500 mb-2" />
                      <p className="text-xs font-medium">Đang tải bảng xếp hạng tổng...</p>
                    </td>
                  </tr>
                ) : overallLeaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400 text-xs sm:text-sm">
                      Chưa có bài nộp {splitLabel} hợp lệ trong các đề thi.
                    </td>
                  </tr>
                ) : (
                  overallLeaderboard.map((item) => {
                    const isTop1 = item.rank === 1;
                    const isTop2 = item.rank === 2;
                    const isTop3 = item.rank === 3;
                    const isCompletedAll = item.total_problems_submitted >= item.total_problems_count;

                    return (
                      <tr 
                        key={item.user_id} 
                        className={`hover:bg-amber-50/30 transition-colors ${
                          isTop1 ? 'bg-amber-50/30' : ''
                        }`}
                      >
                        {/* Hạng */}
                        <td className="py-4 px-6 text-center">
                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full font-black text-xs ${
                            isTop1
                              ? 'bg-amber-500 text-white shadow-sm ring-2 ring-amber-200'
                              : isTop2
                              ? 'bg-slate-300 text-slate-800'
                              : isTop3
                              ? 'bg-amber-700 text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {item.rank}
                          </span>
                        </td>

                        {/* Đội thi / Thí sinh */}
                        <td className="py-4 px-6">
                          <div className="font-bold text-slate-900 flex items-center gap-2">
                            <span>{item.team_name}</span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {item.full_name} {item.username ? `(@${item.username})` : ''}
                          </div>
                        </td>

                        {/* Tiến độ bài thi */}
                        <td className="py-4 px-6 text-center">
                          <span className={`inline-flex items-center gap-1 text-xs font-bold ${
                            isCompletedAll
                              ? 'text-emerald-800'
                              : item.total_problems_submitted > 0
                              ? 'text-blue-700'
                              : 'text-slate-500'
                          }`}>
                            {isCompletedAll && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                            <span>{item.total_problems_submitted}/{item.total_problems_count} đề</span>
                          </span>
                        </td>

                        {/* Tổng điểm và chữ nhỏ điểm các thành phần */}
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-baseline justify-end gap-1.5">
                            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Tổng:</span>
                            <span className={`font-mono text-lg font-black ${
                              isTop1 ? 'text-amber-600' : 'text-blue-700'
                            }`}>
                              {formatPoints(item.total_score)}
                            </span>
                          </div>

                          {/* Chữ nhỏ điểm các thành phần theo từng đề */}
                          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 mt-1.5">
                            {item.components && item.components.map((comp) => {
                              const hasScore = comp.score !== null && comp.score !== undefined;
                              return (
                                <span
                                  key={comp.problem_id}
                                  className={`inline-flex items-center gap-1 text-[11px] font-mono ${
                                    hasScore
                                      ? 'text-blue-900 font-medium'
                                      : 'text-slate-400'
                                  }`}
                                  title={`${comp.problem_code} - ${comp.problem_title} (${comp.metric || 'Score'}): ${hasScore ? `${formatPoints(comp.score)}/100` : 'Chưa nộp'}`}
                                >
                                  <span className="font-sans font-bold text-slate-500">{comp.problem_code}:</span>
                                  <span className={hasScore ? 'font-black text-blue-800' : 'text-slate-400 italic'}>
                                    {formatPoints(comp.score)}
                                  </span>
                                </span>
                              );
                            })}
                          </div>
                        </td>

                        {/* Thời gian nộp */}
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
      ) : (
        /* INDIVIDUAL PROBLEM LEADERBOARD TABLE (Public / Private) */
        <div className={`bg-white rounded-3xl border shadow-xs overflow-hidden ${
          leaderboardType === 'private' ? 'border-purple-200' : 'border-slate-200'
        }`}>
          <div className="max-h-[min(60vh,560px)] overflow-auto overscroll-contain [scrollbar-gutter:stable]" role="region" aria-label={`Bảng xếp hạng ${splitLabel} từng đề`} tabIndex={0}>
            <table className="w-full text-left text-sm">
              <thead className={`sticky top-0 z-10 border-b text-xs font-bold uppercase tracking-wider ${
                leaderboardType === 'private' 
                  ? 'bg-purple-50 border-purple-100 text-purple-800'
                  : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}>
                <tr>
                  <th className="py-4 px-6 text-center w-20">Hạng</th>
                  <th className="py-4 px-6">Đội thi</th>
                  <th className="py-4 px-6">Bài thi</th>
                  <th className="py-4 px-6 text-right">
                    Điểm cao nhất
                  </th>
                  <th className="py-4 px-6 text-right">Thời gian</th>
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
                            {formatScore(item.best_score, currentProblem)}
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
      )}
    </div>
  );
};
