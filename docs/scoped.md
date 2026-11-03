# Hyperlocal scoping (dark stores)

Like Blinkit, not Amazon: the catalog is global, but availability is per dark store. A shopper
picks a pin code, which resolves to one serviceable store, and sees only that store's in-stock
items.

## Model
- **`products`** — global catalog: title, category, veg, tags, aliases, vector. Store-agnostic.
- **`dark_stores`** — `{ _id, name, servicePincodes[], geo }`.
- **`inventory`** — `{ storeId, productId, stock, price }`. Per store. A stock change is an event.
- **TypeSense** product doc carries **`store_ids[]`** (facet) = stores where it is in stock.

## Flow
1. `GET /locations/resolve?pincode=400001` → `store = S1`, or "not serviceable".
2. Every `/search` carries `store` → `filter_by: store_ids:=S1`.
3. Per-store price/stock read from Redis `store:{sid}:product:{id}` at render.
4. When stock hits 0, the worker removes that product from the store's `store_ids`.

## Rule
No query or browse result is ever unscoped. If no store is resolved, show the pin-code picker,
not a global catalog.
