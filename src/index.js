export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Test route: /d1-test
    if (url.pathname === '/d1-test') {
      try {
        const result = await env.DB.prepare('SELECT 1 AS test').first();
        
        return new Response(
          JSON.stringify({
            success: true,
            message: "Worker → D1 communication successful.",
            binding: "DB",
            query: "SELECT 1 AS test",
            result: result
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Worker → D1 communication failed.",
            binding: "DB",
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
    
    // Default route: Worker status
    return new Response(
      JSON.stringify({
        success: true,
        message: "Clothing Store Worker is online.",
        version: "1.0.0-test"
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
};
