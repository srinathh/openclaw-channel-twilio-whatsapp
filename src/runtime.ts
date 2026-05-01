import { createPluginRuntimeStore } from 'openclaw/plugin-sdk/runtime-store';

export const { setRuntime: setTwilioWhatsAppRuntime, getRuntime: getTwilioWhatsAppRuntime } =
  createPluginRuntimeStore({
    pluginId: 'twilio-whatsapp',
    errorMessage: 'Twilio WhatsApp runtime not initialized',
  });
