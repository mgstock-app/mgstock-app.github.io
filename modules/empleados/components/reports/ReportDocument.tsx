import { ReceiptPanel } from "./ReceiptPanel";

export function ReportDocument() {
  return (
    <>
      <article
        className="papel lectura"
        id="papel"
        aria-label="Reporte del colaborador"
      >
        <header className="doc-head">
          <div>
            <div className="doc-eyebrow" id="docEyebrow">
              {"GESTLOK"}
            </div>
            <h2 className="doc-titulo" id="docTitulo">
              {"Liquidación"}
            </h2>
          </div>
          <div className="doc-periodo">
            <span className="doc-lab">{"Período"}</span>
            <span className="doc-per" id="docPeriodo">
              {"Sin completar"}
            </span>
          </div>
        </header>
        <section className="doc-sec" aria-labelledby="tDatos">
          <h3 className="doc-sec-t" id="tDatos">
            {"Datos del colaborador"}
          </h3>
          <div className="campos">
            <div className="fld full">
              <label htmlFor="fNombre">{"Nombre y apellido"}</label>
              <input
                className="val"
                id="fNombre"
                type="text"
                autoComplete="off"
              />
            </div>
            <div className="fld">
              <label htmlFor="fPuesto">{"Puesto"}</label>
              <select className="val" id="fPuesto">
                <option value="encargado">{"Encargado"}</option>
                <option value="staff">{"Staff"}</option>
              </select>
            </div>
            <div className="fld" id="fldCobra">
              <span className="flab" id="lCuenta">
                {"Cobra por"}
              </span>
              <div
                className="segmento"
                role="radiogroup"
                aria-labelledby="lCuenta"
              >
                <button
                  type="button"
                  role="radio"
                  id="bPorHoras"
                  aria-checked="true"
                >
                  {"Horas"}
                </button>
                <button
                  type="button"
                  role="radio"
                  id="bPorTurnos"
                  aria-checked="false"
                >
                  {"Turnos"}
                </button>
              </div>
            </div>
            <div className="fld" id="fldCobraStaff">
              <span className="flab">{"Cobra por"}</span>
              <span className="fija">{"Horas"}</span>
            </div>
            <div className="fld" id="fldPago">
              <span className="flab" id="lPago">
                {"Forma de pago"}
              </span>
              <div
                className="segmento"
                role="radiogroup"
                aria-labelledby="lPago"
              >
                <button
                  type="button"
                  role="radio"
                  id="bPagoTr"
                  aria-checked="true"
                >
                  {"Transferencia"}
                </button>
                <button
                  type="button"
                  role="radio"
                  id="bPagoEf"
                  aria-checked="false"
                >
                  {"Efectivo"}
                </button>
              </div>
            </div>
            <div className="fld" id="fldAlias">
              <label htmlFor="fAlias">{"Alias para transferencia"}</label>
              <div className="alias-row">
                <input
                  className="val"
                  id="fAlias"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={40}
                />
                <button
                  type="button"
                  className="btn sec chico"
                  id="bCopiarAlias"
                  hidden
                >
                  {"Copiar"}
                </button>
              </div>
            </div>
            <div className="fld">
              <label htmlFor="fTel">{"WhatsApp"}</label>
              <input
                className="val num"
                id="fTel"
                type="tel"
                inputMode="tel"
                autoComplete="off"
              />
              <p className="err-txt" id="errTel" aria-live="polite"></p>
            </div>
            <div className="fld">
              <span className="flab">
                {"Fecha "}
                <span style={{ fontWeight: "400" }}>{"(automática)"}</span>
              </span>
              <span className="fija num" id="fFecha"></span>
            </div>
            <div className="fld" id="fldMes">
              <span className="flab" id="lMes">
                {"Mes correspondiente"}
              </span>
              <div className="dos">
                <select className="val" id="fMes" aria-labelledby="lMes">
                  <option value="" id="mesVacio">
                    {"Elegir mes"}
                  </option>
                  <option>{"Enero"}</option>
                  <option>{"Febrero"}</option>
                  <option>{"Marzo"}</option>
                  <option>{"Abril"}</option>
                  <option>{"Mayo"}</option>
                  <option>{"Junio"}</option>
                  <option>{"Julio"}</option>
                  <option>{"Agosto"}</option>
                  <option>{"Septiembre"}</option>
                  <option>{"Octubre"}</option>
                  <option>{"Noviembre"}</option>
                  <option>{"Diciembre"}</option>
                </select>
                <select className="val" id="fAnio" aria-label="Año"></select>
              </div>
            </div>
            <div className="fld full" id="fldSemana">
              <span className="flab" id="lSemana">
                {"Semana correspondiente "}
                <span style={{ fontWeight: "400" }}>{"(lunes a domingo)"}</span>
              </span>
              <div className="semana-row">
                <button
                  type="button"
                  className="btn sec chico"
                  id="bSemAnt"
                  aria-label="Semana anterior"
                >
                  {"‹"}
                </button>
                <div className="selector" id="semSel">
                  <button
                    type="button"
                    className="val sel-btn num"
                    id="fSemana"
                    aria-haspopup="listbox"
                    aria-expanded="false"
                    aria-labelledby="lSemana semTxt"
                  >
                    <span id="semTxt">{"Elegir semana"}</span>
                    <span className="sel-flecha" aria-hidden="true">
                      {"▾"}
                    </span>
                  </button>
                  <ul
                    className="sel-lista"
                    id="semLista"
                    role="listbox"
                    aria-labelledby="lSemana"
                    hidden
                  ></ul>
                </div>
                <button
                  type="button"
                  className="btn sec chico"
                  id="bSemSig"
                  aria-label="Semana siguiente"
                >
                  {"›"}
                </button>
              </div>
            </div>
          </div>
        </section>
        <section className="doc-sec" aria-labelledby="tDetalle">
          <h3 className="doc-sec-t" id="tDetalle">
            {"Detalle"}
          </h3>
          <p className="doc-sec-ayuda" id="ayudaDetalle">
            {
              "Con valor unitario cargado, el importe se calcula solo (cantidad × valor). OFF y feriado usan el mismo valor que lo trabajado: se carga una sola vez. Los días ausentes se descuentan del total, salvo que los marques como justificados. Los valores quedan guardados para el próximo período."
            }
          </p>
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">{"Concepto"}</th>
                <th scope="col" className="col-cant r">
                  {"Cantidad"}
                </th>
                <th scope="col" className="col-val r">
                  {"Valor unitario"}
                </th>
                <th scope="col" className="col-imp r">
                  {"Importe"}
                </th>
              </tr>
            </thead>
            <tbody id="tCuerpo"></tbody>
            <tfoot>
              <tr>
                <th scope="row">
                  {"Total del período"}
                </th>
                <td id="tCantidadTotal" aria-label="Total de horas o turnos trabajados, OFF y feriados">{"0:00 hs"}</td>
                <td className="total-unit-empty" aria-hidden="true"></td>
                <td id="tTotal" aria-label="Importe total de la liquidación">{"$ 0,00"}</td>
              </tr>
            </tfoot>
          </table>
          <p className="err-txt" id="errTabla" aria-live="polite"></p>
        </section>
        <section className="doc-sec" aria-labelledby="tObs">
          <h3 className="doc-sec-t" id="tObs">
            <label htmlFor="fObs">{"Observaciones"}</label>
          </h3>
          <textarea
            className="val"
            id="fObs"
            rows={3}
            maxLength={600}
          ></textarea>
        </section>
        <ReceiptPanel />
      </article>
    </>
  );
}
