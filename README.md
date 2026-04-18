# OpenClaw Twilio WhatsApp Channel

This repository contains the `TwilioWhatsAppChannel` plugin, serving as a communication interface connecting the **OpenClaw AI agent** to users via WhatsApp using the **Twilio API**. It handles sending outgoing messages, processing incoming messages (from Webhooks), and securely routing media between the two platforms.

## Architecture & How It Works

### 1. Initialization and Configuration
When the channel is instantiated, it configures itself using the environment variables and OpenClaw's context:
- **Environment Variables:** Loads setup credentials specific to Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_WEBHOOK_URL`).
- **Access Control:** Loads an `OPENCLAW_ALLOWED_SENDERS` list to restrict who the agent is permitted to talk to.
- **Persistent Data Layers:** Resolves paths and ensures the existence of `outbound` and `inbound` directories on the disk to store media files.
- **Webhook Registration:** Registers two HTTP routes on the OpenClaw API:
  - `POST /webhook/twilio-whatsapp` to receive incoming WhatsApp messages.
  - `GET /webhook/twilio-whatsapp/media/:filename` to serve local media files securely to Twilio so it can forward them.

### 2. Sending Outbound Messages 
Handled by the `send()` method when the AI agent intends to send a message to the user:
- **Media Staging:** If the AI attaches local `mediaFiles`, they are copied to the `outbound` directory and exposed via generated static URLs configuring the `GET /webhook/twilio-whatsapp/media/:filename` endpoint.
- **Message Chunking:** Twilio restricts messages to 1600 characters. If the generated AI response is longer than that limit, the script divides the sequence into multiple sequentially sent WhatsApp messages automatically.
- **Execution:** Dispatches the final text/media via the official `twilio` Node SDK.

### 3. Handling Incoming Messages
Handled by the Webhook endpoint `handleWebhook` when a user replies via WhatsApp.
- **Validation:** Fetches the raw request body buffer and verifies the Twilio cryptographical signature (`x-twilio-signature`) utilizing your auth token. This ensures requests are genuinely originating from Twilio and not an external spoofer.
- **Access Control:** Evaluates that the user's phone number (`From`) occurs in the `allowedSenders` authorized set. Throws a `403 Forbidden` if they try to interact with the bot without permission.
- **Media Downloading:** When a user uploads pictures/documents (`NumMedia > 0`), it invokes an underlying stream handler to securely fetch the files from Twilio via basic HTTP auth & redirect-handling protocols. These are written to the local `inbound` directory.
- **Formatting:** Converts downloaded media elements into a localized text representation mapping (e.g., `[image/jpeg: /path/to/media.jpg]`) embedded sequentially into the chat timeline.
- **Routing to OpenClaw:** Routes the complete packet (`from`, `text`, and `messageId`) to OpenClaw's core systems, prompting the AI to process the message and orchestrate a response.

### 4. Media Serving Endpoint
Handled by the static file endpoint `serveMedia` to supply files back to Twilio. 
- Prevents directory traversal attacks (`../`) by locking context paths identically.
- Extracts extensions to emit native mapped MIME types (`image/jpeg`, `video/mp4`, etc.) before securely piping file contents over the active socket to Twilio's dispatch systems.

## Utilities
- `downloadTwilioMedia`: Overcomes Twilio auth limitations and handles cross-origin webhook redirect chains dynamically securely fetching resources to the agent's disk without heavy third-party REST dependencies.
- `parseFormBody`: Converts raw node.js Request buffers (`x-www-form-urlencoded`) reliably minimizing the needs for express modules like `body-parser`.
