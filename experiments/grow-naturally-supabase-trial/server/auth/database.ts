import Database from "better-sqlite3";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: "admin";
};

export type AuthServiceOptions = {
  allowWeakBootstrapPassword?: boolean;
  bootstrapDisplayName?: string;
  bootstrapPassword?: string;
  bootstrapUsername?: string;
  cookieSecure?: boolean;
  required?: boolean;
  sessionTtlSeconds?: number;
  now?: () => Date;
};

type StoredAuthUser = AuthUser & {
  passwordHash: string;
};

const AUTH_SCHEMA = `
  CREATE TABLE IF NOT EXISTS auth_users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role = 'admin'),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    disabled_at TEXT
  );

  CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at);
`;

const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

function normaliseUsername(value: string) {
  return value.trim().toLowerCase();
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derivedKey = scryptSync(password, salt, 64, { N: 16_384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

function verifyPassword(password: string, encoded: string) {
  const [, n, r, p, saltEncoded, keyEncoded] = encoded.split("$");
  if (n !== "16384" || r !== "8" || p !== "1" || !saltEncoded || !keyEncoded) {
    return false;
  }

  try {
    const expected = Buffer.from(keyEncoded, "base64url");
    const actual = scryptSync(password, Buffer.from(saltEncoded, "base64url"), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p)
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function mapUser(row: StoredAuthUser | undefined): AuthUser | null {
  if (!row || row.role !== "admin") {
    return null;
  }

  return {
    displayName: row.displayName,
    id: row.id,
    role: row.role,
    username: row.username
  };
}

export class AuthService {
  readonly database: Database.Database;
  readonly cookieSecure: boolean;
  readonly required: boolean;
  readonly sessionTtlSeconds: number;
  private readonly now: () => Date;

  constructor(database: Database.Database, options: AuthServiceOptions = {}) {
    this.database = database;
    this.cookieSecure = options.cookieSecure ?? false;
    this.required = options.required ?? false;
    this.sessionTtlSeconds = options.sessionTtlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
    this.now = options.now ?? (() => new Date());
    database.pragma("foreign_keys = ON");
    database.exec(AUTH_SCHEMA);
    this.bootstrap(options);
  }

  getStatus() {
    return {
      configured: this.hasAdmin(),
      needsSetup: !this.hasAdmin(),
      required: this.required
    };
  }

  hasAdmin() {
    const row = this.database.prepare("SELECT 1 AS configured FROM auth_users WHERE disabled_at IS NULL LIMIT 1").get() as
      | { configured: number }
      | undefined;
    return Boolean(row?.configured);
  }

  authenticate(username: string, password: string) {
    const row = this.database
      .prepare(
        `SELECT id, username, display_name AS displayName, password_hash AS passwordHash, role
           FROM auth_users
          WHERE username = ? AND disabled_at IS NULL`
      )
      .get(normaliseUsername(username)) as StoredAuthUser | undefined;

    return row && verifyPassword(password, row.passwordHash) ? mapUser(row) : null;
  }

  createSession(user: AuthUser) {
    const token = randomBytes(32).toString("base64url");
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + this.sessionTtlSeconds * 1000);
    this.database
      .prepare(
        `INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(hashSessionToken(token), user.id, createdAt.toISOString(), expiresAt.toISOString());
    return { expiresAt, token };
  }

  getUserForSession(token: string | null | undefined) {
    if (!token) {
      return null;
    }

    const now = this.now().toISOString();
    this.database.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").run(now);
    const row = this.database
      .prepare(
        `SELECT u.id, u.username, u.display_name AS displayName, u.password_hash AS passwordHash, u.role
           FROM auth_sessions s
           JOIN auth_users u ON u.id = s.user_id
          WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled_at IS NULL`
      )
      .get(hashSessionToken(token), now) as StoredAuthUser | undefined;

    return mapUser(row);
  }

  revokeSession(token: string | null | undefined) {
    if (token) {
      this.database.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(hashSessionToken(token));
    }
  }

  private bootstrap(options: AuthServiceOptions) {
    if (this.hasAdmin()) {
      return;
    }

    const username = options.bootstrapUsername?.trim();
    const password = options.bootstrapPassword;
    if (!username || !password) {
      return;
    }
    if (password.length < (options.allowWeakBootstrapPassword ? 4 : 8)) {
      throw new Error("AUTH_BOOTSTRAP_PASSWORD is too short.");
    }

    const timestamp = this.now().toISOString();
    this.database
      .prepare(
        `INSERT INTO auth_users (id, username, display_name, password_hash, role, created_at, updated_at, disabled_at)
         VALUES (?, ?, ?, ?, 'admin', ?, ?, NULL)`
      )
      .run(
        randomUUID(),
        normaliseUsername(username),
        options.bootstrapDisplayName?.trim() || username.trim(),
        hashPassword(password),
        timestamp,
        timestamp
      );
  }
}

export function createAuthService(path: string | Database.Database, options: AuthServiceOptions = {}) {
  if (typeof path === "string" && path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const database = typeof path === "string" ? new Database(path) : path;
  return new AuthService(database, options);
}
