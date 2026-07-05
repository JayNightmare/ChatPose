export type ScreenName = 'login' | 'signup' | 'message-board';

export type HostTraits = {
    os: string;
    hostname: string;
    ipAddress: string;
    macAddress: string;
    arch: string;
    release: string;
};

export type SignupResult = {
    email: string;
    fingerprint: string;
    traitsHash: string;
    encryptedTraits: string;
};

export type MessageEnvelope = {
    version: string;
    sessionId: string;
    nonce: string;
    cipherText: string;
    signature: string;
    timestamp: string;
    replayToken: string;
};

export type ChatMessage = {
    sessionId: string;
    fromPeer: string;
    toPeer: string;
    plainText: string;
};

export type FileChunkEnvelope = {
    sessionId: string;
    chunkIndex: number;
    totalChunks: number;
    nonce: string;
    cipherText: string;
    signature: string;
    replayToken: string;
    timestamp: string;
};
