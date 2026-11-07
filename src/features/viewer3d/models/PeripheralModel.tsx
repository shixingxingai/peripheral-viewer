import { RoundedBox } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { hexToRgba } from '@/lib/utils'
import type { DeviceSnapshot } from '@/types/device'

type Materials = ReturnType<typeof useMaterials>

function useMaterials(glowColor: string, wireframe: boolean) {
  const materials = useMemo(() => {
    const shell = new THREE.MeshStandardMaterial({
      color: '#161c26',
      metalness: 0.58,
      roughness: 0.36,
      wireframe,
    })
    const shellDark = new THREE.MeshStandardMaterial({
      color: '#0d1119',
      metalness: 0.4,
      roughness: 0.48,
      wireframe,
    })
    const keycap = new THREE.MeshStandardMaterial({
      color: '#202834',
      metalness: 0.18,
      roughness: 0.62,
      wireframe,
    })
    const rubber = new THREE.MeshStandardMaterial({
      color: '#0a0d13',
      metalness: 0.05,
      roughness: 0.9,
      wireframe,
    })
    const fabric = new THREE.MeshStandardMaterial({
      color: '#10151d',
      metalness: 0.02,
      roughness: 0.96,
      wireframe,
    })
    const accentSolid = new THREE.MeshStandardMaterial({
      color: new THREE.Color(glowColor),
      emissive: new THREE.Color(glowColor),
      emissiveIntensity: 0.32,
      metalness: 0.35,
      roughness: 0.38,
      wireframe,
    })
    const glow = new THREE.MeshBasicMaterial({
      color: new THREE.Color(glowColor),
      toneMapped: false,
    })
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#04070c',
      metalness: 0.92,
      roughness: 0.08,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      wireframe,
    })
    const cable = new THREE.MeshStandardMaterial({
      color: '#171d26',
      metalness: 0.08,
      roughness: 0.72,
      wireframe,
    })
    const accentTrim = new THREE.MeshStandardMaterial({
      color: new THREE.Color(glowColor),
      metalness: 0.2,
      roughness: 0.4,
      wireframe,
    })

    return {
      shell,
      shellDark,
      keycap,
      rubber,
      fabric,
      accentSolid,
      glow,
      glass,
      cable,
      accentTrim,
    }
  }, [glowColor, wireframe])

  useEffect(() => {
    return () => {
      for (const material of Object.values(materials)) material.dispose()
    }
  }, [materials])

  return materials
}

