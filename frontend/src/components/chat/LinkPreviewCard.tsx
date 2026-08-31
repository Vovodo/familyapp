import React, { useEffect, useState } from 'react';
import { ExternalLink, Globe } from 'lucide-react';
import { api } from '../../services/api';

interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  site_name?: string;
}

const previewCache = new Map<string, LinkPreviewData>();

export const LinkPreviewCard: React.FC<{ url: string; isMe?: boolean }> = ({ url, isMe }) => {
  const [data, setData] = useState<LinkPreviewData | null>(previewCache.get(url) || null);
  const [loading, setLoading] = useState(!previewCache.has(url));

  useEffect(() => {
    if (previewCache.has(url)) {
      setData(previewCache.get(url)!);
      setLoading(false);
      return;
    }

    let isMounted = true;
    api
      .get<LinkPreviewData>(`/messages/link-preview?url=${encodeURIComponent(url)}`)
      .then((res) => {
        if (isMounted && res.data) {
          previewCache.set(url, res.data);
          setData(res.data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [url]);

  if (loading) {
    return (
      <div
        className={`mt-2 p-2.5 rounded-2xl border text-xs flex items-center gap-2 animate-pulse ${
          isMe ? 'bg-white/10 border-white/20 text-white/80' : 'bg-gray-50 border-gray-200 text-gray-500'
        }`}
      >
        <Globe className="w-3.5 h-3.5" />
        <span className="truncate">Önizleme yükleniyor: {url}</span>
      </div>
    );
  }

  if (!data || (!data.title && !data.image)) {
    return null;
  }

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`mt-2 block rounded-2xl overflow-hidden border transition-all duration-150 hover:opacity-95 shadow-xs ${
        isMe
          ? 'bg-black/20 border-white/20 text-white hover:bg-black/30'
          : 'bg-white border-gray-200/90 text-gray-900 hover:bg-gray-50'
      }`}
    >
      {/* Thumbnail Image (Instagram, TikTok, YouTube cover etc.) */}
      {data.image && (
        <div className="relative w-full h-36 sm:h-44 bg-black/5 overflow-hidden">
          <img
            src={data.image}
            alt={data.title || 'Link Görseli'}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {data.site_name && (
            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[10px] font-bold text-white uppercase tracking-wider">
              {data.site_name}
            </div>
          )}
        </div>
      )}

      {/* Info Content */}
      <div className="p-2.5 space-y-1">
        {data.title && (
          <h4 className="font-bold text-xs line-clamp-2 leading-snug flex items-start justify-between gap-1">
            <span>{data.title}</span>
            <ExternalLink className="w-3 h-3 opacity-60 flex-shrink-0 mt-0.5" />
          </h4>
        )}
        {data.description && (
          <p
            className={`text-[11px] line-clamp-2 leading-relaxed ${
              isMe ? 'text-white/80' : 'text-gray-600'
            }`}
          >
            {data.description}
          </p>
        )}
        <div
          className={`text-[10px] font-medium truncate pt-0.5 ${
            isMe ? 'text-white/60' : 'text-gray-400'
          }`}
        >
          {data.site_name || url.replace(/^https?:\/\//, '').split('/')[0]}
        </div>
      </div>
    </a>
  );
};
