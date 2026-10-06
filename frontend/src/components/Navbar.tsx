'use client';

import React from 'react';
import { User } from '@/types';
import { createChatbotTicket, getAuthToken } from '@/lib/api';
import { getChatbotUrl, isChatbotSsoEnabled } from '@/lib/chatbotSession';
import { 
  Trophy, 
  FileCode2, 
  UploadCloud, 
  Database, 
  Home, 
  ShieldCheck, 
  UserCheck, 
  Layers,
  ChevronDown,
  LogOut,
  Lock,
  MessageCircle,
  ExternalLink
} from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  currentUser: User | null;
  users: User[];
  onSwitchUser: (userId: number) => void;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onTabChange,
  currentUser,
  users,
  onSwitchUser,
  onLogout,
}) => {
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const [chatbotError, setChatbotError] = React.useState('');
  const chatbotUrl = getChatbotUrl();
  const isAdmin = currentUser?.role === 'admin';

  const openChatbot = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!currentUser || !isChatbotSsoEnabled()) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    // Open synchronously so browser popup protection accepts the user's click.
    const tab = window.open('about:blank', '_blank');
    if (!tab) {
      setChatbotError('Hãy cho phép mở tab mới để đăng nhập Chatbot.');
      return;
    }
    tab.opener = null;
    setChatbotError('');
    try {
      const systemToken = getAuthToken();
      const ticket = await createChatbotTicket();
      if (!systemToken || getAuthToken() !== systemToken) throw new Error('System session changed');
      const destination = new URL(chatbotUrl, window.location.origin);
      destination.pathname = `${destination.pathname.replace(/\/+$/, '')}/sso`;
      // Fragments stay in the browser, outside HTTP access logs and referrers.
      destination.hash = new URLSearchParams({ ticket }).toString();
      if (!tab.closed) tab.location.replace(destination.toString());
    } catch {
      if (!tab.closed) tab.close();
      setChatbotError('Không thể đăng nhập Chatbot. Hãy kiểm tra kết nối hoặc đăng nhập lại system.');
    }
  };

  const navItems = [
    { id: 'home', label: 'Trang chủ', icon: Home, isPublic: true },
    { id: 'leaderboard', label: 'Bảng xếp hạng', icon: Trophy, isPublic: true },
    { id: 'problems', label: 'Đề thi', icon: FileCode2, isPublic: false },
    { id: 'datasets', label: 'Dữ liệu', icon: Database, isPublic: false },
    { id: 'submit', label: 'Nộp bài', icon: UploadCloud, isPublic: false },
  ];

  if (isAdmin) {
    navItems.push({ id: 'admin', label: 'Quản trị (Admin)', icon: ShieldCheck, isPublic: false });
  }

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
      <div className={`mx-auto px-4 sm:px-6 ${isAdmin ? 'max-w-[1440px] lg:px-4 2xl:px-6' : 'max-w-7xl lg:px-8'}`}>
        <div className="flex items-center justify-between h-18">
          
          {/* Brand Logo & Name */}
          <div 
            onClick={() => onTabChange('home')}
            className={`flex items-center gap-2 sm:gap-3 cursor-pointer group select-none ${isAdmin ? 'xl:shrink-0 xl:whitespace-nowrap' : ''}`}
          >
            <div className="w-9 h-9 sm:w-11 sm:h-11 shrink-0 rounded-xl bg-gradient-to-tr from-blue-700 via-blue-600 to-red-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform duration-200">
              <Layers className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-xl whitespace-nowrap font-black tracking-tight text-slate-900 group-hover:text-blue-700 transition-colors">
                  OLP AI <span className="text-red-600">KMA</span>
                </span>
                <span className="hidden sm:inline-block text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  2026
                </span>
              </div>
              <span className="hidden sm:block text-[11px] font-medium text-slate-500 tracking-wide uppercase">
                Olympic Trí tuệ Nhân tạo KMA
              </span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className={`hidden xl:flex items-center gap-1 ${isAdmin ? 'shrink-0' : ''}`}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              const isAdminTab = item.id === 'admin';
              const isLocked = !currentUser && !item.isPublic;

              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  title={isLocked ? `${item.label} (Yêu cầu đăng nhập)` : item.label}
                  className={`flex items-center ${isAdmin ? 'shrink-0 whitespace-nowrap gap-1.5 px-1.5 2xl:gap-2 2xl:px-3.5' : 'gap-2 px-3.5'} py-2 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
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
                  {isLocked && (
                    <Lock className={`w-3 h-3 ${isActive ? 'text-white/80' : 'text-slate-400'}`} />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Chatbot and user account */}
          <div className="relative flex shrink-0 items-center gap-2 sm:gap-3">
            <a
              href={chatbotUrl}
              onClick={openChatbot}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Chatbot (mở trong tab mới)"
              title="Mở Chatbot trong tab mới"
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-red-50 px-2.5 py-2 text-sm font-extrabold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:gap-2 sm:px-3.5"
            >
              <MessageCircle className="h-4 w-4 text-blue-600" aria-hidden="true" />
              <span className="bg-gradient-to-r from-blue-600 to-red-600 bg-clip-text text-transparent">
                Chatbot
              </span>
              <ExternalLink className="hidden h-3.5 w-3.5 text-red-500 sm:block" aria-hidden="true" />
            </a>

            {chatbotError && (
              <p role="alert" className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-red-200 bg-white p-3 text-sm text-red-700 shadow-lg">
                {chatbotError}
                <a href={chatbotUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block font-semibold underline">Mở trang đăng nhập Chatbot</a>
              </p>
            )}

            {!currentUser ? (
              <button
                aria-label="Đăng nhập"
                onClick={() => {
                  onTabChange('home');
                  setTimeout(() => {
                    const input = document.querySelector<HTMLInputElement>('input[autoComplete="username"]');
                    if (input) {
                      input.focus();
                      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }, 120);
                }}
                className="flex items-center gap-2 px-2.5 sm:px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-md shadow-blue-500/20 transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                <LogOut className="w-4 h-4 rotate-180" />
                <span className="hidden sm:inline">Đăng nhập</span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className={`flex items-center ${isAdmin ? 'gap-3 xl:gap-2 2xl:gap-3' : 'gap-3'} p-1.5 pr-3 rounded-full border border-slate-200 hover:border-blue-400 bg-white shadow-xs transition-all duration-200 hover:shadow-md cursor-pointer`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white ${
                    currentUser.role === 'admin' 
                      ? 'bg-gradient-to-r from-red-600 to-rose-700 ring-2 ring-red-200' 
                      : 'bg-gradient-to-r from-blue-600 to-sky-600 ring-2 ring-blue-200'
                  }`}>
                    {currentUser.role === 'admin' ? 'AD' : (currentUser.full_name?.charAt(0) || 'U')}
                  </div>
                  <div className={`text-left hidden sm:block ${isAdmin ? 'xl:max-w-40 2xl:max-w-48' : ''}`}>
                    <div className={`text-xs font-bold text-slate-800 leading-tight ${isAdmin ? 'xl:truncate' : ''}`}>
                      {currentUser.full_name}
                    </div>
                    <div className="text-[10px] font-medium text-slate-500 flex items-center gap-1">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                        currentUser.role === 'admin' ? 'bg-red-500' : 'bg-emerald-500'
                      }`}></span>
                      <span>{currentUser.role === 'admin' ? 'Quản trị viên' : (currentUser.team_name || 'Thí sinh')}</span>
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {/* Account Details Dropdown */}
                {dropdownOpen && (
                  <div 
                    className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200/90 py-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                    onMouseLeave={() => setDropdownOpen(false)}
                  >
                    <div className="px-4 pb-3 border-b border-slate-100">
                      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Tài khoản đăng nhập
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white shrink-0 ${
                          currentUser.role === 'admin' ? 'bg-red-600' : 'bg-blue-600'
                        }`}>
                          {currentUser.role === 'admin' ? 'AD' : currentUser.full_name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 text-sm truncate">{currentUser.full_name}</div>
                          <div className="text-xs text-blue-600 font-mono truncate">@{currentUser.username}</div>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        <span className="font-medium text-slate-700">Đội thi:</span> {currentUser.team_name}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {currentUser.email}
                      </div>
                      <div className="mt-2">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          currentUser.role === 'admin' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {currentUser.role === 'admin' ? 'Quyền: Quản trị viên' : 'Quyền: Thí sinh'}
                        </span>
                      </div>
                    </div>

                    {onLogout && (
                      <div className="pt-2 px-2">
                        <button
                          onClick={() => {
                            onLogout();
                            setDropdownOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 text-xs text-rose-600 hover:bg-rose-50 font-semibold transition-colors cursor-pointer"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>Đăng xuất khỏi hệ thống</span>
                        </button>
                      </div>
                    )}

                    <div className="mt-2 pt-2 px-4 border-t border-slate-100 text-[10px] text-slate-400 text-center">
                      Olympic Trí tuệ Nhân tạo KMA © 2026
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

        </div>

        {/* Mobile Navigation bar for smaller screens */}
        <div className="flex xl:hidden items-center gap-1.5 py-2 overflow-x-auto no-scrollbar border-t border-slate-100">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            const isAdminTab = item.id === 'admin';
            const isLocked = !currentUser && !item.isPublic;

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  isActive
                    ? isAdminTab
                      ? 'bg-red-600 text-white'
                      : 'bg-blue-600 text-white'
                    : isAdminTab
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
                {isLocked && <Lock className="w-3 h-3 text-slate-400" />}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