function createScreenTexture(accent: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 576
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.CanvasTexture(canvas)

  const background = ctx.createLinearGradient(0, 0, 1024, 576)
  background.addColorStop(0, '#03070d')
  background.addColorStop(0.5, '#071523')
  background.addColorStop(1, '#080d18')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, 1024, 576)

  const glow = ctx.createRadialGradient(760, 130, 0, 760, 130, 420)
  glow.addColorStop(0, hexToRgba(accent, 0.34))
  glow.addColorStop(0.45, hexToRgba(accent, 0.08))
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, 1024, 576)

  const violet = ctx.createRadialGradient(220, 520, 0, 220, 520, 380)
  violet.addColorStop(0, 'rgba(139,92,246,0.2)')
  violet.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = violet
  ctx.fillRect(0, 0, 1024, 576)

  ctx.strokeStyle = 'rgba(148,163,184,0.055)'
  ctx.lineWidth = 1
  for (let x = 0; x <= 1024; x += 64) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, 576)
    ctx.stroke()
  }
  for (let y = 0; y <= 576; y += 64) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(1024, y)
    ctx.stroke()
  }

  ctx.save()
  ctx.shadowColor = accent
  ctx.shadowBlur = 26
  for (let index = 0; index < 3; index++) {
    ctx.beginPath()
    ctx.lineWidth = 2 - index * 0.4
    ctx.strokeStyle = hexToRgba(accent, 0.5 - index * 0.11)
    for (let x = 0; x <= 1024; x += 6) {
      const y =
        392 +
        index * 34 +
        Math.sin(x / 92 + index * 1.4) * (30 - index * 6) +
        Math.sin(x / 31 + index) * 7
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  ctx.restore()

  ctx.strokeStyle = 'rgba(148,163,184,0.16)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(796, 172, 86, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = hexToRgba(accent, 0.6)
  ctx.beginPath()
  ctx.arc(796, 172, 58, Math.PI * 0.2, Math.PI * 1.35)
  ctx.stroke()

  const cards = [
    { x: 64, y: 72, w: 236, h: 92 },
    { x: 64, y: 182, w: 176, h: 58 },
    { x: 64, y: 258, w: 206, h: 58 },
  ]
  for (const card of cards) {
    ctx.fillStyle = 'rgba(7,14,23,0.72)'
    ctx.strokeStyle = 'rgba(148,163,184,0.18)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(card.x, card.y, card.w, card.h, 10)
    ctx.fill()
    ctx.stroke()
  }

  ctx.fillStyle = hexToRgba(accent, 0.9)
  ctx.font = '600 17px Inter, Segoe UI, sans-serif'
  ctx.fillText('PERIPHERY / DISPLAY', 84, 106)
  ctx.fillStyle = hexToRgba(accent, 0.22)
  ctx.fillRect(84, 272, 120, 6)
  ctx.fillRect(84, 284, 74, 6)
  ctx.fillStyle = 'rgba(139,92,246,0.45)'
  ctx.fillRect(84, 296, 96, 6)

  ctx.fillStyle = 'rgba(226,238,250,0.55)'
  ctx.font = '500 13px Inter, Segoe UI, sans-serif'
  ctx.fillText('SIGNAL', 64, 520)
  for (let index = 0; index < 12; index++) {
    const height = 10 + Math.sin(index * 1.7) * 8 + index * 1.5
    ctx.fillStyle = hexToRgba(accent, 0.25 + index * 0.04)
    ctx.fillRect(970 - index * 14, 520 - height, 7, height)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

function KeyboardModel({ mats, glowEnabled }: { mats: Materials; glowEnabled: boolean }) {
  const keys = useMemo(() => {
    const rows = 5
    const columns = 14
    const unit = 0.029
    const startX = -((columns - 1) * unit) / 2
    const list: Array<{ x: number; z: number; accent: boolean }> = []
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        list.push({
          x: startX + column * unit,
          z: -0.066 + row * 0.0305,
          accent:
            (row === 0 && column === 0) ||
            (row === 2 && column === columns - 1) ||
            (row === 4 && column === 6),
        })
      }
    }
    return list
  }, [])

  return (
    <group>
      <RoundedBox
        args={[0.46, 0.03, 0.17]}
        radius={0.006}
        smoothness={4}
        position={[0, 0.016, 0]}
        castShadow
        receiveShadow
      >
        <primitive object={mats.shell} attach="material" />
      </RoundedBox>

      <mesh position={[0, 0.0315, 0]} receiveShadow>
        <boxGeometry args={[0.448, 0.002, 0.158]} />
        <primitive object={mats.shellDark} attach="material" />
      </mesh>

      {keys.map((key, index) => (
        <RoundedBox
          key={index}
          args={[0.0254, 0.0105, 0.0254]}
          radius={0.0022}
          smoothness={2}
          position={[key.x, 0.0385, key.z]}
          castShadow
        >
          <primitive object={key.accent ? mats.accentSolid : mats.keycap} attach="material" />
        </RoundedBox>
      ))}

      <mesh position={[0, 0.0068, 0.084]}>
        <boxGeometry args={[0.425, 0.0022, 0.002]} />
        <primitive object={glowEnabled ? mats.glow : mats.rubber} attach="material" />
      </mesh>
      <mesh position={[0, 0.0068, -0.084]}>
        <boxGeometry args={[0.425, 0.0022, 0.002]} />
        <primitive object={glowEnabled ? mats.glow : mats.rubber} attach="material" />
      </mesh>

      <group position={[0.193, 0.032, -0.047]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.0135, 0.0135, 0.008, 32]} />
          <primitive object={mats.shellDark} attach="material" />
        </mesh>
        <mesh position={[0, 0.007, 0]} castShadow>
          <cylinderGeometry args={[0.0115, 0.0115, 0.008, 32]} />
          <primitive object={mats.accentSolid} attach="material" />
        </mesh>
        <mesh position={[0.006, 0.007, 0]}>
          <boxGeometry args={[0.0016, 0.0084, 0.005]} />
          <primitive object={mats.glow} attach="material" />
        </mesh>
      </group>

      <mesh position={[0.205, 0.019, -0.07]}>
        <boxGeometry args={[0.012, 0.006, 0.008]} />
        <primitive object={mats.shellDark} attach="material" />
      </mesh>

      {[
        [-0.2, -0.06],
        [0.2, -0.06],
        [-0.2, 0.06],
        [0.2, 0.06],
      ].map(([x, z], index) => (
        <mesh key={index} position={[x, 0.0015, z]}>
          <cylinderGeometry args={[0.005, 0.005, 0.003, 12]} />
          <primitive object={mats.rubber} attach="material" />
        </mesh>
      ))}
    </group>
  )
}

