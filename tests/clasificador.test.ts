import { test, assert } from "vitest";
import * as C from "../src/domain/clasificador.js";

// Domingo 8 de noviembre de 2026
const ctx = {
  hoy: "2026-11-08",
  monedaPorDefecto: "CUP",
  hijos: [{ id: "k1", nombre: "Ana" }, { id: "k2", nombre: "Leo" }],
  reglas: [{ patron: "la cuarta", categoria: "Alimentación" }, { patron: "dona maria", categoria: "Educación" }],
};
const one = (txt: string, c = ctx) => { const r = C.analizarTexto(txt, c); assert.strictEqual(r.length, 1, `esperaba 1 resultado para "${txt}"`); return r[0]; };

test("parseNumber entiende separadores en español e inglés", () => {
  const { parseNumber } = C._internals;
  assert.strictEqual(parseNumber("350"), 350);
  assert.strictEqual(parseNumber("1.500"), 1500);
  assert.strictEqual(parseNumber("1,500.50"), 1500.5);
  assert.strictEqual(parseNumber("1.500,50"), 1500.5);
  assert.strictEqual(parseNumber("12,5"), 12.5);
  assert.strictEqual(parseNumber("12.50"), 12.5);
  assert.strictEqual(parseNumber("1 500,00"), 1500);
  assert.strictEqual(parseNumber("abc"), null);
});

test("gasto simple en efectivo", () => {
  const r = one("350 almuerzo efectivo");
  assert.strictEqual(r.tipo, "gasto");
  assert.deepStrictEqual(
    { monto: r.datos.monto, moneda: r.datos.moneda, metodo: r.datos.metodo, categoria: r.datos.categoria, fecha: r.datos.fecha, descripcion: r.datos.descripcion },
    { monto: 350, moneda: "CUP", metodo: "efectivo", categoria: "Alimentación", fecha: "2026-11-08", descripcion: "Almuerzo" },
  );
  assert.strictEqual(r.confianza.monto, "alta");
});

test("gasto en USD por Banca Remota de ayer, asignado a un hijo", () => {
  const r = one("20 usd zapatos Leo ayer por banca");
  assert.strictEqual(r.tipo, "gasto");
  assert.strictEqual(r.datos.monto, 20);
  assert.strictEqual(r.datos.moneda, "USD");
  assert.strictEqual(r.datos.metodo, "banca_remota");
  assert.strictEqual(r.datos.categoria, "Ropa");
  assert.strictEqual(r.datos.hijoId, "k2");
  assert.strictEqual(r.datos.fecha, "2026-11-07");
  assert.strictEqual(r.datos.descripcion, "Zapatos");
});

test("moneda pegada al número y símbolo $", () => {
  assert.strictEqual(one("25usd gasolina").datos.moneda, "USD");
  assert.strictEqual(one("$1.200 recarga etecsa").datos.monto, 1200);
  assert.strictEqual(one("$1.200 recarga etecsa").datos.categoria, "Servicios");
});

test("verbo en pasado y día de la semana pasado", () => {
  const r = one("pagué 1500 de luz el jueves");
  assert.strictEqual(r.tipo, "gasto");
  assert.strictEqual(r.datos.categoria, "Servicios");
  assert.strictEqual(r.datos.fecha, "2026-11-05");
});

test("varios gastos en un mensaje heredan fecha y método", () => {
  const r = C.analizarTexto("200 pan, 1500 pollo y 300 guagua ayer efectivo", ctx);
  assert.strictEqual(r.length, 3);
  assert.deepStrictEqual(r.map((x) => [x.datos.monto, x.datos.categoria, x.datos.fecha, x.datos.metodo]), [
    [200, "Alimentación", "2026-11-07", "efectivo"],
    [1500, "Alimentación", "2026-11-07", "efectivo"],
    [300, "Transporte", "2026-11-07", "efectivo"],
  ]);
});

