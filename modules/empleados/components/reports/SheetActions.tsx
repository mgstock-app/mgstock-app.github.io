export function SheetActions() {
  return (
    <>
      <div className="panel" id="panelHoja">
        <h3>{"Hoja"}</h3>
        <button className="btn sec" id="bRenombrar" type="button">
          {"Renombrar hoja"}
        </button>
        <button className="btn sec peligro" id="bEliminar" type="button">
          {"Eliminar hoja"}
        </button>
      </div>
    </>
  );
}
