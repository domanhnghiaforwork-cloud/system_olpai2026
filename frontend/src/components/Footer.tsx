'use client';

import React from 'react';
import { Layers, MapPin } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-900 text-slate-300 border-t border-slate-800 mt-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          {/* Logo & Address */}
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-red-600 flex items-center justify-center text-white shadow-xs">
                <Layers className="w-4 h-4" />
              </div>
              <span className="text-sm font-black text-white tracking-wide">
                OLP AI <span className="text-red-500">KMA</span> 2026
              </span>
            </div>

            <span className="hidden sm:inline text-slate-700">•</span>

            <div className="flex items-center gap-1.5 text-slate-400">
              <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <span>141 Chiến Thắng, Tân Triều, Thanh Trì, Hà Nội</span>
            </div>
          </div>

          {/* Copyright & Info */}
          <div className="flex items-center gap-3 text-slate-500">
            <span>© 2026 KMA</span>
            <span>•</span>
            <span className="text-slate-400 font-medium">Học viện Kỹ thuật Mật mã</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
