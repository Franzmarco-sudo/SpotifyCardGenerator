import { layoutSheet, type Arrangement, type PaperId, type SheetLayout } from './sheet'

export interface ComposeOptions {
  paper: PaperId
  arrangement: Arrangement
  transparent: boolean
}

export function composeSheet(
  target: HTMLCanvasElement,
  front: HTMLCanvasElement,
  back: HTMLCanvasElement,
  opts: ComposeOptions
): SheetLayout {
  const layout = layoutSheet(opts.paper, opts.arrangement, front.width, front.height)
  target.width = layout.width
  target.height = layout.height
  const ctx = target.getContext('2d')!
  ctx.clearRect(0, 0, layout.width, layout.height)
  if (!opts.transparent) {
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, layout.width, layout.height)
  }
  for (const p of layout.placements) ctx.drawImage(p.side === 'front' ? front : back, p.x, p.y)
  return layout
}

export async function canvasToBytes(canvas: HTMLCanvasElement, format: 'png' | 'jpg'): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, format === 'jpg' ? 'image/jpeg' : 'image/png', 0.95)
  )
  if (!blob) throw new Error('Could not encode image')
  return new Uint8Array(await blob.arrayBuffer())
}
