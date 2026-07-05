import { randomUUID } from 'node:crypto';

import { env, hasSqlConfig } from '../config/env';
import { CryptoService } from '../domain/crypto-service';
import { FingerprintService } from '../domain/fingerprint-service';
import { SessionGuard } from '../domain/session-guard';
import type { ChatMessage, MessageEnvelope, ScreenName, SignupResult } from '../domain/models';
import { Libp2pService } from '../infrastructure/libp2p-service';
import { SqlStore } from '../infrastructure/sql-store';
import type { DbConfig } from '../infrastructure/sql-store';
import { TerminalUi } from '../ui/terminal-ui';
import { readFile } from 'node:fs/promises';

type AppState = {
  currentScreen: ScreenName;
  logs: string[];
  sessionId: string;
  signedUpIdentity: SignupResult | null;
  activeSessionKey: Buffer | null;
  connectedPeer: string | null;
};

const HELP_TEXT = [
  'Commands:',
  '  help',
  '  goto login|signup|message-board',
  '  signup <email>',
  '  login <fingerprint>',
  '  connect <peer-id>',
  '  disconnect',
  '  send <message>',
  '  sendfile <path>',
  '  show fingerprint',
  'Hotkeys:',
  '  F1 -> login',
  '  F2 -> signup',
  '  F3 -> message-board'
].join('\n');

export class Application {
  private readonly ui = new TerminalUi();
  private readonly fingerprintService = new FingerprintService(env.APP_MASTER_SECRET);
  private readonly cryptoService = new CryptoService();
  private readonly p2pService = new Libp2pService();
  private readonly sessionGuard = new SessionGuard();
  private readonly sqlStore = new SqlStore();
  private readonly state: AppState = {
    currentScreen: 'login',
    logs: [],
    sessionId: randomUUID(),
    signedUpIdentity: null,
    activeSessionKey: null,
    connectedPeer: null
  };

  public async start(): Promise<void> {
    await this.p2pService.start(env.P2P_LISTEN_PORT);
    await this.tryConnectSql();

    this.addLog('ChatPose booted. Security mode: strict hardware fingerprint gating.');
    this.addLog('No cookies, no tracking, and encrypted transport payloads only.');
    this.addLog(HELP_TEXT);

    this.bindKeys();
    this.ui.onSubmit((input) => {
      void this.handleInput(input);
    });

    this.render();
    this.ui.startInput();
  }

  private bindKeys(): void {
    this.ui.onKey('f1', () => this.switchScreen('login'));
    this.ui.onKey('f2', () => this.switchScreen('signup'));
    this.ui.onKey('f3', () => this.switchScreen('message-board'));
  }

  private async handleInput(rawInput: string): Promise<void> {
    const input = rawInput.trim();
    if (!input) {
      return;
    }

    const [command, ...rest] = input.split(' ');

    switch (command.toLowerCase()) {
      case 'help':
        this.addLog(HELP_TEXT);
        break;
      case 'goto':
        this.handleGoto(rest[0]);
        break;
      case 'signup':
        await this.handleSignup(rest.join(' '));
        break;
      case 'login':
        this.handleLogin(rest.join(' '));
        break;
      case 'connect':
        await this.handleConnect(rest.join(' '));
        break;
      case 'disconnect':
        this.handleDisconnect();
        break;
      case 'send':
        await this.handleSend(rest.join(' '));
        break;
      case 'sendfile':
        await this.handleSendFile(rest.join(' '));
        break;
      case 'show':
        this.handleShow(rest.join(' '));
        break;
      default:
        this.addLog(`Unknown command: ${command}. Type help.`);
        break;
    }

    this.render();
  }

  private handleGoto(screen: string | undefined): void {
    const allowedScreens: ScreenName[] = ['login', 'signup', 'message-board'];
    if (!screen || !allowedScreens.includes(screen as ScreenName)) {
      this.addLog('Invalid screen. Use login, signup, or message-board.');
      return;
    }

    this.switchScreen(screen as ScreenName);
  }

