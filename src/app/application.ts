import { randomUUID } from 'node:crypto';

import { env, hasSqlConfig } from '../config/env';
import { CryptoService } from '../domain/crypto-service';
import { EmailValidationService } from '../domain/email-validation-service';
import { FingerprintService } from '../domain/fingerprint-service';
import { SessionGuard } from '../domain/session-guard';
import type { ChatMessage, MessageEnvelope, ScreenName, SignupResult } from '../domain/models';
import { Libp2pService } from '../infrastructure/libp2p-service';
import { SqlStore } from '../infrastructure/sql-store';
import type { DbConfig } from '../infrastructure/sql-store';
import { TerminalUi } from '../ui/terminal-ui';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';

type AppState = {
  currentScreen: ScreenName;
  logs: string[];
  sessionId: string;
  signedUpIdentity: SignupResult | null;
  activeSessionKey: Buffer | null;
  connectedPeer: string | null;
  accountEmail: string | null;
  persistenceMode: 'connected' | 'ephemeral';
};

const HELP_TEXT = [
  'Commands:',
  '  help',
  '  goto login|signup|message-board',
  '  setup <email>',
  '  signup <email>',
  '  login <email> <fingerprint>',
  '  connect <peer-id>',
  '  disconnect',
  '  send <message>',
  '  sendfile <path>',
  '  peer',
  '  show fingerprint',
  '  exit',
  'Hotkeys:',
  '  F1 -> login',
  '  F2 -> signup',
  '  F3 -> message-board',
  'Editor:',
  '  Up/Down -> command history',
  '  Tab -> command completion'
].join('\n');

export class Application {
  private readonly commandNames = [
    'help',
    'goto',
    'setup',
    'signup',
    'login',
    'connect',
    'disconnect',
    'send',
    'sendfile',
    'peer',
    'show',
    'exit'
  ];

  private readonly gotoTargets: ScreenName[] = ['login', 'signup', 'message-board'];
  private readonly showTargets = ['fingerprint'];

