import { IncomingMessage } from 'http';

export function toWhatsAppId(e164: string): string {
  return e164.startsWith('whatsapp:') ? e164 : `whatsapp:${e164}`;
}

export function fromWhatsAppId(waId: string): string {
  return waId.replace(/^whatsapp:/, '');
}

export function parseFormBody(body: Buffer): Record<string, string> {
  const params = new URLSearchParams(body.toString('utf-8'));
  const result: Record<string, string> = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}

export function collectRequestBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
