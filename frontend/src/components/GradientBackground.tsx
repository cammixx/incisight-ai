// Shooting star line — slides in diagonally with comet-tail gradient
function ShootLine({ top, left, width, delay, duration }: {
  top: string; left: string; width: number; delay: string; duration: string
}) {
  return (
    <div
      className="animate-shoot-star absolute"
      style={{
        top,
        left,
        width,
        height: 2,
        borderRadius: 2,
        background: 'linear-gradient(to right, transparent, #f6d3f9 60%, #d8e7ff)',
        transform: 'rotate(45deg)',
        transformOrigin: 'center center',
        animationDelay: delay,
        animationDuration: duration,
      }}
    />
  )
}

// 5-point star with pink fill and dark outline — matching the logo stars
function Sparklestar({ top, left, size, opacity, delay }: {
  top: string; left: string; size: number; opacity: number; delay: string
}) {
  const r = size / 2
  const inner = r * 0.45
  const points = Array.from({ length: 10 }, (_, i) => {
    const angle = (i * Math.PI) / 5 - Math.PI / 2
    const radius = i % 2 === 0 ? r : inner
    return `${r + radius * Math.cos(angle)},${r + radius * Math.sin(angle)}`
  }).join(' ')
  return (
    <div
      className="animate-sparkle-pulse absolute"
      style={{ top, left, animationDelay: delay, opacity }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} overflow="visible">
        <polygon points={points} fill="#fad1e6" />
      </svg>
    </div>
  )
}

// Staggered shooting lines — varied sizes and timing so they feel natural
const LINES = [
  // top row — left and right only, avoid center where logo sits
  { top: '10%',  left: '15%',  width: 160, delay: '0s',  duration: '3.2s' },
  { top: '8%',  left: '78%', width: 160, delay: '0.7s',  duration: '3.6s' },
  // middle-upper row
  { top: '32%', left: '12%', width: 200, delay: '2.1s',  duration: '3.0s' },
  { top: '28%', left: '48%', width: 240, delay: '0.3s',  duration: '2.6s' },
  { top: '35%', left: '78%', width: 170, delay: '1.8s',  duration: '3.4s' },
  // middle-lower row
  { top: '55%', left: '5%',  width: 190, delay: '1.0s',  duration: '3.8s' },
  { top: '58%', left: '40%', width: 150, delay: '2.6s',  duration: '2.9s' },
  { top: '52%', left: '72%', width: 210, delay: '0.5s',  duration: '3.1s' },
  // bottom row
  { top: '78%', left: '20%', width: 175, delay: '1.5s',  duration: '2.7s' },
  { top: '82%', left: '58%', width: 195, delay: '3.0s',  duration: '3.3s' },
]

const SPARKLES = [
  { top: '15%', left: '18%', size: 15, opacity: 0.55, delay: '0s'   },
  { top: '10%', left: '55%', size: 15, opacity: 0.5,  delay: '1.2s' },
  { top: '10%', left: '85%', size: 15, opacity: 0.45, delay: '0.6s' },
  { top: '45%', left: '30%', size: 12, opacity: 0.5,  delay: '1.8s' },
  { top: '42%', left: '62%', size: 12, opacity: 0.4,  delay: '0.9s' },
  { top: '75%', left: '8%',  size: 24, opacity: 0.45, delay: '2.2s' },
  { top: '78%', left: '45%', size: 28, opacity: 0.5,  delay: '0.4s' },
  { top: '72%', left: '80%', size: 22, opacity: 0.45, delay: '1.5s' },
]

export default function GradientBackground({
  animate = true,
  showDecor = false,
}: {
  animate?: boolean
  showDecor?: boolean
}) {
  const a = (cls: string) => animate ? cls : ''
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Gradient blobs */}
      <div
        className={`absolute w-[200px] h-[100px] rounded-full blur-[40px] opacity-70 bg-rose-300 ${a('animate-blob-drift')}`}
        style={{ top: '-5%', right: '-5%' }}
      />
      <div
        className={`absolute w-[200px] h-[100px] rounded-full blur-[40px] opacity-70 bg-violet-200 ${a('animate-blob-drift-reverse')}`}
        style={{ top: '30%', left: '35%' }}
      />
      <div
        className={`absolute w-[200px] h-[100px] rounded-full blur-[40px] opacity-70 bg-emerald-200 ${a('animate-blob-drift-slow')}`}
        style={{ bottom: '5%', right: '10%' }}
      />
      <div
        className={`absolute w-[200px] h-[100px] rounded-full blur-[40px] opacity-70 bg-pink-200 ${a('animate-blob-drift')}`}
        style={{ bottom: '-10%', left: '-5%', animationDelay: animate ? '2s' : undefined }}
      />

      {showDecor && (
        <>
          {LINES.map((l, i) => <ShootLine key={i} {...l} />)}
          {SPARKLES.map((s, i) => <Sparklestar key={i} {...s} />)}
        </>
      )}
    </div>
  )
}
