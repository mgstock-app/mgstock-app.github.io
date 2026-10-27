import Link from "next/link";

type DocumentKind = "privacidad" | "terminos" | "almacenamiento";
const names: Record<DocumentKind, string> = {
  privacidad: "Política de privacidad",
  terminos: "Condiciones de uso",
  almacenamiento: "Cookies y almacenamiento",
};

export function LegalPage({ kind }: { kind: DocumentKind }) {
  return (
    <main style={{ maxWidth: 840, margin: "28px auto 72px", padding: "0 16px" }}>
      <article style={{ border: "1px solid #d9e0e9", background: "#fff", borderRadius: 16, padding: "clamp(20px,4vw,40px)", color: "#1c2738", lineHeight: 1.7 }}>
        <nav aria-label="Documentos legales" style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13, marginBottom: 22 }}>
          <Link href="/">Ir a Administrar a los empleados</Link><Link href="/privacidad">Privacidad</Link>
          <Link href="/terminos">Condiciones de uso</Link><Link href="/almacenamiento">Cookies y almacenamiento</Link>
        </nav>
        <h1 style={{ fontSize: 28, fontWeight: 750, lineHeight: 1.25, marginBottom: 8 }}>{names[kind]}</h1>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 26 }}>GESTLOK · Empleados · Actualizado el 25/10/2026</p>

        {kind === "privacidad" && <>
          <h2>1. Aplicación y responsables</h2>
          <p>GESTLOK · Empleados (motor de liquidaciones de ReciboNet) es una herramienta privada para la administración de empresas, horarios y reportes de liquidación. La organización que invita a cada colaborador determina el uso de su información laboral y los permisos para gestionarla. Las personas responsables de esa organización deben facilitar su identidad y un canal de contacto para consultas sobre datos personales. Quienes administran técnicamente la plataforma sólo deben acceder a los espacios expresamente autorizados.</p>
          <h2>2. Datos que tratamos</h2>
          <p>Con el inicio de sesión por Google se utilizan datos de identificación, como correo electrónico, nombre y, si corresponde, imagen de perfil e identificador de cuenta. También se gestionan empresa, sucursal, rol, permisos, invitaciones, horarios, novedades, reportes de liquidación, importes y registros de publicación o solicitudes de acceso. Los importes y reportes son información privada del ámbito laboral.</p>
          <h2>3. Finalidades</h2>
          <p>Utilizamos estos datos para autenticar usuarios, asignar funciones, organizar horarios y reportes, permitir consultas personales de plazo limitado, administrar autorizaciones, mantener respaldos y conservar trazabilidad. El tratamiento debe realizarse según una relación y fundamento legal aplicables; cuando corresponda legalmente, se requerirá consentimiento.</p>
          <h2>4. Acceso, destinatarios y servicios externos</h2>
          <p>Los usuarios sólo deben ver la información autorizada según la empresa y el rol. Para operar, GESTLOK · Empleados utiliza Supabase para autenticación y almacenamiento, Google para el inicio de sesión elegido, GitHub Pages para el alojamiento web de GESTLOK y Vercel para el acceso original de ReciboNet mientras siga activo. Estos proveedores pueden procesar datos técnicos o almacenar información en infraestructura situada fuera de Argentina, conforme a sus condiciones y las exigencias legales aplicables.</p>
          <h2>5. Sesiones y almacenamiento</h2>
          <p>Se utilizan cookies técnicas de autenticación para gestionar sesiones y mecanismos temporales del navegador para completar el ingreso y las invitaciones. No se identificaron integraciones propias de publicidad comportamental en el código revisado. Los detalles y controles se describen en <Link href="/almacenamiento">Cookies y almacenamiento</Link>.</p>
          <h2>6. Seguridad, plazos y eliminación</h2>
          <p>Existen controles de autenticación, permisos y aislamiento empresarial, con acceso restringido a reportes. Los plazos de conservación deben determinarse según las necesidades operativas y las obligaciones legales o laborales que correspondan. Una solicitud de eliminación puede estar sujeta a deberes de conservación. No se garantiza seguridad absoluta ante toda circunstancia.</p>
          <h2>7. Derechos y contactos</h2>
          <p>Podés ejercer derechos de información, acceso, rectificación, actualización y supresión conforme a la Ley argentina 25.326 ante la empresa que te dio acceso, utilizando su canal habitual de administración o recursos humanos. La organización debe informar un contacto formal y los datos del responsable. También podés consultar a la <a href="https://www.argentina.gob.ar/aaip/datospersonales/derechos" rel="noopener noreferrer">Agencia de Acceso a la Información Pública (AAIP)</a>.</p>
          <h2>8. Actualizaciones</h2>
          <p>Esta política puede actualizarse para reflejar cambios en el producto, prestadores o tratamiento de datos. Las modificaciones relevantes deberán comunicarse por los canales apropiados.</p>
        </>}

        {kind === "terminos" && <>
          <h2>1. Servicio de acceso restringido</h2>
          <p>GESTLOK · Empleados permite a empresas y colaboradores autorizados administrar horarios, reportes y solicitudes. No es una red social ni un servicio público de consulta. Los permisos son establecidos por la organización correspondiente.</p>
          <h2>2. Cuentas y confidencialidad</h2>
          <p>Usá únicamente tu propia cuenta Google, no compartas sesiones y comunicá cualquier acceso inesperado. No intentes consultar recibos, horarios o datos personales de otras personas o empresas sin permiso.</p>
          <h2>3. Responsabilidad de la empresa y validación de reportes</h2>
          <p>El dueño y las personas autorizadas deben verificar horas, importes, publicaciones y destinatarios antes de compartir información. El software es una herramienta administrativa: por sí solo no reemplaza comprobantes laborales o recibos formalmente exigibles ni certifica el pago efectivo.</p>
          <h2>4. Consulta de colaboradores y autorización</h2>
          <p>Un colaborador únicamente puede consultar su imagen de reporte autorizada mientras su acceso esté vigente. Pueden existir límites temporales y solicitudes de reapertura. El vencimiento de acceso en la aplicación no altera derechos laborales ni obligaciones legales de conservar documentación.</p>
          <h2>5. Disponibilidad y cambios</h2>
          <p>La plataforma puede sufrir interrupciones o modificaciones técnicas. La disponibilidad de una pantalla en el dispositivo no significa que una operación haya sido guardada. Verificá las confirmaciones de la aplicación antes de considerar un dato publicado.</p>
          <h2>6. Privacidad e incidentes</h2>
          <p>Consultá la <Link href="/privacidad">Política de privacidad</Link> y la explicación sobre <Link href="/almacenamiento">Cookies y almacenamiento</Link>. Ante sospecha de acceso indebido, pérdida de dispositivo o errores de destinatario, informalo inmediatamente a la administración de la empresa.</p>
          <h2>7. Normativa aplicable</h2>
          <p>Estos términos deben interpretarse conforme a la legislación argentina vigente. No limitan derechos laborales, de protección de datos ni otros derechos reconocidos legalmente.</p>
        </>}

        {kind === "almacenamiento" && <>
          <h2>1. Cookies de sesión</h2>
          <p>GESTLOK · Empleados utiliza cookies técnicas de autenticación mediante Supabase y Next.js para reconocer a usuarios con sesión iniciada y actualizar la validez de su acceso. Son necesarias para operar las áreas privadas. No se utilizan para mostrar anuncios dentro de GESTLOK.</p>
          <p>La sesión puede persistir después de cerrar una pestaña o el navegador: cerrá sesión desde la aplicación cuando termines en un dispositivo compartido. El cliente de autenticación del navegador necesita leer y renovar estas cookies; en producción se configuran para HTTPS y SameSite=Lax.</p>
          <h2>2. Almacenamiento temporal</h2>
          <p>Al iniciar sesión desde una invitación, el navegador puede usar sessionStorage para recordar temporalmente la ruta de regreso después de Google. La aplicación instalada también puede utilizar almacenamiento del navegador y caché técnica propia del sistema o del navegador.</p>
          <p>localStorage conserva preferencias de tema y referencias de navegación a la última hoja; esas preferencias pueden permanecer al salir. No se identificó almacenamiento de liquidaciones completas en esas claves. El cierre de sesión elimina las referencias temporales de invitación y retorno del navegador actual.</p>
          <h2>3. ¿Se usan cookies publicitarias?</h2>
          <p>No se identificaron herramientas propias de seguimiento publicitario o analítica comportamental en el código del proyecto revisado. Eso no impide que los servicios externos de Google, Supabase, GitHub o Vercel utilicen mecanismos técnicos sujetos a sus políticas. Si se introducen herramientas no esenciales, deben informarse y habilitarse con la elección correspondiente cuando proceda.</p>
          <h2>4. Control de la persona usuaria</h2>
          <p>Podés cerrar sesión y gestionar cookies y datos del sitio desde las opciones del navegador. Borrarlos puede requerir iniciar sesión nuevamente y eliminar información temporal no enviada. En dispositivos compartidos, cerrá sesión y protegé el acceso a tu cuenta.</p>
          <h2>5. Más información</h2>
          <p>Consultá la <Link href="/privacidad">Política de privacidad</Link> para conocer las finalidades, destinatarios, conservación y ejercicio de derechos.</p>
        </>}

        <p style={{ marginTop: 30, borderTop: "1px solid #e3e8ef", paddingTop: 18, fontSize: 12, color: "#64748b" }}>Documento de información inicial. Requiere identificar y verificar al responsable y el canal formal de contacto antes de presentarlo como versión jurídica definitiva.</p>
      </article>
    </main>
  );
}
