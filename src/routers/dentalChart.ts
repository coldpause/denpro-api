import { z } from 'zod'
import { router, publicProcedure } from '../trpc.js'
import { gunzipSync, inflateSync, unzipSync } from 'node:zlib'

const ADULT_TOOTH_ORDER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28, 48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]
const PEDO_TOOTH_ORDER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65, 85, 84, 83, 82, 81, 71, 72, 73, 74, 75]
const TOOTH_SET = new Set([...ADULT_TOOTH_ORDER, ...PEDO_TOOTH_ORDER])

function tryParseJsonText(text: string): unknown | null {
  const cleaned = text.replace(/\x00/g, '').trim()
  if (!cleaned) return null
  try {
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

function decodeLegacyJson(raw: string | null | undefined): unknown | null {
  if (!raw) return null

  const direct = tryParseJsonText(raw)
  if (direct !== null) return direct

  const base64Like = /^[A-Za-z0-9+/=\s]+$/.test(raw) && raw.replace(/\s/g, '').length >= 16
  if (base64Like) {
    try {
      const b64 = Buffer.from(raw.replace(/\s/g, ''), 'base64')
      const parsed = tryParseJsonText(b64.toString('utf8')) ?? tryParseJsonText(b64.toString('latin1'))
      if (parsed !== null) return parsed
    } catch {
      // ignore
    }
  }

  const asLatin1 = Buffer.from(raw, 'latin1')
  const bufferCandidates: Buffer[] = [asLatin1]
  for (const decode of [inflateSync, gunzipSync, unzipSync] as const) {
    try {
      bufferCandidates.push(decode(asLatin1))
    } catch {
      // ignore
    }
  }

  for (const candidate of bufferCandidates) {
    const parsed =
      tryParseJsonText(candidate.toString('utf8')) ??
      tryParseJsonText(candidate.toString('latin1')) ??
      tryParseJsonText(candidate.toString('utf16le'))
    if (parsed !== null) return parsed
  }

  return null
}

function decodeBinaryField(raw: string | null | undefined): Buffer | null {
  if (!raw) return null
  if (raw.startsWith('b64:')) {
    try {
      return Buffer.from(raw.slice(4), 'base64')
    } catch {
      return null
    }
  }
  try {
    return Buffer.from(raw, 'latin1')
  } catch {
    return null
  }
}

function decodeLegacyRepositionStream(
  repositionRaw: string | null | undefined,
  orderRaw: string | null | undefined
): Array<{ slot: number; order: number; x: number; y: number }> {
  const repositionBuf = decodeBinaryField(repositionRaw)
  if (!repositionBuf || repositionBuf.length < 8 || repositionBuf.length % 4 !== 0) return []
  const orderBuf = decodeBinaryField(orderRaw)
  const points = repositionBuf.length / 4
  const out: Array<{ slot: number; order: number; x: number; y: number }> = []
  for (let i = 0; i < points; i++) {
    const x = repositionBuf.readInt16LE(i * 4)
    const y = repositionBuf.readInt16LE(i * 4 + 2)
    const order = orderBuf && i < orderBuf.length ? orderBuf.readUInt8(i) : i
    out.push({ slot: i, order, x, y })
  }
  return out
}

function decodeLegacySymbolsHeuristic(
  symbolsRaw: string | null | undefined,
  repositionRaw: string | null | undefined,
  orderRaw: string | null | undefined,
  isPedo: boolean
): { overlays: Array<{ toothId: number; type: string; color?: string; confidence: 'low' | 'medium' }>; connections: Array<{ from: number; to: number; color?: string }> } {
  const symbolsBuf = decodeBinaryField(symbolsRaw)
  if (!symbolsBuf || symbolsBuf.length < 16) return { overlays: [], connections: [] }
  const points = decodeLegacyRepositionStream(repositionRaw, orderRaw)
  if (points.length === 0) return { overlays: [], connections: [] }

  const pointByXY = new Map<string, number>()
  for (const p of points) pointByXY.set(`${p.x},${p.y}`, p.order)

  const scoreByOrder = new Map<number, number>()
  for (let off = 0; off + 3 < symbolsBuf.length; off += 2) {
    const x = symbolsBuf.readInt16LE(off)
    const y = symbolsBuf.readInt16LE(off + 2)
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const order = pointByXY.get(`${x + dx},${y + dy}`)
        if (order !== undefined) scoreByOrder.set(order, (scoreByOrder.get(order) ?? 0) + 1)
      }
    }
  }

  const sortedOrders = [...scoreByOrder.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter(([, score]) => score >= 2)
    .map(([order]) => order)

  const orderMap = isPedo ? PEDO_TOOTH_ORDER : ADULT_TOOTH_ORDER
  const symbolClass = symbolsBuf.readUInt32LE(4)
  const overlayByClass: Record<number, { type: string; color: string }> = {
    1: { type: 'crown', color: '#f59e0b' },
    2: { type: 'endo', color: '#ef4444' },
    3: { type: 'implant', color: '#3b82f6' },
    4: { type: 'bridge-pontic', color: '#8b5cf6' },
    5: { type: 'bracket', color: '#10b981' },
  }
  const picked = overlayByClass[symbolClass] ?? { type: 'crown', color: '#9ca3af' }

  const overlays = sortedOrders
    .map((order) => ({ order, toothId: orderMap[order], score: scoreByOrder.get(order) ?? 0 }))
    .filter((x): x is { order: number; toothId: number; score: number } => typeof x.toothId === 'number')
    .map((x) => ({
      toothId: x.toothId,
      type: picked.type,
      color: picked.color,
      confidence: x.score > 4 ? 'medium' as const : 'low' as const,
    }))

  const connections: Array<{ from: number; to: number; color?: string }> = []
  if (picked.type === 'bridge-pontic' && overlays.length >= 2) {
    const ids = overlays.map((o) => o.toothId).sort((a, b) => a - b)
    connections.push({ from: ids[0], to: ids[ids.length - 1], color: picked.color })
  }

  return { overlays, connections }
}

function decodeLegacySymbolsDirect(symbolsRaw: string | null | undefined): { overlays: Array<{ toothId: number; type: string; color?: string; confidence: 'low' | 'medium' }>; connections: Array<{ from: number; to: number; color?: string }> } {
  const symbolsBuf = decodeBinaryField(symbolsRaw)
  if (!symbolsBuf || symbolsBuf.length < 16) return { overlays: [], connections: [] }

  const overlayByClass: Record<number, { type: string; color: string }> = {
    1: { type: 'crown', color: '#f59e0b' },
    2: { type: 'endo', color: '#ef4444' },
    3: { type: 'implant', color: '#3b82f6' },
    4: { type: 'bridge-pontic', color: '#8b5cf6' },
    5: { type: 'bracket', color: '#10b981' },
  }

  const candidates: Array<{ toothId: number; cls: number; confidence: 'low' | 'medium' }> = []
  const scanLen = Math.min(symbolsBuf.length - 2, 2048)
  for (let off = 8; off <= scanLen; off += 2) {
    const toothId = symbolsBuf.readUInt16LE(off)
    if (!TOOTH_SET.has(toothId)) continue
    const marker = symbolsBuf.readUInt16LE(off - 4)
    const cls = symbolsBuf.readUInt16LE(off - 2)
    if (marker !== 0xffff) continue
    if (cls < 1 || cls > 8) continue
    candidates.push({ toothId, cls, confidence: 'medium' })
  }

  if (candidates.length === 0) {
    for (let off = 0; off <= scanLen; off += 2) {
      const toothId = symbolsBuf.readUInt16LE(off)
      if (!TOOTH_SET.has(toothId)) continue
      candidates.push({ toothId, cls: 1, confidence: 'low' })
    }
  }

  const byTooth = new Map<number, { cls: number; confidence: 'low' | 'medium'; score: number }>()
  const clsHistogram = new Map<number, Map<number, number>>()
  for (const c of candidates) {
    if (!clsHistogram.has(c.toothId)) clsHistogram.set(c.toothId, new Map<number, number>())
    const h = clsHistogram.get(c.toothId)!
    h.set(c.cls, (h.get(c.cls) ?? 0) + 1)
  }

  for (const [toothId, h] of clsHistogram.entries()) {
    const sorted = [...h.entries()].sort((a, b) => b[1] - a[1])
    const [bestCls, score] = sorted[0]
    byTooth.set(toothId, { cls: bestCls, score, confidence: score >= 2 ? 'medium' : 'low' })
  }

  // Calibration: keep high-signal teeth first and limit noisy broad matches.
  const topTeeth = [...byTooth.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 12)

  const overlays = topTeeth.map(([toothId, meta]) => {
    const picked = overlayByClass[meta.cls] ?? { type: 'crown', color: '#9ca3af' }
    return { toothId, type: picked.type, color: picked.color, confidence: meta.confidence }
  })

  const connections: Array<{ from: number; to: number; color?: string }> = []
  const bridges = overlays.filter((o) => o.type === 'bridge-pontic').map((o) => o.toothId).sort((a, b) => a - b)
  if (bridges.length >= 2) connections.push({ from: bridges[0], to: bridges[bridges.length - 1], color: '#8b5cf6' })

  return { overlays, connections }
}

export const dentalChartRouter = router({
  getSymbols: publicProcedure
    .input(z.object({ patientId: z.number(), isPedo: z.boolean().default(false) }))
    .query(async ({ input, ctx }) => {
      const [symbol, repo] = await Promise.all([
        ctx.prisma.symbol.findFirst({ where: { patientId: input.patientId, pedo: input.isPedo } }),
        ctx.prisma.reposition.findFirst({ where: { patientId: input.patientId, pedo: input.isPedo } }),
      ])
      if (!symbol || !symbol.symbolsData) return { overlays: [], connections: [] }
      try {
        const data = JSON.parse(symbol.symbolsData)
        return {
          overlays: Array.isArray(data.overlays) ? data.overlays : [],
          connections: Array.isArray(data.connections) ? data.connections : []
        }
      } catch {
        const heuristic = decodeLegacySymbolsHeuristic(
          symbol.symbolsData,
          repo?.repositionStream,
          repo?.orderStream,
          input.isPedo
        )
        if ((heuristic.overlays || []).length > 0) return heuristic
        return decodeLegacySymbolsDirect(symbol.symbolsData)
      }
    }),

  setSymbols: publicProcedure
    .input(z.object({
      patientId: z.number(),
      isPedo: z.boolean().default(false),
      overlays: z.array(z.any()),
      connections: z.array(z.any())
    }))
    .mutation(async ({ input, ctx }) => {
      const dataStr = JSON.stringify({ overlays: input.overlays, connections: input.connections })
      const existing = await ctx.prisma.symbol.findFirst({
        where: { patientId: input.patientId, pedo: input.isPedo }
      })
      if (existing) {
        return ctx.prisma.symbol.update({
          where: { symbolId: existing.symbolId },
          data: { symbolsData: dataStr }
        })
      } else {
        return ctx.prisma.symbol.create({
          data: {
            patientId: input.patientId,
            pedo: input.isPedo,
            symbolsData: dataStr
          }
        })
      }
    }),

  getPositions: publicProcedure
    .input(z.object({ patientId: z.number(), isPedo: z.boolean().default(false) }))
    .query(async ({ input, ctx }) => {
      const repo = await ctx.prisma.reposition.findFirst({
        where: { patientId: input.patientId, pedo: input.isPedo }
      })
      if (!repo || !repo.repositionStream) return []
      const decodedPoints = decodeLegacyRepositionStream(repo.repositionStream, repo.orderStream)
      if (decodedPoints.length > 0) return decodedPoints
      const decoded = decodeLegacyJson(repo.repositionStream)
      if (Array.isArray(decoded)) return decoded
      if (decoded && typeof decoded === 'object' && Array.isArray((decoded as any).positions)) {
        return (decoded as any).positions
      }
      return []
    }),

  setPositions: publicProcedure
    .input(z.object({
      patientId: z.number(),
      isPedo: z.boolean().default(false),
      positions: z.array(z.any())
    }))
    .mutation(async ({ input, ctx }) => {
      const dataStr = JSON.stringify(input.positions)
      const existing = await ctx.prisma.reposition.findFirst({
        where: { patientId: input.patientId, pedo: input.isPedo }
      })
      if (existing) {
        return ctx.prisma.reposition.update({
          where: { repositionId: existing.repositionId },
          data: { repositionStream: dataStr }
        })
      } else {
        return ctx.prisma.reposition.create({
          data: {
            patientId: input.patientId,
            pedo: input.isPedo,
            repositionStream: dataStr
          }
        })
      }
    })
})
