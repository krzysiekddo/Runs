import type { Run, Shoe } from "./types";

export const SHOE_LIFE_KM = 700;

const key = (name: string) => name.trim().toLowerCase();

export type ShoeMileage = { name: string; km: number; manual?: Shoe };

/** Hand-entered mileage plus runs logged after it; without an entry, the sum of all runs. */
export function shoeMileage(runs: Run[], shoes: Shoe[] = []): ShoeMileage[] {
  const out = new Map<string, ShoeMileage>();
  for (const s of shoes) out.set(key(s.name), { name: s.name, km: s.baseKm, manual: s });
  for (const r of runs) {
    if (!r.shoe) continue;
    const k = key(r.shoe);
    const entry = out.get(k) ?? { name: r.shoe.trim(), km: 0 };
    if (!entry.manual || r.createdAt > entry.manual.setAt) entry.km += r.km;
    out.set(k, entry);
  }
  return [...out.values()].sort((a, b) => b.km - a.km);
}

export function upsertShoe(shoes: Shoe[] = [], name: string, baseKm: number): Shoe[] {
  const rest = shoes.filter((s) => key(s.name) !== key(name));
  return [...rest, { name: name.trim(), baseKm, setAt: new Date().toISOString() }];
}

export function removeShoe(shoes: Shoe[] = [], name: string): Shoe[] {
  return shoes.filter((s) => key(s.name) !== key(name));
}
