'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  getAuthHeaders,
  API_BASE,
} from '@/lib/api';
import { subscribeLeaderboardEvents, type LeaderboardConnectionState } from '@/lib/leaderboardEvents';
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
  const [privateOverallLeaderboard, setPrivateOverallLeaderboard] = useState<OverallLeaderboardItem[]>([]);
  const leaderboardRequest = useRef(0);

  const [selectedSubmitProblemId, setSelectedSubmitProblemId] = useState<number | null>(null);
  const [selectedLeaderboardCode, setSelectedLeaderboardCode] = useState<string>('CV-01');
  const [leaderboardType, setLeaderboardType] = useState<'overall' | 'overall-private' | 'public' | 'private'>('overall');
  const connectionKey = `${leaderboardType}:${selectedLeaderboardCode}:${currentUser?.id ?? 0}:${currentUser?.role ?? 'guest'}`;
  const [leaderboardConnection, setLeaderboardConnection] = useState<{ key: string; state: LeaderboardConnectionState }>({ key: '', state: 'disconnected' });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const clearUserData = useCallback(() => {
    leaderboardRequest.current += 1;
    setIsLeaderboardLoading(false);
    setSubmissions([]);
    setUsers([]);
    setLeaderboard([]);
    setOverallLeaderboard([]);
    setPrivateOverallLeaderboard([]);
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
      setLeaderboardType('overall');
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

  useEffect(() => {
    if (currentTab !== 'leaderboard' || isLoading) return;
    const split = leaderboardType === 'private' || leaderboardType === 'overall-private' ? 'private' : 'public';
    if (split === 'private' && currentUser?.role !== 'admin') return;
    const token = getAuthToken();
    let active = true;
    let stopStream: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fetching = false;
    let dirty = false;
    let fetchController: AbortController | undefined;

    const queueRefresh = (delay = 1000) => {
      if (!active || document.hidden) return;
      dirty = true;
      if (!timer && !fetching) timer = setTimeout(() => { void refresh(); }, delay);
    };
    const refresh = async () => {
      timer = undefined;
      if (!active || document.hidden) return;
      dirty = false;
      fetching = true;
      fetchController = new AbortController();
      const signal = fetchController.signal;
      const request = leaderboardRequest.current;
      let nextDelay = 1000;
      try {
        if (leaderboardType === 'overall' || leaderboardType === 'overall-private') {
          const items = await fetchOverallLeaderboard(split, signal);
          if (!active || signal.aborted || getAuthToken() !== token || request !== leaderboardRequest.current) return;
          if (split === 'private') setPrivateOverallLeaderboard(items);
          else setOverallLeaderboard(items);
        } else {
          const items = await fetchLeaderboard(selectedLeaderboardCode, split, signal);
          if (!active || signal.aborted || getAuthToken() !== token || request !== leaderboardRequest.current) return;
          setLeaderboard(items);
        }
      } catch {
        if (!signal.aborted && active) {
          dirty = true;
          nextDelay = 5000;
        }
      } finally {
        fetching = false;
        if (dirty) queueRefresh(nextDelay);
      }
    };
    const syncVisibility = () => {
      if (document.hidden) {
        stopStream?.();
        stopStream = undefined;
        clearTimeout(timer);
        timer = undefined;
        fetchController?.abort();
        dirty = false;
      } else if (!stopStream) {
        stopStream = subscribeLeaderboardEvents(
          `${API_BASE}/api/leaderboard/events?type=${split}`, getAuthHeaders(), () => queueRefresh(),
          (state) => { if (active) setLeaderboardConnection({ key: connectionKey, state }); },
        );
        queueRefresh(0);
      }
    };
    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    return () => {
      active = false;
      stopStream?.();
      clearTimeout(timer);
      fetchController?.abort();
      document.removeEventListener('visibilitychange', syncVisibility);
    };
  }, [currentTab, isLoading, leaderboardType, selectedLeaderboardCode, currentUser?.id, currentUser?.role, connectionKey]);

  // Update leaderboard when problem code or type changes
  const handleLeaderboardChange = async (
    code: string, 
    type: 'overall' | 'overall-private' | 'public' | 'private' = leaderboardType
  ) => {
    if ((type === 'private' || type === 'overall-private') && currentUser?.role !== 'admin') return;
    const token = getAuthToken();
    const request = ++leaderboardRequest.current;
    try {
      setSelectedLeaderboardCode(code);
      setLeaderboardType(type);
      setIsLeaderboardLoading(true);

      if (type === 'overall' || type === 'overall-private') {
        const overall = await fetchOverallLeaderboard(type === 'overall-private' ? 'private' : 'public');
        if (getAuthToken() !== token || request !== leaderboardRequest.current) return;
        if (type === 'overall-private') setPrivateOverallLeaderboard(overall);
        else setOverallLeaderboard(overall);
      } else {
        const lb = await fetchLeaderboard(code, type);
        if (getAuthToken() !== token || request !== leaderboardRequest.current) return;
        setLeaderboard(lb);
      }
    } catch (err: unknown) {
      if (getAuthToken() !== token || request !== leaderboardRequest.current) return;
      console.error(err);
      setErrorMsg('Không thể tải bảng xếp hạng. Vui lòng bấm Làm mới để thử lại.');
      if (type === 'overall-private') {
        setPrivateOverallLeaderboard([]);
        setLeaderboardType('overall');
      }
      if (type === 'private') {
        setLeaderboardType('public');
        const fallbackLb = await fetchLeaderboard(code, 'public').catch(() => []);
        if (getAuthToken() !== token || request !== leaderboardRequest.current) return;
        setLeaderboard(fallbackLb);
      }
    } finally {
      if (request === leaderboardRequest.current) setIsLeaderboardLoading(false);
    }
  };

  const handleLeaderboardTypeChange = (type: 'overall' | 'overall-private' | 'public' | 'private') => {
    handleLeaderboardChange(selectedLeaderboardCode, type);
  };

  const handleLoginSuccess = async (user: User) => {
    const token = getAuthToken();
    setCurrentUser(user);
    clearUserData();
    const nextType = user.role === 'admin' ? leaderboardType
      : leaderboardType === 'overall-private' ? 'overall' : leaderboardType === 'private' ? 'public' : leaderboardType;
    setLeaderboardType(nextType);
    const fetchLb = nextType === 'overall' || nextType === 'overall-private'
      ? fetchOverallLeaderboard(nextType === 'overall-private' ? 'private' : 'public').then((value) => {
        if (getAuthToken() === token) {
          if (nextType === 'overall-private') setPrivateOverallLeaderboard(value);
          else setOverallLeaderboard(value);
        }
      })
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
    const nextType = leaderboardType === 'overall-private' ? 'overall' : leaderboardType === 'private' ? 'public' : leaderboardType;
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
    const overallSplit = currentUser?.role === 'admin' && leaderboardType === 'overall-private' ? 'private' : 'public';
    const [subs, lb, overall] = await Promise.all([
      fetchSubmissions(),
      fetchLeaderboard(selectedLeaderboardCode, lbType).catch(() => []),
      fetchOverallLeaderboard(overallSplit).catch(() => []),
    ]);
    if (getAuthToken() !== token) return;
    setSubmissions(subs);
    setLeaderboard(lb);
    if (overallSplit === 'private') setPrivateOverallLeaderboard(overall);
    else setOverallLeaderboard(overall);
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
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-8">
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
                overallLeaderboard={leaderboardType === 'overall-private' && currentUser?.role === 'admin' ? privateOverallLeaderboard : overallLeaderboard}
                selectedProblemCode={selectedLeaderboardCode}
                onSelectProblemCode={(code) => handleLeaderboardChange(code, leaderboardType === 'overall-private' ? 'private' : leaderboardType === 'overall' ? 'public' : leaderboardType)}
                currentUser={currentUser}
                leaderboardType={leaderboardType}
                onChangeLeaderboardType={handleLeaderboardTypeChange}
                onRefresh={() => handleLeaderboardChange(selectedLeaderboardCode, leaderboardType)}
                isLoading={isLeaderboardLoading}
                isRealtimeConnected={leaderboardConnection.key === connectionKey && leaderboardConnection.state === 'connected'}
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
