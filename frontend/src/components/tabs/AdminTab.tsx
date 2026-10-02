'use client';

import React, { useState, useEffect } from 'react';
import { AdminStats, Problem, User, EvaluatorOption, AdminSubmission } from '@/types';
import { 
  ShieldCheck, 
  Users, 
  FileCode2, 
  UploadCloud, 
  Database, 
  PlusCircle, 
  CheckCircle2,
  Activity,
  Layers,
  Sparkles,
  Cpu,
  Download,
  FolderArchive,
  FileSpreadsheet,
  Trophy,
  Filter,
  RefreshCw,
  Search,
  CheckCircle,
  AlertCircle,
  FileCheck2,
  UserCheck,
  Award
} from 'lucide-react';
import { 
  fetchAdminOverview, 
  fetchEvaluators, 
  fetchProblems, 
  fetchUsers, 
  fetchValidSubmissions,
  getSubmissionDownloadUrl,
  getSubmissionsExportZipUrl
} from '@/lib/api';

interface AdminTabProps {
  onProblemCreated: () => void;
}

export const AdminTab: React.FC<AdminTabProps> = ({ onProblemCreated }) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentSubs, setRecentSubs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [evaluators, setEvaluators] = useState<EvaluatorOption[]>([]);

  // Submissions management state
  const [submissionsMode, setSubmissionsMode] = useState<'best_per_user' | 'by_problem' | 'by_user'>('best_per_user');
  const [selectedProblemId, setSelectedProblemId] = useState<number | undefined>(undefined);
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [validSubmissions, setValidSubmissions] = useState<AdminSubmission[]>([]);
  const [loadingSubs, setLoadingSubs] = useState<boolean>(false);
  const [problemsList, setProblemsList] = useState<Problem[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);

  // New problem form state
  const [newCode, setNewCode] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newMetric, setNewMetric] = useState('mAP');
  const [newCategory, setNewCategory] = useState<'CV' | 'NLP'>('CV');
  const [newEvalConfig, setNewEvalConfig] = useState('eval_1_cv_hico');
  const [isCreating, setIsCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  const loadData = async () => {
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

  const loadValidSubmissions = async () => {
    try {
      setLoadingSubs(true);
      const apiMode = submissionsMode === 'best_per_user' ? 'best_per_user' : 'all';
      const pId = (submissionsMode === 'by_problem' || submissionsMode === 'best_per_user') ? selectedProblemId : undefined;
      const uId = (submissionsMode === 'by_user') ? selectedUserId : undefined;

      const subs = await fetchValidSubmissions({
        problemId: pId,
        userId: uId,
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
    loadData();
    fetchEvaluators().then(setEvaluators).catch(console.error);
    fetchProblems().then(setProblemsList).catch(console.error);
    fetchUsers().then(setUsersList).catch(console.error);
  }, []);

  useEffect(() => {
    loadValidSubmissions();
  }, [submissionsMode, selectedProblemId, selectedUserId]);

  const handleCreateProblem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode || !newTitle || !newDesc) return;

    try {
      setIsCreating(true);
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const formData = new FormData();
      formData.append('code', newCode);
      formData.append('title', newTitle);
      formData.append('category', newCategory);
      formData.append('metric', newMetric);
      formData.append('deadline', '2026-11-30 23:59:59');
      if (newEvalConfig) {
        formData.append('evaluation_config', newEvalConfig);
      }

      const res = await fetch(`${API_BASE}/api/problems`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        setCreateMsg('Đã tạo đề bài mới thành công!');
        setNewCode('');
        setNewTitle('');
        setNewDesc('');
        onProblemCreated();
        loadData();
        fetchProblems().then(setProblemsList).catch(console.error);
      } else {
        setCreateMsg('Lỗi khi tạo đề bài');
      }
    } catch (err) {
      setCreateMsg('Lỗi kết nối tới máy chủ');
    } finally {
      setIsCreating(false);
    }
  };

  const filteredSubmissions = validSubmissions.filter((sub) => {
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
      mode: apiMode,
    });
  };

  const filesAvailableCount = filteredSubmissions.filter(s => s.file_exists).length;
  const maxScore = filteredSubmissions.length > 0 
    ? Math.max(...filteredSubmissions.map(s => s.score ?? 0))
    : 0;

  return (
    <div className="space-y-10">
      {/* Admin Header */}
      <div className="pb-6 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold mb-2">
            <ShieldCheck className="w-4 h-4" />
            <span>Khu vực Quản trị viên (Admin Panel)</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Bảng Điều Khiển & Quản Trị Hệ Thống OLP AI KMA 2026
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Theo dõi hạ tầng chấm thi tự động, quản trị đề thi, lưu trữ file CSV nộp bài và kết quả thí sinh.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span>Hệ thống chấm thi: Sẵn sàng</span>
          </span>
        </div>
      </div>

      {/* Overview Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mb-3">
            <Users className="w-5 h-5" />
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Tổng số thí sinh</div>
          <div className="text-3xl font-black text-slate-900 mt-1">{stats?.total_users ?? '—'}</div>
          <div className="text-[11px] text-slate-500 mt-1">Các lớp AT18, AT19, K18</div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center mb-3">
            <FileCode2 className="w-5 h-5" />
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Đề bài đang mở</div>
          <div className="text-3xl font-black text-slate-900 mt-1">{stats?.total_problems ?? '—'}</div>
          <div className="text-[11px] text-slate-500 mt-1">Được cập nhật tự động</div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center mb-3">
            <UploadCloud className="w-5 h-5" />
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Bài nộp hợp lệ</div>
          <div className="text-3xl font-black text-slate-900 mt-1">
            {stats?.valid_submissions ?? '—'} <span className="text-sm font-semibold text-slate-400">/ {stats?.total_submissions ?? '—'}</span>
          </div>
          <div className="text-[11px] text-emerald-600 font-semibold mt-1">Đã kiểm tra & lưu trữ CSV</div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
            <Database className="w-5 h-5" />
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Tập dữ liệu đề thi</div>
          <div className="text-3xl font-black text-slate-900 mt-1">{stats?.total_datasets ?? '—'}</div>
          <div className="text-[11px] text-slate-500 mt-1">Train & Public Test</div>
        </div>
      </div>

      {/* -------------------------------------------------------------------------- */}
      {/* SECTION: Quản lý & Tải về File CSV Bài Nộp Hợp Lệ Của Thí Sinh */}
      {/* -------------------------------------------------------------------------- */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-xs space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold mb-1">
              <FileSpreadsheet className="w-4 h-4 text-blue-600" />
              <span>Kho lưu trữ bài nộp hợp lệ (Submissions CSV Repository)</span>
            </div>
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
                loadData();
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
            <span>Theo Cuộc thi / Đề bài</span>
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
            <Users className="w-4 h-4 text-purple-500" />
            <span>Theo Thí sinh</span>
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          {/* Contest/Problem Dropdown (if mode is best_per_user or by_problem) */}
          {(submissionsMode === 'best_per_user' || submissionsMode === 'by_problem') && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Lọc theo đề thi:
              </label>
              <select
                value={selectedProblemId || ''}
                onChange={(e) => setSelectedProblemId(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-blue-500 focus:outline-hidden"
              >
                <option value="">-- Tất cả các cuộc thi / đề bài --</option>
                {problemsList.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.code}] {p.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* User Dropdown (if mode is by_user) */}
          {submissionsMode === 'by_user' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Chọn thí sinh:
              </label>
              <select
                value={selectedUserId || ''}
                onChange={(e) => setSelectedUserId(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-blue-500 focus:outline-hidden"
              >
                <option value="">-- Tất cả thí sinh --</option>
                {usersList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} (@{u.username}) {u.team_name ? ` - ${u.team_name}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Search Input */}
          <div className={submissionsMode === 'by_user' ? 'md:col-span-2' : 'md:col-span-2'}>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Tìm kiếm nhanh:
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Tìm theo tên thí sinh, username, đội thi, mã đề..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:border-blue-500 focus:outline-hidden"
              />
            </div>
          </div>
        </div>

        {/* Filter Summary Strip */}
        <div className="flex flex-wrap items-center justify-between text-xs px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 text-slate-600 gap-2">
          <div className="flex items-center gap-4">
            <span>
              Tìm thấy: <strong className="text-slate-900">{filteredSubmissions.length}</strong> bài nộp
            </span>
            <span>
              File có sẵn: <strong className="text-emerald-700">{filesAvailableCount}</strong> / {filteredSubmissions.length}
            </span>
            {maxScore > 0 && (
              <span>
                Điểm cao nhất: <strong className="text-blue-700">{maxScore.toFixed(4)}</strong>
              </span>
            )}
          </div>

          <div className="text-[11px] text-slate-400">
            {submissionsMode === 'best_per_user' && '★ Chế độ lọc bài điểm cao nhất của mỗi thí sinh'}
            {submissionsMode === 'by_problem' && '★ Chế độ xem toàn bộ các bài nộp hợp lệ của đề thi'}
            {submissionsMode === 'by_user' && '★ Chế độ xem bài nộp theo thí sinh được chọn'}
          </div>
        </div>

        {/* Submissions Table */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-100 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200 z-10">
                <tr>
                  <th className="py-3 px-4 w-14">#</th>
                  <th className="py-3 px-4">Thí sinh & Đội thi</th>
                  <th className="py-3 px-4">Đề bài</th>
                  <th className="py-3 px-4">Loại bài</th>
                  <th className="py-3 px-4 text-right">Điểm số</th>
                  <th className="py-3 px-4">Thời gian nộp</th>
                  <th className="py-3 px-4">File máy chủ</th>
                  <th className="py-3 px-4 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loadingSubs ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-500 mb-2" />
                      <p className="font-medium">Đang tải danh sách bài nộp...</p>
                    </td>
                  </tr>
                ) : filteredSubmissions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="font-semibold text-slate-600">Không tìm thấy bài nộp hợp lệ nào</p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Hãy thử thay đổi điều kiện lọc đề thi hoặc thí sinh.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredSubmissions.map((sub, idx) => {
                    const rankNum = sub.rank || idx + 1;
                    const isTop1 = rankNum === 1 && submissionsMode === 'best_per_user';
                    const isTop2 = rankNum === 2 && submissionsMode === 'best_per_user';
                    const isTop3 = rankNum === 3 && submissionsMode === 'best_per_user';

                    return (
                      <tr key={sub.id} className="hover:bg-blue-50/40 transition-colors">
                        {/* Rank / Index */}
                        <td className="py-3 px-4 font-mono font-bold">
                          {isTop1 ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs shadow-xs" title="Hạng 1">
                              🥇
                            </span>
                          ) : isTop2 ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 text-slate-700 text-xs" title="Hạng 2">
                              🥈
                            </span>
                          ) : isTop3 ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-50 text-amber-800 text-xs border border-amber-300" title="Hạng 3">
                              🥉
                            </span>
                          ) : (
                            <span className="text-slate-400 pl-1">{rankNum}</span>
                          )}
                        </td>

                        {/* User & Team */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{sub.user_name || sub.username}</span>
                            <span className="text-[10px] text-slate-400 font-normal">(@{sub.username})</span>
                          </div>
                          {sub.team_name && (
                            <div className="text-[11px] text-blue-600 font-medium mt-0.5">
                              {sub.team_name}
                            </div>
                          )}
                        </td>

                        {/* Problem */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-700 font-bold text-[10px]">
                              {sub.problem_code}
                            </span>
                            <span className="text-slate-700 font-medium truncate max-w-[220px]" title={sub.problem_title}>
                              {sub.problem_title}
                            </span>
                          </div>
                        </td>

                        {/* Submission Type */}
                        <td className="py-3 px-4">
                          <span className={`inline-block px-2 py-0.5 rounded-full font-bold text-[10px] uppercase ${
                            sub.submission_type === 'private'
                              ? 'bg-purple-100 text-purple-700 border border-purple-200'
                              : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          }`}>
                            {sub.submission_type}
                          </span>
                        </td>

                        {/* Score */}
                        <td className="py-3 px-4 text-right">
                          <span className="font-mono font-black text-sm text-blue-700">
                            {sub.score !== null ? Number(sub.score).toFixed(4) : '—'}
                          </span>
                        </td>

                        {/* Time */}
                        <td className="py-3 px-4 text-[11px] text-slate-500 whitespace-nowrap">
                          {sub.created_at ? new Date(sub.created_at).toLocaleString('vi-VN') : '—'}
                        </td>

                        {/* File status */}
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

                        {/* Actions */}
                        <td className="py-3 px-4 text-center">
                          {sub.file_exists ? (
                            <a
                              href={getSubmissionDownloadUrl(sub.id)}
                              download
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white font-bold text-[11px] border border-blue-200 hover:border-transparent transition-all cursor-pointer shadow-2xs"
                              title={`Tải file CSV bài nộp #${sub.id}`}
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Tải CSV</span>
                            </a>
                          ) : (
                            <span className="text-[11px] text-slate-300 italic">
                              Không khả dụng
                            </span>
                          )}
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

      {/* Grid: Create Problem & System Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Form: Add New Problem */}
        <div className="lg:col-span-6 bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-xs">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-6">
            <PlusCircle className="w-5 h-5 text-red-600" />
            <span>Thêm đề bài mới (Khung chức năng Admin)</span>
          </h3>

          <form onSubmit={handleCreateProblem} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Mã đề bài:</span>
                  <span className="text-red-500 font-bold text-[10px] uppercase tracking-wider">(Bắt buộc)</span>
                </label>
                <input
                  type="text"
                  placeholder="VD: AI-04"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phân loại:</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as 'CV' | 'NLP')}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden bg-white"
                >
                  <option value="CV">Computer Vision (CV)</option>
                  <option value="NLP">Xử lý ngôn ngữ (NLP)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tên đề bài:</label>
              <input
                type="text"
                placeholder="VD: Phân tích mã độc Ransomware dựa trên hành vi API Call"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Độ đo đánh giá:</label>
              <input
                type="text"
                placeholder="VD: mAP, Macro F1-Score, AUC-ROC, Accuracy"
                value={newMetric}
                onChange={(e) => setNewMetric(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden"
                required
              />
            </div>

            <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-200/80 space-y-1">
              <label className="block text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-indigo-600" />
                <span>Cấu hình đánh giá (Evaluator Module):</span>
              </label>
              <select
                value={newEvalConfig}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewEvalConfig(val);
                  const found = evaluators.find((ev) => ev.id === val);
                  if (found) setNewMetric(found.metric);
                }}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-indigo-200 bg-white text-slate-800 focus:border-indigo-500 focus:outline-hidden"
              >
                <option value="">-- Chưa cấu hình (Ẩn khỏi nộp bài) --</option>
                {evaluators.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.id} — {ev.name} ({ev.metric})
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-indigo-700 font-medium">
                Chỉ đề có cấu hình đánh giá mới được đưa vào danh sách chọn nộp bài.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Mô tả chi tiết bài toán:</label>
              <textarea
                rows={3}
                placeholder="Nhập yêu cầu bài toán, định dạng file nộp..."
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden"
                required
              />
            </div>

            {createMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-medium">
                {createMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={isCreating}
              className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
            >
              {isCreating ? 'Đang tạo...' : 'Tạo đề bài'}
            </button>
          </form>
        </div>

        {/* Live Submissions Feed */}
        <div className="lg:col-span-6 bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-xs">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-6">
            <Activity className="w-5 h-5 text-blue-600" />
            <span>Nhật ký nộp bài gần đây của toàn hệ thống</span>
          </h3>

          <div className="space-y-3">
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
                      {item.score !== null ? item.score : '—'}
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
    </div>
  );
};