  private async handleSignup(email: string): Promise<void> {
    if (!email.includes('@')) {
      this.addLog('Signup failed. Provide a valid email.');
      return;
    }

    const result = this.fingerprintService.createSignupFingerprint(email);
    this.state.signedUpIdentity = result;
    this.addLog(`Signup successful for ${result.email}.`);
    this.addLog(`Fingerprint issued (store securely): ${result.fingerprint}`);

    await this.sqlStore.persistSignup(result);
    this.switchScreen('login');
  }

  private handleLogin(fingerprint: string): void {
    if (!this.state.signedUpIdentity) {
      this.addLog('Login blocked. You must complete signup first in this node session.');
      return;
    }

    const derived = this.fingerprintService.deriveBoundFingerprint(this.state.signedUpIdentity.email);
    if (fingerprint !== this.state.signedUpIdentity.fingerprint || fingerprint !== derived) {
      this.addLog('Strict fingerprint gate rejected this login attempt.');
      return;
    }

    this.state.activeSessionKey = this.cryptoService.createSessionKey();
    this.addLog('Login accepted. Session key issued in-memory only.');
    this.switchScreen('message-board');
  }

  private async handleConnect(peerId: string): Promise<void> {
    if (!peerId) {
      this.addLog('Connect requires a peer id.');
      return;
    }

    const localPeerId = this.p2pService.getPeerId();
    const sessionId = randomUUID();

    try {
      this.sessionGuard.bind(sessionId, localPeerId, peerId);
    } catch (error) {
      this.addLog(error instanceof Error ? error.message : 'Session binding failed.');
      return;
    }

    this.state.connectedPeer = peerId;
    this.state.sessionId = sessionId;
    await this.sqlStore.ensureSessionParticipants(sessionId, localPeerId, peerId);
    this.addLog(`Connected to peer ${peerId}. Session ${this.state.sessionId} initialized.`);
  }

  private handleDisconnect(): void {
    if (!this.state.connectedPeer) {
      this.addLog('No active peer to disconnect.');
      return;
    }

    this.addLog(`Disconnected peer ${this.state.connectedPeer}.`);
    this.state.connectedPeer = null;
    this.state.sessionId = randomUUID();
    this.sessionGuard.clear();
  }

  private async handleSend(messageText: string): Promise<void> {
    if (!messageText) {
      this.addLog('Cannot send an empty message.');
      return;
    }

    if (!this.state.activeSessionKey) {
      this.addLog('Login required before sending encrypted messages.');
      return;
    }

    if (!this.state.connectedPeer) {
      this.addLog('Connect to exactly one peer before sending messages.');
      return;
    }

    try {
      this.sessionGuard.assertOutbound(this.state.connectedPeer);
    } catch (error) {
      this.addLog(error instanceof Error ? error.message : 'Session guard rejected outbound message.');
      return;
    }

    const payload: ChatMessage = {
      sessionId: this.state.sessionId,
      fromPeer: this.p2pService.getPeerId(),
      toPeer: this.state.connectedPeer,
      plainText: messageText
    };

    const envelope = this.cryptoService.encryptMessage(payload, this.state.activeSessionKey);
    try {
      this.sessionGuard.assertReplayTokenUnique(envelope.replayToken, envelope.timestamp);
    } catch (error) {
      this.addLog(error instanceof Error ? error.message : 'Replay protection rejected outbound message.');
      return;
    }

    const recovered = this.cryptoService.decryptMessage(envelope, this.state.activeSessionKey);
    this.addLog(`Encrypted message created. Replay token: ${envelope.replayToken}`);
    this.addLog(`Local decrypt check: ${recovered}`);

    await this.persistEnvelope(envelope, payload);
  }

  private handleShow(target: string): void {
    if (target === 'fingerprint' && this.state.signedUpIdentity) {
      this.addLog(`Current issued fingerprint: ${this.state.signedUpIdentity.fingerprint}`);
      return;
    }

    this.addLog('Show command supports: show fingerprint');
  }

