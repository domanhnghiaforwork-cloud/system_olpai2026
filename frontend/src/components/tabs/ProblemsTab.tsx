'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Problem, User } from '@/types';
import { 
  FileText, 
  Search, 
  Plus, 
  Edit3, 
  Upload, 
  Trash2, 
  ExternalLink, 
  X, 
  CheckCircle2, 
  AlertCircle,
  Eye,
  Download,
  Loader2,
  Sparkles,
  Lock,
  Unlock,
  Clock
} from 'lucide-react';
import { createProblem, updateProblem, uploadProblemPdf, deleteProblem } from '@/lib/api';
import { getItemLockStatus, toDatetimeLocal, toUtcIsoString } from '@/lib/countdown';

interface ProblemsTabProps {
  problems: Problem[];
  currentUser: User | null;
  onRefreshProblems: () => void;
  onSelectProblemForSubmit: (problemId: number) => void;
}

export const ProblemsTab: React.FC<ProblemsTabProps> = ({
  problems,
  currentUser,
  onRefreshProblems,
  onSelectProblemForSubmit,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'CV' | 'NLP'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Real-time ticker for 1-second countdown updates
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // PDF Viewer Modal state
  const [activePdfProblem, setActivePdfProblem] = useState<Problem | null>(null);

  // Admin: Create Problem Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createCode, setCreateCode] = useState('');
  const [createTitle, setCreateTitle] = useState('');
  const [createCategory, setCreateCategory] = useState<'CV' | 'NLP'>('CV');
  const [createMetric, setCreateMetric] = useState('F1-Score');
  const [createIsLocked, setCreateIsLocked] = useState(false);
  const [createUnlockAt, setCreateUnlockAt] = useState('');
  const [createFile, setCreateFile] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingProblem, setEditingProblem] = useState<Problem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState<'CV' | 'NLP'>('CV');
  const [editCode, setEditCode] = useState('');
  const [editMaxPublic, setEditMaxPublic] = useState<number>(5);
  const [editMaxPrivate, setEditMaxPrivate] = useState<number>(2);
  const [editIsLocked, setEditIsLocked] = useState(false);
  const [editUnlockAt, setEditUnlockAt] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Admin: Direct Upload PDF state
  const [uploadingProblem, setUploadingProblem] = useState<Problem | null>(null);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = currentUser?.role === 'admin';
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  // Filter problems by CV/NLP and Search Query
  const filteredProblems = problems.filter((p) => {
    const matchCat = selectedCategory === 'all' || p.category === selectedCategory;
    const matchSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        p.code.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  // Handle Create New Problem (Admin)
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createCode.trim() || !createTitle.trim()) {
      setCreateError('Vui lòng nhập đầy đủ mã đề và tiêu đề');
      return;
    }

    try {
      setIsCreating(true);
      setCreateError(null);

      const formData = new FormData();
      formData.append('code', createCode.trim());
      formData.append('title', createTitle.trim());
      formData.append('category', createCategory);
      formData.append('metric', createMetric.trim());
      formData.append('is_locked', String(createIsLocked));
      if (createUnlockAt) {
        const iso = toUtcIsoString(createUnlockAt);
        if (iso) formData.append('unlock_at', iso);
      }
      if (createFile) {
        formData.append('file', createFile);
      }

      await createProblem(formData);
      setIsCreateOpen(false);
      setCreateCode('');
      setCreateTitle('');
      setCreateFile(null);
      setCreateIsLocked(false);
      setCreateUnlockAt('');
      onRefreshProblems();
    } catch (err: any) {
      setCreateError(err.message || 'Lỗi khi tạo đề bài');
    } finally {
      setIsCreating(false);
    }
  };

  // Handle Edit Problem (Admin)
  const handleOpenEdit = (prob: Problem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProblem(prob);
    setEditTitle(prob.title);
    setEditCategory(prob.category);
    setEditCode(prob.code);
    setEditMaxPublic(prob.max_public_submissions ?? 5);
    setEditMaxPrivate(prob.max_private_submissions ?? 2);
    setEditIsLocked(Boolean(prob.is_locked));
    setEditUnlockAt(toDatetimeLocal(prob.unlock_at));
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProblem || !editTitle.trim()) return;

    try {
      setIsUpdating(true);
      await updateProblem(editingProblem.id, {
        title: editTitle.trim(),
        category: editCategory,
        code: editCode.trim(),
        max_public_submissions: editMaxPublic,
        max_private_submissions: editMaxPrivate,
        is_locked: editIsLocked,
        unlock_at: toUtcIsoString(editUnlockAt),
      });
      setEditingProblem(null);
      onRefreshProblems();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi cập nhật đề thi');
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle Quick Upload PDF (Admin)
  const handleOpenUploadPdf = (prob: Problem, e: React.MouseEvent) => {
    e.stopPropagation();
    setUploadingProblem(prob);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileSelectedForUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!uploadingProblem || !e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    try {
      setIsUploadingPdf(true);
      await uploadProblemPdf(uploadingProblem.id, file);
      alert(`Đã cập nhật file PDF mới cho đề [${uploadingProblem.code}] thành công!`);
      onRefreshProblems();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi tải lên file PDF');
    } finally {
      setIsUploadingPdf(false);
      setUploadingProblem(null);
    }
  };

  // Handle Delete Problem (Admin)
  const handleDeleteProblem = async (prob: Problem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Bạn có chắc chắn muốn xóa đề thi [${prob.code}] - ${prob.title}?`)) return;

    try {
      await deleteProblem(prob.id);
      onRefreshProblems();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi xóa đề thi');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Hidden file input for Admin PDF replacement */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelectedForUpload}
        accept=".pdf"
        className="hidden"
      />

      {/* Header with Title and Admin Create Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <FileText className="w-4 h-4" />
            </div>
            <span>Danh Sách Đề Bài OLP AI KMA 2026</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Bao gồm 2 bảng đấu: <strong className="text-blue-700">Computer Vision (CV)</strong> và <strong className="text-indigo-700">Natural Language Processing (NLP)</strong>. Nhấn vào từng đề bài để xem nội dung file PDF.
          </p>
        </div>

        {/* Admin Create Problem Button */}
        {isAdmin && (
          <button
            onClick={() => setIsCreateOpen(true)}
            className="self-start sm:self-auto px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-md shadow-red-600/20 flex items-center gap-2 transition-all hover:scale-105 active:scale-95 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo thêm đề mới</span>
          </button>
        )}
      </div>

      {/* Category Tabs (All / CV / NLP) & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Category Filter Pills: Only CV and NLP */}
        <div className="flex items-center gap-1.5 bg-slate-200/70 p-1 rounded-2xl w-fit">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
              selectedCategory === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tất cả ({problems.length})
          </button>
          <button
            onClick={() => setSelectedCategory('CV')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
              selectedCategory === 'CV'
                ? 'bg-blue-600 text-white shadow-xs shadow-blue-500/30'
                : 'text-slate-600 hover:text-blue-700'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-300" />
            <span>Computer Vision (CV)</span>
          </button>
          <button
            onClick={() => setSelectedCategory('NLP')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
              selectedCategory === 'NLP'
                ? 'bg-indigo-600 text-white shadow-xs shadow-indigo-500/30'
                : 'text-slate-600 hover:text-indigo-700'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-indigo-300" />
            <span>NLP (Xử lý ngôn ngữ)</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm theo mã hoặc tiêu đề..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden bg-white shadow-xs"
          />
        </div>
      </div>

      {/* Vertical List of Long Horizontal Rectangles (Hình chữ nhật dài xếp thành hàng dọc) */}
      <div className="flex flex-col gap-3">
        {filteredProblems.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 text-slate-400 text-xs">
            Không tìm thấy đề bài nào phù hợp.
          </div>
        ) : (
          filteredProblems.map((prob) => {
            const isCV = prob.category === 'CV';
            const pdfUrl = `${API_BASE}${prob.pdf_url || `/api/problems/${prob.id}/pdf`}`;
            const lockStatus = getItemLockStatus(prob.is_locked, prob.unlock_at, now);
            const isLockedForUser = !isAdmin && lockStatus.type !== 'UNLOCKED';

            return (
              <div
                key={prob.id}
                onClick={() => {
                  if (!isLockedForUser) {
                    setActivePdfProblem(prob);
                  }
                }}
                className={`group relative bg-white rounded-2xl border p-4 sm:px-6 sm:py-4.5 shadow-xs transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isLockedForUser
                    ? 'border-slate-200/80 bg-slate-50/50 cursor-not-allowed opacity-90'
                    : 'border-slate-200/90 hover:border-blue-400 hover:bg-slate-50/80 hover:shadow-md cursor-pointer'
                }`}
              >
                {/* Left Side: Category Badge, Code, Simple Title */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  
                  {/* Category Pill: CV or NLP */}
                  <span className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-black tracking-wide uppercase ${
                    isCV 
                      ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                      : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                  }`}>
                    {prob.category}
                  </span>

                  {/* Problem Code */}
                  <span className="shrink-0 font-mono text-xs font-extrabold text-slate-500">
                    [{prob.code}]
                  </span>

                  {/* Simple Title */}
                  <h3 className={`text-sm sm:text-base font-bold transition-colors truncate ${
                    isLockedForUser ? 'text-slate-700' : 'text-slate-900 group-hover:text-blue-600'
                  }`}>
                    {prob.title}
                  </h3>

                  {/* PDF indicator pill */}
                  <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-50 text-red-600 border border-red-200 shrink-0">
                    <FileText className="w-3 h-3" />
                    <span>PDF</span>
                  </span>
                </div>

                {/* Right Side: View PDF button for User, Edit / Upload actions for Admin */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  {/* If Locked */}
                  {lockStatus.type === 'LOCKED' ? (
                    <div className="flex items-center gap-2">
                      <div
                        className="px-3.5 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold flex items-center gap-1.5 border border-slate-300 cursor-not-allowed select-none shadow-2xs"
                        title="Đề thi hiện đang bị khóa bởi Quản trị viên"
                      >
                        <Lock className="w-3.5 h-3.5 text-slate-500" />
                        <span>Đang khóa</span>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActivePdfProblem(prob);
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                          title="Admin có thể xem trước nội dung PDF"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Xem PDF</span>
                        </button>
                      )}
                    </div>
                  ) : lockStatus.type === 'COUNTDOWN' ? (
                    <div className="flex items-center gap-2">
                      <div
                        className="px-3.5 py-1.5 rounded-xl bg-amber-50 text-amber-800 text-xs font-extrabold flex items-center gap-1.5 border border-amber-300 cursor-not-allowed select-none shadow-2xs animate-pulse"
                        title={`Đề thi sẽ tự động mở sau ${lockStatus.formatted}`}
                      >
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>Mở sau: {lockStatus.formatted}</span>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActivePdfProblem(prob);
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                          title="Admin có thể xem trước nội dung PDF"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Xem PDF</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActivePdfProblem(prob);
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-slate-100 group-hover:bg-blue-600 text-slate-700 group-hover:text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Xem đề PDF</span>
                    </button>
                  )}

                  {/* Admin Controls */}
                  {isAdmin && (
                    <div className="flex items-center gap-1 pl-2 border-l border-slate-200">
                      {/* Edit Title/Category */}
                      <button
                        onClick={(e) => handleOpenEdit(prob, e)}
                        title="Chỉnh sửa tiêu đề, phân loại, khóa & hẹn giờ"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      {/* Upload/Replace PDF */}
                      <button
                        onClick={(e) => handleOpenUploadPdf(prob, e)}
                        title="Tải lên / Thay thế file PDF"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-700 hover:bg-red-50 transition-colors"
                      >
                        <Upload className="w-4 h-4" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={(e) => handleDeleteProblem(prob, e)}
                        title="Xóa đề thi này"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ======================================================== */}
      {/* MODAL 1: VIEW PDF MODAL (Bấm vào thì sẽ xem file PDF)     */}
      {/* ======================================================== */}
      {activePdfProblem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-5xl h-[88vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-3 min-w-0 pr-4">
                <span className={`px-2.5 py-0.5 rounded-md text-xs font-black uppercase ${
                  activePdfProblem.category === 'CV' 
                    ? 'bg-blue-100 text-blue-800' 
                    : 'bg-indigo-100 text-indigo-800'
                }`}>
                  {activePdfProblem.category}
                </span>
                <span className="font-mono text-xs font-bold text-slate-500">
                  [{activePdfProblem.code}]
                </span>
                <h3 className="font-extrabold text-sm sm:text-base text-slate-900 truncate">
                  {activePdfProblem.title}
                </h3>
              </div>

              {/* Actions & Close */}
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`${API_BASE}${activePdfProblem.pdf_url || `/api/problems/${activePdfProblem.id}/pdf`}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Mở tab mới</span>
                </a>

                <a
                  href={`${API_BASE}${activePdfProblem.pdf_url || `/api/problems/${activePdfProblem.id}/pdf`}`}
                  download={activePdfProblem.pdf_filename || `de_thi_${activePdfProblem.code}.pdf`}
                  className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Tải về</span>
                </a>

                <button
                  onClick={() => {
                    const pid = activePdfProblem.id;
                    setActivePdfProblem(null);
                    onSelectProblemForSubmit(pid);
                  }}
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-500 rounded-xl flex items-center gap-1.5 transition-all shadow-xs"
                >
                  <span>Nộp bài đề này</span>
                </button>

                <button
                  onClick={() => setActivePdfProblem(null)}
                  className="w-8 h-8 rounded-full bg-slate-200/70 hover:bg-slate-300 flex items-center justify-center text-slate-600 transition-colors ml-2"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body: Embedded PDF View */}
            <div className="flex-1 bg-slate-900 relative">
              <iframe
                src={`${API_BASE}${activePdfProblem.pdf_url || `/api/problems/${activePdfProblem.id}/pdf`}#toolbar=1&view=FitH`}
                className="w-full h-full border-none"
                title={`PDF ${activePdfProblem.title}`}
              />
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: ADMIN - TẠO THÊM ĐỀ MỚI                          */}
      {/* ======================================================== */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-red-600" />
                <span>Tạo Thêm Đề Thi Mới (Admin)</span>
              </h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Phân loại bài toán:
                  </label>
                  <select
                    value={createCategory}
                    onChange={(e) => setCreateCategory(e.target.value as 'CV' | 'NLP')}
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 focus:border-blue-500 focus:outline-hidden"
                  >
                    <option value="CV">Computer Vision (CV)</option>
                    <option value="NLP">Xử lý ngôn ngữ tự nhiên (NLP)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mã đề bài:
                  </label>
                  <input
                    type="text"
                    placeholder="VD: CV-03 hoặc NLP-03"
                    value={createCode}
                    onChange={(e) => setCreateCode(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tiêu đề đề bài:
                </label>
                <input
                  type="text"
                  placeholder="VD: Phân loại hành vi bất thường từ video giám sát KMA"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Độ đo đánh giá (Metric):
                </label>
                <input
                  type="text"
                  placeholder="VD: F1-Score, mAP@0.5, Accuracy..."
                  value={createMetric}
                  onChange={(e) => setCreateMetric(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tải lên tệp PDF đề thi (.pdf):
                </label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setCreateFile(e.target.files[0]);
                    }
                  }}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  (Nếu không chọn, hệ thống sẽ tự động tạo file PDF mẫu theo thông tin đề thi)
                </span>
              </div>

              {/* Lock & Countdown settings */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-slate-600" />
                    Khóa đề thi (Ẩn đề PDF với thí sinh):
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={createIsLocked} 
                      onChange={(e) => setCreateIsLocked(e.target.checked)} 
                      className="sr-only peer" 
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600"></div>
                    <span className="ml-2 text-xs font-bold text-slate-700">{createIsLocked ? 'Đang Khóa' : 'Mở'}</span>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    Thời gian đếm ngược mở đề (Hẹn giờ mở):
                  </label>
                  <input
                    type="datetime-local"
                    value={createUnlockAt}
                    onChange={(e) => setCreateUnlockAt(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden font-mono"
                  />
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(Date.now() + 15 * 60 * 1000);
                        setCreateUnlockAt(toDatetimeLocal(d));
                      }}
                      className="px-2 py-0.5 text-[10px] font-bold bg-white border border-slate-200 hover:border-blue-400 rounded-md text-slate-600 cursor-pointer"
                    >
                      +15 phút
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(Date.now() + 60 * 60 * 1000);
                        setCreateUnlockAt(toDatetimeLocal(d));
                      }}
                      className="px-2 py-0.5 text-[10px] font-bold bg-white border border-slate-200 hover:border-blue-400 rounded-md text-slate-600 cursor-pointer"
                    >
                      +1 giờ
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
                        setCreateUnlockAt(toDatetimeLocal(d));
                      }}
                      className="px-2 py-0.5 text-[10px] font-bold bg-white border border-slate-200 hover:border-blue-400 rounded-md text-slate-600 cursor-pointer"
                    >
                      +1 ngày
                    </button>
                    {createUnlockAt && (
                      <button
                        type="button"
                        onClick={() => setCreateUnlockAt('')}
                        className="px-2 py-0.5 text-[10px] font-bold bg-red-50 border border-red-200 text-red-600 rounded-md hover:bg-red-100 cursor-pointer"
                      >
                        Xóa hẹn giờ
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Đến thời gian này, đề thi sẽ tự động mở để thí sinh có thể xem PDF.
                  </span>
                </div>
              </div>

              {createError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                  {createError}
                </div>
              )}

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-500 rounded-xl shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span>{isCreating ? 'Đang tạo...' : 'Tạo đề bài'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: ADMIN - CHỈNH SỬA TIÊU ĐỀ & THÔNG TIN            */}
      {/* ======================================================== */}
      {editingProblem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-600" />
                <span>Chỉnh Sửa Đề Thi [{editingProblem.code}]</span>
              </h3>
              <button
                onClick={() => setEditingProblem(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleUpdateSubmit} className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Phân loại:
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as 'CV' | 'NLP')}
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 focus:border-blue-500 focus:outline-hidden"
                  >
                    <option value="CV">Computer Vision (CV)</option>
                    <option value="NLP">NLP</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mã đề bài:
                  </label>
                  <input
                    type="text"
                    value={editCode}
                    onChange={(e) => setEditCode(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tiêu đề đề bài:
                </label>
                <textarea
                  rows={3}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Giới hạn nộp Public:
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={editMaxPublic}
                    onChange={(e) => setEditMaxPublic(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden font-mono font-bold"
                  />
                  <span className="text-[10px] text-slate-400">public_submit.csv</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Giới hạn nộp Private:
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={editMaxPrivate}
                    onChange={(e) => setEditMaxPrivate(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden font-mono font-bold"
                  />
                  <span className="text-[10px] text-slate-400">private_submit.csv</span>
                </div>
              </div>

              {/* Lock & Countdown settings */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-slate-600" />
                    Khóa đề thi (Ẩn đề PDF với thí sinh):
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
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    Thời gian đếm ngược mở đề (Hẹn giờ mở):
                  </label>
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
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
                        setEditUnlockAt(toDatetimeLocal(d));
                      }}
                      className="px-2 py-0.5 text-[10px] font-bold bg-white border border-slate-200 hover:border-blue-400 rounded-md text-slate-600 cursor-pointer"
                    >
                      +1 ngày
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
                    Đến thời gian này, đề thi sẽ tự động mở để thí sinh có thể xem PDF.
                  </span>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingProblem(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>{isUpdating ? 'Đang lưu...' : 'Lưu thay đổi'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
