import { TranscriptionResult } from '@/components/template/video-transcription'

// Version 1 of history format
export interface HistoryV1 {
  version: 1;
  items: TranscriptionResult[];
}

// Current version with additional features
export interface HistoryV2 {
  version: 2;
  items: Array<{
    id: string;
    result: TranscriptionResult;
    createdAt: string;
    updatedAt: string;
    isDeleted?: boolean;
    deletedAt?: string;
  }>;
  lastUpdated: string;
}

export type HistoryVersion = HistoryV1 | HistoryV2;

class HistoryManager {
  private static CURRENT_VERSION = 2;
  private static STORAGE_KEY = 'transcriptionHistory';
  private static BACKUP_KEY = 'transcriptionHistory_backup';
  private static LEGACY_KEY = 'transcriptionsHistory';

  // Add method to check if we're in browser
  private static isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  // Load history with fallback and migration
  static load(): HistoryV2 {
    if (!this.isBrowser()) {
      return this.createEmpty();
    }

    try {
      // First try to load from new format
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return this.migrateToLatest(parsed);
      }

      // Then try to load from old format
      const legacy = localStorage.getItem(this.LEGACY_KEY);
      if (legacy) {
        const legacyData = JSON.parse(legacy);
        // If it's an array, it's from the old format
        if (Array.isArray(legacyData)) {
          console.log('Found legacy data:', legacyData);
          return this.migrateLegacy(legacy);
        }
      }

      // Return empty history if nothing found
      return this.createEmpty();
    } catch (error) {
      console.error('Failed to load history:', error);
      return this.recoverFromBackup();
    }
  }

  // Add debug logging
  private static log(action: string, data?: any) {
    console.log(`HistoryManager: ${action}`, data);
  }

  // Save with backup
  static save(history: HistoryV2): boolean {
    if (!this.isBrowser()) {
      return false;
    }

    try {
      this.log('Saving history', history);
      
      // Backup current data first
      const current = localStorage.getItem(this.STORAGE_KEY);
      if (current) {
        localStorage.setItem(this.BACKUP_KEY, current);
      }

      // Update lastUpdated
      history.lastUpdated = new Date().toISOString();
      
      // Ensure all items have required fields
      history.items = history.items.map(item => ({
        ...item,
        id: item.id || crypto.randomUUID(),
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        result: {
          ...item.result,
          id: item.result.id || crypto.randomUUID(),
          createdAt: item.result.createdAt || item.createdAt || new Date().toISOString()
        }
      }));

      // Save new data
      const dataToSave = JSON.stringify(history);
      localStorage.setItem(this.STORAGE_KEY, dataToSave);
      
      // Verify save
      const savedData = localStorage.getItem(this.STORAGE_KEY);
      if (savedData !== dataToSave) {
        throw new Error('Save verification failed');
      }

      this.log('History saved successfully');
      return true;
    } catch (error) {
      console.error('Failed to save history:', error);
      return false;
    }
  }

  // Add new transcription with deduplication
  static addTranscription(result: TranscriptionResult): boolean {
    try {
      this.log('Adding transcription', result);
      
      const history = this.load();
      const timestamp = new Date().toISOString();

      // Check for duplicates by text content only
      const isDuplicate = history.items.some(item => 
        item.result.text.trim() === result.text.trim()
      );

      if (isDuplicate) {
        this.log('Duplicate transcription detected, skipping');
        return false;
      }

      // Add new transcription
      const newItem = {
        id: crypto.randomUUID(),
        result: {
          ...result,
          id: result.id || crypto.randomUUID(),
          createdAt: timestamp
        },
        createdAt: timestamp,
        updatedAt: timestamp
      };

      history.items.unshift(newItem);
      
      // Save and verify
      const saved = this.save(history);
      if (saved) {
        this.log('Transcription added successfully');
      }
      return saved;
    } catch (error) {
      console.error('Failed to add transcription:', error);
      return false;
    }
  }

  // Migrate legacy data
  private static migrateLegacy(legacyData: string): HistoryV2 {
    try {
      // Backup legacy data first
      localStorage.setItem(`${this.LEGACY_KEY}_backup`, legacyData);
      
      const parsed = JSON.parse(legacyData);
      console.log('Migrating legacy data:', parsed);

      // Get the oldest possible date for legacy items
      const legacyBaseDate = new Date('2024-01-01').toISOString();

      // Deduplicate legacy items based on text content
      const uniqueItems = Array.isArray(parsed) ? 
        parsed.filter((item, index, self) => 
          index === self.findIndex(t => 
            t.text.trim() === item.text.trim()
          )
        ) : [];

      const migrated: HistoryV2 = {
        version: 2,
        items: uniqueItems.map((item, index) => {
          // Calculate a timestamp that spaces out legacy items
          const timeOffset = index * 60 * 1000; // 1 minute apart
          const timestamp = new Date(Date.now() - timeOffset).toISOString();
          
          return {
            id: crypto.randomUUID(),
            result: {
              id: crypto.randomUUID(),
              text: item.text,
              createdAt: item.metadata?.transcribedAt || timestamp,
              metadata: {
                ...item.metadata,
                transcribedAt: item.metadata?.transcribedAt || legacyBaseDate
              }
            },
            createdAt: item.metadata?.transcribedAt || timestamp,
            updatedAt: item.metadata?.transcribedAt || timestamp
          };
        }),
        lastUpdated: new Date().toISOString()
      };

      // Sort items by createdAt in descending order (newest first)
      migrated.items.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      // Save migrated data
      console.log('Migrated data:', migrated);
      this.save(migrated);
      
      return migrated;
    } catch (error) {
      console.error('Migration failed:', error);
      return this.createEmpty();
    }
  }

  // Create empty history
  static createEmpty(): HistoryV2 {
    return {
      version: 2,
      items: [],
      lastUpdated: new Date().toISOString()
    };
  }

  // Recover from backup
  private static recoverFromBackup(): HistoryV2 {
    try {
      const backup = localStorage.getItem(this.BACKUP_KEY);
      if (backup) {
        return this.migrateToLatest(JSON.parse(backup));
      }
    } catch (error) {
      console.error('Failed to recover from backup:', error);
    }
    return this.createEmpty();
  }

  // Migrate any version to latest
  private static migrateToLatest(history: HistoryVersion): HistoryV2 {
    if (history.version === this.CURRENT_VERSION) {
      return history as HistoryV2;
    }

    if (history.version === 1) {
      return {
        version: 2,
        items: history.items.map(item => ({
          id: crypto.randomUUID(),
          result: item,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })),
        lastUpdated: new Date().toISOString()
      };
    }

    return this.createEmpty();
  }

  // Add method to check if legacy data exists
  static hasLegacyData(): boolean {
    if (!this.isBrowser()) {
      return false;
    }
    const legacy = localStorage.getItem(this.LEGACY_KEY);
    return !!legacy;
  }

  // Add method to force migration of legacy data
  static forceMigrateLegacy(): boolean {
    try {
      const legacy = localStorage.getItem(this.LEGACY_KEY);
      if (legacy) {
        const migrated = this.migrateLegacy(legacy);
        return this.save(migrated);
      }
      return false;
    } catch (error) {
      console.error('Force migration failed:', error);
      return false;
    }
  }

  // Add a method to clean up duplicates in existing history
  static cleanupDuplicates(): boolean {
    try {
      const history = this.load();
      
      // Create a map to track unique texts
      const seen = new Map<string, boolean>();
      
      // Filter out duplicates while keeping the first occurrence
      const uniqueItems = history.items.filter(item => {
        const text = item.result.text.trim();
        if (seen.has(text)) {
          return false;
        }
        seen.set(text, true);
        return true;
      });

      // If no duplicates were found, return early
      if (uniqueItems.length === history.items.length) {
        console.log('No duplicates found');
        return true;
      }

      // Update history with deduplicated items
      const updatedHistory: HistoryV2 = {
        ...history,
        items: uniqueItems,
        lastUpdated: new Date().toISOString()
      };

      console.log(`Removed ${history.items.length - uniqueItems.length} duplicates`);
      return this.save(updatedHistory);
    } catch (error) {
      console.error('Failed to cleanup duplicates:', error);
      return false;
    }
  }

  // Add method to verify storage
  static verifyStorage(): boolean {
    try {
      const testKey = '_test_storage_';
      localStorage.setItem(testKey, 'test');
      const testValue = localStorage.getItem(testKey);
      localStorage.removeItem(testKey);
      return testValue === 'test';
    } catch (error) {
      console.error('Storage verification failed:', error);
      return false;
    }
  }
}

export default HistoryManager; 