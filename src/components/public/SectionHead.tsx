export function SectionHead({
  eyebrow,
  title,
  sub,
  center,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  center?: boolean;
}) {
  return (
    <div className={"pr-shead" + (center ? " pr-shead-center" : "")}>
      {eyebrow && <span className="pr-eyebrow">{eyebrow}</span>}
      <h2 className="pr-stitle">{title}</h2>
      {sub && <p className="pr-ssub">{sub}</p>}
    </div>
  );
}
