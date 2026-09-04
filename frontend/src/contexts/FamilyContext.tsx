import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Family, FamilyMember, Message } from '../types';
import { api, storage } from '../services/api';
import { syncService } from '../services/syncService';
import { localChatStorage, reconcileMessages } from '../services/localChatStorage';
import { localMediaVault } from '../services/localMediaVault';
import { supabase } from '../services/supabase';
import { CloudRestorePromptModal } from '../components/common/CloudRestorePromptModal';
import { useAuth } from './AuthContext';

interface FamilyContextType {
  currentFamily: Family | null;
  myFamilies: Family[];
  isLoading: boolean;
  /** True only after the server has actually confirmed the membership list. */
  familiesLoaded: boolean;
  loadError: string | null;
  activeMember: FamilyMember | null;
  retryLoadFamilies: () => Promise<void>;
  createFamily: (name: string) => Promise<Family>;
  joinFamily: (inviteCode: string, nickname?: string) => Promise<Family>;
  refreshFamily: () => Promise<void>;
  selectFamily: (familyId: string) => Promise<void>;
  updateFamilySettings: (data: { name?: string; is_public?: boolean; cloud_chat_backup_enabled?: boolean }) => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
  leaveFamily: () => Promise<void>;
  transferOwnership: (memberId: string) => Promise<Family>;
  deleteFamily: (familyId: string) => Promise<void>;
}

const FamilyContext = createContext<FamilyContextType | undefined>(undefined);

