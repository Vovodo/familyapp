import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Family, FamilyMember } from '../types';
import { api, storage } from '../services/api';
import { useAuth } from './AuthContext';

interface FamilyContextType {
  currentFamily: Family | null;
  myFamilies: Family[];
  isLoading: boolean;
  activeMember: FamilyMember | null;
  createFamily: (name: string) => Promise<Family>;
  joinFamily: (inviteCode: string, nickname?: string) => Promise<Family>;
  refreshFamily: () => Promise<void>;
  selectFamily: (familyId: string) => Promise<void>;
  updateFamilySettings: (data: { name?: string; is_public?: boolean }) => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
  leaveFamily: () => Promise<void>;
  deleteFamily: (familyId: string) => Promise<void>;
}

const FamilyContext = createContext<FamilyContextType | undefined>(undefined);

export const FamilyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [currentFamily, setCurrentFamily] = useState<Family | null>(null);
  const [myFamilies, setMyFamilies] = useState<Family[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchFamilies = useCallback(async () => {
    if (!user) {
      setCurrentFamily(null);
      setMyFamilies([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const res = await api.get<Family[]>('/families/my-families');
      setMyFamilies(res.data);

      if (res.data.length > 0) {
        const savedFamilyId = await storage.get('active_family_id');
        const active = res.data.find((f) => f.id === savedFamilyId) || res.data[0];
        setCurrentFamily(active);
        await storage.set('active_family_id', active.id);
      } else {
        setCurrentFamily(null);
      }
    } catch (err) {
      console.error('Failed to load families:', err);
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

  const leaveFamily = async () => {
    await api.post('/families/leave');
    await storage.remove('active_family_id');
    await fetchFamilies();
  };

  const deleteFamily = async (familyId: string) => {
    setIsLoading(true);
    try {
      await api.delete(`/families/${familyId}`);

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
        activeMember,
        createFamily,
        joinFamily,
        refreshFamily,
        selectFamily,
        updateFamilySettings,
        removeMember,
        leaveFamily,
        deleteFamily,
      }}
    >
      {children}
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
