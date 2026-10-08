import { 
  User, 
  Problem, 
  Dataset, 
  Submission, 
  AdminSubmission, 
  LeaderboardItem, 
  OverallLeaderboardItem,
  AdminStats, 
  EvaluatorOption,
  BatchCreateUserParams,
  BatchCreateUserResponse,
  SubmissionJobResult,
  TrainingNotebook,
} from '@/types';
import { resetChatbotSession, waitForChatbotSessionReset } from './chatbotSession';

export const API_BASE = (typeof window !== 'undefined' && !process.env.NEXT_PUBLIC_API_URL)
  ? '' 
  : (process.env.NEXT_PUBLIC_API_URL || '');

const TOKEN_KEY = 'olp_ai_kma_jwt_token';

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(TOKEN_KEY, token);
    resetChatbotSession();
  }
}

export function clearAuthToken(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY);
    resetChatbotSession();
  }
}

function getAuthHeaders(isJson: boolean = false): Record<string, string> {
  const headers: Record<string, string> = {
    'ngrok-skip-browser-warning': 'true',
  };
  if (isJson) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function createChatbotTicket(): Promise<string> {
  await waitForChatbotSessionReset();
  const response = await fetch(`${API_BASE}/api/auth/chatbot-ticket`, {
    method: 'POST', cache: 'no-store', headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error('Không thể đăng nhập Chatbot từ system.');
  const data = await response.json() as { ticket: string };
  return data.ticket;
}

export async function fetchEvaluators(): Promise<EvaluatorOption[]> {
  const res = await fetch(`${API_BASE}/api/problems/evaluators`, { 
    cache: 'no-store',
    headers: getAuthHeaders() 
  });
  if (!res.ok) throw new Error('Failed to fetch evaluators');
  return res.json();
}

export async function fetchCurrentUser(): Promise<User | null> {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, { 
      cache: 'no-store',
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(15_000),
    });
    if (getAuthToken() !== token) return null;
    if (!res.ok) {
      if (res.status === 401) {
        clearAuthToken();
        return null;
      }
      throw new Error('Chưa đọc được thông tin đăng nhập. Vui lòng thử lại.');
    }
    const data = await res.json();
    if (getAuthToken() !== token) return null;
    if (!data || !data.id) {
      clearAuthToken();
      return null;
    }
    return data;
  } catch (error) {
    if (getAuthToken() !== token) return null;
    throw error;
  }
}

export async function fetchUsers(): Promise<User[]> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/users`, { 
      cache: 'no-store',
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function switchUser(userId: number): Promise<User> {
  const res = await fetch(`${API_BASE}/api/auth/switch-user/${userId}`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to switch user');
  const data = await res.json();
  if (data.access_token) {
    setAuthToken(data.access_token);
  }
  return data;
}

export async function loginUser(username: string, password: string): Promise<User> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Đăng nhập không thành công');
  }
  const data = await res.json();
  if (data.access_token) {
    setAuthToken(data.access_token);
  }
  return data;
}

export async function logoutUser(): Promise<void> {
  const headers = getAuthHeaders();
  // Clear both browser sessions immediately, even if the logout API is offline.
  clearAuthToken();
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers,
    });
  } catch {}
}

export async function fetchProblems(category?: string): Promise<Problem[]> {
  const url = category && category !== 'all' 
    ? `${API_BASE}/api/problems?category=${category}` 
    : `${API_BASE}/api/problems`;
  const res = await fetch(url, { 
    cache: 'no-store',
    headers: getAuthHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error('Failed to fetch problems');
  return res.json();
}

export async function fetchProblem(id: number): Promise<Problem> {
  const res = await fetch(`${API_BASE}/api/problems/${id}`, { 
    cache: 'no-store',
    headers: getAuthHeaders() 
  });
  if (!res.ok) throw new Error('Failed to fetch problem details');
  return res.json();
}

export async function createProblem(formData: FormData): Promise<Problem> {
  const res = await fetch(`${API_BASE}/api/problems`, {
    method: 'POST',
    headers: getAuthHeaders(false),
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không thể tạo đề thi mới');
  }
  return res.json();
}

export async function updateProblem(id: number, data: Partial<Problem>): Promise<Problem> {
  const res = await fetch(`${API_BASE}/api/problems/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(true),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không thể cập nhật đề thi');
  }
  return res.json();
}