export const FamilyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [currentFamily, setCurrentFamily] = useState<Family | null>(null);
  const [myFamilies, setMyFamilies] = useState<Family[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [familiesLoaded, setFamiliesLoaded] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showRestorePrompt, setShowRestorePrompt] = useState<boolean>(false);

  // Trigger Mandatory Cloud Sync and Check Restore Need when Active Family Changes
  useEffect(() => {
    if (currentFamily?.id) {
      // 1. ZORUNLU BULUT SENKRONİZASYONU: Sync Notes, Tasks, Budget, Shopping, Reminders
      syncService.syncMandatoryData(currentFamily.id);

      // 2. Fresh Install / New Device Restore Prompt for Cloud Chat
      if (currentFamily.cloud_chat_backup_enabled) {
        const restoredKey = `ailem_chat_restored_${currentFamily.id}`;
        const hasPrompted = localStorage.getItem(restoredKey);
        if (!hasPrompted) {
          localChatStorage.getMessages(currentFamily.id).then((localMsgs) => {
            if (localMsgs.length > 0) {
              localStorage.setItem(restoredKey, 'true');
              return;
            }
            setShowRestorePrompt(true);
          });
        }
      }
    }
  }, [currentFamily?.id, currentFamily?.cloud_chat_backup_enabled]);

  // WhatsApp-style inbox: cache stays warm even when /chat is closed.
  // Own channel name so ChatPage's family-chat subscription is not torn down.
  useEffect(() => {
    if (!currentFamily?.id || !user?.id) return;
    const familyId = currentFamily.id;

    const ingest = async (incoming: Message) => {
      const local = await localChatStorage.getMessages(familyId);
      const merged = reconcileMessages(local, [incoming]);
      await localChatStorage.saveMessages(familyId, merged);
      if (incoming.media_type === 'audio' && incoming.media_url) {
        void localMediaVault.ensureCached(incoming.media_url, 'audio');
      }
    };

    const warmInbox = async () => {
      try {
        const res = await api.get<Message[]>('/messages/', { params: { limit: 40 } });
        const local = await localChatStorage.getMessages(familyId);
        const merged = reconcileMessages(local, res.data);
        await localChatStorage.saveMessages(familyId, merged);
        res.data.forEach((msg) => {
          if (msg.media_type === 'audio' && msg.media_url) {
            void localMediaVault.ensureCached(msg.media_url, 'audio');
          }
        });
      } catch {
        await localChatStorage.getMessages(familyId);
      }
    };

    void warmInbox();

    const channel = supabase.channel(`family-inbox-${familyId}`);
    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `family_id=eq.${familyId}`,
        },
        (payload) => {
          const row = payload.new as Partial<Message> & { id?: string };
          if (!row?.id) return;
          void ingest({
            id: row.id,
            family_id: familyId,
            sender_id: row.sender_id || '',
            content: row.content,
            media_url: row.media_url,
            media_thumbnail_url: row.media_thumbnail_url,
            media_type: row.media_type,
            is_edited: Boolean(row.is_edited),
            created_at: row.created_at || new Date().toISOString(),
            client_message_id: row.client_message_id,
          });
        }
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === 'visible') void warmInbox();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      channel.unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [currentFamily?.id, user?.id]);

  const fetchFamilies = useCallback(async () => {
    if (!user) {
      setCurrentFamily(null);
      setMyFamilies([]);
      setFamiliesLoaded(false);
      setLoadError(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setLoadError(null);
      const res = await api.get<Family[]>('/families/my-families');
      const familiesList = Array.isArray(res.data) ? res.data : [];
      setMyFamilies(familiesList);
      setFamiliesLoaded(true);

      if (familiesList.length > 0) {
        const savedFamilyId = await storage.get('active_family_id');
        const active = familiesList.find((f) => f.id === savedFamilyId) || familiesList[0];
        setCurrentFamily(active);
        await storage.set('active_family_id', active.id);
      } else {
        setCurrentFamily(null);
        await storage.remove('active_family_id');
      }
    } catch (err: any) {
      // A failed request is not proof that the user has no family. Clearing the
      // state here would drop an existing member onto the create/join onboarding
      // and let them start a second family over their real one.
      console.error('Failed to load families:', err);
      setLoadError(err?.message || 'Aile bilgileri yüklenemedi.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchFamilies();
  }, [fetchFamilies]);

  const selectFamily = async (familyId: string) => {
    const fam = myFamilies.find((f) => f.id === familyId);
    if (fam) {
      setCurrentFamily(fam);
      await storage.set('active_family_id', fam.id);
    }
  };

  const createFamily = async (name: string): Promise<Family> => {
    setIsLoading(true);
    try {
      const res = await api.post<Family>('/families/', { name });
      await fetchFamilies();
      setCurrentFamily(res.data);
      await storage.set('active_family_id', res.data.id);
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  const joinFamily = async (inviteCode: string, nickname?: string): Promise<Family> => {
    setIsLoading(true);
    try {
      const res = await api.post<Family>('/families/join', {
        invite_code: inviteCode,
        nickname,
      });
      await fetchFamilies();
      setCurrentFamily(res.data);
      await storage.set('active_family_id', res.data.id);
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  const refreshFamily = async () => {
    if (!currentFamily) return;
    try {
      const res = await api.get<Family>('/families/me');
      setCurrentFamily(res.data);
    } catch (err) {
      console.error('Error refreshing family:', err);
    }
  };

  const updateFamilySettings = async (data: { name?: string; is_public?: boolean }) => {
    const res = await api.patch<Family>('/families/settings', data);
    setCurrentFamily(res.data);
  };

  const removeMember = async (memberId: string) => {
    await api.delete(`/families/members/${memberId}`);
    await refreshFamily();
  };

  const transferOwnership = async (memberId: string): Promise<Family> => {
    const res = await api.post<Family>('/families/transfer-ownership', { member_id: memberId });
    setCurrentFamily(res.data);
    return res.data;
  };

  const leaveFamily = async () => {
    await api.post('/families/leave');
    await storage.remove('active_family_id');
    await fetchFamilies();
  };

  const deleteFamily = async (familyId: string) => {
    setIsLoading(true);
    try {
      await api.post('/families/close', { family_id: familyId }, {
        headers: { 'x-family-id': familyId },
      });

      try {
        localStorage.removeItem(`ailem_msgs_${familyId}`);
        localStorage.removeItem(`ailem_notes_${familyId}`);
        localStorage.removeItem(`ailem_shopping_items_${familyId}`);
        localStorage.removeItem(`ailem_reminders_${familyId}`);
      } catch {}

      await storage.remove('active_family_id');

      const remaining = myFamilies.filter((f) => f.id !== familyId);
      setMyFamilies(remaining);

      if (remaining.length > 0) {
        setCurrentFamily(remaining[0]);
        await storage.set('active_family_id', remaining[0].id);
      } else {
        setCurrentFamily(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const activeMember = currentFamily && user
    ? currentFamily.members?.find((m) => m.user_id === user.id) || null
    : null;

  return (
    <FamilyContext.Provider
      value={{
        currentFamily,
        myFamilies,
        isLoading,
        familiesLoaded,
        loadError,
        activeMember,
        retryLoadFamilies: fetchFamilies,
        createFamily,
        joinFamily,
        refreshFamily,
        selectFamily,
        updateFamilySettings,
        removeMember,
        leaveFamily,
        transferOwnership,
        deleteFamily,
      }}
    >
      {children}

      {/* Fresh Install / New Device Cloud Restore Prompt */}
      {showRestorePrompt && currentFamily && (
        <CloudRestorePromptModal
          familyId={currentFamily.id}
          familyName={currentFamily.name}
          onFinished={() => setShowRestorePrompt(false)}
        />
      )}
    </FamilyContext.Provider>
  );
};

export const useFamily = () => {
  const context = useContext(FamilyContext);
  if (!context) {
    throw new Error('useFamily must be used within a FamilyProvider');
  }
  return context;
};
