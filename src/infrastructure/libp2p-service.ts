type MinimalLibp2pNode = {
    start: () => void | Promise<void>;
    stop: () => void | Promise<void>;
    peerId: { toString: () => string };
};

export class Libp2pService {
    private node: MinimalLibp2pNode | null = null;

    public async start(port: number): Promise<void> {
        if (this.node) {
            return;
        }

        const { createLibp2p } = await import('libp2p');
        const { tcp } = await import('@libp2p/tcp');
        const { noise } = await import('@libp2p/noise');
        const { mplex } = await import('@libp2p/mplex');
        const { mdns } = await import('@libp2p/mdns');

        const node = await createLibp2p({
            addresses: {
                listen: [`/ip4/0.0.0.0/tcp/${port}`]
            },
            transports: [tcp()],
            streamMuxers: [mplex()],
            connectionEncrypters: [noise()],
            peerDiscovery: [mdns()]
        });

        await node.start();
        this.node = node;
    }

    public async stop(): Promise<void> {
        if (!this.node) {
            return;
        }

        await this.node.stop();
        this.node = null;
    }

    public getPeerId(): string {
        if (!this.node) {
            return 'offline';
        }

        return this.node.peerId.toString();
    }

    public isRunning(): boolean {
        return this.node !== null;
    }
}
