// Generate short, professional marketing copy for a dish using Groq.
// Input: { dishName, dishDescription?, campaignType, restaurantName? }
// Output: { tagline: string }  // ~10-16 words, no emoji, no quotes.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

interface ReqBody {
  dishName: string;
  dishDescription?: string | null;
  campaignType: string; // e.g. "daily_special" | "new_arrival" | "festive_special"
  festival?: string | null;
  restaurantName?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const body = (await req.json()) as ReqBody;
    if (!body.dishName) {
      return new Response(JSON.stringify({ error: "dishName required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const groqKey = Deno.env.get("GROQ_API_KEY");
    if (!groqKey) {
      return new Response(JSON.stringify({ error: "GROQ_API_KEY missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const occasion =
      body.campaignType === "festive_special"
        ? `${body.festival ?? "festive"} celebration`
        : body.campaignType === "new_arrival"
          ? "a brand-new menu launch"
          : "today's chef special";

    const sys =
      "You are a senior food copywriter for high-end restaurants. " +
      "Write ONE short, sensory, magazine-quality marketing line for a single dish. " +
      "Rules: 12 to 20 words, no emoji, no hashtags, no quotation marks, " +
      "no exclamation marks, no markdown, present-tense, evoke flavor and texture. " +
      "Do NOT include the price. Do NOT include the dish name verbatim more than once. " +
      "Output ONLY the line, nothing else.";

    const user = [
      `Dish: ${body.dishName}`,
      body.dishDescription ? `Existing description: ${body.dishDescription}` : "",
      body.restaurantName ? `Restaurant: ${body.restaurantName}` : "",
      `Occasion: ${occasion}`,
    ]
      .filter(Boolean)
      .join("\n");

    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.8,
        max_tokens: 90,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      return new Response(
        JSON.stringify({ error: `Groq error: ${t.slice(0, 200)}` }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const data = await res.json();
    let tagline: string =
      data?.choices?.[0]?.message?.content?.trim?.() ?? "";

    // Sanitize: strip wrapping quotes, trailing punctuation noise
    tagline = tagline.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
    tagline = tagline.replace(/\s+/g, " ");
    // Cap to 160 chars hard
    if (tagline.length > 160) tagline = tagline.slice(0, 157).trimEnd() + "…";

    return new Response(JSON.stringify({ tagline }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
