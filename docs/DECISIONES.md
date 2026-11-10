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
