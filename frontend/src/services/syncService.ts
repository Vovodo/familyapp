import { api } from './api';
import { cacheService } from './cacheService';
import { localChatStorage, reconcileMessages } from './localChatStorage';
import { localMediaVault } from './localMediaVault';
import {
  Message,
  SyncStatus,
  RestoreProgress,
  StorageQuotaBreakdown,
  StorageReconciliationReport,
  CleanupJobLog,
} from '../types';

/**
 * syncService.ts
 * Unified Cloud Backup and Synchronization Engine.
 * 1. ZORUNLU BULUT SENKRONİZASYONU: Instant sync for Notes, Tasks, Budget, Shopping, Reminders.
 * 2. OPSİYONEL TOPLU SOHBET YEDEKLEMESİ: Batch & incremental sync queue for Chat and Media.
 * 3. KONTROLLÜ RESTORE MOTORU: Safe, resumable chat and binary media restoration for new devices.
 * 4. AKILLI STORAGE QUOTA & RETENTION: Categorized quota tracking and reconciliation.
 */

class SyncService {
  private isFlushing = false;
  private flushTimeout: any = null;

  /**
   * ZORUNLU BULUT SENKRONİZASYONU (Mandatory Cloud Sync):
   * Rapidly pulls all non-chat structural data and hydrates cacheService.
   */
  public async syncMandatoryData(familyId: string): Promise<void> {
    if (!familyId) return;
    try {
      const res = await api.get<any>('/sync/mandatory-data');
      const data = res.data;

      if (data.notes) cacheService.set(`notes_${familyId}`, data.notes);
      if (data.tasks) cacheService.set(`tasks_${familyId}`, data.tasks);
      if (data.budget) cacheService.set(`budget_${familyId}`, data.budget);
      if (data.shopping) cacheService.set(`shopping_${familyId}`, data.shopping);
      if (data.reminders) cacheService.set(`reminders_${familyId}`, data.reminders);

      console.debug('[SYNC] Mandatory cloud data synchronized for family:', familyId);
    } catch (err) {
      console.warn('[SYNC] Mandatory sync note:', err);
    }
  }

  /**
   * Fetches latest family sync & backup status from backend
   */
  public async getSyncStatus(): Promise<SyncStatus | null> {
    try {
      const res = await api.get<SyncStatus>('/sync/status');
      return res.data;
    } catch {
      return null;
    }
  }

  /**
   * Fetches granular storage quota breakdown across CHAT (50%), IMAGE (40%), AUDIO (10%)
   */
  public async getStorageBreakdown(): Promise<StorageQuotaBreakdown | null> {
    try {
      const res = await api.get<StorageQuotaBreakdown>('/sync/storage-breakdown');
      return res.data;
    } catch (err) {
      console.warn('[SYNC] Failed to fetch storage breakdown:', err);
      return null;
    }
  }

  /**
   * [ADMIN ONLY] Triggers Supabase Storage reconciliation and orphan cleanup
   */
  public async triggerStorageReconcile(): Promise<StorageReconciliationReport> {
    const res = await api.post<StorageReconciliationReport>('/sync/storage-reconcile');
    return res.data;
  }

  /**
   * [ADMIN ONLY] Fetches historical audit log of cleanup and retention operations
   */
  public async getCleanupHistory(limit: number = 20): Promise<CleanupJobLog[]> {
    try {
      const res = await api.get<CleanupJobLog[]>('/sync/cleanup-history', { params: { limit } });
      return res.data;
    } catch {
      return [];
    }
  }

  /**
   * [ADMIN ONLY] Toggles optional cloud chat backup
   */
  public async toggleCloudChatBackup(enabled: boolean): Promise<SyncStatus> {
    const res = await api.post<SyncStatus>('/sync/family-backup-toggle', { enabled });
    return res.data;
  }

