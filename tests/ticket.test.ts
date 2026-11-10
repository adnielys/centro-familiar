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

  it("entiende miles separados por espacio y un solo decimal (cajas cubanas)", () => {
    expect(parsePrecio("6 240.0")).toBe(6240);
    expect(parsePrecio("12 100.00")).toBe(12100);
    expect(parsePrecio("25,5")).toBe(25.5);
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

/** Ticket de una cafetería cubana: cantidad delante, miles con espacio, un decimal y domicilio aparte. */
const CAFETERIA = `
SANTA BARBARA SURL
Le atiende: Cajero Ricardo
Cajero: Cajero Ricardo
Cliente: lisandra - 23 mar. 2026
14:14
Mesa: MESA15
Fecha: 10/11/2026
- - - - - - - - - - - - - -
4 PIZZA MARGARITA 6 240.0
6 DOMICILIO 0.00
1 RAC CEBOLLA 300.00
1 MALTA VAN PUR 780.00
1 REF PINA MAX BOOMS BO 940.00
2 SANDWICH D/ATUN 3 840.0
- - - - - - - - - - - - - -
DOMICILIO: 600.00
SUBTOTAL: 12 100.00
DESCUENTO %:
TOTAL CUP: 12 700.00
lisandra - 23 mar. 2026 14:14
58070349
piso 13 g
`;

/** Lo que Tesseract leyó de la foto real de ese ticket (con rayas y errores). */
const CAFETERIA_OCR = `
SANTA BARBARA SURL
a le atiende: Cajero Ricardo
Cajero: Cajero Ricardo
E   Hen Visandra - 23 mar. 2026  e
Mesa: MESAI5                      f
Fecha: 10/11/2026                         E—.
4 PIZZA MARGARITA 6 240.0
—  DOMICILIO     0.00
6
1 RAC CEBOLLA       300.00
1 MALTA. VAN PUR      780.00
— E... PINA MAX B00MS BO 940.00
2 Siomco/anin a 0d.0
CILTO:           600.00
— md          000
SUBTOTAL:
DESCUENTO %:
TOTAL O;       700
nr - 3 nr 28M
`;

describe("leerTicket · cafetería cubana", () => {
  const t = leerTicket(CAFETERIA);

  it("lee cada artículo con su importe, incluido el domicilio", () => {
    expect(t.articulos).toEqual([
      { descripcion: "Pizza margarita", monto: 6240 },
      { descripcion: "Rac cebolla", monto: 300 },
      { descripcion: "Malta van pur", monto: 780 },
      { descripcion: "Ref pina max booms bo", monto: 940 },
      { descripcion: "Sandwich d/atun", monto: 3840 },
      { descripcion: "Domicilio", monto: 600 },
    ]);
  });

  it("cuadra con el total impreso", () => {
    expect(t.total).toBe(12700);
    expect(t.suma).toBe(12700);
    expect(t.diferencia).toBe(0);
  });

  it("no pega una cantidad o un formato al precio", () => {
    expect(leerTicket("COCA COLA 600 370.00").articulos).toEqual([{ descripcion: "Coca cola 600", monto: 370 }]);
  });

  it("con el texto real del OCR recupera las líneas legibles", () => {
    const r = leerTicket(CAFETERIA_OCR);
    expect(r.articulos.map((a) => a.monto)).toEqual([6240, 300, 780, 940, 600]);
    expect(r.articulos[0].descripcion).toBe("Pizza margarita");
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
