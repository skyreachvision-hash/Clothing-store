export async function onRequest(context) {
  try {
    // Call the Worker via the "API" Service Binding to the /d1-test route
    const workerResponse = await context.env.API.fetch(new Request("http://clothing-store-api/d1-test"));
    
    // Check if the Worker response is successful
    if (!workerResponse.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Worker request failed",
          status: workerResponse.status,
          workerResponse: null
        }),
        {
          status: workerResponse.status,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }
    
    // Parse the Worker response
    const workerData = await workerResponse.json();
    
    return new Response(
      JSON.stringify({
        success: true,
        message: "Clothing Store Pages Function successfully reached the Worker via Service Binding.",
        bindingName: "API",
        workerRoute: "/d1-test",
        workerResponse: workerData
      }),
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Error calling Worker via Service Binding",
        error: error.message
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
}
