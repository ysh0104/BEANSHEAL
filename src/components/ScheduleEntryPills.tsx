"use client";

import {
  parseScheduleEntry,
  notionPillClass,
  typePillClass,
  type ScheduleLike,
} from "@/lib/scheduleDisplay";

type Props = {
  schedule: ScheduleLike;
  /** 캘린더 막대 등 compact 모드 */
  compact?: boolean;
  className?: string;
};

function Pill({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span
      className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-[4px] leading-none whitespace-nowrap max-w-full truncate ${className}`}
    >
      {label}
    </span>
  );
}

export default function ScheduleEntryPills({ schedule, compact = false, className = "" }: Props) {
  const entry = parseScheduleEntry(schedule);

  return (
    <div className={`flex flex-col gap-0.5 min-w-0 ${className}`}>
      {/* 업체명 / 메인 제목 */}
      <div
        className={`font-bold text-slate-900 leading-snug break-words ${
          compact ? "text-[10.5px]" : "text-[11px]"
        }`}
      >
        {entry.title}
      </div>

      {/* 타입 · 제품명 · 상세 pill */}
      {(entry.type || entry.products.length > 0 || entry.details.length > 0) && (
        <div className="flex flex-wrap gap-0.5 items-center">
          {entry.type && (
            <Pill label={entry.type} className={typePillClass(entry.type)} />
          )}
          {entry.products.map((p, i) => (
            <Pill
              key={`p-${i}-${p.name}`}
              label={p.name}
              className={notionPillClass(p.color, "orange")}
            />
          ))}
          {entry.details.map((d, i) => (
            <Pill
              key={`d-${i}-${d.name}`}
              label={d.name}
              className={notionPillClass(d.color, "brown")}
            />
          ))}
        </div>
      )}

      {/* 수량 · LOT */}
      {(entry.quantity || entry.lot) && (
        <div className={`text-slate-600 leading-tight space-y-0.5 ${compact ? "text-[9px]" : "text-[10px]"}`}>
          {entry.quantity && <div className="font-semibold">수량 : {entry.quantity}</div>}
          {entry.lot && <div className="font-mono opacity-90">{entry.lot}</div>}
        </div>
      )}
    </div>
  );
}

export function ScheduleEntryPillsList({
  schedules,
  compact,
  className,
}: {
  schedules: ScheduleLike[];
  compact?: boolean;
  className?: string;
}) {
  if (!schedules.length) return null;
  return (
    <div className={`space-y-1.5 ${className || ""}`}>
      {schedules.map((sch, i) => (
        <ScheduleEntryPills
          key={`${sch.product_name}-${i}`}
          schedule={sch}
          compact={compact}
        />
      ))}
    </div>
  );
}
