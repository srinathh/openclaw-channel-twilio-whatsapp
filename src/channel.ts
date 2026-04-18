import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';
import twilio from 'twilio';
import mime from 'mime-types';

// Use type `any` for the OpenClaw api parameter to bypass strict types while conforming to the requested schema.
export class TwilioWhatsAppChannel {
    private api: any;
    private client: twilio.Twilio;
    private accountSid: string;
    private authToken: string;
    private fromNumber: string;
    private webhookUrl: string;
    private allowedSenders: Set<string>;
    private outboundDir: string;
    private inboundDir: string;

    // The max chars per twilio message is 1600.
    private MAX_MESSAGE_LENGTH = 1600;

    constructor(api: any) {
        this.api = api;

        // Load configuration from env, possibly injected via operator Secrets
        this.accountSid = process.env.TWILIO_ACCOUNT_SID || '';
        this.authToken = process.env.TWILIO_AUTH_TOKEN || '';
        this.fromNumber = process.env.TWILIO_WHATSAPP_FROM || '';
        this.webhookUrl = process.env.TWILIO_WEBHOOK_URL || '';

        if (!this.accountSid || !this.authToken || !this.fromNumber || !this.webhookUrl) {
            throw new Error("Missing required Twilio environment variables. Ensure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, and TWILIO_WEBHOOK_URL are set.");
        }

        if (!process.env.OPENCLAW_ALLOWED_SENDERS) {
            throw new Error("OPENCLAW_ALLOWED_SENDERS environment variable is missing.");
        }

        let allowedSendersList: string[] = [];
        try {
            allowedSendersList = JSON.parse(process.env.OPENCLAW_ALLOWED_SENDERS);
        } catch (e) {
            throw new Error("Failed to parse OPENCLAW_ALLOWED_SENDERS. It must be a valid JSON array of strings.");
        }

        if (!Array.isArray(allowedSendersList) || allowedSendersList.length === 0) {
            throw new Error("OPENCLAW_ALLOWED_SENDERS must be a non-empty array of sender phone numbers.");
        }

        this.allowedSenders = new Set(allowedSendersList);

        this.client = twilio(this.accountSid, this.authToken);

        const appDir = process.env.OPENCLAW_DATA_DIR || '/srv/openclaw/data';

        this.outboundDir = path.join(appDir, 'media', 'outbound');
        this.inboundDir = path.join(appDir, 'media', 'inbound');

        fs.mkdirSync(this.outboundDir, { recursive: true });
        fs.mkdirSync(this.inboundDir, { recursive: true });

        // Register routes through OpenClaw API
        this.api.registerHttpRoute('POST', '/webhook/twilio-whatsapp', this.handleWebhook.bind(this));
        this.api.registerHttpRoute('GET', '/webhook/twilio-whatsapp/media/:filename', this.serveMedia.bind(this));
    }

    // Exposed properties OpenClaw might expect on the object
    get name() {
        return 'twilio-whatsapp';
    }

    // Note: the exact method signature here depends on OpenClaw's sdk expectations
    // but plan specifies: "Outbound send(to, text, mediaUrls)"
    async send(to: string, text: string, mediaFiles?: string[]): Promise<void> {
        try {
            const mediaUrls: string[] = [];
            if (mediaFiles && mediaFiles.length > 0) {
                for (const file of mediaFiles) {
                    const url = this.stageMedia(file);
                    if (url) {
                        mediaUrls.push(url);
                    }
                }
            }

            let cleanText = text || '📷';

            const msgOpts: any = {
                from: this.fromNumber,
                to,
                body: cleanText,
            };

            if (mediaUrls.length > 0) {
                msgOpts.mediaUrl = mediaUrls.slice(0, 10);
            }

            if (cleanText.length <= this.MAX_MESSAGE_LENGTH) {
                await this.client.messages.create(msgOpts);
            } else {
                const firstChunk = cleanText.slice(0, this.MAX_MESSAGE_LENGTH);
                await this.client.messages.create({ ...msgOpts, body: firstChunk });
                for (
                    let i = this.MAX_MESSAGE_LENGTH;
                    i < cleanText.length;
                    i += this.MAX_MESSAGE_LENGTH
                ) {
                    await this.client.messages.create({
                        from: this.fromNumber,
                        to,
                        body: cleanText.slice(i, i + this.MAX_MESSAGE_LENGTH),
                    });
                }
            }
        } catch (err) {
            if (typeof this.api.logger !== 'undefined') {
                this.api.logger.error({ to, err }, 'Failed to send Twilio WhatsApp message');
            } else {
                console.error('Failed to send Twilio WhatsApp message', err);
            }
        }
    }

