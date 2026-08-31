import React, { useState, useEffect } from 'react';
import { Search, Sparkles, Smile, Image as GifIcon, Heart, Laugh, Sun, PartyPopper, Users, X } from 'lucide-react';

interface EmojiGifPickerProps {
  onSelectEmoji: (emoji: string) => void;
  onSelectGif: (gifUrl: string) => void;
  onClose: () => void;
}

const EMOJI_CATEGORIES = [
  {
    name: 'Kalpler & Sevgi',
    icon: Heart,
    emojis: ['❤️', '💖', '💕', '🥰', '😍', '😘', '🌹', '💐', '✨', '🤍', '🤎', '🧡', '💛', '💚', '💙', '💜', '🖤', '💌', '💓', '💗', '💞', '💝', '💑', '👩‍❤️‍👨', '👨‍👩‍👧‍👦'],
  },
  {
    name: 'Gülümsemeler & Neşe',
    icon: Laugh,
    emojis: ['😂', '🤣', '😄', '😁', '😆', '😊', '😋', '😎', '🥳', '🤩', '🤗', '😜', '🤪', '🤭', '🤫', '🥺', '😌', '🤤', '😇', '🙌', '👏', '💃', '🕺'],
  },
  {
    name: 'Günlük & Selam',
    icon: Sun,
    emojis: ['👋', '☕', '🌅', '🌙', '💤', '🍳', '🍽️', '🥗', '🍕', '🍰', '🚗', '🏠', '🛒', '💼', '📱', '🔋', '🔑', '⏰', '🚶', '🏃', '🛍️', '🧼'],
  },
  {
    name: 'Tebrik & Dualar',
    icon: PartyPopper,
    emojis: ['🎉', '🎂', '🎊', '🎁', '🎈', '🍾', '🥂', '🤲', '🙏', '💯', '👍', '👌', '⭐', '🥇', '👑', '🏆', '🕊️', '🧿', '🕌', '🕯️'],
  },
];

// Curated high quality trending GIFs for quick instant display
const CURATED_GIFS: Record<string, string[]> = {
  'Kalp & Sevgi': [
    'https://media.giphy.com/media/26BRv0ThflsDTjDUs/giphy.gif',
    'https://media.giphy.com/media/l4pTdcifPZLpDjL1e/giphy.gif',
    'https://media.giphy.com/media/3oriO0OEd9QIDdllqo/giphy.gif',
    'https://media.giphy.com/media/l0HlSZ868tPXzsJnW/giphy.gif',
    'https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif',
    'https://media.giphy.com/media/26FLdm964upUNI6LC/giphy.gif',
  ],
  'Komik & Gülme': [
    'https://media.giphy.com/media/10JhviFuU2gWD6/giphy.gif',
    'https://media.giphy.com/media/3oEjHAUOqG3lSS0f1C/giphy.gif',
    'https://media.giphy.com/media/ZqlvCTNHpqrio/giphy.gif',
    'https://media.giphy.com/media/ltIFdjNAasOwVvKhvx/giphy.gif',
    'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif',
  ],
  'Günaydın & İyi Geceler': [
    'https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif',
    'https://media.giphy.com/media/13HgwGsXF0aiGY/giphy.gif',
    'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
    'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif',
  ],
  'Kutlama & Tebrik': [
    'https://media.giphy.com/media/g9582DNuQppxC/giphy.gif',
    'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif',
    'https://media.giphy.com/media/BPJmthQ3YRwD6QqcVD/giphy.gif',
    'https://media.giphy.com/media/l46CimW38a7TFxLVe/giphy.gif',
  ],
};

