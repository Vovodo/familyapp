import React, { useState } from 'react';
import {
  CloudDownload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  MessageSquare,
  Image as ImageIcon,
  Mic,
  ShieldCheck,
} from 'lucide-react';
import { syncService } from '../../services/syncService';
import { RestoreProgress } from '../../types';

interface CloudRestorePromptModalProps {
  familyId: string;
  familyName: string;
  onFinished: (restored: boolean) => void;
}

export const CloudRestorePromptModal: React.FC<CloudRestorePromptModalProps> = ({
  familyId,
  familyName,
  onFinished,
}) => {
  const [isRestoring, setIsRestoring] = useState(false);
  const [progress, setProgress] = useState<RestoreProgress | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleStartRestore = async () => {
    setIsRestoring(true);
    setErrorMsg(null);

    try {
      await syncService.restoreChatFromCloud(familyId, (p) => {
        setProgress(p);
      });
      setIsSuccess(true);
      setTimeout(() => {
        onFinished(true);
      }, 1500);
    } catch (err: any) {
      setIsRestoring(false);
      setErrorMsg(err.message || 'Geri yükleme tamamlanamadı.');
    }
  };

  const handleSkip = () => {
    localStorage.setItem(`ailem_chat_restored_${familyId}`, 'skipped');
    onFinished(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200 select-none">
      <div
        className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-sm overflow-hidden flex flex-col p-6 space-y-4 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Icon */}
        <div className="flex items-center justify-between">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <CloudDownload className="w-6 h-6" />
          </div>
          {!isRestoring && (
            <button
              type="button"
              onClick={handleSkip}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Title and Description */}
        <div className="space-y-1">
          <h3 className="text-base font-black text-gray-900">
            {isSuccess ? 'Sohbet Geri Yüklendi! 🎉' : 'Bulut Sohbet Yedeklemesi'}
          </h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            {isSuccess
              ? 'Tüm mesajlar, fotoğraflar ve sesler cihazınıza başarıyla aktarıldı.'
              : `"${familyName}" grubunda bulut sohbet yedeklemesi aktif. Sohbet geçmişi ve paylaşılan medya cihazınıza yüklensin mi?`}
          </p>
        </div>

        {/* Progress State or Feature List */}
        {isRestoring || isSuccess ? (
          <div className="space-y-3 bg-gray-50 p-4 rounded-2xl border border-gray-200/70">
            <div className="flex items-center justify-between text-xs font-bold text-gray-700">
              <span className="flex items-center gap-1.5">
                {isSuccess ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                )}
                <span>
                  {progress?.step === 'fetching'
                    ? 'Yedek bilgileri alınıyor...'
                    : progress?.step === 'saving_messages'
                    ? 'Mesajlar kaydediliyor...'
                    : progress?.step === 'downloading_media'
                    ? 'Fotoğraflar & Sesler indiriliyor...'
                    : 'Tamamlandı!'}
                </span>
              </span>
              <span className="text-indigo-600 font-extrabold">{progress?.percent || 0}%</span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-gray-200 h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${progress?.percent || 5}%` }}
              />
            </div>

            {/* Counter metrics */}
            <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1 font-medium">
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3 text-gray-400" />
                <span>Mesajlar: {progress?.completedMessages || 0}</span>
              </span>
              <span className="flex items-center gap-1">
                <ImageIcon className="w-3 h-3 text-gray-400" />
                <span>Medya: {progress?.completedMedia || 0} / {progress?.totalMedia || 0}</span>
              </span>
            </div>
          </div>
        ) : (
          <div className="bg-indigo-50/70 p-3.5 rounded-2xl border border-indigo-100/80 space-y-2 text-xs text-indigo-950 font-medium">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600 flex-shrink-0" />
              <span>Yalnızca yeni/eksik dosyalar indirilir</span>
            </div>
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-indigo-600 flex-shrink-0" />
              <span>Ses kayıtları ve fotoğraflar yerel diske aktarılır</span>
            </div>
          </div>
        )}

        {/* Error Notice */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2 font-bold">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Action Buttons */}
        {!isRestoring && !isSuccess && (
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleSkip}
              className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-700 font-bold rounded-2xl text-xs transition cursor-pointer"
            >
              Hayır, Atla
            </button>
            <button
              type="button"
              onClick={handleStartRestore}
              className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-black rounded-2xl text-xs shadow-md shadow-indigo-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <CloudDownload className="w-4 h-4" />
              <span>Evet, Yükle</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
