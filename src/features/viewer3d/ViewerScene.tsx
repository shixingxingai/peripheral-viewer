import {
  ContactShadows,
  Environment,
  Grid,
  Lightformer,
  Line,
  OrbitControls,
  Sparkles,
} from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { Suspense, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { prefersReducedMotion } from '@/lib/utils'
import type { DeviceCategory, DeviceSnapshot } from '@/types/device'
import { CableCurve } from './CableCurve'
import { PeripheralModel } from './models/PeripheralModel'
import { PortAnchors } from './PortAnchors'

interface CameraConfig {
  position: [number, number, number]
  target: [number, number, number]
  minDistance: number
  maxDistance: number
  radius: number
}

const CAMERAS: Record<DeviceCategory, CameraConfig> = {
  keyboard: {
    position: [0.43, 0.33, 0.5],
    target: [0, 0.035, 0],
    minDistance: 0.28,
    maxDistance: 2.2,
    radius: 0.3,
  },
  mouse: {
    position: [0.18, 0.14, 0.2],
    target: [0, 0.035, 0.01],
    minDistance: 0.11,
    maxDistance: 1,
    radius: 0.105,
  },
  headset: {
    position: [0.28, 0.21, 0.33],
    target: [0, 0.07, 0],
    minDistance: 0.18,
    maxDistance: 1.5,
    radius: 0.16,
  },
  monitor: {
    position: [0.62, 0.4, 0.68],
    target: [0, 0.2, 0],
    minDistance: 0.35,
    maxDistance: 3,
    radius: 0.35,
  },
  webcam: {
    position: [0.21, 0.14, 0.22],
    target: [0, 0.05, 0],
    minDistance: 0.12,
    maxDistance: 1,
    radius: 0.095,
  },
  gamepad: {
    position: [0.25, 0.17, 0.26],
    target: [0, 0.04, 0],
    minDistance: 0.15,
    maxDistance: 1.2,
    radius: 0.16,
  },
  microphone: {
    position: [0.24, 0.21, 0.29],
    target: [0, 0.08, 0],
    minDistance: 0.16,
    maxDistance: 1.4,
    radius: 0.11,
  },
  speaker: {
    position: [0.3, 0.22, 0.3],
    target: [0, 0.06, 0],
    minDistance: 0.18,
    maxDistance: 1.5,
    radius: 0.16,
  },
  other: {
    position: [0.28, 0.2, 0.28],
    target: [0, 0.05, 0],
    minDistance: 0.16,
    maxDistance: 1.5,
    radius: 0.16,
  },
}

function CameraRig({ config }: { config: CameraConfig }) {
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as
    | (THREE.EventDispatcher & { target: THREE.Vector3; update: () => void })
    | null
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    camera.position.set(...config.position)
    camera.up.set(0, 1, 0)
    if (controls) {
      controls.target.set(...config.target)
      controls.update()
    }
    camera.lookAt(...config.target)
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, config, controls, invalidate])

  return null
}

function Platform({ accent, radius, rgb }: { accent: string; radius: number; rgb: boolean }) {
  const points = useMemo(() => {
    const list: THREE.Vector3[] = []
    for (let index = 0; index <= 96; index++) {
      const angle = (index / 96) * Math.PI * 2
      list.push(new THREE.Vector3(Math.cos(angle) * radius, 0.0012, Math.sin(angle) * radius))
    }
    return list
  }, [radius])

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0008, 0]}>
        <ringGeometry args={[radius * 0.995, radius, 96]} />
        <meshBasicMaterial color={accent} transparent opacity={0.34} toneMapped={false} />
      </mesh>
      <Line
        points={points}
        color={accent}
        lineWidth={1}
        dashed
        dashSize={0.006}
        gapSize={0.008}
        transparent
        opacity={0.5}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0006, 0]}>
        <ringGeometry args={[radius * 0.58, radius * 0.586, 96]} />
        <meshBasicMaterial color={accent} transparent opacity={0.18} toneMapped={false} />
      </mesh>
      {rgb ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0007, 0]}>
          <ringGeometry args={[radius * 1.08, radius * 1.085, 96]} />
          <meshBasicMaterial color={accent} transparent opacity={0.15} toneMapped={false} />
        </mesh>
      ) : null}
    </group>
  )
}

