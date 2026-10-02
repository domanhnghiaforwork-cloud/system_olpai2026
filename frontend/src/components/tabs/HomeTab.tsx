'use client';

import React from 'react';
import { 
  Trophy, 
  ArrowRight, 
  Sparkles, 
  Target, 
  ShieldCheck, 
  Cpu, 
  TrendingUp, 
  Clock, 
  Award,
  Users
} from 'lucide-react';
import { Problem } from '@/types';

interface HomeTabProps {
  onNavigate: (tab: string) => void;
  problems: Problem[];
}

export const HomeTab: React.FC<HomeTabProps> = ({ onNavigate, problems }) => {
  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 border border-blue-900/40 text-white p-8 md:p-14 shadow-2xl">
        {/* Glow ambient background effects */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-red-600/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-400/30 text-blue-300 text-xs font-semibold mb-6">
            {/* <Sparkles className="w-4 h-4 text-red-400" /> */}
            <span>Học viện Kỹ thuật Mật mã • KMA AI 2026</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-white leading-tight">
            Olympic Trí Tuệ Nhân Tạo <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-sky-300 to-red-400">
              OLP AI KMA 2026
            </span>
          </h1>

          <p className="mt-5 text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl">
            Hệ thống thi Olympic Trí tuệ Nhân tạo cấp Học viện Kỹ thuật Mật mã năm 2026. Sân chơi học thuật uy tín dành cho sinh viên đam mê nghiên cứu Machine Learning, Deep Learning, An toàn thông tin và Khoa học dữ liệu.
          </p>

          {/* Action Buttons */}
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button
              onClick={() => onNavigate('problems')}
              className="px-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 flex items-center gap-2 transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <span>Khám phá đề bài ({problems.length})</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => onNavigate('leaderboard')}
              className="px-6 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-sm border border-white/20 flex items-center gap-2 backdrop-blur-xs transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Trophy className="w-4 h-4 text-yellow-400" />
              <span>Xem Bảng xếp hạng</span>
            </button>

            <button
              onClick={() => onNavigate('submit')}
              className="px-6 py-3.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm shadow-lg shadow-red-600/30 flex items-center gap-2 transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <span>Cổng Nộp bài</span>
            </button>
          </div>
        </div>

      </section>
    </div>
  );
};
