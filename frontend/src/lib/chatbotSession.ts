// These browser storage keys are shared with the chatbot's auth store.
const CHATBOT_AUTH_KEY = 'chatbot-auth:v3';
const CHATBOT_REVISION_KEY = 'chatbot-auth:revision:v1';
let pendingReset: Promise<void> = Promise.resolve();
let runtimeConfig: { chatbotUrl: string; ssoEnabled: boolean } | null = null;

export async function loadChatbotRuntimeConfig(): Promise<void> {
  try {
    const response = await fetch('/runtime-config', { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return;
    const config = await response.json();
    if (typeof config.chatbotUrl === 'string' && typeof config.ssoEnabled === 'boolean') {
      const destination = new URL(config.chatbotUrl, window.location.origin);
      if (['http:', 'https:'].includes(destination.protocol)) runtimeConfig = config;
    }
  } catch { /* The build-time defaults remain available during an outage. */ }
}

export function isChatbotSsoEnabled(): boolean {
  return runtimeConfig?.ssoEnabled ?? process.env.NEXT_PUBLIC_CHATBOT_SSO_ENABLED === 'true';
}

export function getChatbotUrl(): string {
  return runtimeConfig?.chatbotUrl || process.env.NEXT_PUBLIC_CHATBOT_URL || 'https://larcher-brecken-palynologically.ngrok-free.dev/chatbot';
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
  if (typeof window === 'undefined' || !isChatbotSsoEnabled()) return;
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
