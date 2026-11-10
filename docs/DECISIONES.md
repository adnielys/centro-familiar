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
