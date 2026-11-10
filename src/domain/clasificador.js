/**
 * Clasificador determinista del Centro Familiar (sin IA).
 *
 * Convierte texto libre ("350 almuerzo efectivo", "examen de mate de Ana el jueves",
 * "llamar al plomero mañana a las 10") y texto OCR de tickets o capturas de Banca Remota
 * en registros de gasto, tarea o deber. Solo reglas: regex, diccionarios y reglas aprendidas.
 *
 * Módulo puro (sin DOM ni red). Tipos en clasificador.d.ts.
 */

/* ------------------------------------------------------------------ *
 * Diccionarios (claves normalizadas: minúsculas y sin acentos)
 * ------------------------------------------------------------------ */
const CATEGORIAS = {
  "Alimentación": ["pan", "leche", "huevo", "huevos", "pollo", "carne", "cerdo", "arroz", "frijol", "frijoles", "azucar", "aceite", "cafe", "comida", "almuerzo", "desayuno", "cena", "merienda", "agro", "agromercado", "mercado", "mipyme", "bodega", "vianda", "viandas", "platano", "platanos", "tomate", "pizza", "refresco", "refrescos", "jugo", "yogurt", "queso", "jamon", "picadillo", "salchicha", "salchichas", "pescado", "galletas", "malanga", "boniato", "yuca", "harina", "sal", "condimentos", "restaurante", "paladar", "cafeteria", "spaguetti", "espagueti", "pasta", "frutas", "fruta", "mango", "guayaba", "pina", "aguacate", "cebolla", "ajo", "papa", "papas", "mantequilla", "mayonesa", "salsa", "embutidos", "perro caliente", "hamburguesa", "pan con", "malta", "maltas", "sandwich", "sandwiches", "bocadito", "bocaditos", "atun", "croqueta", "croquetas", "batido", "batidos", "ensalada", "domicilio"],
  "Transporte": ["taxi", "guagua", "almendron", "bicitaxi", "triciclo", "gasolina", "combustible", "petroleo", "diesel", "pasaje", "pasajes", "transporte", "moto", "ponche", "mecanico", "cupet", "parqueo", "uber", "omnibus", "viazul"],
  "Hogar": ["limpieza", "detergente", "jabon", "cloro", "suavizante", "colchon", "mueble", "muebles", "ventilador", "bombillo", "ferreteria", "pintura", "reparacion", "plomero", "albanil", "utensilios", "alquiler", "renta", "fregona", "escoba", "papel sanitario", "papel higienico", "cubo", "toallas", "sabanas", "olla", "electrodomestico", "batidora", "lavadora", "nevera", "refrigerador"],
  "Servicios": ["luz", "electricidad", "corriente", "union electrica", "agua", "gas", "telefono", "etecsa", "recarga", "recargas", "internet", "datos", "nauta", "cable", "factura", "une", "saldo movil", "plan de datos", "netflix", "spotify", "streaming", "hosting", "dominio", "suscripcion"],
  "Salud": ["farmacia", "medicina", "medicinas", "medicamento", "medicamentos", "pastillas", "doctor", "medico", "consulta", "dentista", "analisis", "vitaminas", "hospital", "policlinico", "clinica", "jarabe", "antibiotico", "optica", "espejuelos", "lentes"],
  "Educación": ["escuela", "libreta", "libretas", "libro", "libros", "lapiz", "lapices", "cuaderno", "cuadernos", "mochila", "repaso", "repasador", "maestro", "maestra", "profesor", "profesora", "clases", "curso", "matricula", "colegiatura", "utiles", "boligrafo", "plumones", "crayolas", "ingles", "baile", "ballet", "danza", "karate", "natacion", "musica", "piano", "guitarra", "academia", "ajedrez", "idiomas"],
  "Ropa": ["ropa", "zapatos", "zapato", "tenis", "pantalon", "pantalones", "camisa", "camisas", "pullover", "pulover", "vestido", "short", "shorts", "medias", "blusa", "sandalias", "chancletas", "uniforme", "ropa interior", "abrigo", "gorra"],
  "Ocio": ["cine", "playa", "parque", "helado", "helados", "fiesta", "salida", "paseo", "cerveza", "cervezas", "ron", "juego", "juegos", "excursion", "piscina", "teatro", "concierto", "bar", "discoteca"],
  "Hijos": ["panales", "juguete", "juguetes", "guarderia", "circulo infantil", "cumpleanos", "pinata", "biberon", "toallitas", "papilla", "cuna", "coche"],
};

const MATERIAS = {
  "Matemática": ["matematica", "matematicas", "mate", "mates", "aritmetica", "algebra", "geometria"],
  "Español": ["espanol", "lengua", "lectura", "ortografia", "redaccion", "gramatica", "literatura"],
  "Ciencias": ["ciencias", "ciencias naturales", "naturales", "el mundo en que vivimos", "biologia"],
  "Historia": ["historia"],
  "Geografía": ["geografia"],
  "Inglés": ["ingles", "english"],
  "Educación Física": ["educacion fisica", "deporte"],
  "Computación": ["computacion", "informatica", "programacion"],
  "Física": ["fisica"],
  "Química": ["quimica"],
  "Arte": ["arte", "plastica", "dibujo", "musica", "educacion artistica"],
  "Cívica": ["civica", "educacion civica", "formacion civica"],
};