test("las reglas aprendidas tienen prioridad sobre el diccionario", () => {
  const r = one("400 la cuarta");
  assert.strictEqual(r.datos.categoria, "Alimentación");
  assert.match(r.explicacion, /regla aprendida/);
  assert.strictEqual(one("2000 doña maría repaso").datos.categoria, "Educación");
});

test("sin categoría conocida queda en Otros con confianza baja", () => {
  const r = one("700 cosas varias");
  assert.strictEqual(r.datos.categoria, "Otros");
  assert.strictEqual(r.confianza.categoria, "baja");
});

test("tarea con fecha futura, área hogar y prioridad alta", () => {
  const r = one("pagar la luz el viernes urgente");
  assert.strictEqual(r.tipo, "tarea");
  assert.strictEqual(r.datos.vence, "2026-11-13");
  assert.strictEqual(r.datos.area, "hogar");
  assert.strictEqual(r.datos.prioridad, "alta");
  assert.strictEqual(r.datos.titulo, "Pagar la luz");
});

test("infinitivo + monto sigue siendo tarea", () => {
  const r = one("pagar renta 5000 mañana");
  assert.strictEqual(r.tipo, "tarea");
  assert.strictEqual(r.datos.vence, "2026-11-09");
});

test("tarea de trabajo sin fecha", () => {
  const r = one("revisar PR de Grancomerx");
  assert.strictEqual(r.tipo, "tarea");
  assert.strictEqual(r.datos.area, "trabajo");
  assert.strictEqual(r.datos.vence, null);
  assert.strictEqual(r.confianza.vence, "baja");
});

test("tarea relacionada con un hijo", () => {
  const r = one("llevar a Ana al dentista el martes a las 4pm");
  assert.strictEqual(r.tipo, "tarea");
  assert.strictEqual(r.datos.hijoId, "k1");
  assert.strictEqual(r.datos.area, "hijos");
  assert.strictEqual(r.datos.vence, "2026-11-10");
  assert.strictEqual(r.datos.titulo, "Llevar al dentista");
});

test("examen de un hijo con día de la semana", () => {
  const r = one("examen de mate de Ana el jueves");
  assert.strictEqual(r.tipo, "deber");
  assert.deepStrictEqual(
    { hijoId: r.datos.hijoId, materia: r.datos.materia, tipo: r.datos.tipo, entrega: r.datos.entrega },
    { hijoId: "k1", materia: "Matemática", tipo: "examen", entrega: "2026-11-12" },
  );
});

test("deberes con número de página no se confunden con un gasto", () => {
  const r = one("Leo deberes de español pág 34 para mañana");
  assert.strictEqual(r.tipo, "deber");
  assert.strictEqual(r.datos.materia, "Español");
  assert.strictEqual(r.datos.entrega, "2026-11-09");
  assert.match(String(r.datos.descripcion), /34/);
});

test("compra escolar con monto es un gasto, no un deber", () => {
  const r = one("libreta de mate 150 Ana");
  assert.strictEqual(r.tipo, "gasto");
  assert.strictEqual(r.datos.categoria, "Educación");
  assert.strictEqual(r.datos.hijoId, "k1");
});

test("fecha absoluta dd/mm y '15 de noviembre'", () => {
  assert.strictEqual(one("examen de historia de Ana 20/11").datos.entrega, "2026-11-20");
  assert.strictEqual(one("proyecto de ciencias de Leo el 15 de noviembre").datos.entrega, "2026-11-15");
  assert.strictEqual(one("500 farmacia 03/11").datos.fecha, "2026-11-03");
});

test("prefijo explícito fuerza el tipo", () => {
  assert.strictEqual(one("t: comprar regalo de cumpleaños").tipo, "tarea");
  assert.strictEqual(one("g: 300 regalo").tipo, "gasto");
});

