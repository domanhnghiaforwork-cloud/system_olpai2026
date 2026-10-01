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
            <Sparkles className="w-4 h-4 text-red-400" />
            <span>Học viện Kỹ thuật Mật mã • KMA AI Arena 2026</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-white leading-tight">
            Olympic Trí Tuệ Nhân Tạo <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-sky-300 to-red-400">
              OLP AI KMA 2026
            </span>
          </h1>

          <p className="mt-5 text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl">
            Đấu trường học thuật AI đỉnh cao dành cho sinh viên Học viện Kỹ thuật Mật mã. 
            Giải quyết các bài toán thực tiễn về an ninh mạng, phân loại mã độc và xử lý ngôn ngữ tự nhiên với hạ tầng chấm thi tự động.
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

        {/* Quick Highlights / Banner Card */}
        <div className="mt-12 pt-8 border-t border-slate-800/80 grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xl font-black text-white">{problems.length || 3} Bài toán</div>
              <div className="text-xs text-slate-400">Cybersecurity & AI</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xl font-black text-white">4 Đội hạt giống</div>
              <div className="text-xs text-slate-400">AT18, AT19, K18</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xl font-black text-white">Realtime Score</div>
              <div className="text-xs text-slate-400">Chấm tự động</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/20 text-yellow-400 flex items-center justify-center font-bold">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xl font-black text-white">Cơ cấu giải</div>
              <div className="text-xs text-slate-400">Nhất, Nhì, Ba KMA</div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Problems Preview */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              Các bài toán đang mở nộp bài
            </h2>
            <p className="text-sm text-slate-500">
              Chọn đề bài để xem chi tiết yêu cầu, bộ dữ liệu và định dạng file nộp.
            </p>
          </div>
          <button
            onClick={() => onNavigate('problems')}
            className="text-sm font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            <span>Tất cả bài toán</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {problems.map((prob) => (
            <div
              key={prob.id}
              onClick={() => onNavigate('problems')}
              className="group bg-white rounded-2xl p-6 border border-slate-200 hover:border-blue-400 shadow-xs hover:shadow-lg transition-all duration-200 flex flex-col justify-between cursor-pointer"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-blue-100 text-blue-700">
                    {prob.code}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    prob.category === 'CV'
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                  }`}>
                    {prob.category === 'CV' ? 'Computer Vision' : 'NLP'}
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                  {prob.title}
                </h3>
                <p className="mt-2 text-xs text-slate-600 line-clamp-3 leading-relaxed">
                  {prob.short_description || prob.description}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span className="font-semibold text-slate-700">
                  Đo lường: <span className="text-red-600">{prob.metric}</span>
                </span>
                <span className="flex items-center gap-1 text-blue-600 font-medium group-hover:translate-x-1 transition-transform">
                  Chi tiết <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Rules and Information */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
            <Target className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-slate-900">Quy định nộp bài</h3>
          <p className="mt-2 text-xs text-slate-600 leading-relaxed">
            Mỗi đội thi được nộp tối đa 5 lần mỗi ngày cho mỗi bài toán. Điểm số cao nhất trên tập Public Test sẽ được ghi nhận lên Bảng xếp hạng.
          </p>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center mb-4">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-slate-900">Đạo đức & Minh bạch</h3>
          <p className="mt-2 text-xs text-slate-600 leading-relaxed">
            Nghiêm cấm chia sẻ nhãn tập kiểm thử hoặc gian lận mã nguồn. Ban Tổ chức KMA sẽ kiểm tra lại toàn bộ notebook và weights sau khi kết thúc.
          </p>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
            <Clock className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-slate-900">Lịch trình thi đấu</h3>
          <p className="mt-2 text-xs text-slate-600 leading-relaxed">
            Vòng sơ loại trực tuyến mở từ hôm nay đến 23:59 ngày 30/11/2026. Chung kết trình bày giải pháp tại Hội trường KMA.
          </p>
        </div>
      </section>
    </div>
  );
};
