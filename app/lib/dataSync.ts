// Real-time Data Sync Manager for Enquiry Capture O2D
// Provides polling-based sync with Google Sheets via Apps Script
// with smart change detection and notification callbacks

import { SyncState, SyncNotification, SyncConfig, DEFAULT_SYNC_CONFIG } from './types';
import { normalizeEntries, generateDataHash, detectChanges } from './utils';

type SyncCallback = (data: Record<string, unknown>) => void;
type NotificationCallback = (notification: SyncNotification) => void;
type ErrorCallback = (error: string) => void;

interface SyncManagerOptions {
  /** Function to fetch data (getAdminData or getUserDashboardData) */
  fetchFn: () => Promise<Record<string, unknown>>;
  /** Called when new data is available */
  onData: SyncCallback;
  /** Called when changes are detected */
  onNotification?: NotificationCallback;
  /** Called on sync errors */
  onError?: ErrorCallback;
  /** Called when sync state changes */
  onStateChange?: (state: SyncState) => void;
  /** Sync configuration */
  config?: Partial<SyncConfig>;
}

export class DataSyncManager {
  private fetchFn: () => Promise<Record<string, unknown>>;
  private onData: SyncCallback;
  private onNotification?: NotificationCallback;
  private onError?: ErrorCallback;
  private onStateChange?: (state: SyncState) => void;
  private config: SyncConfig;
  
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private state: SyncState = {
    lastSyncTime: null,
    isSyncing: false,
    syncError: null,
    dataHash: null,
  };
  private previousEntries: Record<string, unknown>[] = [];
  private notificationId = 0;
  private isFirstFetch = true;
  private consecutiveErrors = 0;
  private maxConsecutiveErrors = 3;

  constructor(options: SyncManagerOptions) {
    this.fetchFn = options.fetchFn;
    this.onData = options.onData;
    this.onNotification = options.onNotification;
    this.onError = options.onError;
    this.onStateChange = options.onStateChange;
    this.config = { ...DEFAULT_SYNC_CONFIG, ...options.config };
  }

  /** Start the sync polling */
  start(): void {
    if (this.intervalId) return; // Already running
    
    // Do an initial fetch immediately
    this.sync();
    
    // Set up polling interval
    this.intervalId = setInterval(() => {
      if (!this.state.isSyncing) {
        this.sync();
      }
    }, this.config.pollInterval);
  }

  /** Stop the sync polling */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Force an immediate sync */
  async forceSync(): Promise<void> {
    await this.sync();
  }

  /** Get current sync state */
  getState(): SyncState {
    return { ...this.state };
  }

  /** Update sync configuration */
  updateConfig(config: Partial<SyncConfig>): void {
    const oldInterval = this.config.pollInterval;
    this.config = { ...this.config, ...config };
    
    // Restart polling if interval changed
    if (oldInterval !== this.config.pollInterval && this.intervalId) {
      this.stop();
      this.start();
    }
  }

  /** Destroy the manager and clean up */
  destroy(): void {
    this.stop();
    this.previousEntries = [];
  }

  private updateState(partial: Partial<SyncState>): void {
    this.state = { ...this.state, ...partial };
    this.onStateChange?.(this.state);
  }

  private async sync(): Promise<void> {
    if (!this.config.enabled) return;
    
    this.updateState({ isSyncing: true, syncError: null });

    try {
      const result = await this.fetchFn();
      
      if (!result || !(result as { success?: boolean }).success) {
        const msg = (result as { message?: string })?.message || 'Failed to fetch data';
        throw new Error(msg);
      }

      // Reset error counter on success
      this.consecutiveErrors = 0;

      // Normalize entries
      const rawEntries = ((result as { entries?: Record<string, unknown>[] }).entries || []) as Record<string, unknown>[];
      const normalizedEntries = normalizeEntries(rawEntries);
      
      // Replace entries in result with normalized ones
      const normalizedResult = { ...result, entries: normalizedEntries };

      // Generate hash for change detection
      const newHash = generateDataHash(normalizedEntries);
      
      if (this.isFirstFetch) {
        // First fetch - just store data, no notifications
        this.previousEntries = normalizedEntries;
        this.isFirstFetch = false;
        this.updateState({
          lastSyncTime: new Date(),
          isSyncing: false,
          dataHash: newHash,
        });
        this.onData(normalizedResult as unknown as Record<string, unknown>);
        return;
      }

      // Check if data has changed
      if (newHash !== this.state.dataHash) {
        // Data changed! Detect what changed
        const changes = detectChanges(this.previousEntries, normalizedEntries);
        
        // Generate notifications
        if (this.config.showNotifications && this.onNotification) {
          if (changes.newItems.length > 0) {
            if (changes.newItems.length === 1) {
              const entry = changes.newItems[0];
              this.emitNotification({
                type: 'new_entry',
                message: `New entry: ${entry.Entry_ID} - ${entry.Company_Name}`,
                entryId: String(entry.Entry_ID),
              });
            } else {
              this.emitNotification({
                type: 'new_entries',
                message: `${changes.newItems.length} new entries detected`,
                count: changes.newItems.length,
              });
            }
          }

          if (changes.updatedItems.length > 0) {
            changes.updatedItems.forEach(({ entry, changes: changeList }) => {
              this.emitNotification({
                type: 'updated_entry',
                message: `${entry.Entry_ID}: ${changeList[0]}${changeList.length > 1 ? ` (+${changeList.length - 1} more)` : ''}`,
                entryId: String(entry.Entry_ID),
              });
            });
          }
        }

        // Update stored entries
        this.previousEntries = normalizedEntries;
        
        // Deliver new data
        this.onData(normalizedResult as unknown as Record<string, unknown>);
      }

      this.updateState({
        lastSyncTime: new Date(),
        isSyncing: false,
        dataHash: newHash,
      });

    } catch (error) {
      this.consecutiveErrors++;
      const errorMsg = error instanceof Error ? error.message : 'Unknown sync error';
      
      this.updateState({
        isSyncing: false,
        syncError: errorMsg,
      });

      // Only notify on first error or every 3rd consecutive error
      if (this.consecutiveErrors === 1 || this.consecutiveErrors % this.maxConsecutiveErrors === 0) {
        this.onError?.(errorMsg);
      }

      // If too many consecutive errors, slow down polling
      if (this.consecutiveErrors >= this.maxConsecutiveErrors * 2) {
        this.updateConfig({ pollInterval: Math.min(this.config.pollInterval * 2, 30000) });
      }
    }
  }

  private emitNotification(partial: Omit<SyncNotification, 'id' | 'timestamp'>): void {
    this.notificationId++;
    const notification: SyncNotification = {
      id: `sync-${this.notificationId}-${Date.now()}`,
      timestamp: new Date(),
      ...partial,
    };
    this.onNotification?.(notification);
  }
}

/**
 * React hook helper - creates a sync manager with cleanup.
 * Usage in useEffect:
 * 
 * ```tsx
 * useEffect(() => {
 *   const manager = createSyncManager({
 *     fetchFn: () => getAdminData(email),
 *     onData: (data) => setAdminData(data),
 *     onNotification: (n) => showToast(n.message, 'info'),
 *     config: { pollInterval: 5000 },
 *   });
 *   manager.start();
 *   return () => manager.destroy();
 * }, [email]);
 * ```
 */
export function createSyncManager(options: SyncManagerOptions): DataSyncManager {
  return new DataSyncManager(options);
}
