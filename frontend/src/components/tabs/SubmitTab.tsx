'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Problem, Submission, User, SubmissionJobResult } from '@/types';
import { updateProblem, getCandidateSubmissionDownloadUrl } from '@/lib/api';
import { prepareSubmission, readPendingSubmission, sendAndTrackSubmission, trackSubmission } from '@/lib/submissionTracker';
import { BestScoreNotebookCard } from '@/components/BestScoreNotebookCard';
import { SubmissionScheduleFields } from '@/components/SubmissionScheduleFields';
import { getItemLockStatus, toVietnamDatetimeLocal, vietnamDatetimeToUtc } from '@/lib/countdown';
import { formatScore } from '@/lib/scoreDisplay';

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
  const isWorking = pipelineStep === 'step1' || pipelineStep === 'step2';
  const [step1Msg, setStep1Msg] = useState<string>('');
  const [step2Msg, setStep2Msg] = useState<string>('');
  const [resultLine, setResultLine] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Admin edit limits modal state
  const [isEditLimitsOpen, setIsEditLimitsOpen] = useState(false);
  const [editMaxPublic, setEditMaxPublic] = useState(5);
  const [editMaxPrivate, setEditMaxPrivate] = useState(2);
  const [editPublicIsLocked, setEditPublicIsLocked] = useState(false);
  const [editPublicUnlockAt, setEditPublicUnlockAt] = useState('');
  const [editPrivateIsLocked, setEditPrivateIsLocked] = useState(false);
  const [editPrivateUnlockAt, setEditPrivateUnlockAt] = useState('');
  const [isSavingLimits, setIsSavingLimits] = useState(false);

  const isAdmin = currentUser?.role === 'admin';
  const availableProblems = problems.filter((problem) => (
    getItemLockStatus(problem.is_locked, problem.unlock_at, now).type === 'UNLOCKED'
    && Boolean(problem.evaluation_config && problem.evaluation_config.trim() !== '')
  ));
  const activeProblem = availableProblems.find((problem) => problem.id === selectedProblemId) || availableProblems[0];
  const activeProblemId = activeProblem?.id ?? 0;
  const hasNoProblems = availableProblems.length === 0;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const trackingController = useRef<AbortController | null>(null);
  const completionCallback = useRef(onSubmissionSuccess);

  const showJob = (job: SubmissionJobResult) => {
    const scoreContext = job.step2_scoring?.metric ? { metric: job.step2_scoring.metric } : activeProblem;
    const normalizedResult = job.success && job.score !== null
      ? `Điểm số đạt được: ${formatScore(job.score, scoreContext)}/100 (${scoreContext?.metric || 'Độ đo'})`
      : job.result_line;
    setStep1Msg(job.step1_validation?.message || 'Đang kiểm tra bài nộp.');
    setStep2Msg(job.success ? `Chấm điểm thành công trên tập ${job.submission_type.toUpperCase()}.` : job.step2_scoring?.message || 'Đang chấm điểm.');
    if (job.job_status === 'DONE' || job.job_status === 'FAILED') {
      setPipelineStep(job.success ? 'finished' : 'error');
      setResultLine(normalizedResult);
      setErrorMsg(job.success ? null : job.result_line);
      if (job.success) {
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
      completionCallback.current();
    } else {
      setPipelineStep('step1');
      setResultLine(null);
    }
  };
  const jobCallback = useRef(showJob);
  useEffect(() => {
    completionCallback.current = onSubmissionSuccess;
    jobCallback.current = showJob;
  });

  // Resume an accepted task after refresh, without uploading or spending another attempt.
  useEffect(() => {
    const userId = currentUser?.id;
    if (!userId) return;
    const pending = readPendingSubmission(userId);
    if (!pending) return;
    const controller = new AbortController();
    trackingController.current = controller;
    void trackSubmission(userId, pending, (job) => jobCallback.current(job), controller.signal)
      .then((job) => {
        if (!job && !controller.signal.aborted) {
          setPipelineStep('idle');
          setErrorMsg('Chưa xác nhận được bài nộp. Chọn lại file để gửi lại an toàn.');
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setPipelineStep('error');
          setErrorMsg(error.message || 'Chưa đọc được trạng thái bài đã gửi. Tải lại trang để thử tiếp.');
        }
      });
    return () => controller.abort();
  }, [currentUser?.id]);

  useEffect(() => () => trackingController.current?.abort(), []);

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
  const publicLockStatus = getItemLockStatus(activeProblem?.public_is_locked, activeProblem?.public_unlock_at, now);
  const isPublicLocked = !isAdmin && publicLockStatus.type !== 'UNLOCKED';

  // Hàm kiểm tra bài nộp hợp lệ để tính vào giới hạn số lần nộp.
  // QUY TẮC: Nếu bài nộp bị lỗi ở Quy trình 1 (Lỗi định dạng, cấu trúc CSV / chưa có điểm)
  // thì KHÔNG bị trừ số lần nộp, nhưng nhật ký và lịch sử vẫn được lưu đầy đủ.
  const isCountedSubmission = (s: Submission) => {
    const st = (s.status || '').toUpperCase();
    if (st === 'QUEUED' || st === 'PROCESSING') return true;
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
  const isCurrentLocked = submissionType === 'private' ? isPrivateLocked : isPublicLocked;
  const currentLockStatus = submissionType === 'private' ? privateLockStatus : publicLockStatus;
  const currentSplitName = submissionType === 'private' ? 'Private' : 'Public';
  const isCurrentExhausted = submissionType === 'public' ? isPublicExhausted : isPrivateExhausted;
  const currentUsed = submissionType === 'public' ? usedPublic : usedPrivate;
  const currentMax = submissionType === 'public' ? maxPublic : maxPrivate;
  const isCurrentBlocked = hasNoProblems || isCurrentLocked || isCurrentExhausted;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isCurrentBlocked || isWorking) return;
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
    if (isCurrentBlocked || isWorking) return;
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
    if (isWorking) return;
    if (!activeProblem || !activeProblemId) {
      setErrorMsg('Hiện tại không có đề thi nào mở nhận bài nộp.');
      return;
    }

    if (isCurrentLocked) {
      setErrorMsg(
        currentLockStatus.type === 'COUNTDOWN'
          ? `Khu vực nộp bài ${currentSplitName} đang trong thời gian đếm ngược (Mở sau: ${currentLockStatus.formatted}).`
          : `Khu vực nộp bài ${currentSplitName} hiện đang bị khóa bởi Ban Tổ Chức.`
      );
      return;
    }

    if (isCurrentExhausted) {
      setErrorMsg(`Bạn đã sử dụng hết số lần nộp cho ${currentSplitName} test (${currentUsed}/${currentMax} lượt).`);
      return;
    }

    if (!file) {
      setErrorMsg('Vui lòng chọn hoặc kéo thả file .csv trước khi nộp.');
      return;
    }
    if (!currentUser) {
      setErrorMsg('Vui lòng đăng nhập để nộp bài.');
      return;
    }

    try {
      setErrorMsg(null);
      setResultLine(null);

      // Bắt đầu Quy trình 1: Kiểm tra file
      setPipelineStep('step1');
      setStep1Msg('Đang đọc cấu trúc file, kiểm tra định dạng CSV, tiêu đề cột và số dòng...');

      const pending = prepareSubmission(currentUser.id, activeProblemId, file, submissionType);
      trackingController.current?.abort();
      const controller = new AbortController();
      trackingController.current = controller;
      await sendAndTrackSubmission(currentUser.id, pending, file,
        (job) => jobCallback.current(job), controller.signal);
    } catch (err: unknown) {
      if (trackingController.current?.signal.aborted) return;
      setPipelineStep('error');
      setErrorMsg(err instanceof Error ? err.message : 'Chưa xác nhận được bài nộp. Vui lòng thử lại.');
    }
  };

  // Open Admin Edit Limits Modal
  const handleOpenEditLimits = () => {
    setEditMaxPublic(maxPublic);
    setEditMaxPrivate(maxPrivate);
    setEditPublicIsLocked(Boolean(activeProblem?.public_is_locked));
    setEditPublicUnlockAt(toVietnamDatetimeLocal(activeProblem?.public_unlock_at));
    setEditPrivateIsLocked(Boolean(activeProblem?.private_is_locked));
    setEditPrivateUnlockAt(toVietnamDatetimeLocal(activeProblem?.private_unlock_at));
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
        public_is_locked: editPublicIsLocked,
        public_unlock_at: vietnamDatetimeToUtc(editPublicUnlockAt),
        private_is_locked: editPrivateIsLocked,
        private_unlock_at: vietnamDatetimeToUtc(editPrivateUnlockAt),
      });
      setIsEditLimitsOpen(false);
      onRefreshProblems();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Lỗi khi cập nhật cấu hình nộp bài');
    } finally {
      setIsSavingLimits(false);
    }
  };

  return (
    <div className="space-y-3 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
                        <span>Cổng Nộp Bài Thi & Chấm Điểm Tự Động OLP AI KMA</span>
          </h2>
        </div>

        {/* Admin Action: Chỉnh sửa số lần nộp & Khóa Private */}
        {isAdmin && activeProblem && (
          <button
            onClick={handleOpenEditLimits}
            className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all hover:scale-105 active:scale-95 cursor-pointer"
            title="Chỉnh sửa lượt nộp CSV và lịch mở nộp CSV/notebook Public, Private"
          >

            <span>Cấu hình lịch nộp Public / Private (Admin)</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Form: Submit Box */}
        <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-200 px-6 py-4 sm:px-8 sm:py-6 shadow-xs space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* 1. Chọn đề bài (Chỉ các đề đã mở khóa và có Cấu hình đánh giá mới được đưa vào danh sách) */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                1. Chọn đề bài dự thi:
              </label>
              {hasNoProblems ? (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2.5 font-medium">

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
                    disabled={isWorking}
                    onChange={(e) => onSelectProblemId(Number(e.target.value))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-xs sm:text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-hidden"
                  >
                    {availableProblems.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.code}] - [{p.category}] {p.title} ({p.metric}{isAdmin && p.evaluation_config ? ` • Cấu hình: ${p.evaluation_config}` : ''})
                      </option>
                    ))}
                  </select>
                  {isAdmin && activeProblem?.evaluation_config && (
                    <div className="flex items-center gap-2 text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 px-3.5 py-2 rounded-xl font-medium">

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

                    <span>Lịch nộp Public / Private</span>
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
                  disabled={isWorking}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between relative ${
                    submissionType === 'public'
                      ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-200'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  } ${isPublicExhausted || isPublicLocked ? 'border-amber-300 bg-amber-50/20' : ''}`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-blue-700">
                        Public test
                      </span>

                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-100 space-y-1">
                    {publicLockStatus.type === 'COUNTDOWN' ? (
                      <div className="flex items-center justify-between gap-1 text-[11px] font-bold text-amber-700">
                        <span>Mở sau:</span><span className="font-mono">{publicLockStatus.formatted}</span>
                      </div>
                    ) : publicLockStatus.type === 'LOCKED' ? (
                      <p className="text-[11px] font-bold text-rose-700">ĐANG KHÓA</p>
                    ) : null}
                    <div className="flex items-center justify-between">
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
                  </div>
                </button>

                {/* Private Submit Option Card */}
                <button
                  type="button"
                  onClick={() => {
                    setSubmissionType('private');
                    setErrorMsg(null);
                  }}
                  disabled={isWorking}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between relative ${
                    submissionType === 'private'
                      ? 'border-red-500 bg-red-50/40 ring-2 ring-red-200'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  } ${isPrivateExhausted || isPrivateLocked ? 'border-amber-300 bg-amber-50/20' : ''}`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-red-700">
                        Private test
                      </span>

                    </div>
                    <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
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

              {activeProblem && (
                <div className="submission-selection-shine mb-2 flex w-fit flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm font-semibold" aria-live="polite">
                  <span>Bạn đã chọn:</span>
                  {activeProblem.category === 'CV' && <span>Computer Vision</span>}
                  {activeProblem.category === 'NLP' && <span>Natural Language Processing</span>}
                  {submissionType === 'public' && <span>Public test</span>}
                  {submissionType === 'private' && <span>Private test</span>}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-stretch">
                <div className="min-w-0 flex flex-col">
                  {/* Thông báo nếu không có đề mở hoặc hết số lần nộp */}
                  {hasNoProblems ? (
                    <div className="mb-3 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 flex items-start gap-2.5 text-xs animate-in fade-in duration-150">

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

                      <div>
                        <div className="font-bold text-rose-900">
                          Đã hết số lần nộp cho {currentSplitName} test!
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
                      if (!isCurrentBlocked && !isWorking) fileInputRef.current?.click();
                    }}
                    className={`flex-1 flex flex-col justify-center border-2 border-dashed rounded-2xl px-6 py-1 sm:px-8 text-center transition-all ${
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
                      disabled={isCurrentBlocked || isWorking}
                      className="hidden"
                    />

                    {hasNoProblems ? (
                      <div className="flex flex-col items-center">

                        <div className="text-sm leading-4 font-bold text-slate-600">
                          Khu vực nộp bài đang tạm khóa
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          Không có đề thi nào đang mở nhận bài nộp
                        </div>
                      </div>
                    ) : isCurrentLocked ? (
                      <div className="flex flex-col items-center">

                        <div className="text-sm leading-4 font-bold text-slate-600">
                          Khu vực nộp {currentSplitName} đang khóa
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          Vui lòng đợi đến giờ mở khóa để tiến hành nộp bài
                        </div>
                      </div>
                    ) : isCurrentExhausted ? (
                      <div className="flex flex-col items-center">

                        <div className="text-sm leading-4 font-bold text-slate-600">
                          Khu vực nộp bài đã bị vô hiệu hóa
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          Đã dùng hết {currentUsed}/{currentMax} lượt nộp {currentSplitName} test
                        </div>
                      </div>
                    ) : file ? (
                      <div className="flex flex-col items-center">

                        <div className="text-sm leading-4 font-bold text-slate-800 font-mono">{file.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {(file.size / 1024).toFixed(1)} KB
                        </div>
                        <span className="text-[11px] text-blue-600 underline mt-2 font-medium">
                          Nhấn để đổi file CSV khác
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">

                        <div className="text-sm leading-4 font-bold text-slate-800">
                          Kéo thả file CSV vào đây hoặc <span className="text-blue-600 underline">chọn file</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          Chỉ nhận file .csv
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Step-by-step progress cards */}
                <div className="flex flex-col gap-2 min-w-0" aria-live="polite">
                  {/* Bước 1: Kiểm tra file */}
                  <div className={`flex-1 flex flex-col justify-center p-3 rounded-2xl border transition-all ${
                    pipelineStep === 'step1'
                      ? 'border-blue-400 bg-blue-50/50 shadow-xs'
                      : pipelineStep === 'step2' || pipelineStep === 'finished'
                      ? 'border-emerald-200 bg-emerald-50/30'
                      : pipelineStep === 'error'
                      ? 'border-rose-200 bg-rose-50/30'
                      : 'border-slate-200 bg-slate-50/40'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex min-w-0 items-start gap-2">
                        <span className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-black ${
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
                        <span className="font-bold text-[11px] leading-4 text-slate-900">
                          Kiểm tra tính hợp lệ file CSV
                        </span>
                      </div>

                    </div>

                    {(step1Msg || pipelineStep === 'error') && (
                      <div className="mt-1.5 text-[11px] text-slate-500 pl-7 space-y-1">
                        {step1Msg && <div>{step1Msg}</div>}
                        {pipelineStep === 'error' && (
                          <div className="text-emerald-700 font-semibold text-[11px] flex items-center gap-1 mt-1">
                            <span>Lỗi ở quy trình kiểm tra này không bị trừ số lần nộp của bạn.</span>
                          </div>
                      )}
                    </div>
                    )}
                  </div>

                  {/* Bước 2: Chấm điểm */}
                  <div className={`flex-1 flex flex-col justify-center p-3 rounded-2xl border transition-all ${
                    pipelineStep === 'step2'
                      ? 'border-blue-400 bg-blue-50/50 shadow-xs'
                      : pipelineStep === 'finished'
                      ? 'border-emerald-200 bg-emerald-50/30'
                      : 'border-slate-200 bg-slate-50/40 opacity-70'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex min-w-0 items-start gap-2">
                        <span className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-black ${
                          pipelineStep === 'step2'
                            ? 'bg-blue-600 text-white'
                            : pipelineStep === 'finished'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-300 text-slate-700'
                        }`}>
                          2
                        </span>
                        <span className="font-bold text-[11px] leading-4 text-slate-900">
                          Chấm điểm ({activeProblem?.metric || 'mAP'})
                        </span>
                      </div>

                    </div>

                    {(step2Msg || (resultLine && pipelineStep === 'finished')) && (
                      <div className="mt-1.5 text-[11px] text-slate-500 pl-7">
                        {step2Msg}
                        {resultLine && pipelineStep === 'finished' && (
                          <p className="mt-2 font-semibold text-emerald-700">{resultLine}</p>
                      )}
                    </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Error Message if any */}
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2 font-medium">

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

                  <span>Đề thi đang khóa - Không thể nộp bài</span>
                </>
              ) : isCurrentLocked ? (
                <>

                  <span>Vòng {currentSplitName} đang khóa</span>
                </>
              ) : isCurrentExhausted ? (
                <>

                  <span>Đã hết số lần nộp bài ({currentUsed}/{currentMax})</span>
                </>
              ) : pipelineStep === 'step1' || pipelineStep === 'step2' ? (
                <>

                  <span>Đang thực thi quy trình kiểm tra & chấm điểm...</span>
                </>
              ) : (
                <>

                  <span>Tiến hành nộp bài</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Info: Highest scores */}
        <div className="lg:col-span-4 min-w-0">
          <BestScoreNotebookCard
            key={`${currentUser?.id ?? 0}:${activeProblemId}`}
            problem={activeProblem}
            currentUser={currentUser}
            bestPublicScore={bestPublicScore}
            bestPrivateScore={bestPrivateScore}
            privateLocked={isPrivateLocked}
            publicLocked={isPublicLocked}
            publicCountdown={publicLockStatus.type === 'COUNTDOWN' ? publicLockStatus.formatted : undefined}
            privateCountdown={privateLockStatus.type === 'COUNTDOWN' ? privateLockStatus.formatted : undefined}
          />
        </div>
      </div>

      {/* Submissions History */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">

            <span>Lịch sử và nhật ký trạng thái tất cả các lần nộp bài</span>
          </h3>
          <span className="text-xs font-semibold text-slate-500">
            {submissions.length} lần nộp đã ghi nhận
          </span>
        </div>

        <div className="max-h-[min(60vh,560px)] overflow-auto overscroll-contain [scrollbar-gutter:stable]" role="region" aria-label="Lịch sử nộp bài" tabIndex={0}>
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-3 whitespace-nowrap">Mã đề</th>
                <th className="py-3 px-3 whitespace-nowrap">Loại nộp</th>
                <th className="py-3 px-3 whitespace-nowrap">Tên file</th>
                <th className="py-3 px-4 text-center whitespace-nowrap min-w-[140px]">Trạng thái</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Điểm số /100</th>
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
                  const isPending = sub.status === 'QUEUED' || sub.status === 'PROCESSING';
                  const displayCode = sub.problem_code || (sub.problem_title ? sub.problem_title.split(']')[0].replace('[', '') : `P-${sub.problem_id}`);
                  const isBest = bestScoreSubIds.has(sub.id);
                  const displayedFilename = sub.filename === 'public_submit.csv' || sub.filename === 'private_submit.csv'
                    ? 'File kết quả (.csv)'
                    : sub.filename;
                  const scoreProblem = problems.find((problem) => problem.id === sub.problem_id);
                  const displayedLogs = isSuccess && sub.score !== null && sub.score !== undefined
                    ? `Điểm: ${formatScore(sub.score, scoreProblem)}/100 (${scoreProblem?.metric || 'Độ đo'})`
                    : sub.logs || 'Chấm điểm tự động';

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
                        <span className="font-mono font-bold text-xs text-blue-700">
                          {displayCode}
                        </span>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`font-mono text-[10px] font-bold ${
                          isPrivate
                            ? 'text-rose-700'
                            : 'text-blue-700'
                        }`}>
                          {isPrivate ? 'Private test' : 'Public test'}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap max-w-[120px] truncate" title={displayedFilename}>
                        {displayedFilename}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap min-w-[140px]">
                        <span className={`text-[10px] font-bold whitespace-nowrap ${
                          isSuccess
                            ? 'text-emerald-700'
                            : isPending ? 'text-blue-700' : 'text-rose-700'
                        }`}>
                          {sub.status === 'QUEUED' ? 'CHỜ KIỂM TRA' : sub.status === 'PROCESSING' ? 'ĐANG CHẤM' : sub.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-slate-900 text-sm whitespace-nowrap">
                        {formatScore(sub.score, scoreProblem)}
                      </td>
                      <td className="py-3 px-3 text-slate-500 max-w-[180px] truncate" title={displayedLogs}>
                        {displayedLogs}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-400 whitespace-nowrap text-[11px]">
                        {new Date(sub.created_at).toLocaleString('vi-VN')}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap min-w-[95px]">
                        {sub.file_exists !== false && sub.status !== 'LỖI ĐỊNH DẠNG' ? (
                          <a
                            href={getCandidateSubmissionDownloadUrl(sub.id)}
                            download={sub.filename || `${sub.submission_type || 'public'}_submit.csv`}
                            title={`Tải xuống ${displayedFilename || 'file bài nộp'}`}
                            className="text-xs font-bold text-blue-700 hover:underline cursor-pointer whitespace-nowrap"
                          >

                            <span>Tải về</span>
                          </a>
                        ) : (
                          <span
                            title="File không còn trên hệ thống (hoặc đã bị hủy do lỗi định dạng)"
                            className="text-[10px] text-slate-400 cursor-not-allowed whitespace-nowrap"
                          >

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

                <span>Lịch nộp Public / Private [{activeProblem?.code || ''}]</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsEditLimitsOpen(false)}
                className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-900 cursor-pointer transition-colors"
              >
                Đóng
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

              <SubmissionScheduleFields
                showIcons={false}
                split="public" locked={editPublicIsLocked} unlockAt={editPublicUnlockAt}
                problemUnlockAt={activeProblem.unlock_at}
                onLockedChange={setEditPublicIsLocked} onUnlockAtChange={setEditPublicUnlockAt}
              />
              <SubmissionScheduleFields
                showIcons={false}
                split="private" locked={editPrivateIsLocked} unlockAt={editPrivateUnlockAt}
                problemUnlockAt={activeProblem.unlock_at}
                onLockedChange={setEditPrivateIsLocked} onUnlockAtChange={setEditPrivateUnlockAt}
              />

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