const AREAS_TAREA = {
  trabajo: ["cliente", "clientes", "reunion", "pr", "deploy", "despliegue", "odoo", "servidor", "codigo", "oferta", "presupuesto", "propuesta", "correo", "email", "jira", "gitlab", "github", "sprint", "release", "bug", "migracion", "backup", "api", "modulo", "trabajo", "oficina", "factura al cliente", "cotizacion"],
  hogar: ["plomero", "electricista", "mecanico", "casa", "limpiar", "arreglar", "reparar", "luz", "agua", "gas", "cocinar", "lavar", "planchar", "mercado", "compras", "basura", "jardin", "cocina", "bano", "pagar"],
};

const TIPOS_DEBER = {
  examen: ["examen", "prueba", "control", "evaluacion", "pregunta escrita", "comprobacion", "test"],
  proyecto: ["proyecto", "exposicion", "maqueta", "trabajo practico", "investigacion", "seminario"],
  deber: ["deber", "deberes", "tarea escolar", "ejercicios", "lectura", "repasar"],
};

const MONEDAS = {
  USD: ["usd", "dolar", "dolares", "$us", "us$", "u$s", "divisa", "divisas", "verdes", "fula"],
  CUP: ["cup", "pesos", "peso", "mn", "moneda nacional", "cubanos"],
};

const METODOS = {
  banca_remota: ["banca remota", "por banca", "banca", "transferencia", "transfer", "transferi", "tarjeta", "bandec", "bpa", "metropolitano", "enzona", "transfermovil"],
  efectivo: ["efectivo", "cash", "en mano", "billete", "billetes"],
};

const REPETICIONES = {
  mensual: ["cada mes", "todos los meses", "mensual", "mensualmente", "al mes", "por mes"],
  quincenal: ["cada quincena", "quincenal", "cada 15 dias", "cada quince dias"],
  semanal: ["cada semana", "todas las semanas", "semanal", "semanalmente", "por semana"],
};

const VERBOS_GASTO = ["gaste", "pague", "compre", "costo", "costaron", "salio", "gasto", "pagado", "comprado"];
const VERBOS_TAREA = ["pagar", "comprar", "llamar", "llevar", "hacer", "enviar", "mandar", "revisar", "recoger", "buscar", "preparar", "terminar", "arreglar", "reparar", "limpiar", "renovar", "cancelar", "reservar", "agendar", "escribir", "responder", "organizar", "visitar", "cobrar"];
const PALABRAS_ALTA = ["urgente", "importante", "asap", "ya", "prioridad alta", "sin falta"];
const PALABRAS_BAJA = ["cuando pueda", "algun dia", "sin prisa", "no urgente", "prioridad baja"];
const FILLERS = new Set(["tiene", "tienen", "tengo", "hay", "toca", "debo", "necesito", "acordarme", "recordar"]);
const EDGE_WORDS = new Set(["en", "el", "la", "los", "las", "de", "del", "para", "por", "a", "al", "con", "y", "que"]);
const STOPWORDS = new Set(["el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "en", "para", "por", "a", "al", "y", "con", "que", "me", "mi", "mis", "se", "lo", "le", "su", "sus", "es", "hay", "este", "esta", "esto"]);

const DIAS = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 7 };
const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };

/* ------------------------------------------------------------------ *
 * Utilidades
 * ------------------------------------------------------------------ */
