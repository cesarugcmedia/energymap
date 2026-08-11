// Free, no-key product lookup for barcodes scanned on Report Stock that
// don't match anything already in the drinks catalog (drinks.kroger_upc).
// Used only to pre-fill the Add Drink form — never treated as authoritative,
// since coverage varies and the user always confirms/edits before saving.
export async function lookupUpc(upc: string): Promise<{ brand: string; name: string } | null> {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(upc)}.json`)
    if (!res.ok) return null
    const json = await res.json()
    if (json.status !== 1 || !json.product) return null

    const brand = (json.product.brands ?? '').split(',')[0].trim()
    const name = json.product.product_name?.trim()
    if (!brand || !name) return null

    return { brand, name }
  } catch {
    return null
  }
}
