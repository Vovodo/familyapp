import { api } from './api';
import { VoiceChannelState } from '../types';

export const voiceChannelApi = {
  get: () => api.get<VoiceChannelState>('/voice/channel'),
  join: () => api.post<VoiceChannelState>('/voice/join'),
  leave: () => api.post<VoiceChannelState>('/voice/leave'),
  heartbeat: () => api.post<VoiceChannelState>('/voice/heartbeat'),
  mute: (muted: boolean) => api.post<VoiceChannelState>('/voice/mute', { muted }),
};
