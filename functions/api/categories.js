import originalWorker from "../../src/index.js";
import { handleCategoryApi } from "../../src/category-api.js";

export async function onRequest(context) {
  return handleCategoryApi(context.request, context.env, originalWorker);
}