  /**
   * Enqueues a message for batch incremental backup if cloud backup is enabled.
   * Only durable (http) media URLs are queued — blob URLs cannot be restored.
   */
  public queueMessageForBackup(familyId: string, message: Message, isBackupEnabled: boolean): void {
    if (!familyId || !isBackupEnabled) return;
    if (message.id?.startsWith('temp-')) return;

    try {
      const key = `ailem_pending_backup_${familyId}`;
      const existingStr = localStorage.getItem(key);
      const queue: any[] = existingStr ? JSON.parse(existingStr) : [];

      if (!queue.some((m) => m.id === message.id || (message.client_message_id && m.client_message_id === message.client_message_id))) {
        queue.push({
          id: message.id,
          client_message_id: message.client_message_id,
          sender_id: message.sender_id,
          content: message.content,
          media_url: message.media_url?.startsWith('http') ? message.media_url : undefined,
          media_type: message.media_type,
          created_at: message.created_at || new Date().toISOString(),
        });
        localStorage.setItem(key, JSON.stringify(queue));
      }

      if (queue.length >= 8) {
        this.flushBackupQueue(familyId);
      } else {
        if (this.flushTimeout) clearTimeout(this.flushTimeout);
        this.flushTimeout = setTimeout(() => this.flushBackupQueue(familyId), 20000);
      }
    } catch (err) {
      console.warn('[SYNC] Queue message error:', err);
    }
  }

  /**
   * Pushes the local chat snapshot to cloud backup (idempotent by client_message_id).
   * Used by "Şimdi Yedekle" — the live send path already writes to /messages/.
   */
  public async backupLocalChatNow(familyId: string): Promise<{ saved_count: number; status: string }> {
    if (!familyId) return { saved_count: 0, status: 'skipped' };

    await this.flushBackupQueue(familyId);

    const local = await localChatStorage.getMessages(familyId);
    const payload = local
      .filter((m) => m.id && !m.id.startsWith('temp-') && m.status !== 'failed')
      .map((m) => ({
        id: m.id,
        client_message_id: m.client_message_id,
        sender_id: m.sender_id,
        content: m.content,
        media_url: m.media_url?.startsWith('http') ? m.media_url : undefined,
        media_type: m.media_type,
        created_at: m.created_at,
      }));

    if (payload.length === 0) {
      return { saved_count: 0, status: 'empty' };
    }

    const chunkSize = 80;
    let saved = 0;
    let lastStatus = 'success';
    for (let i = 0; i < payload.length; i += chunkSize) {
      const chunk = payload.slice(i, i + chunkSize);
      const res = await api.post('/sync/chat-backup', { messages: chunk });
      lastStatus = res.data.status;
      saved += res.data.saved_count || 0;
      if (lastStatus === 'backup_disabled' || lastStatus === 'failed_storage_quota') {
        break;
      }
    }
    return { saved_count: saved, status: lastStatus };
  }

