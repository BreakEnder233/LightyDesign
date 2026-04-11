import { useRef } from "react";

interface DialogBackdropProps {
  className: string;
  onClose: () => void;
  closeOnBackdropClick?: boolean;
  children: React.ReactNode;
}

export function DialogBackdrop({ className, onClose, closeOnBackdropClick = false, children }: DialogBackdropProps) {
  const mouseDownOnSelfRef = useRef(false);

  return (
    <div
      className={className}
      onMouseDown={(event) => {
        mouseDownOnSelfRef.current = closeOnBackdropClick && event.target === event.currentTarget;
      }}
      onClick={() => {
        if (mouseDownOnSelfRef.current) {
          mouseDownOnSelfRef.current = false;
          onClose();
        }
      }}
      role="presentation"
    >
      {children}
    </div>
  );
}
