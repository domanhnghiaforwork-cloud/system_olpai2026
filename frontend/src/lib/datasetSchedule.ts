import { getDependentLockStatus, opensBeforeProblem, parseUnlockDate, toDatetimeLocal, type LockStatus } from './countdown';

interface Schedule {
  is_locked?: boolean;
  unlock_at?: string | null;
}

/** Both gates must open; timed gates use the later release, manual locks win. */
export function getDatasetLockStatus(dataset: Schedule, problem: Schedule | undefined, now: number): LockStatus {
  return getDependentLockStatus(dataset, problem, now);
}

export function datasetOpensBeforeProblem(unlockAt: string | null, problemUnlockAt?: string | null): boolean {
  return opensBeforeProblem(unlockAt, problemUnlockAt);
}

/** Preserve seconds so selecting the parent's exact opening time stays valid. */
export function toDatasetDatetimeLocal(value?: Date | string | null): string {
  const date = parseUnlockDate(value);
  if (!date) return '';
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const milliseconds = date.getMilliseconds() ? `.${String(date.getMilliseconds()).padStart(3, '0')}` : '';
  return `${toDatetimeLocal(date)}:${seconds}${milliseconds}`;
}
