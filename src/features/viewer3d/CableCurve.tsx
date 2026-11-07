import { useMemo } from 'react'
import * as THREE from 'three'
import type { DeviceCategory, DeviceSnapshot } from '@/types/device'

const ENDPOINT: Record<DeviceCategory, [number, number, number]> = {
  keyboard: [0.34, 0.002, 0.26],
  mouse: [0.26, 0.002, 0.2],
  headset: [0.3, 0.002, 0.2],
  monitor: [0.42, 0.002, 0.24],
  webcam: [0.24, 0.002, 0.18],
  gamepad: [0.28, 0.002, 0.2],
  microphone: [0.26, 0.002, 0.2],
  speaker: [0.3, 0.002, 0.2],
  other: [0.28, 0.002, 0.2],
}

export function CableCurve({ device }: { device: DeviceSnapshot }) {
  const port = device.anchors.find((anchor) => anchor.kind === 'port')
  const endpoint = ENDPOINT[device.category]

  const curve = useMemo(() => {
    if (!port) return null
    const [x, y, z] = port.position
    const end = new THREE.Vector3(...endpoint)
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, y, z),
      new THREE.Vector3(x + 0.045, y + 0.012, z - 0.02),
      new THREE.Vector3((x + end.x) / 2, 0.004, Math.max(z, end.z) + 0.035),
      new THREE.Vector3(end.x - 0.03, 0.003, end.z),
      end,
    ])
  }, [endpoint, port])

  if (!port || !curve) return null

  return (
    <group>
      <mesh castShadow>
        <tubeGeometry args={[curve, 64, 0.0021, 8, false]} />
        <meshStandardMaterial color="#161c25" metalness={0.12} roughness={0.66} />
      </mesh>
      <mesh position={port.position} castShadow>
        <boxGeometry args={[0.013, 0.007, 0.009]} />
        <meshStandardMaterial color="#202834" metalness={0.5} roughness={0.35} />
      </mesh>
      <mesh position={endpoint} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.006, 0.009, 24]} />
        <meshBasicMaterial color={device.accent} transparent opacity={0.28} toneMapped={false} />
      </mesh>
    </group>
  )
}
