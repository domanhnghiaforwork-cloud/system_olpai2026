import type { SubmissionJobResult } from '@/types';
import { findSubmissionByRequest, getAuthToken, getSubmissionStatus, submitSolution } from './api';

export interface PendingSubmission {
  requestId: string;
  submissionId?: number;
  problemId: number;
  submissionType: 'public' | 'private';
  fileFingerprint: string;
}

const storageKey = (userId: number) => `olpai_pending_submission:${userId}`;

export function readPendingSubmission(userId: number): PendingSubmission | null {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(userId)) || 'null');
    if (!value || typeof value.requestId !== 'string' || typeof value.problemId !== 'number'
        || !['public', 'private'].includes(value.submissionType) || typeof value.fileFingerprint !== 'string'
        || (value.submissionId !== undefined && typeof value.submissionId !== 'number')) return null;
    return value;
  } catch { return null; }
}

function savePending(userId: number, pending: PendingSubmission) {
  localStorage.setItem(storageKey(userId), JSON.stringify(pending));
}

function clearPending(userId: number, requestId: string) {
  if (readPendingSubmission(userId)?.requestId === requestId) localStorage.removeItem(storageKey(userId));
}

export function prepareSubmission(userId: number, problemId: number, file: File,
                                  submissionType: 'public' | 'private'): PendingSubmission {
  const previous = readPendingSubmission(userId);
  const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
  if (previous?.submissionId) throw new Error('Bạn đang có bài chờ chấm. Hãy chờ kết quả trước khi nộp tiếp.');
  if (previous && previous.problemId === problemId && previous.submissionType === submissionType
      && previous.fileFingerprint === fingerprint) return previous;
  const pending = { requestId: crypto.randomUUID(), problemId, submissionType, fileFingerprint: fingerprint };
  // Persist before upload: if the response is lost, retry uses the same UUID.
  savePending(userId, pending);
  return pending;
}

function delay(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, 1500);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

export async function trackSubmission(userId: number, pending: PendingSubmission,
  onProgress: (job: SubmissionJobResult) => void, signal: AbortSignal,
  initial?: SubmissionJobResult): Promise<SubmissionJobResult | null> {
  const token = getAuthToken();
  let job = initial;
  if (!job) job = (pending.submissionId
    ? await getSubmissionStatus(pending.submissionId, signal)
    : await findSubmissionByRequest(pending.requestId, signal)) ?? undefined;
  if (!job) return null;
  if (signal.aborted || getAuthToken() !== token) throw new DOMException('Aborted', 'AbortError');
  pending.submissionId = job.submission_id;
  savePending(userId, pending);
  const deadline = Date.now() + 15 * 60_000;
  while (!signal.aborted && getAuthToken() === token) {
    onProgress(job);
    if (job.job_status === 'DONE' || job.job_status === 'FAILED') {
      clearPending(userId, pending.requestId);
      return job;
    }
    if (Date.now() > deadline) throw new Error('Bài đã được ghi nhận và vẫn đang chờ xử lý. Tải lại trang để tiếp tục theo dõi.');
    await delay(signal);
    try { job = await getSubmissionStatus(job.submission_id, signal); }
    catch (error) {
      if (signal.aborted || getAuthToken() !== token) throw error;
      // A transient network failure does not turn an accepted job into a failure.
    }
  }
  throw new DOMException('Aborted', 'AbortError');
}

export async function sendAndTrackSubmission(userId: number, pending: PendingSubmission, file: File,
  onProgress: (job: SubmissionJobResult) => void, signal: AbortSignal) {
  const token = getAuthToken();
  let accepted: SubmissionJobResult;
  try {
    accepted = await submitSolution(pending.problemId, file, pending.submissionType, pending.requestId, signal);
  } catch (error) {
    if (signal.aborted) throw error;
    // The server may have committed even though the upload response timed out.
    const existing = await findSubmissionByRequest(pending.requestId, signal).catch(() => null);
    if (!existing) throw error;
    accepted = existing;
  }
  if (signal.aborted || getAuthToken() !== token) throw new DOMException('Aborted', 'AbortError');
  return trackSubmission(userId, pending, onProgress, signal, accepted);
}
