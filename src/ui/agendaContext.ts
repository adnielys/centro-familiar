/** Une el store y Google Calendar en las fuentes que necesita el motor de agenda. */
import type { FuentesAgenda } from "../domain/agenda";
import { store } from "../data/store";
import { googleCalendar } from "../integrations/googleCalendar";

export const fuentesAgenda = (): FuentesAgenda => ({
  config: store.config,
  actividades: store.data.actividades,
  hijos: store.data.hijos,
  bloques: store.data.bloques,
  externas: (fecha) => googleCalendar.ocupaciones(fecha),
});