export const EmojiGifPicker: React.FC<EmojiGifPickerProps> = ({
  onSelectEmoji,
  onSelectGif,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'emoji' | 'gif'>('emoji');
  const [activeCategory, setActiveCategory] = useState<string>(EMOJI_CATEGORIES[0].name);
  const [gifSearchQuery, setGifSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Search GIFs using Giphy Public API
  useEffect(() => {
    if (!gifSearchQuery.trim() || activeTab !== 'gif') {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const apiKey = 'dc6zaTOxFJmzC'; // GIPHY public beta key
        const res = await fetch(
          `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(
            gifSearchQuery
          )}&limit=20&rating=g`
        );
        const json = await res.json();
        if (json.data && Array.isArray(json.data)) {
          const urls = json.data.map((item: any) => item.images?.fixed_height?.url || item.images?.original?.url).filter(Boolean);
          setSearchResults(urls);
        }
      } catch (e) {
        console.warn('GIF search error:', e);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [gifSearchQuery, activeTab]);

  return (
    <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col h-80 sm:h-96 w-full max-w-sm sm:max-w-md animate-in fade-in slide-in-from-bottom-3 duration-200 z-50">
      {/* Header Tabs */}
      <div className="flex items-center justify-between p-2.5 border-b border-gray-100 bg-gray-50/80">
        <div className="flex items-center gap-1.5 p-1 bg-gray-200/70 rounded-2xl">
          <button
            type="button"
            onClick={() => setActiveTab('emoji')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'emoji'
                ? 'bg-white text-family-700 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Smile className="w-3.5 h-3.5" />
            <span>Emojiler</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('gif')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'gif'
                ? 'bg-white text-family-700 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <GifIcon className="w-3.5 h-3.5" />
            <span>GIF'ler</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* TAB 1: EMOJIS */}
      {activeTab === 'emoji' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Category Bar */}
          <div className="flex items-center gap-1 p-2 border-b border-gray-100 overflow-x-auto no-scrollbar">
            {EMOJI_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.name;
              return (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => setActiveCategory(cat.name)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                    isActive
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{cat.name}</span>
                </button>
              );
            })}
          </div>

          {/* Emoji Grid */}
          <div className="flex-1 p-3 overflow-y-auto grid grid-cols-7 sm:grid-cols-8 gap-2 content-start">
            {EMOJI_CATEGORIES.find((c) => c.name === activeCategory)?.emojis.map((emoji, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onSelectEmoji(emoji)}
                className="w-10 h-10 flex items-center justify-center text-2xl hover:scale-125 active:scale-95 transition rounded-xl hover:bg-gray-100 cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: GIFS */}
      {activeTab === 'gif' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* GIF Search Bar */}
          <div className="p-2.5 border-b border-gray-100">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-gray-400 absolute left-3" />
              <input
                type="text"
                value={gifSearchQuery}
                onChange={(e) => setGifSearchQuery(e.target.value)}
                placeholder="GIF ara (aile, sevgi, komik, günaydın...)"
                className="w-full pl-9 pr-3 py-2 bg-gray-100 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              />
              {gifSearchQuery && (
                <button
                  type="button"
                  onClick={() => setGifSearchQuery('')}
                  className="absolute right-2.5 p-1 text-gray-400 hover:text-gray-700"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* GIF Content */}
          <div className="flex-1 p-2.5 overflow-y-auto space-y-3">
            {isSearching ? (
              <div className="py-12 text-center text-xs text-gray-400">GIF'ler aranıyor...</div>
            ) : searchResults.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {searchResults.map((url, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onSelectGif(url)}
                    className="relative rounded-xl overflow-hidden aspect-video bg-gray-100 hover:opacity-90 active:scale-95 transition cursor-pointer"
                  >
                    <img src={url} alt="GIF" className="w-full h-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            ) : gifSearchQuery ? (
              <div className="py-12 text-center text-xs text-gray-400">GIF bulunamadı.</div>
            ) : (
              Object.entries(CURATED_GIFS).map(([categoryName, gifs]) => (
                <div key={categoryName} className="space-y-1.5">
                  <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    {categoryName}
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {gifs.map((url, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => onSelectGif(url)}
                        className="relative rounded-xl overflow-hidden aspect-video bg-gray-100 hover:opacity-90 active:scale-95 transition cursor-pointer shadow-2xs"
                      >
                        <img src={url} alt="GIF" className="w-full h-full object-cover" loading="lazy" />
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