export async function uploadProblemPdf(id: number, file: File): Promise<Problem> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/api/problems/${id}/upload-pdf`, {
    method: 'POST',
    headers: getAuthHeaders(false),
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không thể tải lên file PDF');
  }
  return res.json();
}

export async function deleteProblem(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/problems/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không thể xóa đề thi');
  }
}

export async function fetchDatasets(problemId?: number): Promise<Dataset[]> {
  const url = problemId ? `${API_BASE}/api/datasets?problem_id=${problemId}` : `${API_BASE}/api/datasets`;
  const res = await fetch(url, { 
    cache: 'no-store',
    headers: getAuthHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error('Failed to fetch datasets');
  return res.json();
}

export async function createDataset(data: {
  problem_id: number;
  title: string;
  download_url: string;
  size_str?: string;
  category?: string;
  description?: string;
  is_locked?: boolean;
  unlock_at?: string | null;
}): Promise<Dataset> {
  const res = await fetch(`${API_BASE}/api/datasets`, {
    method: 'POST',
    headers: getAuthHeaders(true),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không thể tạo mục dữ liệu');
  }
  return res.json();
}

export async function updateDataset(id: number, data: Partial<Dataset>): Promise<Dataset> {
  const res = await fetch(`${API_BASE}/api/datasets/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(true),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không thể cập nhật mục dữ liệu');
  }
  return res.json();
}

export async function deleteDataset(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/datasets/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không thể xóa mục dữ liệu');
  }
}

