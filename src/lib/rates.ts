// Today's exchange rates from the European Central Bank reference rates (frankfurter.dev, free, no
// key; updated once per working day). Used when Company details is set to "automatic".
import type { Rates } from './order-desk.ts'

export type FetchedRates = Rates & { date: string; source: string }

export function ratesFromFrankfurter(j: unknown): FetchedRates | null {
  const r = (j as { base?: string; date?: string; rates?: Record<string, number> }) ?? {}
  const cny = Number(r.rates?.CNY)
  const eur = Number(r.rates?.EUR)
  if (r.base !== 'USD' || !(cny > 0) || !(eur > 0)) return null
  return { cnyPerUsd: Math.round(cny * 10000) / 10000, usdPerEur: Math.round((1 / eur) * 10000) / 10000, date: String(r.date ?? ''), source: 'European Central Bank (frankfurter.dev)' }
}

export async function fetchRates(timeoutMs = 6000): Promise<FetchedRates | null> {
  try {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=CNY,EUR', { signal: AbortSignal.timeout(timeoutMs) })
    return res.ok ? ratesFromFrankfurter(await res.json()) : null
  } catch {
    return null
  }
}
