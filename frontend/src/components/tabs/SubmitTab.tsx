'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Problem, Submission, User } from '@/types';
import { 
  UploadCloud, 
  FileCheck, 
  AlertCircle, 
  CheckCircle2, 
  FileSpreadsheet, 
  Send, 
  Loader2, 
  Check, 
  Sparkles, 
  Lock, 
  Globe, 
  Settings, 
  X,
  AlertTriangle,
  Ban,
  Clock,
  Trophy,
  Download
} from 'lucide-react';
import { submitSolution, updateProblem, getCandidateSubmissionDownloadUrl } from '@/lib/api';
import { getItemLockStatus, toDatetimeLocal, toUtcIsoString } from '@/lib/countdown';

interface SubmitTabProps {
  problems: Problem[];
  submissions: Submission[];
  currentUser: User | null;
  selectedProblemId: number | null;
  onSelectProblemId: (id: number) => void;
  onSubmissionSuccess: () => void;
  onRefreshProblems: () => void;
}

type PipelineStep = 'idle' | 'step1' | 'step2' | 'finished' | 'error';

export const SubmitTab: React.FC<SubmitTabProps> = ({
  problems,
  submissions,
  currentUser,
  selectedProblemId,
  onSelectProblemId,
  onSubmissionSuccess,
  onRefreshProblems,
}) => {
  // Real-time ticker for 1-second countdown updates
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [file, setFile] = useState<File | null>(null);
  const [submissionType, setSubmissionType] = useState<'public' | 'private'>('public');

  // Pipeline evaluation states
  const [pipelineStep, setPipelineStep] = useState<PipelineStep>('idle');
  const [step1Msg, setStep1Msg] = useState<string>('');
  const [step2Msg, setStep2Msg] = useState<string>('');
  const [resultLine, setResultLine] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Admin edit limits modal state
  const [isEditLimitsOpen, setIsEditLimitsOpen] = useState(false);
  const [editMaxPublic, setEditMaxPublic] = useState(5);
  const [editMaxPrivate, setEditMaxPrivate] = useState(2);
  const [editPrivateIsLocked, setEditPrivateIsLocked] = useState(false);
  const [editPrivateUnlockAt, setEditPrivateUnlockAt] = useState('');
  const [isSavingLimits, setIsSavingLimits] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = currentUser?.role === 'admin';

  // -------------------------------------------------------------
  // LỌC DANH SÁCH ĐỀ BÀI: KHÔNG CHO XUẤT HIỆN ĐỀ ĐANG KHÓA HOẶC ĐẾM NGƯỢC
  // VÀ CHỈ ĐỀ ĐÃ ĐƯỢC CHỌN CẤU HÌNH ĐÁNH GIÁ MỚI ĐƯỢC ĐƯA VÀO DANH SÁCH ĐỂ NỘP
  // -------------------------------------------------------------
  const availableProblems = problems.filter((p) => {
    const lockStatus = getItemLockStatus(p.is_locked, p.unlock_at, now);
    const isUnlocked = lockStatus.type === 'UNLOCKED';
    const hasEvalConfig = Boolean(p.evaluation_config && p.evaluation_config.trim() !== '');
    return isUnlocked && hasEvalConfig;
  });

  const activeProblem = availableProblems.find((p) => p.id === selectedProblemId) || availableProblems[0];
  const activeProblemId = activeProblem?.id ?? 0;
  const hasNoProblems = availableProblems.length === 0;

  // Tự động đồng bộ đề thi nếu đề hiện tại bị khóa hoặc đang đếm ngược
  useEffect(() => {
    if (availableProblems.length > 0) {
      const isSelectedAvailable = availableProblems.some((p) => p.id === selectedProblemId);
      if (!isSelectedAvailable) {
        onSelectProblemId(availableProblems[0].id);
      }
    }
  }, [availableProblems, selectedProblemId, onSelectProblemId]);

  // -------------------------------------------------------------
  // TÍNH TOÁN GIỚI HẠN VÀ SỐ LẦN ĐÃ NỘP CỦA TỪNG LOẠI BÀI NỘP
  // -------------------------------------------------------------
  const maxPublic = activeProblem?.max_public_submissions ?? 5;
  const maxPrivate = activeProblem?.max_private_submissions ?? 2;

  // Trạng thái khóa & đếm ngược mở khóa cho vòng nộp Private
  const privateLockStatus = getItemLockStatus(
    activeProblem?.private_is_locked,
    activeProblem?.private_unlock_at,
    now
  );
  const isPrivateLocked = !isAdmin && privateLockStatus.type !== 'UNLOCKED';

  // Hàm kiểm tra bài nộp hợp lệ để tính vào giới hạn số lần nộp.
  // QUY TẮC: Nếu bài nộp bị lỗi ở Quy trình 1 (Lỗi định dạng, cấu trúc CSV / chưa có điểm)
  // thì KHÔNG bị trừ số lần nộp, nhưng nhật ký và lịch sử vẫn được lưu đầy đủ.
  const isCountedSubmission = (s: Submission) => {
    const st = (s.status || '').toUpperCase();
    if (st.includes('LỖI') || st.includes('ERROR') || st.includes('FAIL') || st.includes('INVALID')) {
      return false;
    }
    // Đối với bài Public: nếu không có điểm và không phải trạng thái hợp lệ thì không tính
    if ((s.submission_type === 'public' || !s.submission_type) && (s.score === null || s.score === undefined)) {
      return false;
    }
    return true;
  };

  // Lọc số lần đã nộp hợp lệ của người dùng hiện tại đối với đề bài này
  const usedPublic = submissions.filter(
    (s) => s.problem_id === activeProblemId && 
           (s.submission_type === 'public' || !s.submission_type) &&
           (currentUser ? s.user_id === currentUser.id : true) &&
           isCountedSubmission(s)
  ).length;

  const usedPrivate = submissions.filter(
    (s) => s.problem_id === activeProblemId && 
           s.submission_type === 'private' &&
           (currentUser ? s.user_id === currentUser.id : true) &&
           isCountedSubmission(s)
  ).length;

  const isPublicExhausted = hasNoProblems || usedPublic >= maxPublic;
  const isPrivateExhausted = hasNoProblems || usedPrivate >= maxPrivate;

  // -------------------------------------------------------------
  // TÍNH TOÁN ĐIỂM SỐ CAO NHẤT CỦA THÍ SINH (PUBLIC & PRIVATE)
  // -------------------------------------------------------------
  const userProblemSubs = submissions.filter(
    (s) => s.problem_id === activeProblemId && 
           (currentUser ? s.user_id === currentUser.id : true)
  );

  const publicScored = userProblemSubs.filter(
    (s) => (s.submission_type === 'public' || !s.submission_type) &&
           s.score !== null && s.score !== undefined &&
           s.status !== 'LỖI ĐỊNH DẠNG' && s.status !== 'INVALID_FORMAT' && s.status !== 'LỖI CHẤM ĐIỂM'
  );
  const bestPublicScore = publicScored.length > 0
    ? Math.max(...publicScored.map((s) => Number(s.score)))
    : null;

  const privateScored = userProblemSubs.filter(
    (s) => s.submission_type === 'private' &&
           s.score !== null && s.score !== undefined &&
           s.status !== 'LỖI ĐỊNH DẠNG' && s.status !== 'INVALID_FORMAT' && s.status !== 'LỖI CHẤM ĐIỂM'
  );
  const bestPrivateScore = privateScored.length > 0
    ? Math.max(...privateScored.map((s) => Number(s.score)))
    : null;

  // Tìm các ID bài nộp có điểm số cao nhất để bôi vàng trong bảng lịch sử
  const bestScoreSubIds = React.useMemo(() => {
    const ids = new Set<number>();
    const groups: { [key: string]: { maxScore: number; subIds: number[] } } = {};

    submissions.forEach((s) => {
      if (currentUser && s.user_id !== currentUser.id) return;
      if (s.score === null || s.score === undefined) return;
      if (s.status === 'LỖI ĐỊNH DẠNG' || s.status === 'INVALID_FORMAT' || s.status === 'LỖI CHẤM ĐIỂM') return;

      const pId = s.problem_id;
      const subType = s.submission_type || 'public';
      const key = `${pId}_${subType}`;

      const scoreNum = Number(s.score);
      if (isNaN(scoreNum)) return;

      if (!groups[key] || scoreNum > groups[key].maxScore) {
        groups[key] = { maxScore: scoreNum, subIds: [s.id] };
      } else if (scoreNum === groups[key].maxScore) {
        groups[key].subIds.push(s.id);
      }
    });

    Object.values(groups).forEach((g) => {
      g.subIds.forEach((id) => ids.add(id));
    });

    return ids;
  }, [submissions, currentUser]);

  // Trạng thái hết lượt & bị khóa của loại bài nộp đang chọn
  const isCurrentLocked = submissionType === 'private' && isPrivateLocked;
  const isCurrentExhausted = submissionType === 'public' ? isPublicExhausted : isPrivateExhausted;
  const currentUsed = submissionType === 'public' ? usedPublic : usedPrivate;
  const currentMax = submissionType === 'public' ? maxPublic : maxPrivate;
  const isCurrentBlocked = hasNoProblems || isCurrentLocked || isCurrentExhausted;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isCurrentBlocked) return;
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (!selected.name.toLowerCase().endsWith('.csv')) {
        setErrorMsg('Hệ thống chỉ chấp nhận tệp có định dạng .csv');
        return;
      }
      setFile(selected);
      setErrorMsg(null);
      setResultLine(null);
      setPipelineStep('idle');
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (isCurrentBlocked) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const dropped = e.dataTransfer.files[0];
      if (!dropped.name.toLowerCase().endsWith('.csv')) {
        setErrorMsg('Hệ thống chỉ chấp nhận tệp có định dạng .csv');
        return;
      }
      setFile(dropped);
      setErrorMsg(null);
      setResultLine(null);
      setPipelineStep('idle');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProblem || !activeProblemId) {
      setErrorMsg('Hiện tại không có đề thi nào mở nhận bài nộp.');
      return;
    }

    if (submissionType === 'private' && isPrivateLocked) {
      setErrorMsg(
        privateLockStatus.type === 'COUNTDOWN'
          ? `Khu vực nộp bài Private đang trong thời gian đếm ngược (Mở sau: ${privateLockStatus.formatted}).`
          : 'Khu vực nộp bài Private hiện đang bị khóa bởi Ban Tổ Chức.'
      );
      return;
    }

    if (isCurrentExhausted) {
      setErrorMsg(`Bạn đã sử dụng hết số lần nộp cho loại ${submissionType}_submit.csv (${currentUsed}/${currentMax} lượt).`);
      return;
    }

    if (!file) {
      setErrorMsg('Vui lòng chọn hoặc kéo thả file .csv trước khi nộp.');
      return;
    }

    try {
      setErrorMsg(null);
      setResultLine(null);

      // Bắt đầu Quy trình 1: Kiểm tra file
      setPipelineStep('step1');
      setStep1Msg('Đang đọc cấu trúc file, kiểm tra định dạng CSV, tiêu đề cột và số dòng...');

      // Gọi API nộp bài tới Backend
      const response = await submitSolution(activeProblemId, file, submissionType);

      // Chờ tạo hiệu ứng trực quan chạy qua từng bước
      await new Promise((resolve) => setTimeout(resolve, 800));

      if (!response.success) {
        setPipelineStep('error');
        setStep1Msg(response.step1_validation?.message || 'File CSV không hợp lệ');
        setErrorMsg(response.result_line || 'Kiểm tra file thất bại');
        onSubmissionSuccess();
        return;
      }

      // Hoàn tất Bước 1, chuyển sang Quy trình 2: Chấm điểm
      setStep1Msg(response.step1_validation?.message || 'File hợp lệ.');
      setPipelineStep('step2');
      setStep2Msg(`Đang đối chiếu nhãn dự đoán và tính toán điểm số theo độ đo ${activeProblem?.metric || 'độ đo'}...`);

      await new Promise((resolve) => setTimeout(resolve, 900));

      // Hoàn tất Bước 2: Hiển thị kết quả điểm 1 dòng
      setStep2Msg(response.step2_scoring?.message || 'Chấm điểm thành công.');
      setPipelineStep('finished');
      setResultLine(response.result_line);

      // Reset file input sau khi hoàn tất
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      onSubmissionSuccess();
    } catch (err: any) {
      setPipelineStep('error');
      setErrorMsg(err.message || 'Lỗi khi gửi bài nộp tới máy chủ chấm thi.');
    }
  };

  // Open Admin Edit Limits Modal
  const handleOpenEditLimits = () => {
    setEditMaxPublic(maxPublic);
    setEditMaxPrivate(maxPrivate);
    setEditPrivateIsLocked(Boolean(activeProblem?.private_is_locked));
    setEditPrivateUnlockAt(toDatetimeLocal(activeProblem?.private_unlock_at));
    setIsEditLimitsOpen(true);
  };

  const handleSaveLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProblemId) return;
    try {
      setIsSavingLimits(true);
      await updateProblem(activeProblemId, {
        max_public_submissions: editMaxPublic,
        max_private_submissions: editMaxPrivate,
        private_is_locked: editPrivateIsLocked,
        private_unlock_at: toUtcIsoString(editPrivateUnlockAt),
      });
      setIsEditLimitsOpen(false);
      onRefreshProblems();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi cập nhật cấu hình nộp bài');
    } finally {
      setIsSavingLimits(false);
    }
  };

  return (
    <div className="space-y-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-600 text-white flex items-center justify-center shadow-xs">
              <UploadCloud className="w-4 h-4" />
            </div>
            <span>Cổng Nộp Bài Thi & Chấm Điểm Tự Động OLP AI KMA</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Mỗi loại nộp (Public / Private) có giới hạn nộp riêng biệt. Khi hết lượt hoặc chưa đến giờ mở, khu vực nộp bài sẽ tự động khóa.
          </p>
        </div>

        {/* Admin Action: Chỉnh sửa số lần nộp & Khóa Private */}
        {isAdmin && activeProblem && (
          <button
            onClick={handleOpenEditLimits}
            className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all hover:scale-105 active:scale-95 cursor-pointer"
            title="Chỉnh sửa giới hạn số lần nộp và thời gian mở khóa Private cho đề này"
          >
            <Settings className="w-3.5 h-3.5 text-red-400" />
            <span>Cấu hình nộp & Mở khóa Private (Admin)</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Form: Submit Box */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* 1. Chọn đề bài (Chỉ các đề đã mở khóa và có Cấu hình đánh giá mới được đưa vào danh sách) */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                1. Chọn đề bài dự thi:
              </label>
              {hasNoProblems ? (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2.5 font-medium">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-slate-900 mb-0.5">Chưa có đề thi nào sẵn sàng nhận bài nộp</p>
                    <p className="text-slate-600">
                      Chỉ những đề bài đang <strong>Mở</strong> và đã được Quản trị viên <strong>Cấu hình loại đánh giá chấm điểm</strong> mới xuất hiện trong danh sách nộp bài.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <select
                    value={activeProblemId}
                    onChange={(e) => onSelectProblemId(Number(e.target.value))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-xs sm:text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-hidden"
                  >
                    {availableProblems.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.code}] - [{p.category}] {p.title} ({p.metric} • Cấu hình: {p.evaluation_config})
                      </option>
                    ))}
                  </select>
                  {activeProblem?.evaluation_config && (
                    <div className="flex items-center gap-2 text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 px-3.5 py-2 rounded-xl font-medium">
                      <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span>
                        Hệ thống chấm tự động: <span className="font-mono font-bold text-indigo-900 bg-indigo-100/70 px-1.5 py-0.5 rounded">{activeProblem.evaluation_config}</span> • Độ đo chuẩn: <strong className="text-slate-800">{activeProblem?.metric || 'Độ đo'}</strong>
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2. Chọn loại file nộp kèm số lần nộp & trạng thái giới hạn */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  2. Loại bài nộp & Giới hạn lượt thi:
                </label>
                {isAdmin && activeProblem && (
                  <button
                    type="button"
                    onClick={handleOpenEditLimits}
                    className="text-[11px] text-red-600 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Settings className="w-3 h-3" />
                    <span>Cấu hình & Mở khóa Private</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Public Submit Option Card */}
                <button
                  type="button"
                  onClick={() => {
                    setSubmissionType('public');
                    setErrorMsg(null);
                  }}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between relative ${
                    submissionType === 'public'
                      ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-200'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  } ${isPublicExhausted ? 'border-amber-300 bg-amber-50/20' : ''}`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono text-xs font-black text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md">
                        public_submit.csv
                      </span>
                      <Globe className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="text-xs font-bold text-slate-800">
                      Tập kiểm thử công khai (Public)
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">Đã nộp:</span>
                    <span className={`text-xs font-black font-mono px-2 py-0.5 rounded-md ${
                      hasNoProblems
                        ? 'bg-slate-100 text-slate-500'
                        : isPublicExhausted 
                        ? 'bg-rose-100 text-rose-700' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {hasNoProblems ? '—' : `${usedPublic}/${maxPublic} lần`} {isPublicExhausted && !hasNoProblems ? '• HẾT LƯỢT' : ''}
                    </span>
                  </div>
                </button>

                {/* Private Submit Option Card */}
                <button
                  type="button"
                  onClick={() => {
                    setSubmissionType('private');
                    setErrorMsg(null);
                  }}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between relative ${
                    submissionType === 'private'
                      ? 'border-red-500 bg-red-50/40 ring-2 ring-red-200'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  } ${isPrivateExhausted || isPrivateLocked ? 'border-amber-300 bg-amber-50/20' : ''}`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono text-xs font-black text-red-700 bg-red-100 px-2 py-0.5 rounded-md">
                        private_submit.csv
                      </span>
                      {privateLockStatus.type === 'COUNTDOWN' ? (
                        <Clock className="w-4 h-4 text-amber-600 animate-pulse" />
                      ) : privateLockStatus.type === 'LOCKED' ? (
                        <Lock className="w-4 h-4 text-rose-600" />
                      ) : (
                        <Lock className="w-4 h-4 text-red-600" />
                      )}
                    </div>
                    <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                      <span>Tập kiểm thử kín (Private)</span>
                      {isAdmin && privateLockStatus.type !== 'UNLOCKED' && (
                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                          Admin test
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-100 space-y-1">
                    {/* Badge trạng thái khóa / đếm ngược */}
                    {privateLockStatus.type === 'COUNTDOWN' ? (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-amber-700 font-bold flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-600" />
                          <span>Mở sau:</span>
                        </span>
                        <span className="text-xs font-black font-mono px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200 animate-pulse">
                          {privateLockStatus.formatted}
                        </span>
                      </div>
                    ) : privateLockStatus.type === 'LOCKED' ? (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-rose-600 font-bold">Trạng thái:</span>
                        <span className="text-xs font-black font-mono px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-200">
                          ĐANG KHÓA
                        </span>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">Đã nộp:</span>
                      <span className={`text-xs font-black font-mono px-2 py-0.5 rounded-md ${
                        hasNoProblems
                          ? 'bg-slate-100 text-slate-500'
                          : isPrivateExhausted 
                          ? 'bg-rose-100 text-rose-700' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {hasNoProblems ? '—' : `${usedPrivate}/${maxPrivate} lần`} {isPrivateExhausted && !hasNoProblems ? '• HẾT LƯỢT' : ''}
                      </span>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* 3. Drag & Drop CSV File Area (BỊ MỜ KÈM THÔNG TIN KHI HẾT SỐ LẦN NỘP, BỊ KHÓA HOẶC KHÔNG CÓ ĐỀ MỞ) */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                3. Tải lên tệp kết quả dự đoán (.csv):
              </label>

              {/* Thông báo nếu không có đề mở hoặc hết số lần nộp */}
              {hasNoProblems ? (
                <div className="mb-3 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 flex items-start gap-2.5 text-xs animate-in fade-in duration-150">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-amber-900">
                      Chưa có đề thi nào mở để nộp bài!
                    </div>
                    <div className="text-amber-700 text-[11px] mt-0.5">
                      Các đề thi hiện tại đang ở trạng thái Khóa hoặc Đang đếm ngược. Khu vực nộp bài sẽ tự động mở khi có đề thi khả dụng.
                    </div>
                  </div>
                </div>
              ) : isCurrentExhausted ? (
                <div className="mb-3 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2.5 text-xs animate-in fade-in duration-150">
                  <Ban className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-rose-900">
                      Đã hết số lần nộp cho bài nộp {submissionType}_submit.csv!
                    </div>
                    <div className="text-rose-700 text-[11px] mt-0.5">
                      Bạn đã sử dụng tối đa <strong>{currentUsed}/{currentMax} lượt</strong> nộp được cho phép. Khu vực nộp đã bị khóa để bảo đảm tính minh bạch của cuộc thi.
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Khu vực nộp file: BỊ MỜ (opacity-40 + pointer-events-none) KHI HẾT SỐ LẦN NỘP, BỊ KHÓA HOẶC KHÔNG CÓ ĐỀ */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => {
                  if (!isCurrentBlocked) fileInputRef.current?.click();
                }}
                className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition-all ${
                  isCurrentBlocked
                    ? 'opacity-40 pointer-events-none cursor-not-allowed bg-slate-100 border-slate-300'
                    : file
                    ? 'border-emerald-500 bg-emerald-50/30 cursor-pointer'
                    : 'border-slate-300 hover:border-blue-500 hover:bg-blue-50/20 cursor-pointer'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".csv"
                  disabled={isCurrentBlocked}
                  className="hidden"
                />

                {hasNoProblems ? (
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center mb-2">
                      <Lock className="w-6 h-6" />
                    </div>
                    <div className="text-sm font-bold text-slate-600">
                      Khu vực nộp bài đang tạm khóa
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Không có đề thi nào đang mở nhận bài nộp
                    </div>
                  </div>
                ) : isCurrentLocked ? (
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center mb-2">
                      <Lock className="w-6 h-6" />
                    </div>
                    <div className="text-sm font-bold text-slate-600">
                      Khu vực nộp Private đang khóa
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Vui lòng đợi đến giờ mở khóa để tiến hành nộp bài
                    </div>
                  </div>
                ) : isCurrentExhausted ? (
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center mb-2">
                      <Ban className="w-6 h-6" />
                    </div>
                    <div className="text-sm font-bold text-slate-600">
                      Khu vực nộp bài đã bị vô hiệu hóa
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Đã dùng hết {currentUsed}/{currentMax} lượt nộp ({submissionType}_submit.csv)
                    </div>
                  </div>
                ) : file ? (
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2">
                      <FileCheck className="w-6 h-6" />
                    </div>
                    <div className="text-sm font-bold text-slate-800 font-mono">{file.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {(file.size / 1024).toFixed(1)} KB • Quy đổi thành: <strong className="text-blue-700">{submissionType}_submit.csv</strong>
                    </div>
                    <span className="text-[11px] text-blue-600 underline mt-2 font-medium">
                      Nhấn để đổi file CSV khác
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-2">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <div className="text-sm font-bold text-slate-800">
                      Kéo thả file CSV vào đây hoặc <span className="text-blue-600 underline">chọn file</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      Chỉ nhận file .csv (sẽ lưu dưới dạng <strong>{submissionType}_submit.csv</strong>)
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Error Message if any */}
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isCurrentBlocked || pipelineStep === 'step1' || pipelineStep === 'step2'}
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-black text-sm shadow-md shadow-red-600/30 flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {hasNoProblems ? (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Đề thi đang khóa - Không thể nộp bài</span>
                </>
              ) : isCurrentLocked ? (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Vòng Private đang khóa</span>
                </>
              ) : isCurrentExhausted ? (
                <>
                  <Ban className="w-4 h-4" />
                  <span>Đã hết số lần nộp bài ({currentUsed}/{currentMax})</span>
                </>
              ) : pipelineStep === 'step1' || pipelineStep === 'step2' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang thực thi quy trình kiểm tra & chấm điểm...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Tiến hành nộp bài ({submissionType}_submit.csv)</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Info: 2-Step Pipeline Visual Display */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-5">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-red-600" />
              <span>Quy trình đánh giá bài nộp</span>
            </h3>

            {/* Step-by-step progress cards */}
            <div className="space-y-4">
              {/* Bước 1: Kiểm tra file */}
              <div className={`p-4 rounded-2xl border transition-all ${
                pipelineStep === 'step1'
                  ? 'border-blue-400 bg-blue-50/50 shadow-xs'
                  : pipelineStep === 'step2' || pipelineStep === 'finished'
                  ? 'border-emerald-200 bg-emerald-50/30'
                  : pipelineStep === 'error'
                  ? 'border-rose-200 bg-rose-50/30'
                  : 'border-slate-200 bg-slate-50/40'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                      pipelineStep === 'step1'
                        ? 'bg-blue-600 text-white'
                        : pipelineStep === 'step2' || pipelineStep === 'finished'
                        ? 'bg-emerald-600 text-white'
                        : pipelineStep === 'error'
                        ? 'bg-rose-600 text-white'
                        : 'bg-slate-300 text-slate-700'
                    }`}>
                      1
                    </span>
                    <span className="font-bold text-xs text-slate-900">
                      Quy trình 1: Kiểm tra tính hợp lệ file CSV
                    </span>
                  </div>

                  {pipelineStep === 'step1' && <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />}
                  {(pipelineStep === 'step2' || pipelineStep === 'finished') && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  )}
                  {pipelineStep === 'error' && <AlertCircle className="w-4 h-4 text-rose-600" />}
                </div>

                <div className="text-[11px] text-slate-500 pl-7 space-y-1">
                  <div>{step1Msg || 'Kiểm tra đuôi .csv, định dạng bảng, tiêu đề cột và số dòng dự đoán.'}</div>
                  {pipelineStep === 'error' && (
                    <div className="text-emerald-700 font-semibold text-[11px] flex items-center gap-1 mt-1">
                      <span>💡 Lỗi ở quy trình kiểm tra này không bị trừ số lần nộp của bạn.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Bước 2: Chấm điểm */}
              <div className={`p-4 rounded-2xl border transition-all ${
                pipelineStep === 'step2'
                  ? 'border-blue-400 bg-blue-50/50 shadow-xs'
                  : pipelineStep === 'finished'
                  ? 'border-emerald-200 bg-emerald-50/30'
                  : 'border-slate-200 bg-slate-50/40 opacity-70'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                      pipelineStep === 'step2'
                        ? 'bg-blue-600 text-white'
                        : pipelineStep === 'finished'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-300 text-slate-700'
                    }`}>
                      2
                    </span>
                    <span className="font-bold text-xs text-slate-900">
                      Quy trình 2: Chấm điểm ({activeProblem?.metric || 'Độ đo'})
                    </span>
                  </div>

                  {pipelineStep === 'step2' && <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />}
                  {pipelineStep === 'finished' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                </div>

                <div className="text-[11px] text-slate-500 pl-7">
                  {step2Msg || `Tính toán điểm số theo độ đo ${activeProblem?.metric || 'chuẩn'} trên tập ${submissionType.toUpperCase()}.`}
                </div>
              </div>
            </div>

            {/* Dòng kết quả điểm nổi bật sau khi hoàn tất */}
            {resultLine && pipelineStep === 'finished' && (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md animate-in fade-in zoom-in-95 duration-200">
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-100 flex items-center gap-1 mb-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>Hoàn tất quy trình chấm điểm</span>
                </div>
                <div className="font-black text-xs sm:text-sm tracking-tight leading-snug">
                  {resultLine}
                </div>
              </div>
            )}
          </div>

          {/* COMPONENT: ĐIỂM SỐ CAO NHẤT */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                <span>Điểm số cao nhất:</span>
              </h3>
              <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                {activeProblem?.code || '—'}
              </span>
            </div>

            <div className="space-y-3">
              {/* Public Test Highest Score */}
              <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                    <span>Public test:</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {bestPublicScore !== null ? `Độ đo: ${activeProblem?.metric || 'Chuẩn'}` : 'Chưa có điểm'}
                  </div>
                </div>
                <div className="font-mono font-black text-xl text-blue-700">
                  {bestPublicScore !== null ? bestPublicScore : '-'}
                </div>
              </div>

              {/* Private Test Highest Score */}
              <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-600"></span>
                    <span>Private test:</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {bestPrivateScore !== null 
                      ? `Độ đo: ${activeProblem?.metric || 'Chuẩn'}` 
                      : !isAdmin && userProblemSubs.some(s => s.submission_type === 'private' && (s.status === 'HỢP LỆ' || s.status === 'SUCCESS'))
                      ? 'Đã nộp (Bảo mật điểm)'
                      : 'Chưa có điểm'}
                  </div>
                </div>
                <div className="font-mono font-black text-xl text-rose-700">
                  {bestPrivateScore !== null ? bestPrivateScore : '-'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Submissions History */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            <span>Lịch sử và nhật ký trạng thái tất cả các lần nộp bài</span>
          </h3>
          <span className="text-xs font-semibold text-slate-500">
            {submissions.length} lần nộp đã ghi nhận
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-3 whitespace-nowrap">Mã đề</th>
                <th className="py-3 px-3 whitespace-nowrap">Loại nộp</th>
                <th className="py-3 px-3 whitespace-nowrap">Tên file</th>
                <th className="py-3 px-4 text-center whitespace-nowrap min-w-[140px]">Trạng thái</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Điểm số</th>
                <th className="py-3 px-3 max-w-[180px] truncate">Nhật ký</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Thời gian</th>
                <th className="py-3 px-3 text-center whitespace-nowrap min-w-[95px]">Tải file</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {submissions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Chưa có bài nộp nào được ghi nhận. Hãy tải lên file CSV để nộp bài!
                  </td>
                </tr>
              ) : (
                submissions.map((sub) => {
                  const isPrivate = sub.submission_type === 'private';
                  const isSuccess = sub.status === 'HỢP LỆ' || sub.status === 'SUCCESS';
                  const displayCode = sub.problem_code || (sub.problem_title ? sub.problem_title.split(']')[0].replace('[', '') : `P-${sub.problem_id}`);
                  const isBest = bestScoreSubIds.has(sub.id);

                  return (
                    <tr 
                      key={sub.id} 
                      className={`transition-colors ${
                        isBest
                          ? 'bg-amber-100/75 hover:bg-amber-100 border-l-4 border-l-amber-500 font-medium'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 inline-block shadow-2xs">
                          {displayCode}
                        </span>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                          isPrivate 
                            ? 'bg-rose-100 text-rose-800 border border-rose-200' 
                            : 'bg-blue-100 text-blue-800 border border-blue-200'
                        }`}>
                          {isPrivate ? 'private_submit.csv' : 'public_submit.csv'}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap max-w-[120px] truncate" title={sub.filename}>
                        {sub.filename}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap min-w-[140px]">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold whitespace-nowrap inline-block ${
                          isSuccess
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {sub.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-slate-900 text-sm whitespace-nowrap">
                        {sub.score !== null && sub.score !== undefined ? sub.score : '—'}
                      </td>
                      <td className="py-3 px-3 text-slate-500 max-w-[180px] truncate" title={sub.logs || ''}>
                        {sub.logs || 'Chấm điểm tự động'}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-400 whitespace-nowrap text-[11px]">
                        {new Date(sub.created_at).toLocaleString('vi-VN')}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap min-w-[95px]">
                        {sub.file_exists !== false && sub.status !== 'LỖI ĐỊNH DẠNG' ? (
                          <a
                            href={getCandidateSubmissionDownloadUrl(sub.id)}
                            download={sub.filename || `${sub.submission_type || 'public'}_submit.csv`}
                            title={`Tải xuống file bài nộp ${sub.filename || 'submission.csv'}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 hover:border-blue-300 transition-all shadow-2xs hover:scale-105 active:scale-95 cursor-pointer whitespace-nowrap"
                          >
                            <Download className="w-3.5 h-3.5 text-blue-600" />
                            <span>Tải về</span>
                          </a>
                        ) : (
                          <span
                            title="File không còn trên hệ thống (hoặc đã bị hủy do lỗi định dạng)"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-slate-400 bg-slate-100 border border-slate-200 cursor-not-allowed whitespace-nowrap"
                          >
                            <Download className="w-3 h-3 opacity-40" />
                            <span>Không có</span>
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

      {/* ======================================================== */}
      {/* MODAL: ADMIN CHỈNH SỬA SỐ LẦN NỘP & CẤU HÌNH KHÓA PRIVATE */}
      {/* ======================================================== */}
      {isEditLimitsOpen && activeProblem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[92vh] flex flex-col p-6 sm:p-8 shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Settings className="w-5 h-5 text-red-600" />
                <span>Cấu Hình Nộp Bài & Mở Khóa Private [{activeProblem?.code || ''}]</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsEditLimitsOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveLimits} className="mt-4 flex-1 overflow-y-auto space-y-4 pr-1">
              {/* PHẦN 1: GIỚI HẠN SỐ LẦN NỘP */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="text-xs font-black uppercase tracking-wider text-slate-800">
                  1. Giới hạn số lần nộp bài:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Số lần nộp tối đa Public:
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={editMaxPublic}
                      onChange={(e) => setEditMaxPublic(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden font-mono font-bold bg-white"
                      required
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Thí sinh đã nộp: <strong>{usedPublic}/{maxPublic}</strong> lần.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Số lần nộp tối đa Private:
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={editMaxPrivate}
                      onChange={(e) => setEditMaxPrivate(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden font-mono font-bold bg-white"
                      required
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Thí sinh đã nộp: <strong>{usedPrivate}/{maxPrivate}</strong> lần.
                    </span>
                  </div>
                </div>
              </div>

              {/* PHẦN 2: KHÓA & THỜI GIAN MỞ KHÓA VÒNG PRIVATE */}
              <div className="p-4 rounded-2xl bg-red-50/50 border border-red-200 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-black uppercase tracking-wider text-red-950 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-red-600" />
                    <span>2. Khóa & Hẹn Giờ Mở Khóa Vòng Private</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={editPrivateIsLocked} 
                      onChange={(e) => setEditPrivateIsLocked(e.target.checked)} 
                      className="sr-only peer" 
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600"></div>
                    <span className="ml-2 text-xs font-bold text-slate-700">
                      {editPrivateIsLocked ? 'Đang Khóa' : 'Mở'}
                    </span>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>Thời gian hẹn giờ mở khóa Private (Đếm ngược):</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={editPrivateUnlockAt}
                    onChange={(e) => setEditPrivateUnlockAt(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:border-red-500 focus:outline-hidden font-mono"
                  />
                  
                  {/* Phím tắt chọn nhanh thời gian */}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(Date.now() + 15 * 60 * 1000);
                        setEditPrivateUnlockAt(toDatetimeLocal(d));
                      }}
                      className="px-2 py-0.5 text-[10px] font-bold bg-white border border-slate-200 hover:border-red-400 rounded-md text-slate-600 cursor-pointer"
                    >
                      +15 phút
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(Date.now() + 60 * 60 * 1000);
                        setEditPrivateUnlockAt(toDatetimeLocal(d));
                      }}
                      className="px-2 py-0.5 text-[10px] font-bold bg-white border border-slate-200 hover:border-red-400 rounded-md text-slate-600 cursor-pointer"
                    >
                      +1 giờ
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
                        setEditPrivateUnlockAt(toDatetimeLocal(d));
                      }}
                      className="px-2 py-0.5 text-[10px] font-bold bg-white border border-slate-200 hover:border-red-400 rounded-md text-slate-600 cursor-pointer"
                    >
                      +1 ngày
                    </button>
                    {activeProblem.unlock_at && (
                      <button
                        type="button"
                        onClick={() => setEditPrivateUnlockAt(toDatetimeLocal(activeProblem.unlock_at))}
                        className="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-md text-indigo-700 cursor-pointer"
                        title="Đồng bộ với thời gian mở đề thi"
                      >
                        Theo giờ mở đề
                      </button>
                    )}
                    {editPrivateUnlockAt && (
                      <button
                        type="button"
                        onClick={() => setEditPrivateUnlockAt('')}
                        className="px-2 py-0.5 text-[10px] font-bold bg-red-100 border border-red-300 text-red-700 rounded-md hover:bg-red-200 cursor-pointer"
                      >
                        Xóa hẹn giờ (Mở ngay)
                      </button>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-500 mt-2">
                    💡 Đến thời gian này, hệ thống sẽ <strong>tự động mở khóa</strong> nhận bài nộp <code className="text-red-700 bg-red-100/70 px-1 rounded font-mono">private_submit.csv</code> cho tất cả thí sinh.
                  </p>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsEditLimitsOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingLimits}
                  className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-500 rounded-xl shadow-md flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {isSavingLimits ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>{isSavingLimits ? 'Đang lưu...' : 'Lưu cấu hình'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
