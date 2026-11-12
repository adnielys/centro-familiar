# Decisiones

## 2026-11-10 · Tickets: miles con espacio y un solo decimal

**Decisión.** El lector de tickets (`src/domain/ticket.ts`) acepta importes como `6 240.0`
o `12 100.00`: miles separados por espacio y uno o dos decimales.

**Motivo.** Las cajas de cafeterías y mipymes cubanas imprimen así los importes. Antes solo se
aceptaban dos decimales y separador `.`/`,`, así que en un ticket real (Santa Barbara SURL) se
perdían los artículos de más de 999 CUP y el total se leía como 700 en lugar de 12 700.

**Límite.** Con espacio solo se admiten 1–2 cifras delante del grupo de miles, para no pegar un
formato o una cantidad al precio (`COCA COLA 600 370.00` sigue siendo 370). Queda un caso ambiguo
que el texto no permite resolver: `Pan 3 100.00` se lee como 3 100.

**OCR.** Se probaron variantes de preprocesado (escalar ×2, binarización adaptativa, PSM 4 y 6)
con la foto del ticket: ninguna superó al preprocesado actual (gris + contraste, PSM 3), así que no
se cambió.

## 2026-11-10 · Tickets: total mal leído

**Decisión.** Si el total impreso que lee el OCR es menor que la mitad de lo que suman los
artículos, se descarta y se usa el subtotal (con la misma comprobación). Si ninguno es creíble, no
hay total de referencia.

**Motivo.** En una foto real el OCR leyó `TOTAL CUP: 12 700.00` como `12 10.0`, y la pantalla de
revisión decía "total impreso 10.00" y que los artículos sumaban más que el total, lo que confunde.
Un ticket real no tiene un total por debajo de la mitad de sus líneas salvo descuentos enormes, que
son rarísimos.

## 2026-11-10 · Tickets de cafetería: Alimentación por defecto

**Decisión.** Si un ticket es de cafetería, restaurante o paladar, lo que el diccionario no
reconoce se clasifica como Alimentación en vez de Otros, igual que ya pasaba con los supermercados.
Se reconoce por el nombre en la cabecera (cafetería, paladar, pizzería, bar…) o por pistas del
cuerpo: líneas que empiezan por "Mesa:", "Le atiende", "Mesero", "Comensales", "Propina",
"Servicio:" o "Domicilio:".

**Motivo.** Añadir palabras una a una al diccionario (malta, sándwich…) no escala: cada producto
nuevo caía en Otros. Muchos tickets cubanos no dicen "cafetería" en el nombre (Santa Barbara SURL),
pero sí llevan mesa y quién atiende. Se mantienen también las palabras añadidas al diccionario,
para que esos productos salgan bien en cualquier comercio. Las correcciones manuales siguen
creando reglas aprendidas, que tienen prioridad.

## 2026-11-12 · Gastos y Balance en pantallas separadas

**Decisión.** La pestaña Dinero se divide en dos pantallas con un selector arriba (Gastos | Balance):
- **Gastos** (`#gastos`): resumen del mes que enlaza al balance, registrar gasto (abierto y
  primero), gastos fijos (arriba solo los pendientes; pagados y pausados plegados) y movimientos
  con su propio selector de mes.
- **Balance** (`#balance`): mes con flechas ‹ ›, balance, promedio de cierres, ideal por
  categoría, análisis y cortes anteriores.

Balance no tiene pestaña propia en la barra inferior (la vista marca la de Dinero con `tab`).

**Motivo.** La pantalla única medía más de dos alturas de móvil vacía y mucho más con datos;
registrar un gasto, que es lo más frecuente, quedaba debajo del balance y del análisis. Una sexta
pieza en la barra no cabe bien a 390 px y el balance se consulta menos que registrar.

## 2026-11-12 · Promedio de cierres e ideal por categoría

**Decisión.**
- El promedio usa los últimos 3, 6 o 12 **meses cerrados** anteriores al mes que se mira (el mes
  en curso no está completo). Se calcula con los gastos guardados, no con la foto del corte, que
  solo guarda 8 categorías y mezcla base con variable.
- El **ideal** de cada categoría es la **mediana** de su gasto variable en esos meses (un mes sin
  gasto cuenta como 0), con un ajuste opcional de −5 % o −10 %, redondeado hacia arriba (centenas
  en CUP, de 5 en 5 en USD). Los gastos base no tienen ideal: ya tienen su importe.
- El **ritmo** proyecta el gasto a fin de mes desde el día 7 y avisa si pasaría el ideal en más de
  un 5 %. Una categoría que se suele pagar de una vez al mes (luz, recarga) no se proyecta.
- Rango y ajuste se guardan en `Config.presupuesto`.

**Motivo.** La mediana evita que un mes raro (un cumpleaños) infle el ideal, cosa que haría la
media. Antes del día 7 una sola compra grande dispara la proyección. Proyectar un pago único hecho
el día 10 daba avisos falsos (Servicios: "a este ritmo, 6 200" con un ideal de 2 500).
