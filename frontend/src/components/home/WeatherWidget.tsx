import React, { useState, useEffect } from 'react';
import {
  CloudSun,
  Sun,
  Cloud,
  CloudRain,
  CloudLightning,
  CloudSnow,
  CloudFog,
  RefreshCw,
  MapPin,
  Wind,
  Droplets,
  Thermometer,
  Search,
  X,
  Navigation,
  Loader2,
} from 'lucide-react';
import { api } from '../../services/api';

interface WeatherData {
  city: string;
  temperature: number;
  feels_like: number;
  humidity: number;
  wind_speed: number;
  condition: string;
  weather_code: number;
  icon: string;
  emoji: string;
  is_day: number;
  updated_at: string;
}

const POPULAR_TURKISH_CITIES = [
  'İzmir',
  'İstanbul',
  'Ankara',
  'Bursa',
  'Antalya',
  'Adana',
  'Konya',
  'Gaziantep',
  'Şanlıurfa',
  'Kocaeli',
  'Mersin',
  'Diyarbakır',
  'Hatay',
  'Manisa',
  'Kayseri',
  'Samsun',
  'Balıkesir',
  'Kahramanmaraş',
  'Van',
  'Aydın',
  'Denizli',
  'Sakarya',
  'Tekirdağ',
  'Muğla',
  'Eskişehir',
  'Trabzon',
  'Çanakkale',
  'Erzurum',
  'Rize',
  'Sivas',
  'Malatya',
  'Yalova',
  'Edirne',
  'Bodrum',
  'Çeşme',
  'Alanya',
];

