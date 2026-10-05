// These browser storage keys are shared with the chatbot's auth store.
const CHATBOT_AUTH_KEY = 'chatbot-auth:v3';
const CHATBOT_REVISION_KEY = 'chatbot-auth:revision:v1';
let pendingReset: Promise<void> = Promise.resolve();

export function getChatbotUrl(): string {
  return process.env.NEXT_PUBLIC_CHATBOT_URL || 'https://larcher-brecken-palynologically.ngrok-free.dev/chatbot';
}

function resetThroughBridge(destination: URL): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    const id = crypto.randomUUID();
    frame.hidden = true;
    frame.title = 'Đồng bộ phiên Chatbot';
    const finish = () => {
      window.clearTimeout(timeout);
      window.removeEventListener('message', acknowledge);
      frame.remove();
      resolve();
    };
    const acknowledge = (event: MessageEvent) => {
      if (event.origin === destination.origin && event.source === frame.contentWindow
          && event.data?.type === 'olpai-session-reset-done' && event.data.id === id) finish();
    };
    const timeout = window.setTimeout(finish, 8000);
    window.addEventListener('message', acknowledge);
    frame.onload = () => frame.contentWindow?.postMessage({ type: 'olpai-session-reset', id }, destination.origin);
    frame.onerror = finish;
    destination.pathname = `${destination.pathname.replace(/\/+$/, '')}/session-bridge`;
    destination.search = '';
    destination.hash = '';
    frame.src = destination.toString();
    document.body.appendChild(frame);
  });
}

export function resetChatbotSession(): void {
  if (typeof window === 'undefined' || process.env.NEXT_PUBLIC_CHATBOT_SSO_ENABLED !== 'true') return;
  try {
    const destination = new URL(getChatbotUrl(), window.location.origin);
    if (destination.origin === window.location.origin) {
      localStorage.removeItem(CHATBOT_AUTH_KEY);
      localStorage.setItem(CHATBOT_REVISION_KEY, crypto.randomUUID());
      window.dispatchEvent(new Event('auth-changed'));
    } else {
      // Serialize resets so an old iframe cannot erase a later SSO session.
      pendingReset = pendingReset.catch(() => {}).then(() => resetThroughBridge(destination));
    }
  } catch {
    // System login/logout remains usable if chatbot or browser storage is unavailable.
  }
}

export function waitForChatbotSessionReset(): Promise<void> {
  return pendingReset;
}
