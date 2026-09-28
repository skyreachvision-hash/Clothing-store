export async function onRequest(context) {
  const { request, env } = context;
  return env.API.fetch(request);
}
