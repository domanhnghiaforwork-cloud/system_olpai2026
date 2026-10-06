export interface User {
  id: number;
  username: string;
  password?: string;
  full_name: string;
  email: string;
  role: 'admin' | 'user';
  team_name?: string;
  created_at?: string;
  submissions_count?: number;
}

export interface BatchCreateUserParams {
  prefix: string;
  count: number;
  start_index: number;
  padding_digits: number;
  team_prefix: string;
  email_domain: string;
  role: 'user' | 'admin';
  password_length: number;
  custom_password?: string;
}

export interface BatchCreateUserResponse {
  success: boolean;
  created_count: number;
  skipped_count: number;
  skipped_usernames: string[];
  users: User[];
}

export interface Problem {
  id: number;
  code: string;
  title: string;
  category: 'CV' | 'NLP';
  short_description?: string;
  description?: string;
  pdf_filename?: string | null;
  pdf_url?: string | null;
  metric: string;
  deadline: string;
  max_daily_submissions: number;
  max_public_submissions?: number;
  max_private_submissions?: number;
  is_locked?: boolean;
  unlock_at?: string | null;
  public_is_locked?: boolean;
  public_unlock_at?: string | null;
  private_is_locked?: boolean;
  private_unlock_at?: string | null;
  evaluation_config?: string | null;
  created_at?: string;
}

export interface EvaluatorOption {
  id: string;
  name: string;
  description: string;
  metric: string;
}

export interface Dataset {
  id: number;
  problem_id?: number;
  title: string;
  filename: string;
  size_str: string;
  category: 'train' | 'test' | 'sample' | 'other';
  download_url: string;
  description?: string;
  is_locked?: boolean;
  unlock_at?: string | null;
}

export interface Submission {
  id: number;
  user_id: number;
  problem_id: number;
  user_name?: string;
  username?: string;
  team_name?: string;
  problem_title?: string;
  problem_code?: string;
  filename: string;
  stored_path?: string;
  file_exists?: boolean;
  file_size_str?: string;
  download_url?: string;
  submission_type?: 'public' | 'private' | string;
  status: string;
  score?: number | null;
  description?: string;
  logs?: string;
  created_at: string;
}

export interface TrainingNotebook {
  id: number;
  user_id: number;
  problem_id: number;
  submission_type: 'public' | 'private';
  filename: string;
  size_bytes: number;
  created_at: string;
  download_url: string;
}

export interface AdminSubmission {
  id: number;
  rank?: number | null;
  user_id: number;
  username: string;
  user_name: string;
  team_name: string;
  problem_id: number;
  problem_code: string;
  problem_title: string;
  filename: string;
  submission_type: string;
  status: string;
  score: number | null;
  stored_path?: string | null;
  file_exists: boolean;
  file_size_str?: string | null;
  description?: string | null;
  logs?: string | null;
  created_at?: string | null;
  download_url: string;
}

export interface SubmissionJobResult {
  accepted: boolean;
  submission_id: number;
  client_request_id: string;
  job_status: 'QUEUED' | 'PROCESSING' | 'DONE' | 'FAILED';
  success: boolean | null;
  submission_type: 'public' | 'private';
  filename: string;
  score: number | null;
  result_line: string;
  step1_validation?: { status: string; message: string; errors?: string[]; row_count?: number };
  step2_scoring?: { status: string; message: string; score?: number | null };
}

export interface LeaderboardItem {
  rank: number;
  user_id: number;
  full_name: string;
  team_name: string;
  problem_code: string;
  best_score: number;
  total_submissions: number;
  last_submission_time: string;
  submission_type?: 'public' | 'private' | string;
}

export interface ProblemScoreComponent {
  problem_id: number;
  problem_code: string;
  problem_title: string;
  metric?: string | null;
  score?: number | null;
  submission_id?: number | null;
  submitted_at?: string | null;
}

export interface OverallLeaderboardItem {
  rank: number;
  user_id: number;
  full_name: string;
  team_name: string;
  username?: string | null;
  total_score: number;
  total_problems_submitted: number;
  total_problems_count: number;
  components: ProblemScoreComponent[];
  last_submission_time?: string | null;
}

export interface AdminStats {
  total_users: number;
  total_problems: number;
  total_submissions: number;
  valid_submissions?: number;
  total_datasets: number;
  system_status: string;
  evaluator_engine: string;
}
