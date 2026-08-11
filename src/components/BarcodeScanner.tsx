'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon, LightningIcon } from '@/components/Icons'

interface BarcodeScannerProps {
  onDetect: (code: string) => void
  onClose: () => void
}

// Full-screen camera scanner used by Report Stock's barcode-scan button.
// Decoding happens via @zxing/browser rather than the native BarcodeDetector
// API, which has unreliable/missing support on iOS Safari — a real chunk of
// this app's users.
export default function BarcodeScanner({ onDetect, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)

  useEffect(() => {
    let cancelled = false
    let controls: { stop: () => void } | null = null

    async function start() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        if (cancelled || !videoRef.current) return

        controls = await reader.decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          videoRef.current,
          (result) => {
            if (result) onDetect(result.getText())
          }
        )

        const stream = videoRef.current.srcObject as MediaStream | null
        if (stream) {
          streamRef.current = stream
          const track = stream.getVideoTracks()[0]
          const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined
          setTorchSupported(!!capabilities?.torch)
        }
      } catch {
        if (!cancelled) setError("Couldn't access the camera. Check your browser's camera permission and try again.")
      }
    }

    start()

    return () => {
      cancelled = true
      controls?.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [onDetect])

  function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const next = !torchOn
    track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] }).then(() => setTorchOn(next)).catch(() => {})
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, backgroundColor: '#050605' }}>
      <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

      <div style={{ position: 'absolute', inset: 0, boxShadow: '0 0 0 2000px rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ width: 240, height: 160, border: '2px solid #cdfa3f', borderRadius: 16 }} />
      </div>

      <button
        onClick={onClose}
        style={{ position: 'absolute', top: 'calc(14px + env(safe-area-inset-top))', right: 14, width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(19,21,17,0.8)', border: '1px solid var(--fg-15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      >
        <CloseIcon size={16} color="#f3f5ee" />
      </button>

      {torchSupported && (
        <button
          onClick={toggleTorch}
          style={{ position: 'absolute', top: 'calc(14px + env(safe-area-inset-top))', left: 14, width: 36, height: 36, borderRadius: 10, backgroundColor: torchOn ? 'rgba(205,250,63,0.2)' : 'rgba(19,21,17,0.8)', border: `1px solid ${torchOn ? '#cdfa3f' : 'var(--fg-15)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          <LightningIcon size={16} color={torchOn ? '#cdfa3f' : '#f3f5ee'} filled={torchOn} />
        </button>
      )}

      <div style={{ position: 'absolute', bottom: 'calc(28px + env(safe-area-inset-bottom))', left: 0, right: 0, textAlign: 'center', padding: '0 24px' }}>
        <p style={{ color: '#f3f5ee', fontSize: 13, fontWeight: 700 }}>
          {error ?? 'Point camera at the barcode'}
        </p>
      </div>
    </div>,
    document.body
  )
}
