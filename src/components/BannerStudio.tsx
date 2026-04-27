import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Download, RefreshCw, ArrowLeft, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { MenuItem } from "@/types/menu";
import {
  CampaignChoice,
  CampaignTheme,
  resolveCampaignTheme,
} from "@/types/campaign";

interface BannerStudioProps {
  items: MenuItem[];
  restaurantName: string | null;
  websiteUrl: string;
  logoUrl?: string | null;
  campaign: CampaignChoice;
  onBack: () => void;
}

type FormatKey = "square" | "story" | "landscape";

interface FormatSpec {
  key: FormatKey;
  label: string;
  width: number;
  height: number;
  description: string;
}

const FORMATS: FormatSpec[] = [
  { key: "square", label: "Square 1:1", width: 1080, height: 1080, description: "Instagram feed (1080×1080)" },
  { key: "story", label: "Story 9:16", width: 1080, height: 1920, description: "IG / FB story (1080×1920)" },
  { key: "landscape", label: "Landscape 16:9", width: 1600, height: 900, description: "Web / FB cover (1600×900)" },
];

/* ────────────── Fonts ────────────── */

const FONT_CSS_URL =
  "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;0,800;1,500&family=Inter:wght@400;500;600;700&display=swap";

let fontsReadyPromise: Promise<void> | null = null;
async function ensureFontsLoaded(): Promise<void> {
  if (fontsReadyPromise) return fontsReadyPromise;
  fontsReadyPromise = (async () => {
    if (!document.querySelector(`link[data-banner-fonts="true"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = FONT_CSS_URL;
      link.dataset.bannerFonts = "true";
      document.head.appendChild(link);
    }
    try {
      await Promise.all([
        (document as any).fonts?.load("700 80px 'Playfair Display'"),
        (document as any).fonts?.load("500 40px 'Playfair Display'"),
        (document as any).fonts?.load("italic 500 40px 'Playfair Display'"),
        (document as any).fonts?.load("600 24px 'Inter'"),
        (document as any).fonts?.load("400 22px 'Inter'"),
      ]);
      await (document as any).fonts?.ready;
    } catch {
      /* ignore */
    }
  })();
  return fontsReadyPromise;
}

const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";
const SANS = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";

/* ────────────── Fallback image generator ────────────── */
function createFallbackImage(item: MenuItem, theme: CampaignTheme): Promise<{ item: MenuItem; img: HTMLImageElement }> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 1280;
    const ctx = canvas.getContext('2d')!;
    
    // Multi-color gradient background
    const grad = ctx.createLinearGradient(0, 0, 1280, 1280);
    grad.addColorStop(0, theme.ink);
    grad.addColorStop(0.5, theme.accent);
    grad.addColorStop(1, theme.accentSoft);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1280, 1280);
    
    // Add animated-looking diagonal pattern
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 64, 0);
      ctx.lineTo(i * 64 + 1280, 1280);
      ctx.stroke();
    }
    
    // Dark semi-transparent overlay for text readability
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, 1280, 1280);
    
    // Add decorative circles
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(640 + (i - 1) * 300, 640, 200 + i * 100, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Dish name
    ctx.fillStyle = theme.cream;
    ctx.font = "bold 80px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 4;
    
    // Wrap long names
    const words = item.name.split(' ');
    const maxWordsPerLine = Math.ceil(words.length / 2);
    const lines: string[] = [];
    let currentLine = '';
    words.forEach((word, idx) => {
      if (lines.length < 2) {
        if (currentLine && idx > 0 && idx % maxWordsPerLine === 0) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = currentLine ? currentLine + ' ' + word : word;
        }
      }
    });
    if (currentLine) lines.push(currentLine);
    
    const lineHeight = 120;
    const startY = 640 - (lines.length - 1) * lineHeight / 2;
    lines.forEach((line, idx) => {
      ctx.fillText(line, 640, startY + idx * lineHeight);
    });
    
    // Price or cuisine hint (smaller text)
    if (item.price) {
      ctx.font = "50px Inter, sans-serif";
      ctx.fillStyle = theme.accentSoft;
      const currency = item.price > 500 ? '₹' : '$';
      ctx.fillText(`${currency}${item.price}`, 640, 1000);
    }
    
    const img = new Image();
    img.onload = () => {
      console.log('[Pollinations] Using fallback gradient for:', item.name);
      resolve({ item, img });
    };
    img.src = canvas.toDataURL('image/png');
  });
}

function loadImage(src: string, timeout = 30000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    
    const timeoutId = setTimeout(() => {
      img.src = '';
      reject(new Error(`Timeout loading image`));
    }, timeout);
    
    img.onload = () => {
      clearTimeout(timeoutId);
      console.log('[loadImage] Loaded:', src.substring(0, 80), 'Size:', img.width, 'x', img.height);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timeoutId);
      console.error('[loadImage] Failed:', src.substring(0, 80));
      reject(new Error(`Failed to load ${src}`));
    };
    img.src = src;
  });
}


/* ────────────── Currency helpers (shared) ────────────── */
import { detectMenuCurrency, formatPriceWithCurrency } from "@/lib/currency";

/* ────────────── Canvas helpers ────────────── */

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (ctx.measureText(last + "…").width > maxWidth && last.length > 1) {
      last = last.slice(0, -1);
    }
    kept[maxLines - 1] = last.replace(/[,;:.\s]+$/, "") + "…";
    return kept;
  }
  return lines;
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  initialSize: number,
  minSize: number,
): { size: number; text: string } {
  let size = initialSize;
  let textWidth = ctx.measureText(text).width;
  while (textWidth > maxWidth && size > minSize) {
    size -= 1;
    ctx.font = ctx.font.replace(/\d+px/, `${size}px`);
    textWidth = ctx.measureText(text).width;
  }
  return { size, text };
}

function fitTextOrTruncate(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  initialSize: number,
  minSize: number,
): { size: number; text: string } {
  ctx.font = `${ctx.font.replace(/\d+px/, "").replace(/^\w+\s/, "")} ${initialSize}px`;
  let textWidth = ctx.measureText(text).width;
  if (textWidth <= maxWidth) {
    return { size: initialSize, text };
  }
  let size = initialSize;
  while (textWidth > maxWidth && size > minSize) {
    size -= 1;
    ctx.font = ctx.font.replace(/\d+px/, `${size}px`);
    textWidth = ctx.measureText(text).width;
  }
  if (textWidth > maxWidth) {
    let truncated = text;
    while (ctx.measureText(truncated + "…").width > maxWidth && truncated.length > 1) {
      truncated = truncated.slice(0, -1);
    }
    return { size, text: truncated.replace(/[,;:.\s]+$/, "") + "…" };
  }
  return { size, text };
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (ctx.measureText(truncated + "…").width > maxWidth && truncated.length > 1) {
    truncated = truncated.slice(0, -1);
  }
  return truncated.replace(/[,;:.\s]+$/, "") + "…";
}

/** Measure wrapped text height for layout planning. */
function measureWrappedHeight(lineCount: number, fontSize: number, lineHeight = 1.1): number {
  return Math.round(lineCount * fontSize * lineHeight);
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number, dy: number, dw: number, dh: number,
) {
  const ar = img.width / img.height;
  const targetAr = dw / dh;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (ar > targetAr) {
    sw = img.height * targetAr;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / targetAr;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  align: "left" | "center" | "right" = "left",
) {
  const chars = text.split("");
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
  let cursor = x;
  if (align === "center") cursor = x - total / 2;
  if (align === "right") cursor = x - total;
  ctx.textAlign = "left";
  chars.forEach((c, i) => {
    ctx.fillText(c, cursor, y);
    cursor += widths[i] + tracking;
  });
}

/* ────────────── Decorative motifs (per-campaign) ────────────── */

function drawMotif(
  ctx: CanvasRenderingContext2D,
  theme: CampaignTheme,
  W: number,
  H: number,
) {
  ctx.save();
  switch (theme.motif) {
    case "snow":
    case "lights": {
      // soft glowing dots scattered along top
      const count = 28;
      for (let i = 0; i < count; i++) {
        const x = (i / count) * W + ((i * 137) % 50);
        const y = (H * 0.04) + ((i * 53) % Math.round(H * 0.18));
        const r = 2 + ((i * 7) % 4);
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 6);
        grad.addColorStop(0, theme.accentSoft);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r * 6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "garland": {
      // gentle scallop arc with berries across the very top
      const y = Math.round(H * 0.085);
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const segs = 14;
      const segW = W / segs;
      for (let i = 0; i <= segs; i++) {
        const x = i * segW;
        if (i === 0) ctx.moveTo(x, y);
        else {
          const cpX = x - segW / 2;
          const cpY = y + (i % 2 === 0 ? 14 : -14);
          ctx.quadraticCurveTo(cpX, cpY, x, y);
        }
      }
      ctx.stroke();
      // berries
      for (let i = 0; i < segs; i++) {
        const x = i * segW + segW / 2;
        ctx.fillStyle = theme.accentSoft;
        ctx.beginPath();
        ctx.arc(x, y + (i % 2 === 0 ? 14 : -14), 4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "diya": {
      // glowing diya orbs across the bottom with flame highlights
      const y = Math.round(H * 0.93);
      const count = 7;
      for (let i = 0; i < count; i++) {
        const x = ((i + 0.5) / count) * W;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, 60);
        grad.addColorStop(0, theme.accentSoft);
        grad.addColorStop(0.4, "rgba(245, 158, 11, 0.35)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, 60, 0, Math.PI * 2);
        ctx.fill();
        // flame dot
        ctx.fillStyle = theme.accent;
        ctx.beginPath();
        ctx.ellipse(x, y - 4, 3, 8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "lantern": {
      // hanging lantern glows along the top
      const y = Math.round(H * 0.06);
      const count = 5;
      for (let i = 0; i < count; i++) {
        const x = ((i + 0.5) / count) * W;
        // string
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, y - 18);
        ctx.stroke();
        // lantern body (rounded rect glow)
        const grad = ctx.createRadialGradient(x, y, 0, x, y, 50);
        grad.addColorStop(0, theme.accentSoft);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, 50, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = theme.accent;
        roundRect(ctx, x - 12, y - 16, 24, 32, 8);
        ctx.fill();
      }
      break;
    }
    case "hearts": {
      const count = 12;
      for (let i = 0; i < count; i++) {
        const x = ((i * 97) % W);
        const y = Math.round(H * 0.05) + ((i * 41) % Math.round(H * 0.15));
        const s = 8 + ((i * 3) % 6);
        ctx.fillStyle = theme.accentSoft;
        ctx.globalAlpha = 0.55;
        // crude heart from two arcs + triangle
        ctx.beginPath();
        ctx.moveTo(x, y + s);
        ctx.bezierCurveTo(x - s, y, x - s, y - s, x, y - s / 2);
        ctx.bezierCurveTo(x + s, y - s, x + s, y, x, y + s);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      break;
    }
    case "leaves": {
      // scattered leaf-like ovals along the bottom
      const y = Math.round(H * 0.92);
      for (let i = 0; i < 14; i++) {
        const x = ((i + 0.5) / 14) * W + ((i * 11) % 30);
        const rot = ((i * 37) % 360) * (Math.PI / 180);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.fillStyle = i % 2 === 0 ? theme.accent : theme.accentSoft;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.ellipse(0, 0, 18, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case "petals": {
      // small color powder bursts in corners
      [
        { x: W * 0.05, y: H * 0.12, c: theme.accent },
        { x: W * 0.95, y: H * 0.18, c: theme.accentSoft },
        { x: W * 0.1, y: H * 0.88, c: theme.accentSoft },
        { x: W * 0.92, y: H * 0.9, c: theme.accent },
      ].forEach(({ x, y, c }) => {
        const grad = ctx.createRadialGradient(x, y, 0, x, y, 110);
        grad.addColorStop(0, c);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, 110, 0, Math.PI * 2);
        ctx.fill();
      });
      break;
    }
    case "eggs": {
      // pastel ovals on the bottom band
      const y = Math.round(H * 0.94);
      const colors = [theme.accent, theme.accentSoft, "#fde68a", "#bae6fd", "#fbcfe8"];
      for (let i = 0; i < 8; i++) {
        const x = ((i + 0.5) / 8) * W;
        ctx.fillStyle = colors[i % colors.length];
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.ellipse(x, y, 10, 14, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case "stamp": {
      // a small circular stamp top-left like "fresh today"
      const cx = Math.round(W * 0.085);
      const cy = Math.round(H * 0.085);
      const r = Math.round(Math.min(W, H) * 0.05);
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r - 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = theme.accent;
      ctx.font = `700 ${Math.round(r * 0.3)}px ${SANS}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("FRESH", cx, cy - 4);
      ctx.fillText("TODAY", cx, cy + r * 0.32);
      ctx.textBaseline = "alphabetic";
      break;
    }
    case "editorial":
    default:
      /* nothing — pure editorial */
      break;
  }
  ctx.restore();
}

/* ────────────── Banner composition ────────────── */

interface ComposeArgs {
  format: FormatSpec;
  restaurantName: string;
  websiteUrl: string;
  dishes: { item: MenuItem; img: HTMLImageElement }[];
  logo: HTMLImageElement | null;
  theme: CampaignTheme;
  /** AI-generated hero dish marketing copy (overrides scraped description). */
  heroCopy?: string | null;
  /** Currency symbol inferred from the menu (e.g. "₹", "$", "€"). */
  currency: string;
}

function composeBanner({
  format,
  restaurantName,
  websiteUrl,
  dishes,
  logo,
  theme,
  heroCopy,
  currency,
}: ComposeArgs): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = format.width;
  canvas.height = format.height;
  const ctx = canvas.getContext("2d")!;
  const W = format.width;
  const H = format.height;
  // websiteUrl is intentionally not rendered on banners — kept in props for future use.
  void websiteUrl;
  const hero = dishes[0];

  /* ──── Layout bands (non-overlapping by construction) ──── */
  // Story 9:16 has more vertical room → photo gets a smaller portion to leave room for text.
  // Square / landscape → photo takes ~55-60% of height.
  const headerH = Math.round(H * (format.key === "story" ? 0.18 : 0.22));
  const photoH = Math.round(H * (format.key === "story" ? 0.46 : 0.5));
  const photoTop = headerH;
  const photoBottom = headerH + photoH;
  const contentTop = photoBottom; // text starts strictly below the photo
  const contentH = H - contentTop;

  /* ──── 1) Solid background (theme ink) ──── */
  ctx.fillStyle = theme.ink;
  ctx.fillRect(0, 0, W, H);

  /* ──── 2) Photo band ──── */
  if (hero) {
    drawImageCover(ctx, hero.img, 0, photoTop, W, photoH);
    // soft top + bottom fade INTO the photo so it joins the bands without overlapping text
    const topFade = ctx.createLinearGradient(0, photoTop, 0, photoTop + 80);
    topFade.addColorStop(0, theme.ink);
    topFade.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = topFade;
    ctx.fillRect(0, photoTop, W, 80);
    const botFade = ctx.createLinearGradient(0, photoBottom - 120, 0, photoBottom);
    botFade.addColorStop(0, "rgba(0,0,0,0)");
    botFade.addColorStop(1, theme.ink);
    ctx.fillStyle = botFade;
    ctx.fillRect(0, photoBottom - 120, W, 120);
  }

  /* ──── 3) Decorative motif (drawn over background, behind text) ──── */
  drawMotif(ctx, theme, W, H);

  /* ──── 4) Hairline frame ──── */
  const m = Math.round(Math.min(W, H) * 0.04);
  ctx.strokeStyle = `${theme.accent}88`;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(m, m, W - m * 2, H - m * 2);

  /* ──── 5) Header band: logo OR restaurant wordmark + eyebrow + sub-tagline ──── */
  // We never render BOTH a logo and the restaurant name — branding is one or the other.
  // Restaurant detail lines (e.g. "Veeraswamy | Indian fine dining") are intentionally omitted.
  let cursorY = Math.round(headerH * 0.32);

  if (logo) {
    const logoMaxH = Math.round(headerH * 0.46);
    const logoMaxW = Math.round(W * 0.34);
    const ratio = logo.width / logo.height || 1;
    let lh = logoMaxH;
    let lw = lh * ratio;
    if (lw > logoMaxW) {
      lw = logoMaxW;
      lh = lw / ratio;
    }
    const lx = (W - lw) / 2;
    const ly = cursorY - lh / 2;

    // Glow halo behind logo for visibility on dark backgrounds (no rectangle).
    const cx = lx + lw / 2;
    const cy = ly + lh / 2;
    const haloR = Math.max(lw, lh) * 0.75;
    const halo = ctx.createRadialGradient(cx, cy, lh * 0.2, cx, cy, haloR);
    halo.addColorStop(0, `${theme.accentSoft}55`);
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
    ctx.fill();

    // Drop shadow so the logo reads on any background.
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    ctx.drawImage(logo, lx, ly, lw, lh);
    ctx.restore();
    cursorY = ly + lh + Math.round(headerH * 0.16);
  } else {
    // No logo → restaurant name acts as the wordmark, dynamically sized to fit on one line.
    const maxNameW = W - m * 4;
    let nameSize = Math.round(H * 0.052);
    const minNameSize = Math.round(H * 0.028);
    while (nameSize >= minNameSize) {
      ctx.font = `700 ${nameSize}px ${SERIF}`;
      if (ctx.measureText(restaurantName).width <= maxNameW) break;
      nameSize -= 2;
    }
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 12;
    ctx.fillStyle = theme.cream;
    ctx.font = `700 ${nameSize}px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const nameLines = wrapText(ctx, restaurantName, maxNameW, 1);
    const nameY = Math.round(headerH * 0.42);
    ctx.fillText(nameLines[0], W / 2, nameY + nameSize * 0.85);
    ctx.restore();
    cursorY = nameY + nameSize + Math.round(H * 0.012);
  }

  // Eyebrow (campaign type)
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = theme.accentSoft;
  const eyebrowSize = Math.round(H * 0.018);
  ctx.font = `600 ${eyebrowSize}px ${SANS}`;
  drawTrackedText(ctx, theme.eyebrow, W / 2, cursorY, Math.round(H * 0.006), "center");
  ctx.restore();
  cursorY += Math.round(H * 0.022);

  // Sub-tagline (e.g. "Festival of lights", "Merry & bright") — dynamically sized.
  if (theme.tagline) {
    const maxTagW = W - m * 4;
    let tagSize = Math.round(H * 0.022);
    const minTagSize = Math.round(H * 0.014);
    while (tagSize >= minTagSize) {
      ctx.font = `italic 500 ${tagSize}px ${SERIF}`;
      if (ctx.measureText(theme.tagline).width <= maxTagW) break;
      tagSize -= 1;
    }
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 8;
    ctx.fillStyle = theme.cream;
    ctx.globalAlpha = 0.92;
    ctx.font = `italic 500 ${tagSize}px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(theme.tagline, W / 2, cursorY + tagSize * 0.9);
    ctx.restore();
  }

  /* ──── 6) Hero "SPECIAL PRICE" tag — sits in TOP-RIGHT of photo band ──── */
  if (hero?.item.price) {
    const priceText = formatPriceWithCurrency(hero.item.price, currency);
    const labelText = "SPECIAL PRICE";
    const labelTracking = 1.0;
    let labelSize = Math.round(H * 0.013);
    let priceSize = Math.round(H * 0.028);
    const padX = 16;
    const padY = 12;
    const notch = 14;
    // Hard ceiling — tag must never exceed this fraction of canvas width.
    const maxTagW = Math.round(W * 0.44);
    const usableMax = maxTagW - notch - padX * 2;

    // Shrink label font if needed (mainly relevant for narrow landscape).
    let labelW: number;
    while (true) {
      ctx.font = `700 ${labelSize}px ${SANS}`;
      labelW = ctx.measureText(labelText).width + labelTracking * (labelText.length - 1);
      if (labelW <= usableMax || labelSize <= 9) break;
      labelSize -= 1;
    }

    // Shrink price font until the price text fits within the tag's usable width.
    let priceW: number;
    const minPriceSize = Math.max(10, Math.round(H * 0.014));
    while (true) {
      ctx.font = `800 ${priceSize}px ${SANS}`;
      priceW = ctx.measureText(priceText).width;
      if (priceW <= usableMax || priceSize <= minPriceSize) break;
      priceSize -= 1;
    }

    const contentW = Math.min(usableMax, Math.max(priceW, labelW));
    const bw = contentW + padX * 2 + notch;
    const bh = labelSize + priceSize + padY * 2 + 6;
    // Clamp bx so tag never overflows the left canvas edge
    const bx = Math.max(m, W - m - bw - 12);
    const by = photoTop + 16;

    // Final safety: if price still wider than the text area after shrinking, truncate it
    ctx.font = `800 ${priceSize}px ${SANS}`;
    const finalPriceText = ctx.measureText(priceText).width > contentW
      ? truncateText(ctx, priceText, contentW)
      : priceText;

    // Notch (price-tag look) on the left side
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    ctx.moveTo(bx + notch, by);
    ctx.lineTo(bx + bw - 10, by);
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + 10);
    ctx.lineTo(bx + bw, by + bh - 10);
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - 10, by + bh);
    ctx.lineTo(bx + notch, by + bh);
    ctx.lineTo(bx, by + bh / 2);
    ctx.closePath();
    ctx.fillStyle = theme.accent;
    ctx.fill();
    ctx.restore();

    // Inner stitch line
    ctx.strokeStyle = `${theme.ink}88`;
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx + notch + 6, by + 6);
    ctx.lineTo(bx + bw - 6, by + 6);
    ctx.lineTo(bx + bw - 6, by + bh - 6);
    ctx.lineTo(bx + notch + 6, by + bh - 6);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    // Punch hole detail
    ctx.fillStyle = theme.ink;
    ctx.beginPath();
    ctx.arc(bx + 8, by + bh / 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Center X for both lines is the middle of the text area: [bx+notch, bx+bw]
    const textCx = bx + notch + (bw - notch) / 2;

    // "SPECIAL PRICE" label
    ctx.fillStyle = theme.ink;
    ctx.font = `700 ${labelSize}px ${SANS}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    drawTrackedText(ctx, labelText, textCx, by + padY + labelSize, labelTracking, "center");

    // Price value
    ctx.fillStyle = theme.ink;
    ctx.font = `800 ${priceSize}px ${SANS}`;
    ctx.textAlign = "center";
    ctx.fillText(finalPriceText, textCx, by + padY + labelSize + priceSize + 4);
  }

  /* ──── 7) Content band BELOW photo: dish name + description + companions ──── */
  const padX = m + Math.round(W * 0.02);
  const innerW = W - padX * 2;

  // Reserve space at bottom for the footer eyebrow + safe inner border so the
  // description never collides with the footer or touches the yellow hairline.
  const footerReserveTop = Math.round(H * 0.075);
  const safeBottom = H - m - footerReserveTop - Math.round(H * 0.018);

  let y = contentTop + Math.round(contentH * 0.1);

  if (hero) {
    // Dish title — dynamically sized so long names always fit on 1-2 lines
    // without overflowing the safe inner width.
    const baseTitleSize =
      format.key === "story"
        ? Math.round(H * 0.05)
        : format.key === "landscape"
          ? Math.round(H * 0.07)
          : Math.round(H * 0.058);
    const minTitleSize = Math.round(baseTitleSize * 0.55);
    const titleMaxLines = format.key === "landscape" ? 1 : 2;

    let titleSize = baseTitleSize;
    let titleLines: string[] = [];
    while (titleSize >= minTitleSize) {
      ctx.font = `700 ${titleSize}px ${SERIF}`;
      titleLines = wrapText(ctx, hero.item.name, innerW, titleMaxLines);
      const longest = Math.max(...titleLines.map((l) => ctx.measureText(l).width));
      const noEllipsis = !titleLines[titleLines.length - 1]?.endsWith("…");
      if (longest <= innerW && noEllipsis) break;
      titleSize -= 4;
    }

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.75)";
    ctx.shadowBlur = 14;
    ctx.fillStyle = theme.cream;
    ctx.font = `700 ${titleSize}px ${SERIF}`;
    ctx.textAlign = "center";
    titleLines.forEach((line, i) => {
      ctx.fillText(line, W / 2, y + (i + 1) * titleSize * 0.95);
    });
    ctx.restore();
    const titleBottom = y + measureWrappedHeight(titleLines.length, titleSize, 0.95);
    y = titleBottom + Math.round(H * 0.025);

    // AI-crafted marketing copy (Groq) takes priority, falls back to scraped description.
    const copyText =
      (heroCopy && heroCopy.trim()) ||
      (hero.item.description && hero.item.description.trim()) ||
      "";
    if (copyText) {
      // Format-tuned base sizes:
      // • Landscape (1600×900) — band is short vertically; use a generous % of width-relative height for clear reading.
      // • Story (1080×1920) — tall canvas; description must NOT dominate. Keep modest.
      // • Square (1080×1080) — balanced.
      const baseDescSize =
        format.key === "landscape"
          ? Math.round(H * 0.046)
          : format.key === "story"
            ? Math.round(H * 0.018)
            : Math.round(H * 0.024);
      const minDescSize =
        format.key === "landscape"
          ? Math.round(H * 0.03)
          : format.key === "story"
            ? Math.round(H * 0.013)
            : Math.round(H * 0.016);
      const maxDescLines = format.key === "landscape" ? 2 : format.key === "story" ? 4 : 3;

      // Available vertical room between title and footer-safe zone.
      const availableH = safeBottom - y;

      let descSize = baseDescSize;
      let descLines: string[] = [];
      let descBlockH = 0;
      while (descSize >= minDescSize) {
        ctx.font = `italic 500 ${descSize}px ${SERIF}`;
        descLines = wrapText(ctx, copyText, innerW - 40, maxDescLines);
        descBlockH = measureWrappedHeight(descLines.length, descSize, 1.35);
        if (descBlockH <= availableH) break;
        descSize -= 1;
      }

      // If still overflowing at min size, drop a line and reflow rather than push up.
      if (descBlockH > availableH && descLines.length > 1) {
        ctx.font = `italic 500 ${descSize}px ${SERIF}`;
        descLines = wrapText(ctx, copyText, innerW - 40, Math.max(1, descLines.length - 1));
        descBlockH = measureWrappedHeight(descLines.length, descSize, 1.35);
      }

      const descTop = y; // never push above title bottom

      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = theme.cream;
      ctx.globalAlpha = 0.94;
      ctx.font = `italic 500 ${descSize}px ${SERIF}`;
      ctx.textAlign = "center";
      descLines.forEach((line, i) => {
        ctx.fillText(line, W / 2, descTop + (i + 1) * descSize * 1.35);
      });
      ctx.restore();
      y = descTop + descBlockH + Math.round(H * 0.02);
    }
  }

  /* ──── 8) Companion dishes (chips with dividers) ──── */
  const companions = dishes.slice(1);
  const companionsTop = y + Math.round(H * 0.012);
  const companionsAvailable = safeBottom - companionsTop;

  if (companions.length > 0 && companionsAvailable > Math.round(H * 0.08)) {
    // "ALSO FEATURING" eyebrow
    ctx.fillStyle = theme.accentSoft;
    ctx.font = `600 ${Math.round(H * 0.013)}px ${SANS}`;
    drawTrackedText(ctx, "ALSO FEATURING", W / 2, companionsTop, Math.round(H * 0.005), "center");

    const chipsTop = companionsTop + Math.round(H * 0.025);
    const visible = companions.slice(0, format.key === "story" ? 4 : 3);
    const colW = innerW / visible.length;

    visible.forEach((d, i) => {
      const cx = padX + colW * (i + 0.5);
      const availableDishWidth = colW - 20;

      // Dish name - dynamically fit to available width
      ctx.fillStyle = theme.cream;
      let dishSize = Math.round(H * 0.02);
      ctx.font = `500 ${dishSize}px ${SERIF}`;
      const dishLines = wrapText(ctx, d.item.name, availableDishWidth, 2);

      while (ctx.measureText(dishLines[0] || d.item.name).width > availableDishWidth && dishSize > 10) {
        dishSize -= 1;
        ctx.font = `500 ${dishSize}px ${SERIF}`;
      }

      dishLines.forEach((line, li) => {
        ctx.fillText(truncateText(ctx, line, availableDishWidth), cx, chipsTop + (li + 1) * dishSize * 1.2);
      });

      if (d.item.price) {
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.shadowBlur = 6;
        ctx.fillStyle = theme.accent;
        let pSize = Math.round(H * 0.018);
        ctx.font = `700 ${pSize}px ${SANS}`;
        const priceText = formatPriceWithCurrency(d.item.price, currency);

        while (ctx.measureText(priceText).width > availableDishWidth && pSize > 10) {
          pSize -= 1;
          ctx.font = `700 ${pSize}px ${SANS}`;
        }

        const priceY = chipsTop + (dishLines.length + 1) * dishSize * 1.2 + Math.round(H * 0.014);
        ctx.fillText(priceText, cx, priceY);
        ctx.restore();
      }

      if (i < visible.length - 1) {
        ctx.strokeStyle = `${theme.accent}55`;
        ctx.lineWidth = 1;
        const dx = padX + colW * (i + 1);
        ctx.beginPath();
        ctx.moveTo(dx, chipsTop + 8);
        ctx.lineTo(dx, chipsTop + Math.round(H * 0.075));
        ctx.stroke();
      }
    });
  }

  /* ──── 9) Footer: editorial campaign mark (no solid pill) ──── */
  if (theme.footerBadge) {
    const badgeFont = Math.round(H * 0.014);
    const tracking = Math.round(H * 0.004);
    ctx.font = `700 ${badgeFont}px ${SANS}`;
    const chars = theme.footerBadge.split("");
    const textW =
      chars.reduce((sum, c) => sum + ctx.measureText(c).width, 0) +
      tracking * (chars.length - 1);
    const cy = H - m - Math.round(H * 0.025);
    const ruleGap = Math.round(W * 0.015);
    const ruleLen = Math.round(W * 0.06);
    const leftEnd = (W - textW) / 2 - ruleGap;
    const rightStart = (W + textW) / 2 + ruleGap;

    // Flanking hairline rules
    ctx.save();
    ctx.strokeStyle = `${theme.accent}cc`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(leftEnd - ruleLen, cy);
    ctx.lineTo(leftEnd, cy);
    ctx.moveTo(rightStart, cy);
    ctx.lineTo(rightStart + ruleLen, cy);
    ctx.stroke();
    // Tiny end-cap diamonds
    ctx.fillStyle = theme.accent;
    [leftEnd - ruleLen, rightStart + ruleLen].forEach((px) => {
      ctx.save();
      ctx.translate(px, cy);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-2.5, -2.5, 5, 5);
      ctx.restore();
    });
    ctx.restore();

    // Tracked label
    ctx.save();
    ctx.fillStyle = theme.accent;
    ctx.font = `700 ${badgeFont}px ${SANS}`;
    ctx.textBaseline = "middle";
    drawTrackedText(ctx, theme.footerBadge, W / 2, cy, tracking, "center");
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }

  return canvas;
}

/* ────────────── Component ────────────── */

interface BannerState {
  url: string | null;
  loading: boolean;
  error: string | null;
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "banner";

export const BannerStudio = ({
  items,
  restaurantName,
  websiteUrl,
  logoUrl,
  campaign,
  onBack,
}: BannerStudioProps) => {
  const { toast } = useToast();
  // Start with nothing selected/active so we never generate banners
  // until the user explicitly picks formats and clicks "Generate".
  const [selectedFormats, setSelectedFormats] = useState<Set<FormatKey>>(
    new Set<FormatKey>(),
  );
  const [activeFormats, setActiveFormats] = useState<Set<FormatKey>>(
    new Set<FormatKey>(),
  );
  // key: `${item.id}::${formatKey}` — one slot per dish × format
  const [banners, setBanners] = useState<Record<string, BannerState>>({});
  const [activeDishIdx, setActiveDishIdx] = useState(0);
  const [generationKey, setGenerationKey] = useState(0);
  const cancelRef = useRef(false);

  const safeName = useMemo(() => restaurantName || "Your Restaurant", [restaurantName]);
  const cappedItems = useMemo(() => items.slice(0, 5), [items]);
  const theme = useMemo(() => resolveCampaignTheme(campaign), [campaign]);
  const currency = useMemo(() => detectMenuCurrency(items), [items]);
  const activeFormatsKey = useMemo(
    () => FORMATS.filter((f) => activeFormats.has(f.key)).map((f) => f.key).join(","),
    [activeFormats],
  );
  const formatsToRender = useMemo(
    () => FORMATS.filter((f) => activeFormats.has(f.key)),
    [activeFormats],
  );

  useEffect(() => {
    cancelRef.current = false;

    // Build initial loading states: one slot per dish × active format
    const initial: Record<string, BannerState> = {};
    if (activeFormats.size > 0) {
      cappedItems.forEach((item) => {
        FORMATS.forEach((f) => {
          if (activeFormats.has(f.key)) {
            initial[`${item.id}::${f.key}`] = { url: null, loading: true, error: null };
          }
        });
      });
    }
    setBanners(initial);

    if (activeFormats.size === 0 || cappedItems.length === 0) return;

    (async () => {
      try {
        await ensureFontsLoaded();

        let logo: HTMLImageElement | null = null;
        if (logoUrl) {
          const stripped = logoUrl.replace(/^https?:\/\//, "");
          const proxied = `https://images.weserv.nl/?url=${encodeURIComponent(stripped)}&w=600&output=png`;
          try { logo = await loadImage(proxied); } catch {
            try { logo = await loadImage(logoUrl); } catch { logo = null; }
          }
        }
        if (cancelRef.current) return;

        // Load all dish images in parallel
        const dishImages = await Promise.all(
          cappedItems.map(async (item) => {
            if (item.image_url) {
              const stripped = item.image_url.replace(/^https?:\/\//, "");
              const proxied = `https://images.weserv.nl/?url=${encodeURIComponent(stripped)}&w=1280&h=1280&fit=cover&output=jpg`;
              try { const img = await loadImage(proxied); return { item, img }; } catch {}
              try { const img = await loadImage(item.image_url); return { item, img }; } catch {}
            }
            const parts = [
              "professional food photography of",
              item.name,
              item.description ? `, ${item.description}` : "",
              `, ${theme.photoStyle}`,
              ", restaurant menu hero shot, 45-degree angle, shallow depth of field, magazine quality, high detail, appetizing",
            ];
            const prompt = parts.join(" ").slice(0, 420);
            const baseSeed = Math.abs([...item.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0));
            const seed = (baseSeed + generationKey) % 9_999_999;
            for (let attempt = 1; attempt <= 2; attempt++) {
              try {
                const response = await fetch(
                  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                    },
                    body: JSON.stringify({ prompt, width: 1280, height: 1280, seed, model: "flux", nologo: true, enhance: true }),
                  }
                );
                if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
                const blob = await response.blob();
                const objectUrl = URL.createObjectURL(blob);
                return await new Promise<{ item: MenuItem; img: HTMLImageElement }>((resolve, reject) => {
                  const img = new Image();
                  img.crossOrigin = "anonymous";
                  img.onload = () => resolve({ item, img });
                  img.onerror = () => reject(new Error(`Failed to load image`));
                  img.src = objectUrl;
                });
              } catch (e) {
                if (attempt === 2) return createFallbackImage(item, theme);
              }
            }
            return createFallbackImage(item, theme);
          }),
        );
        if (cancelRef.current) return;

        // Fetch AI copy for EACH dish in parallel
        const copyMap: Record<string, string | null> = {};
        await Promise.all(
          cappedItems.map(async (item) => {
            try {
              const { data } = await supabase.functions.invoke<{ tagline?: string }>(
                "dish-copy",
                { body: { dishName: item.name, dishDescription: item.description, campaignType: campaign.type, festival: campaign.festival ?? null, restaurantName: safeName } },
              );
              copyMap[item.id] = data?.tagline ?? null;
            } catch { copyMap[item.id] = null; }
          }),
        );
        if (cancelRef.current) return;

        // Generate one banner per dish × format
        for (let dishIdx = 0; dishIdx < cappedItems.length; dishIdx++) {
          if (cancelRef.current) return;
          const heroEntry = dishImages[dishIdx];
          // Companions: all other dishes' images
          const companionEntries = dishImages.filter((_, i) => i !== dishIdx);
          const heroCopy = copyMap[cappedItems[dishIdx].id] ?? null;

          for (const format of FORMATS) {
            if (cancelRef.current) return;
            if (!activeFormats.has(format.key)) continue;
            const slotKey = `${cappedItems[dishIdx].id}::${format.key}`;
            try {
              const canvas = composeBanner({
                format,
                restaurantName: safeName,
                websiteUrl,
                dishes: [heroEntry, ...companionEntries],
                logo,
                theme,
                heroCopy,
                currency,
              });
              const url = canvas.toDataURL("image/png");
              setBanners((prev) => ({ ...prev, [slotKey]: { url, loading: false, error: null } }));
            } catch (e) {
              const errMsg = e instanceof Error ? e.message : "Failed to render";
              setBanners((prev) => ({ ...prev, [slotKey]: { url: null, loading: false, error: errMsg } }));
            }
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to generate banners";
        toast({ title: "Banner generation failed", description: msg, variant: "destructive" });
        // Mark all slots as errored
        setBanners((prev) => {
          const next = { ...prev };
          cappedItems.forEach((item) => {
            FORMATS.forEach((f) => {
              if (activeFormats.has(f.key)) {
                const k = `${item.id}::${f.key}`;
                if (next[k]?.loading) next[k] = { url: null, loading: false, error: msg };
              }
            });
          });
          return next;
        });
      }
    })();

    return () => { cancelRef.current = true; };
  }, [cappedItems, safeName, websiteUrl, logoUrl, generationKey, theme, toast, campaign, currency, activeFormatsKey, activeFormats]);

  const downloadBanner = (itemId: string, fk: FormatKey) => {
    const banner = banners[`${itemId}::${fk}`];
    if (!banner?.url) return;
    const item = cappedItems.find((i) => i.id === itemId);
    const a = document.createElement("a");
    a.href = banner.url;
    a.download = `${slugify(safeName)}-${slugify(item?.name ?? "dish")}-${campaign.type}-${fk}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadAll = () => {
    const combos: [string, FormatKey][] = [];
    cappedItems.forEach((item) =>
      formatsToRender.forEach((f) => {
        if (banners[`${item.id}::${f.key}`]?.url) combos.push([item.id, f.key]);
      }),
    );
    combos.forEach(([itemId, fk], i) => setTimeout(() => downloadBanner(itemId, fk), i * 250));
  };

  const allReady =
    formatsToRender.length > 0 &&
    cappedItems.length > 0 &&
    cappedItems.every((item) =>
      formatsToRender.every((f) => banners[`${item.id}::${f.key}`]?.url),
    );

  const toggleFormat = (key: FormatKey) => {
    setSelectedFormats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const applySelection = () => {
    if (selectedFormats.size === 0) {
      toast({
        title: "Pick at least one format",
        description: "Select at least one banner size to generate.",
      });
      return;
    }
    setActiveDishIdx(0);
    setActiveFormats(new Set(selectedFormats));
    setGenerationKey((k) => k + 1);
  };

  const selectionDirty =
    selectedFormats.size !== activeFormats.size ||
    [...selectedFormats].some((k) => !activeFormats.has(k));

  const activeDishItem = cappedItems[activeDishIdx] ?? cappedItems[0];

  return (
    <section className="w-full max-w-5xl animate-fade-in-up">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button onClick={onBack} variant="outline" size="sm" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Change campaign
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setGenerationKey((k) => k + 1)}
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={activeFormats.size === 0}
          >
            <RefreshCw className="h-4 w-4" />
            Regenerate
          </Button>
          <Button onClick={downloadAll} size="sm" disabled={!allReady} className="gap-2">
            <Download className="h-4 w-4" />
            Download all
          </Button>
        </div>
      </div>

      {/* Format selector — only generate the sizes you need */}
      <div className="mb-6 rounded-2xl border border-border bg-card/60 p-4 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold text-foreground">Choose banner sizes</p>
            <p className="text-xs text-muted-foreground">
              Pick 1–3 formats. Only selected sizes will be generated.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {FORMATS.map((f) => {
              const id = `fmt-${f.key}`;
              const checked = selectedFormats.has(f.key);
              return (
                <Label
                  key={f.key}
                  htmlFor={id}
                  className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    checked
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Checkbox
                    id={id}
                    checked={checked}
                    onCheckedChange={() => toggleFormat(f.key)}
                  />
                  <span>{f.label}</span>
                </Label>
              );
            })}
            <Button
              size="sm"
              onClick={applySelection}
              disabled={selectedFormats.size === 0 || (!selectionDirty && activeFormats.size > 0)}
              className="gap-2"
            >
              {activeFormats.size === 0 ? "Generate" : "Apply"}
            </Button>
          </div>
        </div>
      </div>

      <header className="mb-6 flex flex-col gap-2 border-b border-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          {theme.eyebrow.toLowerCase()} · banner studio
        </p>
        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {safeName}
        </h2>
        <p className="text-sm text-muted-foreground">
          {cappedItems.length} dish{cappedItems.length === 1 ? "" : "es"} · {formatsToRender.length} themed format{formatsToRender.length === 1 ? "" : "s"} · dish photography by{" "}
          <a
            href="https://pollinations.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 hover:underline"
          >
            Pollinations AI
          </a>
        </p>
        {items.length > cappedItems.length && (
          <p className="text-xs text-muted-foreground">
            Showing first {cappedItems.length} of {items.length} selected — each dish gets its own banner set.
          </p>
        )}
      </header>

      {formatsToRender.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
          Pick the banner sizes you need above and tap <span className="font-semibold text-foreground">Generate</span>. We'll only render what you select — no wasted images.
        </div>
      ) : (
      <>
        {/* Dish selector — shown only when multiple dishes are selected */}
        {cappedItems.length > 1 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {cappedItems.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveDishIdx(idx)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeDishIdx === idx
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {idx + 1}. {item.name.length > 28 ? item.name.slice(0, 25) + "…" : item.name}
              </button>
            ))}
          </div>
        )}

        <Tabs defaultValue={formatsToRender[0].key} key={`${activeFormatsKey}-${activeDishIdx}`} className="w-full">
          <TabsList
            className="grid w-full"
            style={{ gridTemplateColumns: `repeat(${formatsToRender.length}, minmax(0, 1fr))` }}
          >
            {formatsToRender.map((f) => (
              <TabsTrigger key={f.key} value={f.key} className="text-xs sm:text-sm">
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {formatsToRender.map((f) => {
            const slotKey = activeDishItem ? `${activeDishItem.id}::${f.key}` : "";
            const state = banners[slotKey] ?? { url: null, loading: activeFormats.size > 0, error: null };
            return (
              <TabsContent key={f.key} value={f.key} className="mt-6">
                <div className="flex flex-col items-center gap-4">
                  <p className="text-xs text-muted-foreground">{f.description}</p>
                  <div
                    className="relative w-full overflow-hidden rounded-2xl border border-border bg-muted/40 shadow-elegant"
                    style={{
                      maxWidth:
                        f.key === "story"
                          ? "min(420px, 100%)"
                          : f.key === "landscape"
                            ? "min(900px, 100%)"
                            : "min(640px, 100%)",
                      aspectRatio: `${f.width} / ${f.height}`,
                    }}
                  >
                    {state.loading && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm">Composing banner…</p>
                      </div>
                    )}
                    {state.error && !state.loading && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-destructive">
                        <ImageIcon className="h-8 w-8" />
                        {state.error}
                      </div>
                    )}
                    {state.url && (
                      <img
                        src={state.url}
                        alt={`${f.label} banner for ${activeDishItem?.name ?? safeName}`}
                        className="h-full w-full object-contain"
                      />
                    )}
                  </div>
                  <Button
                    onClick={() => activeDishItem && downloadBanner(activeDishItem.id, f.key)}
                    disabled={!state.url}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download {f.label}
                  </Button>
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </>
      )}
    </section>
  );
};
