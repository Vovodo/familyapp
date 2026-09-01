import React, { useState } from 'react';
import { X, Plus, Trash2, BarChart2, Clock, Loader2 } from 'lucide-react';

interface CreatePollModalProps {
  onClose: () => void;
  onSubmit: (question: string, options: string[], durationHours: number) => Promise<void>;
}

export const CreatePollModal: React.FC<CreatePollModalProps> = ({ onClose, onSubmit }) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [durationHours, setDurationHours] = useState<number>(12);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const durationOptions = [
    { label: '1 Saat', value: 1 },
    { label: '6 Saat', value: 6 },
    { label: '12 Saat', value: 12 },
    { label: '24 Saat', value: 24 },
    { label: '2 Gün', value: 48 },
  ];

  const handleAddOption = () => {
    if (options.length < 6) {
      setOptions([...options, '']);
    }
  };

  const handleRemoveOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const handleOptionChange = (index: number, val: string) => {
    const next = [...options];
    next[index] = val;
    setOptions(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanQuestion = question.trim();
    if (!cleanQuestion) {
      setError('Lütfen anket sorusunu yazın.');
      return;
    }

    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (cleanOptions.length < 2) {
      setError('Lütfen en az 2 geçerli seçenek girin.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(cleanQuestion, cleanOptions, durationHours);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Anket oluşturulamadı.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-sm rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <BarChart2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-gray-900">Anket Oluştur</h3>
              <p className="text-[11px] text-gray-500">Aile üyelerinden oy toplayın</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Question Input */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Soru / Başlık
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Örn: Bugün ne yemek yapalım? 🍲"
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              autoFocus
            />
          </div>

          {/* Options */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Seçenekler
            </label>
            <div className="space-y-2">
              {options.map((option, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                    placeholder={`Seçenek ${idx + 1}`}
                    className="flex-1 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-2xl text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(idx)}
                      className="p-2 text-gray-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {options.length < 6 && (
              <button
                type="button"
                onClick={handleAddOption}
                className="mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer transition"
              >
                <Plus className="w-4 h-4" />
                <span>Seçenek Ekle ({options.length}/6)</span>
              </button>
            )}
          </div>

          {/* Duration Selector */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              <span>Anket Süresi</span>
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {durationOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDurationHours(opt.value)}
                  className={`py-1.5 px-2 rounded-xl text-xs font-bold transition cursor-pointer text-center ${
                    durationHours === opt.value
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl text-xs transition cursor-pointer"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl text-xs shadow-md shadow-indigo-300 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <span>Anketi Başlat 📊</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
