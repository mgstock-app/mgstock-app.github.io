import { LocationsScreen } from "./LocationsScreen";
import { brand } from "@/utils/brand";
import { LocalScreen } from "./LocalScreen";
import { ReportDialog } from "./ReportDialog";
import { ReportToast } from "./ReportToast";

export function ReportMarkup({ scheduleInFolderOnly = false }: { scheduleInFolderOnly?: boolean } = {}) {
  return (
    <>
      <div className="app">
        <header className="appbar">
          <div className="marca">
            <span className="logo" aria-hidden="true">
              {brand.initials}
            </span>
            <div>
              <div className="app-nombre">{brand.name}</div>
              <div className="app-sub">{"Locales y colaboradores"}</div>
            </div>
          </div>
          <div className="appbar-der">
            <span className="estado" id="estado" aria-live="polite"></span>
            <button
              className="btn prim chico"
              id="bGuardarNube"
              type="button"
              hidden
              aria-label="Guardar todo en la nube"
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M17.5 19H7a5 5 0 1 1 1-9.9A6 6 0 0 1 19.4 11 4 4 0 0 1 17.5 19z"></path>
                <path d="M12 16v-5"></path>
                <path d="M9.5 13.5L12 11l2.5 2.5"></path>
              </svg>
              <span className="txt-largo" id="bGNLargo">
                {"Guardar en la nube"}
              </span>
              <span className="txt-corto" id="bGNCorto">
                {"Guardar"}
              </span>
            </button>
            <button className="btn sec chico" id="bNota" type="button" hidden>
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              {"Dejar una nota"}
            </button>
            <button className="btn sec chico" id="bTono" type="button">
              <span className="muestra" aria-hidden="true"></span>
              {"Tono"}
            </button>
          </div>
        </header>
        <section id="vCargando" className="cargando">
          {"Cargando la planilla…"}
        </section>
        <section id="vSinAcceso" className="aviso" hidden>
          <h2>{"Esta planilla es privada"}</h2>
          <p id="txtSinAcceso">
            {
              "Solo el dueño y quienes tienen permiso de edición pueden ver y cargar los reportes."
            }
          </p>
        </section>
        <LocationsScreen />
        <LocalScreen scheduleInFolderOnly={scheduleInFolderOnly} />
      </div>
      <ReportDialog />
      <ReportToast />
    </>
  );
}
