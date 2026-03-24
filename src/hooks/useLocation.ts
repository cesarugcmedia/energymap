import { useCallback, useEffect, useState } from 'react'

interface LocationObject {
  coords: {
    latitude: number
    longitude: number
  }
}

export function useLocation() {
  const [location, setLocation] = useState<LocationObject | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const request = useCallback(() => {
    setLoading(true)
    setError(null)

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser')
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
      () => {
        setError('denied')
        setLoading(false)
      }
    )
  }, [])

  useEffect(() => {
    request()
  }, [request])

  return { location, error, loading, retry: request }
}
