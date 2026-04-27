// Proxy Pollinations image generation requests to bypass CORS and client-side restrictions
// Input: { prompt, width, height, seed, model, nologo, enhance }
// Output: Binary image data

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

interface ReqBody {
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
  model?: string;
  nologo?: boolean;
  enhance?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as ReqBody;

    if (!body.prompt) {
      return new Response(JSON.stringify({ error: "prompt required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const width = body.width || 1280;
    const height = body.height || 1280;
    const seed = body.seed || Math.floor(Math.random() * 10000000);
    const model = body.model || "flux";
    const nologo = body.nologo !== false;
    const enhance = body.enhance !== false;

    const params = new URLSearchParams({
      prompt: body.prompt,
      width: width.toString(),
      height: height.toString(),
      seed: seed.toString(),
      nologo: nologo ? "true" : "false",
      enhance: enhance ? "true" : "false",
      model,
    });

    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(body.prompt)}?${params}`;

    console.log("[generate-image] Invoking Pollinations API", {
      url: pollinationsUrl.substring(0, 100),
      model,
      seed,
    });

    const response = await fetch(pollinationsUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      console.error("[generate-image] Pollinations API error", {
        status: response.status,
        statusText: response.statusText,
      });
      return new Response(
        JSON.stringify({
          error: `Pollinations API error: HTTP ${response.status}`,
          status: response.status,
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const buffer = await response.arrayBuffer();

    console.log("[generate-image] Successfully generated image", {
      size: buffer.byteLength,
      contentType: response.headers.get("content-type"),
    });

    return new Response(buffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": response.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("[generate-image] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({
        error: errorMessage,
        message: "Failed to generate image",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