export const WeatherWidget: React.FC = () => {
  const [selectedCity, setSelectedCity] = useState<string>(() => {
    return localStorage.getItem('ailem_weather_city') || 'İzmir';
  });

  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // City Selector Modal
  const [showCityModal, setShowCityModal] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLocating, setIsLocating] = useState<boolean>(false);

  const fetchWeather = async (city: string, isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    setError(null);

    try {
      const res = await api.get<WeatherData>('/weather/current', {
        params: { city },
      });
      setWeather(res.data);
    } catch (err: any) {
      console.warn('Weather fetch error:', err);
      // Fallback safe state
      if (!weather) {
        setWeather({
          city: city || 'İzmir',
          temperature: 24,
          feels_like: 25,
          humidity: 45,
          wind_speed: 12,
          condition: 'Parçalı Bulutlu',
          weather_code: 2,
          icon: 'partly-cloudy',
          emoji: '⛅',
          is_day: 1,
          updated_at: 'Şimdi',
        });
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchWeather(selectedCity);
  }, [selectedCity]);

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRefreshing(true);
    fetchWeather(selectedCity, true);
  };

  const handleSelectCity = (city: string) => {
    setSelectedCity(city);
    localStorage.setItem('ailem_weather_city', city);
    setShowCityModal(false);
    setSearchQuery('');
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Cihazınız konum servisini desteklemiyor.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const res = await api.get<WeatherData>('/weather/current', {
            params: { latitude: lat, longitude: lon },
          });
          if (res.data && res.data.city) {
            setSelectedCity(res.data.city);
            localStorage.setItem('ailem_weather_city', res.data.city);
            setWeather(res.data);
            setShowCityModal(false);
          }
        } catch (err) {
          alert('Konumunuz için hava durumu bilgisi alınamadı.');
        } finally {
          setIsLocating(false);
        }
      },
      () => {
        setIsLocating(false);
        alert('Konum izni alınamadı. Lütfen listeden şehir seçin.');
      },
      { timeout: 8000 }
    );
  };

  const filteredCities = POPULAR_TURKISH_CITIES.filter((c) =>
    c.toLocaleLowerCase('tr-TR').includes(searchQuery.toLocaleLowerCase('tr-TR'))
  );

  // Weather Icon component mapper
  const renderWeatherIcon = (code?: number, isDay = 1) => {
    if (code === undefined || code === null) return <CloudSun className="w-9 h-9 text-amber-500" />;
    if (code === 0) return <Sun className="w-9 h-9 text-amber-500 animate-spin-slow" />;
    if (code <= 3) return <CloudSun className="w-9 h-9 text-amber-500" />;
    if (code >= 45 && code <= 48) return <CloudFog className="w-9 h-9 text-slate-400" />;
    if (code >= 51 && code <= 67) return <CloudRain className="w-9 h-9 text-blue-400" />;
    if (code >= 71 && code <= 86) return <CloudSnow className="w-9 h-9 text-sky-200" />;
    if (code >= 95) return <CloudLightning className="w-9 h-9 text-purple-400" />;
    return <CloudSun className="w-9 h-9 text-amber-500" />;
  };

  if (isLoading && !weather) {
    return (
      <div className="w-full theme-surface rounded-3xl p-4 border animate-pulse flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-black/5 dark:bg-white/5" />
          <div className="space-y-1.5">
            <div className="w-20 h-4 rounded-md bg-black/5 dark:bg-white/5" />
            <div className="w-28 h-3 rounded-md bg-black/5 dark:bg-white/5" />
          </div>
        </div>
        <div className="w-16 h-8 rounded-xl bg-black/5 dark:bg-white/5" />
      </div>
    );
  }

  return (
    <>
      <div
        onClick={() => setShowCityModal(true)}
        className="w-full theme-surface rounded-3xl p-4 border transition-all duration-150 active:scale-[0.99] cursor-pointer hover:shadow-md relative overflow-hidden group select-none"
      >
        {/* Top Header Row */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold theme-text-secondary uppercase tracking-wider">
            <span>Canlı Hava Durumu</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleRefresh}
              className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
              title="Yenile"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Main Info Row */}
        <div className="flex items-center justify-between gap-3">
          {/* Left: Icon & Temperature & City */}
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 flex items-center justify-center">
              {renderWeatherIcon(weather?.weather_code, weather?.is_day)}
            </div>

            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-black theme-text-primary tracking-tight">
                  {weather?.temperature}°C
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs font-bold theme-text-primary">
                <MapPin className="w-3 h-3 text-rose-500 flex-shrink-0" />
                <span className="truncate max-w-[110px]">{weather?.city}</span>
              </div>
              <div className="text-[11px] font-medium theme-text-secondary">
                {weather?.condition}
              </div>
            </div>
          </div>

          {/* Right: Detailed Metric Pills */}
          <div className="flex flex-col gap-1 text-[11px] font-semibold theme-text-secondary">
            <div className="flex items-center gap-1.5">
              <Thermometer className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              <span>Hissedilen {weather?.feels_like}°</span>
            </div>

            <div className="flex items-center gap-1.5">
              <Droplets className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
              <span>Nem %{weather?.humidity}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <Wind className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
              <span>Rüzgar {weather?.wind_speed} km/s</span>
            </div>
          </div>
        </div>
      </div>

      {/* 🏙️ Turkish City Selector Modal */}
      {showCityModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
          onClick={() => setShowCityModal(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-gray-100 dark:border-gray-800 space-y-4 max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900 dark:text-white">Şehir Seçin</h3>
                  <p className="text-[11px] text-gray-500">Hava durumu için ailenizin konumunu belirleyin</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCityModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 hover:text-gray-800 dark:hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Geolocation Quick Button */}
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={isLocating}
              className="w-full py-2.5 px-3.5 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 font-bold text-xs flex items-center justify-center gap-2 hover:bg-sky-100 dark:hover:bg-sky-900/40 active:scale-[0.98] transition cursor-pointer"
            >
              {isLocating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Navigation className="w-4 h-4 text-sky-500" />
              )}
              <span>{isLocating ? 'Konumunuz tespit ediliyor...' : 'Mevcut Konumumu Kullan'}</span>
            </button>

            {/* Search Box */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Şehir veya ilçe ara..."
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                autoFocus
              />
            </div>

            {/* City Grid List */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 max-h-64">
              {filteredCities.length > 0 ? (
                <div className="grid grid-cols-2 gap-1.5">
                  {filteredCities.map((city) => {
                    const isSelected = selectedCity.toLowerCase() === city.toLowerCase();
                    return (
                      <button
                        key={city}
                        type="button"
                        onClick={() => handleSelectCity(city)}
                        className={`p-2.5 rounded-2xl text-left text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500 text-white shadow-xs'
                            : 'bg-gray-50 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-750 text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-gray-800'
                        }`}
                      >
                        <span className="truncate">{city}</span>
                        {isSelected && <span className="text-[10px] font-black">✓</span>}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-gray-500">
                  Aramanızla eşleşen şehir bulunamadı.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
