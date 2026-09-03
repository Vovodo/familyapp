import React from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { tr } from 'date-fns/locale';

interface DateSeparatorProps {
  date: string;
}

export const DateSeparator: React.FC<DateSeparatorProps> = React.memo(({ date }) => {
  const messageDate = new Date(date);

  let label: string;
  if (isToday(messageDate)) {
    label = 'Bugün';
  } else if (isYesterday(messageDate)) {
    label = 'Dün';
  } else {
    label = format(messageDate, 'd MMMM yyyy', { locale: tr });
  }

  return (
    <div className="flex justify-center my-3 select-none">
      <div className="bg-black/35 backdrop-blur-xs text-white/90 text-[11px] font-semibold px-3 py-1 rounded-full border border-white/10 tracking-wide">
        {label}
      </div>
    </div>
  );
});

DateSeparator.displayName = 'DateSeparator';
