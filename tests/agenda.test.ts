import { describe, expect, it } from "vitest";
import { comprobar, conflictos, fusionar, huecosLibres, minutosLibres, ocupacionesDelDia, siguienteHueco, type FuentesAgenda } from "../src/domain/agenda";
import { toMinutes as m } from "../src/domain/dates";
import type { Actividad, Bloque } from "../src/domain/types";

// Lunes 9 de noviembre de 2026
const LUNES = "2026-11-09";
const SABADO = "2026-11-14";

const actividad = (over: Partial<Actividad>): Actividad => ({
  id: "a1", hijoIds: ["k1"], titulo: "Natación", tipo: "deporte", dias: [1, 3], horaInicio: "17:30", horaFin: "18:30",
  lugar: "", llevar: "", meOcupa: true, ...over,
});
const bloque = (over: Partial<Bloque>): Bloque => ({ id: "b1", titulo: "Gimnasio", fecha: LUNES, inicio: "07:00", fin: "08:00", tareaId: null, ...over });

const base = (over: Partial<FuentesAgenda> = {}): FuentesAgenda => ({
  config: { jornada: { inicio: "07:00", fin: "22:00" }, trabajo: { activo: true, dias: [1, 2, 3, 4, 5], inicio: "09:00", fin: "17:00" } },
  hijos: [
    { id: "k1", nombre: "Ana", escuela: "", grado: "", color: "#000" },
    { id: "k2", nombre: "Leo", escuela: "", grado: "", color: "#111" },
  ],
  actividades: [actividad({})],
  bloques: [bloque({})],
  ...over,
});

describe("ocupacionesDelDia", () => {
  it("reúne trabajo, actividades de los niños y bloques, ordenados", () => {
    const occ = ocupacionesDelDia(LUNES, base());
    expect(occ.map((o) => [o.fuente, o.inicio, o.fin, o.titulo])).toEqual([
      ["bloque", m("07:00"), m("08:00"), "Gimnasio"],
      ["trabajo", m("09:00"), m("17:00"), "Trabajo"],
      ["hijos", m("17:30"), m("18:30"), "Natación (Ana)"],
    ]);
  });

  it("ignora actividades que no me ocupan y el trabajo en fin de semana", () => {
    const f = base({ actividades: [actividad({ meOcupa: false })], bloques: [] });
    expect(ocupacionesDelDia(LUNES, f).map((o) => o.fuente)).toEqual(["trabajo"]);
    expect(ocupacionesDelDia(SABADO, f)).toEqual([]);
  });

  it("una actividad compartida por varios hijos es un solo bloque con todos los nombres", () => {
    const f = base({ actividades: [actividad({ hijoIds: ["k1", "k2"] })], bloques: [] });
    const hijos = ocupacionesDelDia(LUNES, f).filter((o) => o.fuente === "hijos");
    expect(hijos.map((o) => o.titulo)).toEqual(["Natación (Ana, Leo)"]);
  });

  it("una actividad sin hora de fin dura 60 minutos", () => {
    const f = base({ actividades: [actividad({ horaFin: null })], bloques: [] });
    const hijos = ocupacionesDelDia(LUNES, f).find((o) => o.fuente === "hijos");
    expect(hijos?.fin).toBe(m("18:30"));
  });

  it("incluye ocupaciones externas (Google Calendar)", () => {
    const f = base({ externas: (fecha) => (fecha === LUNES ? [{ inicio: m("19:00"), fin: m("20:00"), fuente: "google", titulo: "Cena" }] : []) });
    expect(ocupacionesDelDia(LUNES, f).at(-1)?.titulo).toBe("Cena");
  });
});

describe("conflictos y comprobar", () => {
  it("detecta choque con la natación", () => {
    const c = conflictos(LUNES, m("18:00"), m("19:00"), base());
    expect(c.map((o) => o.titulo)).toEqual(["Natación (Ana)"]);
  });

  it("intervalos contiguos no chocan", () => {
    expect(conflictos(LUNES, m("08:00"), m("09:00"), base())).toEqual([]);
  });

  it("libre cuando no hay choques dentro de la jornada", () => {
    expect(comprobar(LUNES, m("08:00"), m("09:00"), base())).toEqual({ libre: true });
  });

  it("ocupado propone el siguiente hueco con la misma duración", () => {
    const v = comprobar(LUNES, m("16:30"), m("17:30"), base());
    expect(v.libre).toBe(false);
    if (!v.libre && "choques" in v) {
      expect(v.choques.map((c) => c.fuente)).toEqual(["trabajo"]);
      expect(v.alternativa).toEqual({ fecha: LUNES, inicio: m("18:30"), fin: m("19:30") });
    }
  });

  it("fuera de la jornada también avisa", () => {
    const v = comprobar(LUNES, m("22:30"), m("23:00"), base());
    expect(v.libre).toBe(false);
    expect("fueraDeJornada" in v).toBe(true);
  });

  it("al mover un bloque no choca consigo mismo", () => {
    expect(comprobar(LUNES, m("07:15"), m("08:00"), base(), "b1")).toEqual({ libre: true });
  });
});

describe("huecos libres", () => {
  it("calcula el complemento dentro de la jornada", () => {
    const h = huecosLibres(LUNES, base());
    expect(h).toEqual([
      { inicio: m("08:00"), fin: m("09:00") },
      { inicio: m("17:00"), fin: m("17:30") },
      { inicio: m("18:30"), fin: m("22:00") },
    ]);
    expect(minutosLibres(h)).toBe(60 + 30 + 210);
  });

  it("respeta la duración mínima y la hora actual", () => {
    expect(huecosLibres(LUNES, base(), 45).map((x) => x.inicio)).toEqual([m("08:00"), m("18:30")]);
    expect(huecosLibres(LUNES, base(), 15, m("19:10"))).toEqual([{ inicio: m("19:10"), fin: m("22:00") }]);
  });

  it("siguienteHueco salta al día siguiente si hoy no cabe", () => {
    const r = siguienteHueco(LUNES, m("21:30"), 60, base());
    expect(r).toEqual({ fecha: "2026-11-10", inicio: m("07:00"), fin: m("08:00") });
  });

  it("fusionar une solapados y contiguos", () => {
    expect(fusionar([{ inicio: 10, fin: 20 }, { inicio: 20, fin: 30 }, { inicio: 25, fin: 40 }, { inicio: 50, fin: 60 }])).toEqual([
      { inicio: 10, fin: 40 },
      { inicio: 50, fin: 60 },
    ]);
  });
});
