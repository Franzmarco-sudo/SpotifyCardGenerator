import { Canvas, FabricImage, FabricObject, Group, IText, Rect, Textbox } from 'fabric'
import type { TPointerEventInfo } from 'fabric'
import QRCode from 'qrcode'

// ------------------------------------------------------------------------------------------------
// Constants & types
// ------------------------------------------------------------------------------------------------

export const CARD_W = 350
export const CARD_H = 220
export const EXPORT_W = 1028 // 86x54 mm + ~1 mm bleed at 300 dpi (same as the Avalonia app)
export const EXPORT_H = 652
export const DEFAULT_FONT = "'Segoe UI', Inter, Arial, sans-serif"
export const MAX_SONGS = 10

const QR_PX = 600 // fixed bitmap size so the on-card size is purely `scale`
const GRID_W = CARD_W / 2
const GRID_H = CARD_H / 2

export type Side = 'front' | 'back'
export type FrontTemplate = 0 | 1 | 2 // clean | title | 2x2 grid
export type BackTemplate = 0 | 1 | 2 // QR only | tracklist | paragraph

type Kind = 'qr' | 'title' | 'tracklist' | 'paragraph' | 'text' | 'image' | 'gridPlaceholder' | 'gridImage'
interface Meta {
  kind: Kind
  name?: string
  cell?: number
}
const metas = new WeakMap<FabricObject, Meta>()
const metaOf = (o: FabricObject | undefined | null): Meta | undefined => (o ? metas.get(o) : undefined)

export interface LayerInfo {
  /** index in the canvas object stack */
  index: number
  name: string
  kind: Kind
  selected: boolean
  deletable: boolean
}

export interface SelectionInfo {
  side: Side
  kind: Kind
  deletable: boolean
  isText: boolean
  text: string
  fontFamily: string
  fontSize: number
  fill: string
  bold: boolean
  italic: boolean
}

export interface TextPatch {
  text?: string
  fontFamily?: string
  fontSize?: number
  fill?: string
  bold?: boolean
  italic?: boolean
}

export interface EditorHooks {
  /** Anything the React UI may need to re-read changed. */
  onChange: () => void
  /** The QR was resized on the canvas (handles) or by a template. */
  onQrSize: (px: number) => void
}

// Make Fabric's handles match the app's look.
Object.assign(FabricObject.ownDefaults, {
  cornerColor: '#1DB954',
  cornerStrokeColor: '#0b3d1e',
  borderColor: '#1DB954',
  transparentCorners: false,
  cornerSize: 9,
  cornerStyle: 'circle',
  borderScaleFactor: 1.5
})

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

/** Opens the OS file picker for an image. Resolves null when cancelled. */
export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

// ------------------------------------------------------------------------------------------------
// The editor
// ------------------------------------------------------------------------------------------------

export class CardEditor {
  readonly front: Canvas
  readonly back: Canvas

  private frontTemplate: FrontTemplate = 1
  private backTemplate: BackTemplate = 0

  private title!: IText
  private paragraph!: Textbox
  private tracklist: Group | null = null
  private qr: FabricImage | null = null
  private cells: Array<{ placeholder: Group; image: FabricImage | null }> = []

  private qrUrl = 'http://spotify.com'
  private qrColor = '#000000'
  private qrToken = 0
  private songs: string[] = Array.from({ length: MAX_SONGS }, (_, i) => `Song #${i + 1}`)
  private songCount = 3
  private trackStyle = { color: '#000000', size: 12 }
  private disposed = false

  constructor(
    frontEl: HTMLCanvasElement,
    backEl: HTMLCanvasElement,
    private readonly hooks: EditorHooks
  ) {
    const opts = { width: CARD_W, height: CARD_H, backgroundColor: '#FFFFFF', preserveObjectStacking: true, selection: false }
    this.front = new Canvas(frontEl, opts)
    this.back = new Canvas(backEl, opts)

    this.wire(this.front, 'front')
    this.wire(this.back, 'back')
    this.buildFront()
    this.buildBack()
  }

  /** Creates the QR code (async because Fabric loads images asynchronously). */
  async init(qrSize: number): Promise<void> {
    await this.refreshQr(true)
    if (this.disposed || !this.qr) return
    this.setQrSize(qrSize)
    this.applyBackTemplate(false)
    this.emit()
  }

  async dispose(): Promise<void> {
    this.disposed = true
    await Promise.all([this.front.dispose(), this.back.dispose()])
  }

  // ------------------------------------------------------------------ canvas wiring

