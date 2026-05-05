type TreeViewIconProps = {
  kind: "directory-collapsed" | "directory-expanded" | "flowchart-file" | "node-definition-event" | "node-definition-flow" | "node-definition-compute" | "empty";
  className?: string;
};

export function TreeViewIcon({ kind, className }: TreeViewIconProps) {
  const cls = ["tree-view-icon", className].filter(Boolean).join(" ");
  switch (kind) {
    case "directory-collapsed":
      return (
        <span className={cls}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 5.5a1 1 0 011-1h4l1.5 1.5h6.5a1 1 0 011 1V13a1 1 0 01-1 1H3a1 1 0 01-1-1V5.5z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
          </svg>
        </span>
      );
    case "directory-expanded":
      return (
        <span className={cls}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 6a1 1 0 011-1h4l1.5 1.5h6.5a1 1 0 011 1V13a1 1 0 01-1 1H3a1 1 0 01-1-1V6z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            <path d="M2 10h14" stroke="currentColor" strokeWidth="1.2" fill="none"/>
          </svg>
        </span>
      );
    case "flowchart-file":
      return (
        <span className={cls}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M4 2h7l3 3v11a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            <path d="M11 2v4h4" stroke="currentColor" strokeWidth="1.2" fill="none"/>
          </svg>
        </span>
      );
    case "node-definition-event":
      return (
        <span className={cls}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="1" y="1" width="16" height="16" rx="3" stroke="#4fc1ff" strokeWidth="1.2" fill="none"/>
            <text x="9" y="13" textAnchor="middle" fill="#4fc1ff" fontSize="11" fontWeight="600" fontFamily="inherit">E</text>
          </svg>
        </span>
      );
    case "node-definition-flow":
      return (
        <span className={cls}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="1" y="1" width="16" height="16" rx="3" stroke="#72d08d" strokeWidth="1.2" fill="none"/>
            <text x="9" y="13" textAnchor="middle" fill="#72d08d" fontSize="11" fontWeight="600" fontFamily="inherit">F</text>
          </svg>
        </span>
      );
    case "node-definition-compute":
      return (
        <span className={cls}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="1" y="1" width="16" height="16" rx="3" stroke="#f0b35b" strokeWidth="1.2" fill="none"/>
            <text x="9" y="13" textAnchor="middle" fill="#f0b35b" fontSize="11" fontWeight="600" fontFamily="inherit">C</text>
          </svg>
        </span>
      );
    case "empty":
      return <span className={cls} />;
    default:
      return null;
  }
}
