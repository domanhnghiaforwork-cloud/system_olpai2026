/** SSE over fetch keeps private-stream credentials out of URLs and access logs. */
export type LeaderboardConnectionState = 'connecting' | 'connected' | 'disconnected';

export function subscribeLeaderboardEvents(
  url: string,
  headers: Record<string, string>,
  onUpdate: () => void,
  onStateChange: (state: LeaderboardConnectionState) => void = () => {},
): () => void {
  const lifetime = new AbortController();
  let state: LeaderboardConnectionState | undefined;
  const publishState = (next: LeaderboardConnectionState) => {
    if (state !== next) {
      state = next;
      onStateChange(next);
    }
  };

  const waitToRetry = (milliseconds: number) => new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      lifetime.signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, milliseconds);
    lifetime.signal.addEventListener('abort', done, { once: true });
  });

  void (async () => {
    let retryDelay = 2000;
    while (!lifetime.signal.aborted) {
      publishState('connecting');
      const connection = new AbortController();
      const abortConnection = () => connection.abort();
      lifetime.signal.addEventListener('abort', abortConnection, { once: true });
      let idleTimer = setTimeout(abortConnection, 35_000);
      try {
        const response = await fetch(url, {
          headers: { ...headers, Accept: 'text/event-stream' },
          cache: 'no-store', signal: connection.signal,
        });
        if (response.status === 401 || response.status === 403) return;
        if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
          throw new Error('Leaderboard stream unavailable');
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
          while (!lifetime.signal.aborted) {
            const { value, done } = await reader.read();
            if (done) break;
            clearTimeout(idleTimer);
            idleTimer = setTimeout(abortConnection, 35_000);
            buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
            let boundary: number;
            while ((boundary = buffer.indexOf('\n\n')) !== -1) {
              const frame = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              const event = frame.split('\n').find((line) => line.startsWith('event:'))?.slice(6).trim();
              if (!lifetime.signal.aborted && (event === 'ready' || event === 'leaderboard-change')) {
                publishState('connected');
                retryDelay = 2000;
                onUpdate();
              }
            }
            if (buffer.length > 16_384) throw new Error('Malformed leaderboard stream');
          }
        } finally {
          reader.releaseLock();
        }
      } catch {
        // Transient failures reconnect without interrupting the current table.
      } finally {
        publishState('disconnected');
        clearTimeout(idleTimer);
        connection.abort();
        lifetime.signal.removeEventListener('abort', abortConnection);
      }
      if (!lifetime.signal.aborted) {
        await waitToRetry(retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15_000);
      }
    }
  })();

  return () => {
    lifetime.abort();
    publishState('disconnected');
  };
}