  private wire(canvas: Canvas, side: Side): void {
    const other = side === 'front' ? this.back : this.front
    const changed = (): void => this.emit()

    canvas.on('selection:created', () => {
      other.discardActiveObject()
      other.requestRenderAll()
      changed()
    })
    canvas.on('selection:updated', changed)
    canvas.on('selection:cleared', changed)
    canvas.on('text:changed', changed)
    canvas.on('object:modified', changed)

    canvas.on('object:moving', (e) => {
      const meta = metaOf(e.target)
      if (meta?.kind === 'gridImage') this.clampGridImage(e.target as FabricImage, meta.cell ?? 0)
    })
    canvas.on('object:scaling', (e) => {
      if (e.target === this.qr) this.hooks.onQrSize(Math.round(this.qr!.getScaledWidth()))
    })

    // Empty grid cell: click opens the image picker. Filled cell: double-click replaces the image.
    canvas.on('mouse:down', (e: TPointerEventInfo) => {
      const meta = metaOf(e.target)
      if (meta?.kind === 'gridPlaceholder') void this.pickForCell(meta.cell ?? 0)
    })
    canvas.on('mouse:dblclick', (e: TPointerEventInfo) => {
      const meta = metaOf(e.target)
      if (meta?.kind === 'gridImage') void this.pickForCell(meta.cell ?? 0)
    })
  }

  private emit(): void {
    if (!this.disposed) this.hooks.onChange()
  }

  private canvasOf(side: Side): Canvas {
    return side === 'front' ? this.front : this.back
  }

  private render(): void {
    this.front.requestRenderAll()
    this.back.requestRenderAll()
  }

  /** Fits the 350x220 cards into the available space (CSS scaling only; pixels stay 350x220). */
  setScale(scale: number): void {
    for (const c of [this.front, this.back]) {
      c.setDimensions({ width: Math.round(CARD_W * scale), height: Math.round(CARD_H * scale) }, { cssOnly: true })
    }
  }

  setLinkRatio(linked: boolean): void {
    this.front.uniformScaling = linked
    this.back.uniformScaling = linked
  }

  // ------------------------------------------------------------------ building

  private buildFront(): void {
    // 2x2 image grid sits at the very bottom of the stack.
    for (let i = 0; i < 4; i++) {
      const left = (i % 2) * GRID_W
      const top = Math.floor(i / 2) * GRID_H
      const rect = new Rect({ left: 0, top: 0, width: GRID_W, height: GRID_H, fill: '#F5F5F5', stroke: '#DDDDDD', strokeWidth: 0.5 })
      const plus = new IText('+  Add image', { fontSize: 13, fill: '#9a9a9a', fontFamily: DEFAULT_FONT, originX: 'center', originY: 'center', left: GRID_W / 2, top: GRID_H / 2 })
      const placeholder = new Group([rect, plus], {
        left,
        top,
        selectable: false,
        evented: true,
        hasControls: false,
        hoverCursor: 'pointer',
        visible: false,
        subTargetCheck: false
      })
      metas.set(placeholder, { kind: 'gridPlaceholder', cell: i })
      this.front.add(placeholder)
      this.cells.push({ placeholder, image: null })
    }

    this.title = new IText('MY PLAYLIST', { left: 20, top: 20, fontSize: 32, fontWeight: 'bold', fill: '#000000', fontFamily: DEFAULT_FONT })
    metas.set(this.title, { kind: 'title' })
    this.front.add(this.title)
    this.setFrontTemplate(1)
  }

  private buildBack(): void {
    this.paragraph = new Textbox('Lorem ipsum dolor sit amet.', {
      left: 15,
      top: 15,
      width: 180,
      fontSize: 11,
      fill: '#000000',
      fontFamily: DEFAULT_FONT,
      visible: false
    })
    metas.set(this.paragraph, { kind: 'paragraph' })
    this.back.add(this.paragraph)
    this.rebuildTracklist()
  }

  // ------------------------------------------------------------------ colours

  setCardColor(side: Side, hex: string): void {
    const c = this.canvasOf(side)
    c.backgroundColor = hex
    c.requestRenderAll()
  }

  // ------------------------------------------------------------------ QR

  setQrUrl(url: string): void {
    if (!url) return // like the original: empty text keeps the previous QR
    this.qrUrl = url
    void this.refreshQr(false)
  }

  setQrColor(hex: string): void {
    this.qrColor = hex
    void this.refreshQr(false)
  }

