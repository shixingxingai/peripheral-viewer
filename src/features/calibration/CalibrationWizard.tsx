import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  ArrowLeft,
  ArrowRight,
  BatteryCharging,
  Check,
  CircleAlert,
  FlaskConical,
  Info,
  Loader2,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { backend } from '@/lib/backend'
import {
  buildCalibrationEntry,
  type CalibrationCandidate,
  type CaptureSample,
  evaluateCandidates,
  isStaticChannel,
  suggestConfidence,
} from '@/lib/battery/calibrate'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/stores/ui'
import type {
  BatteryChannel,
  BatterySampleResult,
  CalibrationState,
  UnmatchedInterface,
} from '@/types/device'

type Step = 'channel' | 'reference' | 'sample' | 'candidate' | 'verify'

const STEPS: Step[] = ['channel', 'reference', 'sample', 'candidate', 'verify']

const CONFIDENCE_TONE = {
  unverified: 'warning',
  'single-sample': 'warning',
  'multi-sample': 'success',
  verified: 'success',
} as const

function StepDots({ current }: { current: Step }) {
  const index = STEPS.indexOf(current)
  return (
    <div className="flex items-center gap-1.5">
      {STEPS.map((step, position) => (
        <span
          key={step}
          className={cn(
            'h-1.5 rounded-full transition-all',
            position === index
              ? 'w-5 bg-accent'
              : position < index
                ? 'w-1.5 bg-accent/45'
                : 'w-1.5 bg-white/12',
          )}
        />
      ))}
    </div>
  )
}

