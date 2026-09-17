import originalWorker from "./index.js";
import { handleCategoryApi } from "./category-api.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/categories") return handleCategoryApi(request, env, originalWorker);
    return originalWorker.fetch(request, env, ctx);
  }
};
