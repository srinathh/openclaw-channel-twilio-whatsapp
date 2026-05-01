import { defineChannelPluginEntry } from 'openclaw/plugin-sdk/channel-core';
import { twilioWhatsAppPlugin } from './channel.js';

export default defineChannelPluginEntry({
  id: 'twilio-whatsapp',
  name: 'Twilio WhatsApp',
  description: 'WhatsApp channel via Twilio Business API',
  plugin: twilioWhatsAppPlugin,
});
