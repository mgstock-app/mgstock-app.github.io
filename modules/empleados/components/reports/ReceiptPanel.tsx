export function ReceiptPanel() {
  return (
    <>
      <section
        className="doc-sec"
        id="secRecibo"
        aria-labelledby="tRecibo"
        hidden
      >
        <h3 className="doc-sec-t" id="tRecibo">
          {"Recibo de pago en efectivo"}
        </h3>
        <p className="recibo-txt" id="reciboTxt"></p>
        <div className="firma-box" id="firmaBox">
          <canvas
            id="firmaCanvas"
            aria-label="Espacio para la firma del colaborador"
          ></canvas>
          <img id="firmaImg" alt="Firma del colaborador" hidden />
          <span className="firma-ph">{"Firma del colaborador"}</span>
        </div>
        <div className="firma-pie">
          <span id="firmaAcl"></span>
          <span id="firmaFecha"></span>
        </div>
        <p className="alerta" id="firmaAviso" hidden></p>
        <p className="firma-ayuda" id="firmaAyuda"></p>
        <div className="firma-acc">
          <button type="button" className="btn sec chico" id="bFirmaBorrar">
            {"Borrar"}
          </button>
          <button type="button" className="btn prim chico" id="bFirmaGuardar">
            {"Guardar firma"}
          </button>
          <button
            type="button"
            className="btn sec chico"
            id="bFirmaRehacer"
            hidden
          >
            {"Firmar de nuevo"}
          </button>
        </div>
      </section>
    </>
  );
}
