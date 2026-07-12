import { Star } from "lucide-react";

export function Stars({ n = 5, size = 15 }: { n?: number; size?: number }) {
  return (
    <span className="pr-stars" style={{ fontSize: size }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star
          key={i}
          size={size}
          className={"pr-ico " + (i < Math.round(n) ? "pr-star-on" : "pr-star-off")}
        />
      ))}
    </span>
  );
}
