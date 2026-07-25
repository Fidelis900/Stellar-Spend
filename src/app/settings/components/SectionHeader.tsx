interface SectionHeaderProps {
  title: string;
  description: string;
}

/** Consistent title + subtitle header shared by every settings section. */
export function SectionHeader({ title, description }: SectionHeaderProps) {
  return (
    <header>
      <h2 className="text-lg font-bold text-white uppercase tracking-wider mb-1">{title}</h2>
      <p className="text-xs text-[#555] uppercase tracking-widest">{description}</p>
    </header>
  );
}
