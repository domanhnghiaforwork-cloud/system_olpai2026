'use client';

import React from 'react';
import { Layers, ShieldCheck, Mail, MapPin } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-900 text-slate-300 border-t border-slate-800 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          
          <div className="md:col-span-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-red-600 flex items-center justify-center text-white shadow-md">
                <Layers className="w-5 h-5" />
              </div>
              <span className="text-xl font-black text-white">
                OLP AI <span className="text-red-500">KMA</span> 2026
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-400 max-w-md leading-relaxed">
              Hệ thống thi Olympic Trí tuệ Nhân tạo cấp Học viện Kỹ thuật Mật mã năm 2026. 
              Sân chơi học thuật uy tín dành cho sinh viên đam mê nghiên cứu Machine Learning, Deep Learning, An toàn thông tin và Khoa học dữ liệu.
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
              <MapPin className="w-4 h-4 text-red-500" />
              <span>141 Chiến Thắng, Tân Triều, Thanh Trì, Hà Nội</span>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-white mb-4">
              Liên kết nhanh
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#problems" className="hover:text-blue-400 transition-colors">Danh sách đề thi</a>
              </li>
              <li>
                <a href="#leaderboard" className="hover:text-blue-400 transition-colors">Bảng xếp hạng tổng thể</a>
              </li>
              <li>
                <a href="#submit" className="hover:text-blue-400 transition-colors">Cổng nộp bài dự thi</a>
              </li>
              <li>
                <a href="#datasets" className="hover:text-blue-400 transition-colors">Tải xuống dữ liệu mẫu</a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-white mb-4">
              Hỗ trợ kỹ thuật
            </h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-400" />
                <span>olpai@actvn.edu.vn</span>
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Ban Công nghệ & Chấm thi tự động</span>
              </li>
              <li className="pt-2">
                <span className="inline-block px-2.5 py-1 rounded bg-blue-900/60 text-blue-300 text-xs border border-blue-700/50">
                  Hệ thống SQLite + FastAPI + Next.js
                </span>
              </li>
            </ul>
          </div>

        </div>

        <div className="mt-8 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500">
          <div>
            © 2026 Học viện Kỹ thuật Mật mã (KMA). All rights reserved.
          </div>
          <div className="mt-2 sm:mt-0 flex gap-4">
            <span className="text-blue-400 font-medium">Phiên bản khung 1.0.0</span>
            <span>•</span>
            <span className="text-red-400 font-medium">OLP AI KMA</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
