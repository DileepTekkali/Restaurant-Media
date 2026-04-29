import { useState } from "react";
import { ArrowLeft, Wand2, Calendar, Sparkles, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CampaignChoice,
  CampaignType,
  FestivalKey,
  FESTIVAL_EMOJI,
  FESTIVAL_LABEL,
} from "@/types/campaign";

interface CampaignSelectorProps {
  selectedCount: number;
  onBack: () => void;
  onConfirm: (choice: CampaignChoice) => void;
}

const CAMPAIGN_OPTIONS: {
  type: CampaignType;
  title: string;
  description: string;
  icon: typeof Calendar;
  swatch: string;
}[] = [
  {
    type: "daily_special",
    title: "Daily Special",
    description: "Warm editorial look — golden hour light, rustic plating, today-only feel.",
    icon: Calendar,
    swatch: "bg-gradient-to-br from-amber-500 to-orange-700",
  },
  {
    type: "new_arrival",
    title: "New Arrival",
    description: "Modern minimalist look — cool palette, clean typography, contemporary feel.",
    icon: Sparkles,
    swatch: "bg-gradient-to-br from-sky-400 to-slate-900",
  },
  {
    type: "festive_special",
    title: "Festive Special",
    description: "Pick a festival — banners get themed colors, motifs and photography style.",
    icon: PartyPopper,
    swatch: "bg-gradient-to-br from-rose-500 via-amber-400 to-yellow-300",
  },
];

const FESTIVALS: FestivalKey[] = [
  "christmas",
  "new_year",
  "diwali",
  "eid",
  "valentines",
  "thanksgiving",
  "halloween",
  "lunar_new_year",
  "holi",
  "easter",
];

export const CampaignSelector = ({ selectedCount, onBack, onConfirm }: CampaignSelectorProps) => {
  const [type, setType] = useState<CampaignType | null>(null);
  const [festival, setFestival] = useState<FestivalKey | null>(null);

  const canConfirm =
    type === "daily_special" ||
    type === "new_arrival" ||
    (type === "festive_special" && festival !== null);

  const confirm = () => {
    if (!canConfirm || !type) return;
    onConfirm(
      type === "festive_special"
        ? { type, festival: festival ?? undefined }
        : { type },
    );
  };

  return (
    <section className="w-full max-w-4xl animate-fade-in-up">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button onClick={onBack} variant="outline" size="sm" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to menu
        </Button>
        <p className="text-xs text-muted-foreground">
          {selectedCount} dish{selectedCount === 1 ? "" : "es"} selected
        </p>
      </div>

      <header className="mb-8 flex flex-col gap-2 border-b border-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Step 2 · Pick a campaign
        </p>
        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          What kind of banners?
        </h2>
        <p className="text-sm text-muted-foreground">
          Each campaign uses a distinct palette, photography style and on-banner copy.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {CAMPAIGN_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = type === opt.type;
          return (
            <button
              key={opt.type}
              type="button"
              onClick={() => {
                setType(opt.type);
                if (opt.type !== "festive_special") setFestival(null);
              }}
              className={cn(
                "group relative flex flex-col items-start gap-3 overflow-hidden rounded-2xl border-2 bg-card p-5 text-left transition-all",
                active
                  ? "border-primary shadow-elegant"
                  : "border-border hover:border-primary/50 hover:shadow-soft",
              )}
            >
              <div className={cn("h-20 w-full rounded-lg", opt.swatch)} />
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-foreground">{opt.title}</h3>
              </div>
              <p className="text-xs text-muted-foreground">{opt.description}</p>
              {active && (
                <span className="absolute right-3 top-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                  Selected
                </span>
              )}
            </button>
          );
        })}
      </div>

      {type === "festive_special" && (
        <div className="mt-8 rounded-2xl border border-border bg-card p-6 animate-fade-in-up">
          <p className="mb-4 text-sm font-semibold text-foreground">Pick the festival</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {FESTIVALS.map((f) => {
              const active = festival === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFestival(f)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border-2 p-3 text-center text-xs font-medium transition-all",
                    active
                      ? "border-primary bg-primary/5 text-foreground shadow-soft"
                      : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground",
                  )}
                >
                  <span className="text-2xl leading-none">{FESTIVAL_EMOJI[f]}</span>
                  <span>{FESTIVAL_LABEL[f]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-8 flex justify-end">
        <Button onClick={confirm} disabled={!canConfirm} size="lg" className="gap-2">
          <Wand2 className="h-4 w-4" />
          Generate banners
        </Button>
      </div>
    </section>
  );
};
