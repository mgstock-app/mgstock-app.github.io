export function CollaboratorStatus() {
  return (
    <>
      <div className="panel" id="panelActivo">
        <h3>{"Estado del colaborador"}</h3>
        <div
          className="est-seg"
          role="radiogroup"
          aria-label="Estado del colaborador"
        >
          <button type="button" role="radio" id="bActivo" aria-checked="true">
            <i className="dot activo" aria-hidden="true"></i>
            {"Activo"}
          </button>
          <button
            type="button"
            role="radio"
            id="bRefuerzo"
            aria-checked="false"
          >
            <i className="dot refuerzo" aria-hidden="true"></i>
            {"Refuerzo"}
          </button>
          <button
            type="button"
            role="radio"
            id="bDescanso"
            aria-checked="false"
          >
            <i className="dot descanso" aria-hidden="true"></i>
            {"En descanso"}
          </button>
          <button
            type="button"
            role="radio"
            id="bInactivo"
            aria-checked="false"
          >
            <i className="dot inactivo" aria-hidden="true"></i>
            {"Inactivo"}
          </button>
        </div>
        <p className="hint" id="dActivo"></p>
      </div>
    </>
  );
}
