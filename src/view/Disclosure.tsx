import { useState, type ReactNode } from "react";

export function Disclosure({
  className,
  show,
  hide,
  controls,
  children,
}: {
  className?: string;
  show: string;
  hide: string;
  controls: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className={className ? `disclosure ${className}` : "disclosure"}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary aria-expanded={open} aria-controls={controls}>
        <span className="chevron" aria-hidden="true" />
        {open ? hide : show}
      </summary>
      <div id={controls}>{children}</div>
    </details>
  );
}
