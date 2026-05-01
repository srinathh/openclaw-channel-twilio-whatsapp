import fs from 'fs';
import path from 'path';
import { IncomingMessage, ServerResponse } from 'http';
import twilio from 'twilio';
import { parseFormBody, collectRequestBody, toWhatsAppId, fromWhatsAppId } from './util.js';
import { downloadTwilioMedia, getExtensionForType } from './media.js';

export interface WebhookConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  webhookUrl: string;
  allowFrom: Set<string>;
  inboundDir: string;
}

export interface InboundMessage {
  senderId: string;
  senderName: string;
  text: string;
  messageSid: string;
  mediaPath?: string;
  mediaPaths?: string[];
}

export type DispatchFn = (msg: InboundMessage) => void;

export function createWebhookHandler(config: WebhookConfig, dispatch: DispatchFn) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const body = await collectRequestBody(req);
      const params = parseFormBody(body);

      const signature = req.headers['x-twilio-signature'] as string;
      const valid = twilio.validateRequest(
        config.authToken,
        signature || '',
        config.webhookUrl + '/webhook/twilio-whatsapp',
        params,
      );
      if (!valid) {
        res.writeHead(403);
        res.end('Invalid signature');
        return;
      }

      const from = params.From || '';
      const senderPhone = fromWhatsAppId(from);
      if (!from || (config.allowFrom.size > 0 && !config.allowFrom.has(senderPhone))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end('<Response/>');

      const messageSid = params.MessageSid || '';
      const bodyText = params.Body || '';
      const profileName = params.ProfileName || senderPhone;
      const numMedia = parseInt(params.NumMedia || '0', 10);

      let content = bodyText;
      const mediaPaths: string[] = [];

      if (numMedia > 0) {
        for (let i = 0; i < numMedia; i++) {
          const mediaUrl = params[`MediaUrl${i}`];
          const contentType = params[`MediaContentType${i}`] || 'application/octet-stream';
          if (mediaUrl) {
            try {
              const buffer = await downloadTwilioMedia(mediaUrl, config.accountSid, config.authToken);
              const ext = getExtensionForType(contentType);
              const filePath = path.join(config.inboundDir, `${messageSid}-${i}${ext}`);
              fs.writeFileSync(filePath, buffer);
              mediaPaths.push(filePath);
              content += `\n[${contentType}: ${filePath}]`;
            } catch {
              content += `\n[media: ${contentType} (download failed)]`;
            }
          }
        }
      }

      if (!content.trim()) {
        content = '(empty message)';
      }

      dispatch({
        senderId: senderPhone,
        senderName: profileName,
        text: content.trim(),
        messageSid,
        mediaPath: mediaPaths[0],
        mediaPaths: mediaPaths.length > 0 ? mediaPaths : undefined,
      });
    } catch {
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  };
}

export function createHealthHandler() {
  return async (_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', channel: 'twilio-whatsapp' }));
  };
}
