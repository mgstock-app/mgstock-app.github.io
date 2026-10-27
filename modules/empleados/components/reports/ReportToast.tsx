export function ReportToast() {
  return (
    <>
      <div className="toast" id="toast" role="status" aria-live="polite" hidden>
        <span className="ico" aria-hidden="true">
          {"✓"}
        </span>
        <span id="toastTxt"></span>
      </div>
    </>
  );
}
