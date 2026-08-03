/*
 * Minimal ambient declarations for the WebExtensions APIs this project uses.
 * Hand written so the project needs no npm packages; extend when a new API
 * is adopted. Chrome exposes these on `chrome`, Firefox on `browser` (and a
 * `chrome` alias); both return promises for the methods declared here in
 * Manifest V3.
 */

interface AcpStorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

interface AcpStorageArea {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

interface AcpStorage {
  sync: AcpStorageArea;
  local: AcpStorageArea;
  session: AcpStorageArea;
  onChanged: {
    addListener(
      callback: (
        changes: Record<string, AcpStorageChange>,
        area: string
      ) => void
    ): void;
  };
}

interface AcpAlarm {
  name: string;
  scheduledTime: number;
  periodInMinutes?: number;
}

interface AcpAlarms {
  create(
    name: string,
    info: { when?: number; delayInMinutes?: number; periodInMinutes?: number }
  ): void;
  clear(name: string): void;
  onAlarm: { addListener(callback: (alarm: AcpAlarm) => void): void };
}

interface AcpRuntime {
  onInstalled: { addListener(callback: () => void): void };
  onStartup: { addListener(callback: () => void): void };
  openOptionsPage(): Promise<void>;
}

interface AcpPermissions {
  request(perms: {
    origins?: string[];
    permissions?: string[];
  }): Promise<boolean>;
  contains(perms: {
    origins?: string[];
    permissions?: string[];
  }): Promise<boolean>;
}

interface AcpWebExt {
  storage: AcpStorage;
  alarms: AcpAlarms;
  runtime: AcpRuntime;
  permissions: AcpPermissions;
}

declare const chrome: AcpWebExt;
declare const browser: AcpWebExt | undefined;

/* Present in the Chrome service worker global, absent in Firefox pages. */
declare function importScripts(...urls: string[]): void;
