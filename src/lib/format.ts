const pad = (n: number) => String(n).padStart(2, "0");

/** 385 -> "6:25" */
export function fmtPace(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/** 2702 -> "45:02", 4510 -> "1:15:10" */
export function fmtDuration(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** "45:02" | "1:15:10" | "6:25" -> seconds; null when it does not parse. */
export function parseDuration(text: string): number | null {
  const parts = text.trim().split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.slice(1).some((n) => n > 59)) return null;
  return nums.reduce((acc, n) => acc * 60 + n, 0);
}

export function fmtKm(km: number): string {
  return km.toLocaleString("pl-PL", { minimumFractionDigits: km < 10 ? 2 : 1, maximumFractionDigits: 2 });
}

export function fmtKmShort(km: number): string {
  return km.toLocaleString("pl-PL", { maximumFractionDigits: 1 });
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function today(): string {
  return toISODate(new Date());
}

/** 0 = Monday … 6 = Sunday */
export function weekday(iso: string): number {
  return (fromISODate(iso).getDay() + 6) % 7;
}

export function mondayOf(iso: string): string {
  return addDays(iso, -weekday(iso));
}

export function daysBetween(a: string, b: string): number {
  return Math.round((fromISODate(b).getTime() - fromISODate(a).getTime()) / 86_400_000);
}

export const DAY_SHORT = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
export const DAY_LONG = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"];

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  return fromISODate(iso).toLocaleDateString("pl-PL", opts);
}

export function fmtRelativeDay(iso: string): string {
  const diff = daysBetween(today(), iso);
  if (diff === 0) return "Dziś";
  if (diff === -1) return "Wczoraj";
  if (diff === 1) return "Jutro";
  return `${DAY_LONG[weekday(iso)]}, ${fmtDate(iso)}`;
}
