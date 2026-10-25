export function BackupPanel() {
  return (
    <>
      <section
        className="tarjeta respaldo"
        id="cardCopia"
        aria-labelledby="hCopia"
      >
        <div className="resp-ico" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"></path>
            <path d="M12 8v6"></path>
            <path d="M9.5 11.5L12 14l2.5-2.5"></path>
          </svg>
        </div>
        <div className="resp-txt">
          <h2 id="hCopia">{"Copia de seguridad"}</h2>
          <p>
            {
              "Todos los días, al abrir la planilla, se guarda sola una copia completa en la nube: hojas, valores unitarios, WhatsApp, alias, firmas e historial. También antes de cada cierre o restauración. Si algo queda mal cargado o configurado, volvés a cualquiera de las últimas 12 desde “Copias en la nube”."
            }
          </p>
          <p>
            {
              "Además podés descargar un archivo para guardarlo fuera de la aplicación (Google Drive o tu mail)."
            }
          </p>
          <div className="resp-estados">
            <p className="resp-ult" id="nubeUlt"></p>
            <p className="resp-ult" id="copiaUlt"></p>
          </div>
        </div>
        <div className="resp-acc">
          <button className="btn prim" id="bNube" type="button">
            {"Copias en la nube"}
          </button>
          <button className="btn sec" id="bCopia" type="button">
            {"Descargar archivo"}
          </button>
          <button className="btn sec" id="bRestaurar" type="button">
            {"Restaurar desde archivo"}
          </button>
          <input
            type="file"
            id="fRestaurar"
            accept=".json,application/json"
            hidden
          />
        </div>
      </section>
    </>
  );
}
