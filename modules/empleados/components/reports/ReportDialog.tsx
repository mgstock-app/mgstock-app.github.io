export function ReportDialog() {
  return (
    <>
      <div className="overlay" id="overlay" hidden>
        <div
          className="modal"
          id="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mTitulo"
        ></div>
      </div>
    </>
  );
}