function MouseModel({ mats, glowEnabled }: { mats: Materials; glowEnabled: boolean }) {
  return (
    <group>
      <RoundedBox
        args={[0.07, 0.036, 0.12]}
        radius={0.016}
        smoothness={5}
        position={[0, 0.019, 0]}
        castShadow
        receiveShadow
      >
        <primitive object={mats.shell} attach="material" />
      </RoundedBox>

      <mesh position={[0, 0.035, 0.012]} scale={[0.034, 0.02, 0.052]} castShadow>
        <sphereGeometry args={[1, 32, 24]} />
        <primitive object={mats.shell} attach="material" />
      </mesh>

      <RoundedBox
        args={[0.031, 0.005, 0.052]}
        radius={0.002}
        smoothness={2}
        position={[-0.017, 0.0465, -0.032]}
        castShadow
      >
        <primitive object={mats.shellDark} attach="material" />
      </RoundedBox>
      <RoundedBox
        args={[0.031, 0.005, 0.052]}
        radius={0.002}
        smoothness={2}
        position={[0.017, 0.0465, -0.032]}
        castShadow
      >
        <primitive object={mats.shellDark} attach="material" />
      </RoundedBox>

      <mesh position={[0, 0.0495, -0.028]}>
        <boxGeometry args={[0.0012, 0.002, 0.06]} />
        <primitive object={mats.rubber} attach="material" />
      </mesh>

      <mesh position={[0, 0.0505, -0.019]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.0062, 0.0062, 0.011, 24]} />
        <primitive object={mats.rubber} attach="material" />
      </mesh>
      <mesh position={[0.0058, 0.0505, -0.019]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.0058, 0.001, 10, 24]} />
        <primitive object={glowEnabled ? mats.glow : mats.accentTrim} attach="material" />
      </mesh>

      <mesh position={[0, 0.0505, 0.033]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.0042, 0.0072, 32]} />
        <primitive object={glowEnabled ? mats.glow : mats.accentTrim} attach="material" />
      </mesh>

      {[-0.013, 0.001].map((z, index) => (
        <RoundedBox
          key={index}
          args={[0.006, 0.005, 0.009]}
          radius={0.002}
          smoothness={2}
          position={[-0.036, 0.032, z]}
        >
          <primitive object={mats.shellDark} attach="material" />
        </RoundedBox>
      ))}

      <mesh position={[0, 0.021, -0.0605]}>
        <boxGeometry args={[0.012, 0.006, 0.006]} />
        <primitive object={mats.shellDark} attach="material" />
      </mesh>
    </group>
  )
}

