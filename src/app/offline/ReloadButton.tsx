'use client'

export default function ReloadButton({ className }: { className?: string }) {
  return <button className={className} onClick={() => window.location.reload()}>Try again</button>
}
