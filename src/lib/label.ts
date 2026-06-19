// Utilitários para imprimir/baixar etiquetas de envio retornadas pela SP-API.
//
// A Amazon entrega a etiqueta em PDF, ZPL (impressoras térmicas Zebra) ou PNG,
// codificada em Base64. PDF/PNG são abertos numa nova aba com o diálogo de
// impressão; ZPL é baixado como arquivo .zpl (deve ser enviado direto à Zebra).

export type LabelFormat = "PDF" | "ZPL";

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s/g, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export interface RenderLabelOptions {
  base64: string;
  contentType?: string;
  format?: LabelFormat;
  fileBaseName: string;
}

// Decide entre impressão (PDF/PNG) e download (ZPL) a partir do content-type
// retornado pela Amazon e do formato escolhido pelo usuário.
export function renderLabel(opts: RenderLabelOptions): "printed" | "downloaded" {
  const { base64, contentType = "", format, fileBaseName } = opts;
  const bytes = base64ToBytes(base64);

  const isPdf = /pdf/i.test(contentType);
  const isPng = /png|image/i.test(contentType);
  const isZpl = /zpl/i.test(contentType) || (format === "ZPL" && !isPdf && !isPng);

  // ZPL é texto de impressora térmica: não há como "imprimir" no navegador, baixamos.
  if (isZpl) {
    triggerDownload(new Blob([bytes], { type: "application/octet-stream" }), `${fileBaseName}.zpl`);
    return "downloaded";
  }

  const type = isPng ? "image/png" : "application/pdf";
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");

  if (!win) {
    // Pop-up bloqueado: cai para download do arquivo.
    triggerDownload(blob, `${fileBaseName}.${isPng ? "png" : "pdf"}`);
    return "downloaded";
  }

  const tryPrint = () => {
    try {
      win.focus();
      win.print();
    } catch {
      /* alguns navegadores bloqueiam print() cross-origin; o usuário imprime manualmente */
    }
  };
  win.addEventListener("load", tryPrint);
  setTimeout(tryPrint, 1200);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return "printed";
}
