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

        const responseBody = await cloudinaryResponse.text();
        let sanitizedBody = responseBody
          .replace(/(authorization|api[_-]?key|api[_-]?secret|password|secret|token|credential)(\\s*[=:]\\s*)[^,;\\s}]+/gi, "$1$2[REDACTED]")
          .replace(/Basic\\s+[A-Za-z0-9+/=]+|Bearer\\s+[^\\s,}]+/gi, "[REDACTED]")
          .slice(0, 2000);

        try {
          const parsedBody = JSON.parse(responseBody);
          const redactSensitiveFields = (value) => {
            if (Array.isArray(value)) return value.map(redactSensitiveFields);
            if (value && typeof value === "object") {
              return Object.fromEntries(
                Object.entries(value).map(([key, item]) =>
                  /(authorization|api[_-]?key|api[_-]?secret|password|secret|token|credential)/i.test(key)
                    ? [key, "[REDACTED]"]
                    : [key, redactSensitiveFields(item)]
                )
              );
            }
            return value;
          };
          sanitizedBody = JSON.stringify(redactSensitiveFields(parsedBody)).slice(0, 2000);
        } catch (error) {
          // Keep the safely redacted text for non-JSON responses.
        }

        if (!cloudinaryResponse.ok) {
          return new Response(
            JSON.stringify({
              success: false,
              message: "Cloudinary authentication failed.",
              cloudinaryStatus: cloudinaryResponse.status,
              cloudinaryResponse: sanitizedBody
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
