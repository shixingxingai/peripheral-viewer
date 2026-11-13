/**
 * 电量校准候选分析：纯函数，不碰设备、不碰 UI，方便单测。
 *
 * 输入是「若干次只读采样 + 每次采样时厂商官方驱动显示的电量」，
 * 输出是「哪份 Report 的哪个字节、乘什么比例，能解出这个电量」的候选排序。
 *
 * 三个原则：
 * 1. 单点只能给候选，不能给结论——单点时分数封顶，界面必须提示「待验证」；
 * 2. 残差 > 1 直接淘汰，绝不靠四舍五入凑答案；
 * 3. 一直等于可打印 ASCII 的字节降权（多半是设备串，不是电量）。
 */

import type { CalibrationConfidence, CalibrationEntry, CalibrationSample } from '@/types/device'

/** 常见编码：0..100、0..200（半）、0..255（2.55 与 1/2.55 互为逆）。 */
export const SCALE_CHOICES = [1, 0.5, 2, 2.55, 1 / 2.55] as const

/** 残差容差：1 个百分点以内算命中，超过就淘汰。 */
const MAX_RESIDUAL = 1

export interface CaptureSample {
  /** 采样时厂商官方驱动显示的百分比（0–100）。 */
  reference: number
  /** reportId → 原始 payload（hex，不含 Report ID）。 */
  reports: Record<number, string>
}

export interface CandidateEvidence {
  reference: number
  byteValue: number
  decoded: number
}

export interface CalibrationCandidate {
  reportId: number
  offset: number
  scale: number
  /** 0–100，越高越可信。 */
  score: number
  maxResidual: number
  /** 出现了几个不同的参考电量。 */
  distinctReferences: number
  evidence: CandidateEvidence[]
  warnings: string[]
}

export interface EvaluateOptions {
  /** 只在这些 scale 里找；默认 SCALE_CHOICES。 */
  scales?: readonly number[]
  /** 最多返回多少个候选。 */
  maxCandidates?: number
  /** 探针默认解码用的 Report：多个 Report 读数一致时优先它，避免选到镜像报告。 */
  preferredReportId?: number
}

function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.trim().toLowerCase()
  if (clean.length === 0 || clean.length % 2 !== 0) return null
  if (!/^[0-9a-f]+$/.test(clean)) return null
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

/** 连续可打印字符：设备串的典型特征。 */
function looksLikeAscii(bytes: number[]): boolean {
  return bytes.every((value) => value >= 0x20 && value <= 0x7e)
}

function isMonotonic(evidence: CandidateEvidence[]): boolean {
  const sorted = [...evidence].sort((a, b) => a.reference - b.reference)
  for (let i = 1; i < sorted.length; i += 1) {
    // 电量升高时字节不应下降；相等允许（分辨率不足）。
    if (sorted[i].byteValue < sorted[i - 1].byteValue) return false
  }
  return true
}

function scoreCandidate(
  evidence: CandidateEvidence[],
  distinctReferences: number,
  maxResidual: number,
  warnings: string[],
): number {
  // 基础分：命中即 60 分（能被所有参考点同时解释，本身已不平凡）。
  let score = 60
  if (distinctReferences >= 2) score += 15
  if (distinctReferences >= 3) score += 8
  if (evidence.length >= 2 && isMonotonic(evidence)) score += 7
  // 残差越小越好，0 残差给满 10 分。
  score += Math.max(0, 10 - maxResidual * 5)
  if (warnings.includes('ascii')) score -= 25
  if (warnings.includes('constant')) score -= 10
  return Math.max(0, Math.min(100, Math.round(score)))
}

/**
 * 评估候选。
 *
 * 只保留「在所有采样里都存在、长度一致」的 Report，避免半份数据混进来。
 */
