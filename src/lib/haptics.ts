// Light vibration feedback. Works on Android browsers; iOS Safari has no
// web vibration API, so this is a silent no-op there (the native iOS app
// will use @capacitor/haptics instead). Respects reduced-motion.
export function haptic(pattern: number | number[] = 10) {
  try {
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    navigator.vibrate?.(pattern)
  } catch {
    // unsupported
  }
}