/** 原始字节表：跨采样出现变化的列会高亮，方便肉眼找电量字节。 */
function ByteTable({
  reports,
  captures,
}: {
  reports: BatterySampleResult['reports']
  captures: CaptureSample[]
}) {
  const [active, setActive] = useState<number>(reports[0]?.reportId ?? 0)
  const report = reports.find((item) => item.reportId === active) ?? reports[0]
  if (!report) return null

  const rows =
    captures.length > 0
      ? captures
      : report.samples.map((hex, i) => ({
          reference: 0,
          reports: { [report.reportId]: hex },
          _i: i,
        }))
  const bytesOf = (row: CaptureSample) => {
    const hex = row.reports[report.reportId] ?? ''
    return hex.match(/.{1,2}/g) ?? []
  }
  const matrix = rows.map(bytesOf)
  const width = Math.max(...matrix.map((row) => row.length), 0)
  const changed = Array.from({ length: width }, (_, offset) =>
    matrix.some((row) => row[offset] !== matrix[0]?.[offset]),
  )

  return (
    <div className="space-y-2">
      {reports.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {reports.map((item) => (
            <button
              key={item.reportId}
              type="button"
              onClick={() => setActive(item.reportId)}
              className={cn(
                'rounded-md border px-2 py-1 font-mono text-[9px] transition-colors',
                item.reportId === active
                  ? 'border-[rgba(var(--accent-rgb),0.35)] bg-[rgba(var(--accent-rgb),0.08)] text-accent'
                  : 'border-line text-ink-faint hover:text-ink-muted',
              )}
            >
              Report {item.reportId} · {item.length}B
            </button>
          ))}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-line bg-black/25 p-2">
        <table className="w-full border-collapse font-mono text-[9.5px]">
          <thead>
            <tr className="text-ink-faint/70">
              <th className="px-1 pb-1 text-left font-normal">REF</th>
              {Array.from({ length: width }, (_, offset) => (
                <th
                  key={offset}
                  className={cn(
                    'px-1 pb-1 text-center font-normal',
                    changed[offset] && 'text-amber-300/80',
                  )}
                >
                  {offset}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td className="px-1 py-0.5 text-ink-faint">
                  {rows[rowIndex].reference ? `${rows[rowIndex].reference}%` : `#${rowIndex + 1}`}
                </td>
                {row.map((byte, offset) => (
                  <td
                    key={offset}
                    className={cn(
                      'px-1 py-0.5 text-center',
                      changed[offset] ? 'text-amber-200' : 'text-ink-muted',
                    )}
                  >
                    {byte}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export interface CalibrationWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialProbeId?: string | null
  /** 从设备抽屉进入时带上序列号：校准只对这一台生效。 */
  serial?: string | null
}

export function CalibrationWizard({
  open,
  onOpenChange,
  initialProbeId,
  serial = null,
}: CalibrationWizardProps) {
  const { t } = useTranslation()
  const pushToast = useUiStore((state) => state.pushToast)
  const supported = typeof backend.batteryCalibrationState === 'function'

  const [state, setState] = useState<CalibrationState | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [probeId, setProbeId] = useState<string | null>(initialProbeId ?? null)
  const [step, setStep] = useState<Step>('channel')
  const [reference, setReference] = useState(50)
  const [captures, setCaptures] = useState<CaptureSample[]>([])
  const [sample, setSample] = useState<BatterySampleResult | null>(null)
  const [sampling, setSampling] = useState(false)
  const [candidateId, setCandidateId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedValue, setSavedValue] = useState<number | null>(null)
  const [scanning, setScanning] = useState(false)
  const [unmatched, setUnmatched] = useState<UnmatchedInterface[] | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const channels: BatteryChannel[] = state?.channels ?? []
  const channel = channels.find((item) => item.probeId === probeId) ?? null

  // 打开时重置会话，并拉取通道清单与已有校准。
  useEffect(() => {
    if (!open) return
    setStep('channel')
    setSample(null)
    setCaptures([])
    setCandidateId(null)
    setSavedValue(null)
    setProbeId(initialProbeId ?? null)
    if (!supported) return

    let alive = true
    setLoading(true)
    backend
      .batteryCalibrationState?.()
      .then((next) => {
        if (!alive) return
        setState(next)
        setLoadError(next.healthy ? null : (next.error ?? null))
        setProbeId((current) => {
          if (current && next.channels.some((item) => item.probeId === current)) return current
          const ready = next.channels.find((item) => item.present && item.channelAvailable)
          return ready?.probeId ?? next.channels[0]?.probeId ?? null
        })
      })
      .catch((error: unknown) => {
        if (alive) setLoadError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [open, initialProbeId, supported])

  // 选中通道时把已有校准样本带进来，第二次采样即可升级为多点。
  // 条目按序列号区分：优先取这台设备的，其次取通用条目。
  useEffect(() => {
    if (!channel) return
    const scoped = state?.entries.find(
      (item) => item.probeId === channel.probeId && (item.serial ?? null) === serial,
    )
    const generic = state?.entries.find((item) => item.probeId === channel.probeId && !item.serial)
    const entry = scoped ?? generic
    setCaptures(
      (entry?.samples ?? []).map((item) => ({
        reference: item.reference,
        reports: { [item.reportId]: item.raw },
      })),
    )
    setCandidateId(null)
    setReference((current) => entry?.samples.at(-1)?.reference ?? current)
  }, [channel, state, serial])

  const candidates = useMemo(
    () =>
      evaluateCandidates(captures, {
        preferredReportId: channel?.effectiveDecode.percentReportId,
        maxCandidates: 5,
      }),
    [captures, channel],
  )
  const candidate: CalibrationCandidate | null =
    candidates.find((item) => `${item.reportId}:${item.offset}:${item.scale}` === candidateId) ??
    candidates[0] ??
    null
  const staticChannel = sample
    ? sample.reports.every((item) => isStaticChannel(item.samples))
    : false

  const runSample = async () => {
    if (!channel || !backend.batterySample) return
    setSampling(true)
    try {
      const result = await backend.batterySample(channel.probeId, 3)
      setSample(result)
      const reports: Record<number, string> = {}
      for (const item of result.reports) {
        const first = item.samples[0]
        if (first) reports[item.reportId] = first
      }
      setCaptures((previous) => {
        const rest = previous.filter((item) => item.reference !== reference)
        return [...rest, { reference, reports }].sort((a, b) => a.reference - b.reference)
      })
      setCandidateId(null)
      // 不自动跳步：先把字节表摆在用户眼前，让他确认通道确实在刷新。
    } catch (error) {
      pushToast({
        title: t('calibration.errors.sample'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      })
    } finally {
      setSampling(false)
    }
  }

  const save = async () => {
    if (!channel || !candidate || !backend.batteryCalibrationSave) return
    setSaving(true)
    try {
      const entry = {
        ...buildCalibrationEntry(channel.probeId, candidate, captures),
        serial,
      }
      const next = await backend.batteryCalibrationSave(entry)
      setState(next)
      const decoded = candidate.evidence.at(-1)?.decoded ?? null
      setSavedValue(decoded === null ? null : Math.round(decoded))
      pushToast({
        title: t('calibration.saved'),
        description: decoded === null ? undefined : `${Math.round(decoded)}%`,
        variant: 'success',
      })
    } catch (error) {
      pushToast({
        title: t('calibration.errors.save'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    if (!channel || !backend.batteryCalibrationReset) return
    try {
      const next = await backend.batteryCalibrationReset(channel.probeId, serial)
      setState(next)
      setCaptures([])
      setCandidateId(null)
      setSavedValue(null)
      pushToast({ title: t('calibration.resetDone'), variant: 'success' })
    } catch (error) {
      pushToast({
        title: t('calibration.errors.save'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      })
    }
  }

  const scanUnmatched = async () => {
    if (!backend.batteryScanUnmatched) return
    setScanning(true)
    try {
      setUnmatched(await backend.batteryScanUnmatched(8))
    } catch (error) {
      pushToast({
        title: t('calibration.scan.failed'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      })
    } finally {
      setScanning(false)
    }
  }

  const copyFragment = async (item: UnmatchedInterface) => {
    const key = `${item.vendorId}:${item.productId}:${item.usagePage}:${item.interface}`
    try {
      await navigator.clipboard.writeText(probeFragment(item))
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey(null), 1600)
    } catch {
      pushToast({ title: t('calibration.scan.copyFailed'), variant: 'error' })
    }
  }

  const canNext =
    step === 'channel'
      ? Boolean(channel?.present && channel.channelAvailable)
      : step === 'reference'
        ? Number.isFinite(reference) && reference >= 0 && reference <= 100
        : step === 'sample'
          ? captures.length > 0
          : step === 'candidate'
            ? Boolean(candidate)
            : false

  const goNext = () => {
    const index = STEPS.indexOf(step)
    if (step === 'reference') {
      // 进入采样步骤前不预先采样，交给用户点按钮，避免误读静态通道。
      setStep('sample')
      return
    }
    if (index < STEPS.length - 1) setStep(STEPS[index + 1])
  }

  const goBack = () => {
    const index = STEPS.indexOf(step)
    if (index > 0) setStep(STEPS[index - 1])
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-[71] flex max-h-[88vh] w-[min(760px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-[#080c13] shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)] outline-none"
          aria-describedby={undefined}
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(var(--accent-rgb),0.25)] bg-[rgba(var(--accent-rgb),0.08)] text-accent">
              <FlaskConical className="h-4 w-4" strokeWidth={1.7} />
            </span>
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-[13px] font-semibold text-ink">
                {t('calibration.title')}
              </DialogPrimitive.Title>
              <p className="mt-0.5 truncate text-[9.5px] text-ink-faint">
                {t('calibration.subtitle')}
              </p>
            </div>
            <StepDots current={step} />
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="iconSm" aria-label={t('calibration.close')}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </DialogPrimitive.Close>
          </header>

          <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4">
            {!supported ? (
              <Notice tone="info" icon={Info}>
                {t('calibration.desktopOnly')}
              </Notice>
            ) : loading ? (
              <div className="flex items-center gap-2 py-10 text-[11px] text-ink-faint">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('calibration.loading')}
              </div>
            ) : (
              <>
                {loadError ? (
                  <Notice tone="warning" icon={TriangleAlert}>
                    {t('calibration.overlayInvalid', { reason: loadError })}
                  </Notice>
                ) : null}

                {step === 'channel' ? (
                  <section className="space-y-2">
                    <StepHint
                      title={t('calibration.channel.title')}
                      hint={t('calibration.channel.hint')}
                    />
                    {channels.length === 0 ? (
                      <Notice tone="info" icon={Info}>
                        {t('calibration.channel.none')}
                      </Notice>
                    ) : (
                      <div className="space-y-1.5">
                        {channels.map((item) => {
                          const selectable = item.present && item.channelAvailable && item.enabled
                          const active = item.probeId === probeId
                          return (
                            <button
                              key={item.probeId}
                              type="button"
                              disabled={!selectable}
                              onClick={() => setProbeId(item.probeId)}
                              className={cn(
                                'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                                active
                                  ? 'border-[rgba(var(--accent-rgb),0.35)] bg-[rgba(var(--accent-rgb),0.05)]'
                                  : 'border-line hover:border-line-strong',
                                !selectable && 'cursor-not-allowed opacity-55',
                              )}
                            >
                              <span className="mt-0.5">
                                {active ? (
                                  <Check className="h-3.5 w-3.5 text-accent" />
                                ) : (
                                  <span className="block h-3.5 w-3.5 rounded-full border border-white/20" />
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-2">
                                  <span className="text-[11.5px] font-medium text-ink">
                                    {item.displayName || item.vendor}
                                  </span>
                                  <Badge
                                    size="sm"
                                    variant={item.status === 'calibrated' ? 'success' : 'neutral'}
                                  >
                                    {item.calibratedBy === 'user'
                                      ? t('calibration.channel.userCalibrated')
                                      : item.status === 'calibrated'
                                        ? t('calibration.channel.bundledCalibrated')
                                        : t('calibration.channel.uncalibrated')}
                                  </Badge>
                                  {item.present ? null : (
                                    <Badge size="sm" variant="warning">
                                      {t('calibration.channel.absent')}
                                    </Badge>
                                  )}
                                </span>
                                <span className="mt-1 block font-mono text-[9px] text-ink-faint">
                                  {item.vendorId === null
                                    ? '—'
                                    : item.vendorId.toString(16).toUpperCase()}
                                  :{item.productIds.join('/')} · UP={item.usagePage} ·{' '}
                                  {item.transportKind} · Reports {item.reportIds.join(',')}
                                </span>
                                {item.reason ? (
                                  <span className="mt-1 block text-[9px] leading-relaxed text-ink-faint/80">
                                    {item.reason}
                                  </span>
                                ) : null}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {channel && !channel.channelAvailable ? (
                      <Notice tone="warning" icon={CircleAlert}>
                        {t('calibration.channel.unavailableHint')}
                      </Notice>
                    ) : null}

                    <div className="mt-3 border-t border-line pt-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="ghost"
                          size="xs"
                          icon={
                            scanning ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <FlaskConical className="h-3 w-3" />
                            )
                          }
                          onClick={() => void scanUnmatched()}
                          disabled={scanning}
                        >
                          {scanning ? t('calibration.scan.scanning') : t('calibration.scan.action')}
                        </Button>
                        <span className="text-[9px] text-ink-faint">
                          {t('calibration.scan.hint')}
                        </span>
                      </div>

                      {unmatched !== null ? (
                        unmatched.length === 0 ? (
                          <p className="mt-2 text-[9px] text-ink-faint">
                            {t('calibration.scan.none')}
                          </p>
                        ) : (
                          <div className="mt-2 space-y-1.5">
                            {unmatched.map((item) => {
                              const key = `${item.vendorId}:${item.productId}:${item.usagePage}:${item.interface}`
                              return (
                                <div
                                  key={key}
                                  className="rounded-lg border border-line bg-white/[0.014] px-2.5 py-2"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-[9.5px] text-ink-muted">
                                      {item.vendorId.toString(16).toUpperCase().padStart(4, '0')}:
                                      {item.productId.toString(16).toUpperCase().padStart(4, '0')} ·
                                      UP=
                                      {item.usagePage.toString(16).toUpperCase().padStart(4, '0')} ·
                                      U=
                                      {item.usage} · iface {item.interface}
                                    </span>
                                    <span className="ml-auto text-[9px] text-ink-faint">
                                      {t('calibration.scan.reports', {
                                        count: item.reports.length,
                                      })}
                                    </span>
                                    <Button
                                      variant={copiedKey === key ? 'soft' : 'outline'}
                                      size="xs"
                                      icon={
                                        copiedKey === key ? (
                                          <Check className="h-3 w-3" />
                                        ) : undefined
                                      }
                                      onClick={() => void copyFragment(item)}
                                    >
                                      {copiedKey === key
                                        ? t('calibration.scan.copied')
                                        : t('calibration.scan.copy')}
                                    </Button>
                                  </div>
                                  <p className="mt-1 truncate text-[8.5px] text-ink-faint/70">
                                    {item.product || item.pathHint}
                                  </p>
                                </div>
                              )
                            })}
                            <p className="text-[8.5px] leading-relaxed text-ink-faint/60">
                              {t('calibration.scan.releaseHint')}
                            </p>
                          </div>
                        )
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {step === 'reference' ? (
                  <section className="space-y-4">
                    <StepHint
                      title={t('calibration.reference.title')}
                      hint={t('calibration.reference.hint')}
                    />
                    <div className="rounded-xl border border-line bg-white/[0.016] p-4">
                      <div className="flex items-end gap-3">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={reference}
                          onChange={(event) => {
                            const next = Number(event.target.value)
                            setReference(
                              Number.isFinite(next) ? Math.max(0, Math.min(100, next)) : 0,
                            )
                          }}
                          className="w-24 rounded-lg border border-line bg-black/30 px-3 py-2 font-mono text-[18px] text-ink outline-none focus:border-[rgba(var(--accent-rgb),0.4)]"
                        />
                        <span className="pb-2 text-[12px] text-ink-faint">%</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={reference}
                          onChange={(event) => setReference(Number(event.target.value))}
                          className="mb-2 flex-1 accent-[var(--accent)]"
                        />
                      </div>
                      <p className="mt-3 text-[9.5px] leading-relaxed text-ink-faint">
                        {t('calibration.reference.example')}
                      </p>
                    </div>
                    {channel ? (
                      <div className="flex flex-wrap gap-2 text-[9px] text-ink-faint">
                        <Badge size="sm" variant="outline">
                          {channel.vendor}
                        </Badge>
                        <Badge size="sm" variant="outline">
                          {t('calibration.reference.reports', {
                            ids: channel.reportIds.join(', '),
                          })}
                        </Badge>
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {step === 'sample' ? (
                  <section className="space-y-3">
                    <StepHint
                      title={t('calibration.sample.title')}
                      hint={t('calibration.sample.hint')}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="soft"
                        size="sm"
                        icon={
                          sampling ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <BatteryCharging className="h-3 w-3" />
                          )
                        }
                        onClick={() => void runSample()}
                        disabled={sampling || !channel}
                      >
                        {sampling
                          ? t('calibration.sample.sampling')
                          : t('calibration.sample.action')}
                      </Button>
                      <span className="text-[9px] text-ink-faint">
                        {t('calibration.sample.readOnly')}
                      </span>
                    </div>

                    {sample && sample.reports.length > 0 ? (
                      <ByteTable reports={sample.reports} captures={captures} />
                    ) : (
                      <div className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[10px] text-ink-faint">
                        {t('calibration.sample.idle')}
                      </div>
                    )}

                    {staticChannel ? (
                      <Notice tone="warning" icon={TriangleAlert}>
                        {t('calibration.sample.staticWarning')}
                      </Notice>
                    ) : null}
                    {sample?.errors.length ? (
                      <p className="font-mono text-[9px] leading-relaxed text-amber-300/70">
                        {sample.errors.join(' · ')}
                      </p>
                    ) : null}
                  </section>
                ) : null}

                {step === 'candidate' ? (
                  <section className="space-y-2">
                    <StepHint
                      title={t('calibration.candidate.title')}
                      hint={t('calibration.candidate.hint')}
                    />
                    {candidates.length === 0 ? (
                      <Notice tone="warning" icon={CircleAlert}>
                        {t('calibration.candidate.none')}
                      </Notice>
                    ) : (
                      <div className="space-y-1.5">
                        {candidates.map((item) => {
                          const id = `${item.reportId}:${item.offset}:${item.scale}`
                          const top = candidates[0]
                          const fallbackId = top
                            ? `${top.reportId}:${top.offset}:${top.scale}`
                            : null
                          const active = id === (candidateId ?? fallbackId)
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setCandidateId(id)}
                              className={cn(
                                'w-full rounded-xl border p-3 text-left transition-colors',
                                active
                                  ? 'border-[rgba(var(--accent-rgb),0.35)] bg-[rgba(var(--accent-rgb),0.05)]'
                                  : 'border-line hover:border-line-strong',
                              )}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-[10.5px] text-ink">
                                  Report {item.reportId} · offset {item.offset} · scale {item.scale}
                                </span>
                                <Badge size="sm" variant={CONFIDENCE_TONE[suggestConfidence(item)]}>
                                  {t(`calibration.confidence.${suggestConfidence(item)}`)}
                                </Badge>
                                <span className="ml-auto font-mono text-[9px] text-ink-faint">
                                  {t('calibration.candidate.score', { score: item.score })}
                                </span>
                              </div>
                              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[9px] text-ink-faint">
                                {item.evidence.map((evidence) => (
                                  <span key={evidence.reference}>
                                    {evidence.reference}% → 0x
                                    {evidence.byteValue.toString(16).padStart(2, '0').toUpperCase()}{' '}
                                    ({Math.round(evidence.decoded)})
                                  </span>
                                ))}
                              </div>
                              {item.warnings.length > 0 ? (
                                <p className="mt-1 text-[9px] text-amber-300/70">
                                  {t('calibration.candidate.warnings')}:{' '}
                                  {item.warnings
                                    .map((warning) => t(`calibration.warnings.${warning}`))
                                    .join(' · ')}
                                </p>
                              ) : null}
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {candidates.length > 0 ? (
                      <p className="text-[9px] leading-relaxed text-ink-faint/80">
                        {t('calibration.candidate.moreSamples')}
                      </p>
                    ) : null}
                  </section>
                ) : null}

                {step === 'verify' ? (
                  <section className="space-y-3">
                    <StepHint
                      title={t('calibration.verify.title')}
                      hint={t('calibration.verify.hint')}
                    />
                    {candidate ? (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-xl border border-line bg-white/[0.016] p-3">
                            <p className="text-[9px] text-ink-faint">
                              {t('calibration.verify.reading')}
                            </p>
                            <p className="mt-1 font-mono text-[20px] text-ink">
                              {Math.round(candidate.evidence.at(-1)?.decoded ?? 0)}
                              <span className="ml-1 text-[11px] text-ink-faint">%</span>
                            </p>
                          </div>
                          <div className="rounded-xl border border-line bg-white/[0.016] p-3">
                            <p className="text-[9px] text-ink-faint">
                              {t('calibration.verify.reference')}
                            </p>
                            <p className="mt-1 font-mono text-[20px] text-ink">
                              {candidate.evidence.at(-1)?.reference ?? 0}
                              <span className="ml-1 text-[11px] text-ink-faint">%</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white/[0.016] px-3 py-2.5">
                          <Badge size="sm" variant={CONFIDENCE_TONE[suggestConfidence(candidate)]}>
                            {t(`calibration.confidence.${suggestConfidence(candidate)}`)}
                          </Badge>
                          {serial ? (
                            <Badge size="sm" variant="outline">
                              {t('calibration.verify.deviceScoped')}
                            </Badge>
                          ) : null}
                          <span className="text-[9.5px] text-ink-faint">
                            {t('calibration.verify.sampleCount', {
                              count: candidate.distinctReferences,
                            })}
                          </span>
                          <span className="ml-auto font-mono text-[9px] text-ink-faint">
                            Report {candidate.reportId} · {candidate.offset} · ×{candidate.scale}
                          </span>
                        </div>

                        {savedValue !== null ? (
                          <Notice tone="success" icon={ShieldCheck}>
                            {t('calibration.verify.savedHint', { value: savedValue })}
                          </Notice>
                        ) : (
                          <Notice tone="info" icon={Info}>
                            {t('calibration.verify.confirmHint')}
                          </Notice>
                        )}

                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="primary"
                            size="sm"
                            icon={
                              saving ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <ShieldCheck className="h-3 w-3" />
                              )
                            }
                            onClick={() => void save()}
                            disabled={saving || savedValue !== null}
                          >
                            {saving ? t('calibration.verify.saving') : t('calibration.verify.save')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<RotateCcw className="h-3 w-3" />}
                            onClick={() => setStep('sample')}
                          >
                            {t('calibration.verify.resample')}
                          </Button>
                          {channel?.calibratedBy === 'user' ? (
                            <Button
                              variant="danger"
                              size="sm"
                              icon={<RotateCcw className="h-3 w-3" />}
                              onClick={() => void reset()}
                            >
                              {t('calibration.resetToBundled')}
                            </Button>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <Notice tone="warning" icon={CircleAlert}>
                        {t('calibration.candidate.none')}
                      </Notice>
                    )}
                  </section>
                ) : null}
              </>
            )}
          </div>

          <footer className="flex shrink-0 items-center gap-2 border-t border-line px-5 py-3">
            <Button
              variant="ghost"
              size="sm"
              icon={<ArrowLeft className="h-3 w-3" />}
              onClick={goBack}
              disabled={step === STEPS[0] || savedValue !== null}
            >
              {t('calibration.back')}
            </Button>
            <span className="ml-auto text-[9px] text-ink-faint/70">
              {t('calibration.stepOf', {
                current: STEPS.indexOf(step) + 1,
                total: STEPS.length,
              })}
            </span>
            {step !== 'verify' ? (
              <Button
                variant="primary"
                size="sm"
                icon={<ArrowRight className="h-3 w-3" />}
                onClick={goNext}
                disabled={!canNext}
              >
                {t('calibration.next')}
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
                {t('calibration.done')}
              </Button>
            )}
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/** 生成可粘贴进 config/battery-probes.json 的探针片段：默认 enabled=false，需人工核对。 */
function probeFragment(item: UnmatchedInterface): string {
  const hex = (value: number) => value.toString(16).toUpperCase().padStart(4, '0')
  const reportIds = item.reports.map((report) => report.reportId)
  const reportLengths = Object.fromEntries(
    item.reports.map((report) => [String(report.reportId), report.length]),
  )
  return JSON.stringify(
    {
      id: `vendor-${hex(item.vendorId)}-${hex(item.productId)}-${hex(item.usagePage)}-${item.usage}`,
      vendor: item.manufacturer || 'Unknown',
      displayName: `${item.product || 'Unknown device'} (${hex(item.vendorId)}:${hex(item.productId)})`,
      enabled: false,
      match: {
        vendorId: hex(item.vendorId),
        productIds: [hex(item.productId)],
        usagePage: hex(item.usagePage),
        usages: [item.usage],
        nameContains: [],
      },
      transport: {
        kind: 'input-report',
        reportIds,
        reportLengths,
        writeRequired: false,
        note: '只读扫描生成：Report 长度与用途需人工核对后再启用',
      },
      decode: {
        status: 'uncalibrated',
        percentReportId: reportIds[0] ?? 0,
        percentOffset: null,
        percentScale: 1,
        percentRange: [0, 100],
        charging: null,
      },
    },
    null,
    2,
  )
}

function StepHint({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-3">
      <p className="text-[11.5px] font-medium text-ink">{title}</p>
      <p className="mt-1 text-[9.5px] leading-relaxed text-ink-faint">{hint}</p>
    </div>
  )
}

function Notice({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'info' | 'warning' | 'success'
  icon: typeof Info
  children: React.ReactNode
}) {
  const styles = {
    info: 'border-sky-400/16 bg-sky-400/[0.035] text-sky-200/70',
    warning: 'border-amber-400/18 bg-amber-400/[0.04] text-amber-200/80',
    success: 'border-emerald-400/18 bg-emerald-400/[0.04] text-emerald-200/80',
  } as const
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border p-2.5 text-[9.5px] leading-relaxed',
        styles[tone],
      )}
    >
      <Icon className="mt-px h-3 w-3 shrink-0" strokeWidth={1.8} />
      <span>{children}</span>
    </div>
  )
}
