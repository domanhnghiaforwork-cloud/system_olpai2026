'use client';

import React from 'react';
import { User } from '@/types';
import { 
  Trophy, 
  FileCode2, 
  UploadCloud, 
  Database, 
  Home, 
  ShieldCheck, 
  UserCheck, 
  Layers,
  ChevronDown
} from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  currentUser: User | null;
  users: User[];
  onSwitchUser: (userId: number) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onTabChange,
  currentUser,
  users,
  onSwitchUser,
}) => {
  const [dropdownOpen, setDropdownOpen] = React.useState(false);

  const navItems = [
    { id: 'home', label: 'Trang chủ', icon: Home },
    { id: 'problems', label: 'Đề bài', icon: FileCode2 },
    { id: 'leaderboard', label: 'Bảng xếp hạng', icon: Trophy },
    { id: 'submit', label: 'Nộp bài', icon: UploadCloud },
    { id: 'datasets', label: 'Dữ liệu', icon: Database },
  ];

  if (currentUser?.role === 'admin') {
    navItems.push({ id: 'admin', label: 'Quản trị (Admin)', icon: ShieldCheck });
  }

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-18">
          
          {/* Brand Logo & Name */}
          <div 
            onClick={() => onTabChange('home')}
            className="flex items-center gap-3 cursor-pointer group select-none"
          >
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-blue-700 via-blue-600 to-red-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform duration-200">
              <Layers className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-tight text-slate-900 group-hover:text-blue-700 transition-colors">
                  OLP AI <span className="text-red-600">KMA</span>
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  2026
                </span>
              </div>
              <span className="text-[11px] font-medium text-slate-500 tracking-wide uppercase">
                Olympic Trí tuệ Nhân tạo KMA
              </span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              const isAdminTab = item.id === 'admin';

              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    isActive
                      ? isAdminTab
                        ? 'bg-red-600 text-white shadow-sm shadow-red-500/30'
                        : 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                      : isAdminTab
                      ? 'text-red-600 hover:bg-red-50'
                      : 'text-slate-600 hover:text-blue-700 hover:bg-slate-100/80'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : ''}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* User Profile & Role Switcher */}
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-3 p-1.5 pr-3 rounded-full border border-slate-200 hover:border-blue-400 bg-white shadow-xs transition-all duration-200 hover:shadow-md"
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white ${
                currentUser?.role === 'admin' 
                  ? 'bg-gradient-to-r from-red-600 to-rose-700 ring-2 ring-red-200' 
                  : 'bg-gradient-to-r from-blue-600 to-sky-600 ring-2 ring-blue-200'
              }`}>
                {currentUser?.role === 'admin' ? 'AD' : (currentUser?.full_name?.charAt(0) || 'U')}
              </div>
              <div className="text-left hidden sm:block">
                <div className="text-xs font-bold text-slate-800 leading-tight">
                  {currentUser?.full_name || 'Đang tải...'}
                </div>
                <div className="text-[10px] font-medium text-slate-500 flex items-center gap-1">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                    currentUser?.role === 'admin' ? 'bg-red-500' : 'bg-emerald-500'
                  }`}></span>
                  <span>{currentUser?.role === 'admin' ? 'Quản trị viên' : (currentUser?.team_name || 'Thí sinh')}</span>
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Quick Switch Dropdown for Demo / Testing Role */}
            {dropdownOpen && (
              <div 
                className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200/90 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                onMouseLeave={() => setDropdownOpen(false)}
              >
                <div className="px-4 py-2 border-b border-slate-100">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Đổi tác nhân thử nghiệm
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    Chuyển giữa quyền <span className="font-bold text-red-600">Admin</span> và <span className="font-bold text-blue-600">User</span>
                  </div>
                </div>

                <div className="py-1">
                  {users.map((u) => {
                    const isSelected = u.id === currentUser?.id;
                    return (
                      <button
                        key={u.id}
                        onClick={() => {
                          onSwitchUser(u.id);
                          setDropdownOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 flex items-center justify-between text-xs hover:bg-slate-50 transition-colors ${
                          isSelected ? 'bg-blue-50/70' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
                            u.role === 'admin' ? 'bg-red-600' : 'bg-blue-600'
                          }`}>
                            {u.role === 'admin' ? 'AD' : u.full_name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-slate-800">{u.full_name}</div>
                            <div className="text-[10px] text-slate-500">@{u.username} • {u.team_name}</div>
                          </div>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          u.role === 'admin' 
                            ? 'bg-red-100 text-red-700' 
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {u.role === 'admin' ? 'Admin' : 'Thí sinh'}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="px-4 py-2 border-t border-slate-100 text-[11px] text-slate-400 text-center">
                  Học viện Kỹ thuật Mật mã (KMA) © 2026
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </header>
  );
};
