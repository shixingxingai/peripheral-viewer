import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { prefersReducedMotion } from '@/lib/utils'
import type { DeviceAnchor } from '@/types/device'

function AnchorMarker({
  anchor,
  accent,
  active,
  index,
}: {
  anchor: DeviceAnchor
  accent: string
  active: boolean
  index: number
}) {
  const ringRef = useRef<THREE.Mesh>(null)
  const reduced = useMemo(() => prefersReducedMotion(), [])

  useFrame((state) => {
    if (!ringRef.current || reduced) return
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 2.2 + index * 1.7) * 0.1
    ringRef.current.scale.setScalar(pulse * (active ? 1.55 : 1))
  })

  return (
    <group position={anchor.position}>
      <mesh>
        <sphereGeometry args={[active ? 0.0042 : 0.0032, 16, 16]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.0062, 0.0085, 36]} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={active ? 0.95 : 0.55}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.0004, 0]}>
        <ringGeometry args={[0.011, 0.0116, 48]} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={0.16}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      <Html
        position={[0, 0.012, 0]}
        center
        zIndexRange={[30, 10]}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <div
          className="whitespace-nowrap rounded-[5px] border px-1.5 py-0.5 text-[9px] font-medium backdrop-blur-md"
          style={{
            borderColor: active ? accent : 'rgba(148,163,184,0.24)',
            background: active ? 'rgba(7,10,17,0.92)' : 'rgba(7,10,17,0.76)',
            color: active ? accent : '#aab6c8',
            boxShadow: active ? `0 0 18px -4px ${accent}` : 'none',
          }}
        >
          <span
            className="mr-1 inline-block h-1 w-1 rounded-full align-middle"
            style={{ background: accent }}
          />
          {anchor.label}
        </div>
      </Html>
    </group>
  )
}

export function PortAnchors({
  anchors,
  accent,
  activeAnchorId,
}: {
  anchors: DeviceAnchor[]
  accent: string
  activeAnchorId: string | null
}) {
  return (
    <group>
      {anchors.map((anchor, index) => (
        <AnchorMarker
          key={anchor.id}
          anchor={anchor}
          accent={accent}
          active={anchor.id === activeAnchorId}
          index={index}
        />
      ))}
    </group>
  )
}