const normalize = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const cleanToken = (t) => normalize(t).replace(/^[^\w$]+|[^\w$]+$/g, "");
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (iso, n) => { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
const weekday = (iso) => { const w = fromISO(iso).getDay(); return w === 0 ? 7 : w; };
const isValidDate = (y, m, d) => { const dt = new Date(y, m - 1, d); return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d; };
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Busca una frase (normalizada) como palabras completas dentro de un texto normalizado. */
const containsPhrase = (normText, phrase) => new RegExp(`(^|[^a-z0-9$])${escapeRe(phrase)}(?=$|[^a-z0-9])`).test(normText);

/**
 * Convierte una cadena numérica con separadores a número.
 * "1.500" → 1500, "1,500.50" → 1500.5, "12,5" → 12.5, "1 500,00" → 1500.
 */
function parseNumber(raw) {
  const s = String(raw).replace(/\s/g, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const hasDot = s.includes("."), hasComma = s.includes(",");
  let normalized;
  if (hasDot && hasComma) {
    const decSep = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    const thouSep = decSep === "." ? "," : ".";
    normalized = s.split(thouSep).join("").replace(decSep, ".");
  } else if (hasDot || hasComma) {
    const sep = hasDot ? "." : ",";
    const parts = s.split(sep);
    const isThousands = parts.length > 2 || (parts[1].length === 3 && parts[0].length <= 3);
    normalized = isThousands ? parts.join("") : `${parts[0]}.${parts[1]}`;
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/* ------------------------------------------------------------------ *
 * Tokenizador con consumo: cada extractor marca las palabras que usa,
 * y lo que sobra forma la descripción o el título.
 * ------------------------------------------------------------------ */
class Tokens {
  constructor(text) {
    this.items = String(text).split(/\s+/).filter(Boolean).map((raw) => ({ raw, norm: cleanToken(raw), used: false }));
  }
  /** Encuentra una secuencia de palabras normalizadas libre; devuelve índice o -1. */
  find(phrase) {
    const words = phrase.split(" ");
    outer: for (let i = 0; i <= this.items.length - words.length; i++) {
      for (let j = 0; j < words.length; j++) {
        const it = this.items[i + j];
        if (it.used || it.norm !== words[j]) continue outer;
      }
      return i;
    }
    return -1;
  }
  consume(i, len = 1) { for (let j = i; j < i + len; j++) this.items[j].used = true; }
  /** Consume la primera frase de la lista que aparezca; devuelve la frase o null. */
  takeAny(phrases) {
    const sorted = [...phrases].sort((a, b) => b.split(" ").length - a.split(" ").length);
    for (const p of sorted) {
      const i = this.find(p);
      if (i >= 0) { this.consume(i, p.split(" ").length); this.consumeConnectorBefore(i); return p; }
    }
    return null;
  }
  consumeConnectorBefore(i) {
    const prev = this.items[i - 1];
    if (prev && !prev.used && ["en", "de", "para", "por", "con", "el", "la", "a"].includes(prev.norm)) prev.used = true;
  }
  /** Texto no consumido, sin conectores ni muletillas sueltas en los extremos. */
  rest() {
    const free = this.items.filter((t) => !t.used && !FILLERS.has(t.norm));
    while (free.length && EDGE_WORDS.has(free[0].norm)) free.shift();
    while (free.length && EDGE_WORDS.has(free[free.length - 1].norm)) free.pop();
    return free.map((t) => t.raw).join(" ")
      .replace(/\s+([,.;:])/g, "$1").replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "").trim();
  }
}

/* ------------------------------------------------------------------ *
 * Extractores
 * ------------------------------------------------------------------ */

/** Fechas relativas y absolutas. direction: "past" (gastos) o "future" (tareas, deberes). */
function extractDate(tokens, hoy, direction) {
  const simple = { hoy: 0, ayer: -1, anteayer: -2, antier: -2 };
  for (const [word, delta] of Object.entries(simple)) {
    const i = tokens.find(word);
    if (i >= 0) { tokens.consume(i); return addDays(hoy, delta); }
  }
  let i = tokens.find("antes de ayer");
  if (i >= 0) { tokens.consume(i, 3); return addDays(hoy, -2); }
  i = tokens.find("pasado manana");
  if (i >= 0) { tokens.consume(i, 2); return addDays(hoy, 2); }
  i = tokens.find("manana");
  if (i >= 0 && !["la", "por", "esta", "de"].includes(tokens.items[i - 1]?.norm)) { tokens.consume(i); return addDays(hoy, 1); }

  const enDias = tokens.items.findIndex((t, k) => !t.used && t.norm === "en" && /^\d+$/.test(tokens.items[k + 1]?.norm || "") && /^dias?$/.test(tokens.items[k + 2]?.norm || ""));
  if (enDias >= 0) { const n = Number(tokens.items[enDias + 1].norm); tokens.consume(enDias, 3); return addDays(hoy, n); }

  for (const [name, wd] of Object.entries(DIAS)) {
    const k = tokens.find(name);
    if (k < 0) continue;
    tokens.consume(k);
    const prev = tokens.items[k - 1];
    let dir = direction;
    if (prev && ["proximo", "que viene"].includes(prev.norm)) { dir = "future"; prev.used = true; }
    if (prev && prev.norm === "pasado") { dir = "past"; prev.used = true; }
    tokens.consumeConnectorBefore(k);
    const today = weekday(hoy);
    const delta = dir === "past" ? -((today - wd + 7) % 7) : ((wd - today + 7) % 7 || 7);
    return addDays(hoy, delta);
  }

  for (let k = 0; k < tokens.items.length; k++) {
    const t = tokens.items[k];
    if (t.used) continue;
    const m = t.norm.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/) || null;
    if (m) { const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]; if (isValidDate(y, mo, d)) { t.used = true; tokens.consumeConnectorBefore(k); return toISO(new Date(y, mo - 1, d)); } }
    const dm = t.norm.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
    if (dm) {
      const iso = resolveDayMonth(Number(dm[1]), Number(dm[2]), dm[3], hoy, direction);
      if (iso) { t.used = true; tokens.consumeConnectorBefore(k); return iso; }
    }
    // "15 de noviembre"
    if (/^\d{1,2}$/.test(t.norm) && tokens.items[k + 1]?.norm === "de" && MESES[tokens.items[k + 2]?.norm]) {
      const iso = resolveDayMonth(Number(t.norm), MESES[tokens.items[k + 2].norm], null, hoy, direction);
      if (iso) { tokens.consume(k, 3); tokens.consumeConnectorBefore(k); return iso; }
    }
    // "el 15" / "dia 15"
    if (["el", "dia"].includes(t.norm) && /^\d{1,2}$/.test(tokens.items[k + 1]?.norm || "") && !tokens.items[k + 1].used) {
      const day = Number(tokens.items[k + 1].norm);
      const [y, mo] = hoy.split("-").map(Number);
      if (day >= 1 && day <= 31 && isValidDate(y, mo, day)) {
        let iso = toISO(new Date(y, mo - 1, day));
        if (direction === "future" && iso < hoy) iso = toISO(new Date(y, mo, day));
        if (direction === "past" && iso > hoy) iso = toISO(new Date(y, mo - 2, day));
        tokens.consume(k, 2);
        return iso;
      }
    }
  }
  return null;
}

function resolveDayMonth(d, m, yRaw, hoy, direction) {
  const curYear = Number(hoy.slice(0, 4));
  let y = yRaw ? Number(yRaw.length === 2 ? `20${yRaw}` : yRaw) : curYear;
  if (!isValidDate(y, m, d)) return null;
  let iso = toISO(new Date(y, m - 1, d));
  if (!yRaw) {
    if (direction === "future" && iso < hoy) iso = toISO(new Date(y + 1, m - 1, d));
    if (direction === "past" && iso > hoy) iso = toISO(new Date(y - 1, m - 1, d));
  }
  return iso;
}

/** Horas como "16:00", "4pm", "a las 5": se consumen para no ensuciar el título. */
function consumeTimes(tokens) {
  tokens.items.forEach((t, k) => {
    if (t.used) return;
    if (/^\d{1,2}:\d{2}$/.test(t.norm) || /^\d{1,2}(am|pm|h|hrs)$/.test(t.norm)) { t.used = true; if (tokens.items[k - 1]?.norm === "las") { tokens.items[k - 1].used = true; if (tokens.items[k - 2]?.norm === "a") tokens.items[k - 2].used = true; } }
    if (t.norm === "las" && tokens.items[k - 1]?.norm === "a" && /^\d{1,2}$/.test(tokens.items[k + 1]?.norm || "")) { t.used = true; tokens.items[k - 1].used = true; tokens.items[k + 1].used = true; }
  });
}

/**
 * Hora para agendar: "16:00", "10am", "4pm", "a las 5", "a las 5 de la tarde", "a las 10 de la mañana".
 * Sin am/pm, las horas 1–6 se interpretan como de la tarde (nadie agenda a las 3 de la madrugada).
 * @returns {string|null} "HH:MM"
 */
function extractTime(tokens) {
  const items = tokens.items;
  for (let k = 0; k < items.length; k++) {
    const t = items[k];
    if (t.used) continue;
    let h = null, min = 0, consumed = [k], explicit = false;
    let m = t.norm.match(/^(\d{1,2}):(\d{2})(am|pm)?$/);
    if (m) { h = Number(m[1]); min = Number(m[2]); explicit = true; if (m[3] === "pm" && h < 12) h += 12; if (m[3] === "am" && h === 12) h = 0; }
    else if ((m = t.norm.match(/^(\d{1,2})(am|pm)$/))) { h = Number(m[1]); explicit = true; if (m[2] === "pm" && h < 12) h += 12; if (m[2] === "am" && h === 12) h = 0; }
    else if (/^\d{1,2}$/.test(t.norm) && items[k - 1]?.norm === "las" && items[k - 2]?.norm === "a") { h = Number(t.norm); consumed = [k - 2, k - 1, k]; }
    else continue;
    if (h === null || h > 23 || min > 59) continue;
    // "de la mañana / tarde / noche" y "am/pm" sueltos a continuación
    const next = items[k + 1]?.norm, next2 = items[k + 2]?.norm, next3 = items[k + 3]?.norm;
    if (next === "de" && next2 === "la" && ["manana", "tarde", "noche"].includes(next3)) {
      if (next3 !== "manana" && h < 12) h += 12;
      if (next3 === "manana" && h === 12) h = 0;
      consumed.push(k + 1, k + 2, k + 3); explicit = true;
    } else if (next === "pm" || next === "am") {
      if (next === "pm" && h < 12) h += 12;
      consumed.push(k + 1); explicit = true;
    }
    if (!explicit && h >= 1 && h <= 6) h += 12;
    if (items[consumed[0] - 1]?.norm === "las" && items[consumed[0] - 2]?.norm === "a") consumed.push(consumed[0] - 1, consumed[0] - 2);
    consumed.forEach((i) => { items[i].used = true; });
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  return null;
}

/**
 * Duración: "2h", "90min", "1 hora", "30 minutos", "hora y media", "media hora".
 * @returns {number|null} minutos
 */
function extractDuration(tokens) {
  const items = tokens.items;
  for (let k = 0; k < items.length; k++) {
    const t = items[k];
    if (t.used) continue;
    let m = t.norm.match(/^(\d+(?:[.,]\d+)?)(h|hr|hrs|min|mins|m)$/);
    if (m) { t.used = true; const n = Number(m[1].replace(",", ".")); return Math.round(m[2].startsWith("h") ? n * 60 : n); }
    if (/^\d+$/.test(t.norm) && /^(horas?|hrs?|minutos?|mins?)$/.test(items[k + 1]?.norm || "")) {
      const n = Number(t.norm); const unit = items[k + 1].norm; t.used = true; items[k + 1].used = true;
      if (items[k - 1]?.norm === "durante" || items[k - 1]?.norm === "por") items[k - 1].used = true;
      return unit.startsWith("h") ? n * 60 : n;
    }
  }
  const media = tokens.find("media hora");
  if (media >= 0) { tokens.consume(media, 2); return 30; }
  const hym = tokens.find("hora y media");
  if (hym >= 0) { tokens.consume(hym, 3); return 90; }
  return null;
}

/** Monto: primer número que no sea fecha ni hora. Admite "$350", "20usd", "1.500", "12,50". */
function extractAmount(tokens) {
  for (let k = 0; k < tokens.items.length; k++) {
    const t = tokens.items[k];
    if (t.used) continue;
    const m = t.norm.match(/^(\$)?(\d[\d.,]*)(\$|usd|cup|mn)?$/);
    if (!m) continue;
    const value = parseNumber(m[2]);
    if (value === null || value <= 0) continue;
    t.used = true;
    const sufijo = m[3] === "usd" ? "USD" : (m[3] === "cup" || m[3] === "mn") ? "CUP" : null;
    return { monto: value, monedaPegada: sufijo };
  }
  return null;
}

function extractKid(tokens, hijos) {
  for (const kid of hijos || []) {
    const name = cleanToken(String(kid.nombre || "").split(/\s+/)[0]);
    if (!name) continue;
    const i = tokens.find(name);
    if (i >= 0) { tokens.consume(i); tokens.consumeConnectorBefore(i); return kid.id; }
  }
  return null;
}

/** Posición de una frase como palabra completa, o -1. */
const phraseIndex = (normText, phrase) => {
  const m = new RegExp(`(^|[^a-z0-9$])${escapeRe(phrase)}(?=$|[^a-z0-9])`).exec(normText);
  return m ? m.index + m[1].length : -1;
};

/**
 * Palabra clave de un diccionario presente en el texto. Gana la que aparece primero
 * (suele ser el sustantivo principal: "taxi a la escuela" → Transporte); a igual posición, la más larga.
 */
function matchDictionary(normText, dict) {
  let best = null;
  for (const [key, phrases] of Object.entries(dict)) {
    for (const p of phrases) {
      const idx = phraseIndex(normText, p);
      if (idx < 0) continue;
      if (!best || idx < best.idx || (idx === best.idx && p.length > best.phrase.length)) best = { key, phrase: p, idx };
    }
  }
  return best;
}

/** Reglas aprendidas: [{patron, categoria}]; gana la coincidencia más larga y tiene prioridad sobre el diccionario. */
function matchLearned(normText, reglas) {
  let best = null;
  for (const r of reglas || []) {
    const p = normalize(r.patron).trim();
    if (p && containsPhrase(normText, p) && (!best || p.length > best.patron.length)) best = { patron: p, categoria: r.categoria };
  }
  return best;
}

function classifyCategory(normText, reglas, hijoId) {
  const learned = matchLearned(normText, reglas);
  if (learned) return { categoria: learned.categoria, confianza: "alta", fuente: "regla aprendida" };
  const dict = matchDictionary(normText, CATEGORIAS);
  if (dict) return { categoria: dict.key, confianza: "alta", fuente: `palabra "${dict.phrase}"` };
  if (hijoId) return { categoria: "Hijos", confianza: "baja", fuente: "asignado a un hijo" };
  return { categoria: "Otros", confianza: "baja", fuente: "sin coincidencias" };
}

/* ------------------------------------------------------------------ *
 * Detección de intención
 * ------------------------------------------------------------------ */
const PREFIJOS = { g: "gasto", gasto: "gasto", t: "tarea", tarea: "tarea", d: "deber", deber: "deber", examen: "deber" };

/**
 * Reglas de intención, en orden:
 * 1. Prefijo explícito ("g:", "t:", "d:").
 * 2. Deber: hay vocabulario escolar, ninguna pista de dinero, y además una palabra de deber
 *    (examen, deberes…) en contexto escolar, o un hijo nombrado sin monto.
 * 3. Gasto: hay monto, salvo que empiece con un verbo de tarea en infinitivo ("pagar la luz 500").
 * 4. Tarea: todo lo demás.
 */
function detectIntent(normText, { hasAmount, hijoId, forced }) {
  if (forced) return forced;
  const homeworkWord = matchDictionary(normText, TIPOS_DEBER);
  const materia = matchDictionary(normText, MATERIAS);
  const spendVerb = VERBOS_GASTO.some((v) => containsPhrase(normText, v));
  const moneyHint = spendVerb || Boolean(matchDictionary(normText, MONEDAS)) || Boolean(matchDictionary(normText, METODOS)) || normText.includes("$");
  const schoolContext = Boolean(hijoId || materia || !hasAmount);
  const isHomework = homeworkWord ? schoolContext : Boolean(materia && hijoId && !hasAmount);
  if (isHomework && !moneyHint) return "deber";
  if (hasAmount) {
    const first = normText.split(/\s+/)[0];
    return !spendVerb && VERBOS_TAREA.includes(first) ? "tarea" : "gasto";
  }
  return spendVerb ? "gasto" : "tarea";
}

/* ------------------------------------------------------------------ *
 * Constructores por tipo
 * ------------------------------------------------------------------ */
function buildGasto(tokens, normText, ctx, inherited = {}) {
  const confianza = {};
  const aprox = tokens.takeAny(["aproximadamente", "aproximado", "aprox", "mas o menos", "alrededor de", "unos", "unas", "estimado", "~"]);
  const amount = extractAmount(tokens);
  const moneda = amount?.monedaPegada || keyFromTokens(tokens, MONEDAS) || inherited.moneda || null;
  const metodo = keyFromTokens(tokens, METODOS) || inherited.metodo || null;
  tokens.takeAny(VERBOS_GASTO);
  const cat = classifyCategory(normText, ctx.reglas, inherited.hijoId);

  confianza.monto = amount ? "alta" : "baja";
  // La moneda y la fecha por defecto (moneda habitual, hoy) son el caso normal: no se marcan para revisar.
  confianza.moneda = "alta";
  confianza.metodo = metodo ? "alta" : "baja";
  confianza.fecha = "alta";
  confianza.categoria = cat.confianza;

  return {
    tipo: "gasto",
    datos: {
      monto: amount ? amount.monto : null,
      moneda: moneda || ctx.monedaPorDefecto || "CUP",
      metodo: metodo || "efectivo",
      categoria: cat.categoria,
      descripcion: capitalize(tokens.rest()) || cat.categoria,
      fecha: inherited.fecha || ctx.hoy,
      hijoId: inherited.hijoId || null,
    },
    confianza,
    explicacion: `Categoría por ${cat.fuente}`,
  };
}

function buildTarea(tokens, normText, ctx, info) {
  // Costo previsto: "pagar inglés 1500 cada mes", "comprar uniforme 20 usd".
  const aprox = tokens.takeAny(["aproximadamente", "aproximado", "aprox", "mas o menos", "alrededor de", "unos", "unas", "estimado", "~"]);
  const amount = extractAmount(tokens);
  const costoMoneda = amount ? amount.monedaPegada || keyFromTokens(tokens, MONEDAS) || ctx.monedaPorDefecto || "CUP" : null;
  const costoMetodo = amount ? keyFromTokens(tokens, METODOS) || "efectivo" : null;
  let prioridad = "media";
  if (tokens.takeAny(PALABRAS_ALTA) || /!/.test(info.texto)) prioridad = "alta";
  else if (tokens.takeAny(PALABRAS_BAJA)) prioridad = "baja";
  let area = "personal";
  if (info.hijoId) area = "hijos";
  else {
    const a = matchDictionary(normText, AREAS_TAREA);
    if (a) area = a.key;
  }
  const titulo = capitalize(tokens.rest().replace(/!+/g, "").trim());
  return {
    tipo: "tarea",
    datos: {
      titulo: titulo || capitalize(info.texto), area, prioridad, vence: info.fecha || null, hijoId: info.hijoId || null,
      hora: info.hora || null, duracion: info.duracion || null, repetir: info.repetir || null,
      costoMonto: amount ? amount.monto : null, costoMoneda, costoMetodo,
      costoCategoria: amount ? classifyCategory(normText, ctx.reglas, info.hijoId).categoria : null,
      costoTipo: amount ? (aprox || classifyCategory(normText, ctx.reglas, info.hijoId).categoria === "Servicios" ? "estimado" : "fijo") : null,
    },
    confianza: { titulo: titulo ? "alta" : "baja", area: area === "personal" ? "baja" : "alta", vence: info.fecha ? "alta" : "baja" },
    explicacion: info.fecha ? "" : "Sin fecha límite detectada",
  };
}

function buildDeber(tokens, normText, ctx, info) {
  const tipo = matchDictionary(normText, TIPOS_DEBER);
  const materia = matchDictionary(normText, MATERIAS);
  if (tipo) tokens.takeAny([tipo.phrase]);
  if (materia) tokens.takeAny([materia.phrase]);
  const hijos = ctx.hijos || [];
  const hijoId = info.hijoId || (hijos.length === 1 ? hijos[0].id : null);
  return {
    tipo: "deber",
    datos: {
      hijoId,
      materia: materia ? materia.key : "General",
      tipo: tipo ? tipo.key : "deber",
      entrega: info.fecha || addDays(ctx.hoy, 1),
      descripcion: capitalize(tokens.rest()),
      estado: "pendiente",
    },
    confianza: { hijoId: hijoId ? "alta" : "baja", materia: materia ? "alta" : "baja", entrega: info.fecha ? "alta" : "baja" },
    explicacion: info.fecha ? "" : "Sin fecha: se propone mañana",
  };
}

function keyFromTokens(tokens, dict) {
  for (const [key, phrases] of Object.entries(dict)) if (tokens.takeAny(phrases)) return key;
  return null;
}

/* ------------------------------------------------------------------ *
 * API pública
 * ------------------------------------------------------------------ */

/**
 * Analiza texto libre. Puede devolver varios registros
 * ("200 pan, 1500 pollo, 300 guagua ayer efectivo" → 3 gastos).
 * @param {string} texto
 * @param {{hoy:string, hijos:Array<{id,nombre}>, reglas:Array<{patron,categoria}>, monedaPorDefecto:string}} ctx
 * @returns {Array<{tipo, datos, confianza, explicacion}>}
 */
function analizarTexto(texto, ctx) {
  const original = String(texto || "").trim();
  if (!original) return [];

  let forced = null;
  let body = original;
  const pref = original.match(/^\s*([a-záéíóú]+)\s*:\s*/i);
  if (pref && PREFIJOS[normalize(pref[1])]) { forced = PREFIJOS[normalize(pref[1])]; body = original.slice(pref[0].length); }

  // Contexto global del mensaje (fecha, hijo, moneda, método) que heredan los segmentos.
  const globalTokens = new Tokens(body);
  const normBody = normalize(body);
  const hijoId = extractKid(globalTokens, ctx.hijos);
  const intent = detectIntent(normBody, { hasAmount: hasAmountOutsideDates(body, ctx), hijoId, forced });
  const fecha = extractDate(globalTokens, ctx.hoy, intent === "gasto" ? "past" : "future");

  if (intent === "gasto") {
    consumeTimes(globalTokens);
    const segments = splitExpenseSegments(globalTokens.rest());
    const single = segments.length === 1;
    // Herencia entre varios gastos de un mensaje: la moneda va pegada a su monto y NO se hereda
    // ("350 almuerzo, 20 usd zapatos" → CUP y USD); el método sí, para los gastos que no dicen el suyo.
    const inherited = {
      fecha: fecha || ctx.hoy,
      hijoId,
      moneda: single ? keyFromTokens(new Tokens(body), MONEDAS) : null,
      metodo: keyFromTokens(new Tokens(body), METODOS),
    };
    return segments
      .map((seg) => buildGasto(new Tokens(seg), single ? normBody : normalize(seg), ctx, inherited))
      .map((r) => withSource(r, original));
  }

  const repetir = intent === "tarea" ? keyFromTokens(globalTokens, REPETICIONES) : null;
  const hora = intent === "tarea" ? extractTime(globalTokens) : null;
  const duracion = intent === "tarea" ? extractDuration(globalTokens) : null;
  consumeTimes(globalTokens);
  const info = { fecha, hijoId, texto: body, hora, duracion, repetir };
  const result = intent === "deber" ? buildDeber(globalTokens, normBody, ctx, info) : buildTarea(globalTokens, normBody, ctx, info);
  return [withSource(result, original)];
}

/** ¿Queda algún número que parezca monto tras quitar hijo, fechas y horas? */
function hasAmountOutsideDates(body, ctx) {
  const probe = new Tokens(body);
  extractKid(probe, ctx.hijos);
  extractDate(probe, ctx.hoy, "future");
  keyFromTokens(probe, REPETICIONES);
  extractTime(probe);
  extractDuration(probe);
  consumeTimes(probe);
  return probe.items.some((t) => !t.used && /^\$?\d[\d.,]*(\$|usd|cup|mn)?$/.test(t.norm));
}

/** Separa "200 pan, 1500 pollo y 300 guagua" en segmentos solo si cada uno tiene su propio monto. */
function splitExpenseSegments(text) {
  const parts = text.split(/\s*(?:;|\n|,(?!\d)|\sy\s(?=\$?\d))\s*/).map((s) => s.trim()).filter(Boolean);
  const withAmount = parts.filter((p) => /(^|[\s$])\d/.test(p));
  return parts.length > 1 && withAmount.length === parts.length ? parts : [text];
}

/**
 * Analiza el texto reconocido por OCR de un ticket o una captura de Banca Remota.
 * @returns {{tipo:"gasto", datos, confianza, explicacion}}
 */
function analizarRecibo(ocrText, ctx) {
  const lines = String(ocrText || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const norm = normalize(lines.join("\n"));
  const confianza = {};

  // Monto: línea con palabra clave de total; si no, el mayor importe con decimales.
  const AMOUNT_RE = /(\d{1,3}(?:[ .,]\d{3})+|\d+)(?:[.,](\d{2}))?(?!\d)/g;
  const amountsIn = (line) => [...line.matchAll(AMOUNT_RE)]
    .filter((m) => !isDateLike(line, m.index, m[0]))
    .map((m) => ({ value: parseNumber(m[0].replace(/ /g, "")), hasDecimals: Boolean(m[2]) }))
    .filter((a) => a.value !== null && a.value > 0 && a.value < 10000000);
  let monto = null;
  const keyIdx = lines.findIndex((l) => /\b(total|importe|monto|a pagar|cantidad|valor|debitado|transferido)\b/.test(normalize(l)));
  if (keyIdx >= 0) {
    const candidates = amountsIn(lines[keyIdx]).concat(amountsIn(lines[keyIdx + 1] || ""));
    if (candidates.length) { monto = candidates[0].value; confianza.monto = "alta"; }
  }
  if (monto === null) {
    const all = lines.flatMap(amountsIn);
    const pool = all.some((a) => a.hasDecimals) ? all.filter((a) => a.hasDecimals) : all;
    if (pool.length) { monto = Math.max(...pool.map((a) => a.value)); confianza.monto = "baja"; }
    else confianza.monto = "baja";
  }

  const moneda = matchDictionary(norm, MONEDAS)?.key || null;
  confianza.moneda = moneda ? "alta" : "baja";
  const esBanca = /(banca remota|transferencia|transaccion|operacion|bandec|bpa|banco metropolitano|cuenta|tarjeta|saldo|enzona|transfermovil)/.test(norm);
  confianza.metodo = esBanca ? "alta" : "baja";

  let fecha = null;
  for (const l of lines) {
    const t = new Tokens(l.replace(/[,]/g, " "));
    fecha = extractDate(t, ctx.hoy, "past");
    if (fecha) break;
  }
  confianza.fecha = fecha ? "alta" : "baja";

  let descripcion = "";
  const labelIdx = lines.findIndex((l) => /\b(beneficiario|destino|destinatario|comercio|establecimiento|a favor de|concepto|descripcion|servicio|tienda)\b/.test(normalize(l)));
  if (labelIdx >= 0) {
    const after = lines[labelIdx].split(/[:]/).slice(1).join(":").trim();
    descripcion = after || lines[labelIdx + 1] || "";
  }
  if (!descripcion) descripcion = lines.find((l) => (l.match(/[a-záéíóúñ]/gi) || []).length >= 4 && !/\b(total|importe|fecha|hora|ticket|factura|gracias)\b/i.test(normalize(l))) || "";
  descripcion = descripcion.replace(/\s{2,}/g, " ").slice(0, 80);

  const cat = classifyCategory(norm, ctx.reglas, null);
  confianza.categoria = cat.confianza;

  return {
    tipo: "gasto",
    datos: {
      monto,
      moneda: moneda || ctx.monedaPorDefecto || "CUP",
      metodo: esBanca ? "banca_remota" : "efectivo",
      categoria: cat.categoria,
      descripcion: capitalize(descripcion) || cat.categoria,
      fecha: fecha || ctx.hoy,
      hijoId: null,
    },
    confianza,
    explicacion: `Leído de imagen · categoría por ${cat.fuente}`,
    origen: "ocr",
    texto: lines.join("\n"),
  };
}

function isDateLike(line, index, match) {
  const around = line.slice(Math.max(0, index - 1), index + match.length + 3);
  return /\d[/:-]\d/.test(around) || /^\d{1,2}[/:-]/.test(line.slice(index));
}

function withSource(result, texto) { return { ...result, origen: "texto", texto }; }

/**
 * Patrón que se guarda como regla cuando el usuario corrige o confirma una categoría:
 * la primera palabra significativa de la descripción ("Agromercado 4ta" → "agromercado").
 */
function patronDeAprendizaje(descripcion) {
  const words = normalize(descripcion).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  return words[0] || null;
}

/** Id seguro para la base de datos a partir de un patrón. */
const idDeRegla = (patron) => normalize(patron).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/** Categoría de un texto suelto (p. ej. una línea de ticket): reglas aprendidas y diccionario. */
const categoriaDeTexto = (texto, reglas) => classifyCategory(normalize(texto), reglas, null);

export {
  categoriaDeTexto,
  analizarTexto,
  analizarRecibo,
  patronDeAprendizaje,
  idDeRegla,
};
export const CATEGORIAS_CLASIFICADOR = Object.keys(CATEGORIAS).concat(["Otros"]);
export const MATERIAS_LISTA = Object.keys(MATERIAS).concat(["General"]);
export const _internals = { parseNumber, normalize, extractDate, extractTime, Tokens, splitExpenseSegments };