export function evaluateCandidates(
  samples: CaptureSample[],
  options: EvaluateOptions = {},
): CalibrationCandidate[] {
  const usable = samples.filter((sample) => Number.isFinite(sample.reference))
  if (usable.length === 0) return []

  const scales = options.scales ?? SCALE_CHOICES
  const maxCandidates = options.maxCandidates ?? 5

  // 找出每个 Report 在所有采样里的字节；长度不一致直接跳过该 Report。
  const perReport = new Map<number, number[][]>()
  for (const sample of usable) {
    for (const [key, hex] of Object.entries(sample.reports)) {
      const bytes = hexToBytes(hex)
      if (!bytes) continue
      const reportId = Number(key)
      if (!Number.isInteger(reportId)) continue
      const bucket = perReport.get(reportId) ?? []
      // 缺样本的 Report 不能参与：宁可少给候选，也不给半份证据。
      if (bucket.length > 0 && bucket[0].length !== bytes.length) {
        perReport.delete(reportId)
        continue
      }
      bucket.push(Array.from(bytes))
      perReport.set(reportId, bucket)
    }
  }

  const candidates: CalibrationCandidate[] = []
  for (const [reportId, matrix] of perReport) {
    if (matrix.length !== usable.length) continue
    const size = matrix[0].length
    for (let offset = 0; offset < size; offset += 1) {
      const column = matrix.map((row) => row[offset])
      for (const scale of scales) {
        let maxResidual = 0
        let hit = true
        const evidence: CandidateEvidence[] = []
        for (let index = 0; index < matrix.length; index += 1) {
          const decoded = column[index] * scale
          const residual = Math.abs(decoded - usable[index].reference)
          if (residual > MAX_RESIDUAL) {
            hit = false
            break
          }
          maxResidual = Math.max(maxResidual, residual)
          evidence.push({
            reference: usable[index].reference,
            byteValue: column[index],
            decoded,
          })
        }
        if (!hit) continue

        const warnings: string[] = []
        if (looksLikeAscii(column)) warnings.push('ascii')
        if (new Set(column).size === 1) warnings.push('constant')
        const distinctReferences = new Set(evidence.map((item) => item.reference)).size
        // 多个 Report 读数完全一致时（镜像报告很常见），优先探针默认的那个。
        const preferredBonus = options.preferredReportId === reportId ? 3 : 0
        candidates.push({
          reportId,
          offset,
          scale,
          score: Math.min(
            100,
            scoreCandidate(evidence, distinctReferences, maxResidual, warnings) + preferredBonus,
          ),
          maxResidual,
          distinctReferences,
          evidence,
          warnings,
        })
      }
    }
  }

  return candidates
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.distinctReferences - a.distinctReferences ||
        a.maxResidual - b.maxResidual ||
        a.reportId - b.reportId ||
        a.offset - b.offset ||
        b.scale - a.scale,
    )
    .slice(0, maxCandidates)
}

/**
 * 置信度：点数量 + 单调性 + 覆盖跨度共同决定，单点永远不能自称「已验证」。
 */
export function suggestConfidence(candidate: CalibrationCandidate | null): CalibrationConfidence {
  if (!candidate) return 'unverified'
  const references = candidate.evidence.map((item) => item.reference)
  const distinct = new Set(references).size
  if (distinct < 2) return 'single-sample'
  const span = Math.max(...references) - Math.min(...references)
  const monotonic = isMonotonic(candidate.evidence)
  if (candidate.maxResidual > MAX_RESIDUAL) return 'unverified'
  if (distinct >= 3 && monotonic && span >= 15) return 'verified'
  return 'multi-sample'
}

/** 把候选转成可直接交给 battery_calibration_save 的覆盖层条目。 */
export function buildCalibrationEntry(
  probeId: string,
  candidate: CalibrationCandidate,
  samples: CaptureSample[],
  now = Date.now(),
): CalibrationEntry {
  const calibrationSamples: CalibrationSample[] = samples
    .map((sample) => {
      const raw = sample.reports[candidate.reportId]
      if (!raw) return null
      return {
        reference: sample.reference,
        raw: raw.trim().toLowerCase(),
        reportId: candidate.reportId,
        capturedAt: now,
      }
    })
    .filter((item): item is CalibrationSample => item !== null)

  return {
    probeId,
    serial: null,
    decode: {
      status: 'calibrated',
      percentReportId: candidate.reportId,
      percentOffset: candidate.offset,
      percentScale: candidate.scale,
      percentRange: [0, 100],
      charging: null,
    },
    confidence: suggestConfidence(candidate),
    samples: calibrationSamples,
    calibratedAt: now,
    source: 'wizard',
  }
}

/** 采样是否「一动不动」：三次读取完全一致时，多半要用户先按一下设备。 */
export function isStaticChannel(hexSamples: string[]): boolean {
  if (hexSamples.length < 2) return false
  return hexSamples.every((item) => item === hexSamples[0])
}
