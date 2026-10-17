// Print-sheet layout. Pure functions (no DOM) so they can be unit tested.

export type PaperId = 'a4' | 'letter' | 'photo'
export type Arrangement = 'single' | 'double' | 'foldable'

export const PAPERS: Record<PaperId, { label: string; width: number; height: number }> = {
  a4: { label: 'A4 (210 x 297 mm)', width: 2480, height: 3508 },
  letter: { label: 'Letter (8.5 x 11 in)', width: 2550, height: 3300 },
  photo: { label: '4x6 Photo (100 x 150 mm)', width: 1200, height: 1800 }
}

export const ARRANGEMENTS: Record<Arrangement, string> = {
  single: 'Single Set (1 Front, 1 Back)',
  double: 'Double Set (2 Fronts, 2 Backs)',
  foldable: 'Foldable (Vertical Fold)'
}

const GAP = 100
const TOP = 300

export interface Placement {
  side: 'front' | 'back'
  x: number
  y: number
}

export interface SheetLayout {
  width: number
  height: number
  placements: Placement[]
  /** false when a card would run off the paper */
  fits: boolean
}

export function layoutSheet(paper: PaperId, arrangement: Arrangement, cardW = 1028, cardH = 652): SheetLayout {
  const { width, height } = PAPERS[paper]
  const x = Math.round((width - cardW) / 2)
  const placements: Placement[] = []

  if (arrangement === 'single') {
    placements.push({ side: 'front', x, y: TOP }, { side: 'back', x, y: TOP + cardH + GAP })
  } else if (arrangement === 'double') {
    for (let i = 0; i < 2; i++) {
      placements.push(
        { side: 'front', x, y: TOP + (cardH + GAP) * (i * 2) },
        { side: 'back', x, y: TOP + (cardH + GAP) * (i * 2 + 1) }
      )
    }
  } else {
    const startX = Math.round((width - (cardW * 2 + GAP)) / 2)
    placements.push({ side: 'front', x: startX, y: TOP }, { side: 'back', x: startX + cardW + GAP, y: TOP })
  }

  const fits = placements.every((p) => p.x >= 0 && p.y >= 0 && p.x + cardW <= width && p.y + cardH <= height)
  return { width, height, placements, fits }
}
