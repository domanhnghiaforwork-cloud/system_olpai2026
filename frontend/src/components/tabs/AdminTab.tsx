'use client';

import React, { useState, useEffect } from 'react';
import { 
  AdminStats, 
  Problem, 
  User, 
  AdminRecentSubmission,
  AdminSubmission,
  BatchCreateUserResponse 
} from '@/types';
import { 
  ShieldCheck, 
  Users, 
  FileCode2, 
  Activity, 
  Download, 
  FolderArchive, 
  FileSpreadsheet, 
  Trophy, 
  RefreshCw, 
  Search, 
  CheckCircle, 
  AlertCircle, 
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Check,
  UserPlus,
  Trash2,
  Edit,
  X,
  Dices,
  Mail,
  Sparkles,
  Info
} from 'lucide-react';
import { 
  fetchAdminOverview, 
  fetchProblems, 
  fetchUsers, 
  fetchValidSubmissions,
  getSubmissionDownloadUrl,
  getSubmissionsExportZipUrl,
  fetchAdminUsers,
  createAdminUser,
  batchCreateAdminUsers,
  updateAdminUser,
  deleteAdminUser,
  resetAdminUserPassword,
  getUsersExportTxtUrl
} from '@/lib/api';
import { formatScore } from '@/lib/scoreDisplay';

interface AdminTabProps {
  onUsersUpdated?: () => void;
}