export function ViewerScene({
  device,
  autoRotate,
  wireframe,
  showAnchors,
  showCable,
  bloom,
  resetToken,
  activeAnchorId,
  onCanvasReady,
}: {
  device: DeviceSnapshot
  autoRotate: boolean
  wireframe: boolean
  showAnchors: boolean
  showCable: boolean
  bloom: boolean
  resetToken: number
  activeAnchorId: string | null
  onCanvasReady?: (gl: THREE.WebGLRenderer) => void
}) {
  const config = CAMERAS[device.category] ?? CAMERAS.other
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const showCableCurve =
    showCable && (device.connection.kind === 'wired' || device.connection.kind === 'usb')
  const rgbEnabled = Boolean(device.rgb?.enabled)
  const camera = config.position

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      frameloop={autoRotate && !reduced ? 'always' : 'demand'}
      camera={{ position: camera, fov: 33, near: 0.005, far: 40 }}
      gl={{
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.02
        gl.setClearColor('#06080d')
        onCanvasReady?.(gl)
      }}
      fallback={
        <div className="flex h-full items-center justify-center text-xs text-ink-faint">
          WebGL is not available in this environment.
        </div>
      }
    >
      <color attach="background" args={['#06080d']} />
      <fog attach="fog" args={['#06080d', 1.6, 4.6]} />

      <ambientLight intensity={0.34} />
      <directionalLight
        position={[1.1, 2.2, 1.4]}
        intensity={2.2}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.1}
        shadow-camera-far={5}
        shadow-camera-left={-1.1}
        shadow-camera-right={1.1}
        shadow-camera-top={1.1}
        shadow-camera-bottom={-1.1}
        shadow-bias={-0.0002}
      />
      <spotLight
        position={[-0.9, 1.4, -0.7]}
        intensity={1.4}
        angle={0.7}
        penumbra={1}
        color={device.accent}
        distance={4}
      />
      <pointLight
        position={[0.6, 0.35, 0.7]}
        intensity={0.65}
        color={device.rgb?.enabled ? device.rgb.color : '#7dd3fc'}
        distance={2}
      />

      <Environment resolution={64} frames={1}>
        <Lightformer
          form="rect"
          intensity={3.2}
          color="#e8f4ff"
          position={[0, 2.2, 1.2]}
          scale={[5, 2.5, 1]}
        />
        <Lightformer
          form="circle"
          intensity={2}
          color={device.accent}
          position={[-2, 0.9, 0.8]}
          scale={1.6}
        />
        <Lightformer
          form="circle"
          intensity={1.2}
          color="#8b5cf6"
          position={[2, 0.6, -1]}
          scale={1.8}
        />
        <Lightformer
          form="rect"
          intensity={0.8}
          color="#94a3b8"
          position={[0, 0.4, -2]}
          scale={[3, 1, 1]}
        />
      </Environment>

      <Grid
        position={[0, -0.002, 0]}
        cellSize={0.04}
        cellThickness={0.5}
        cellColor="#16202d"
        sectionSize={0.2}
        sectionThickness={0.9}
        sectionColor="#1b2a3d"
        fadeDistance={2.1}
        fadeStrength={1.6}
        infiniteGrid
        followCamera={false}
      />

      <Suspense fallback={null}>
        <group position={[0, 0.001, 0]}>
          <PeripheralModel device={device} wireframe={wireframe} />
          {showAnchors ? (
            <PortAnchors
              anchors={device.anchors}
              accent={device.accent}
              activeAnchorId={activeAnchorId}
            />
          ) : null}
          {showCableCurve ? <CableCurve device={device} /> : null}
          <Platform accent={device.accent} radius={config.radius} rgb={rgbEnabled} />
          {!reduced ? (
            <Sparkles
              count={26}
              scale={[config.radius * 4, 0.42, config.radius * 4]}
              size={1.1}
              speed={0.18}
              color={device.accent}
              opacity={0.3}
              position={[0, 0.16, 0]}
            />
          ) : null}
          <ContactShadows
            position={[0, 0.0008, 0]}
            opacity={0.58}
            scale={Math.max(0.5, config.radius * 4)}
            blur={2.6}
            far={0.32}
            resolution={512}
            color="#000000"
          />
        </group>
      </Suspense>

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={config.minDistance}
        maxDistance={config.maxDistance}
        minPolarAngle={0.18}
        maxPolarAngle={Math.PI / 2.02}
        autoRotate={autoRotate && !reduced}
        autoRotateSpeed={0.85}
        enablePan
        panSpeed={0.55}
      />

      <CameraRig key={`${device.id}:${resetToken}`} config={config} />

      {bloom && rgbEnabled ? (
        <EffectComposer multisampling={0}>
          <Bloom intensity={0.72} luminanceThreshold={0.68} luminanceSmoothing={0.24} mipmapBlur />
        </EffectComposer>
      ) : null}
    </Canvas>
  )
}
