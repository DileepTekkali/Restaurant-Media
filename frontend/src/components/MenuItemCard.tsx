import { MenuItem } from "@/types/menu";
import { Tag, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPriceWithCurrency } from "@/lib/currency";

interface MenuItemCardProps {
  item: MenuItem;
  accentVar: string;
  /** Currency symbol to use when an item's price has no explicit symbol. */
  currency: string;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export const MenuItemCard = ({
  item,
  accentVar,
  currency,
  selectable = false,
  selected = false,
  onToggleSelect,
}: MenuItemCardProps) => {
  const accent = `hsl(var(${accentVar}))`;
  const displayPrice = item.price ? formatPriceWithCurrency(item.price, currency) : null;

  const handleClick = () => {
    if (selectable && onToggleSelect) onToggleSelect(item.id);
  };

  return (
    <article
      onClick={handleClick}
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : undefined}
      onKeyDown={(e) => {
        if (selectable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-pressed={selectable ? selected : undefined}
      className={cn(
        "group relative flex h-full flex-col gap-3 rounded-xl border bg-card p-5 shadow-soft transition-smooth",
        selectable && "cursor-pointer hover:-translate-y-0.5 hover:shadow-elegant",
        !selectable && "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-elegant",
        selected
          ? "border-primary ring-2 ring-primary/40"
          : "border-border hover:border-primary/30",
      )}
      style={{ ["--accent" as string]: accent }}
    >
      <div
        className="absolute left-0 top-0 h-full w-1 rounded-l-xl opacity-70 transition-smooth group-hover:opacity-100"
        style={{ backgroundColor: accent }}
        aria-hidden
      />

      {selectable && (
        <div
          className={cn(
            "absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-md border transition-smooth",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background/80 text-transparent group-hover:border-primary/50",
          )}
          aria-hidden
        >
          <Check className="h-4 w-4" />
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <h3
          className={cn(
            "flex-1 text-lg font-semibold leading-tight text-foreground",
            selectable && "pr-8",
          )}
        >
          {item.name}
        </h3>
        <span
          className="shrink-0 rounded-full px-3 py-1 text-sm font-bold tracking-wide"
          style={
            displayPrice
              ? {
                  backgroundColor: `hsl(var(${accentVar}) / 0.12)`,
                  color: accent,
                }
              : {
                  backgroundColor: "hsl(var(--muted) / 0.6)",
                  color: "hsl(var(--muted-foreground))",
                }
          }
          aria-label={displayPrice ? `Price ${displayPrice}` : "Price not listed"}
          title={displayPrice ? undefined : "Price not listed on website"}
        >
          {displayPrice || "—"}
        </span>
      </div>

      {item.description && (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {item.description}
        </p>
      )}

      {item.category && (
        <div className="mt-auto flex items-center gap-1.5 pt-1 text-xs font-medium text-muted-foreground">
          <Tag className="h-3 w-3" />
          {item.category}
        </div>
      )}
    </article>
  );
};
