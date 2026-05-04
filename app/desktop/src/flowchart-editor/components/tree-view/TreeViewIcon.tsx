type TreeViewIconProps = {
  kind: "directory-collapsed" | "directory-expanded" | "flowchart-file" | "node-definition" | "empty";
  className?: string;
};

export function TreeViewIcon({ kind, className }: TreeViewIconProps) {
  const cls = `tree-view-icon ${className ?? ""}`;
  switch (kind) {
    case "directory-collapsed":
      return (
        <span className={cls}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 4.5a1 1 0 011-1h3.5l1.5 1.5H13a1 1 0 011 1V11a1 1 0 01-1 1H3a1 1 0 01-1-1V4.5z" fill="#7cb342" stroke="#558b2f" strokeWidth="0.8"/>
          </svg>
        </span>
      );
    case "directory-expanded":
      return (
        <span className={cls}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 5a1 1 0 011-1h3.5l1.5 1.5H13a1 1 0 011 1V11a1 1 0 01-1 1H3a1 1 0 01-1-1V5z" fill="#8bc34a" stroke="#7cb342" strokeWidth="0.8"/>
          </svg>
        </span>
      );
    case "flowchart-file":
      return (
        <span className={cls}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 2h6l4 4v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" fill="#2b5797" stroke="#1a3a6b" strokeWidth="0.8"/>
            <path d="M9 2v4h4" fill="none" stroke="#1a3a6b" strokeWidth="0.8"/>
            <circle cx="8" cy="10" r="1.5" fill="#7ec9ff"/>
          </svg>
        </span>
      );
    case "node-definition":
      return (
        <span className={cls}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="2" width="12" height="12" rx="2" fill="#3e2723" stroke="#6d4c41" strokeWidth="0.8"/>
            <circle cx="8" cy="8" r="2.5" fill="#f0b35b"/>
          </svg>
        </span>
      );
    case "empty":
      return <span className={cls} />;
  }
}
