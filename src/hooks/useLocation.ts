import { useEffect, useState } from 'react'

interface LocationCoords {
  latitude: number
  longitude: number
}

interface LocationObject {
  coords: LocationCoords
}

export function useLocation() {
  const [location, setLocation] = useState<LocationObject | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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
        setError('Location permission denied')
        setLoading(false)
      }
    )
  }, [])

  return { location, error, loading }
}
