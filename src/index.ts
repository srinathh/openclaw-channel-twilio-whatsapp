import { TwilioWhatsAppChannel } from './channel.js';

const plugin = {
    name: 'twilio-whatsapp',
    async register(api: any) {
        api.registerChannel(new TwilioWhatsAppChannel(api));
    },
};

export default plugin;
