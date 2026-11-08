// OCR runs fully in the browser with Tesseract.js, loaded from a CDN on first use.
import { mergeParsed, parseStravaText, type ParsedScreen } from "./stravaParse";

type TesseractWorker = {
  setParameters(p: Record<string, string>): Promise<unknown>;
  recognize(image: HTMLCanvasElement): Promise<{ data: { text: string } }>;
  terminate(): Promise<unknown>;
};
type TesseractGlobal = {
  createWorker(lang: string, oem?: number, options?: { logger?: (m: { status: string; progress: number }) => void }): Promise<TesseractWorker>;
};

const CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
let loading: Promise<TesseractGlobal> | null = null;

function loadTesseract(): Promise<TesseractGlobal> {
  const existing = (window as unknown as { Tesseract?: TesseractGlobal }).Tesseract;
  if (existing) return Promise.resolve(existing);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CDN;
    s.async = true;
    s.onload = () => resolve((window as unknown as { Tesseract: TesseractGlobal }).Tesseract);
    s.onerror = () => {
      loading = null;
      reject(new Error("Nie udało się pobrać modułu OCR. Sprawdź połączenie."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Grayscale + invert dark-mode screenshots + stretch contrast: Tesseract reads dark text on white best. */
async function preprocess(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = bitmap.width < 900 ? 2 : 1;
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width * scale;
  canvas.height = bitmap.height * scale;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;

  let sum = 0;
  const gray = new Uint8ClampedArray(d.length / 4);
  for (let i = 0; i < gray.length; i++) {
    const g = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    gray[i] = g;
    sum += g;
  }
  const dark = sum / gray.length < 128;
  let lo = 255;
  let hi = 0;
  for (let i = 0; i < gray.length; i++) {
    if (dark) gray[i] = 255 - gray[i];
    lo = Math.min(lo, gray[i]);
    hi = Math.max(hi, gray[i]);
  }
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < gray.length; i++) {
    const v = ((gray[i] - lo) * 255) / range;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export async function readScreenshots(files: File[], onProgress: (p: number, label: string) => void): Promise<ParsedScreen> {
  onProgress(0, "Ładuję moduł OCR…");
  const T = await loadTesseract();
  const worker = await T.createWorker("pol", 1, {
    logger: (m) => {
      if (m.status === "recognizing text") onProgress(m.progress, "Odczytuję dane…");
      else if (m.status.includes("loading")) onProgress(0, "Pobieram model języka…");
    },
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: "3" });
    const parts: ParsedScreen[] = [];
    for (const [i, file] of files.entries()) {
      onProgress(0, files.length > 1 ? `Odczytuję screen ${i + 1} z ${files.length}…` : "Odczytuję dane…");
      const { data } = await worker.recognize(await preprocess(file));
      parts.push(parseStravaText(data.text));
    }
    return mergeParsed(parts);
  } finally {
    await worker.terminate();
  }
}
