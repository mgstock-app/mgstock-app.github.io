import { BackupPanel } from "./BackupPanel";

export function LocationsScreen() {
  return (
    <>
      <section id="vInicio" className="pantalla" hidden>
        <div>
          <h1>{"Locales"}</h1>
          <p className="lead">
            {
              "Elegí un local para cargar, revisar y enviar los reportes de encargados y staff."
            }
          </p>
        </div>
        <div className="locales" id="locales"></div>
        <BackupPanel />
      </section>
    </>
  );
}
