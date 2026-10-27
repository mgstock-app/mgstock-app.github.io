import { CollaboratorStatus } from "./CollaboratorStatus";
import { CashPaymentPanel } from "./CashPaymentPanel";
import { ShareReportPanel } from "./ShareReportPanel";
import { NotesPanel } from "./NotesPanel";
import { PeriodActions } from "./PeriodActions";
import { SheetActions } from "./SheetActions";
import { ReportDocument } from "./ReportDocument";
import Link from "next/link";

export function LocalScreen({ scheduleInFolderOnly = false }: { scheduleInFolderOnly?: boolean } = {}) {
  return (
    <>
      <section id="vLocal" className="pantalla" hidden>
        <div>
          <nav className="migas" aria-label="Ubicación">
            <button type="button" id="bInicio">
              {"Inicio"}
            </button>
            <span aria-hidden="true">{"/"}</span>
            <span id="migaLocal"></span>
          </nav>
          <div className="local-head" style={{ marginTop: "6px" }}>
            <div className="local-tit">
              <h1 id="localNombre">Local</h1>
              <span className="badge" id="localCiclo"></span>
            </div>
            <dl className="metricas">
              <div>
                <dt>{"Enviados"}</dt>
                <dd id="mEnviados">{"0 de 0"}</dd>
              </div>
              <div>
                <dt>{"Pendientes"}</dt>
                <dd id="mPendientes">{"0"}</dd>
              </div>
            </dl>
          </div>
        </div>
        {scheduleInFolderOnly && <Link className="alessandro-folder-link" href="/horarios">Ir a la carpeta Horarios →</Link>}
        <div
          className="carpetas"
          role="tablist"
          aria-label="Secciones del local"
        >
          <button className="carpeta" type="button" role="tab" id="cRes">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect
                x="4"
                y="4"
                width="16"
                height="16"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.7"
              ></rect>
              <path
                d="M8 9h8M8 13h8M8 17h5"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              ></path>
            </svg>
            {"\n        Resumen\n      "}
          </button>
          <button className="carpeta" type="button" role="tab" id="cEnc">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
                stroke="currentColor"
                strokeWidth="1.7"
              ></path>
            </svg>
            {"\n        Encargados "}
            <span className="cuenta" id="nEnc">
              {"0"}
            </span>
          </button>
          <button className="carpeta" type="button" role="tab" id="cStaff">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
                stroke="currentColor"
                strokeWidth="1.7"
              ></path>
            </svg>
            {"\n        Staff "}
            <span className="cuenta" id="nStaff">
              {"0"}
            </span>
          </button>
        </div>
        <div id="vResumen" className="tarjeta" hidden>
          <div className="tarjeta-head">
            <div>
              <h2>{"Resumen del período"}</h2>
              <p>{"Tocá una fila para abrir la hoja."}</p>
            </div>
            <div className="acciones">
              <button className="btn wa chico" id="bPendientes" type="button">
                {"Enviar pendientes"}
              </button>
              <button className="btn sec chico" id="bCerrar" type="button">
                {"Cerrar mes"}
              </button>
            </div>
          </div>
          <div className="res-wrap">
            <table className="res">
              <thead>
                <tr>
                  <th>{"Colaborador"}</th>
                  <th>{"WhatsApp"}</th>
                  <th>{"Pago"}</th>
                  <th>{"Puesto"}</th>
                  <th>{"Período"}</th>
                  <th className="r">{"Total"}</th>
                  <th>{"Estado"}</th>
                  <th>{"Último envío"}</th>
                </tr>
              </thead>
              <tbody id="resCuerpo"></tbody>
            </table>
          </div>
          <div className="res-pie">
            <div className="leyenda">
              <span>
                <i className="dot enviada"></i>
                {"Enviado o recibo listo"}
              </span>
              <span>
                <i className="dot cargada"></i>
                {"Pendiente de envío o de firma"}
              </span>
              <span>
                <i className="dot"></i>
                {"Sin cargar"}
              </span>
            </div>
          </div>
        </div>
        <div id="vCategoria" className="pantalla" hidden>
          <div
            className="personas"
            id="personas"
            role="tablist"
            aria-label="Personas"
          ></div>
          <div id="vVacio" className="aviso" hidden>
            <h2 id="tVacio">{"Carpeta vacía"}</h2>
            <p>
              {
                "Creá una hoja para cada persona y escribile el nombre que quieras."
              }
            </p>
            <button className="btn prim" id="bPrimera" type="button">
              {"+ Nueva hoja"}
            </button>
          </div>
          <div id="vHoja" className="pantalla" hidden>
            <div className="barra">
              <div className="barra-info">
                <span className="pill" id="pillModo">
                  {"Guardado"}
                </span>
                <span className="chip" id="chipEstado">
                  {"Sin cargar"}
                </span>
                <span className="barra-txt" id="barraTxt"></span>
              </div>
              <div className="barra-acc">
                <button className="btn prim" id="bModificar" type="button">
                  {"Modificar"}
                </button>
                <button className="btn sec" id="bCancelar" type="button" hidden>
                  {"Cancelar"}
                </button>
                <button className="btn prim" id="bGuardar" type="button" hidden>
                  {"Guardar"}
                </button>
              </div>
            </div>
            <div className="grid">
              <ReportDocument />
              <aside className="lado">
                <CollaboratorStatus />
                <CashPaymentPanel />
                <ShareReportPanel />
                <NotesPanel />
                <PeriodActions />
                <SheetActions />
              </aside>
            </div>
            <section className="tarjeta" aria-labelledby="hHist">
              <div className="tarjeta-head">
                <div>
                  <h2 id="hHist">{"Historial de reportes"}</h2>
                  <p>
                    {
                      "Se guarda solo cada vez que confirmás un reporte para WhatsApp o para descargar el recibo. Al cerrar el período también se guardan las hojas que no se habían enviado."
                    }
                  </p>
                </div>
              </div>
              <div className="hist-wrap" id="histWrap">
                <table className="hist">
                  <thead>
                    <tr>
                      <th className="izq" aria-label="Ver reporte"></th>
                      <th className="izq">{"Registrado"}</th>
                      <th className="izq">{"Período"}</th>
                      <th>{"Trabajado"}</th>
                      <th>{"$ Trabajado"}</th>
                      <th>{"OFF"}</th>
                      <th>{"$ OFF"}</th>
                      <th>{"Feriado"}</th>
                      <th>{"$ Feriado"}</th>
                      <th>{"Ausentes"}</th>
                      <th>{"$ Ausentes"}</th>
                      <th>{"$ Vacaciones"}</th>
                      <th>{"$ Aguinaldo"}</th>
                      <th>{"Total"}</th>
                      <th className="izq">{"Origen"}</th>
                    </tr>
                  </thead>
                  <tbody id="hCuerpo"></tbody>
                </table>
              </div>
              <p className="hist-vacio" id="hVacio">
                {"Todavía no hay registros para esta hoja."}
              </p>
            </section>
          </div>
        </div>
      </section>
    </>
  );
}
