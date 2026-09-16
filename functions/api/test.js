export async function onRequest(context) {
  return new Response(
    JSON.stringify({
      success: true,
      message: "Clothing Store Pages Function works."
    }),
    {
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}
