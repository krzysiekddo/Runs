// Turns OCR text of Strava activity screenshots (Polish UI) into run fields.
// Two screens are supported: the activity summary and the "Międzyczasy" (splits) table.
import { addDays, parseDuration, toISODate, weekday } from "./format.ts";
import type { Split } from "./types.ts";

export type ParsedScreen = {
  date?: string;
  title?: string;
  km?: number;
  movingSec?: number;
  paceSec?: number;
  avgHr?: number;
  elevationM?: number;
  kcal?: number;
  shoe?: string;
  splits?: Split[];
};

/** Lowercase and strip Polish diacritics so OCR slips like "Sredni" still match. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l");
}

const MONTHS = [
  "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
  "lipca", "sierpnia", "wrzesnia", "pazdziernika", "listopada", "grudnia",
];
const WEEKDAYS = ["poniedzialek", "wtorek", "sroda", "czwartek", "piatek", "sobota", "niedziela"];

const SHOE_BRANDS = [
  "asics", "nike", "adidas", "hoka", "saucony", "brooks", "new balance", "mizuno", "puma",
  "on cloud", "salomon", "altra", "reebok", "under armour", "kiprun", "inov-8", "skechers", "diadora",
];

function parseDate(text: string, now: Date): string | undefined {
  const t = norm(text);
  const todayIso = toISODate(now);
  if (/\bdzisiaj\b|\bdzis\b/.test(t)) return todayIso;
  if (/\bwczoraj\b/.test(t)) return addDays(todayIso, -1);

  const m = t.match(/\b(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?\s+o\s+\d{1,2}:\d{2}/);
  if (m) {
    const month = MONTHS.findIndex((name) => m[2].startsWith(name.slice(0, 4)));
    if (month >= 0) {
      let year = m[3] ? Number(m[3]) : now.getFullYear();
      let d = new Date(year, month, Number(m[1]));
      if (!m[3] && d > now) d = new Date(--year, month, Number(m[1]));
      return toISODate(d);
    }
  }

  // "Środa o 7:12" — Strava uses weekday names for the last few days.
  const w = t.match(new RegExp(`\\b(${WEEKDAYS.join("|")})\\s+o\\s+\\d{1,2}:\\d{2}`));
  if (w) {
    const target = WEEKDAYS.indexOf(w[1]);
    const back = (weekday(todayIso) - target + 7) % 7 || 7;
    return addDays(todayIso, -back);
  }
  return undefined;
}

const num = (s: string) => Number(s.replace(",", "."));

/** First regex match that appears after `label` in the normalized text. */
function after(textNorm: string, label: RegExp, value: RegExp): RegExpMatchArray | null {
  const at = textNorm.search(label);
  if (at < 0) return null;
  return textNorm.slice(at).match(value);
}

