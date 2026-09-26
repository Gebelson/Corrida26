"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Copy,
  ImagePlus,
  ScanLine,
  Send,
  Smartphone,
  Upload,
  XCircle,
} from "lucide-react";
import { inspectPixPayload, type PixInspection } from "@/lib/pix-emv";
import styles from "./pix-lab.module.css";

type Platform = "android" | "ios" | "other";
type DetectedBarcode = { rawValue?: string };
type Detector = { detect(source: HTMLCanvasElement): Promise<DetectedBarcode[]> };
type DetectorConstructor = {
  new (options?: { formats?: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
};
type Capabilities = {
  platform: Platform;
  barcodeDetector: boolean;
  webShare: boolean;
  secure: boolean;
  standalone: boolean;
};

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível abrir esta imagem."));
    image.src = url;
  });
}

function copyNow(value: string) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.cssText = "position:fixed;left:-9999px;opacity:0";
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  textarea.remove();
  const modernClipboard = window.isSecureContext && Boolean(navigator.clipboard);
  if (modernClipboard) {
    void navigator.clipboard.writeText(value).catch(() => undefined);
  }
  return copied || modernClipboard;
}

export function PixLab() {
  const inputRef = useRef<HTMLInputElement>(null);
  const handoffCleanupRef = useRef<() => void>(() => undefined);
  const [preview, setPreview] = useState("");
  const [fileName, setFileName] = useState("");
  const [payload, setPayload] = useState("");
  const [inspection, setInspection] = useState<PixInspection | null>(null);
  const [method, setMethod] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    const nav = navigator as Navigator & { standalone?: boolean };
    setCapabilities({
      platform: /Android/i.test(ua)
        ? "android"
        : /iPhone|iPad|iPod/i.test(ua)
          ? "ios"
          : "other",
      barcodeDetector: "BarcodeDetector" in window,
      webShare: typeof navigator.share === "function",
      secure: window.isSecureContext,
      standalone:
        matchMedia("(display-mode: standalone)").matches || nav.standalone === true,
    });
    return () => handoffCleanupRef.current();
  }, []);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  function updatePayload(value: string) {
    setPayload(value);
    setInspection(value.trim() ? inspectPixPayload(value) : null);
  }

  async function readQr(imageUrl: string) {
    const image = await loadImage(imageUrl);
    const scale = Math.min(
      1,
      2400 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("Seu navegador não permitiu analisar a imagem.");
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const NativeDetector = (
      window as typeof window & { BarcodeDetector?: DetectorConstructor }
    ).BarcodeDetector;
    if (NativeDetector) {
      try {
        const formats = NativeDetector.getSupportedFormats
          ? await NativeDetector.getSupportedFormats()
          : ["qr_code"];
        if (formats.includes("qr_code")) {
          const results = await new NativeDetector({ formats: ["qr_code"] }).detect(
            canvas,
          );
          const values = results
            .map((item) => item.rawValue?.trim())
            .filter((value): value is string => Boolean(value));
          const value =
            values.find((item) => inspectPixPayload(item).isPix) ?? values[0];
          if (value) return { value, method: "BarcodeDetector do navegador" };
        }
      } catch {
        // O fallback local continua abaixo.
      }
    }

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const { default: jsQR } = await import("jsqr");
    const result = jsQR(pixels.data, pixels.width, pixels.height, {
      inversionAttempts: "attemptBoth",
    });
    if (!result?.data) {
      throw new Error(
        "Nenhum QR Code legível foi encontrado. Tente uma imagem mais nítida e sem cortes.",
      );
    }
    return { value: result.data.trim(), method: "jsQR local" };
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Escolha uma imagem PNG, JPEG ou WebP.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("A imagem deve ter no máximo 15 MB.");
      return;
    }

    const imageUrl = URL.createObjectURL(file);
    setPreview(imageUrl);
    setFileName(file.name);
    setBusy(true);
    setError("");
    setNotice("");
    setMethod("");
    updatePayload("");
    try {
      const result = await readQr(imageUrl);
      updatePayload(result.value);
      setMethod(result.method);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível ler o QR Code.",
      );
    } finally {
      setBusy(false);
    }
  }

  function handleCopy() {
    const copied = copyNow(payload);
    setNotice(
      copied
        ? "Pix copiado."
        : "Não foi possível copiar automaticamente. Selecione o payload manualmente.",
    );
  }

  function handleNativeView() {
    if (!inspection?.valid) return;
    const platform = capabilities?.platform ?? "other";
    copyNow(inspection.payload);
    if (platform === "other") {
      setNotice(
        "O teste ACTION_VIEW/custom scheme está disponível apenas em Android e iPhone. O Pix foi copiado.",
      );
      return;
    }

    handoffCleanupRef.current();
    let leftPage = false;
    let timer: number | undefined;
    const cleanup = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      handoffCleanupRef.current = () => undefined;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        leftPage = true;
        setNotice(
          "O navegador perdeu visibilidade, sinal de que algum handler pode ter sido aberto. Isso não confirma que o banco recebeu o Pix.",
        );
      } else if (leftPage) {
        cleanup();
        setNotice(
          "Você voltou ao laboratório. Confirme no app se o Pix foi carregado; o código também ficou copiado.",
        );
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    timer = window.setTimeout(() => {
      if (!leftPage) {
        setNotice(
          "Nenhum handler compatível respondeu. O Pix foi copiado; abra seu banco e use Pix Copia e Cola.",
        );
      }
      cleanup();
    }, 1800);
    handoffCleanupRef.current = cleanup;

    const encoded = encodeURIComponent(inspection.payload);
    const target =
      platform === "android"
        ? "intent://pay?payload=" +
          encoded +
          "#Intent;scheme=pix;action=android.intent.action.VIEW;end"
        : "pix://pay?payload=" + encoded;
    setNotice("Tentando ACTION_VIEW/custom scheme experimental… O Pix já foi copiado.");
    try {
      window.location.assign(target);
    } catch {
      cleanup();
      setNotice(
        "O navegador bloqueou o scheme experimental. O Pix continua copiado.",
      );
    }
  }

  async function handleActionSend() {
    if (!inspection?.valid) return;
    const copied = copyNow(inspection.payload);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Pagamento Pix",
          text: inspection.payload,
        });
        setNotice(
          "ACTION_SEND/Web Share aberto. Isso compartilha texto e não garante preenchimento no banco.",
        );
        return;
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") {
          setNotice(
            copied
              ? "Compartilhamento cancelado. O Pix continua copiado."
              : "Compartilhamento cancelado.",
          );
          return;
        }
      }
    }
    setNotice(
      copied
        ? "Web Share indisponível. O Pix foi copiado."
        : "Web Share indisponível; copie o payload manualmente.",
    );
  }

  return (
    <main id="main-content" className={styles.page}>
      <section className={styles.hero}>
        <span className={styles.eyebrow}>
          EXPERIMENTO ISOLADO · NÃO GERA COBRANÇA
        </span>
        <h1>LABORATÓRIO PIX</h1>
        <p>
          Envie uma screenshot. A leitura acontece somente neste aparelho e a
          imagem não é enviada ao servidor.
        </p>
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <ImagePlus aria-hidden="true" />
            <div>
              <span>ETAPA A</span>
              <h2>LER O QR SEM CÂMERA</h2>
            </div>
          </div>
          <input
            ref={inputRef}
            className={styles.fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFile}
          />
          <button
            className={styles.upload}
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            <Upload aria-hidden="true" />
            {busy ? "Analisando no aparelho…" : "Escolher screenshot com QR Pix"}
          </button>
          {fileName && <p className={styles.fileName}>{fileName}</p>}
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.preview}
              src={preview}
              alt="Imagem escolhida para leitura do QR Code"
            />
          )}
          {error && (
            <p className={styles.error} role="alert">
              <XCircle aria-hidden="true" />
              {error}
            </p>
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <ScanLine aria-hidden="true" />
            <div>
              <span>RESULTADO LOCAL</span>
              <h2>PAYLOAD ENCONTRADO</h2>
            </div>
          </div>
          <label className={styles.label} htmlFor="pix-payload">
            Pix Copia e Cola / EMV
          </label>
          <textarea
            id="pix-payload"
            className={styles.payload}
            value={payload}
            onChange={(event) => updatePayload(event.target.value)}
            placeholder="O conteúdo 000201… aparecerá aqui. Você também pode colar um payload para validá-lo."
            spellCheck={false}
          />
          {method && (
            <p className={styles.method}>
              Decodificado por: <strong>{method}</strong>
            </p>
          )}
          {inspection && (
            <div className={inspection.valid ? styles.valid : styles.invalid}>
              {inspection.valid ? (
                <CheckCircle2 aria-hidden="true" />
              ) : (
                <XCircle aria-hidden="true" />
              )}
              <div>
                <strong>
                  {inspection.valid
                    ? "Pix válido"
                    : inspection.isPix
                      ? "Pix encontrado, mas inválido"
                      : "O conteúdo não foi reconhecido como Pix"}
                </strong>
                {inspection.errors.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>
          )}
          {inspection?.valid && (
            <dl className={styles.details}>
              <div>
                <dt>Recebedor</dt>
                <dd>{inspection.merchantName || "Não informado"}</dd>
              </div>
              <div>
                <dt>Valor</dt>
                <dd>
                  {inspection.amount
                    ? "R$ " + inspection.amount.replace(".", ",")
                    : "Definido no banco"}
                </dd>
              </div>
              <div>
                <dt>TXID</dt>
                <dd>{inspection.txid || "Não informado"}</dd>
              </div>
              <div>
                <dt>CRC16</dt>
                <dd>Válido</dd>
              </div>
            </dl>
          )}
          <p className={styles.nativeWarning}>
            ACTION_VIEW/custom scheme é experimental: <code>pix://</code> não é
            um padrão registrado por Android, iOS ou Banco Central.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={handleCopy}
              disabled={!payload}
            >
              <Copy aria-hidden="true" />
              Copiar payload
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={handleActionSend}
              disabled={!inspection?.valid}
            >
              <Send aria-hidden="true" />
              Compartilhar (ACTION_SEND)
            </button>
            <button
              type="button"
              className={styles.primary}
              onClick={handleNativeView}
              disabled={!inspection?.valid}
            >
              <Smartphone aria-hidden="true" />
              Pagar este Pix (ACTION_VIEW)
            </button>
          </div>
          {notice && (
            <p className={styles.notice} role="status">
              {notice}
            </p>
          )}
        </article>
      </section>

      <section className={styles.matrix} aria-labelledby="limites-title">
        <span className={styles.eyebrow}>
          O QUE O NAVEGADOR CONSEGUE FAZER
        </span>
        <h2 id="limites-title">DA IMAGEM ATÉ O BANCO</h2>
        <div className={styles.steps}>
          <article>
            <b>A</b>
            <strong>Decodificar</strong>
            <span className={styles.yes}>SIM</span>
            <p>BarcodeDetector quando disponível; jsQR como fallback local.</p>
          </article>
          <article>
            <b>B</b>
            <strong>Marcar como Pix no sistema</strong>
            <span className={styles.no}>NÃO PADRONIZADO</span>
            <p>A web não acessa o classificador privado usado pela câmera.</p>
          </article>
          <article>
            <b>C</b>
            <strong>Abrir um banco</strong>
            <span className={styles.partial}>EXPERIMENTAL</span>
            <p>
              ACTION_VIEW só funciona se um app registrar exatamente o scheme
              testado.
            </p>
          </article>
          <article>
            <b>D</b>
            <strong>Pix já preenchido</strong>
            <span className={styles.no}>SEM PADRÃO WEB</span>
            <p>
              Exige deep link oficial do banco ou iniciação de pagamento/Open
              Finance.
            </p>
          </article>
        </div>
        <div className={styles.runtime}>
          <span>
            Ambiente: <strong>{capabilities?.platform ?? "detectando"}</strong>
          </span>
          <span>
            BarcodeDetector:{" "}
            <strong>
              {capabilities?.barcodeDetector ? "disponível" : "fallback jsQR"}
            </strong>
          </span>
          <span>
            Web Share:{" "}
            <strong>
              {capabilities?.webShare ? "disponível" : "indisponível"}
            </strong>
          </span>
          <span>
            PWA:{" "}
            <strong>{capabilities?.standalone ? "instalada" : "navegador"}</strong>
          </span>
          <span>
            HTTPS: <strong>{capabilities?.secure ? "sim" : "não"}</strong>
          </span>
        </div>
      </section>
    </main>
  );
}
