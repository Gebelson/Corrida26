export type EmvField = { id: string; length: number; value: string };

export type PixInspection = {
  payload: string;
  isPix: boolean;
  valid: boolean;
  crcValid: boolean;
  errors: string[];
  merchantName?: string;
  merchantCity?: string;
  amount?: string;
  txid?: string;
  gui?: string;
};

type ParseResult = { fields: EmvField[]; error?: string };

export function normalizePixPayload(value: string) {
  return value.trim().replace(/[\r\n\t]/g, "");
}

export function parseEmvTlv(value: string): ParseResult {
  const fields: EmvField[] = [];
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const bytes = encoder.encode(value);
  let cursor = 0;

  while (cursor < bytes.length) {
    if (cursor + 4 > bytes.length) {
      return { fields, error: "Campo EMV incompleto." };
    }

    const id = decoder.decode(bytes.slice(cursor, cursor + 2));
    const lengthText = decoder.decode(bytes.slice(cursor + 2, cursor + 4));
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lengthText)) {
      return { fields, error: `Campo EMV inválido na posição ${cursor}.` };
    }

    const length = Number(lengthText);
    const start = cursor + 4;
    const end = start + length;
    if (end > bytes.length) {
      return { fields, error: `Tamanho inválido no campo ${id}.` };
    }

    fields.push({ id, length, value: decoder.decode(bytes.slice(start, end)) });
    cursor = end;
  }

  return { fields };
}

export function computePixCrc(valueThrough6304: string) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(valueThrough6304)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc =
        (crc & 0x8000) !== 0
          ? ((crc << 1) ^ 0x1021) & 0xffff
          : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function getField(fields: EmvField[], id: string) {
  return fields.find((field) => field.id === id)?.value;
}

export function inspectPixPayload(rawValue: string): PixInspection {
  const payload = normalizePixPayload(rawValue);
  const errors: string[] = [];
  const parsed = parseEmvTlv(payload);
  if (parsed.error) errors.push(parsed.error);

  const fields = parsed.fields;
  const format = getField(fields, "00");
  if (format !== "01") {
    errors.push("Formato EMV esperado (00=01) não encontrado.");
  }

  let gui: string | undefined;
  for (const field of fields) {
    const numericId = Number(field.id);
    if (numericId < 26 || numericId > 51) continue;
    const nested = parseEmvTlv(field.value);
    const candidate = getField(nested.fields, "00");
    if (candidate?.toLowerCase() === "br.gov.bcb.pix") {
      gui = candidate;
      break;
    }
  }

  if (!gui) errors.push("Identificador BR.GOV.BCB.PIX não encontrado.");
  if (getField(fields, "53") !== "986") {
    errors.push("Moeda BRL (986) não encontrada.");
  }
  if (getField(fields, "58") !== "BR") {
    errors.push("País BR não encontrado.");
  }

  const crcField = fields.length ? fields[fields.length - 1] : undefined;
  const crcShapeValid =
    crcField?.id === "63" &&
    crcField.length === 4 &&
    /^[0-9A-Fa-f]{4}$/.test(crcField.value);
  const expectedCrc = crcShapeValid ? computePixCrc(payload.slice(0, -4)) : "";
  const crcValid = Boolean(
    crcShapeValid && expectedCrc === crcField?.value.toUpperCase(),
  );
  if (!crcValid) errors.push("CRC16 do payload é inválido.");

  const additional = getField(fields, "62");
  const txid = additional
    ? getField(parseEmvTlv(additional).fields, "05")
    : undefined;
  const isPix = Boolean(format === "01" && gui);

  return {
    payload,
    isPix,
    valid: isPix && errors.length === 0,
    crcValid,
    errors,
    merchantName: getField(fields, "59"),
    merchantCity: getField(fields, "60"),
    amount: getField(fields, "54"),
    txid,
    gui,
  };
}
