import { useId } from 'react'
import { cn, hexToRgba } from '@/lib/utils'
import type { DeviceCategory } from '@/types/device'

/**
 * Stylised 2D line-art fallback for every category. Used on cards, the layout
 * editor and detail panels — the same anchor metadata also drives the 3D scene.
 */
export function DeviceGlyph({
  category,
  accent,
  className,
}: {
  category: DeviceCategory
  accent: string
  className?: string
}) {
  const uid = useId().replace(/[:]/g, '')
  const glowId = `glow-${uid}`
  const gradId = `grad-${uid}`
  const soft = hexToRgba(accent, 0.09)
  const medium = hexToRgba(accent, 0.22)

  return (
    <svg
      viewBox="0 0 160 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('h-auto w-full', className)}
      aria-hidden
    >
      <defs>
        <filter id={glowId} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient
          id={gradId}
          x1="24"
          y1="20"
          x2="136"
          y2="104"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={accent} stopOpacity="0.34" />
          <stop offset="1" stopColor={accent} stopOpacity="0.04" />
        </linearGradient>
      </defs>

      <circle cx="80" cy="62" r="49" stroke={accent} strokeOpacity="0.13" strokeDasharray="2 5" />
      <circle cx="80" cy="62" r="38" stroke={accent} strokeOpacity="0.06" />
      <ellipse cx="80" cy="101" rx="34" ry="4.5" fill={accent} fillOpacity="0.08" />

      <g filter={`url(#${glowId})`} stroke={accent} strokeWidth="1.35" strokeLinecap="round">
        {category === 'keyboard' && (
          <g>
            <rect x="18" y="44" width="124" height="38" rx="6" fill={soft} />
            <rect x="18" y="44" width="124" height="4" rx="2" fill={medium} stroke="none" />
            {Array.from({ length: 4 }).map((_, row) =>
              Array.from({ length: 14 }).map((__, col) => (
                <rect
                  key={`${row}-${col}`}
                  x={24 + col * 8.2}
                  y={51 + row * 7}
                  width={col === 13 && row > 1 ? 5 : 6.2}
                  height="4.6"
                  rx="1.2"
                  fill={accent}
                  fillOpacity={row === 0 && col === 0 ? 0.34 : 0.14}
                  stroke={accent}
                  strokeOpacity="0.22"
                  strokeWidth="0.6"
                />
              )),
            )}
            <rect
              x="54"
              y="72"
              width="52"
              height="4.6"
              rx="1.2"
              fill={accent}
              fillOpacity="0.2"
              stroke="none"
            />
            <circle cx="133" cy="38" r="3.4" fill={soft} />
          </g>
        )}

        {category === 'mouse' && (
          <g>
            <path
              d="M80 24C61.5 24 50 41.5 50 63.5C50 86 62.5 97 80 97C97.5 97 110 86 110 63.5C110 41.5 98.5 24 80 24Z"
              fill={soft}
            />
            <path d="M80 26V51" strokeOpacity="0.6" />
            <rect x="76" y="36" width="8" height="12" rx="4" fill={medium} />
            <path d="M51 58H56M104 58H109" strokeOpacity="0.5" />
            <path d="M80 79L80 87" strokeOpacity="0.35" />
            <circle cx="80" cy="79" r="4" strokeOpacity="0.3" />
            <path d="M80 97V101" strokeOpacity="0.4" />
          </g>
        )}

        {category === 'headset' && (
          <g>
            <path d="M46 72V60C46 41 61 28 80 28C99 28 114 41 114 60V72" fill="none" />
            <path d="M52 58C52 44 64 34 80 34C96 34 108 44 108 58" strokeOpacity="0.35" />
            <rect x="36" y="60" width="20" height="32" rx="8" fill={soft} />
            <rect x="104" y="60" width="20" height="32" rx="8" fill={soft} />
            <rect x="41" y="65" width="10" height="22" rx="5" fill={medium} stroke="none" />
            <rect x="109" y="65" width="10" height="22" rx="5" fill={medium} stroke="none" />
            <path d="M46 88C46 98 53 102 60 102" strokeOpacity="0.55" />
            <circle cx="61" cy="102" r="2.4" fill={medium} />
          </g>
        )}

        {category === 'monitor' && (
          <g>
            <rect x="22" y="22" width="116" height="68" rx="5" fill={soft} />
            <rect
              x="29"
              y="29"
              width="102"
              height="54"
              rx="2.5"
              fill={`url(#${gradId})`}
              strokeOpacity="0.5"
            />
            <path d="M36 70C50 54 58 60 68 48C76 39 84 46 94 38" strokeOpacity="0.45" />
            <circle cx="112" cy="40" r="5.5" fill={medium} stroke="none" />
            <path d="M80 90V102" />
            <rect x="58" y="102" width="44" height="4" rx="2" fill={medium} />
            <path d="M36 35H48M36 41H44" strokeOpacity="0.28" />
          </g>
        )}

        {category === 'webcam' && (
          <g>
            <rect x="40" y="42" width="80" height="34" rx="17" fill={soft} />
            <circle cx="63" cy="59" r="14" fill={medium} />
            <circle cx="63" cy="59" r="8.5" fill="#05070c" fillOpacity="0.7" />
            <circle cx="59" cy="55" r="2" fill={accent} fillOpacity="0.7" stroke="none" />
            <circle cx="104" cy="55" r="2" fill={accent} stroke="none" />
            <path d="M80 76V88" />
            <path d="M64 96C64 91 70 88 80 88C90 88 96 91 96 96" fill={soft} />
          </g>
        )}

        {category === 'gamepad' && (
          <g>
            <path
              d="M52 40C38 40 28 50 26 66C24 82 30 92 39 92C47 92 51 84 57 84H103C109 84 113 92 121 92C130 92 136 82 134 66C132 50 122 40 108 40Z"
              fill={soft}
            />
            <circle cx="58" cy="61" r="7" fill={medium} />
            <circle cx="102" cy="61" r="7" fill={medium} />
            <path
              d="M50 68H54M52 66V70M106 64H110M108 62V66M100 54H104M102 52V56"
              strokeWidth="1.6"
            />
            <path d="M72 46H88" strokeOpacity="0.5" />
            <rect x="74" y="82" width="12" height="3" rx="1.5" fill={medium} stroke="none" />
          </g>
        )}

        {category === 'microphone' && (
          <g>
            <rect x="64" y="22" width="32" height="52" rx="16" fill={soft} />
            <path d="M72 34H88M72 41H88M72 48H88M72 55H88M72 62H88" strokeOpacity="0.3" />
            <path d="M80 74V94" />
            <ellipse cx="80" cy="99" rx="22" ry="5" fill={soft} />
            <path d="M58 46V52C58 64 68 72 80 72C92 72 102 64 102 52V46" strokeOpacity="0.55" />
            <circle cx="80" cy="16" r="2" fill={accent} stroke="none" />
          </g>
        )}

        {category === 'speaker' && (
          <g>
            <rect x="48" y="26" width="64" height="70" rx="9" fill={soft} />
            <circle cx="80" cy="50" r="13" fill={medium} />
            <circle cx="80" cy="50" r="5" fill="#05070c" fillOpacity="0.6" />
            <circle cx="80" cy="78" r="7.5" fill={medium} />
            <circle cx="80" cy="78" r="3" fill="#05070c" fillOpacity="0.6" />
            <path d="M62 89H98" strokeOpacity="0.3" />
          </g>
        )}

        {![
          'keyboard',
          'mouse',
          'headset',
          'monitor',
          'webcam',
          'gamepad',
          'microphone',
          'speaker',
        ].includes(category) && (
          <g>
            <path d="M80 28L116 48V84L80 102L44 84V48L80 28Z" fill={soft} />
            <path d="M44 48L80 66L116 48M80 66V102" strokeOpacity="0.4" />
            <circle cx="80" cy="66" r="6" fill={medium} stroke="none" />
          </g>
        )}
      </g>

      <circle cx="132" cy="38" r="1.6" fill={accent} fillOpacity="0.7" />
      <circle cx="27" cy="86" r="1.2" fill={accent} fillOpacity="0.4" />
    </svg>
  )
}
