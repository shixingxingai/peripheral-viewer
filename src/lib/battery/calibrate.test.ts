import { describe, expect, it } from 'vitest'
import {
  buildCalibrationEntry,
  type CaptureSample,
  evaluateCandidates,
  isStaticChannel,
  suggestConfidence,
} from './calibrate'

/**
 * 回归样本来自真实设备：雷柏 24AE:185A 的 Report 0xBC，
 * 官方驱动显示 48% 时末字节 0x30，61% 时 0x3D（快照实测）。
 * 校准算法必须能独立复现 config 里那条 offset 5 / scale 1。
 */
const rapoo: CaptureSample[] = [
  { reference: 48, reports: { 188: 'b042800c0130', 187: 'b042800c0130' } },
  { reference: 61, reports: { 188: 'b042800c013d', 187: 'b042800c013d' } },
]

describe('evaluateCandidates', () => {
  it('在雷柏真实样本上复现 config 的 Report 188 / offset 5 / scale 1', () => {
    const candidates = evaluateCandidates(rapoo, { preferredReportId: 188 })
    expect(candidates.length).toBeGreaterThan(0)
    const best = candidates[0]
    expect(best.reportId).toBe(188)
    expect(best.offset).toBe(5)
    expect(best.scale).toBe(1)
    expect(best.maxResidual).toBe(0)
    expect(best.distinctReferences).toBe(2)
    expect(suggestConfidence(best)).toBe('multi-sample')
  })

  it('残差超出容差的字节不会成为候选', () => {
    // 0xFF = 255，与 48% 相差 207 个百分点，必须直接淘汰而不是夹到 100。
    const candidates = evaluateCandidates([{ reference: 48, reports: { 188: 'ff' } }])
    expect(candidates).toHaveLength(0)
  })

  it('单点只给候选，不冒充已验证', () => {
    const candidates = evaluateCandidates([{ reference: 48, reports: { 188: '300030' } }])
    // 0x30 出现在 0 和 2 两个位置，都只由一个参考点支撑。
    expect(candidates.map((item) => item.offset)).toEqual([0, 2])
    expect(candidates.every((item) => item.distinctReferences === 1)).toBe(true)
    expect(suggestConfidence(candidates[0])).toBe('single-sample')
  })

  it('支持 0..200 的半值编码', () => {
    const candidates = evaluateCandidates([{ reference: 75, reports: { 5: '96' } }])
    expect(candidates[0]).toMatchObject({ offset: 0, scale: 0.5 })
    expect(candidates[0].evidence[0].decoded).toBe(75)
  })

  it('可打印 ASCII 字节会被标记并降权', () => {
    const candidates = evaluateCandidates([{ reference: 65, reports: { 5: 'aa41' } }])
    const asciiCandidate = candidates.find((item) => item.offset === 1)
    expect(asciiCandidate?.warnings).toContain('ascii')
    expect(asciiCandidate?.score).toBeLessThan(50)
  })

  it('长度不一致的 Report 不参与评分', () => {
    const samples: CaptureSample[] = [
      { reference: 48, reports: { 188: 'b042800c0130' } },
      { reference: 61, reports: { 188: 'b042800c013d00' } },
    ]
    expect(evaluateCandidates(samples)).toHaveLength(0)
  })

  it('缺少某次采样的 Report 不参与评分', () => {
    const samples: CaptureSample[] = [
      { reference: 48, reports: { 188: 'b042800c0130' } },
      { reference: 61, reports: {} },
    ]
    expect(evaluateCandidates(samples)).toHaveLength(0)
  })

  it('非法 hex 不会抛错，只是没有候选', () => {
    expect(evaluateCandidates([{ reference: 50, reports: { 5: 'zz' } }])).toHaveLength(0)
    expect(evaluateCandidates([{ reference: 50, reports: { 5: 'abc' } }])).toHaveLength(0)
  })

  it('候选按分数降序，最多返回 maxCandidates 条', () => {
    const samples: CaptureSample[] = [
      { reference: 10, reports: { 5: '0a0a0a0a0a' } },
      { reference: 20, reports: { 5: '1414141414' } },
    ]
    const candidates = evaluateCandidates(samples, { maxCandidates: 3 })
    expect(candidates).toHaveLength(3)
    expect(candidates[0].score).toBeGreaterThanOrEqual(candidates[2].score)
  })
})

describe('suggestConfidence', () => {
  it('三点、单调、跨度足够才算已验证', () => {
    const samples: CaptureSample[] = [
      { reference: 20, reports: { 5: '14' } },
      { reference: 40, reports: { 5: '28' } },
      { reference: 60, reports: { 5: '3c' } },
    ]
    const [best] = evaluateCandidates(samples)
    expect(suggestConfidence(best)).toBe('verified')
  })

  it('跨度太小只能是多点校准，不升级为已验证', () => {
    const samples: CaptureSample[] = [
      { reference: 20, reports: { 5: '14' } },
      { reference: 25, reports: { 5: '19' } },
      { reference: 30, reports: { 5: '1e' } },
    ]
    const [best] = evaluateCandidates(samples)
    expect(suggestConfidence(best)).toBe('multi-sample')
  })

  it('没有候选时是 unverified', () => {
    expect(suggestConfidence(null)).toBe('unverified')
  })
})

describe('buildCalibrationEntry', () => {
  it('把候选转成可直接保存的覆盖层条目', () => {
    const [best] = evaluateCandidates(rapoo, { preferredReportId: 188 })
    const entry = buildCalibrationEntry('rapoo-2.4g-output-query', best, rapoo, 1763038331000)

    expect(entry.probeId).toBe('rapoo-2.4g-output-query')
    expect(entry.decode).toMatchObject({
      status: 'calibrated',
      percentReportId: 188,
      percentOffset: 5,
      percentScale: 1,
      percentRange: [0, 100],
    })
    expect(entry.confidence).toBe('multi-sample')
    expect(entry.source).toBe('wizard')
    expect(entry.calibratedAt).toBe(1763038331000)
    expect(entry.samples).toEqual([
      { reference: 48, raw: 'b042800c0130', reportId: 188, capturedAt: 1763038331000 },
      { reference: 61, raw: 'b042800c013d', reportId: 188, capturedAt: 1763038331000 },
    ])
  })

  it('只带上目标 Report 的原始字节', () => {
    const [best] = evaluateCandidates(rapoo, { preferredReportId: 188 })
    const entry = buildCalibrationEntry('p', best, rapoo, 1)
    expect(entry.samples.every((item) => item.reportId === 188)).toBe(true)
  })
})

describe('isStaticChannel', () => {
  it('多次读数完全相同判为静态通道', () => {
    expect(isStaticChannel(['aa01', 'aa01', 'aa01'])).toBe(true)
  })

  it('有变化或样本不足时不算静态', () => {
    expect(isStaticChannel(['aa01', 'aa02'])).toBe(false)
    expect(isStaticChannel(['aa01'])).toBe(false)
  })
})
