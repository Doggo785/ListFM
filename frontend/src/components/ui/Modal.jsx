import { useRef } from "react";
import { Dialog } from "radix-ui";

/** A dialog that traps focus, closes on Escape and gives focus back when it closes. */
export default function Modal({ open, onClose, title, description, body, children }) {
  const opener = useRef(null);
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-(--ink)/80" />
        <Dialog.Content
          // Radix only gives focus back to its own Dialog.Trigger, which this modal does not use.
          onOpenAutoFocus={() => {
            opener.current = document.activeElement;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
          className="page-enter fixed top-1/2 left-1/2 z-50 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 border-2 border-(--ember) bg-(--ground) p-6 text-(--text)">
          <Dialog.Title className="mb-3 text-lg">{title}</Dialog.Title>
          <Dialog.Description className="mb-6 text-(--text-muted)">{description}</Dialog.Description>
          {body}
          <div className="flex justify-end gap-2">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
