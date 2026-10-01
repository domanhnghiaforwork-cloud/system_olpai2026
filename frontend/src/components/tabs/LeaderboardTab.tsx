'use client';

import React from 'react';
import { LeaderboardItem, Problem } from '@/types';
import { 
  Trophy, 
  RefreshCw, 
  Flame,
  Award
} from 'lucide-react';

interface LeaderboardTabProps {
  problems: Problem[];
  leaderboard: LeaderboardItem[];
  selectedProblemCode: string;
  onSelectProblemCode: (code: string) => void;
  onRefresh: () => void;
  isLoading: boolean;
}

export const LeaderboardTab: React.FC<LeaderboardTabProps> = ({
  problems,
  leaderboard,
  selectedProblemCode,
  onSelectProblemCode,
  onRefresh,
  isLoading,
}) => {
  const currentProblem = problems.find((p) => p.code === selectedProblemCode) || problems[0];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header and Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-yellow-500 text-white flex items-center justify-center shadow-xs">
              <Trophy className="w-4 h-4" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Bảng Xếp Hạng OLP AI KMA 2026
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-700 animate-pulse border border-red-200">
              LIVE
            </span>
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
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
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

      {/* Leaderboard Table (Chỉ để lại cái bảng, bỏ trường số lần nộp) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/90 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-4 px-6 text-center w-20">Hạng</th>
                <th className="py-4 px-6">Đội thi / Thí sinh</th>
                <th className="py-4 px-6">Bài thi</th>
                <th className="py-4 px-6 text-right">Điểm cao nhất ({currentProblem?.metric})</th>
                <th className="py-4 px-6 text-right">Thời gian nộp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leaderboard.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400 text-xs sm:text-sm">
                    Chưa có bài nộp hợp lệ nào cho đề bài này.
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
                        isTop1 ? 'bg-amber-50/20' : ''
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
                        <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-blue-100 text-blue-700">
                          {item.problem_code}
                        </span>
                      </td>

                      <td className="py-4 px-6 text-right">
                        <span className={`font-mono text-base font-extrabold ${
                          isTop1 ? 'text-red-600' : 'text-blue-700'
                        }`}>
                          {item.best_score}
                        </span>
                      </td>

                      <td className="py-4 px-6 text-right text-xs text-slate-500 font-mono">
                        {new Date(item.last_submission_time).toLocaleString('vi-VN')}
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
