import { 
  User, 
  Problem, 
  Dataset, 
  Submission, 
  AdminSubmission, 
  LeaderboardItem, 
  AdminStats, 
  EvaluatorOption,
  BatchCreateUserParams,
  BatchCreateUserResponse
} from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function fetchEvaluators(): Promise<EvaluatorOption[]> {
  const res = await fetch(`${API_BASE}/api/problems/evaluators`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch evaluators');
  return res.json();
}

export async function fetchCurrentUser(): Promise<User> {
  const res = await fetch(`${API_BASE}/api/auth/me`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch user');
  return res.json();
}

export async function fetchUsers(): Promise<User[]> {
  const res = await fetch(`${API_BASE}/api/auth/users`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
}

export async function switchUser(userId: number): Promise<User> {
  const res = await fetch(`${API_BASE}/api/auth/switch-user/${userId}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to switch user');
  return res.json();
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
  return res.json();
}

export async function logoutUser(): Promise<void> {
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
  }).catch(() => {});
}

export async function fetchProblems(category?: string): Promise<Problem[]> {
  const url = category && category !== 'all' 
    ? `${API_BASE}/api/problems?category=${category}` 
    : `${API_BASE}/api/problems`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch problems');
  return res.json();
}

export async function fetchProblem(id: number): Promise<Problem> {
  const res = await fetch(`${API_BASE}/api/problems/${id}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch problem details');
  return res.json();
}

export async function createProblem(formData: FormData): Promise<Problem> {
  const res = await fetch(`${API_BASE}/api/problems`, {
    method: 'POST',
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
    headers: { 'Content-Type': 'application/json' },
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
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không thể xóa đề thi');
  }
}

export async function fetchDatasets(problemId?: number): Promise<Dataset[]> {
  const url = problemId ? `${API_BASE}/api/datasets?problem_id=${problemId}` : `${API_BASE}/api/datasets`;
  const res = await fetch(url, { cache: 'no-store' });
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
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
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
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không thể xóa mục dữ liệu');
  }
}

export async function fetchSubmissions(problemId?: number): Promise<Submission[]> {
  const url = problemId ? `${API_BASE}/api/submissions?problem_id=${problemId}` : `${API_BASE}/api/submissions`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch submissions');
  return res.json();
}

export async function submitSolution(
  problemId: number, 
  file: File, 
  submissionType: 'public' | 'private' = 'public'
): Promise<any> {
  const formData = new FormData();
  formData.append('problem_id', problemId.toString());
  formData.append('submission_type', submissionType);
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/api/submissions`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Lỗi khi gửi bài nộp');
  }
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
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Không thể tải bảng xếp hạng');
  }
  return res.json();
}

export async function fetchAdminOverview(): Promise<{ stats: AdminStats; recent_submissions: any[] }> {
  const res = await fetch(`${API_BASE}/api/admin/overview`, { cache: 'no-store' });
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
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Không thể lấy danh sách bài nộp hợp lệ');
  return res.json();
}

export function getSubmissionDownloadUrl(submissionId: number): string {
  return `${API_BASE}/api/admin/submissions/${submissionId}/download`;
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

  return `${API_BASE}/api/admin/submissions/export-zip?${query.toString()}`;
}

export async function fetchAdminUsers(params?: { search?: string; role?: string }): Promise<User[]> {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.role) query.set('role', params.role);

  const url = `${API_BASE}/api/admin/users?${query.toString()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Không thể tải danh sách tài khoản');
  return res.json();
}

export async function createAdminUser(data: Partial<User>): Promise<User> {
  const res = await fetch(`${API_BASE}/api/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
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
  return `${API_BASE}/api/admin/users/export-txt?${query.toString()}`;
}
