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
}

export interface StockReport {
  id: string
  store_id: string
  drink_id: string
  quantity: Quantity
  reported_at: string
}
