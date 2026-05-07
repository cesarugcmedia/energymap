import { useCallback, useEffect, useState } from 'react'

interface LocationObject {
  coords: {
    latitude: number
    longitude: number
  }
}

export type LocationError = 'denied' | 'unavailable' | 'timeout'

export function useLocation() {
  const [location, setLocation] = useState<LocationObject | null>(null)
  const [error, setError] = useState<LocationError | null>(null)
  const [loading, setLoading] = useState(true)

  const request = useCallback(() => {
    setLoading(true)
    setError(null)

    if (!navigator.geolocation) {
      setError('unavailable')
      setLoading(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          coords: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          },
        })
        setLoading(false)
      },
      (err) => {
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
    request()
  }, [request])

  return { location, error, loading, retry: request }
}