function HeadsetModel({ mats, glowEnabled }: { mats: Materials; glowEnabled: boolean }) {
  const micCurve = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.098, 0.03, 0.012),
        new THREE.Vector3(-0.128, 0.012, 0.04),
        new THREE.Vector3(-0.118, -0.006, 0.078),
      ]),
    [],
  )

  return (
    <group>
      <mesh position={[0, 0.06, 0]} castShadow>
        <torusGeometry args={[0.085, 0.0078, 16, 64, Math.PI]} />
        <primitive object={mats.shell} attach="material" />
      </mesh>
      <mesh position={[0, 0.06, 0.001]}>
        <torusGeometry args={[0.079, 0.0038, 12, 64, Math.PI]} />
        <primitive object={mats.fabric} attach="material" />
      </mesh>

      {[-1, 1].map((sign) => (
        <group key={sign} position={[sign * 0.085, 0.045, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
            <cylinderGeometry args={[0.038, 0.038, 0.026, 32]} />
            <primitive object={mats.shell} attach="material" />
          </mesh>
          <mesh position={[-sign * 0.009, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.034, 0.034, 0.011, 32]} />
            <primitive object={mats.fabric} attach="material" />
          </mesh>
          <mesh position={[sign * 0.0145, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.029, 0.0022, 10, 36]} />
            <primitive object={glowEnabled ? mats.glow : mats.accentTrim} attach="material" />
          </mesh>
          <mesh position={[sign * 0.0155, 0, 0]}>
            <circleGeometry args={[0.008, 24]} />
            <primitive object={mats.shellDark} attach="material" />
          </mesh>
        </group>
      ))}

      <mesh castShadow>
        <tubeGeometry args={[micCurve, 36, 0.0022, 8, false]} />
        <primitive object={mats.rubber} attach="material" />
      </mesh>
      <mesh position={[-0.118, -0.006, 0.078]} castShadow>
        <capsuleGeometry args={[0.006, 0.012, 6, 12]} />
        <primitive object={mats.shellDark} attach="material" />
      </mesh>
    </group>
  )
}

function MonitorModel({ mats, glowColor }: { mats: Materials; glowColor: string }) {
  const texture = useMemo(() => createScreenTexture(glowColor), [glowColor])

  useEffect(() => {
    return () => texture.dispose()
  }, [texture])

  return (
    <group>
      <RoundedBox
        args={[0.62, 0.36, 0.022]}
        radius={0.007}
        smoothness={4}
        position={[0, 0.26, 0]}
        castShadow
        receiveShadow
      >
        <primitive object={mats.shell} attach="material" />
      </RoundedBox>

      <mesh position={[0, 0.26, 0.0124]}>
        <planeGeometry args={[0.594, 0.334]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>

      <mesh position={[0, 0.042, 0]} castShadow>
        <boxGeometry args={[0.052, 0.078, 0.022]} />
        <primitive object={mats.shellDark} attach="material" />
      </mesh>

      <RoundedBox
        args={[0.27, 0.012, 0.175]}
        radius={0.005}
        smoothness={3}
        position={[0, 0.006, 0.018]}
        castShadow
        receiveShadow
      >
        <primitive object={mats.shell} attach="material" />
      </RoundedBox>

      <pointLight position={[0, 0.26, 0.22]} intensity={0.5} color={glowColor} distance={0.9} />

      <mesh position={[0.19, 0.15, -0.0135]}>
        <boxGeometry args={[0.03, 0.014, 0.005]} />
        <primitive object={mats.shellDark} attach="material" />
      </mesh>
      <mesh position={[0.24, 0.11, -0.0135]}>
        <boxGeometry args={[0.026, 0.009, 0.005]} />
        <primitive object={mats.rubber} attach="material" />
      </mesh>
    </group>
  )
}

function WebcamModel({ mats, glowEnabled }: { mats: Materials; glowEnabled: boolean }) {
  return (
    <group>
      <RoundedBox
        args={[0.086, 0.032, 0.03]}
        radius={0.014}
        smoothness={5}
        position={[0, 0.058, 0]}
        castShadow
        receiveShadow
      >
        <primitive object={mats.shell} attach="material" />
      </RoundedBox>

      <mesh position={[0, 0.058, 0.016]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.0115, 0.0115, 0.012, 32]} />
        <primitive object={mats.shellDark} attach="material" />
      </mesh>
      <mesh position={[0, 0.058, 0.023]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.0014, 32]} />
        <primitive object={mats.glass} attach="material" />
      </mesh>
      <mesh position={[-0.0024, 0.0605, 0.0245]}>
        <sphereGeometry args={[0.0017, 12, 12]} />
        <primitive object={mats.glow} attach="material" />
      </mesh>
      <mesh position={[0.032, 0.064, 0.016]}>
        <sphereGeometry args={[0.0018, 12, 12]} />
        <primitive object={glowEnabled ? mats.glow : mats.accentTrim} attach="material" />
      </mesh>

      <mesh position={[0, 0.031, -0.006]} castShadow>
        <boxGeometry args={[0.014, 0.03, 0.012]} />
        <primitive object={mats.shellDark} attach="material" />
      </mesh>
      <mesh position={[0, 0.038, -0.003]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.006, 0.006, 0.026, 16]} />
        <primitive object={mats.shellDark} attach="material" />
      </mesh>
      <RoundedBox
        args={[0.07, 0.012, 0.052]}
        radius={0.004}
        smoothness={3}
        position={[0, 0.006, -0.006]}
        castShadow
        receiveShadow
      >
        <primitive object={mats.shell} attach="material" />
      </RoundedBox>
    </group>
  )
}

