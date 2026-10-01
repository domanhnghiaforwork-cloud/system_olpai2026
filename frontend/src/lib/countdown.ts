export type LockStatus = 
  | { type: 'COUNTDOWN'; remainingMs: number; formatted: string }
  | { type: 'LOCKED' }
  | { type: 'UNLOCKED' };

/**
 * Safely parse Date or ISO date string.
 * If dateStr does not have 'Z' or timezone offset, append 'Z'
 * because backend stores timestamps in UTC.
 */
export function parseUnlockDate(dateInput?: Date | string | null): Date | null {
  if (!dateInput) return null;
  if (dateInput instanceof Date) {
    return isNaN(dateInput.getTime()) ? null : dateInput;
  }
  let str = String(dateInput).trim();
  if (!str) return null;

  // If no timezone indicator ('Z' or +HH:mm / -HH:mm), treat as UTC
  if (!str.endsWith('Z') && !/[+-]\d{2}(:\d{2})?$/.test(str)) {
    str += 'Z';
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Calculate lock & countdown status based on is_locked and unlock_at.
 * If unlockAt is set and remainingMs > 0, returns COUNTDOWN.
 * If unlockAt is set and countdown reached 0, returns UNLOCKED (auto-unlocked).
 * If no unlockAt, follows manual isLocked flag.
 */
export function getItemLockStatus(
  isLocked: boolean | undefined,
  unlockAt: string | null | undefined,
  currentTimestamp: number
): LockStatus {
  if (unlockAt) {
    const d = parseUnlockDate(unlockAt);
    if (d) {
      const target = d.getTime();
      const remainingMs = target - currentTimestamp;
      if (remainingMs > 0) {
        const totalSeconds = Math.floor(remainingMs / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        const pad = (n: number) => n.toString().padStart(2, '0');
        const timePart = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
        const formatted = days > 0 ? `${days} ngày ${timePart}` : timePart;

        return { type: 'COUNTDOWN', remainingMs, formatted };
      } else {
        // Countdown has reached 0, problem/dataset automatically unlocks
        return { type: 'UNLOCKED' };
      }
    }
  }

  if (isLocked) {
    return { type: 'LOCKED' };
  }

  return { type: 'UNLOCKED' };
}

/**
 * Convert Date or ISO string into datetime-local value (YYYY-MM-DDTHH:mm)
 * in the user's LOCAL browser timezone.
 */
export function toDatetimeLocal(val?: Date | string | null): string {
  if (!val) return '';
  const d = val instanceof Date ? val : parseUnlockDate(val);
  if (!d || isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Convert value from <input type="datetime-local"> into UTC ISO string for backend API.
 */
export function toUtcIsoString(dateInput?: string | null): string | null {
  if (!dateInput || !dateInput.trim()) return null;
  const d = new Date(dateInput.trim());
  return isNaN(d.getTime()) ? null : d.toISOString();
}
