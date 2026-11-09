import { describe, expect, it } from "vitest";
import { esSupermercado, gastosDeTicket, leerTicket, limpiarDescripcion, parsePrecio, type LineaRevisada } from "../src/domain/ticket";

const WALMART = `
WALMART SUPERCENTER
SUC. CANCUN 1234
RFC: NWM9709244W4
FECHA 09/11/2026 10:32
LECHE LALA ENTERA 1L 7501020500016 27.50 A
PAN BIMBO BLANCO 7441029500018 49.00 A
2 @ 18.50
REFRESCO COCA COLA 600 37.00 A
PLATANO TABASCO
1.250 kg @ 24.00 /kg 30.00 N
DETERGENTE ARIEL 1KG 7500435140000 89.90 A
DESCUENTO ROLLBACK -10.00
HUEVO BLANCO 18 PZ 65.00
SUBTOTAL 288.40
IVA 0.00
TOTAL 288.40
EFECTIVO 300.00
CAMBIO 11.60
ARTICULOS VENDIDOS 6
GRACIAS POR SU COMPRA
`;

describe("parsePrecio", () => {
  it("entiende separadores de miles y decimales en ambos formatos", () => {
    expect(parsePrecio("1,234.50")).toBe(1234.5);
    expect(parsePrecio("1.234,50")).toBe(1234.5);
    expect(parsePrecio("25,00")).toBe(25);
    expect(parsePrecio("$89.90")).toBe(89.9);
    expect(parsePrecio("300")).toBeNull();
  });
});

describe("limpiarDescripcion", () => {
  it("quita códigos de barras, indicadores y capitaliza", () => {
    expect(limpiarDescripcion("LECHE LALA ENTERA 1L 7501020500016")).toBe("Leche lala entera 1l");
    expect(limpiarDescripcion("0042 PAN BIMBO A")).toBe("Pan bimbo");
  });
});

describe("leerTicket", () => {
  const t = leerTicket(WALMART);

  it("detecta cada artículo con su importe", () => {
    expect(t.articulos).toEqual([
      { descripcion: "Leche lala entera 1l", monto: 27.5 },
      { descripcion: "Pan bimbo blanco", monto: 49 },
      { descripcion: "Refresco coca cola 600", monto: 37 },
      { descripcion: "Platano tabasco", monto: 30 },
      { descripcion: "Detergente ariel 1kg", monto: 79.9 },
      { descripcion: "Huevo blanco 18 pz", monto: 65 },
    ]);
  });

  it("aplica el descuento al artículo anterior y cuadra con el total", () => {
    expect(t.total).toBe(288.4);
    expect(t.suma).toBe(288.4);
    expect(t.diferencia).toBe(0);
  });

  it("ignora pagos, cambio, impuestos y pie del ticket", () => {
    const textos = t.articulos.map((a) => a.descripcion.toLowerCase()).join(" ");
    expect(textos).not.toMatch(/efectivo|cambio|iva|total|gracias|articulos/);
  });

  it("reconoce el comercio", () => {
    expect(t.comercio).toBe("Walmart");
    expect(esSupermercado(t.comercio)).toBe(true);
  });

  it("informa la diferencia cuando el total incluye impuestos no desglosados", () => {
    const r = leerTicket("MIPYME LA ESQUINA\nArroz 5 lb 1.250,00\nAceite 1L 950,00\nTOTAL 2.300,00");
    expect(r.articulos.map((a) => a.monto)).toEqual([1250, 950]);
    expect(r.diferencia).toBe(100);
  });

  it("sin artículos legibles devuelve lista vacía", () => {
    expect(leerTicket("texto borroso\n???").articulos).toEqual([]);
  });
});

describe("gastosDeTicket", () => {
  const lineas: LineaRevisada[] = [
    { descripcion: "Leche", monto: 27.5, categoria: "Alimentación", incluida: true },
    { descripcion: "Pan", monto: 49, categoria: "Alimentación", incluida: true },
    { descripcion: "Detergente", monto: 79.9, categoria: "Hogar", incluida: true },
    { descripcion: "Bolsa", monto: 3, categoria: "Otros", incluida: false },
  ];
  const comunes = { fecha: "2026-11-09", moneda: "USD", metodo: "efectivo", comercio: "Walmart" } as const;

  it("cada artículo: un gasto por línea incluida, con el comercio en la descripción", () => {
    const g = gastosDeTicket(lineas, "articulos", comunes);
    expect(g).toHaveLength(3);
    expect(g[0]).toMatchObject({ monto: 27.5, categoria: "Alimentación", descripcion: "Leche · Walmart", origen: "ocr", naturaleza: "variable", moneda: "USD" });
  });

  it("por categoría: suma por categoría", () => {
    const g = gastosDeTicket(lineas, "categorias", comunes);
    expect(g.map((x) => [x.categoria, x.monto])).toEqual([["Alimentación", 76.5], ["Hogar", 79.9]]);
    expect(g[0].descripcion).toBe("Walmart (2 art.: Leche, Pan)");
  });

  it("un solo gasto: total en la categoría con más importe", () => {
    const [g] = gastosDeTicket(lineas, "uno", comunes);
    expect(g).toMatchObject({ monto: 156.4, categoria: "Hogar" });
  });

  it("sin líneas válidas no genera gastos", () => {
    expect(gastosDeTicket(lineas.map((l) => ({ ...l, incluida: false })), "uno", comunes)).toEqual([]);
  });
});
