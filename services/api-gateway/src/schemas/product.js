// Lightweight input validation (no external lib).
export function validateProduct(body) {
  const errors = [];
  if (!body || typeof body !== "object") return ["body must be a JSON object"];
  if (typeof body.title !== "string" || !body.title.trim()) errors.push("title is required");
  if (body.veg != null && typeof body.veg !== "boolean") errors.push("veg must be a boolean");
  if (body.tags != null && !Array.isArray(body.tags)) errors.push("tags must be an array");
  if (body.aliases != null && !Array.isArray(body.aliases)) errors.push("aliases must be an array");
  if (body.inventory != null) {
    if (!Array.isArray(body.inventory)) errors.push("inventory must be an array");
    else
      body.inventory.forEach((i, n) => {
        if (!i || typeof i.storeId !== "string") errors.push(`inventory[${n}].storeId required`);
        if (typeof i.stock !== "number" || i.stock < 0) errors.push(`inventory[${n}].stock must be >= 0`);
        if (typeof i.price !== "number" || i.price < 0) errors.push(`inventory[${n}].price must be >= 0`);
      });
  }
  return errors;
}

// Normalize into the event payload shape the worker expects.
export function toPayload(id, body) {
  return {
    _id: id,
    title: body.title.trim(),
    category: body.category ?? null,
    veg: body.veg ?? null,
    unit: body.unit ?? null,
    imageUrl: body.imageUrl ?? null,
    tags: Array.isArray(body.tags) ? body.tags : [],
    aliases: Array.isArray(body.aliases) ? body.aliases : [],
    inventory: Array.isArray(body.inventory) ? body.inventory : [],
  };
}
