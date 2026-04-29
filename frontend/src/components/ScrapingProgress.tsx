import { Loader2, ChefHat, Sparkles, FileText } from "lucide-react";
import { useEffect, useState } from "react";

const STAGES = [
  { icon: ChefHat, label: "Fetching restaurant page…" },
  { icon: FileText, label: "Reading menu candidates…" },
  { icon: Sparkles, label: "Cleaning data with AI…" },
];

export const ScrapingProgress = () => {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStageIndex((i) => (i + 1) % STAGES.length);
    }, 1800);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-6 rounded-2xl border border-border bg-card p-10 shadow-soft animate-fade-in-up">
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-warm shadow-glow">
          <Loader2 className="h-8 w-8 animate-spin text-primary-foreground" />
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <h3 className="text-xl font-semibold text-foreground">
          Building your menu
        </h3>
        <p className="text-sm text-muted-foreground">
          This usually takes 10–30 seconds
        </p>
      </div>

      <div className="flex w-full flex-col gap-3">
        {STAGES.map((stage, i) => {
          const Icon = stage.icon;
          const active = i === stageIndex;
          const done = i < stageIndex;
          return (
            <div
              key={stage.label}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-smooth ${
                active
                  ? "border-primary/40 bg-primary/5"
                  : done
                    ? "border-border bg-muted/40"
                    : "border-border/60 bg-transparent opacity-60"
              }`}
            >
              <Icon
                className={`h-5 w-5 ${
                  active
                    ? "text-primary animate-pulse"
                    : done
                      ? "text-accent"
                      : "text-muted-foreground"
                }`}
              />
              <span className="text-sm font-medium text-foreground">
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
