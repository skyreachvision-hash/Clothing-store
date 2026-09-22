export async function onRequest(context) {
  if (!context.env.API) {
    return new Response(JSON.stringify({
      success: false,
      error: "API service binding is not configured."
    }), {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }

  return context.env.API.fetch(context.request);
}
