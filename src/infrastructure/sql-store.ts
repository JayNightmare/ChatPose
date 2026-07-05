import mysql, { type Pool, type PoolOptions, type RowDataPacket } from 'mysql2/promise';
import sql from 'mssql';

type PersistSignupInput = {
    email: string;
    fingerprint: string;
    traitsHash: string;
    encryptedTraits: string;
};

type PersistMessageInput = {
    sessionId: string;
    fromPeer: string;
    toPeer: string;
    cipherText: string;
    nonce: string;
    signature: string;
    replayToken: string;
    timestamp: string;
};

export type DbConfig =
    | {
        dialect: 'mssql';
        config: sql.config;
    }
    | {
        dialect: 'mysql';
        config: PoolOptions;
    };

export class SqlStore {
    private mssqlPool: sql.ConnectionPool | null = null;
    private mysqlPool: Pool | null = null;
    private dialect: 'mssql' | 'mysql' | null = null;

    public async connect(dbConfig: DbConfig): Promise<void> {
        if (this.mssqlPool || this.mysqlPool) {
            return;
        }

        this.dialect = dbConfig.dialect;

        if (dbConfig.dialect === 'mssql') {
            this.mssqlPool = await new sql.ConnectionPool(dbConfig.config).connect();
            return;
        }

        this.mysqlPool = mysql.createPool(dbConfig.config);
        await this.mysqlPool.query('SELECT 1');
    }

    public async disconnect(): Promise<void> {
        if (this.mssqlPool) {
            await this.mssqlPool.close();
            this.mssqlPool = null;
        }

        if (this.mysqlPool) {
            await this.mysqlPool.end();
            this.mysqlPool = null;
        }

        this.dialect = null;
    }

