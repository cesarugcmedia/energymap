export type StoreType = 'gas_station' | 'convenience' | 'grocery' | 'other'
/** Pre-sightings stock level, kept in stock_reports.quantity on old rows. */
export type Quantity = 'out' | 'low' | 'medium' | 'full'

export interface Store {
  id: string
  name: string
  type: StoreType
  address: string
  lat: number
  lng: number
}

export interface Drink {
  id: string
  name: string
  brand: string
  flavor: string
  caffeine_mg: number | null
}

export interface StockReport {
  id: string
  store_id: string
  drink_id: string
  /** Since 2026-11-22: spotted | not_there, with an optional amount. */
  sighting?: 'spotted' | 'not_there'
  amount?: 'few' | 'plenty' | null
  /** Original level on reports from before sightings; null on new ones. */
  quantity?: Quantity | null
  reported_at: string
}
