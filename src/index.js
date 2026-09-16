export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/cloudinary-test") {
      const cloudName = env.CLOUDINARY_CLOUD_NAME;
      const apiKey = env.CLOUDINARY_API_KEY;
      const apiSecret = env.CLOUDINARY_API_SECRET;

      if (!cloudName || !apiKey || !apiSecret) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Cloudinary credentials are not configured."
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      try {
        const credentials = btoa(`${apiKey}:${apiSecret}`);
        const cloudinaryResponse = await fetch(
          `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/resources/image/upload?max_results=1`,
          {
            headers: {
              Authorization: `Basic ${credentials}`
            }
          }
        );

        if (!cloudinaryResponse.ok) {
          return new Response(
            JSON.stringify({
              success: false,
              message: "Cloudinary authentication failed."
            }),
            {
              status: 502,
              headers: { "Content-Type": "application/json" }
            }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: "Cloudinary authentication succeeded.",
            cloudName
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Unable to connect to Cloudinary."
          }),
          {
            status: 502,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    }

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
