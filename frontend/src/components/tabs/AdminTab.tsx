'use client';

import React, { useState, useEffect } from 'react';
import { AdminStats, Problem } from '@/types';
import { 
  ShieldCheck, 
  Users, 
  FileCode2, 
  UploadCloud, 
  Database, 
  Server, 
  PlusCircle, 
  CheckCircle2,
  Activity,
  Layers
} from 'lucide-react';
import { fetchAdminOverview } from '@/lib/api';

interface AdminTabProps {
  onProblemCreated: () => void;
}

export const AdminTab: React.FC<AdminTabProps> = ({ onProblemCreated }) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentSubs, setRecentSubs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // New problem form state
  const [newCode, setNewCode] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newMetric, setNewMetric] = useState('F1-Score');
  const [newCategory, setNewCategory] = useState<'CV' | 'NLP'>('CV');
  const [isCreating, setIsCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const data = await fetchAdminOverview();
      setStats(data.stats);
      setRecentSubs(data.recent_submissions);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateProblem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode || !newTitle || !newDesc) return;

    try {
      setIsCreating(true);
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const formData = new FormData();
      formData.append('code', newCode);
      formData.append('title', newTitle);
      formData.append('category', newCategory);
      formData.append('metric', newMetric);
      formData.append('deadline', '2026-11-30 23:59:59');

      const res = await fetch(`${API_BASE}/api/problems`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        setCreateMsg('Đã tạo đề bài mới thành công!');
        setNewCode('');
        setNewTitle('');
        setNewDesc('');
        onProblemCreated();
        loadData();
      } else {
        setCreateMsg('Lỗi khi tạo đề bài');
      }
    } catch (err) {
      setCreateMsg('Lỗi kết nối tới máy chủ');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-10">
      {/* Admin Header */}
      <div className="pb-6 border-b border-slate-200 flex items-center justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold mb-2">
            <ShieldCheck className="w-4 h-4" />
            <span>Khu vực Quản trị viên (Admin Panel)</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Bảng Điều Khiển Hệ Thống OLP AI KMA 2026
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Theo dõi hạ tầng chấm thi tự động, quản trị đề thi, tập dữ liệu và thí sinh Học viện Kỹ thuật Mật mã.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span>SQLite DB: Sẵn sàng</span>
          </span>
        </div>
      </div>

      {/* Overview Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mb-3">
            <Users className="w-5 h-5" />
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Tổng số thí sinh</div>
          <div className="text-3xl font-black text-slate-900 mt-1">{stats?.total_users ?? '—'}</div>
          <div className="text-[11px] text-slate-500 mt-1">Các lớp AT18, AT19, K18</div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center mb-3">
            <FileCode2 className="w-5 h-5" />
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Đề bài đang mở</div>
          <div className="text-3xl font-black text-slate-900 mt-1">{stats?.total_problems ?? '—'}</div>
          <div className="text-[11px] text-slate-500 mt-1">Được cập nhật tự động</div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center mb-3">
            <UploadCloud className="w-5 h-5" />
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Lượt nộp bài</div>
          <div className="text-3xl font-black text-slate-900 mt-1">{stats?.total_submissions ?? '—'}</div>
          <div className="text-[11px] text-slate-500 mt-1">Toàn bộ các đội thi</div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
            <Database className="w-5 h-5" />
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Tập dữ liệu</div>
          <div className="text-3xl font-black text-slate-900 mt-1">{stats?.total_datasets ?? '—'}</div>
          <div className="text-[11px] text-slate-500 mt-1">Train & Public Test</div>
        </div>
      </div>

      {/* Grid: Create Problem & System Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Form: Add New Problem */}
        <div className="lg:col-span-6 bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-xs">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-6">
            <PlusCircle className="w-5 h-5 text-red-600" />
            <span>Thêm đề bài mới (Khung chức năng Admin)</span>
          </h3>

          <form onSubmit={handleCreateProblem} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mã đề bài:</label>
                <input
                  type="text"
                  placeholder="VD: AI-04"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phân loại:</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as 'CV' | 'NLP')}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden bg-white"
                >
                  <option value="CV">Computer Vision (CV)</option>
                  <option value="NLP">Xử lý ngôn ngữ (NLP)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tên đề bài:</label>
              <input
                type="text"
                placeholder="VD: Phân tích mã độc Ransomware dựa trên hành vi API Call"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Độ đo đánh giá:</label>
              <input
                type="text"
                placeholder="VD: Macro F1-Score, AUC-ROC, Accuracy"
                value={newMetric}
                onChange={(e) => setNewMetric(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Mô tả chi tiết bài toán:</label>
              <textarea
                rows={3}
                placeholder="Nhập yêu cầu bài toán, định dạng file nộp..."
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-hidden"
                required
              />
            </div>

            {createMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-medium">
                {createMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={isCreating}
              className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
            >
              {isCreating ? 'Đang tạo...' : 'Tạo đề bài'}
            </button>
          </form>
        </div>

        {/* Live Submissions Feed */}
        <div className="lg:col-span-6 bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-xs">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-6">
            <Activity className="w-5 h-5 text-blue-600" />
            <span>Nhật ký nộp bài gần đây của toàn hệ thống</span>
          </h3>

          <div className="space-y-3">
            {recentSubs.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs">
                Chưa có dữ liệu nộp bài
              </div>
            ) : (
              recentSubs.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-800 flex items-center gap-2">
                      <span>{item.user}</span>
                      <span className="px-2 py-0.2 bg-blue-100 text-blue-700 rounded font-semibold text-[10px]">
                        {item.problem}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {new Date(item.time).toLocaleString('vi-VN')}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-mono font-bold text-sm text-red-600">
                      {item.score !== null ? item.score : '—'}
                    </span>
                    <span className="block text-[10px] text-emerald-600 font-semibold">
                      {item.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