export const AdminTab: React.FC<AdminTabProps> = ({ onUsersUpdated }) => {
  // Navigation section
  const [activeSection, setActiveSection] = useState<'accounts' | 'submissions' | 'monitoring'>('accounts');

  // Overview stats & activity
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentSubs, setRecentSubs] = useState<AdminRecentSubmission[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // ---------------------------------------------------------------------------
  // Account Management State
  // ---------------------------------------------------------------------------
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const [userSearchQuery, setUserSearchQuery] = useState<string>('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'user' | 'admin'>('all');
  
  // Password visibility map & global toggle
  const [showAllPasswords, setShowAllPasswords] = useState<boolean>(false);
  const [visiblePasswords, setVisiblePasswords] = useState<{ [id: number]: boolean }>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modals
  const [isBatchModalOpen, setIsBatchModalOpen] = useState<boolean>(false);
  const [isSingleModalOpen, setIsSingleModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<User | null>(null);
  const [batchResult, setBatchResult] = useState<BatchCreateUserResponse | null>(null);

  // Batch Form State
  const [batchPrefix, setBatchPrefix] = useState<string>('doi_thi_');
  const [batchCount, setBatchCount] = useState<number>(20);
  const [batchStartIndex, setBatchStartIndex] = useState<number>(1);
  const [batchPadding, setBatchPadding] = useState<number>(2);
  const [batchTeamPrefix, setBatchTeamPrefix] = useState<string>('Đội thi');
  const [batchEmailDomain, setBatchEmailDomain] = useState<string>('olpai.kma.edu.vn');
  const [batchRole, setBatchRole] = useState<'user' | 'admin'>('user');
  const [batchPasswordLength, setBatchPasswordLength] = useState<number>(8);
  const [batchUseRandomPassword, setBatchUseRandomPassword] = useState<boolean>(true);
  const [batchCustomPassword, setBatchCustomPassword] = useState<string>('');
  const [isBatchCreating, setIsBatchCreating] = useState<boolean>(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  // Single User Form State
  const [singleUsername, setSingleUsername] = useState<string>('');
  const [singlePassword, setSinglePassword] = useState<string>('');
  const [singleFullName, setSingleFullName] = useState<string>('');
  const [singleTeamName, setSingleTeamName] = useState<string>('');
  const [singleEmail, setSingleEmail] = useState<string>('');
  const [singleRole, setSingleRole] = useState<'user' | 'admin'>('user');
  const [isSingleCreating, setIsSingleCreating] = useState<boolean>(false);
  const [singleError, setSingleError] = useState<string | null>(null);

  // Edit User Form State
  const [editFullName, setEditFullName] = useState<string>('');
  const [editTeamName, setEditTeamName] = useState<string>('');
  const [editEmail, setEditEmail] = useState<string>('');
  const [editRole, setEditRole] = useState<'user' | 'admin'>('user');
  const [editPassword, setEditPassword] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Submissions management state
  const [submissionsMode, setSubmissionsMode] = useState<'best_per_user' | 'by_problem' | 'by_user'>('best_per_user');
  const [selectedProblemId, setSelectedProblemId] = useState<number | undefined>(undefined);
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>(undefined);
  const [submissionTypeFilter, setSubmissionTypeFilter] = useState<'all' | 'public' | 'private'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [validSubmissions, setValidSubmissions] = useState<AdminSubmission[]>([]);
  const [loadingSubs, setLoadingSubs] = useState<boolean>(false);
  const [problemsList, setProblemsList] = useState<Problem[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);

  // ---------------------------------------------------------------------------
  // Load data
  // ---------------------------------------------------------------------------
  const loadOverview = async () => {
    try {
      setIsLoading(true);
      const data = await fetchAdminOverview();
      setStats(data.stats);
      setRecentSubs(data.recent_submissions);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAdminUsers = async () => {
    try {
      setLoadingUsers(true);
      const data = await fetchAdminUsers();
      setAdminUsers(data);
    } catch (err) {
      console.error('Lỗi khi nạp danh sách tài khoản:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadValidSubmissions = async () => {
    try {
      setLoadingSubs(true);
      const apiMode = submissionsMode === 'best_per_user' ? 'best_per_user' : 'all';
      const pId = (submissionsMode === 'by_problem' || submissionsMode === 'best_per_user') ? selectedProblemId : undefined;
      const uId = (submissionsMode === 'by_user') ? selectedUserId : undefined;

      const subs = await fetchValidSubmissions({
        problemId: pId,
        userId: uId,
        submissionType: submissionTypeFilter,
        mode: apiMode,
      });
      setValidSubmissions(subs);
    } catch (err) {
      console.error('Lỗi khi nạp danh sách bài nộp hợp lệ:', err);
    } finally {
      setLoadingSubs(false);
    }
  };

  useEffect(() => {
    loadOverview();
    loadAdminUsers();
    fetchProblems().then(setProblemsList).catch(console.error);
    fetchUsers().then(setUsersList).catch(console.error);
  }, []);

  useEffect(() => {
    if (activeSection === 'submissions') {
      loadValidSubmissions();
    }
  }, [submissionsMode, selectedProblemId, selectedUserId, submissionTypeFilter, activeSection]);

  // Copy to clipboard helper
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Helper to generate a random password client-side
  const generateClientPassword = (length: number = 8): string => {
    const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lowercase = "abcdefghijkmnpqrstuvwxyz";
    const digits = "23456789";
    const specials = "@#$%&*";
    const all = uppercase + lowercase + digits + specials;
    
    const chars = [
      uppercase[Math.floor(Math.random() * uppercase.length)],
      lowercase[Math.floor(Math.random() * lowercase.length)],
      digits[Math.floor(Math.random() * digits.length)],
      specials[Math.floor(Math.random() * specials.length)],
    ];
    for (let i = 0; i < length - 4; i++) {
      chars.push(all[Math.floor(Math.random() * all.length)]);
    }
    return chars.sort(() => Math.random() - 0.5).join('');
  };

  // Handle single user creation
  const handleOpenSingleModal = () => {
    const nextIndex = adminUsers.length + 1;
    const defaultUname = `doi_thi_${String(nextIndex).padStart(2, '0')}`;
    setSingleUsername(defaultUname);
    setSinglePassword(generateClientPassword(8));
    setSingleFullName(`Đội thi ${String(nextIndex).padStart(2, '0')}`);
    setSingleTeamName(`Đội thi ${String(nextIndex).padStart(2, '0')}`);
    setSingleEmail(`${defaultUname}@olpai.kma.edu.vn`);
    setSingleRole('user');
    setSingleError(null);
    setIsSingleModalOpen(true);
  };

  const handleCreateSingleUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleUsername.trim()) return;

    try {
      setIsSingleCreating(true);
      setSingleError(null);
      await createAdminUser({
        username: singleUsername.trim(),
        password: singlePassword.trim() || undefined,
        full_name: singleFullName.trim() || undefined,
        team_name: singleTeamName.trim() || undefined,
        email: singleEmail.trim() || undefined,
        role: singleRole,
      });

      setIsSingleModalOpen(false);
      await loadAdminUsers();
      await loadOverview();
      if (onUsersUpdated) onUsersUpdated();
    } catch (err: any) {
      setSingleError(err.message || 'Không thể tạo tài khoản');
    } finally {
      setIsSingleCreating(false);
    }
  };

  // Handle batch user creation
  const handleBatchCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsBatchCreating(true);
      setBatchError(null);

      const res = await batchCreateAdminUsers({
        prefix: batchPrefix,
        count: Number(batchCount),
        start_index: Number(batchStartIndex),
        padding_digits: Number(batchPadding),
        team_prefix: batchTeamPrefix,
        email_domain: batchEmailDomain,
        role: batchRole,
        password_length: Number(batchPasswordLength),
        custom_password: !batchUseRandomPassword && batchCustomPassword.trim() ? batchCustomPassword.trim() : undefined,
      });

      setBatchResult(res);
      await loadAdminUsers();
      await loadOverview();
      if (onUsersUpdated) onUsersUpdated();
    } catch (err: any) {
      setBatchError(err.message || 'Không thể tạo hàng loạt tài khoản');
    } finally {
      setIsBatchCreating(false);
    }
  };

  // Handle password reset for user
  const handleResetPassword = async (user: User) => {
    if (!confirm(`Xác nhận đặt lại mật khẩu ngẫu nhiên cho tài khoản "${user.username}"?`)) return;

    try {
      const res = await resetAdminUserPassword(user.id, 8);
      alert(`Đã đặt lại mật khẩu thành công!\n\nTài khoản: ${res.username}\nMật khẩu mới: ${res.new_password}`);
      loadAdminUsers();
    } catch (err: any) {
      alert(`Lỗi: ${err.message || 'Không thể đặt lại mật khẩu'}`);
    }
  };

  // Handle edit user
  const handleOpenEditModal = (user: User) => {
    setEditingUser(user);
    setEditFullName(user.full_name || '');
    setEditTeamName(user.team_name || '');
    setEditEmail(user.email || '');
    setEditRole(user.role);
    setEditPassword('');
    setEditError(null);
    setIsEditModalOpen(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      setIsEditing(true);
      setEditError(null);
      await updateAdminUser(editingUser.id, {
        full_name: editFullName.trim(),
        team_name: editTeamName.trim(),
        email: editEmail.trim(),
        role: editRole,
        password: editPassword.trim() || undefined,
      });

      setIsEditModalOpen(false);
      setEditingUser(null);
      await loadAdminUsers();
      if (onUsersUpdated) onUsersUpdated();
    } catch (err: any) {
      setEditError(err.message || 'Không thể cập nhật thông tin tài khoản');
    } finally {
      setIsEditing(false);
    }
  };

  // Handle delete user
  const handleDeleteUser = async () => {
    if (!deleteConfirmUser) return;
    try {
      await deleteAdminUser(deleteConfirmUser.id);
      setDeleteConfirmUser(null);
      await loadAdminUsers();
      await loadOverview();
      if (onUsersUpdated) onUsersUpdated();
    } catch (err: any) {
      alert(`Lỗi khi xóa: ${err.message || 'Không thể xóa tài khoản'}`);
    }
  };

  // Export batch list to txt client-side
  const downloadBatchTxt = () => {
    if (!batchResult || !batchResult.users) return;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const nowStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    // Lọc danh sách thí sinh
    const contestantUsers = batchResult.users.filter((u) => u.role === 'user');
    const listToExport = contestantUsers.length > 0 ? contestantUsers : batchResult.users;

    let content = `Thời gian xuất : ${nowStr}\n`;
    content += ` Tổng số tài khoản: ${listToExport.length}\n`;
    content += `Danh sách tài khoản:\n`;

    listToExport.forEach((u) => {
      content += `${u.username}\n`;
      content += `${u.password || ''}\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `danh_sach_thi_sinh_${new Date().getTime()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Filtered users for table
  const filteredUsers = adminUsers.filter((u) => {
    if (userRoleFilter !== 'all' && u.role !== userRoleFilter) return false;
    if (!userSearchQuery.trim()) return true;
    const q = userSearchQuery.toLowerCase();
    return (
      (u.username && u.username.toLowerCase().includes(q)) ||
      (u.full_name && u.full_name.toLowerCase().includes(q)) ||
      (u.team_name && u.team_name.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q))
    );
  });

  // Submissions helpers
  const filteredSubmissions = validSubmissions.filter((sub) => {
    if (submissionTypeFilter !== 'all' && sub.submission_type !== submissionTypeFilter) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (sub.user_name && sub.user_name.toLowerCase().includes(q)) ||
      (sub.username && sub.username.toLowerCase().includes(q)) ||
      (sub.team_name && sub.team_name.toLowerCase().includes(q)) ||
      (sub.problem_code && sub.problem_code.toLowerCase().includes(q)) ||
      (sub.problem_title && sub.problem_title.toLowerCase().includes(q))
    );
  });

  const getZipUrl = () => {
    const apiMode = submissionsMode === 'best_per_user' ? 'best_per_user' : 'all';
    const pId = (submissionsMode === 'by_problem' || submissionsMode === 'best_per_user') ? selectedProblemId : undefined;
    const uId = (submissionsMode === 'by_user') ? selectedUserId : undefined;

    return getSubmissionsExportZipUrl({
      problemId: pId,
      userId: uId,
      submissionType: submissionTypeFilter,
      mode: apiMode,
    });
  };

  const filesAvailableCount = filteredSubmissions.filter(s => s.file_exists).length;

  return (
    <div className="space-y-3 pr-20 sm:pr-28 xl:pr-48">
      {/* Admin Header */}
      <div className="pb-2 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <h2 className="text-xl xl:text-2xl font-black text-slate-900 tracking-tight">
            Bảng Quản Trị Hệ Thống OLP AI KMA 2026
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Khu vực Quản trị viên (Admin Panel)</span>
          </span>
        </div>
      </div>

      {/* Fixed statistics rail, independent of page and list scrolling. */}
      <aside aria-label="Thống kê hệ thống" className="fixed right-0 top-36 z-30 max-h-[calc(100dvh-10rem)] w-16 overflow-y-auto overscroll-contain rounded-l-2xl border border-r-0 border-slate-200 bg-white shadow-sm sm:w-24 lg:top-24 lg:max-h-[calc(100dvh-7rem)] xl:w-44">
        <dl className="divide-y divide-slate-100">
          <div className="p-2 xl:p-4">
            <dt className="text-[9px] font-bold leading-tight text-slate-500 sm:text-[10px] xl:text-xs">
              Tổng số tài khoản
            </dt>
            <dd className="mt-1 text-lg font-black tabular-nums text-slate-900 xl:text-2xl">{stats?.total_users ?? adminUsers.length}</dd>
            <dd className="mt-1 hidden text-[10px] text-slate-400 xl:block">Gồm thí sinh & ban tổ chức</dd>
          </div>
          <div className="p-2 xl:p-4">
            <dt className="text-[9px] font-bold leading-tight text-slate-500 sm:text-[10px] xl:text-xs">
              Đề bài đang mở
            </dt>
            <dd className="mt-1 text-lg font-black tabular-nums text-slate-900 xl:text-2xl">{stats?.total_problems ?? '—'}</dd>
            <dd className="mt-1 hidden text-[10px] text-slate-400 xl:block">Được cập nhật tự động</dd>
          </div>
          <div className="p-2 xl:p-4">
            <dt className="text-[9px] font-bold leading-tight text-slate-500 sm:text-[10px] xl:text-xs">
              Bài nộp hợp lệ
            </dt>
            <dd className="mt-1 flex flex-wrap items-baseline gap-x-1 text-lg font-black tabular-nums text-slate-900 xl:text-2xl">
              <span>{stats?.valid_submissions ?? '—'}</span>
              <span className="text-[10px] font-semibold text-slate-400 xl:text-xs">/ {stats?.total_submissions ?? '—'}</span>
            </dd>
            <dd className="mt-1 hidden text-[10px] text-emerald-600 xl:block">Đã kiểm tra & lưu trữ CSV</dd>
          </div>
          <div className="p-2 xl:p-4">
            <dt className="text-[9px] font-bold leading-tight text-slate-500 sm:text-[10px] xl:text-xs">
              Tập dữ liệu đề thi
            </dt>
            <dd className="mt-1 text-lg font-black tabular-nums text-slate-900 xl:text-2xl">{stats?.total_datasets ?? '—'}</dd>
            <dd className="mt-1 hidden text-[10px] text-slate-400 xl:block">Train & Public Test</dd>
          </div>
        </dl>
      </aside>

      {/* Sub-navigation Menu for Admin */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-100/90 rounded-2xl border border-slate-200/60 shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveSection('accounts')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSection === 'accounts'
              ? 'bg-white text-blue-700 shadow-xs border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <Users className="w-4 h-4 text-blue-600" />
          <span>Quản lý Tài Khoản & Mật Khẩu</span>
          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">
            {adminUsers.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('submissions')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSection === 'submissions'
              ? 'bg-white text-blue-700 shadow-xs border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <span>Kho Lưu Trữ File CSV Bài Nộp</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('monitoring')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSection === 'monitoring'
              ? 'bg-white text-blue-700 shadow-xs border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <Activity className="w-4 h-4 text-blue-600" />
          <span>Giám Sát Nộp Bài</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: QUẢN LÝ TÀI KHOẢN & MẬT KHẨU (ACCOUNT MANAGEMENT) */}
      {/* ========================================================================= */}
      {activeSection === 'accounts' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-xs space-y-6">
          {/* Section Header */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              {/* <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold mb-1">
                <KeyRound className="w-4 h-4 text-blue-600" />
                <span>Danh mục tài khoản đội thi (Contestant Credentials)</span>
              </div> */}
              <h3 className="text-xl font-black text-slate-900 tracking-tight">
                Danh Sách Tài Khoản & Mật Khẩu Đội Thi
              </h3>
              {/* <p className="text-xs text-slate-500 mt-0.5">
                Xem toàn bộ thông tin đăng nhập, sao chép mật khẩu, tạo hàng loạt tài khoản tự động tăng dần hoặc tải danh sách về định dạng file txt.
              </p> */}
            </div>

            {/* Actions: Download TXT, Batch Create, Add Single */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Tải TXT */}
              <a
                href={getUsersExportTxtUrl('user')}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer active:scale-95"
                title="Tải về file TXT danh sách tài khoản thí sinh và mật khẩu"
              >
                <Download className="w-4 h-4" />
                <span>Tải danh sách (.txt)</span>
              </a>

              {/* Tạo hàng loạt */}
              <button
                type="button"
                onClick={() => {
                  setBatchError(null);
                  setBatchResult(null);
                  setIsBatchModalOpen(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer active:scale-95"
              >
                <Sparkles className="w-4 h-4" />
                <span>Tạo hàng loạt</span>
              </button>

              {/* Thêm 1 tài khoản */}
              <button
                type="button"
                onClick={handleOpenSingleModal}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs transition-all cursor-pointer active:scale-95"
              >
                <UserPlus className="w-4 h-4" />
                <span>Thêm 1 tài khoản</span>
              </button>

              {/* Refresh button */}
              <button
                type="button"
                onClick={() => {
                  loadAdminUsers();
                  loadOverview();
                }}
                disabled={loadingUsers}
                className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-all cursor-pointer"
                title="Làm mới danh sách"
              >
                <RefreshCw className={`w-4 h-4 ${loadingUsers ? 'animate-spin text-blue-600' : ''}`} />
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Tìm theo tên đăng nhập, tên đội, họ tên, email..."
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 bg-slate-50/50"
              />
              {userSearchQuery && (
                <button
                  onClick={() => setUserSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Role filter buttons */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setUserRoleFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    userRoleFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tất cả ({adminUsers.length})
                </button>
                <button
                  type="button"
                  onClick={() => setUserRoleFilter('user')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    userRoleFilter === 'user'
                      ? 'bg-white text-blue-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Thí sinh ({adminUsers.filter((u) => u.role === 'user').length})
                </button>
                <button
                  type="button"
                  onClick={() => setUserRoleFilter('admin')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    userRoleFilter === 'admin'
                      ? 'bg-white text-red-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Ban tổ chức ({adminUsers.filter((u) => u.role === 'admin').length})
                </button>
              </div>

              {/* Show/Hide all passwords toggle */}
              <button
                type="button"
                onClick={() => setShowAllPasswords(!showAllPasswords)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  showAllPasswords
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
                title={showAllPasswords ? 'Ẩn tất cả mật khẩu' : 'Hiện tất cả mật khẩu'}
              >
                {showAllPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showAllPasswords ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}</span>
              </button>
            </div>
          </div>

          {/* Accounts Table */}
          <div role="region" aria-label="Danh sách tài khoản" tabIndex={0} className="max-h-[60vh] overflow-auto overscroll-contain rounded-2xl border border-slate-200 shadow-xs focus-visible:outline-2 focus-visible:outline-blue-500">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4 w-12 text-center">#STT</th>
                  <th className="py-3 px-4">Tên đăng nhập (Username)</th>
                  <th className="py-3 px-4">Mật khẩu dự thi</th>
                  <th className="py-3 px-4">Đội thi / Họ tên</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4 text-center">Vai trò</th>
                  <th className="py-3 px-4 text-center">Số bài nộp</th>
                  <th className="py-3 px-4 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loadingUsers ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
                      <span>Đang nạp danh sách tài khoản...</span>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      <span>Không tìm thấy tài khoản nào phù hợp</span>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user, idx) => {
                    const isPasswordVisible = showAllPasswords || Boolean(visiblePasswords[user.id]);
                    const isCopiedUname = copiedId === `uname-${user.id}`;
                    const isCopiedPwd = copiedId === `pwd-${user.id}`;

                    return (
                      <tr key={user.id} className="hover:bg-blue-50/30 transition-colors">
                        {/* STT */}
                        <td className="py-3 px-4 text-center font-mono text-slate-400 font-bold">
                          {idx + 1}
                        </td>

                        {/* Username + Copy */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200/80">
                              {user.username}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(user.username, `uname-${user.id}`)}
                              className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition-all cursor-pointer"
                              title="Sao chép tên đăng nhập"
                            >
                              {isCopiedUname ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>

                        {/* Password + Show/Hide + Copy */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-blue-800 bg-blue-50/70 border border-blue-200/60 px-2.5 py-1 rounded-lg">
                              {isPasswordVisible ? (user.password || '—') : '••••••••'}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setVisiblePasswords((prev) => ({
                                  ...prev,
                                  [user.id]: !prev[user.id],
                                }));
                              }}
                              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
                              title={isPasswordVisible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                            >
                              {isPasswordVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(user.password || '', `pwd-${user.id}`)}
                              className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition-all cursor-pointer"
                              title="Sao chép mật khẩu"
                            >
                              {isCopiedPwd ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>

                        {/* Full Name & Team */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-800">
                            {user.team_name || user.full_name}
                          </div>
                          {user.team_name && user.full_name !== user.team_name && (
                            <div className="text-[11px] text-slate-400">
                              {user.full_name}
                            </div>
                          )}
                        </td>

                        {/* Email */}
                        <td className="py-3 px-4 text-slate-600 text-xs">
                          {user.email}
                        </td>

                        {/* Role Badge */}
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            user.role === 'admin'
                              ? 'bg-red-100 text-red-700 border border-red-200'
                              : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          }`}>
                            {user.role === 'admin' ? 'Ban Tổ Chức' : 'Thí sinh'}
                          </span>
                        </td>

                        {/* Submissions Count */}
                        <td className="py-3 px-4 text-center">
                          <span className="font-mono font-bold text-slate-700 px-2 py-0.5 bg-slate-100 rounded-md">
                            {user.submissions_count ?? 0}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {/* Reset Password */}
                            <button
                              type="button"
                              onClick={() => handleResetPassword(user)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all cursor-pointer"
                              title="Sinh ngẫu nhiên mật khẩu mới"
                            >
                              <Dices className="w-4 h-4" />
                            </button>

                            {/* Edit */}
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(user)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-all cursor-pointer"
                              title="Chỉnh sửa thông tin tài khoản"
                            >
                              <Edit className="w-4 h-4" />
                            </button>

                            {/* Delete */}
                            {user.username !== 'admin' ? (
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmUser(user)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer"
                                title="Xóa tài khoản"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            ) : (
                              <span className="w-7 inline-block text-[10px] text-slate-300 select-none">
                                Khóa
                              </span>
                            )}
                          </div>
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

      {/* ========================================================================= */}
      {/* SECTION 2: KHO FILE CSV BÀI NỘP HỢP LỆ (SUBMISSIONS CSV REPOSITORY) */}
      {/* ========================================================================= */}
      {activeSection === 'submissions' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-xs space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              {/* <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold mb-1">
                <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                <span>Kho lưu trữ bài nộp hợp lệ (Submissions CSV Repository)</span>
              </div> */}
              <h3 className="text-xl font-black text-slate-900 tracking-tight">
                Danh Sách & Tải Về File CSV Bài Nộp Của Thí Sinh
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Hệ thống tự động lưu trữ các file CSV đã qua kiểm tra hợp lệ. Xem và tải về theo cuộc thi, theo thí sinh, hoặc bài điểm cao nhất.
              </p>
            </div>

            {/* Action: Export ZIP */}
            <div className="flex items-center gap-2">
              <a
                href={getZipUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs shadow-xs transition-all ${
                  filteredSubmissions.length > 0
                    ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer active:scale-95'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed pointer-events-none'
                }`}
              >
                <FolderArchive className="w-4 h-4" />
                <span>Tải toàn bộ (.ZIP)</span>
                {filteredSubmissions.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-md bg-blue-500 text-white text-[10px]">
                    {filesAvailableCount} files
                  </span>
                )}
              </a>

              <button
                onClick={() => {
                  loadValidSubmissions();
                  loadOverview();
                }}
                disabled={loadingSubs}
                className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-all cursor-pointer"
                title="Làm mới danh sách"
              >
                <RefreshCw className={`w-4 h-4 ${loadingSubs ? 'animate-spin text-blue-600' : ''}`} />
              </button>
            </div>
          </div>

          {/* View Mode Tabs */}
          <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-100 rounded-2xl">
            <button
              type="button"
              onClick={() => setSubmissionsMode('best_per_user')}
              className={`flex-1 min-w-[200px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                submissionsMode === 'best_per_user'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>Mỗi thí sinh 1 bài điểm cao nhất</span>
            </button>

            <button
              type="button"
              onClick={() => setSubmissionsMode('by_problem')}
              className={`flex-1 min-w-[200px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                submissionsMode === 'by_problem'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <FileCode2 className="w-4 h-4 text-indigo-500" />
              <span>Theo cuộc thi / Đề bài</span>
            </button>

            <button
              type="button"
              onClick={() => setSubmissionsMode('by_user')}
              className={`flex-1 min-w-[200px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                submissionsMode === 'by_user'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Users className="w-4 h-4 text-emerald-500" />
              <span>Theo thí sinh</span>
            </button>
          </div>

          {/* Filters Bar: Vòng thi (Public / Private), Cuộc thi / Thí sinh, Ô tìm kiếm */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 p-3 bg-slate-50/90 rounded-2xl border border-slate-200/80">
            {/* Vòng thi filter (All, Public, Private) */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-600">Vòng thi:</span>
              <div className="flex items-center gap-1 p-1 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setSubmissionTypeFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    submissionTypeFilter === 'all'
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  Tất cả các vòng
                </button>

                <button
                  type="button"
                  onClick={() => setSubmissionTypeFilter('public')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    submissionTypeFilter === 'public'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${submissionTypeFilter === 'public' ? 'bg-white' : 'bg-emerald-500'}`} />
                  <span>Vòng Public</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSubmissionTypeFilter('private')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    submissionTypeFilter === 'private'
                      ? 'bg-purple-600 text-white shadow-2xs'
                      : 'text-purple-700 hover:bg-purple-50'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${submissionTypeFilter === 'private' ? 'bg-white' : 'bg-purple-500'}`} />
                  <span>Vòng Private</span>
                </button>
              </div>
            </div>

            {/* Context Selectors & Search */}
            <div className="flex flex-wrap items-center gap-2">
              {(submissionsMode === 'by_problem' || submissionsMode === 'best_per_user') && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-500">Đề bài:</span>
                  <select
                    value={selectedProblemId || ''}
                    onChange={(e) => setSelectedProblemId(e.target.value ? Number(e.target.value) : undefined)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-blue-500 focus:outline-hidden"
                  >
                    <option value="">Tất cả đề bài</option>
                    {problemsList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {submissionsMode === 'by_user' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-500">Thí sinh:</span>
                  <select
                    value={selectedUserId || ''}
                    onChange={(e) => setSelectedUserId(e.target.value ? Number(e.target.value) : undefined)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-blue-500 focus:outline-hidden"
                  >
                    <option value="">Tất cả thí sinh</option>
                    {usersList.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.username} — {u.full_name || u.team_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Search input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Tìm thí sinh, mã đề..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-blue-500 focus:outline-hidden w-40 sm:w-48"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Submissions Table */}
          <div role="region" aria-label="Danh sách file bài nộp" tabIndex={0} className="max-h-[60vh] overflow-auto overscroll-contain rounded-2xl border border-slate-200 shadow-xs focus-visible:outline-2 focus-visible:outline-blue-500">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4 w-14 text-center">#STT</th>
                  <th className="py-3 px-4">Thí sinh / Đội thi</th>
                  <th className="py-3 px-4">Đề bài</th>
                  <th className="py-3 px-4">Vòng thi</th>
                  <th className="py-3 px-4 text-right">Điểm / 100</th>
                  <th className="py-3 px-4">Thời gian nộp</th>
                  <th className="py-3 px-4">Trạng thái file</th>
                  <th className="py-3 px-4 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loadingSubs ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
                      <span>Đang nạp danh sách bài nộp...</span>
                    </td>
                  </tr>
                ) : filteredSubmissions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <FileSpreadsheet className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      <span>Không có bài nộp hợp lệ nào</span>
                    </td>
                  </tr>
                ) : (
                  filteredSubmissions.map((sub, idx) => (
                    <tr key={sub.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="py-3 px-4 text-center font-mono text-slate-400 font-bold">
                        {sub.rank ? `TOP ${sub.rank}` : idx + 1}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-800">{sub.user_name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">@{sub.username}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-700 font-bold text-[10px] mr-1.5">
                          {sub.problem_code}
                        </span>
                        <span className="text-slate-700 font-medium">{sub.problem_title}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] uppercase ${
                          sub.submission_type === 'private' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {sub.submission_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black text-sm text-blue-700">
                        {formatScore(sub.score, sub)}
                      </td>
                      <td className="py-3 px-4 text-[11px] text-slate-500 whitespace-nowrap">
                        {sub.created_at ? new Date(sub.created_at).toLocaleString('vi-VN') : '—'}
                      </td>
                      <td className="py-3 px-4">
                        {sub.file_exists ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            <CheckCircle className="w-3 h-3 text-emerald-600" />
                            <span>{sub.file_size_str || 'Sẵn sàng'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md">
                            <AlertCircle className="w-3 h-3 text-slate-400" />
                            <span>Chưa lưu đĩa</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {sub.file_exists ? (
                          <a
                            href={getSubmissionDownloadUrl(sub.id)}
                            download
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white font-bold text-[11px] border border-blue-200 hover:border-transparent transition-all cursor-pointer shadow-2xs"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Tải CSV</span>
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-300 italic">Không khả dụng</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 3: GIÁM SÁT NỘP BÀI (SYSTEM FEED) */}
      {/* ========================================================================= */}
      {activeSection === 'monitoring' && (
        <div className="space-y-6">
          {/* Live Submissions Feed */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-xs">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-6">
              <Activity className="w-5 h-5 text-blue-600" />
              <span>Nhật ký nộp bài gần đây của toàn hệ thống</span>
              <span className="ml-auto shrink-0 text-xs font-semibold text-slate-500">Điểm / 100</span>
            </h3>

            <div role="region" aria-label="Nhật ký nộp bài" tabIndex={0} className="max-h-[60vh] overflow-y-auto overscroll-contain space-y-3 pr-2 focus-visible:outline-2 focus-visible:outline-blue-500">
              {recentSubs.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  Chưa có dữ liệu nộp bài
                </div>
              ) : (
                recentSubs.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-800 flex items-center gap-2">
                        <span>{item.user}</span>
                        <span className="px-2 py-0.2 bg-blue-100 text-blue-700 rounded font-semibold text-[10px]">
                          {item.problem}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {new Date(item.time).toLocaleString('vi-VN')}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="font-mono font-bold text-sm text-red-600">
                        {formatScore(item.score, item)}
                      </span>
                      <span className="block text-[10px] text-emerald-600 font-semibold">
                        {item.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: TẠO HÀNG LOẠT TÀI KHOẢN (BATCH CREATION MODAL) */}
      {/* ========================================================================= */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 md:p-8 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">
                    Tạo Hàng Loạt Tài Khoản Tự Động
                  </h3>
                  <p className="text-xs text-slate-500">
                    Tạo danh sách tài khoản theo mẫu tăng dần (VD: doi_thi_01, doi_thi_02...)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBatchModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* If Batch Result Success */}
            {batchResult ? (
              <div className="mt-6 space-y-6">
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
                  <div className="flex items-center gap-2 font-bold text-sm text-emerald-900 mb-1">
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                    <span>Tạo thành công {batchResult.created_count} tài khoản mới!</span>
                  </div>
                  <p>
                    Hệ thống đã sinh tài khoản và mật khẩu ngẫu nhiên cho từng đội thi. Bạn có thể tải ngay file danh sách TXT hoặc sao chép vào bộ nhớ đệm.
                  </p>
                  {batchResult.skipped_count > 0 && (
                    <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                      Bỏ qua {batchResult.skipped_count} tài khoản do đã tồn tại tên đăng nhập hoặc email ({batchResult.skipped_usernames.join(', ')}).
                    </div>
                  )}
                </div>

                {/* Actions for Batch Result */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={downloadBatchTxt}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Tải danh sách này (.TXT)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const text = batchResult.users
                        .map((u) => `${u.username}\t${u.password}\t${u.team_name}\t${u.email}`)
                        .join('\n');
                      copyToClipboard(text, 'batch-all');
                    }}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all cursor-pointer"
                  >
                    {copiedId === 'batch-all' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedId === 'batch-all' ? 'Đã sao chép!' : 'Sao chép toàn bộ'}</span>
                  </button>
                </div>

                {/* Newly Created Accounts List */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase sticky top-0">
                      <tr className="border-b border-slate-200">
                        <th className="py-2.5 px-3">Tên đăng nhập</th>
                        <th className="py-2.5 px-3">Mật khẩu</th>
                        <th className="py-2.5 px-3">Tên đội</th>
                        <th className="py-2.5 px-3">Email</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {batchResult.users.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50 font-mono">
                          <td className="py-2 px-3 font-bold text-slate-900">{u.username}</td>
                          <td className="py-2 px-3 font-bold text-blue-600">{u.password}</td>
                          <td className="py-2 px-3 font-sans text-slate-700">{u.team_name}</td>
                          <td className="py-2 px-3 text-slate-500">{u.email}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsBatchModalOpen(false);
                      setBatchResult(null);
                    }}
                    className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs"
                  >
                    Hoàn tất & Đóng
                  </button>
                </div>
              </div>
            ) : (
              /* Batch Creation Form */
              <form onSubmit={handleBatchCreate} className="mt-6 space-y-4">
                {batchError && (
                  <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs border border-red-200">
                    {batchError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Prefix */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Tiền tố tên đăng nhập (Prefix):
                    </label>
                    <input
                      type="text"
                      placeholder="VD: doi_thi_"
                      value={batchPrefix}
                      onChange={(e) => setBatchPrefix(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden"
                      required
                    />
                    <p className="text-[10px] text-slate-400 mt-1">VD: "doi_thi_" sẽ tạo doi_thi_01, doi_thi_02...</p>
                  </div>

                  {/* Count */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Số lượng tài khoản cần tạo:
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={batchCount}
                      onChange={(e) => setBatchCount(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden"
                      required
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Từ 1 đến 200 tài khoản trong 1 lần</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Start Index */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Số thứ tự bắt đầu:
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={batchStartIndex}
                      onChange={(e) => setBatchStartIndex(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden"
                      required
                    />
                  </div>

                  {/* Padding digits */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Số chữ số đệm (Padding):
                    </label>
                    <select
                      value={batchPadding}
                      onChange={(e) => setBatchPadding(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden bg-white"
                    >
                      <option value={1}>1 chữ số (1, 2, 3...)</option>
                      <option value={2}>2 chữ số (01, 02, 03...)</option>
                      <option value={3}>3 chữ số (001, 002...)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Team Prefix */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Tên đội thi mặc định:
                    </label>
                    <input
                      type="text"
                      placeholder="VD: Đội thi"
                      value={batchTeamPrefix}
                      onChange={(e) => setBatchTeamPrefix(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden"
                    />
                  </div>

                  {/* Domain */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Tên miền Email:
                    </label>
                    <input
                      type="text"
                      placeholder="olpai.kma.edu.vn"
                      value={batchEmailDomain}
                      onChange={(e) => setBatchEmailDomain(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Password Configuration */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <KeyRound className="w-4 h-4 text-blue-600" />
                      <span>Cấu hình Mật khẩu:</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setBatchUseRandomPassword(true)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                          batchUseRandomPassword
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-white text-slate-600 border border-slate-200'
                        }`}
                      >
                        Sinh ngẫu nhiên (An toàn)
                      </button>
                      <button
                        type="button"
                        onClick={() => setBatchUseRandomPassword(false)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                          !batchUseRandomPassword
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-white text-slate-600 border border-slate-200'
                        }`}
                      >
                        Mật khẩu cố định chung
                      </button>
                    </div>
                  </div>

                  {batchUseRandomPassword ? (
                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                        <span>Độ dài mật khẩu ngẫu nhiên:</span>
                        <span className="font-mono font-bold text-blue-600">{batchPasswordLength} ký tự</span>
                      </div>
                      <input
                        type="range"
                        min={6}
                        max={16}
                        value={batchPasswordLength}
                        onChange={(e) => setBatchPasswordLength(Number(e.target.value))}
                        className="w-full accent-blue-600"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        Tự động sinh chuỗi ký tự an toàn gồm chữ hoa, chữ thường, số và ký tự đặc biệt, tránh nhầm lẫn thị giác.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <input
                        type="text"
                        placeholder="Nhập mật khẩu chung cho tất cả tài khoản..."
                        value={batchCustomPassword}
                        onChange={(e) => setBatchCustomPassword(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden bg-white"
                        required={!batchUseRandomPassword}
                      />
                    </div>
                  )}
                </div>

                {/* Preview Box */}
                <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-200/80 text-xs">
                  <div className="font-bold text-blue-950 mb-1.5 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-blue-600" />
                    <span>Xem trước các mẫu tài khoản sẽ tạo ({batchCount} tài khoản):</span>
                  </div>
                  <div className="font-mono text-[11px] text-blue-800 space-y-0.5">
                    <div>
                      1. {batchPrefix}{String(batchStartIndex).padStart(batchPadding, '0')} — {batchTeamPrefix} {String(batchStartIndex).padStart(batchPadding, '0')} ({batchPrefix}{String(batchStartIndex).padStart(batchPadding, '0')}@{batchEmailDomain})
                    </div>
                    {batchCount > 1 && (
                      <div>
                        2. {batchPrefix}{String(batchStartIndex + 1).padStart(batchPadding, '0')} — {batchTeamPrefix} {String(batchStartIndex + 1).padStart(batchPadding, '0')}
                      </div>
                    )}
                    {batchCount > 3 && <div className="text-slate-400">...</div>}
                    {batchCount > 2 && (
                      <div>
                        {batchCount}. {batchPrefix}{String(batchStartIndex + batchCount - 1).padStart(batchPadding, '0')} — {batchTeamPrefix} {String(batchStartIndex + batchCount - 1).padStart(batchPadding, '0')}
                      </div>
                    )}
                  </div>
                </div>

                {/* Submit button */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsBatchModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs"
                  >
                    Hủy bỏ
                  </button>

                  <button
                    type="submit"
                    disabled={isBatchCreating}
                    className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-2"
                  >
                    {isBatchCreating ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Đang tạo {batchCount} tài khoản...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Xác nhận tạo hàng loạt</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: THÊM 1 TÀI KHOẢN ĐƠN LẺ (SINGLE CREATE MODAL) */}
      {/* ========================================================================= */}
      {isSingleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-800 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">
                    Thêm Tài Khoản Mới
                  </h3>
                  <p className="text-xs text-slate-500">
                    Nhập thông tin hoặc tự động sinh ngẫu nhiên mật khẩu
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSingleModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSingleUser} className="mt-6 space-y-4">
              {singleError && (
                <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs border border-red-200">
                  {singleError}
                </div>
              )}

              {/* Username */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tên đăng nhập (Username): <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="VD: doi_thi_01"
                  value={singleUsername}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSingleUsername(val);
                    if (!singleEmail || singleEmail.endsWith('@olpai.kma.edu.vn')) {
                      setSingleEmail(`${val}@olpai.kma.edu.vn`);
                    }
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden font-mono"
                  required
                />
              </div>

              {/* Password with generator button */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Mật khẩu:</span>
                  <button
                    type="button"
                    onClick={() => setSinglePassword(generateClientPassword(8))}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                  >
                    <Dices className="w-3.5 h-3.5" />
                    <span>Sinh ngẫu nhiên</span>
                  </button>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Mật khẩu tài khoản..."
                    value={singlePassword}
                    onChange={(e) => setSinglePassword(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden font-mono font-bold text-blue-700"
                    required
                  />
                </div>
              </div>

              {/* Full Name & Team Name */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tên Đội thi:
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Đội thi 01"
                    value={singleTeamName}
                    onChange={(e) => setSingleTeamName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Họ và tên thí sinh:
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Nguyễn Văn A..."
                    value={singleFullName}
                    onChange={(e) => setSingleFullName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Email:
                </label>
                <input
                  type="email"
                  placeholder="doi_thi_01@olpai.kma.edu.vn"
                  value={singleEmail}
                  onChange={(e) => setSingleEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Vai trò (Quyền hạn):
                </label>
                <select
                  value={singleRole}
                  onChange={(e) => setSingleRole(e.target.value as 'user' | 'admin')}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden bg-white"
                >
                  <option value="user">Thí sinh dự thi (User)</option>
                  <option value="admin">Ban Tổ Chức (Admin)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSingleModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSingleCreating}
                  className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                >
                  {isSingleCreating ? 'Đang tạo...' : 'Tạo tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: SỬA TÀI KHOẢN (EDIT MODAL) */}
      {/* ========================================================================= */}
      {isEditModalOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Edit className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">
                    Chỉnh Sửa Tài Khoản
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    @{editingUser.username}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="mt-6 space-y-4">
              {editError && (
                <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs border border-red-200">
                  {editError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Đội thi:
                </label>
                <input
                  type="text"
                  value={editTeamName}
                  onChange={(e) => setEditTeamName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Họ và tên thí sinh:
                </label>
                <input
                  type="text"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Email:
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden"
                  required
                />
              </div>

              {/* Password update (optional) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Mật khẩu mới (Để trống nếu giữ nguyên):</span>
                  <button
                    type="button"
                    onClick={() => setEditPassword(generateClientPassword(8))}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                  >
                    <Dices className="w-3.5 h-3.5" />
                    <span>Sinh ngẫu nhiên</span>
                  </button>
                </label>
                <input
                  type="text"
                  placeholder="Nhập mật khẩu mới nếu muốn đổi..."
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden font-mono"
                />
              </div>

              {/* Role */}
              {editingUser.username !== 'admin' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Vai trò:
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as 'user' | 'admin')}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden bg-white"
                  >
                    <option value="user">Thí sinh dự thi (User)</option>
                    <option value="admin">Ban Tổ Chức (Admin)</option>
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isEditing}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                >
                  {isEditing ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: XÁC NHẬN XÓA TÀI KHOẢN (DELETE CONFIRM MODAL) */}
      {/* ========================================================================= */}
      {deleteConfirmUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 md:p-8 shadow-2xl border border-slate-200 text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-slate-900 mb-1">
              Xác Nhận Xóa Tài Khoản?
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Bạn có chắc chắn muốn xóa tài khoản <span className="font-mono font-bold text-slate-800">@{deleteConfirmUser.username}</span> ({deleteConfirmUser.full_name})? Toàn bộ bài nộp của tài khoản này sẽ bị xóa khỏi hệ thống.
            </p>

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmUser(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                Xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