  getQrSize(): number {
    return this.qr ? Math.round(this.qr.getScaledWidth()) : 120
  }

  setQrSize(px: number): void {
    if (!this.qr) return
    this.qr.scale(clamp(px, 50, 250) / QR_PX)
    this.qr.setCoords()
    this.back.requestRenderAll()
    this.emit()
  }

  private async refreshQr(first: boolean): Promise<void> {
    const token = ++this.qrToken
    const dataUrl = await QRCode.toDataURL(this.qrUrl, {
      width: QR_PX,
      margin: 4,
      errorCorrectionLevel: 'Q',
      color: { dark: this.qrColor, light: '#00000000' }
    })
    if (this.disposed || token !== this.qrToken) return // a newer request superseded this one

    if (!this.qr) {
      const img = await FabricImage.fromURL(dataUrl)
      if (this.disposed || token !== this.qrToken) return
      img.set({ left: 115, top: 50, lockUniScaling: true, lockScalingFlip: true })
      img.scale(120 / QR_PX)
      img.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false, mtr: false })
      metas.set(img, { kind: 'qr' })
      this.qr = img
      this.back.add(img)
    } else {
      await this.qr.setSrc(dataUrl)
    }
    this.enforceQrOnTop()
    this.back.requestRenderAll()
    if (!first) this.emit()
  }

  private enforceQrOnTop(): void {
    if (this.qr) this.back.bringObjectToFront(this.qr)
  }

  // ------------------------------------------------------------------ templates

  getFrontTemplate(): FrontTemplate {
    return this.frontTemplate
  }
  getBackTemplate(): BackTemplate {
    return this.backTemplate
  }

  setFrontTemplate(t: FrontTemplate): void {
    this.frontTemplate = t
    this.title.visible = t === 1
    for (const c of this.cells) {
      c.placeholder.visible = t === 2
      if (c.image) c.image.visible = t === 2
    }
    this.front.discardActiveObject()
    this.front.requestRenderAll()
    this.emit()
  }

  setBackTemplate(t: BackTemplate): void {
    this.backTemplate = t
    this.back.discardActiveObject()
    this.applyBackTemplate(true)
  }

  private applyBackTemplate(resetQr: boolean): void {
    if (this.tracklist) this.tracklist.visible = this.backTemplate === 1
    this.paragraph.visible = this.backTemplate === 2
    if (this.qr && resetQr) {
      if (this.backTemplate === 0) {
        this.qr.set({ left: 115, top: 50 })
        this.setQrSize(120)
      } else {
        this.qr.set({ left: 250, top: 70 })
        this.setQrSize(80)
      }
      this.hooks.onQrSize(this.getQrSize())
    }
    this.enforceQrOnTop()
    this.back.requestRenderAll()
    this.emit()
  }

  // ------------------------------------------------------------------ title & tracklist

  getTitleStyle(): { color: string; size: number } {
    return { color: String(this.title.fill), size: this.title.fontSize }
  }

  setTitleStyle(patch: { color?: string; size?: number }): void {
    if (patch.color) this.title.set('fill', patch.color)
    if (patch.size) this.title.set('fontSize', patch.size)
    this.title.setCoords()
    this.front.requestRenderAll()
    this.emit()
  }

  getTrackStyle(): { color: string; size: number } {
    return { ...this.trackStyle }
  }

  setTrackStyle(patch: { color?: string; size?: number }): void {
    this.trackStyle = { ...this.trackStyle, ...patch }
    this.rebuildTracklist()
  }

  getSongs(): { titles: string[]; count: number } {
    return { titles: [...this.songs], count: this.songCount }
  }

  setSongs(titles: string[], count: number): void {
    this.songs = Array.from({ length: MAX_SONGS }, (_, i) => titles[i] ?? '')
    this.songCount = clamp(count, 1, MAX_SONGS)
    this.rebuildTracklist()
  }

  /** Two columns of up to five songs (same layout as the Avalonia grid). */
  private rebuildTracklist(): void {
    const prev = this.tracklist
    const index = prev ? this.back.getObjects().indexOf(prev) : -1
    const left = prev?.left ?? 15
    const top = prev?.top ?? 15
    if (prev) this.back.remove(prev)

    const colY = [0, 0]
    const items: Textbox[] = []
    for (let i = 0; i < this.songCount; i++) {
      const col = i < 5 ? 0 : 1
      const tb = new Textbox(this.songs[i] || `Song #${i + 1}`, {
        left: col * 100,
        top: colY[col],
        width: 90,
        fontSize: this.trackStyle.size,
        fill: this.trackStyle.color,
        fontFamily: DEFAULT_FONT
      })
      colY[col] += tb.height + 8
      items.push(tb)
    }

    const group = new Group(items, { subTargetCheck: false, interactive: false, visible: this.backTemplate === 1 })
    group.set({ left, top })
    metas.set(group, { kind: 'tracklist' })
    this.tracklist = group
    if (index >= 0) this.back.insertAt(index, group)
    else this.back.add(group)
    this.enforceQrOnTop()
    this.back.requestRenderAll()
    this.emit()
  }

  // ------------------------------------------------------------------ user layers

  addText(side: Side): void {
    const canvas = this.canvasOf(side)
    const t = new IText('New Text', { left: 50, top: 50, fontSize: 18, fontWeight: 'bold', fill: '#000000', fontFamily: DEFAULT_FONT })
    metas.set(t, { kind: 'text' })
    canvas.add(t)
    if (side === 'back') this.enforceQrOnTop()
    canvas.setActiveObject(t)
    canvas.requestRenderAll()
    this.emit()
  }

  async addImage(side: Side, file: File): Promise<void> {
    const canvas = this.canvasOf(side)
    const img = await FabricImage.fromURL(await readAsDataUrl(file))
    const s = 100 / Math.max(img.width, img.height) // fits 100x100 without distortion
    img.set({ left: 40, top: 40, scaleX: s, scaleY: s })
    metas.set(img, { kind: 'image', name: file.name })
    canvas.add(img)
    if (side === 'back') this.enforceQrOnTop()
    canvas.setActiveObject(img)
    canvas.requestRenderAll()
    this.emit()
  }

  // ------------------------------------------------------------------ grid cells

  private async pickForCell(cell: number): Promise<void> {
    const file = await pickImageFile()
    if (file) await this.setCellImage(cell, file)
  }

  private cellRect(cell: number): { left: number; top: number } {
    return { left: (cell % 2) * GRID_W, top: Math.floor(cell / 2) * GRID_H }
  }

  async setCellImage(cell: number, file: File): Promise<void> {
    const slot = this.cells[cell]
    if (!slot) return
    const img = await FabricImage.fromURL(await readAsDataUrl(file))
    const { left, top } = this.cellRect(cell)
    // "Uniform to fill": cover the whole cell, the user can pan inside it.
    const s = Math.max(GRID_W / img.width, GRID_H / img.height)
    img.set({
      left: left + (GRID_W - img.width * s) / 2,
      top: top + (GRID_H - img.height * s) / 2,
      scaleX: s,
      scaleY: s,
      hasControls: false,
      hasBorders: false,
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true,
      hoverCursor: 'move',
      clipPath: new Rect({ left, top, width: GRID_W, height: GRID_H, absolutePositioned: true })
    })
    metas.set(img, { kind: 'gridImage', cell, name: `Grid ${cell + 1}: ${file.name}` })
    if (slot.image) this.front.remove(slot.image)
    slot.image = img
    this.front.add(img)
    // Grid images live right above the 4 placeholders and below the title / user layers.
    const others = this.cells.filter((c) => c.image && c.image !== img).length
    this.front.moveObjectTo(img, 4 + others)
    this.front.requestRenderAll()
    this.emit()
  }

  private clampGridImage(img: FabricImage, cell: number): void {
    const { left, top } = this.cellRect(cell)
    const w = img.getScaledWidth()
    const h = img.getScaledHeight()
    img.set({
      left: clamp(img.left, left + GRID_W - w, left),
      top: clamp(img.top, top + GRID_H - h, top)
    })
  }

  // ------------------------------------------------------------------ selection & properties

  private active(): { obj: FabricObject; side: Side; canvas: Canvas } | null {
    for (const side of ['front', 'back'] as const) {
      const canvas = this.canvasOf(side)
      const obj = canvas.getActiveObject()
      if (obj) return { obj, side, canvas }
    }
    return null
  }

  getSelection(): SelectionInfo | null {
    const a = this.active()
    if (!a) return null
    const meta = metaOf(a.obj)
    if (!meta) return null
    const isText = a.obj instanceof IText
    const t = a.obj as IText
    return {
      side: a.side,
      kind: meta.kind,
      deletable: meta.kind === 'text' || meta.kind === 'image' || meta.kind === 'gridImage',
      isText,
      text: isText ? t.text : '',
      fontFamily: isText ? String(t.fontFamily) : DEFAULT_FONT,
      fontSize: isText ? t.fontSize : 18,
      fill: isText ? String(t.fill) : '#000000',
      bold: isText && t.fontWeight === 'bold',
      italic: isText && t.fontStyle === 'italic'
    }
  }

  updateSelectedText(patch: TextPatch): void {
    const a = this.active()
    if (!a || !(a.obj instanceof IText)) return
    const t = a.obj
    if (patch.text !== undefined) t.set('text', patch.text)
    if (patch.fontFamily !== undefined) t.set('fontFamily', patch.fontFamily)
    if (patch.fontSize !== undefined && patch.fontSize > 0) t.set('fontSize', patch.fontSize)
    if (patch.fill !== undefined) t.set('fill', patch.fill)
    if (patch.bold !== undefined) t.set('fontWeight', patch.bold ? 'bold' : 'normal')
    if (patch.italic !== undefined) t.set('fontStyle', patch.italic ? 'italic' : 'normal')
    t.setCoords()
    a.canvas.requestRenderAll()
    this.emit()
  }

  deleteSelected(): void {
    const a = this.active()
    if (!a) return
    const meta = metaOf(a.obj)
    if (!meta) return
    if (meta.kind === 'gridImage') {
      const slot = this.cells[meta.cell ?? 0]
      if (slot) slot.image = null
    } else if (meta.kind !== 'text' && meta.kind !== 'image') {
      return // QR, title, tracklist and paragraph are part of the templates
    }
    a.canvas.remove(a.obj)
    a.canvas.discardActiveObject()
    a.canvas.requestRenderAll()
    this.emit()
  }

  // ------------------------------------------------------------------ layers panel

  private layerName(o: FabricObject, meta: Meta): string {
    switch (meta.kind) {
      case 'qr':
        return 'QR Code'
      case 'title':
        return (o as IText).text || 'Title'
      case 'tracklist':
        return 'Tracklist'
      case 'paragraph':
        return 'Paragraph'
      case 'text':
        return (o as IText).text || 'Text'
      default:
        return meta.name ?? 'Image'
    }
  }

  private isListed(o: FabricObject): boolean {
    const meta = metaOf(o)
    return !!meta && meta.kind !== 'gridPlaceholder' && o.visible
  }

  /** Top-most layer first, like the original Layers window. */
  getLayers(side: Side): LayerInfo[] {
    const canvas = this.canvasOf(side)
    const active = canvas.getActiveObject()
    const out: LayerInfo[] = []
    const objs = canvas.getObjects()
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i]
      if (!this.isListed(o)) continue
      const meta = metaOf(o)!
      out.push({
        index: i,
        name: this.layerName(o, meta),
        kind: meta.kind,
        selected: o === active,
        deletable: meta.kind === 'text' || meta.kind === 'image' || meta.kind === 'gridImage'
      })
    }
    return out
  }

  selectLayer(side: Side, index: number): void {
    const canvas = this.canvasOf(side)
    const o = canvas.getObjects()[index]
    if (!o || !this.isListed(o)) return
    const other = side === 'front' ? this.back : this.front
    other.discardActiveObject()
    other.requestRenderAll()
    canvas.setActiveObject(o)
    canvas.requestRenderAll()
    this.emit()
  }

  /** dir = +1 moves the selected layer towards the front, -1 towards the back. */
  moveSelected(dir: 1 | -1): void {
    const a = this.active()
    if (!a) return
    const objs = a.canvas.getObjects()
    const listed = objs.map((o, i) => (this.isListed(o) ? i : -1)).filter((i) => i >= 0)
    const pos = listed.indexOf(objs.indexOf(a.obj))
    const target = listed[pos + dir]
    if (pos < 0 || target === undefined) return
    a.canvas.moveObjectTo(a.obj, target)
    if (a.side === 'back') this.enforceQrOnTop()
    a.canvas.requestRenderAll()
    this.emit()
  }

  // ------------------------------------------------------------------ export

  /** Renders a side to an EXPORT_W x EXPORT_H canvas (same size as the Avalonia export). */
  renderSide(side: Side): HTMLCanvasElement {
    const canvas = this.canvasOf(side)
    canvas.discardActiveObject()
    canvas.renderAll()
    const src = canvas.toCanvasElement(EXPORT_W / CARD_W)
    const out = document.createElement('canvas')
    out.width = EXPORT_W
    out.height = EXPORT_H
    const ctx = out.getContext('2d')!
    ctx.drawImage(src, 0, 0, EXPORT_W, EXPORT_H)
    return out
  }
}