function parseSummary(raw: string, now: Date): ParsedScreen {
  const t = norm(raw);
  const out: ParsedScreen = {};

  const km = after(t, /dystans/, /(\d{1,3}[,.]\d{1,2})\s*km\b(?!\s*\/)/);
  if (km) out.km = num(km[1]);

  const pace = after(t, /tempo/, /(\d{1,2}:\d{2})\s*\/\s*km/);
  if (pace) out.paceSec = parseDuration(pace[1]) ?? undefined;

  const moving = after(t, /czas ruchu|czas/, /(?<![\d:])(\d{1,2}:\d{2}(?::\d{2})?)(?![\d:]|\s*\/)/);
  if (moving) out.movingSec = parseDuration(moving[1]) ?? undefined;

  const hr = t.match(/(\d{2,3})\s*bpm/);
  if (hr) out.avgHr = Number(hr[1]);

  const elev = after(t, /przewy/, /(?<![\d:,.])(\d{1,4})\s*m\b/);
  if (elev) out.elevationM = Number(elev[1]);

  const kcal = t.match(/(\d{2,5})\s*kcal/);
  if (kcal) out.kcal = Number(kcal[1]);

  out.date = parseDate(raw, now);

  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  // Title: first real text line between the "Dzisiaj o 11:40 · …" line and the stats,
  // skipping achievement banners such as "Twój najlepszy czas na 10 km" / "2min 1s".
  const statsLine = lines.findIndex((l) => /^dystans/.test(norm(l)));
  const dateLine = lines.findIndex((l) => /\bo\s+\d{1,2}:\d{2}/.test(l));
  if (statsLine > 0) {
    const banner = /najlepsz|rekord|osiagniec|osobist|\bpr\b|historii|\d+\s*min|\d+\s*s\b|^\W*\d/;
    const candidate = lines
      .slice(dateLine >= 0 && dateLine < statsLine ? dateLine + 1 : Math.max(0, statsLine - 3), statsLine)
      .find((l) => /[a-ząćęłńóśźż]{3}/i.test(l) && !banner.test(norm(l)));
    if (candidate) out.title = candidate.replace(/^[^A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]+/, "");
  }

  for (const line of lines) {
    const n = norm(line);
    const brand = SHOE_BRANDS.find((b) => n.includes(b));
    if (brand) {
      out.shoe = line.slice(n.indexOf(brand)).trim();
      break;
    }
  }

  // Fill a missing value from the other two (pace = time / distance).
  if (out.km && out.paceSec && !out.movingSec) out.movingSec = Math.round(out.km * out.paceSec);
  if (out.km && out.movingSec && !out.paceSec) out.paceSec = out.movingSec / out.km;
  return out;
}

function parseSplits(raw: string): Split[] {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  // The table may be scrolled so that only its "Km Tempo Wys. HR" header is visible.
  const header = lines.findIndex((l) => /\bkm\b.*\btempo\b/.test(norm(l)));
  const start = header >= 0 ? header : lines.findIndex((l) => norm(l).includes("miedzyczasy"));
  const splits: Split[] = [];
  let withHr = false;
  for (const line of lines.slice(start + 1)) {
    const n = norm(line);
    if (/tempo/.test(n) && /\bhr\b|wys/.test(n)) continue; // table header
    if (splits.length && /^tempo\b/.test(n)) break; // next section
    const pace = line.match(/(\d{1,2}):(\d{2})/);
    if (!pace) continue;
    const paceSec = Number(pace[1]) * 60 + Number(pace[2]);
    if (paceSec < 150 || paceSec > 900) continue;
    const tail = line.slice((pace.index ?? 0) + pace[0].length);
    const hrs = [...tail.matchAll(/(?<![\d:])(\d{2,3})(?![\d:])/g)].map((m) => Number(m[1]));
    const hr = hrs.reverse().find((v) => v >= 80 && v <= 230);
    if (hr) withHr = true;
    else if (withHr) break; // the table had HR; a row without it is something else
    splits.push(hr ? { paceSec, hr } : { paceSec });
  }
  return splits;
}

export function isSplitsText(raw: string): boolean {
  const t = norm(raw);
  // Column layouts may put "Km", "Tempo", "Wys." and "HR" on separate lines.
  return t.includes("miedzyczasy") || (/\btempo\b/.test(t) && /\bwys\b/.test(t) && /\bhr\b/.test(t));
}

export function parseStravaText(raw: string, now = new Date()): ParsedScreen {
  const t = norm(raw);
  const result: ParsedScreen = {};
  if (t.includes("dystans")) Object.assign(result, parseSummary(raw, now));
  if (isSplitsText(raw)) {
    const splits = parseSplits(raw);
    if (splits.length) result.splits = splits;
  }
  return result;
}

/** Combines several screenshots; earlier screens win on conflicts. */
export function mergeParsed(parts: ParsedScreen[]): ParsedScreen {
  const merged: ParsedScreen = {};
  for (const p of parts) {
    for (const [k, v] of Object.entries(p) as [keyof ParsedScreen, unknown][]) {
      if (v !== undefined && merged[k] === undefined) (merged as Record<string, unknown>)[k] = v;
    }
  }
  return merged;
}
