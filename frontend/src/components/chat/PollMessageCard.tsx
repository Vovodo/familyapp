import React, { useState, useEffect, useRef } from 'react';
import { Check, Clock, Crown, BarChart3, Users } from 'lucide-react';
import { Message, PollData, PollVoter } from '../../types';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';

interface PollMessageCardProps {
  message: Message;
  isMe: boolean;
  onPollChange?: (poll: PollData) => void;
}

export const PollMessageCard: React.FC<PollMessageCardProps> = ({ message, isMe, onPollChange }) => {
  const { user } = useAuth();
  const { currentFamily } = useFamily();

  const [poll, setPoll] = useState<PollData | null>(() => {
    if (message.poll) return message.poll;
    try {
      const parsed = JSON.parse(message.content || '{}');
      if (parsed.poll_id || parsed.options) return parsed;
    } catch {
      // Fallback
    }
    return null;
  });

  const [selectedOption, setSelectedOption] = useState<number | null>(
    () => poll?.my_vote ?? null
  );
  const voteGenerationRef = useRef(0);
  const selectedOptionRef = useRef<number | null>(poll?.my_vote ?? null);

  const countVotes = (data?: {
    total_votes?: number;
    tallies?: Record<string | number, number>;
  } | null) => {
    if (!data) return 0;
    const fromTotal = Number(data.total_votes);
    if (Number.isFinite(fromTotal) && fromTotal > 0) return fromTotal;
    return Object.values(data.tallies || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  };

  const applyIncomingPoll = (incoming: PollData, force = false) => {
    setPoll((prev) => {
      const localVote = prev?.my_vote ?? selectedOptionRef.current;
      const incomingCount = countVotes(incoming);
      const localCount = countVotes(prev);

      if (!prev || force) {
        if (!force && localVote != null && incomingCount === 0) {
          return prev || incoming;
        }
        return incoming;
      }

      if (localCount > incomingCount || (incomingCount === 0 && localVote != null && localCount > 0)) {
        const kept: PollData = {
          ...incoming,
          ...prev,
          my_vote: prev.my_vote ?? incoming.my_vote ?? localVote,
          tallies: prev.tallies,
          voters: prev.voters,
          total_votes: localCount,
        };
        return kept;
      }

      return {
        ...prev,
        ...incoming,
        my_vote: incoming.my_vote ?? prev.my_vote ?? localVote,
        total_votes: Math.max(localCount, incomingCount),
      };
    });
    if (incoming.my_vote !== undefined && incoming.my_vote !== null) {
      selectedOptionRef.current = incoming.my_vote;
      setSelectedOption(incoming.my_vote);
    }
  };

  // Sync with message.poll prop if updated — never let a stale 0-vote snapshot wipe a local vote.
  useEffect(() => {
    if (message.poll) {
      applyIncomingPoll(message.poll);
    }
  }, [message.poll]);

  // Fetch live poll details on mount if poll data is missing or incomplete
  useEffect(() => {
    const targetId = poll?.poll_id || poll?.message_id || message.id;
    if (!targetId) return;

    if (poll && (poll.my_vote != null || countVotes(poll) > 0)) return;

    const hasVoters = Object.values(poll?.voters || {}).some(
      (list) => Array.isArray(list) && list.length > 0
    );
    if (hasVoters) return;

    let cancelled = false;
    const generation = voteGenerationRef.current;

    api
      .get<PollData>(`/messages/poll/${targetId}`)
      .then((res) => {
        if (cancelled || generation !== voteGenerationRef.current) return;
        if (countVotes(res.data) === 0 && selectedOptionRef.current != null) return;
        applyIncomingPoll(res.data);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [message.id]);

  // Realtime Supabase Broadcast listener
  useEffect(() => {
    const targetPollId = poll?.poll_id || poll?.message_id || message.id;
    if (!currentFamily || !supabase || !targetPollId) return;

    const channel = supabase.channel(`poll-${targetPollId}`);
    channel
      .on('broadcast', { event: 'poll_voted' }, ({ payload }) => {
        setPoll((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            tallies: payload.tallies ?? prev.tallies,
            voters: payload.voters ?? prev.voters,
            total_votes: payload.total_votes ?? prev.total_votes,
          };
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentFamily?.id, poll?.poll_id, message.id]);

  if (!poll || !poll.options || poll.options.length === 0) {
    return (
      <div className="p-3 text-xs italic text-gray-500 flex items-center gap-2">
        <BarChart3 className="w-4 h-4 animate-pulse text-indigo-500" />
        <span>Anket bilgileri yükleniyor...</span>
      </div>
    );
  }

  const now = new Date();
  const expiresAt = new Date(poll.expires_at);
  const isExpired = poll.is_closed || now > expiresAt;

  // Calculate total votes and max votes for crown
  const tallies = poll.tallies || {};
  const votersMap = poll.voters || {};
  const totalVotes = Object.values(tallies).reduce((a, b) => a + Number(b), 0);
  const maxVotes = Math.max(0, ...Object.values(tallies).map(Number));

  // 0ms Optimistic Instant Vote with 100% Synchronous Avatar & Percentage Animation
  const handleVote = async (optionIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isExpired) return;

    if (selectedOption === optionIndex) return; // Already voted for this option

    voteGenerationRef.current += 1;
    const generation = voteGenerationRef.current;

    // 1. Instant optimistic state update
    selectedOptionRef.current = optionIndex;
    setSelectedOption(optionIndex);

    const currentUserVoter: PollVoter = {
      user_id: user?.id || 'me',
      name: user?.full_name || 'Ben',
      avatar: user?.avatar_url || null,
    };

    // Deep clean votersMap: strip current user from ALL options so they only appear once
    const newVoters: Record<string | number, PollVoter[]> = {};
    for (let i = 0; i < poll.options.length; i++) {
      const list: PollVoter[] = votersMap[i] || votersMap[String(i)] || [];
      newVoters[i] = list.filter(
        (v) => v.user_id !== user?.id && v.name !== user?.full_name
      );
    }

    // Add user to the chosen option
    if (!newVoters[optionIndex]) newVoters[optionIndex] = [];
    newVoters[optionIndex].push(currentUserVoter);

    // Recompute tallies strictly from clean voter arrays
    const newTallies: Record<string | number, number> = {};
    for (let i = 0; i < poll.options.length; i++) {
      newTallies[i] = (newVoters[i] || []).length;
    }
    const newTotalVotes = Object.values(newTallies).reduce((a, b) => a + Number(b), 0);

    const updatedPoll: PollData = {
      ...poll,
      tallies: newTallies,
      voters: newVoters,
      total_votes: newTotalVotes,
      my_vote: optionIndex,
    };

    setPoll(updatedPoll);
    onPollChange?.(updatedPoll);

    if (navigator.vibrate) navigator.vibrate(25);

    // 2. Broadcast single authoritative websocket event to family chat channel
    const targetPollId = poll.poll_id || poll.message_id || message.id;
    if (supabase && currentFamily) {
      const payload = {
        poll_id: targetPollId,
        message_id: message.id,
        tallies: newTallies,
        voters: newVoters,
        total_votes: newTotalVotes,
        voter_id: user?.id,
        option_index: optionIndex,
      };
      supabase.channel(`family-chat-${currentFamily.id}`).send({
        type: 'broadcast',
        event: 'poll_voted',
        payload,
      });
    }

    // 3. Sync with backend API in background
    try {
      const res = await api.post<{
        tallies: Record<string | number, number>;
        voters: Record<string | number, PollVoter[]>;
        total_votes: number;
        my_vote: number;
      }>(`/messages/poll/${targetPollId}/vote`, {
        option_index: optionIndex,
      });

      if (res.data) {
        if (generation !== voteGenerationRef.current) return;
        const serverTotal = countVotes(res.data);
        if (serverTotal < newTotalVotes) {
          return;
        }
        const confirmed: PollData = {
          ...updatedPoll,
          tallies: res.data.tallies || newTallies,
          voters: res.data.voters || newVoters,
          total_votes: res.data.total_votes || newTotalVotes,
          my_vote: res.data.my_vote !== undefined ? res.data.my_vote : optionIndex,
        };
        setPoll(confirmed);
        onPollChange?.(confirmed);
      }
    } catch (err) {
      console.warn('Vote background sync warning:', err);
    }
  };

  return (
    <div
      className="w-full min-w-[220px] max-w-sm select-none space-y-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Poll Header */}
      <div className="flex items-center gap-1.5">
          <div
            className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 ${
              isMe ? 'bg-white/20 text-white' : 'theme-text-primary'
            }`}
            style={!isMe ? { backgroundColor: 'color-mix(in srgb, var(--theme-accent) 22%, transparent)' } : undefined}
          >
            <BarChart3 className="w-3.5 h-3.5" />
          </div>
          <h4 className={`text-[13px] font-black leading-tight ${isMe ? 'text-white' : 'theme-text-primary'}`}>
            {poll.question}
          </h4>
      </div>

      {/* Options List */}
      <div className="space-y-1">
        {poll.options.map((option, idx) => {
          const voteCount = Number(tallies[idx] ?? tallies[String(idx)] ?? 0);
          const percent = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
          const isSelected = selectedOption === idx;
          const isWinner = isExpired && maxVotes > 0 && voteCount === maxVotes;
          const optionVoters: PollVoter[] = votersMap[idx] || votersMap[String(idx)] || [];

          return (
            <button
              key={idx}
              type="button"
              disabled={isExpired}
              onClick={(e) => handleVote(idx, e)}
              className={`w-full relative overflow-hidden text-left py-1.5 px-2 rounded-xl border transition-all duration-150 active:scale-[0.98] cursor-pointer disabled:cursor-default ${
                isSelected
                  ? isMe
                    ? 'border-red-200/50 bg-[#5C101C] shadow-sm'
                    : 'border-red-400/70 bg-red-500/20 shadow-sm'
                  : isMe
                  ? 'border-white/20 bg-white/10 hover:bg-white/15'
                  : 'theme-border bg-black/20 hover:bg-black/30 border'
              }`}
            >
              {/* Animated Progress Fill Bar */}
              <div
                className={`absolute inset-y-0 left-0 transition-all duration-500 pointer-events-none rounded-xl ${
                  isSelected
                    ? isMe
                      ? 'bg-[#7A1A2A]'
                      : 'bg-red-500/30'
                    : isMe
                    ? 'bg-white/10'
                    : 'bg-white/10'
                }`}
                style={{ width: `${percent}%` }}
              />

              {/* Option Text & Stats */}
              <div className="relative z-10 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 transition-all ${
                      isSelected
                        ? isMe
                          ? 'bg-[#E8C4C8] text-[#5C101C] border-[#E8C4C8] shadow-xs'
                          : 'bg-red-600 text-white border-red-500 shadow-xs'
                        : isMe
                        ? 'border-white/40'
                        : 'border-gray-400'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                  <span
                    className={`text-xs font-bold truncate ${
                      isMe ? 'text-white' : 'theme-text-primary'
                    }`}
                  >
                    {option}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {isWinner && (
                    <div className="p-0.5 rounded-full bg-amber-100 text-amber-600" title="Kazanan Şık!">
                      <Crown className="w-3.5 h-3.5 fill-amber-400" />
                    </div>
                  )}
                  <span
                    className={`text-[11px] font-black ${
                      isMe ? 'text-white/95' : 'theme-text-primary'
                    }`}
                  >
                    %{percent}
                  </span>
                  <span
                    className={`text-[10px] font-medium ${
                      isMe ? 'text-white/75' : 'theme-text-secondary'
                    }`}
                  >
                    ({voteCount})
                  </span>
                </div>
              </div>

              {/* Voter Avatars Cluster */}
              {optionVoters.length > 0 && (
                <div className="relative z-10 flex items-center gap-1 mt-1">
                  <div className="flex items-center -space-x-1.5 overflow-hidden">
                    {optionVoters.slice(0, 5).map((voter, vIdx) =>
                      voter.avatar ? (
                        <img
                          key={vIdx}
                          src={voter.avatar}
                          alt={voter.name}
                          title={voter.name}
                          className="w-5 h-5 rounded-full border-2 border-white object-cover shadow-xs"
                        />
                      ) : (
                        <div
                          key={vIdx}
                          title={voter.name}
                          className="w-5 h-5 rounded-full border-2 border-white bg-gradient-to-tr from-indigo-600 to-purple-600 text-white font-black text-[9px] flex items-center justify-center shadow-xs"
                        >
                          {voter.name.charAt(0).toUpperCase()}
                        </div>
                      )
                    )}
                    {optionVoters.length > 5 && (
                      <span className="w-5 h-5 rounded-full border-2 border-white bg-gray-200 text-gray-700 font-bold text-[8px] flex items-center justify-center shadow-xs">
                        +{optionVoters.length - 5}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-[9px] font-semibold truncate ${
                      isMe ? 'text-white/80' : 'theme-text-secondary'
                    }`}
                  >
                    {optionVoters.map((v) => v.name.split(' ')[0]).join(', ')}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Poll Footer */}
      <div
        className={`flex items-center justify-between text-[9px] font-semibold pt-0.5 pr-10 ${
          isMe ? 'text-white/80' : 'theme-text-secondary'
        }`}
      >
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>
            {isExpired
              ? 'Anket Tamamlandı'
              : `Bitiş: ${expiresAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Users className="w-3 h-3" />
          <span>{totalVotes} oy</span>
        </div>
      </div>
    </div>
  );
};
