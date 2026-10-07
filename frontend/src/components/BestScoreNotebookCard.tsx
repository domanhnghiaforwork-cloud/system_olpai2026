'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, FileCode2, Loader2, Trophy, UploadCloud } from 'lucide-react';
import { Problem, TrainingNotebook, User } from '@/types';
import { downloadTrainingNotebook, fetchTrainingNotebooks, submitTrainingNotebook } from '@/lib/api';
import { formatScore } from '@/lib/scoreDisplay';

interface Props {
  problem: Problem | undefined;
  currentUser: User | null;
  bestPublicScore: number | null;
  bestPrivateScore: number | null;
  privateLocked: boolean;
  publicLocked: boolean;
  publicCountdown?: string;
  privateCountdown?: string;
}

export function BestScoreNotebookCard({ problem, currentUser, bestPublicScore, bestPrivateScore, privateLocked, publicLocked, publicCountdown, privateCountdown }: Props) {
  const [tab, setTab] = useState<'public' | 'private'>('public');
  const [notebooks, setNotebooks] = useState<TrainingNotebook[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const problemId = problem?.id;
  const isStudent = currentUser?.role === 'user';

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    if (problemId && isStudent) {
      void fetchTrainingNotebooks(problemId, controller.signal).then((items) => {
        if (controller.signal.aborted) return;
        setNotebooks(items);
        setStatus('ready');
      }).catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Không tải được trạng thái notebook.');
      });
    }
    return () => { mounted.current = false; controller.abort(); };
  }, [problemId, isStudent]);

  const notebook = notebooks.find((item) => item.submission_type === tab);
  const score = tab === 'public' ? bestPublicScore : bestPrivateScore;
  const locked = !problem || (tab === 'private' ? privateLocked : publicLocked);
  const countdown = tab === 'private' ? privateCountdown : publicCountdown;
  const blocked = locked || Boolean(notebook) || status !== 'ready' || uploading;

  const selectTab = (split: 'public' | 'private') => {
    setTab(split);
    setFile(null);
    setMessage('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const refreshNotebooks = async () => {
    if (!problemId) return;
    setStatus('loading');
    setMessage('');
    try {
      const items = await fetchTrainingNotebooks(problemId);
      if (!mounted.current) return;
      setNotebooks(items);
      setStatus('ready');
    } catch (error: unknown) {
      if (!mounted.current) return;
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Không tải được trạng thái notebook.');
    }
  };

  const upload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!problemId || !file || blocked) return;
    setUploading(true);
    setMessage('');
    try {
      const uploaded = await submitTrainingNotebook(problemId, tab, file);
      if (!mounted.current) return;
      setNotebooks((previous) => [...previous.filter((item) => item.submission_type !== uploaded.submission_type), uploaded]);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      setMessage('Đã nộp notebook huấn luyện thành công.');
    } catch (error: unknown) {
      if (!mounted.current) return;
      // Reconcile a duplicate or lost response before allowing another attempt.
      try {
        const items = await fetchTrainingNotebooks(problemId);
        if (!mounted.current) return;
        setNotebooks(items);
        setStatus('ready');
      } catch {
        if (!mounted.current) return;
        setStatus('error');
      }
      setMessage(error instanceof Error ? error.message : 'Không thể nộp notebook.');
    } finally {
      if (mounted.current) setUploading(false);
    }
  };

  const download = async () => {
    if (!notebook) return;
    setDownloading(true);
    setMessage('');
    try { await downloadTrainingNotebook(notebook); }
    catch (error: unknown) {
      if (mounted.current) setMessage(error instanceof Error ? error.message : 'Không thể tải notebook.');
    } finally { if (mounted.current) setDownloading(false); }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-500 shrink-0" />
          <span>Điểm số cao nhất</span>
        </h3>
        <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded-lg border border-blue-200">
          {problem?.code || '—'}
        </span>
      </div>

      <div role="tablist" aria-label="Điểm cao nhất và notebook theo tập" className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl"
        onKeyDown={(event) => {
          if (uploading || downloading || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const nextTab = event.key === 'Home' ? 'public' : event.key === 'End' ? 'private' : tab === 'public' ? 'private' : 'public';
          selectTab(nextTab);
          document.getElementById(`notebook-tab-${nextTab}`)?.focus();
        }}>
        {(['public', 'private'] as const).map((split) => (
          <button key={split} type="button" role="tab" id={`notebook-tab-${split}`} aria-controls={`notebook-panel-${split}`} aria-selected={tab === split}
            tabIndex={tab === split ? 0 : -1}
            disabled={uploading || downloading}
            onClick={() => selectTab(split)}
            className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors disabled:cursor-wait ${tab === split ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>
            {split === 'public' ? 'Public' : 'Private'}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`notebook-panel-${tab}`} aria-labelledby={`notebook-tab-${tab}`} className="space-y-4">
        <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-slate-700">{tab === 'public' ? 'Public test' : 'Private test'}</div>
            <div className="text-[10px] text-slate-500 mt-1">
              {score !== null ? `Độ đo: ${problem?.metric || 'Chuẩn'} • Thang 100` : 'Chưa có điểm'}
            </div>
          </div>
          <div className={`font-mono font-black text-xl ${tab === 'public' ? 'text-blue-700' : 'text-rose-700'}`}>
            {formatScore(score, problem)}
          </div>
        </div>

        {isStudent && (
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5"><FileCode2 className="w-4 h-4 shrink-0" />File huấn luyện (.ipynb)</h4>
              <span className="text-[10px] font-bold whitespace-nowrap text-slate-500">{notebook ? '1/1 đã nộp' : '0/1 đã nộp'}</span>
            </div>
            {notebook ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
                <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 shrink-0" />Đã nộp notebook {tab === 'public' ? 'Public' : 'Private'}</p>
                <p className="text-xs text-slate-700 break-all">{notebook.filename}</p>
                <p className="text-[10px] text-slate-500">{new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(notebook.created_at) ? notebook.created_at : `${notebook.created_at}Z`).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>
                <button type="button" onClick={() => void download()} disabled={downloading} className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:underline disabled:opacity-50">
                  {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}Tải notebook đã nộp
                </button>
                <p className="text-[10px] text-emerald-700">Đã sử dụng lượt nộp duy nhất của tập này.</p>
              </div>
            ) : (
              <form onSubmit={(event) => void upload(event)} className="space-y-3">
                <p className="text-[11px] leading-relaxed text-slate-500">Mỗi tập được nộp 1 notebook, tối đa 20 MB. Kiểm tra kỹ file trước khi nộp.</p>
                {locked ? <p className="text-xs text-amber-700">{problem ? `Tập ${tab === 'public' ? 'Public' : 'Private'} chưa mở nhận notebook.${countdown ? ` Mở sau: ${countdown}.` : ''}` : 'Chưa có đề thi mở nhận bài.'}</p> : status === 'loading' ? <p className="text-xs text-slate-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Đang kiểm tra lượt nộp...</p> : null}
                <label htmlFor="training-notebook-file" className="block text-[11px] font-semibold text-slate-700">Chọn notebook {tab === 'public' ? 'Public' : 'Private'}</label>
                <input id="training-notebook-file" type="file" ref={inputRef} accept=".ipynb" disabled={blocked}
                  onChange={(event) => {
                    const selected = event.target.files?.[0];
                    setFile(null); setMessage('');
                    if (!selected) return;
                    if (!selected.name.toLowerCase().endsWith('.ipynb') || selected.size > 20 * 1024**2) {
                      setMessage('Vui lòng chọn file .ipynb không quá 20 MB.'); event.target.value = ''; return;
                    }
                    setFile(selected);
                  }}
                  className="block w-full min-w-0 text-[11px] text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-blue-50 file:px-2 file:py-2 file:font-semibold file:text-blue-700 disabled:opacity-50" />
                <button type="submit" disabled={blocked || !file} className="w-full rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}{uploading ? 'Đang nộp notebook...' : `Nộp notebook ${tab === 'public' ? 'Public' : 'Private'}`}
                </button>
              </form>
            )}
            <div aria-live="polite" className="space-y-2">
              {message && <p className="text-[11px] leading-relaxed text-slate-600">{message}</p>}
              {status === 'error' && <button type="button" onClick={() => void refreshNotebooks()} className="text-xs text-blue-700 font-semibold hover:underline">Tải lại trạng thái notebook</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
