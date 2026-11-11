// OCR runs fully in the browser with Tesseract.js, loaded from a CDN on first use.
import { isSplitsText, mergeParsed, parseStravaText, type ParsedScreen } from "./stravaParse";

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

/**
 * Grayscale, then paint coloured pixels (Strava's blue split bars, badges, orange buttons)
 * with the background shade so they cannot merge with the numbers, then invert dark-mode
 * screenshots and stretch contrast: Tesseract reads dark text on white best.
 */
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

  const n = d.length / 4;
  const gray = new Float32Array(n);
  const colored = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const r = d[i * 4];
    const g = d[i * 4 + 1];
    const b = d[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    colored[i] = Math.max(r, g, b) - Math.min(r, g, b) > 50 ? 1 : 0;
    if (!colored[i]) hist[Math.round(gray[i])]++;
  }
  let bg = 0;
  for (let v = 1; v < 256; v++) if (hist[v] > hist[bg]) bg = v;
  const dark = bg < 128;

  let lo = 255;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    let v = colored[i] ? bg : gray[i];
    if (dark) v = 255 - v;
    gray[i] = v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < n; i++) {
    const v = ((gray[i] - lo) * 255) / range;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Kilometres read, with heart rate counting double. */
function splitsScore(splits?: { hr?: number }[]): number {
  return (splits ?? []).reduce((sum, s) => sum + (s.hr ? 2 : 1), 0);
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
    const parts: ParsedScreen[] = [];
    for (const [i, file] of files.entries()) {
      onProgress(0, files.length > 1 ? `Odczytuję screen ${i + 1} z ${files.length}…` : "Odczytuję dane…");
      const image = await preprocess(file);
      await worker.setParameters({ tessedit_pageseg_mode: "3" });
      const { data } = await worker.recognize(image);
      const parsed = parseStravaText(data.text);
      if (isSplitsText(data.text)) {
        // Automatic layout splits the table into columns (paces without heart rate); read it
        // again as rows and keep the most complete reading.
        for (const psm of ["4", "6"]) {
          await worker.setParameters({ tessedit_pageseg_mode: psm });
          const again = parseStravaText((await worker.recognize(image)).data.text);
          if (splitsScore(again.splits) > splitsScore(parsed.splits)) parsed.splits = again.splits;
        }
      }
      parts.push(parsed);
    }
    return mergeParsed(parts);
  } finally {
    await worker.terminate();
  }
}
