export type StoreType = 'gas_station' | 'convenience' | 'grocery' | 'other'
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
  // Despite the name, this holds the product's real UPC (Kroger's Products
  // API returns it as `upc`) — only populated for drinks an admin has
  // matched via the Kroger integration, so it's also reused as the match
  // key for barcode scanning even though not every drink has one yet.
  kroger_upc?: string | null
}

export interface StockReport {
  id: string
  store_id: string
  drink_id: string
  quantity: Quantity
  reported_at: string
}