  /**
   * Flushes the pending dirty queue to the backend in a single batch
   */
  public async flushBackupQueue(familyId: string): Promise<void> {
    if (this.isFlushing || !familyId) return;

    const key = `ailem_pending_backup_${familyId}`;
    const existingStr = localStorage.getItem(key);
    if (!existingStr) return;

    let queue: any[] = [];
    try {
      queue = JSON.parse(existingStr);
    } catch {
      return;
    }

    if (queue.length === 0) return;

    this.isFlushing = true;
    try {
      console.info(`[SYNC] Flushing ${queue.length} pending messages to cloud backup...`);
      const res = await api.post('/sync/chat-backup', { messages: queue });
      if (res.data.status === 'success' || res.data.status === 'backup_disabled') {
        localStorage.removeItem(key);
        console.info(`[SYNC] Batch backup completed successfully. Ingested: ${res.data.saved_count}`);
      }
    } catch (err) {
      console.warn('[SYNC] Batch backup flush failed (will retry later):', err);
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * KONTROLLÜ RESTORE MOTORU:
   * Restores chat messages and binary media from Supabase / Backend for a fresh device.
   */
  public async restoreChatFromCloud(
    familyId: string,
    onProgress: (progress: RestoreProgress) => void
  ): Promise<void> {
    if (!familyId) return;

    try {
      // Step 1: Fetch Chat History Metadata
      onProgress({
        step: 'fetching',
        percent: 10,
        completedMessages: 0,
        totalMessages: 0,
        completedMedia: 0,
        totalMedia: 0,
      });

      const allMapped: Message[] = [];
      let offset = 0;
      const pageSize = 300;
      let totalMessages = 0;
      let totalMediaFiles = 0;
      let hasMore = true;

      while (hasMore) {
        const res = await api.get<any>('/sync/chat-restore', {
          params: { limit: pageSize, offset },
        });

        const { messages = [], total_messages = 0, total_media_files = 0, has_more = false } = res.data;
        totalMessages = total_messages;
        totalMediaFiles = total_media_files;

        const mappedMessages: Message[] = messages.map((m: any) => ({
          id: m.id,
          client_message_id: m.client_message_id,
          family_id: familyId,
          sender_id: m.sender_id,
          sender_name: m.sender_name,
          sender_avatar: m.sender_avatar,
          sender_nickname: m.sender_nickname,
          content: m.content,
          media_url: m.media_url,
          media_thumbnail_url: m.media_thumbnail_url,
          media_type: m.media_type,
          is_edited: false,
          created_at: m.created_at,
        }));
        allMapped.push(...mappedMessages);

        onProgress({
          step: 'saving_messages',
          percent: Math.min(40, 10 + Math.round((allMapped.length / Math.max(1, totalMessages)) * 30)),
          completedMessages: allMapped.length,
          totalMessages: totalMessages,
          completedMedia: 0,
          totalMedia: totalMediaFiles,
        });

        hasMore = Boolean(has_more) && messages.length >= pageSize;
        offset += pageSize;
        if (offset > 20000) break;
      }

      const currentLocal = await localChatStorage.getMessages(familyId);
      const merged = reconcileMessages(currentLocal, allMapped);
      await localChatStorage.saveMessages(familyId, merged);

      const mediaMessages = merged.filter((m) => m.media_url && !m.media_url.startsWith('blob:'));
      let downloadedMediaCount = 0;

      onProgress({
        step: 'downloading_media',
        percent: 45,
        completedMessages: merged.length,
        totalMessages: totalMessages,
        completedMedia: 0,
        totalMedia: mediaMessages.length,
      });

      for (let i = 0; i < mediaMessages.length; i++) {
        const msg = mediaMessages[i];
        if (msg.media_url) {
          const type = msg.media_type === 'audio' || msg.media_type?.startsWith('audio/') ? 'audio' : 'images';
          try {
            await localMediaVault.ensureCached(msg.media_url, type);
          } catch {}
          downloadedMediaCount++;

          const mediaPercent = 45 + Math.round((downloadedMediaCount / Math.max(1, mediaMessages.length)) * 50);
          onProgress({
            step: 'downloading_media',
            percent: Math.min(98, mediaPercent),
            completedMessages: merged.length,
            totalMessages: totalMessages,
            completedMedia: downloadedMediaCount,
            totalMedia: mediaMessages.length,
          });
        }
      }

      localStorage.setItem(`ailem_chat_restored_${familyId}`, 'true');
      onProgress({
        step: 'completed',
        percent: 100,
        completedMessages: merged.length,
        totalMessages: totalMessages,
        completedMedia: downloadedMediaCount,
        totalMedia: mediaMessages.length,
      });

      console.info('[SYNC] Chat restoration completed successfully.');
    } catch (err: any) {
      console.error('[SYNC] Chat restore error:', err);
      onProgress({
        step: 'error',
        percent: 0,
        completedMessages: 0,
        totalMessages: 0,
        completedMedia: 0,
        totalMedia: 0,
        error: err.message || 'Geri yükleme sırasında bir hata oluştu.',
      });
      throw err;
    }
  }
}

export const syncService = new SyncService();
