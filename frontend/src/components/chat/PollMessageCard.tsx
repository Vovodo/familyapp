import React, { useState, useEffect } from 'react';
import { Check, Clock, Trophy, Loader2 } from 'lucide-react';
import { Message, PollData } from '../../types';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';

interface PollMessageCardProps {
  message: Message;
  isMe: boolean;
}

export const PollMessageCard: React.FC<PollMessageCardProps> = ({ message, isMe }) => {
  const { user } = useAuth();
  const { currentFamily } = useFamily();

  const [poll, setPoll] = useState<PollData | null>(() => {
    if (message.poll) return message.poll;
    try {
      // If poll data was serialized in content
      const parsed = JSON.parse(message.content || '{}');
      if (parsed.poll_id || parsed.options) return parsed;
    } catch {
      // Fallback
    }
    return null;
  });

  const [isVoting, setIsVoting] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(() => poll?.my_vote ?? null);

  // Fetch live poll status
  useEffect(() => {
    const pollId = poll?.poll_id || message.id;
    if (!pollId) return;

    api.get<PollData>(`/messages/poll/${pollId}`)
      .then((res) => {
        setPoll(res.data);
        if (res.data.my_vote !== undefined && res.data.my_vote !== null) {
          setSelectedOption(res.data.my_vote);
        }
      })
      .catch(() => {});
  }, [message.id, poll?.poll_id]);

  // Realtime poll vote listener
  useEffect(() => {
    if (!currentFamily || !supabase || !poll?.poll_id) return;

    const channel = supabase.channel(`poll-${poll.poll_id}`);
    channel
      .on('broadcast', { event: 'poll_voted' }, ({ payload }) => {
        if (payload.poll_id === poll.poll_id) {
          setPoll((prev) => (prev ? { ...prev, ...payload } : prev));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentFamily?.id, poll?.poll_id]);

  if (!poll || !poll.options || poll.options.length === 0) {
    return (
      <div className="p-3 text-xs italic text-gray-500">
        📊 Anket bilgileri yükleniyor...
      </div>
    );
  }

  const now = new Date();
  const expiresAt = new Date(poll.expires_at);
  const isExpired = poll.is_closed || now > expiresAt;

  // Calculate total votes and max votes for crown
  const tallies = poll.tallies || {};
  const totalVotes = Object.values(tallies).reduce((a, b) => a + Number(b), 0);
  const maxVotes = Math.max(0, ...Object.values(tallies).map(Number));

  const handleVote = async (optionIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isExpired || isVoting) return;

    setIsVoting(true);
    setSelectedOption(optionIndex);

    try {
      const res = await api.post<{
        tallies: Record<string | number, number>;
        total_votes: number;
        my_vote: number;
      }>(`/messages/poll/${poll.poll_id}/vote`, {
        option_index: optionIndex,
      });

      setPoll((prev) =>
        prev
          ? {
              ...prev,
              tallies: res.data.tallies,
              total_votes: res.data.total_votes,
              my_vote: res.data.my_vote,
            }
          : prev
      );

      if (navigator.vibrate) navigator.vibrate(30);

      // Broadcast update
      if (supabase && currentFamily) {
        const channel = supabase.channel(`poll-${poll.poll_id}`);
        channel.send({
          type: 'broadcast',
          event: 'poll_voted',
          payload: {
            poll_id: poll.poll_id,
            tallies: res.data.tallies,
            total_votes: res.data.total_votes,
          },
        });
      }
    } catch (err) {
      console.warn('Vote error:', err);
    } finally {
      setIsVoting(false);
    }
  };

  return (
    <div
      className="w-full min-w-[240px] sm:min-w-[280px] max-w-sm select-none p-1 space-y-3"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Poll Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">📊</span>
          <h4 className={`text-sm font-black leading-snug ${isMe ? 'text-white' : 'text-gray-900'}`}>
            {poll.question}
          </h4>
        </div>
      </div>

      {/* Options List */}
      <div className="space-y-2">
        {poll.options.map((option, idx) => {
          const voteCount = Number(tallies[idx] || 0);
          const percent = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
          const isSelected = selectedOption === idx;
          const isWinner = isExpired && maxVotes > 0 && voteCount === maxVotes;

          return (
            <button
              key={idx}
              type="button"
              disabled={isExpired || isVoting}
              onClick={(e) => handleVote(idx, e)}
              className={`w-full relative overflow-hidden text-left p-2.5 rounded-2xl border transition-all active:scale-[0.99] cursor-pointer disabled:cursor-default ${
                isSelected
                  ? isMe
                    ? 'border-white/60 bg-white/20'
                    : 'border-family-500 bg-family-50/80 shadow-xs'
                  : isMe
                  ? 'border-white/20 bg-white/10 hover:bg-white/15'
                  : 'border-gray-200/90 bg-gray-50/80 hover:bg-gray-100/80'
              }`}
            >
              {/* Animated progress fill bar */}
              <div
                className={`absolute inset-y-0 left-0 transition-all duration-300 pointer-events-none rounded-xl ${
                  isSelected
                    ? isMe
                      ? 'bg-white/30'
                      : 'bg-family-200/80'
                    : isMe
                    ? 'bg-white/15'
                    : 'bg-gray-200/70'
                }`}
                style={{ width: `${percent}%` }}
              />

              {/* Option Content & Stats */}
              <div className="relative z-10 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                      isSelected
                        ? isMe
                          ? 'bg-white text-family-700 border-white'
                          : 'bg-family-600 text-white border-family-600'
                        : isMe
                        ? 'border-white/40'
                        : 'border-gray-400'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                  <span
                    className={`text-xs font-bold truncate ${
                      isMe ? 'text-white' : 'text-gray-900'
                    }`}
                  >
                    {option}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {isWinner && (
                    <span title="Kazanan Şık!" className="text-sm">
                      👑
                    </span>
                  )}
                  <span
                    className={`text-[11px] font-black ${
                      isMe ? 'text-white/90' : 'text-gray-600'
                    }`}
                  >
                    %{percent}
                  </span>
                  <span
                    className={`text-[10px] font-medium ${
                      isMe ? 'text-white/70' : 'text-gray-400'
                    }`}
                  >
                    ({voteCount})
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Poll Footer */}
      <div
        className={`flex items-center justify-between text-[10px] font-semibold pt-1 border-t ${
          isMe ? 'border-white/20 text-white/80' : 'border-gray-200 text-gray-500'
        }`}
      >
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>
            {isExpired
              ? 'Anket Tamamlandı 🏁'
              : `Bitiş: ${expiresAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`}
          </span>
        </div>

        <span>{totalVotes} oy kullanıldı</span>
      </div>
    </div>
  );
};
