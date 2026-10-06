'use client';

import React, { useState, useEffect } from 'react';
import { Dataset, Problem, User } from '@/types';
import { 
  Database, 
  Copy, 
  Check, 
  ExternalLink, 
  Plus, 
  Edit2, 
  Trash2, 
  ChevronDown, 
  ChevronUp, 
  Link as LinkIcon, 
  X, 
  Loader2, 
  Search,
  Sparkles,
  Info,
  Lock,
  Unlock,
  Clock
} from 'lucide-react';
import { createDataset, updateDataset, deleteDataset, API_BASE } from '@/lib/api';
import { getItemLockStatus, toDatetimeLocal, toUtcIsoString } from '@/lib/countdown';

interface DatasetsTabProps {
  problems: Problem[];
  datasets: Dataset[];
  currentUser: User | null;
  onRefreshDatasets: () => void;
}

export const DatasetsTab: React.FC<DatasetsTabProps> = ({
  problems,
  datasets,
  currentUser,
  onRefreshDatasets,
}) => {
  // Real-time ticker for 1-second countdown updates
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Track expanded problem blocks. Initialize with all problems open by default for ease of view.
  const [expandedIds, setExpandedIds] = useState<number[]>(() => problems.map((p) => p.id));
  
  // Track copied link state for visual feedback
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Admin Add Dataset Modal state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [targetProblem, setTargetProblem] = useState<Problem | null>(null);
  const [addTitle, setAddTitle] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addCategory, setAddCategory] = useState<'train' | 'test' | 'sample'>('train');
  const [addSize, setAddSize] = useState('');
  const [addIsLocked, setAddIsLocked] = useState(false);
  const [addUnlockAt, setAddUnlockAt] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Admin Edit Dataset Modal state
  const [editingDataset, setEditingDataset] = useState<Dataset | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editCategory, setEditCategory] = useState<'train' | 'test' | 'sample'>('train');
  const [editSize, setEditSize] = useState('');
  const [editIsLocked, setEditIsLocked] = useState(false);
  const [editUnlockAt, setEditUnlockAt] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const isAdmin = currentUser?.role === 'admin';

  // Toggle accordion expand/collapse
  const toggleExpand = (problemId: number) => {
    const target = problems.find((p) => p.id === problemId);
    if (!isAdmin && target) {
      const lockStatus = getItemLockStatus(target.is_locked, target.unlock_at, now);
      if (lockStatus.type !== 'UNLOCKED') return;
    }
    setExpandedIds((prev) =>
      prev.includes(problemId) ? prev.filter((id) => id !== problemId) : [...prev, problemId]
    );
  };

  // Copy link to clipboard
  const handleCopy = async (id: number, rawUrl: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const fullUrl = rawUrl.startsWith('http') ? rawUrl : `${API_BASE}${rawUrl}`;
      await navigator.clipboard.writeText(fullUrl);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Không thể copy link:', err);
    }
  };

  // Open Add Modal for a specific problem (mặc định lấy thời gian của đề)
  const handleOpenAdd = (problem: Problem, e: React.MouseEvent) => {
    e.stopPropagation();
    setTargetProblem(problem);
    setAddTitle('');
    setAddUrl('');
    setAddSize('');
    setAddCategory('train');
    setAddIsLocked(Boolean(problem.is_locked));
    setAddUnlockAt(toDatetimeLocal(problem.unlock_at));
    setAddError(null);
    setIsAddOpen(true);
  };

  // Submit Add Dataset
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetProblem || !addTitle.trim() || !addUrl.trim()) {
      setAddError('Vui lòng nhập tên và link dữ liệu');
      return;
    }

    try {
      setIsAdding(true);
      setAddError(null);
      await createDataset({
        problem_id: targetProblem.id,
        title: addTitle.trim(),
        download_url: addUrl.trim(),
        size_str: addSize.trim() || 'Link đám mây',
        category: addCategory,
        unlock_at: toUtcIsoString(addUnlockAt),
      });

      // Ensure problem is expanded to see new item
      if (!expandedIds.includes(targetProblem.id)) {
        setExpandedIds((prev) => [...prev, targetProblem.id]);
      }

      setIsAddOpen(false);
      onRefreshDatasets();
    } catch (err: any) {
      setAddError(err.message || 'Lỗi khi thêm liên kết dữ liệu');
    } finally {
      setIsAdding(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (dataItem: Dataset, e: React.MouseEvent) => {
    e.stopPropagation();
    const parentProb = problems.find((p) => p.id === dataItem.problem_id);
    setEditingDataset(dataItem);
    setEditTitle(dataItem.title);
    setEditUrl(dataItem.download_url);
    setEditCategory((dataItem.category as any) || 'train');
    setEditSize(dataItem.size_str || '');
    setEditIsLocked(dataItem.is_locked !== undefined ? Boolean(dataItem.is_locked) : Boolean(parentProb?.is_locked));
    setEditUnlockAt(toDatetimeLocal(dataItem.unlock_at || parentProb?.unlock_at));
  };

  // Submit Edit Dataset
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDataset || !editTitle.trim() || !editUrl.trim()) return;

    try {
      setIsEditing(true);
      await updateDataset(editingDataset.id, {
        title: editTitle.trim(),
        download_url: editUrl.trim(),
        size_str: editSize.trim(),
        category: editCategory,
        unlock_at: toUtcIsoString(editUnlockAt),
      });
      setEditingDataset(null);
      onRefreshDatasets();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi cập nhật dữ liệu');
    } finally {
      setIsEditing(false);
    }
  };

  // Delete Dataset
  const handleDelete = async (dataItem: Dataset, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Bạn có chắc muốn xóa liên kết dữ liệu "${dataItem.title}"?`)) return;

    try {
      await deleteDataset(dataItem.id);
      onRefreshDatasets();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi xóa dữ liệu');
    }
  };

  // Filter problems
  const filteredProblems = problems.filter((prob) => {
    const matchSearch = prob.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        prob.code.toLowerCase().includes(searchQuery.toLowerCase());
    return matchSearch;
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            {/* <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Database className="w-4 h-4" />
            </div> */}
            <span>Kho Dữ Liệu Các Đề Thi OLP AI KMA 2026</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Dữ liệu phân theo từng đề bài. Nhấn vào từng khối đề bài để xem danh sách liên kết tải và sao chép link.
          </p>
        </div>

        {/* Search */}
        <div className="relative self-start sm:self-auto">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm theo tên hoặc mã đề..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden bg-white shadow-xs"
          />
        </div>
      </div>

      {/* Vertical list of problem blocks (Các component theo chiều dọc, mỗi khối là dữ liệu 1 đề) */}
      <div className="flex flex-col gap-5">
        {filteredProblems.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 text-slate-400 text-xs">
            Không tìm thấy bài toán nào phù hợp.
          </div>
        ) : (
          filteredProblems.map((prob) => {
            const probDatasets = datasets.filter((d) => d.problem_id === prob.id);
            const isCV = prob.category === 'CV';
            const probLockStatus = getItemLockStatus(prob.is_locked, prob.unlock_at, now);
            const isProbLockedForUser = !isAdmin && probLockStatus.type !== 'UNLOCKED';
            const isExpanded = !isProbLockedForUser && expandedIds.includes(prob.id);

            return (
              <div
                key={prob.id}
                className="bg-white rounded-3xl border border-slate-200 shadow-xs hover:shadow-md transition-all duration-200 overflow-hidden"
              >
                {/* Block Header: Tiêu đề tự động lấy tiêu đề của đề bài */}
                <div
                  onClick={() => !isProbLockedForUser && toggleExpand(prob.id)}
                  className={`p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 transition-colors select-none ${
                    isProbLockedForUser
                      ? 'cursor-not-allowed bg-slate-50/70 opacity-90'
                      : 'cursor-pointer bg-gradient-to-r from-slate-50/90 via-white to-slate-50/40 hover:bg-slate-100/50'
                  }`}
                  title={isProbLockedForUser ? 'Đề thi đang bị khóa, không thể mở rộng để xem dữ liệu' : undefined}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Category badge */}
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-black tracking-wide uppercase shrink-0 ${
                      isCV 
                        ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                        : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    }`}>
                      {prob.category}
                    </span>

                    {/* Problem Code */}
                    <span className="font-mono text-xs font-black text-slate-500 shrink-0">
                      [{prob.code}]
                    </span>

                    {/* Problem Title (Tự lấy tiêu đề đề bài) */}
                    <h3 className={`text-sm sm:text-base font-extrabold truncate ${
                      isProbLockedForUser ? 'text-slate-600' : 'text-slate-900'
                    }`}>
                      {prob.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto">
                    {/* Dataset count pill / Lock status */}
                    {probLockStatus.type === 'LOCKED' ? (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-300 flex items-center gap-1 shadow-2xs">
                        <Lock className="w-3 h-3 text-slate-500" />
                        <span>Đang khóa</span>
                      </span>
                    ) : probLockStatus.type === 'COUNTDOWN' ? (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1 shadow-2xs animate-pulse">
                        <Clock className="w-3 h-3 text-amber-600" />
                        <span>Mở sau: {probLockStatus.formatted}</span>
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        {probDatasets.length} nguồn dữ liệu
                      </span>
                    )}

                    {/* Admin: Add link for this problem */}
                    {isAdmin && (
                      <button
                        onClick={(e) => handleOpenAdd(prob, e)}
                        className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                        title="Thêm mục dữ liệu mới vào đề này"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Thêm link dữ liệu</span>
                      </button>
                    )}

                    {/* Accordion toggle button */}
                    {isProbLockedForUser ? (
                      <div
                        className="p-1.5 rounded-xl bg-slate-100 text-slate-400 cursor-not-allowed select-none"
                        title="Đề thi đang bị khóa, không thể mở rộng để xem dữ liệu"
                      >
                        <Lock className="w-4 h-4" />
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(prob.id);
                        }}
                        className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                        title={isExpanded ? 'Thu gọn' : 'Xem chi tiết'}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Block Detail Content: Danh sách gồm tên và link bên cạnh, có nút copy */}
                {isExpanded && (
                  <div className="p-5 sm:p-6 bg-white animate-in fade-in slide-in-from-top-1 duration-150">
                    {probDatasets.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-2xl">
                        <span>Chưa có liên kết dữ liệu nào cho đề bài này.</span>
                        {isAdmin && (
                          <div className="mt-2">
                            <button
                              onClick={(e) => handleOpenAdd(prob, e)}
                              className="text-xs text-blue-600 font-bold hover:underline cursor-pointer"
                            >
                              + Bấm vào đây để thêm liên kết đầu tiên
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {probDatasets.map((dataItem) => {
                          const isCopied = copiedId === dataItem.id;
                          const fullUrl = dataItem.download_url.startsWith('http') 
                            ? dataItem.download_url 
                            : `${API_BASE}${dataItem.download_url}`;

                          const rawItemUnlockAt = (dataItem.unlock_at !== undefined && dataItem.unlock_at !== null && dataItem.unlock_at !== '')
                            ? dataItem.unlock_at
                            : prob.unlock_at;
                          const rawItemIsLocked = (dataItem.is_locked !== undefined && dataItem.is_locked !== null)
                            ? Boolean(dataItem.is_locked)
                            : Boolean(prob.is_locked);

                          let itemLockStatus = getItemLockStatus(rawItemIsLocked, rawItemUnlockAt, now);
                          if (probLockStatus.type !== 'UNLOCKED') {
                            itemLockStatus = probLockStatus;
                          }

                          const isItemLockedForUser = !isAdmin && itemLockStatus.type !== 'UNLOCKED';

                          return (
                            <div
                              key={dataItem.id}
                              className="p-3.5 sm:px-4 sm:py-3.5 rounded-2xl border border-slate-200/90 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/20 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3"
                            >
                              {/* Left: Tên dữ liệu & Phân loại */}
                              <div className="flex items-center gap-3 min-w-0 md:w-5/12">
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider shrink-0 ${
                                  dataItem.category === 'sample'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : dataItem.category === 'train'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {dataItem.category || 'train'}
                                </span>
                                
                                <div className="min-w-0 flex-1">
                                  <div className="font-bold text-xs sm:text-sm text-slate-800 truncate" title={dataItem.title}>
                                    {dataItem.title}
                                  </div>
                                  {dataItem.size_str && (
                                    <div className="text-[11px] text-slate-400 font-medium">
                                      Dung lượng: {dataItem.size_str}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Center: Link bên cạnh HOẶC Trạng thái khóa / đếm ngược */}
                              {isItemLockedForUser ? (
                                itemLockStatus.type === 'COUNTDOWN' ? (
                                  <div className="flex items-center gap-2 min-w-0 flex-1 bg-amber-50/90 px-3.5 py-2 rounded-xl border border-amber-200 text-amber-800 text-xs font-bold select-none">
                                    <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0 animate-spin" style={{ animationDuration: '6s' }} />
                                    <span>⏳ Link dữ liệu mở sau: {itemLockStatus.formatted}</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 min-w-0 flex-1 bg-slate-100 px-3.5 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold select-none">
                                    <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <span>🔒 Link dữ liệu đang bị khóa</span>
                                  </div>
                                )
                              ) : (
                                <div className="flex items-center gap-2 min-w-0 flex-1 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
                                  <LinkIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                  <span 
                                    className="text-xs text-blue-700 font-mono truncate select-all" 
                                    title={fullUrl}
                                  >
                                    {dataItem.download_url}
                                  </span>
                                  {isAdmin && itemLockStatus.type !== 'UNLOCKED' && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold shrink-0">
                                      {itemLockStatus.type === 'LOCKED' ? 'Khóa' : `Mở sau: ${itemLockStatus.formatted}`}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Right: Nút Copy bên cạnh và Admin Actions */}
                              <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
                                {isItemLockedForUser ? (
                                  <button
                                    disabled
                                    className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed select-none"
                                    title="Liên kết đang khóa, không thể sao chép"
                                  >
                                    <Lock className="w-3.5 h-3.5" />
                                    <span>Đã khóa link</span>
                                  </button>
                                ) : (
                                  <>
                                    {/* Nút Copy bên cạnh */}
                                    <button
                                      onClick={(e) => handleCopy(dataItem.id, dataItem.download_url, e)}
                                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer ${
                                        isCopied
                                          ? 'bg-emerald-600 text-white shadow-emerald-500/20'
                                          : 'bg-slate-200/80 hover:bg-blue-600 hover:text-white text-slate-700'
                                      }`}
                                      title="Sao chép đường dẫn link vào clipboard"
                                    >
                                      {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                      <span>{isCopied ? 'Đã copy!' : 'Copy'}</span>
                                    </button>

                                    {/* Direct Open Link */}
                                    <a
                                      href={fullUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-1.5 rounded-xl text-slate-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                                      title="Mở link trong tab mới"
                                    >
                                      <ExternalLink className="w-4 h-4" />
                                    </a>
                                  </>
                                )}

                                {/* Admin controls: Sửa & Xóa */}
                                {isAdmin && (
                                  <div className="flex items-center gap-1 pl-2 border-l border-slate-200">
                                    <button
                                      onClick={(e) => handleOpenEdit(dataItem, e)}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                                      title="Chỉnh sửa tên, link, khóa & hẹn giờ"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={(e) => handleDelete(dataItem, e)}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                      title="Xóa link này"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ======================================================== */}
      {/* MODAL 1: ADMIN - THÊM LIÊN KẾT DỮ LIỆU MỚI                */}
      {/* ======================================================== */}
      {isAddOpen && targetProblem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-red-600" />
                <span>Thêm Link Dữ Liệu Cho [{targetProblem.code}]</span>
              </h3>
              <button
                onClick={() => setIsAddOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tên mục dữ liệu:
                </label>
                <input
                  type="text"
                  placeholder="VD: Tập ảnh huấn luyện Train Set (Google Drive)"
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Đường dẫn liên kết (Link tải):
                </label>
                <input
                  type="text"
                  placeholder="VD: https://drive.google.com/drive/folders/... hoặc https://huggingface.co/..."
                  value={addUrl}
                  onChange={(e) => setAddUrl(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Phân loại:
                  </label>
                  <select
                    value={addCategory}
                    onChange={(e) => setAddCategory(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 focus:border-blue-500 focus:outline-hidden"
                  >
                    <option value="train">Train (Huấn luyện)</option>
                    <option value="test">Test (Kiểm thử)</option>
                    <option value="sample">Sample (Mẫu nộp)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Dung lượng (tùy chọn):
                  </label>
                  <input
                    type="text"
                    placeholder="VD: 1.2 GB hoặc 500 MB"
                    value={addSize}
                    onChange={(e) => setAddSize(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Timing & Lock Settings */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-slate-600" />
                    Khóa liên kết dữ liệu này:
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={addIsLocked} 
                      onChange={(e) => setAddIsLocked(e.target.checked)} 
                      className="sr-only peer" 
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600"></div>
                    <span className="ml-2 text-xs font-bold text-slate-700">{addIsLocked ? 'Đang Khóa' : 'Mở'}</span>
                  </label>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      Thời gian mở link (Mặc định theo đề thi):
                    </label>
                    {targetProblem?.unlock_at && (
                      <button
                        type="button"
                        onClick={() => setAddUnlockAt(toDatetimeLocal(targetProblem.unlock_at))}
                        className="text-[10px] text-blue-600 font-bold hover:underline cursor-pointer"
                      >
                        Lấy theo đề bài
                      </button>
                    )}
                  </div>
                  <input
                    type="datetime-local"
                    value={addUnlockAt}
                    onChange={(e) => setAddUnlockAt(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden font-mono"
                  />
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(Date.now() + 15 * 60 * 1000);
                        setAddUnlockAt(toDatetimeLocal(d));
                      }}
                      className="px-2 py-0.5 text-[10px] font-bold bg-white border border-slate-200 hover:border-blue-400 rounded-md text-slate-600 cursor-pointer"
                    >
                      +15 phút
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(Date.now() + 60 * 60 * 1000);
                        setAddUnlockAt(toDatetimeLocal(d));
                      }}
                      className="px-2 py-0.5 text-[10px] font-bold bg-white border border-slate-200 hover:border-blue-400 rounded-md text-slate-600 cursor-pointer"
                    >
                      +1 giờ
                    </button>
                    {addUnlockAt && (
                      <button
                        type="button"
                        onClick={() => setAddUnlockAt('')}
                        className="px-2 py-0.5 text-[10px] font-bold bg-red-50 border border-red-200 text-red-600 rounded-md hover:bg-red-100 cursor-pointer"
                      >
                        Xóa hẹn giờ
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    {targetProblem?.unlock_at 
                      ? `Đề bài mở lúc: ${new Date(targetProblem.unlock_at).toLocaleString('vi-VN')}` 
                      : 'Nếu không đặt thời gian riêng, link sẽ mở ngay khi đề bài mở.'}
                  </span>
                </div>
              </div>

              {addError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                  {addError}
                </div>
              )}

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isAdding}
                  className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-500 rounded-xl shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span>{isAdding ? 'Đang thêm...' : 'Thêm dữ liệu'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: ADMIN - CHỈNH SỬA LIÊN KẾT DỮ LIỆU               */}
      {/* ======================================================== */}
      {editingDataset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-blue-600" />
                <span>Chỉnh Sửa Liên Kết Dữ Liệu</span>
              </h3>
              <button
                onClick={() => setEditingDataset(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tên mục dữ liệu:
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Đường dẫn liên kết (Link):
                </label>
                <input
                  type="text"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Phân loại:
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 focus:border-blue-500 focus:outline-hidden"
                  >
                    <option value="train">Train</option>
                    <option value="test">Test</option>
                    <option value="sample">Sample</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Dung lượng:
                  </label>
                  <input
                    type="text"
                    value={editSize}
                    onChange={(e) => setEditSize(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Timing & Lock Settings */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-slate-600" />
                    Khóa liên kết dữ liệu này:
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={editIsLocked} 
                      onChange={(e) => setEditIsLocked(e.target.checked)} 
                      className="sr-only peer" 
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600"></div>
                    <span className="ml-2 text-xs font-bold text-slate-700">{editIsLocked ? 'Đang Khóa' : 'Mở'}</span>
                  </label>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      Thời gian mở link (Tự động mở khi hết giờ):
                    </label>
                    {(() => {
                      const parent = problems.find(p => p.id === editingDataset.problem_id);
                      if (parent?.unlock_at) {
                        return (
                          <button
                            type="button"
                            onClick={() => setEditUnlockAt(toDatetimeLocal(parent.unlock_at))}
                            className="text-[10px] text-blue-600 font-bold hover:underline cursor-pointer"
                          >
                            Lấy theo đề bài
                          </button>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <input
                    type="datetime-local"
                    value={editUnlockAt}
                    onChange={(e) => setEditUnlockAt(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden font-mono"
                  />
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(Date.now() + 15 * 60 * 1000);
                        setEditUnlockAt(toDatetimeLocal(d));
                      }}
                      className="px-2 py-0.5 text-[10px] font-bold bg-white border border-slate-200 hover:border-blue-400 rounded-md text-slate-600 cursor-pointer"
                    >
                      +15 phút
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(Date.now() + 60 * 60 * 1000);
                        setEditUnlockAt(toDatetimeLocal(d));
                      }}
                      className="px-2 py-0.5 text-[10px] font-bold bg-white border border-slate-200 hover:border-blue-400 rounded-md text-slate-600 cursor-pointer"
                    >
                      +1 giờ
                    </button>
                    {editUnlockAt && (
                      <button
                        type="button"
                        onClick={() => setEditUnlockAt('')}
                        className="px-2 py-0.5 text-[10px] font-bold bg-red-50 border border-red-200 text-red-600 rounded-md hover:bg-red-100 cursor-pointer"
                      >
                        Xóa hẹn giờ
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Đến thời gian này, liên kết dữ liệu sẽ hiển thị và cho phép thí sinh copy link tải.
                  </span>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingDataset(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isEditing}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isEditing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>{isEditing ? 'Đang lưu...' : 'Lưu thay đổi'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
