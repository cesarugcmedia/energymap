import { useCallback, useEffect, useState } from 'react'

interface LocationObject {
  coords: {
    latitude: number
    longitude: number
  }
}

export type LocationError = 'denied' | 'unavailable' | 'timeout'

// The last fix this session. Coming back to the map reuses it right away
// (no loader) and refreshes the position quietly in the background.
let lastFix: LocationObject | null = null

export function useLocation() {
  const [location, setLocation] = useState<LocationObject | null>(lastFix)
  const [error, setError] = useState<LocationError | null>(null)
  const [loading, setLoading] = useState(false)

  const request = useCallback(() => {
    if (!lastFix) setLoading(true)
    setError(null)

    if (!navigator.geolocation) {
      setError('unavailable')
      setLoading(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lastFix = { coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } }
        setLocation(lastFix)
        setLoading(false)
      },
      (err) => {
        // A failed background refresh keeps showing the last good fix.
        if (lastFix) { setLoading(false); return }
        if (err.code === err.PERMISSION_DENIED) {
          setError('denied')
        } else if (err.code === err.TIMEOUT) {
          setError('timeout')
        } else {
          setError('unavailable')
        }
        setLoading(false)
      },
      { timeout: 15000, maximumAge: 60000, enableHighAccuracy: false }
    )
  }, [])

  useEffect(() => {
    // Only auto-request if permission is already granted.
    // If unknown/denied, wait for the user to tap the button.
    // This is required for iOS Safari which blocks auto geolocation requests.
    const tryAuto = async () => {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
        if (result.state === 'granted') {
          request()
        }
        // 'prompt' or 'denied' → stay idle, let the button trigger it
      } catch {
        // Permissions API unavailable — fall back to auto-request
        request()
      }
    }

    tryAuto()
  }, [request])

  return { location, error, loading, retry: request }
}
