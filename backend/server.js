const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fetch = require('node-fetch');
const { JSDOM } = require('jsdom');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Dish copy generation endpoint
app.post('/api/dish-copy', async (req, res) => {
  try {
    const { dishName, dishDescription, campaignType, festival, restaurantName } = req.body;

    if (!dishName) {
      return res.status(400).json({ error: 'dishName required' });
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return res.status(500).json({ error: 'GROQ_API_KEY missing' });
    }

    const occasion = campaignType === 'festive_special'
      ? `${festival ?? 'festive'} celebration menu`
      : campaignType === 'new_arrival'
        ? 'a brand-new menu launch'
        : "today's chef special";

    const moodHint = campaignType === 'festive_special'
      ? `Subtly evoke the mood of ${festival ?? 'the festival'} (lights, warmth, tradition, togetherness) without naming the festival explicitly.`
      : campaignType === 'new_arrival'
        ? 'Convey freshness, novelty, and a sense of discovery.'
        : 'Convey freshness, craftsmanship, and chef-driven care for today.';

    const sys = "You are a senior food copywriter for high-end restaurants. " +
      "Write ONE short, sensory, magazine-quality marketing line for a single dish. " +
      "Rules: 12 to 20 words, no emoji, no hashtags, no quotation marks, " +
      "no exclamation marks, no markdown, present-tense, evoke flavor and texture. " +
      "Do NOT include the price. Do NOT include the dish name verbatim more than once. " +
      "Tailor the tone to the campaign occasion provided. " +
      "Output ONLY the line, nothing else.";

    const user = [
      `Dish: ${dishName}`,
      dishDescription ? `Existing description: ${dishDescription}` : "",
      restaurantName ? `Restaurant: ${restaurantName}` : "",
      `Occasion: ${occasion}`,
      `Tone: ${moodHint}`,
    ].filter(Boolean).join("\n");

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.8,
        max_tokens: 90,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(502).json({ error: `Groq error: ${text.slice(0, 200)}` });
    }

    const data = await response.json();
    let tagline = data?.choices?.[0]?.message?.content?.trim() ?? "";
    tagline = tagline.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
    tagline = tagline.replace(/\s+/g, " ");
    if (tagline.length > 160) tagline = tagline.slice(0, 157).trimEnd() + "…";

    res.json({ tagline });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'unknown' });
  }
});

// Image generation proxy endpoint
app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt, width = 1280, height = 1280, seed, model = 'flux', nologo = true, enhance = true } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt required' });
    }

    const params = new URLSearchParams({
      prompt,
      width: width.toString(),
      height: height.toString(),
      seed: (seed || Math.floor(Math.random() * 10000000)).toString(),
      nologo: nologo ? 'true' : 'false',
      enhance: enhance ? 'true' : 'false',
      model,
    });

    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params}`;

    const response = await fetch(pollinationsUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Pollinations API error: HTTP ${response.status}`,
      });
    }

    const buffer = await response.arrayBuffer();

    res.set({
      'Content-Type': response.headers.get('content-type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    res.send(Buffer.from(buffer));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Placeholder for scrape-menu (complex scraping logic would go here)
app.post('/api/scrape-menu', async (req, res) => {
  res.status(501).json({ error: 'scrape-menu endpoint not yet implemented for Render deployment. Use Supabase Edge Functions for now.' });
});

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
