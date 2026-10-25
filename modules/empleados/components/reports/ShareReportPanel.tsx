export function ShareReportPanel() {
  return (
    <>
      <div className="panel" id="panelWa">
        <h3>{"Enviar al colaborador"}</h3>
        <button className="btn wa" id="bExportar" type="button">
          {"Enviar reporte por WhatsApp"}
        </button>
        <dl className="dato">
          <dt>{"WhatsApp"}</dt>
          <dd id="dContacto">{"Sin cargar"}</dd>
          <dt>{"Último envío"}</dt>
          <dd id="dUltima">{"Nunca"}</dd>
        </dl>
        <button className="link" id="bOlvidar" type="button" hidden>
          {"Borrar número guardado"}
        </button>
      </div>
    </>
  );
}
