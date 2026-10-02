export interface User {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role: 'admin' | 'user';
  team_name?: string;
  created_at?: string;
}

export interface Problem {
  id: number;
  code: string;
  title: string;
  category: 'CV' | 'NLP';
  short_description?: string;
  description?: string;
  pdf_filename?: string;
  pdf_url?: string;
  metric: string;
  deadline: string;
  max_daily_submissions: number;
  max_public_submissions?: number;
  max_private_submissions?: number;
  is_locked?: boolean;
  unlock_at?: string | null;
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
  submission_type?: 'public' | 'private' | string;
  status: string;
  score?: number | null;
  description?: string;
  logs?: string;
  created_at: string;
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

export interface AdminStats {
  total_users: number;
  total_problems: number;
  total_submissions: number;
  valid_submissions?: number;
  total_datasets: number;
  system_status: string;
  evaluator_engine: string;
}
