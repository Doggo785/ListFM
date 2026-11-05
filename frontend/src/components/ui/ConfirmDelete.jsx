import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/Modal";

export default function ConfirmDelete({ open, onClose, onConfirm, deleting, title, description }) {
  return (
    <Modal open={open} onClose={onClose} title={title} description={description}>
      <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
      <Button variant="danger" size="sm" onClick={onConfirm} disabled={deleting}>{deleting ? "Deleting" : "Delete"}</Button>
    </Modal>
  );
}
