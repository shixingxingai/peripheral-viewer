import { useId } from 'react'
import { cn } from '@/lib/utils'

export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  const uid = useId().replace(/[:]/g, '')
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <defs>
        <linearGradient
          id={`logo-${uid}`}
          x1="8"
          y1="6"
          x2="56"
          y2="60"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--accent)" />
          <stop offset="0.55" stopColor="var(--accent-2)" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#070a10" />
      <rect
        x="0.75"
        y="0.75"
        width="62.5"
        height="62.5"
        rx="15.25"
        stroke={`url(#logo-${uid})`}
        strokeOpacity="0.4"
        strokeWidth="1.5"
      />
      <g className="origin-center animate-[spin_48s_linear_infinite]">
        <circle
          cx="32"
          cy="32"
          r="21"
          stroke={`url(#logo-${uid})`}
          strokeWidth="1.1"
          strokeOpacity="0.42"
          strokeDasharray="2.5 4.5"
        />
      </g>
      <circle cx="32" cy="32" r="6.5" fill={`url(#logo-${uid})`} />
      <circle
        cx="32"
        cy="32"
        r="13"
        stroke={`url(#logo-${uid})`}
        strokeWidth="1.5"
        strokeOpacity="0.9"
      />
      <circle cx="32" cy="19" r="2.1" fill="var(--accent)" />
      <circle cx="44" cy="38" r="1.6" fill="#a78bfa" />
      <circle cx="20" cy="38" r="1.6" fill="var(--accent-2)" fillOpacity="0.85" />
    </svg>
  )
}
