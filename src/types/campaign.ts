export type CampaignType = "daily_special" | "new_arrival" | "festive_special";

export type FestivalKey =
  | "christmas"
  | "new_year"
  | "diwali"
  | "eid"
  | "valentines"
  | "thanksgiving"
  | "halloween"
  | "lunar_new_year"
  | "holi"
  | "easter";

export interface CampaignChoice {
  type: CampaignType;
  festival?: FestivalKey;
}

export interface CampaignTheme {
  /** Short uppercase eyebrow shown above the restaurant name */
  eyebrow: string;
  /** Headline tagline displayed above the hero dish title */
  tagline: string;
  /** Background tint behind the photo (multiply-style overlay color, rgba) */
  overlayTop: string;
  overlayBottom: string;
  /** Accent palette (cream/text + accent + soft accent) */
  ink: string;
  cream: string;
  accent: string;
  accentSoft: string;
  mute: string;
  /** Decorative motif rendered behind/around content */
  motif: "editorial" | "stamp" | "garland" | "snow" | "lights" | "diya" | "lantern" | "hearts" | "leaves" | "petals" | "eggs";
  /** Photography prompt suffix appended to the dish photo prompt */
  photoStyle: string;
  /** Shown in the footer as a small badge */
  footerBadge?: string;
}

export const CAMPAIGN_LABEL: Record<CampaignType, string> = {
  daily_special: "Daily Special",
  new_arrival: "New Arrival",
  festive_special: "Festive Special",
};

export const FESTIVAL_LABEL: Record<FestivalKey, string> = {
  christmas: "Christmas",
  new_year: "New Year",
  diwali: "Diwali",
  eid: "Eid",
  valentines: "Valentine's Day",
  thanksgiving: "Thanksgiving",
  halloween: "Halloween",
  lunar_new_year: "Lunar New Year",
  holi: "Holi",
  easter: "Easter",
};

export const FESTIVAL_EMOJI: Record<FestivalKey, string> = {
  christmas: "🎄",
  new_year: "🎆",
  diwali: "🪔",
  eid: "🌙",
  valentines: "❤️",
  thanksgiving: "🍂",
  halloween: "🎃",
  lunar_new_year: "🏮",
  holi: "🎨",
  easter: "🐣",
};

/** Resolve the theme used for canvas composition */
export function resolveCampaignTheme(choice: CampaignChoice): CampaignTheme {
  if (choice.type === "daily_special") {
    return {
      eyebrow: "TODAY'S SPECIAL",
      tagline: "Fresh from our kitchen",
      overlayTop: "rgba(20, 14, 10, 0.55)",
      overlayBottom: "rgba(20, 14, 10, 0.90)",
      ink: "#1a1411",
      cream: "#f5efe4",
      accent: "#c9a24b",
      accentSoft: "#e2c179",
      mute: "rgba(245, 239, 228, 0.72)",
      motif: "editorial",
      photoStyle:
        "warm golden hour light, rustic wooden table, steam rising, cozy chef-made plating",
      footerBadge: "AVAILABLE TODAY",
    };
  }
  if (choice.type === "new_arrival") {
    return {
      eyebrow: "NEW ON THE MENU",
      tagline: "Just arrived",
      overlayTop: "rgba(8, 12, 24, 0.55)",
      overlayBottom: "rgba(8, 12, 24, 0.92)",
      ink: "#080c18",
      cream: "#f4f7ff",
      accent: "#7dd3fc",
      accentSoft: "#bae6fd",
      mute: "rgba(244, 247, 255, 0.72)",
      motif: "editorial",
      photoStyle:
        "modern minimalist plating, crisp natural light, contemporary fine dining presentation, clean dark background",
      footerBadge: "NEW",
    };
  }
  // festive_special
  return resolveFestivalTheme(choice.festival ?? "christmas");
}

