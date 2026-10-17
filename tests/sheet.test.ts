import { describe, expect, it } from 'vitest'
import { layoutSheet } from '../src/renderer/src/features/export/sheet'

describe('print sheet layout', () => {
  it('single set on A4: front above back, centred', () => {
    const l = layoutSheet('a4', 'single')
    expect(l.width).toBe(2480)
    expect(l.placements).toEqual([
      { side: 'front', x: 726, y: 300 },
      { side: 'back', x: 726, y: 300 + 652 + 100 }
    ])
    expect(l.fits).toBe(true)
  })

  it('double set repeats front/back twice', () => {
    const l = layoutSheet('a4', 'double')
    expect(l.placements.map((p) => p.side)).toEqual(['front', 'back', 'front', 'back'])
    expect(l.placements[3].y).toBe(300 + (652 + 100) * 3)
    expect(l.fits).toBe(true)
  })

  it('foldable puts the two sides next to each other', () => {
    const l = layoutSheet('letter', 'foldable')
    expect(l.placements[0].y).toBe(l.placements[1].y)
    expect(l.placements[1].x - l.placements[0].x).toBe(1028 + 100)
  })

  it('flags layouts that run off the paper (double set on 4x6)', () => {
    expect(layoutSheet('photo', 'single').fits).toBe(true)
    expect(layoutSheet('photo', 'double').fits).toBe(false)
  })
})
