'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { loadChatbotRuntimeConfig } from '@/lib/chatbotSession';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { HomeTab } from '@/components/tabs/HomeTab';
import { ProblemsTab } from '@/components/tabs/ProblemsTab';
import { LeaderboardTab } from '@/components/tabs/LeaderboardTab';
import { SubmitTab } from '@/components/tabs/SubmitTab';
import { DatasetsTab } from '@/components/tabs/DatasetsTab';
import { AdminTab } from '@/components/tabs/AdminTab';
import { AccessDenied } from '@/components/AccessDenied';

import { User, Problem, Dataset, Submission, LeaderboardItem, OverallLeaderboardItem } from '@/types';
import { 
  fetchCurrentUser, 
  fetchUsers, 
  switchUser, 
  logoutUser,
  fetchProblems, 
  fetchDatasets, 
  fetchSubmissions, 
  fetchLeaderboard,
  fetchOverallLeaderboard,
  getAuthToken,
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
  const [overallLeaderboard, setOverallLeaderboard] = useState<OverallLeaderboardItem[]>([]);

  const [selectedSubmitProblemId, setSelectedSubmitProblemId] = useState<number | null>(null);
  const [selectedLeaderboardCode, setSelectedLeaderboardCode] = useState<string>('CV-01');
  const [leaderboardType, setLeaderboardType] = useState<'overall' | 'public' | 'private'>('overall');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const clearUserData = useCallback(() => {
    setSubmissions([]);
    setUsers([]);
    setLeaderboard([]);
    setOverallLeaderboard([]);
  }, []);

  // Initial load
  const loadInitialData = useCallback(async () => {
    let token = getAuthToken();
    try {
      setIsLoading(true);
      setErrorMsg(null);

      const [uRes] = await Promise.all([fetchCurrentUser(), loadChatbotRuntimeConfig()]);
      if (getAuthToken() !== token && getAuthToken() !== null) return;
      token = getAuthToken();
      clearUserData();
      if (uRes?.role !== 'admin') setLeaderboardType((previous) => previous === 'private' ? 'public' : previous);
      setCurrentUser(uRes);
      const [probResult, dataResult, subResult, usersResult] = await Promise.allSettled([
        fetchProblems(), fetchDatasets(),
        uRes ? fetchSubmissions() : Promise.resolve([]),
        uRes?.role === 'admin' ? fetchUsers() : Promise.resolve([]),
      ]);
      if (getAuthToken() !== token) return;
      if (probResult.status === 'fulfilled') {
        setProblems(probResult.value);
        if (probResult.value.length > 0) {
          setSelectedSubmitProblemId(probResult.value[0].id);
          setSelectedLeaderboardCode(probResult.value[0].code);
        }
      }
      if (dataResult.status === 'fulfilled') setDatasets(dataResult.value);
      if (subResult.status === 'fulfilled') setSubmissions(subResult.value);
      if (usersResult.status === 'fulfilled') setUsers(usersResult.value);
      if ([probResult, dataResult, subResult, usersResult].some((result) => result.status === 'rejected')) {
        setErrorMsg('Một phần dữ liệu chưa tải được. Bạn có thể tiếp tục sử dụng và bấm Thử lại.');
      }
      const probRes = probResult.status === 'fulfilled' ? probResult.value : [];

      // Load initial leaderboards (both overall and first problem's public)
      fetchOverallLeaderboard()
        .then((value) => { if (getAuthToken() === token) setOverallLeaderboard(value); })
        .catch(() => []);

      if (probRes.length > 0) {
        fetchLeaderboard(probRes[0].code, 'public')
          .then((value) => { if (getAuthToken() === token) setLeaderboard(value); })
          .catch(() => []);
      }
    } catch (err: unknown) {
      console.error(err);
      setErrorMsg('Chưa tải được dữ liệu. Vui lòng bấm Thử lại.');
    } finally {
      setIsLoading(false);
    }
  }, [clearUserData]);

  useEffect(() => {
    const timer = setTimeout(() => { void loadInitialData(); }, 0);
    return () => clearTimeout(timer);
  }, [loadInitialData]);

  // Update leaderboard when problem code or type changes
  const handleLeaderboardChange = async (
    code: string, 
    type: 'overall' | 'public' | 'private' = leaderboardType
  ) => {
    const token = getAuthToken();
    try {
      setSelectedLeaderboardCode(code);
      setLeaderboardType(type);
      setIsLeaderboardLoading(true);

      if (type === 'overall') {
        const overall = await fetchOverallLeaderboard();
        if (getAuthToken() !== token) return;
        setOverallLeaderboard(overall);
      } else {
        const lb = await fetchLeaderboard(code, type);
        if (getAuthToken() !== token) return;
        setLeaderboard(lb);
      }
    } catch (err: unknown) {
      if (getAuthToken() !== token) return;
      console.error(err);
      if (type === 'private') {
        setLeaderboardType('public');
        const fallbackLb = await fetchLeaderboard(code, 'public').catch(() => []);
        if (getAuthToken() !== token) return;
        setLeaderboard(fallbackLb);
      }
    } finally {
      setIsLeaderboardLoading(false);
    }
  };

  const handleLeaderboardTypeChange = (type: 'overall' | 'public' | 'private') => {
    handleLeaderboardChange(selectedLeaderboardCode, type);
  };

  const handleLoginSuccess = async (user: User) => {
    const token = getAuthToken();
    setCurrentUser(user);
    clearUserData();
    const nextType = user.role === 'admin' && leaderboardType === 'private'
      ? 'private' : leaderboardType === 'overall' ? 'overall' : 'public';
    setLeaderboardType(nextType);
    const fetchLb = nextType === 'overall'
      ? fetchOverallLeaderboard().then((value) => { if (getAuthToken() === token) setOverallLeaderboard(value); })
      : fetchLeaderboard(selectedLeaderboardCode, nextType).then((value) => { if (getAuthToken() === token) setLeaderboard(value); });
    const [subs, lb, allUsers] = await Promise.allSettled([
      fetchSubmissions(), fetchLb, user.role === 'admin' ? fetchUsers() : Promise.resolve([]),
    ]);
    if (getAuthToken() !== token) return;
    if (subs.status === 'fulfilled') setSubmissions(subs.value);
    if (allUsers.status === 'fulfilled') setUsers(allUsers.value);
    if ([subs, lb, allUsers].some((value) => value.status === 'rejected')) {
      setErrorMsg('Đăng nhập thành công; một phần dữ liệu chưa tải được. Vui lòng bấm Thử lại.');
    }
  };

  const handleSwitchUser = async (userId: number) => {
    try { await handleLoginSuccess(await switchUser(userId)); }
    catch (error) { console.error(error); }
  };

  const handleLogout = async () => {
    // Clear private data immediately; a slow logout response must not keep it visible.
    const pending = logoutUser();
    setCurrentUser(null);
    clearUserData();
    const nextType = leaderboardType === 'private' ? 'public' : leaderboardType;
    setLeaderboardType(nextType);
    await pending;
    if (getAuthToken()) return;
    const publicData = nextType === 'overall'
      ? await fetchOverallLeaderboard().catch(() => [])
      : await fetchLeaderboard(selectedLeaderboardCode, 'public').catch(() => []);
    if (getAuthToken()) return;
    if (nextType === 'overall') setOverallLeaderboard(publicData as OverallLeaderboardItem[]);
    else setLeaderboard(publicData as LeaderboardItem[]);
  };

  // When user clicks "Nộp bài" on a problem card
  const handleSelectProblemForSubmit = (problemId: number) => {
    setSelectedSubmitProblemId(problemId);
    setCurrentTab('submit');
  };

  // Refresh submissions & leaderboard after user submits
  const handleSubmissionSuccess = async () => {
    const token = getAuthToken();
    if (!token) return;
    const lbType = currentUser?.role === 'admin' && leaderboardType === 'private' ? 'private' : 'public';
    try {
    const [subs, lb, overall] = await Promise.all([
      fetchSubmissions(),
      fetchLeaderboard(selectedLeaderboardCode, lbType).catch(() => []),
      fetchOverallLeaderboard().catch(() => []),
    ]);
    if (getAuthToken() !== token) return;
    setSubmissions(subs);
    setLeaderboard(lb);
    setOverallLeaderboard(overall);
    } catch {
      if (getAuthToken() === token) setErrorMsg('Bài đã được ghi nhận; chưa tải lại được lịch sử. Vui lòng bấm Thử lại.');
    }
  };

  // Check guest and role-based permissions
  // When not logged in, user can ONLY view 'home' and 'leaderboard'
  const isGuest = !currentUser;
  const publicTabs = ['home', 'leaderboard'];
  const isRestrictedForGuest = isGuest && !publicTabs.includes(currentTab);
  const isRestrictedForNonAdmin = !!currentUser && currentUser.role !== 'admin' && currentTab === 'admin';

  // Navigate to login form on Home tab and auto-focus
  const handleGoToLogin = () => {
    setCurrentTab('home');
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('input[autoComplete="username"]');
      if (input) {
        input.focus();
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
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
        onLogout={handleLogout}
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
        ) : isRestrictedForGuest ? (
          /* Guest attempted to view a restricted page: show AccessDenied */
          <AccessDenied
            currentTab={currentTab}
            onNavigateHome={() => setCurrentTab('home')}
            onGoToLogin={handleGoToLogin}
            onNavigateLeaderboard={() => {
              setCurrentTab('leaderboard');
              handleLeaderboardChange(selectedLeaderboardCode, 'public');
            }}
          />
        ) : isRestrictedForNonAdmin ? (
          /* Contestant attempted to view admin page */
          <AccessDenied
            currentTab="admin"
            isAdminOnly
            onNavigateHome={() => setCurrentTab('home')}
            onNavigateLeaderboard={() => {
              setCurrentTab('leaderboard');
              handleLeaderboardChange(selectedLeaderboardCode, leaderboardType);
            }}
          />
        ) : (
          <>
            {currentTab === 'home' && (
              <HomeTab
                onNavigate={(tab) => setCurrentTab(tab)}
                problems={problems}
                currentUser={currentUser}
                onLoginSuccess={handleLoginSuccess}
                onLogout={handleLogout}
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
                overallLeaderboard={overallLeaderboard}
                selectedProblemCode={selectedLeaderboardCode}
                onSelectProblemCode={(code) => handleLeaderboardChange(code, leaderboardType === 'overall' ? 'public' : leaderboardType)}
                currentUser={currentUser}
                leaderboardType={leaderboardType}
                onChangeLeaderboardType={handleLeaderboardTypeChange}
                onRefresh={() => handleLeaderboardChange(selectedLeaderboardCode, leaderboardType)}
                isLoading={isLeaderboardLoading}
              />
            )}

            {currentTab === 'submit' && (
              <SubmitTab
                key={`${currentUser?.id ?? 'guest'}:${currentUser?.role ?? 'guest'}`}
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
