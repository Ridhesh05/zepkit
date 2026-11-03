import { getTypesense, config, logger } from "@zepkit/common";

export const productsSchema = {
  name: config.typesense.collection,
  fields: [
    { name: "title", type: "string" },
    { name: "tags", type: "string[]" },
    { name: "aliases", type: "string[]" },
    { name: "category", type: "string", facet: true },
    { name: "veg", type: "bool", facet: true },
    { name: "price", type: "float", facet: true },        // min price across stores
    { name: "stock", type: "int32", facet: true },         // total stock across stores
    { name: "store_ids", type: "string[]", facet: true },  // stores where in stock
    { name: "embedding", type: "float[]", num_dim: config.ollama.embedDim, optional: true },
  ],
  default_sorting_field: "stock",
};

export async function ensureCollection() {
  const ts = getTypesense();
  try {
    await ts.collections(config.typesense.collection).retrieve();
    logger.info(`TypeSense collection "${config.typesense.collection}" already exists`);
  } catch {
    await ts.collections().create(productsSchema);
    logger.info(`TypeSense collection "${config.typesense.collection}" created`);
  }
}
