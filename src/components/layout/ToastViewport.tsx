import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { type ToastVariant, useUiStore } from '@/stores/ui'

const ICONS = {
  default: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
} satisfies Record<ToastVariant, typeof Info>

const TONES: Record<ToastVariant, string> = {
  default: 'border-line text-ink-muted',
  success: 'border-emerald-400/20 text-emerald-300',
  warning: 'border-amber-400/22 text-amber-300',
  error: 'border-rose-400/22 text-rose-300',
}

export function ToastViewport() {
  const toasts = useUiStore((state) => state.toasts)
  const dismissToast = useUiStore((state) => state.dismissToast)

  return (
    <div className="pointer-events-none fixed bottom-10 right-4 z-[90] flex w-[min(340px,calc(100vw-2rem))] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const Icon = ICONS[toast.variant]
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-auto overflow-hidden rounded-xl border border-line bg-[#0b1019]/96 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.95)] backdrop-blur-xl"
            >
              <div className="flex gap-2.5 p-3">
                <Icon
                  className={cn('mt-px h-4 w-4 shrink-0', TONES[toast.variant].split(' ')[1])}
                  strokeWidth={1.8}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] font-medium text-ink">{toast.title}</p>
                  {toast.description ? (
                    <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-ink-faint">
                      {toast.description}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-faint transition-colors hover:bg-white/[0.05] hover:text-ink"
                  aria-label="Dismiss"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <div
                className={cn(
                  'h-px w-full bg-gradient-to-r from-transparent via-current to-transparent opacity-30',
                  TONES[toast.variant],
                )}
              />
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
