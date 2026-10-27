export function CashPaymentPanel() {
  return (
    <>
      <div className="panel" id="panelEfe" hidden>
        <h3>{"Pago en efectivo"}</h3>
        <button className="btn prim" id="bRecibo" type="button">
          {"Descargar recibo para imprimir"}
        </button>
        <dl className="dato">
          <dt>{"Firma"}</dt>
          <dd id="dFirma">{"Pendiente"}</dd>
          <dt>{"Último recibo"}</dt>
          <dd id="dRecibo">{"Nunca"}</dd>
        </dl>
        <button className="link" id="bIrFirma" type="button">
          {"Ir al espacio de firma"}
        </button>
      </div>
    </>
  );
}