function resolveFestivalTheme(f: FestivalKey): CampaignTheme {
  switch (f) {
    case "christmas":
      return {
        eyebrow: "CHRISTMAS SPECIAL",
        tagline: "Merry & bright",
        overlayTop: "rgba(20, 8, 8, 0.55)",
        overlayBottom: "rgba(20, 8, 8, 0.92)",
        ink: "#1a0808",
        cream: "#fff8ef",
        accent: "#d4a017",
        accentSoft: "#f4d27a",
        mute: "rgba(255, 248, 239, 0.72)",
        motif: "garland",
        photoStyle:
          "festive Christmas table, pine sprigs and red berries, warm candlelight, holiday plating",
        footerBadge: "HOLIDAY MENU",
      };
    case "new_year":
      return {
        eyebrow: "NEW YEAR'S EVE",
        tagline: "Cheers to new beginnings",
        overlayTop: "rgba(6, 8, 24, 0.55)",
        overlayBottom: "rgba(6, 8, 24, 0.92)",
        ink: "#06081a",
        cream: "#fff8ef",
        accent: "#facc15",
        accentSoft: "#fde68a",
        mute: "rgba(255, 248, 239, 0.72)",
        motif: "lights",
        photoStyle:
          "elegant celebration plating, champagne flute beside dish, sparkling bokeh background, midnight gala",
        footerBadge: "NYE MENU",
      };
    case "diwali":
      return {
        eyebrow: "DIWALI SPECIAL",
        tagline: "Festival of lights",
        overlayTop: "rgba(28, 8, 4, 0.55)",
        overlayBottom: "rgba(28, 8, 4, 0.92)",
        ink: "#1c0804",
        cream: "#fff5e6",
        accent: "#f59e0b",
        accentSoft: "#fcd34d",
        mute: "rgba(255, 245, 230, 0.72)",
        motif: "diya",
        photoStyle:
          "traditional Indian thali, glowing diyas around the plate, marigold petals, warm festive lighting",
        footerBadge: "DIWALI MENU",
      };
    case "eid":
      return {
        eyebrow: "EID SPECIAL",
        tagline: "Eid Mubarak",
        overlayTop: "rgba(4, 22, 16, 0.55)",
        overlayBottom: "rgba(4, 22, 16, 0.92)",
        ink: "#041610",
        cream: "#f4fbf6",
        accent: "#d4a017",
        accentSoft: "#f4d27a",
        mute: "rgba(244, 251, 246, 0.72)",
        motif: "lantern",
        photoStyle:
          "traditional Eid feast, ornate brass platter, dates and saffron, warm lantern light, rich Middle Eastern plating",
        footerBadge: "EID MENU",
      };
    case "valentines":
      return {
        eyebrow: "VALENTINE'S NIGHT",
        tagline: "Made for two",
        overlayTop: "rgba(28, 4, 14, 0.55)",
        overlayBottom: "rgba(28, 4, 14, 0.92)",
        ink: "#1c040e",
        cream: "#fff0f4",
        accent: "#f472b6",
        accentSoft: "#fbcfe8",
        mute: "rgba(255, 240, 244, 0.72)",
        motif: "hearts",
        photoStyle:
          "romantic candlelit dinner, rose petals on the table, intimate plating for two, soft pink bokeh",
        footerBadge: "DATE NIGHT",
      };
    case "thanksgiving":
      return {
        eyebrow: "THANKSGIVING FEAST",
        tagline: "Gather & give thanks",
        overlayTop: "rgba(28, 14, 4, 0.55)",
        overlayBottom: "rgba(28, 14, 4, 0.92)",
        ink: "#1c0e04",
        cream: "#fdf6e7",
        accent: "#d97706",
        accentSoft: "#fcd34d",
        mute: "rgba(253, 246, 231, 0.72)",
        motif: "leaves",
        photoStyle:
          "harvest table, autumn leaves and pumpkins, rustic family-style plating, golden autumn light",
        footerBadge: "HOLIDAY MENU",
      };
    case "halloween":
      return {
        eyebrow: "HALLOWEEN SPECIAL",
        tagline: "Spookily delicious",
        overlayTop: "rgba(8, 4, 14, 0.55)",
        overlayBottom: "rgba(8, 4, 14, 0.95)",
        ink: "#08040e",
        cream: "#fdf2e9",
        accent: "#f97316",
        accentSoft: "#fdba74",
        mute: "rgba(253, 242, 233, 0.72)",
        motif: "editorial",
        photoStyle:
          "Halloween themed plating, dark moody background, smoke and shadows, dramatic orange accent lighting, witchy garnish",
        footerBadge: "OCT 31 ONLY",
      };
    case "lunar_new_year":
      return {
        eyebrow: "LUNAR NEW YEAR",
        tagline: "Prosperity & joy",
        overlayTop: "rgba(28, 4, 4, 0.55)",
        overlayBottom: "rgba(28, 4, 4, 0.92)",
        ink: "#1c0404",
        cream: "#fff5f5",
        accent: "#facc15",
        accentSoft: "#fde68a",
        mute: "rgba(255, 245, 245, 0.72)",
        motif: "lantern",
        photoStyle:
          "Chinese New Year banquet, red lanterns in soft focus background, gold-trimmed plate, dumplings and noodles",
        footerBadge: "LNY MENU",
      };
    case "holi":
      return {
        eyebrow: "HOLI SPECIAL",
        tagline: "Festival of colors",
        overlayTop: "rgba(20, 4, 24, 0.55)",
        overlayBottom: "rgba(20, 4, 24, 0.90)",
        ink: "#140418",
        cream: "#fff5fb",
        accent: "#ec4899",
        accentSoft: "#fbcfe8",
        mute: "rgba(255, 245, 251, 0.72)",
        motif: "petals",
        photoStyle:
          "vibrant Indian festive plating, colorful powder pigments scattered in soft background, joyful spring lighting",
        footerBadge: "HOLI MENU",
      };
    case "easter":
      return {
        eyebrow: "EASTER BRUNCH",
        tagline: "Springtime on a plate",
        overlayTop: "rgba(8, 18, 12, 0.50)",
        overlayBottom: "rgba(8, 18, 12, 0.90)",
        ink: "#08120c",
        cream: "#f7fdf2",
        accent: "#a3e635",
        accentSoft: "#d9f99d",
        mute: "rgba(247, 253, 242, 0.72)",
        motif: "eggs",
        photoStyle:
          "Easter brunch table, pastel decorations, fresh spring herbs, soft morning light, garden setting",
        footerBadge: "EASTER MENU",
      };
  }
}
