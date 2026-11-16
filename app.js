// ====== Configuración ======
const MODELO = "gemini-3.8-flash"; // modelo gratuito de Gemini; cámbialo si Google publica uno nuevo
const URL_API = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;
const CLAVE_STORAGE_API = "claveApiGemini";
const CLAVE_STORAGE_EQUIPO = "equipoRugby";
const CLAVE_STORAGE_HISTORIAL = "historialMensajesRugby";
const MAXIMO_HISTORIAL = 3;

// ====== Referencias al DOM ======
const $ = (id) => document.getElementById(id);
const formulario = $("formulario");
const campos = {
  claveApi: $("claveApi"),
  tipoMensaje: $("tipoMensaje"),
  remitente: $("remitente"),
  equipo: $("equipo"),
  rival: $("rival"),
  resultados: $("resultados"),
  lesionados: $("lesionados"),
  animo: $("animo"),
  tono: $("tono"),
  pautas: $("pautas"),
  formato: $("formato"),
};
const botonGenerar = $("botonGenerar");
const botonCopiar = $("botonCopiar");
const botonRegenerar = $("botonRegenerar");
const mensajeError = $("mensajeError");
const indicadorCarga = $("cargando");
const seccionResultado = $("resultado");
const textoResultado = $("textoResultado");
const seccionHistorial = $("seccionHistorial");
const listaHistorial = $("listaHistorial");

// ====== Almacenamiento seguro (funciona al abrir el archivo directo, sin servidor) ======
function leerAlmacen(clave) {
  try { return localStorage.getItem(clave); } catch { return null; }
}
function guardarAlmacen(clave, valor) {
  try { localStorage.setItem(clave, valor); } catch { /* si el navegador lo bloquea, la app sigue funcionando */ }
}

// ====== Copiar al portapapeles (con respaldo para páginas locales) ======
async function copiarTexto(texto) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(texto);
    return;
  }
  // Respaldo: textarea temporal + execCommand, para cuando se abre con file://
  const temporal = document.createElement("textarea");
  temporal.value = texto;
  temporal.style.position = "fixed";
  temporal.style.opacity = "0";
  document.body.append(temporal);
  temporal.select();
  const copiado = document.execCommand("copy");
  temporal.remove();
  if (!copiado) throw new Error("No se pudo copiar");
}

// ====== Utilidades de interfaz ======
function mostrarError(texto) {
  mensajeError.textContent = texto;
  mensajeError.hidden = false;
}

function mostrarResultado(texto) {
  textoResultado.textContent = texto;
  seccionResultado.hidden = false;
  botonCopiar.textContent = "Copiar texto";
}

function leerDatos() {
  const datos = {};
  for (const [nombre, campo] of Object.entries(campos)) datos[nombre] = campo.value.trim();
  return datos;
}

// ====== Construcción del prompt dinámico ======
function construirPrompt(d) {
  // Solo se incluyen las líneas de contexto que el usuario rellenó
  const contexto = [
    d.rival && `Próximo rival o rival del partido: ${d.rival}.`,
    d.resultados && `Resultados anteriores: ${d.resultados}.`,
    d.lesionados && `Jugadores lesionados o de baja: ${d.lesionados}.`,
    `Estado de ánimo del equipo: ${d.animo}.`,
    d.pautas && `Pautas adicionales del usuario: ${d.pautas}.`,
  ].filter(Boolean).join("\n");

  return (
    `Eres un asistente experto en comunicación deportiva y conoces bien el rugby union ` +
    `(scrum, ruck, maul, line-out, tackle, delanteros y tres cuartos, el tercer tiempo).\n\n` +
    `Escribe en español ${d.formato}. Es ${d.tipoMensaje}, enviado por ${d.remitente} del equipo ${d.equipo}.\n` +
    `Tono: ${d.tono}.\n\n` +
    `Contexto:\n${contexto}\n\n` +
    `Reglas:\n` +
    `- Usa únicamente los datos del contexto; no inventes resultados, nombres ni cifras.\n` +
    `- Si hay lesionados, menciónalos con respeto y sin dar detalles médicos innecesarios.\n` +
    `- Ajusta el mensaje al estado de ánimo: ni exceso de euforia tras una derrota, ni tibieza si el equipo está tenso.\n` +
    `- Pon el foco en valores del rugby (sacrificio, apoyo mutuo, respeto), sin culpar a jugadores concretos.\n` +
    `- Devuelve solo el mensaje listo para enviar, sin explicaciones, títulos ni comillas.`
  );
}