    private stageMedia(localPath: string): string | null {
        const srcPath = path.resolve(localPath);
        if (!fs.existsSync(srcPath) || !fs.statSync(srcPath).isFile()) {
            return null;
        }
        if (path.dirname(srcPath) === path.resolve(this.outboundDir)) {
            return `${this.webhookUrl}/webhook/twilio-whatsapp/media/${path.basename(srcPath)}`;
        }
        const ext = path.extname(srcPath);
        const filename = `${crypto.randomUUID().replace(/-/g, '')}${ext}`;
        const destPath = path.join(this.outboundDir, filename);
        fs.copyFileSync(srcPath, destPath);
        return `${this.webhookUrl}/webhook/twilio-whatsapp/media/${filename}`;
    }

    // Required arguments to HTTP handlers depends on framework
    // It handles Node.js request/response for this implementation
    private async handleWebhook(req: any, res: any) {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));

        req.on('end', async () => {
            try {
                const body = Buffer.concat(chunks);
                const params = this.parseFormBody(body);

                if (this.webhookUrl) {
                    const signature = req.headers['x-twilio-signature'] as string;
                    const valid = twilio.validateRequest(
                        this.authToken,
                        signature || '',
                        this.webhookUrl + '/webhook/twilio-whatsapp',
                        params,
                    );
                    if (!valid) {
                        res.writeHead(403);
                        res.end('Invalid signature');
                        return;
                    }
                }

                const from = params.From || '';
                if (!from || (this.allowedSenders.size > 0 && !this.allowedSenders.has(from))) {
                    res.writeHead(403);
                    res.end('Forbidden');
                    return;
                }

                const messageSid = params.MessageSid || '';
                const bodyText = params.Body || '';
                const numMedia = parseInt(params.NumMedia || '0', 10);

                let content = bodyText;
                if (numMedia > 0) {
                    content += '\n';
                    for (let i = 0; i < numMedia; i++) {
                        const mediaUrl = params[`MediaUrl${i}`];
                        const contentType = params[`MediaContentType${i}`] || 'unknown';
                        if (mediaUrl) {
                            try {
                                const buffer = await this.downloadTwilioMedia(mediaUrl);
                                // Need an extension based on content type, but Twilio usually 
                                // provides no clear extension, mapping could be exhaustive. 
                                // Here, we grab .jpg for image/jpeg etc
                                const ext = this.getExtensionForType(contentType);
                                const filePath = path.join(this.inboundDir, `${messageSid}-${i}${ext}`);
                                fs.writeFileSync(filePath, buffer);
                                content += `[${contentType}: ${filePath}]\n`;
                            } catch (err) {
                                content += `[Media: ${contentType} (download failed)]\n`;
                            }
                        }
                    }
                }

                // Pass info to OpenClaw
                if (this.api && typeof this.api.handleInboundMessage === 'function') {
                    this.api.handleInboundMessage({ from, text: content.trim(), messageId: messageSid });
                }

                res.writeHead(200, { 'Content-Type': 'text/xml' });
                res.end('<Response/>');
            } catch (e) {
                res.writeHead(500);
                res.end('Internal Server Error');
            }
        });
    }

    private serveMedia(req: any, res: any) {
        // Expected to have req.params.filename via route registration (Express-style)
        // Or just parse URL if plain http
        let filename = req.params?.filename;

        // Fallback if SDK doesn't inject req.params
        if (!filename) {
            const parts = req.url.split('/');
            filename = parts[parts.length - 1];
        }

        if (!filename) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }

        const filePath = path.resolve(this.outboundDir, filename);
        if (path.dirname(filePath) !== path.resolve(this.outboundDir) || !fs.existsSync(filePath)) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }

        const contentType = mime.lookup(filePath) || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
    }

    private parseFormBody(body: Buffer): Record<string, string> {
        const params = new URLSearchParams(body.toString('utf-8'));
        const result: Record<string, string> = {};
        for (const [key, value] of params) {
            result[key] = value;
        }
        return result;
    }

    private downloadTwilioMedia(url: string): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const auth = `${this.accountSid}:${this.authToken}`;
            const get = (targetUrl: string) => {
                https.get(targetUrl, { auth }, (res) => {
                    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        get(res.headers.location);
                        return;
                    }
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(new Error(`HTTP ${res.statusCode}`));
                        return;
                    }
                    const chunks: Buffer[] = [];
                    res.on('data', (chunk: Buffer) => chunks.push(chunk));
                    res.on('end', () => resolve(Buffer.concat(chunks)));
                    res.on('error', reject);
                });
            };
            get(url);
        });
    }

    private getExtensionForType(contentType: string): string {
        const ext = mime.extension(contentType);
        return ext ? `.${ext}` : '.bin';
    }
}