function GamepadModel({ mats, glowEnabled }: { mats: Materials; glowEnabled: boolean }) {
  return (
    <group>
      <RoundedBox
        args={[0.135, 0.032, 0.072]}
        radius={0.014}
        smoothness={5}
        position={[0, 0.032, 0]}
        castShadow
        receiveShadow
      >
        <primitive object={mats.shell} attach="material" />
      </RoundedBox>

      {[-1, 1].map((sign) => (
        <mesh
          key={sign}
          position={[sign * 0.061, -0.001, 0.019]}
          rotation={[1.02, 0, sign * 0.36]}
          castShadow
        >
          <capsuleGeometry args={[0.019, 0.056, 8, 16]} />
          <primitive object={mats.shell} attach="material" />
        </mesh>
      ))}

      <mesh position={[0, 0.041, 0.001]}>
        <boxGeometry args={[0.058, 0.006, 0.042]} />
        <primitive object={mats.shellDark} attach="material" />
      </mesh>

      {[-0.037, 0.037].map((x) => (
        <group key={x} position={[x, 0.047, 0.012]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.01, 0.011, 0.008, 24]} />
            <primitive object={mats.rubber} attach="material" />
          </mesh>
          <mesh position={[0, 0.006, 0]} castShadow>
            <cylinderGeometry args={[0.0095, 0.0095, 0.004, 24]} />
            <primitive object={mats.shellDark} attach="material" />
          </mesh>
          <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.0105, 0.0009, 8, 28]} />
            <primitive object={glowEnabled ? mats.glow : mats.accentTrim} attach="material" />
          </mesh>
        </group>
      ))}

      <group position={[-0.044, 0.05, -0.012]}>
        <mesh>
          <boxGeometry args={[0.023, 0.004, 0.007]} />
          <primitive object={mats.shellDark} attach="material" />
        </mesh>
        <mesh>
          <boxGeometry args={[0.007, 0.004, 0.023]} />
          <primitive object={mats.shellDark} attach="material" />
        </mesh>
      </group>

      {[
        [-0.006, 0.016, '#7dd3fc'],
        [0.006, 0.016, '#fbbf24'],
        [-0.006, -0.002, '#34d399'],
        [0.006, -0.002, '#fb7185'],
      ].map(([dx, dz, color], index) => (
        <mesh key={index} position={[0.044 + Number(dx), 0.05, -0.012 + Number(dz)]}>
          <cylinderGeometry args={[0.0032, 0.0032, 0.0024, 16]} />
          <meshStandardMaterial
            color={String(color)}
            emissive={String(color)}
            emissiveIntensity={0.35}
          />
        </mesh>
      ))}

      {[-0.05, 0.05].map((x) => (
        <RoundedBox
          key={x}
          args={[0.038, 0.012, 0.018]}
          radius={0.004}
          smoothness={2}
          position={[x, 0.042, -0.034]}
          castShadow
        >
          <primitive object={mats.shellDark} attach="material" />
        </RoundedBox>
      ))}

      <mesh position={[0, 0.043, 0.0335]}>
        <boxGeometry args={[0.014, 0.006, 0.006]} />
        <primitive object={mats.shellDark} attach="material" />
      </mesh>
    </group>
  )
}

