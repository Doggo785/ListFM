import { useState } from "react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/Modal";

/** The Delete button and the question it asks. A failed delete closes the question, so the page's message shows. */
export default function DeleteAction({ title, description, onDelete, onFailed }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const confirm = async () => {
    setDeleting(true);
    try {
      await onDelete();
    } catch (err) {
      onFailed(err);
      setConfirming(false);
      setDeleting(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setConfirming(true)}>Delete</Button>
      <Modal open={confirming} onClose={() => setConfirming(false)} title={title} description={description}>
        <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
        <Button variant="danger" size="sm" onClick={confirm} disabled={deleting}>{deleting ? "Deleting" : "Delete"}</Button>
      </Modal>
    </>
  );
}