  private async handleSendFile(filePath: string): Promise<void> {
    if (!filePath) {
      this.addLog('sendfile requires a file path.');
      return;
    }

    if (!this.state.activeSessionKey || !this.state.connectedPeer) {
      this.addLog('Login and connect to a peer before sending encrypted files.');
      return;
    }

    try {
      this.sessionGuard.assertOutbound(this.state.connectedPeer);
      const bytes = await readFile(filePath);
      const encryptedChunks = this.cryptoService.encryptFileData(
        this.state.sessionId,
        bytes,
        this.state.activeSessionKey
      );

      for (const chunk of encryptedChunks) {
        this.sessionGuard.assertReplayTokenUnique(chunk.replayToken, chunk.timestamp);
      }

      const decryptedBytes = this.cryptoService.decryptFileData(encryptedChunks, this.state.activeSessionKey);
      this.addLog(
        `Encrypted file prepared from ${filePath}. Chunks: ${encryptedChunks.length}. Verified bytes: ${decryptedBytes.length}.`
      );
    } catch (error) {
      this.addLog(error instanceof Error ? error.message : 'File encryption failed.');
    }
  }

  private async persistEnvelope(envelope: MessageEnvelope, message: ChatMessage): Promise<void> {
    await this.sqlStore.persistEncryptedMessage({
      sessionId: message.sessionId,
      fromPeer: message.fromPeer,
      toPeer: message.toPeer,
      cipherText: envelope.cipherText,
      nonce: envelope.nonce,
      signature: envelope.signature,
      replayToken: envelope.replayToken,
      timestamp: envelope.timestamp
    });
  }

  private switchScreen(screen: ScreenName): void {
    this.state.currentScreen = screen;
    this.addLog(`Switched to ${screen} screen.`);
    this.render();
  }

  private addLog(line: string): void {
    this.state.logs.push(`[${new Date().toISOString()}] ${line}`);
    if (this.state.logs.length > 150) {
      this.state.logs.shift();
    }
  }

  private render(): void {
    const prompt =
      this.state.currentScreen === 'login'
        ? 'login <fingerprint>'
        : this.state.currentScreen === 'signup'
          ? 'signup <email>'
          : 'connect <peer-id> then send <message>';

    this.ui.render({
      currentScreen: this.state.currentScreen,
      logLines: this.state.logs,
      prompt,
      peerId: this.p2pService.getPeerId()
    });
  }

  private async tryConnectSql(): Promise<void> {
    if (!hasSqlConfig) {
      this.addLog('SQL not configured. Running in ephemeral mode (no persistence).');
      return;
    }

    const dbConfig: DbConfig =
      env.SQL_DIALECT === 'mysql'
        ? {
          dialect: 'mysql',
          config: {
            host: env.SQL_SERVER as string,
            database: env.SQL_DATABASE as string,
            user: env.SQL_USER as string,
            password: env.SQL_PASSWORD as string,
            port: env.SQL_PORT,
            waitForConnections: true,
            connectionLimit: 5,
            ssl: env.SQL_SSL ? {} : undefined
          }
        }
        : {
          dialect: 'mssql',
          config: {
            server: env.SQL_SERVER as string,
            database: env.SQL_DATABASE,
            user: env.SQL_USER,
            password: env.SQL_PASSWORD,
            port: env.SQL_PORT,
            options: {
              encrypt: env.SQL_ENCRYPT,
              trustServerCertificate: env.SQL_TRUST_SERVER_CERT
            },
            pool: {
              min: 0,
              max: 5,
              idleTimeoutMillis: 30000
            }
          }
        };

    await this.sqlStore.connect(dbConfig);
    await this.sqlStore.initSchema();
    this.addLog(`SQL persistence initialized using ${env.SQL_DIALECT}.`);
  }
}