    public async initSchema(): Promise<void> {
        if (!this.dialect) {
            throw new Error('SQL connection has not been initialized.');
        }

        if (this.dialect === 'mssql') {
            const pool = this.requireMssqlPool();
            await pool.request().batch(`
        IF OBJECT_ID('dbo.users', 'U') IS NULL
        CREATE TABLE dbo.users (
          user_id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
          email NVARCHAR(320) NOT NULL UNIQUE,
          fingerprint CHAR(64) NOT NULL,
          traits_hash CHAR(64) NOT NULL,
          encrypted_traits VARBINARY(MAX) NOT NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        );

        IF OBJECT_ID('dbo.sessions', 'U') IS NULL
        CREATE TABLE dbo.sessions (
          session_id NVARCHAR(128) PRIMARY KEY,
          peer_a NVARCHAR(256) NOT NULL,
          peer_b NVARCHAR(256) NOT NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        );

        IF OBJECT_ID('dbo.messages', 'U') IS NULL
        CREATE TABLE dbo.messages (
          message_id BIGINT IDENTITY(1,1) PRIMARY KEY,
          session_id NVARCHAR(128) NOT NULL,
          from_peer NVARCHAR(256) NOT NULL,
          to_peer NVARCHAR(256) NOT NULL,
          cipher_text VARBINARY(MAX) NOT NULL,
          nonce VARBINARY(256) NOT NULL,
          signature NVARCHAR(512) NOT NULL,
          replay_token NVARCHAR(128) NOT NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT FK_messages_session FOREIGN KEY (session_id) REFERENCES dbo.sessions(session_id)
        );
      `);
            return;
        }

        const pool = this.requireMySqlPool();

        await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id CHAR(36) NOT NULL PRIMARY KEY,
        email VARCHAR(320) NOT NULL UNIQUE,
        fingerprint CHAR(64) NOT NULL,
        traits_hash CHAR(64) NOT NULL,
        encrypted_traits LONGBLOB NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

        await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id VARCHAR(128) NOT NULL PRIMARY KEY,
        peer_a VARCHAR(256) NOT NULL,
        peer_b VARCHAR(256) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

        await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        message_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(128) NOT NULL,
        from_peer VARCHAR(256) NOT NULL,
        to_peer VARCHAR(256) NOT NULL,
        cipher_text LONGBLOB NOT NULL,
        nonce BLOB NOT NULL,
        signature VARCHAR(512) NOT NULL,
        replay_token VARCHAR(128) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_messages_session FOREIGN KEY (session_id) REFERENCES sessions(session_id)
      )
    `);
    }

    public async persistSignup(data: PersistSignupInput): Promise<void> {
        if (!this.dialect) {
            return;
        }

        if (this.dialect === 'mssql') {
            const pool = this.requireMssqlPool();
            await pool
                .request()
                .input('email', sql.NVarChar(320), data.email)
                .input('fingerprint', sql.Char(64), data.fingerprint)
                .input('traitsHash', sql.Char(64), data.traitsHash)
                .input('encryptedTraits', sql.VarBinary(sql.MAX), Buffer.from(data.encryptedTraits, 'base64'))
                .query(`
          MERGE dbo.users AS target
          USING (SELECT @email AS email) AS source
          ON target.email = source.email
          WHEN MATCHED THEN
            UPDATE SET
              fingerprint = @fingerprint,
              traits_hash = @traitsHash,
              encrypted_traits = @encryptedTraits
          WHEN NOT MATCHED THEN
            INSERT (email, fingerprint, traits_hash, encrypted_traits)
            VALUES (@email, @fingerprint, @traitsHash, @encryptedTraits);
        `);
            return;
        }

        const pool = this.requireMySqlPool();
        await pool.execute(
            `
        INSERT INTO users (user_id, email, fingerprint, traits_hash, encrypted_traits)
        VALUES (UUID(), ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          fingerprint = VALUES(fingerprint),
          traits_hash = VALUES(traits_hash),
          encrypted_traits = VALUES(encrypted_traits)
      `,
            [data.email, data.fingerprint, data.traitsHash, Buffer.from(data.encryptedTraits, 'base64')]
        );
    }

    public async ensureSessionParticipants(
        sessionId: string,
        localPeerId: string,
        remotePeerId: string
    ): Promise<void> {
        if (!this.dialect) {
            return;
        }

        const [peerA, peerB] = [localPeerId, remotePeerId].sort((a, b) => a.localeCompare(b));

        if (this.dialect === 'mssql') {
            const pool = this.requireMssqlPool();
            await pool
                .request()
                .input('sessionId', sql.NVarChar(128), sessionId)
                .input('peerA', sql.NVarChar(256), peerA)
                .input('peerB', sql.NVarChar(256), peerB)
                .query(`
          MERGE dbo.sessions AS target
          USING (SELECT @sessionId AS session_id) AS source
          ON target.session_id = source.session_id
          WHEN MATCHED THEN
            UPDATE SET
              peer_a = @peerA,
              peer_b = @peerB
          WHEN NOT MATCHED THEN
            INSERT (session_id, peer_a, peer_b)
            VALUES (@sessionId, @peerA, @peerB);
        `);
            return;
        }

        const pool = this.requireMySqlPool();
        await pool.execute(
            `
        INSERT INTO sessions (session_id, peer_a, peer_b)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          peer_a = VALUES(peer_a),
          peer_b = VALUES(peer_b)
      `,
            [sessionId, peerA, peerB]
        );
    }

    public async persistEncryptedMessage(data: PersistMessageInput): Promise<void> {
        if (!this.dialect) {
            return;
        }

        if (this.dialect === 'mssql') {
            const pool = this.requireMssqlPool();
            await pool
                .request()
                .input('sessionId', sql.NVarChar(128), data.sessionId)
                .input('fromPeer', sql.NVarChar(256), data.fromPeer)
                .input('toPeer', sql.NVarChar(256), data.toPeer)
                .input('cipherText', sql.VarBinary(sql.MAX), Buffer.from(data.cipherText, 'base64'))
                .input('nonce', sql.VarBinary(256), Buffer.from(data.nonce, 'base64'))
                .input('signature', sql.NVarChar(512), data.signature)
                .input('replayToken', sql.NVarChar(128), data.replayToken)
                .input('createdAt', sql.DateTime2, new Date(data.timestamp))
                .query(`
          IF NOT EXISTS (
            SELECT 1
            FROM dbo.sessions
            WHERE session_id = @sessionId
              AND ((peer_a = @fromPeer AND peer_b = @toPeer) OR (peer_a = @toPeer AND peer_b = @fromPeer))
          )
          BEGIN
            THROW 51000, 'Session participants mismatch or session not initialized.', 1;
          END;

          INSERT INTO dbo.messages (session_id, from_peer, to_peer, cipher_text, nonce, signature, replay_token, created_at)
          VALUES (@sessionId, @fromPeer, @toPeer, @cipherText, @nonce, @signature, @replayToken, @createdAt);
        `);
            return;
        }

        const pool = this.requireMySqlPool();
        const [rows] = await pool.execute<RowDataPacket[]>(
            `
        SELECT 1 AS ok
        FROM sessions
        WHERE session_id = ?
          AND ((peer_a = ? AND peer_b = ?) OR (peer_a = ? AND peer_b = ?))
        LIMIT 1
      `,
            [data.sessionId, data.fromPeer, data.toPeer, data.toPeer, data.fromPeer]
        );

        if (rows.length === 0) {
            throw new Error('Session participants mismatch or session not initialized.');
        }

        await pool.execute(
            `
        INSERT INTO messages (
          session_id,
          from_peer,
          to_peer,
          cipher_text,
          nonce,
          signature,
          replay_token,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
            [
                data.sessionId,
                data.fromPeer,
                data.toPeer,
                Buffer.from(data.cipherText, 'base64'),
                Buffer.from(data.nonce, 'base64'),
                data.signature,
                data.replayToken,
                new Date(data.timestamp)
            ]
        );
    }

    private requireMssqlPool(): sql.ConnectionPool {
        if (!this.mssqlPool) {
            throw new Error('MSSQL pool is not initialized.');
        }
        return this.mssqlPool;
    }

    private requireMySqlPool(): Pool {
        if (!this.mysqlPool) {
            throw new Error('MySQL pool is not initialized.');
        }
        return this.mysqlPool;
    }
}