// ====== Petición a la API de Gemini ======
async function pedirMensajeAGemini(prompt, claveApi) {
  // POST con fetch; la clave viaja en el encabezado x-goog-api-key
  const respuesta = await fetch(URL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": claveApi },
    // Estructura que espera Gemini: contents -> parts -> text
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9 }, // algo de creatividad para variar cada versión
    }),
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.json().catch(() => ({}));
    throw new Error(detalle?.error?.message || `Error ${respuesta.status} del servidor`);
  }

  const datos = await respuesta.json();
  // El texto generado está en candidates[0].content.parts[0].text
  const texto = datos?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!texto) throw new Error("La IA no devolvió ningún texto. Prueba de nuevo.");
  return texto.trim();
}

// ====== Historial (localStorage) ======
function leerHistorial() {
  try {
    return JSON.parse(leerAlmacen(CLAVE_STORAGE_HISTORIAL)) || [];
  } catch {
    return [];
  }
}

function guardarEnHistorial(entrada) {
  const historial = [entrada, ...leerHistorial()].slice(0, MAXIMO_HISTORIAL);
  guardarAlmacen(CLAVE_STORAGE_HISTORIAL, JSON.stringify(historial));
  pintarHistorial();
}

function pintarHistorial() {
  const historial = leerHistorial();
  seccionHistorial.hidden = historial.length === 0;
  listaHistorial.innerHTML = "";

  historial.forEach((entrada) => {
    const elemento = document.createElement("li");

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${entrada.equipo} · ${entrada.tipo}`;

    const vista = document.createElement("p");
    vista.className = "vista";
    vista.textContent = entrada.mensaje;

    const botonVer = document.createElement("button");
    botonVer.type = "button";
    botonVer.className = "secundario";
    botonVer.textContent = "Ver de nuevo";
    botonVer.addEventListener("click", () => mostrarResultado(entrada.mensaje));

    elemento.append(meta, vista, botonVer);
    listaHistorial.append(elemento);
  });
}

// ====== Flujo principal ======
async function generarMensaje() {
  mensajeError.hidden = true;
  const datos = leerDatos();

  // Validaciones de campos vacíos
  if (!datos.claveApi) return mostrarError("Pega tu API Key de Gemini para continuar.");
  if (!datos.equipo) return mostrarError("Escribe el nombre de tu equipo.");

  guardarAlmacen(CLAVE_STORAGE_API, datos.claveApi);
  guardarAlmacen(CLAVE_STORAGE_EQUIPO, datos.equipo);

  // Estado de carga
  botonGenerar.disabled = botonRegenerar.disabled = true;
  seccionResultado.hidden = true;
  indicadorCarga.hidden = false;

  try {
    const mensaje = await pedirMensajeAGemini(construirPrompt(datos), datos.claveApi);
    mostrarResultado(mensaje);
    guardarEnHistorial({
      equipo: datos.equipo,
      tipo: campos.tipoMensaje.selectedOptions[0].textContent,
      mensaje,
    });
  } catch (error) {
    // Cubre fallos de red (TypeError de fetch) y errores devueltos por la API
    mostrarError(
      error instanceof TypeError
        ? "No se pudo conectar. Revisa tu internet e inténtalo de nuevo."
        : `No se pudo generar el mensaje: ${error.message}`
    );
  } finally {
    indicadorCarga.hidden = true;
    botonGenerar.disabled = botonRegenerar.disabled = false;
  }
}

// ====== Eventos ======
formulario.addEventListener("submit", (evento) => {
  evento.preventDefault();
  generarMensaje();
});

botonRegenerar.addEventListener("click", generarMensaje);

botonCopiar.addEventListener("click", async () => {
  try {
    await copiarTexto(textoResultado.textContent);
    botonCopiar.textContent = "¡Copiado!";
  } catch {
    mostrarError("No se pudo copiar. Selecciona el texto y cópialo manualmente.");
  }
});

// ====== Inicio ======
campos.claveApi.value = leerAlmacen(CLAVE_STORAGE_API) || "";
campos.equipo.value = leerAlmacen(CLAVE_STORAGE_EQUIPO) || "";
pintarHistorial();
