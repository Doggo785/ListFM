/** Delayed by CSS so a fast load shows nothing: the ribbon alone carries the page change. */
export default function Loader() {
  return (
    <p className="loader" role="status" data-quiet data-loader>
      Loading
    </p>
  );
}
