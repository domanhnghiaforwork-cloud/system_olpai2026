'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { HomeTab } from '@/components/tabs/HomeTab';
import { ProblemsTab } from '@/components/tabs/ProblemsTab';
import { LeaderboardTab } from '@/components/tabs/LeaderboardTab';
import { SubmitTab } from '@/components/tabs/SubmitTab';
import { DatasetsTab } from '@/components/tabs/DatasetsTab';
import { AdminTab } from '@/components/tabs/AdminTab';

import { User, Problem, Dataset, Submission, LeaderboardItem } from '@/types';
import { 
  fetchCurrentUser, 
  fetchUsers, 
  switchUser, 
  fetchProblems, 
  fetchDatasets, 
  fetchSubmissions, 
  fetchLeaderboard 
} from '@/lib/api';
import { Loader2, AlertCircle } from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState<string>('home');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);

  const [selectedSubmitProblemId, setSelectedSubmitProblemId] = useState<number | null>(null);
  const [selectedLeaderboardCode, setSelectedLeaderboardCode] = useState<string>('CV-01');
  const [leaderboardType, setLeaderboardType] = useState<'public' | 'private'>('public');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initial load
  const loadInitialData = async () => {
    try {
      setIsLoading(true);
      setErrorMsg(null);

      // Concurrent fetch
      const [uRes, allUsersRes, probRes, dataRes, subRes] = await Promise.all([
        fetchCurrentUser().catch(() => null),
        fetchUsers().catch(() => []),
        fetchProblems().catch(() => []),
        fetchDatasets().catch(() => []),
        fetchSubmissions().catch(() => []),
      ]);

      if (uRes) setCurrentUser(uRes);
      if (allUsersRes.length > 0) setUsers(allUsersRes);
      if (probRes.length > 0) {
        setProblems(probRes);
        setSelectedSubmitProblemId(probRes[0].id);
        setSelectedLeaderboardCode(probRes[0].code);
      }
      setDatasets(dataRes);
      setSubmissions(subRes);

      // Load initial leaderboard (defaults to public)
      if (probRes.length > 0) {
        const lb = await fetchLeaderboard(probRes[0].code, 'public').catch(() => []);
        setLeaderboard(lb);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Không thể kết nối đến máy chủ backend (FastAPI). Vui lòng kiểm tra cổng 8000.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Update leaderboard when problem code or type changes
  const handleLeaderboardChange = async (
    code: string, 
    type: 'public' | 'private' = leaderboardType
  ) => {
    try {
      setSelectedLeaderboardCode(code);
      setLeaderboardType(type);
      setIsLeaderboardLoading(true);
      const lb = await fetchLeaderboard(code, type);
      setLeaderboard(lb);
    } catch (err: any) {
      console.error(err);
      if (type === 'private') {
        setLeaderboardType('public');
        const fallbackLb = await fetchLeaderboard(code, 'public').catch(() => []);
        setLeaderboard(fallbackLb);
      }
    } finally {
      setIsLeaderboardLoading(false);
    }
  };

  const handleLeaderboardTypeChange = (type: 'public' | 'private') => {
    handleLeaderboardChange(selectedLeaderboardCode, type);
  };

  // Switch active user / role
  const handleSwitchUser = async (userId: number) => {
    try {
      const user = await switchUser(userId);
      setCurrentUser(user);
      const nextType = (user.role === 'admin' && leaderboardType === 'private') ? 'private' : 'public';
      setLeaderboardType(nextType);
      
      const [subs, lb] = await Promise.all([
        fetchSubmissions(),
        fetchLeaderboard(selectedLeaderboardCode, nextType).catch(() => []),
      ]);
      setSubmissions(subs);
      setLeaderboard(lb);
    } catch (err) {
      console.error(err);
    }
  };

  // When user clicks "Nộp bài" on a problem card
  const handleSelectProblemForSubmit = (problemId: number) => {
    setSelectedSubmitProblemId(problemId);
    setCurrentTab('submit');
  };

  // Refresh submissions & leaderboard after user submits
  const handleSubmissionSuccess = async () => {
    const [subs, lb] = await Promise.all([
      fetchSubmissions(),
      fetchLeaderboard(selectedLeaderboardCode, leaderboardType).catch(() => []),
    ]);
    setSubmissions(subs);
    setLeaderboard(lb);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top Navbar */}
      <Navbar
        currentTab={currentTab}
        onTabChange={(tab) => setCurrentTab(tab)}
        currentUser={currentUser}
        users={users}
        onSwitchUser={handleSwitchUser}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {errorMsg && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={loadInitialData}
              className="px-3 py-1 bg-amber-600 text-white rounded-lg font-bold text-xs hover:bg-amber-700"
            >
              Thử lại
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="h-96 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="text-xs font-semibold text-slate-500">
              Đang tải hệ thống OLP AI KMA 2026...
            </span>
          </div>
        ) : (
          <>
            {currentTab === 'home' && (
              <HomeTab
                onNavigate={(tab) => setCurrentTab(tab)}
                problems={problems}
              />
            )}

            {currentTab === 'problems' && (
              <ProblemsTab
                problems={problems}
                currentUser={currentUser}
                onRefreshProblems={() => {
                  fetchProblems().then(setProblems);
                }}
                onSelectProblemForSubmit={handleSelectProblemForSubmit}
              />
            )}

            {currentTab === 'leaderboard' && (
              <LeaderboardTab
                problems={problems}
                leaderboard={leaderboard}
                selectedProblemCode={selectedLeaderboardCode}
                onSelectProblemCode={(code) => handleLeaderboardChange(code, leaderboardType)}
                currentUser={currentUser}
                leaderboardType={leaderboardType}
                onChangeLeaderboardType={handleLeaderboardTypeChange}
                onRefresh={() => handleLeaderboardChange(selectedLeaderboardCode, leaderboardType)}
                isLoading={isLeaderboardLoading}
              />
            )}

            {currentTab === 'submit' && (
              <SubmitTab
                problems={problems}
                submissions={submissions}
                currentUser={currentUser}
                selectedProblemId={selectedSubmitProblemId}
                onSelectProblemId={setSelectedSubmitProblemId}
                onSubmissionSuccess={handleSubmissionSuccess}
                onRefreshProblems={() => {
                  fetchProblems().then(setProblems);
                }}
              />
            )}

            {currentTab === 'datasets' && (
              <DatasetsTab
                problems={problems}
                datasets={datasets}
                currentUser={currentUser}
                onRefreshDatasets={() => {
                  fetchDatasets().then(setDatasets);
                }}
              />
            )}

            {currentTab === 'admin' && (
              <AdminTab
                onProblemCreated={() => {
                  fetchProblems().then(setProblems);
                }}
                onUsersUpdated={() => {
                  fetchUsers().then(setUsers);
                }}
              />
            )}
          </>
        )}
      </main>

      {/* Global Footer */}
      <Footer />
    </div>
  );
}
