import logoUrl from "@/assets/oryz-logo.png";
import { cn } from "@/lib/utils";

/**
 * The Oryz brand mark: an angular oryx head whose horns double as the
 * ascenders of an "O". Rendered as an image so the gradient stays identical
 * in both themes; the surrounding tile carries the theming.
 */
export function OryzMark({
  className,
  imageClassName,
}: {
  className?: string;
  imageClassName?: string;
}) {
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-lg border border-border/60 bg-card/80 shadow-sm",
        className,
      )}
    >
      <img
        src={logoUrl}
        alt="Oryz"
        width={1024}
        height={1024}
        className={cn("size-[88%] object-contain", imageClassName)}
      />
    </div>
  );
}
