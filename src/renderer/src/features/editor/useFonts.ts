import { useEffect, useState } from 'react'

const FALLBACK = [
  'Segoe UI', 'Inter', 'Arial', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia',
  'Times New Roman', 'Courier New', 'Consolas', 'Impact', 'Comic Sans MS'
]

/** System fonts via the Local Font Access API (like Avalonia's SystemFonts); falls back to a safe list. */
export function useFonts(): string[] {
  const [fonts, setFonts] = useState<string[]>(FALLBACK)
  useEffect(() => {
    let cancelled = false
    const query = window.queryLocalFonts
    if (!query) return
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500))
    Promise.race([query.call(window), timeout])
      .then((list) => {
        if (cancelled) return
        const families = Array.from(new Set(list.map((f) => f.family))).sort((a, b) => a.localeCompare(b))
        if (families.length > 0) setFonts(families)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])
  return fonts
}