test("recibo de Banca Remota (texto OCR)", () => {
  const ocr = [
    "BANCA REMOTA",
    "Transferencia realizada",
    "Fecha: 06/11/2026 14:32",
    "Beneficiario: ETECSA",
    "Importe: 1.250,00 CUP",
    "Nro. Transacción: 98234512",
  ].join("\n");
  const r = C.analizarRecibo(ocr, ctx);
  assert.strictEqual(r.datos.monto, 1250);
  assert.strictEqual(r.datos.moneda, "CUP");
  assert.strictEqual(r.datos.metodo, "banca_remota");
  assert.strictEqual(r.datos.fecha, "2026-11-06");
  assert.strictEqual(r.datos.descripcion, "ETECSA");
  assert.strictEqual(r.datos.categoria, "Servicios");
  assert.strictEqual(r.confianza.monto, "alta");
});

test("ticket de papel sin palabra 'total' usa el mayor importe con decimales", () => {
  const ocr = ["MIPYME EL BUEN SABOR", "Calle 23 #456", "Pan 120.00", "Leche 450.00", "Pollo 1300.00", "1870.00", "Tel 55512345"].join("\n");
  const r = C.analizarRecibo(ocr, ctx);
  assert.strictEqual(r.datos.monto, 1870);
  assert.strictEqual(r.confianza.monto, "baja");
  assert.strictEqual(r.datos.metodo, "efectivo");
  assert.strictEqual(r.datos.categoria, "Alimentación");
  assert.strictEqual(r.datos.descripcion, "MIPYME EL BUEN SABOR");
});

test("patrón de aprendizaje e id de regla", () => {
  assert.strictEqual(C.patronDeAprendizaje("Agromercado de la 4ta"), "agromercado");
  assert.strictEqual(C.patronDeAprendizaje("En la Mipyme"), "mipyme");
  assert.strictEqual(C.idDeRegla("doña maría"), "dona-maria");
  assert.strictEqual(C.patronDeAprendizaje("12 34"), null);
});

test("texto vacío no produce resultados", () => {
  assert.deepStrictEqual(C.analizarTexto("   ", ctx), []);
});

test("la primera palabra clave decide la categoría y se limpian conectores", () => {
  const r = one("1.500 cup taxi a la escuela de Ana");
  assert.strictEqual(r.datos.categoria, "Transporte");
  assert.strictEqual(r.datos.descripcion, "Taxi a la escuela");
  assert.strictEqual(one("gasté 40 dólares en el agro").datos.descripcion, "Agro");
  assert.strictEqual(one("Ana tiene prueba de inglés el lunes").datos.descripcion, "");
  assert.strictEqual(one("llamar al plomero").datos.area, "hogar");
});

test("hora y duración para agendar tareas", () => {
  const r = one("llamar al plomero mañana a las 10");
  assert.strictEqual(r.tipo, "tarea");
  assert.strictEqual(r.datos.vence, "2026-11-09");
  assert.strictEqual(r.datos.hora, "10:00");
  assert.strictEqual(r.datos.titulo, "Llamar al plomero");
  assert.strictEqual(one("gimnasio el martes 7am 1h").datos.hora, "07:00");
  assert.strictEqual(one("gimnasio el martes 7am 1h").datos.duracion, 60);
  assert.strictEqual(one("reunión con cliente el lunes a las 3").datos.hora, "15:00");
  assert.strictEqual(one("estudiar inglés hoy a las 8 de la noche durante 90 minutos").datos.hora, "20:00");
  assert.strictEqual(one("estudiar inglés hoy a las 8 de la noche durante 90 minutos").datos.duracion, 90);
  assert.strictEqual(one("pasear al perro 18:30 media hora").datos.duracion, 30);
  assert.strictEqual(one("revisar correo").datos.hora, null);
});

test("en varios gastos la moneda no se hereda; el método sí, si el gasto no dice el suyo", () => {
  const r = C.analizarTexto("350 almuerzo efectivo, 20 usd zapatos por banca", ctx);
  assert.deepStrictEqual(r.map((x) => [x.datos.monto, x.datos.moneda, x.datos.metodo]), [[350, "CUP", "efectivo"], [20, "USD", "banca_remota"]]);
  const s = C.analizarTexto("200 pan, 1500 pollo por banca", ctx);
  assert.deepStrictEqual(s.map((x) => x.datos.metodo), ["banca_remota", "banca_remota"]);
});