  private readonly ui = new TerminalUi();
  private readonly fingerprintService = new FingerprintService(env.APP_MASTER_SECRET);
  private readonly emailValidationService = new EmailValidationService(env.EMAIL_CHECK_MODE);
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
    connectedPeer: null,
    accountEmail: null,
    persistenceMode: 'ephemeral'
  };

  public async start(): Promise<void> {
    await this.p2pService.start(env.P2P_LISTEN_PORT);
    await this.tryConnectSql();

    this.addLog('ChatPose booted. Security mode: strict hardware fingerprint gating.');
    this.addLog('No cookies, no tracking, and encrypted transport payloads only.');
    this.addLog(HELP_TEXT);

    this.bindKeys();
    this.ui.onInfo((line) => {
      this.addLog(line);
      this.render();
    });
    this.ui.onCompletion((input) => this.completeInput(input));
    this.ui.onSubmit((input) => {
      void this.handleInput(input).catch((error) => {
        const reason = error instanceof Error ? error.message : String(error);
        this.addLog(`Command failed: ${reason}`);
        this.render();
      });
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
      case 'setup':
        await this.handleSetup(rest.join(' '));
        break;
      case 'login':
        await this.handleLogin(rest.join(' '));
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
      case 'peer':
        await this.handlePeer();
        break;
      case 'exit':
        await this.handleExit();
        return;
      default:
        this.addLog(`Unknown command: ${command}. Type help.`);
        break;
    }

    this.render();
  }

  private handleGoto(screen: string | undefined): void {
    if (!screen || !this.gotoTargets.includes(screen as ScreenName)) {
      this.addLog('Invalid screen. Use login, signup, or message-board.');
      return;
    }

    this.switchScreen(screen as ScreenName);
  }

  private async handleSignup(email: string): Promise<void> {
    const validation = await this.emailValidationService.validate(email);
    if (!validation.ok) {
      this.addLog(validation.message ?? 'Signup failed. Provide a valid email.');
      return;
    }

    if (validation.warning) {
      this.addLog(validation.warning);
    }

    const result = this.fingerprintService.createSignupFingerprint(validation.normalizedEmail as string);
    this.state.signedUpIdentity = result;
    this.addLog(`Signup successful for ${result.email}.`);
    this.addLog(`Fingerprint issued (store securely): ${result.fingerprint}`);

    try {
      await this.sqlStore.persistSignup(result);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.addLog(`Signup persisted locally only. DB write failed: ${reason}`);
    }
    this.switchScreen('login');
  }

  private async handleSetup(email: string): Promise<void> {
    await this.handleSignup(email);
    if (!this.state.signedUpIdentity) {
      return;
    }

    await this.handleLogin(`${this.state.signedUpIdentity.email} ${this.state.signedUpIdentity.fingerprint}`);
    this.addLog('Account setup pipeline complete.');
  }

  private async handleLogin(input: string): Promise<void> {
    const parts = input.trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      this.addLog('Login requires: login <email> <fingerprint>');
      return;
    }

    const email = parts[0].toLowerCase();
    const fingerprint = parts.slice(1).join(' ');

    let expectedFingerprint =
      this.state.signedUpIdentity && this.state.signedUpIdentity.email === email
        ? this.state.signedUpIdentity.fingerprint
        : null;

    if (!expectedFingerprint) {
      let stored: SignupResult | null = null;
      try {
        stored = await this.sqlStore.getSignupByEmail(email);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.addLog(`Account lookup failed: ${reason}`);
      }

      if (!stored) {
        this.addLog('Login blocked. Account not found; run signup or setup first.');
        return;
      }

      expectedFingerprint = stored.fingerprint;
      this.state.signedUpIdentity = {
        email: stored.email,
        fingerprint: stored.fingerprint,
        traitsHash: stored.traitsHash,
        encryptedTraits: stored.encryptedTraits
      };
    }

    const derived = this.fingerprintService.deriveBoundFingerprint(email);
    if (fingerprint !== expectedFingerprint || fingerprint !== derived) {
      this.addLog('Strict fingerprint gate rejected this login attempt.');
      return;
    }

    this.state.activeSessionKey = this.cryptoService.createSessionKey();
    this.state.accountEmail = email;
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

  private async handlePeer(): Promise<void> {
    const peerId = this.p2pService.getPeerId();
    this.addLog(`Local peer id: ${peerId}`);
  }

  private completeInput(input: string): { value: string; suggestionLine?: string } | null {
    const hasTrailingSpace = /\s$/.test(input);
    const trimmed = input.trim();

    if (!trimmed) {
      return {
        value: input,
        suggestionLine: `Completions: ${this.commandNames.join(', ')}`
      };
    }

    const parts = trimmed.split(/\s+/);
    if (parts.length === 1 && !hasTrailingSpace) {
      return this.completeToken(input, parts[0], this.commandNames);
    }

    const command = parts[0].toLowerCase();
    const token = hasTrailingSpace ? '' : parts[parts.length - 1];

    if (command === 'goto') {
      return this.completeToken(input, token, this.gotoTargets);
    }

    if (command === 'show') {
      return this.completeToken(input, token, this.showTargets);
    }

    return null;
  }

  private completeToken(input: string, token: string, candidates: string[]): { value: string; suggestionLine?: string } | null {
    const normalizedToken = token.toLowerCase();
    let matches = candidates.filter((candidate) => candidate.startsWith(normalizedToken));
    if (matches.length === 0 && normalizedToken) {
      matches = this.findClosestMatches(normalizedToken, candidates);
    }

    if (matches.length === 0) {
      return null;
    }

    if (matches.length === 1) {
      return {
        value: this.replaceLastToken(input, matches[0])
      };
    }

    const commonPrefix = this.findCommonPrefix(matches);
    if (commonPrefix.length > token.length) {
      return {
        value: this.replaceLastToken(input, commonPrefix),
        suggestionLine: `Matches: ${matches.join(', ')}`
      };
    }

    return {
      value: input,
      suggestionLine: `Matches: ${matches.join(', ')}`
    };
  }

  private findClosestMatches(token: string, candidates: string[]): string[] {
    const scored = candidates.map((candidate) => ({
      candidate,
      distance: this.levenshteinDistance(token, candidate)
    }));

    const minDistance = Math.min(...scored.map((item) => item.distance));
    const maxAcceptedDistance = Math.max(2, Math.floor(token.length / 2));
    if (minDistance > maxAcceptedDistance) {
      return [];
    }

    return scored
      .filter((item) => item.distance === minDistance)
      .map((item) => item.candidate)
      .sort((a, b) => a.localeCompare(b));
  }

  private levenshteinDistance(a: string, b: string): number {
    if (a === b) {
      return 0;
    }

    const rows = a.length + 1;
    const cols = b.length + 1;
    const matrix: number[][] = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

    for (let i = 0; i < rows; i += 1) {
      matrix[i][0] = i;
    }
    for (let j = 0; j < cols; j += 1) {
      matrix[0][j] = j;
    }

    for (let i = 1; i < rows; i += 1) {
      for (let j = 1; j < cols; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return matrix[rows - 1][cols - 1];
  }

  private replaceLastToken(input: string, replacement: string): string {
    if (!input.trim()) {
      return `${replacement} `;
    }

    if (!input.includes(' ')) {
      return `${replacement} `;
    }

    if (/\s$/.test(input)) {
      return `${input}${replacement} `;
    }

    const lastSpace = input.lastIndexOf(' ');
    return `${input.slice(0, lastSpace + 1)}${replacement} `;
  }

  private findCommonPrefix(values: string[]): string {
    if (values.length === 0) {
      return '';
    }

    let prefix = values[0];
    for (const value of values.slice(1)) {
      while (!value.startsWith(prefix) && prefix.length > 0) {
        prefix = prefix.slice(0, -1);
      }
      if (!prefix) {
        break;
      }
    }
    return prefix;
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

  private async handleExit(): Promise<void> {
    this.addLog('Shutting down ChatPose CLI...');
    this.render();

    await this.p2pService.stop();
    await this.sqlStore.disconnect();
    process.exit(0);
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
        ? 'login <email> <fingerprint>'
        : this.state.currentScreen === 'signup'
          ? 'setup <email> or signup <email>'
          : 'connect <peer-id> then send <message>';

    this.ui.render({
      currentScreen: this.state.currentScreen,
      logLines: this.state.logs,
      prompt,
      peerId: this.p2pService.getPeerId(),
      persistenceMode: this.state.persistenceMode,
      accountEmail: this.state.accountEmail
    });
  }

  private async tryConnectSql(): Promise<void> {
    if (!hasSqlConfig) {
      this.addLog('SQL not configured. Running in ephemeral mode (no persistence).');
      return;
    }

    const mysqlSslConfig = (() => {
      if (!env.SQL_SSL) {
        return undefined;
      }

      const sslConfig: {
        rejectUnauthorized: boolean;
        ca?: string;
        cert?: string;
        key?: string;
      } = {
        rejectUnauthorized: env.SQL_SSL_REJECT_UNAUTHORIZED
      };

      if (env.SQL_SSL_CA_FILE && existsSync(env.SQL_SSL_CA_FILE)) {
        sslConfig.ca = readFileSync(env.SQL_SSL_CA_FILE, 'utf8');
      }

      if (env.SQL_SSL_CERT_FILE && existsSync(env.SQL_SSL_CERT_FILE)) {
        sslConfig.cert = readFileSync(env.SQL_SSL_CERT_FILE, 'utf8');
      }

      if (env.SQL_SSL_KEY_FILE && existsSync(env.SQL_SSL_KEY_FILE)) {
        sslConfig.key = readFileSync(env.SQL_SSL_KEY_FILE, 'utf8');
      }

      return sslConfig;
    })();

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
            ssl: mysqlSslConfig
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

    try {
      await this.sqlStore.connect(dbConfig);
      await this.sqlStore.initSchema();
      this.state.persistenceMode = 'connected';
      this.addLog(`SQL persistence initialized using ${env.SQL_DIALECT}.`);
      this.addLog('Startup mode: connected (persistent account storage enabled).');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.state.persistenceMode = 'ephemeral';
      this.addLog(`SQL connection failed. Running in ephemeral mode. Reason: ${reason}`);
      this.addLog('Startup mode: ephemeral (data is not persisted).');
    }
  }
}
