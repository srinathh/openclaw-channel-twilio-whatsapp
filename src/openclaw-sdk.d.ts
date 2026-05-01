declare module 'openclaw/plugin-sdk/channel-core' {
  export function defineChannelPluginEntry(params: {
    id: string;
    name?: string;
    description?: string;
    plugin: any;
    configSchema?: any;
    setRuntime?: any;
    registerCliMetadata?: any;
    registerFull?: any;
  }): any;

  export function createChatChannelPlugin<TAccount = any>(params: {
    base: {
      id: string;
      resolveAccount?: (params: { cfg: any; accountId?: string }) => TAccount | null;
      security?: any;
      messaging?: {
        normalizeTarget?: (target: string) => string | undefined;
        resolveInboundConversation?: any;
        transformReplyPayload?: any;
        targetResolver?: {
          looksLikeId: (id: string | undefined) => boolean;
          hint: string;
        };
      };
      setup?: {
        resolveChannelSetupStatus?: (params: { cfg: any }) => { status: string; hint?: string };
      };
      status?: {
        resolveAccountStatus?: (params: { account: TAccount }) => Promise<any>;
        resolveAccountState?: (params: { configured: boolean }) => string;
      };
      gateway?: {
        startAccount?: (ctx: {
          account: TAccount;
          cfg: any;
          runtime: any;
          abortSignal?: AbortSignal;
          log?: { info: (msg: string) => void; debug?: (msg: string) => void; error?: (msg: string) => void };
          accountId: string;
          setStatus?: (status: any) => void;
        }) => Promise<(() => void) | void>;
      };
      agentPrompt?: {
        messageToolHints?: () => string[];
      };
      [key: string]: any;
    };
    outbound?: any;
    security?: any;
    pairing?: any;
    threading?: any;
  }): any;
}

declare module 'openclaw/plugin-sdk/channel-policy' {
  export function createRestrictSendersChannelSecurity<TAccount = any>(params: {
    channelKey: string;
    resolveDmPolicy: (account: TAccount) => string | undefined;
    resolveDmAllowFrom: (account: TAccount) => string[] | undefined;
    resolveGroupPolicy?: (account: TAccount) => string | undefined;
    surface: string;
    openScope: string;
    groupPolicyPath?: string;
    groupAllowFromPath?: string;
    mentionGated: boolean;
    policyPathSuffix: string;
    approveHint: string;
    normalizeDmEntry: (raw: string) => string;
  }): any;
}

declare module 'openclaw/plugin-sdk/channel-send-result' {
  export function createAttachedChannelResultAdapter(params: {
    channel: string;
    sendText?: (ctx: {
      cfg: any;
      to: string;
      text: string;
      accountId?: string;
      deps?: any;
      gifPlayback?: boolean;
      replyToId?: string;
      formatting?: any;
    }) => Promise<{ messageId: string }>;
    sendMedia?: (ctx: {
      cfg: any;
      to: string;
      text?: string;
      mediaUrl?: string;
      mediaAccess?: any;
      mediaLocalRoots?: readonly string[];
      mediaReadFile?: (filePath: string) => Promise<Buffer>;
      audioAsVoice?: boolean;
      accountId?: string;
      deps?: any;
      gifPlayback?: boolean;
      replyToId?: string;
    }) => Promise<{ messageId: string }>;
    sendPoll?: (ctx: any) => Promise<any>;
  }): {
    sendText?: (ctx: any) => Promise<any>;
    sendMedia?: (ctx: any) => Promise<any>;
    sendPoll?: (ctx: any) => Promise<any>;
  };
}

declare module 'openclaw/plugin-sdk/reply-chunking' {
  export function chunkText(text: string, limit: number, ctx?: any): string[];
}