export async function fetchSubmissions(problemId?: number): Promise<Submission[]> {
  const url = problemId ? `${API_BASE}/api/submissions?problem_id=${problemId}` : `${API_BASE}/api/submissions`;
  const res = await fetch(url, { 
    cache: 'no-store',
    headers: getAuthHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error('Chưa tải được lịch sử bài nộp.');
  return res.json();
}

export async function fetchTrainingNotebooks(problemId: number, signal?: AbortSignal): Promise<TrainingNotebook[]> {
  const res = await fetch(`${API_BASE}/api/training-notebooks?problem_id=${problemId}`, {
    cache: 'no-store', headers: getAuthHeaders(),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error('Không tải được trạng thái notebook. Vui lòng thử lại.');
  return res.json();
}

export async function submitTrainingNotebook(problemId: number, split: 'public' | 'private', file: File): Promise<TrainingNotebook> {
  const body = new FormData();
  body.append('problem_id', String(problemId));
  body.append('submission_type', split);
  body.append('file', file);
  const res = await fetch(`${API_BASE}/api/training-notebooks`, {
    method: 'POST', headers: getAuthHeaders(), body, signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || 'Không thể nộp notebook huấn luyện.');
  }
  return res.json();
}

export async function downloadTrainingNotebook(notebook: TrainingNotebook): Promise<void> {
  const res = await fetch(`${API_BASE}/api/training-notebooks/${notebook.id}/download`, {
    headers: getAuthHeaders(), signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error('Không thể tải notebook đã nộp.');
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = notebook.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Keep the blob available while the browser starts/writes the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function submitSolution(
  problemId: number, 
  file: File, 
  submissionType: 'public' | 'private' = 'public',
  clientRequestId: string = crypto.randomUUID(),
  signal?: AbortSignal,
): Promise<SubmissionJobResult> {
  const formData = new FormData();
  formData.append('problem_id', problemId.toString());
  formData.append('submission_type', submissionType);
  formData.append('file', file);
  formData.append('client_request_id', clientRequestId);

  const res = await fetch(`${API_BASE}/api/submissions`, {
    method: 'POST',
    headers: getAuthHeaders(false),
    body: formData,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180_000)]) : AbortSignal.timeout(180_000),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Lỗi khi gửi bài nộp');
  }
  return res.json();
}

export async function getSubmissionStatus(id: number, signal?: AbortSignal): Promise<SubmissionJobResult> {
  const res = await fetch(`${API_BASE}/api/submissions/${id}/status`, {
    cache: 'no-store', headers: getAuthHeaders(),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Không đọc được trạng thái bài nộp (${res.status}).`);
  return res.json();
}

export async function findSubmissionByRequest(requestId: string, signal?: AbortSignal): Promise<SubmissionJobResult | null> {
  const res = await fetch(`${API_BASE}/api/submissions/by-request/${encodeURIComponent(requestId)}`, {
    cache: 'no-store', headers: getAuthHeaders(),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Không xác nhận được bài nộp (${res.status}).`);
  return res.json();
}

export async function fetchLeaderboard(
  problemCode?: string,
  type: 'public' | 'private' = 'public'
): Promise<LeaderboardItem[]> {
  const params = new URLSearchParams();
  if (problemCode) params.set('problem_code', problemCode);
  params.set('type', type);

  const url = `${API_BASE}/api/leaderboard?${params.toString()}`;
  const res = await fetch(url, { 
    cache: 'no-store',
    headers: getAuthHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không thể tải bảng xếp hạng');
  }
  return res.json();
}

export async function fetchOverallLeaderboard(type: 'public' | 'private' = 'public'): Promise<OverallLeaderboardItem[]> {
  const url = `${API_BASE}/api/leaderboard/overall?type=${type}`;
  const res = await fetch(url, { 
    cache: 'no-store',
    headers: getAuthHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không thể tải bảng xếp hạng tổng');
  }
  return res.json();
}

export async function fetchAdminOverview(): Promise<{ stats: AdminStats; recent_submissions: {
  id: number; user: string; problem: string; score: number | null; status: string; time: string;
}[] }> {
  const res = await fetch(`${API_BASE}/api/admin/overview`, { 
    cache: 'no-store',
    headers: getAuthHeaders() 
  });
  if (!res.ok) throw new Error('Failed to fetch admin overview');
  return res.json();
}

export async function fetchValidSubmissions(params?: {
  problemId?: number;
  userId?: number;
  submissionType?: 'public' | 'private' | 'all';
  mode?: 'all' | 'best_per_user';
}): Promise<AdminSubmission[]> {
  const query = new URLSearchParams();
  if (params?.problemId) query.set('problem_id', params.problemId.toString());
  if (params?.userId) query.set('user_id', params.userId.toString());
  if (params?.submissionType && params.submissionType !== 'all') {
    query.set('submission_type', params.submissionType);
  }
  if (params?.mode) query.set('mode', params.mode);

  const url = `${API_BASE}/api/admin/submissions/valid?${query.toString()}`;
  const res = await fetch(url, { 
    cache: 'no-store',
    headers: getAuthHeaders() 
  });
  if (!res.ok) throw new Error('Không thể lấy danh sách bài nộp hợp lệ');
  return res.json();
}

export function getSubmissionDownloadUrl(submissionId: number): string {
  const token = getAuthToken();
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${API_BASE}/api/admin/submissions/${submissionId}/download${tokenQuery}`;
}

export function getCandidateSubmissionDownloadUrl(submissionId: number): string {
  const token = getAuthToken();
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${API_BASE}/api/submissions/${submissionId}/download${tokenQuery}`;
}

export function getSubmissionsExportZipUrl(params?: {
  problemId?: number;
  userId?: number;
  submissionType?: 'public' | 'private' | 'all';
  mode?: 'all' | 'best_per_user';
}): string {
  const query = new URLSearchParams();
  if (params?.problemId) query.set('problem_id', params.problemId.toString());
  if (params?.userId) query.set('user_id', params.userId.toString());
  if (params?.submissionType && params.submissionType !== 'all') {
    query.set('submission_type', params.submissionType);
  }
  if (params?.mode) query.set('mode', params.mode);

  const token = getAuthToken();
  if (token) {
    query.set('token', token);
  }

  return `${API_BASE}/api/admin/submissions/export-zip?${query.toString()}`;
}

export async function fetchAdminUsers(params?: { search?: string; role?: string }): Promise<User[]> {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.role) query.set('role', params.role);

  const url = `${API_BASE}/api/admin/users?${query.toString()}`;
  const res = await fetch(url, { 
    cache: 'no-store',
    headers: getAuthHeaders() 
  });
  if (!res.ok) throw new Error('Không thể tải danh sách tài khoản');
  return res.json();
}

export async function createAdminUser(data: Partial<User>): Promise<User> {
  const res = await fetch(`${API_BASE}/api/admin/users`, {
    method: 'POST',
    headers: getAuthHeaders(true),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không thể tạo tài khoản');
  }
  return res.json();
}

export async function batchCreateAdminUsers(params: BatchCreateUserParams): Promise<BatchCreateUserResponse> {
  const res = await fetch(`${API_BASE}/api/admin/users/batch`, {
    method: 'POST',
    headers: getAuthHeaders(true),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không thể tạo hàng loạt tài khoản');
  }
  return res.json();
}

export async function updateAdminUser(userId: number, data: Partial<User>): Promise<User> {
  const res = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
    method: 'PUT',
    headers: getAuthHeaders(true),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không thể cập nhật tài khoản');
  }
  return res.json();
}

export async function deleteAdminUser(userId: number): Promise<{ success: boolean; detail: string }> {
  const res = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không thể xóa tài khoản');
  }
  return res.json();
}

export async function resetAdminUserPassword(userId: number, length: number = 8): Promise<{ success: boolean; username: string; new_password: string; detail: string }> {
  const res = await fetch(`${API_BASE}/api/admin/users/${userId}/reset-password?length=${length}`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không thể đặt lại mật khẩu');
  }
  return res.json();
}

export function getUsersExportTxtUrl(role?: string): string {
  const query = new URLSearchParams();
  if (role) query.set('role', role);
  const token = getAuthToken();
  if (token) {
    query.set('token', token);
  }
  return `${API_BASE}/api/admin/users/export-txt?${query.toString()}`;
}