function MicrophoneModel({ mats, glowEnabled }: { mats: Materials; glowEnabled: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.006, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.055, 0.06, 0.012, 48]} />
        <primitive object={mats.shell} attach="material" />
      </mesh>
      <mesh position={[0, 0.03, 0]} castShadow>
        <cylinderGeometry args={[0.009, 0.011, 0.046, 24]} />
        <primitive object={mats.shellDark} attach="material" />
      </mesh>
      <mesh position={[0, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.032, 0.0018, 8, 48]} />
        <primitive object={mats.shellDark} attach="material" />
      </mesh>
      <mesh position={[0, 0.105, 0]} castShadow>
        <capsuleGeometry args={[0.027, 0.075, 12, 24]} />
        <primitive object={mats.shell} attach="material" />
      </mesh>
      <mesh position={[0, 0.076, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.0305, 0.0028, 12, 48]} />
        <primitive object={glowEnabled ? mats.glow : mats.accentTrim} attach="material" />
      </mesh>
      {[0.09, 0.104, 0.118, 0.132].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.028, 0.0008, 6, 40]} />
          <primitive object={mats.rubber} attach="material" />
        </mesh>
      ))}
      <mesh position={[0, 0.02, -0.05]}>
        <boxGeometry args={[0.014, 0.007, 0.006]} />
        <primitive object={mats.shellDark} attach="material" />
      </mesh>
    </group>
  )
}

function GenericModel({ mats, glowEnabled }: { mats: Materials; glowEnabled: boolean }) {
  return (
    <group>
      <RoundedBox
        args={[0.14, 0.06, 0.14]}
        radius={0.012}
        smoothness={4}
        position={[0, 0.03, 0]}
        castShadow
        receiveShadow
      >
        <primitive object={mats.shell} attach="material" />
      </RoundedBox>
      <mesh position={[0, 0.061, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.035, 0.038, 48]} />
        <primitive object={glowEnabled ? mats.glow : mats.accentTrim} attach="material" />
      </mesh>
      <mesh position={[0, 0.0615, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.022, 32]} />
        <primitive object={mats.shellDark} attach="material" />
      </mesh>
    </group>
  )
}

export function PeripheralModel({
  device,
  wireframe,
}: {
  device: DeviceSnapshot
  wireframe: boolean
}) {
  const glowColor = device.rgb?.enabled ? device.rgb.color : device.accent
  const mats = useMaterials(glowColor, wireframe)
  const glowEnabled = Boolean(device.rgb?.enabled)

  switch (device.category) {
    case 'keyboard':
      return <KeyboardModel mats={mats} glowEnabled={glowEnabled} />
    case 'mouse':
      return <MouseModel mats={mats} glowEnabled={glowEnabled} />
    case 'headset':
      return <HeadsetModel mats={mats} glowEnabled={glowEnabled} />
    case 'monitor':
      return <MonitorModel mats={mats} glowColor={glowColor} />
    case 'webcam':
      return <WebcamModel mats={mats} glowEnabled={glowEnabled} />
    case 'gamepad':
      return <GamepadModel mats={mats} glowEnabled={glowEnabled} />
    case 'microphone':
      return <MicrophoneModel mats={mats} glowEnabled={glowEnabled} />
    default:
      return <GenericModel mats={mats} glowEnabled={glowEnabled} />
  }
}
