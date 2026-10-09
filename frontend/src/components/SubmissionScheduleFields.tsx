'use client';

import { Clock } from 'lucide-react';
import { parseUnlockDate, toVietnamDatetimeLocal } from '@/lib/countdown';

interface Props {
  split: 'public' | 'private';
  locked: boolean;
  unlockAt: string;
  problemUnlockAt?: string | null;
  showIcons?: boolean;
  onLockedChange: (locked: boolean) => void;
  onUnlockAtChange: (value: string) => void;
}

export function SubmissionScheduleFields({ split, locked, unlockAt, problemUnlockAt, showIcons = true, onLockedChange, onUnlockAtChange }: Props) {
  const name = split === 'public' ? 'Public' : 'Private';
  return (
    <fieldset className={`rounded-2xl border p-4 space-y-3 ${split === 'public' ? 'border-blue-200 bg-blue-50/40' : 'border-rose-200 bg-rose-50/40'}`}>
      <legend className="px-1 text-xs font-bold text-slate-800">Lịch mở nộp {name}</legend>
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
        <input type="checkbox" checked={locked} onChange={(event) => onLockedChange(event.target.checked)} className="accent-blue-600" />
        Khóa {name} khi chưa đặt giờ mở
      </label>
      <label htmlFor={`schedule-${split}`} className="flex items-center gap-1.5 text-xs font-bold text-slate-700">{showIcons && <Clock className="w-3.5 h-3.5" />}Giờ mở {name} (giờ Việt Nam)</label>
      <input id={`schedule-${split}`} type="datetime-local" value={unlockAt} onChange={(event) => onUnlockAtChange(event.target.value)}
        min={toVietnamDatetimeLocal(problemUnlockAt, true) || undefined} step="0.001"
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono focus:border-blue-500 focus:outline-hidden" />
      <div className="flex flex-wrap gap-2">
        {[{ label: '+15 phút', minutes: 15 }, { label: '+1 giờ', minutes: 60 }, { label: '+1 ngày', minutes: 1440 }].map((item) => (
          <button key={item.minutes} type="button" onClick={() => onUnlockAtChange(toVietnamDatetimeLocal(new Date(Math.max(Date.now(), parseUnlockDate(problemUnlockAt)?.getTime() ?? 0) + item.minutes * 60_000), true))}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 hover:border-blue-400">{item.label}</button>
        ))}
        {problemUnlockAt && <button type="button" onClick={() => onUnlockAtChange(toVietnamDatetimeLocal(problemUnlockAt, true))} className="rounded-md bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700">Theo giờ mở đề</button>}
        {unlockAt && <button type="button" onClick={() => onUnlockAtChange('')} className="rounded-md bg-rose-100 px-2 py-1 text-[10px] font-semibold text-rose-700">Xóa hẹn giờ</button>}
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">CSV và notebook {name} dùng chung lịch riêng này. Giờ mở phải bằng hoặc muộn hơn giờ mở đề. Khi không đặt hẹn giờ, vòng mở theo đề nếu không khóa thủ công.</p>
    </fieldset>
  );
}
