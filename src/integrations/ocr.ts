/**
 * OCR local con Tesseract (WebAssembly). La imagen nunca sale del dispositivo.
 * El motor (~10 MB) se descarga la primera vez desde su CDN y el service worker lo guarda para uso sin conexión.
 */
import type { Worker as TesseractWorker } from "tesseract.js";

const MAX_SIDE = 2000;

export interface OcrProgress {
  status: string;
  progress: number;
}

let workerPromise: Promise<TesseractWorker> | null = null;
let onProgress: ((p: OcrProgress) => void) | null = null;

function getWorker(): Promise<TesseractWorker> {
  workerPromise ??= import("tesseract.js")
    .then(({ createWorker, OEM }) => createWorker("spa", OEM.LSTM_ONLY, { logger: (m: OcrProgress) => onProgress?.(m) }))
    .catch((e: unknown) => {
      workerPromise = null;
      throw e;
    });
  return workerPromise;
}

/** Reduce, pasa a gris y estira el contraste: mejora la lectura de tickets térmicos. */
async function preprocess(file: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("No se pudo abrir la imagen"));
      el.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas no disponible");
    ctx.drawImage(img, 0, 0, w, h);
    const image = ctx.getImageData(0, 0, w, h);
    const px = image.data;
    let min = 255;
    let max = 0;
    for (let i = 0; i < px.length; i += 4) {
      const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      px[i] = g;
      if (g < min) min = g;
      if (g > max) max = g;
    }
    const range = Math.max(1, max - min);
    for (let i = 0; i < px.length; i += 4) {
      const v = ((px[i] - min) * 255) / range;
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function reconocerTexto(file: Blob, progress?: (p: OcrProgress) => void): Promise<string> {
  onProgress = progress ?? null;
  try {
    const [worker, canvas] = await Promise.all([getWorker(), preprocess(file)]);
    const { data } = await worker.recognize(canvas);
    return data.text ?? "";
  } finally {
    onProgress = null;
  }
}
