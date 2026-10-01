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
  created_at?: string;
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
  problem_title?: string;
  filename: string;
  submission_type?: 'public' | 'private' | string;
  status: string;
  score?: number | null;
  description?: string;
  logs?: string;
  created_at: string;
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
}

export interface AdminStats {
  total_users: number;
  total_problems: number;
  total_submissions: number;
  total_datasets: number;
  system_status: string;
  evaluator_engine: string;
}
