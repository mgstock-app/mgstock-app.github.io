export function NotesPanel() {
  return (
    <>
      <div className="panel" id="panelNota" hidden>
        <h3>{"Notas para la dueña"}</h3>
        <p className="hint">
          {
            "¿Querés un cambio en cómo funciona o se ve la planilla? Dejá una nota: la dueña la lee y decide si lo hace y cómo."
          }
        </p>
        <button className="btn sec" id="bNotaHoja" type="button">
          {"Dejar una nota"}
        </button>
      </div>
    </>
  );
}
