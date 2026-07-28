import { useState, useEffect, useCallback } from "react";
import {
  IconSunFilled,
  IconCloudFilled,
  IconCloudRain,
  IconCloudSnow,
  IconCloudBolt,
  IconCloudFog,
  IconMapPinFilled,
} from "@tabler/icons-react";

/* ========= WMO 天气码 → SVG 图标映射 ========= */
import type { ComponentType } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IconType = ComponentType<any>;

const WEATHER_CODES: Record<number, { icon: IconType; label: string }> = {
  0: { icon: IconSunFilled, label: "\u6674" },
  1: { icon: IconSunFilled, label: "\u6674\u95F4\u591A\u4E91" },
  2: { icon: IconSunFilled, label: "\u591A\u4E91" },
  3: { icon: IconCloudFilled, label: "\u9634" },
  45: { icon: IconCloudFog, label: "\u96FE" },
  48: { icon: IconCloudFog, label: "\u51BB\u96FE" },
  51: { icon: IconCloudRain, label: "\u6BDB\u6BDB\u96E8" },
  53: { icon: IconCloudRain, label: "\u6BDB\u6BDB\u96E8" },
  55: { icon: IconCloudRain, label: "\u6BDB\u6BDB\u96E8" },
  56: { icon: IconCloudRain, label: "\u51BB\u6BDB\u6BDB\u96E8" },
  57: { icon: IconCloudRain, label: "\u51BB\u6BDB\u6BDB\u96E8" },
  61: { icon: IconCloudRain, label: "\u5C0F\u96E8" },
  63: { icon: IconCloudRain, label: "\u4E2D\u96E8" },
  65: { icon: IconCloudRain, label: "\u5927\u96E8" },
  66: { icon: IconCloudRain, label: "\u51BB\u96E8" },
  67: { icon: IconCloudRain, label: "\u51BB\u96E8" },
  71: { icon: IconCloudSnow, label: "\u5C0F\u96EA" },
  73: { icon: IconCloudSnow, label: "\u4E2D\u96EA" },
  75: { icon: IconCloudSnow, label: "\u5927\u96EA" },
  77: { icon: IconCloudSnow, label: "\u9635\u96EA" },
  80: { icon: IconCloudRain, label: "\u9635\u96E8" },
  81: { icon: IconCloudRain, label: "\u9635\u96E8" },
  82: { icon: IconCloudRain, label: "\u5F3A\u9635\u96E8" },
  85: { icon: IconCloudSnow, label: "\u9635\u96EA" },
  86: { icon: IconCloudSnow, label: "\u5F3A\u9635\u96EA" },
  95: { icon: IconCloudBolt, label: "\u96F7\u9635\u96E8" },
  96: { icon: IconCloudBolt, label: "\u96F7\u9635\u96E8" },
  99: { icon: IconCloudBolt, label: "\u96F7\u9635\u96E8" },
};

interface WeatherInfo {
  temperature: number;
  weatherCode: number;
  humidity: number;
  windSpeed: number;
  city: string;
  isDay: boolean;
}

type Status = "loading" | "success" | "error";

const CACHE_KEY = "mynx_weather";
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

interface CacheEntry extends WeatherInfo {
  timestamp: number;
}

function loadCache(): WeatherInfo | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_DURATION) return null;
    const { timestamp: _ts, ...weather } = entry;
    return weather;
  } catch {
    return null;
  }
}

function saveCache(weather: WeatherInfo): void {
  try {
    const entry: CacheEntry = { ...weather, timestamp: Date.now() };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // sessionStorage may be full or disabled
  }
}

/** 带超时的 fetch */
async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 多策略 IP 定位 —— 国际 + 国内均可 */
async function getLocation(): Promise<{ lat: number; lon: number; city: string } | null> {
  const UNKNOWN = "\u672A\u77E5";

  // 策略 1: ipwho.is (HTTPS，国际通用，免费无需 Key)
  try {
    const resp = await fetchWithTimeout("https://ipwho.is/", 6000);
    if (resp.ok) {
      const d = await resp.json();
      if (d.success && d.latitude && d.longitude) {
        return { lat: d.latitude, lon: d.longitude, city: d.city || d.region || UNKNOWN };
      }
    }
  } catch { /* continue */ }

  // 策略 2: ip-api.com (HTTP only for free tier，国内可用)
  try {
    const resp = await fetchWithTimeout(
      "http://ip-api.com/json/?fields=status,lat,lon,city,regionName",
      6000,
    );
    if (resp.ok) {
      const d = await resp.json();
      if (d.status === "success" && d.lat && d.lon) {
        return { lat: d.lat, lon: d.lon, city: d.city || d.regionName || UNKNOWN };
      }
    }
  } catch { /* continue */ }

  return null;
}

/** 从 Open-Meteo 获取天气 (无需 API Key，全球可用) */
async function getWeather(lat: number, lon: number): Promise<Omit<WeatherInfo, "city"> | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day` +
      `&timezone=auto`;
    const resp = await fetchWithTimeout(url, 8000);
    if (!resp.ok) return null;
    const data = await resp.json();
    const c = data.current;
    if (!c) return null;
    return {
      temperature: Math.round(c.temperature_2m),
      weatherCode: c.weather_code,
      humidity: Math.round(c.relative_humidity_2m),
      windSpeed: Math.round(c.wind_speed_10m),
      isDay: c.is_day === 1,
    };
  } catch {
    return null;
  }
}

export default function WeatherWidget() {
  const [status, setStatus] = useState<Status>(() => {
    return loadCache() ? "success" : "loading";
  });
  const [weather, setWeather] = useState<WeatherInfo | null>(loadCache);

  const loadWeather = useCallback(async (): Promise<WeatherInfo | null> => {
    const loc = await getLocation();
    if (!loc) return null;
    const w = await getWeather(loc.lat, loc.lon);
    if (!w) return null;
    return { ...w, city: loc.city };
  }, []);

  const handleRetry = useCallback(async () => {
    setStatus("loading");
    const result = await loadWeather();
    if (result) {
      saveCache(result);
      setWeather(result);
      setStatus("success");
    } else {
      setStatus("error");
    }
  }, [loadWeather]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const result = await loadWeather();
      if (cancelled) return;
      if (result) {
        saveCache(result);
        setWeather(result);
        setStatus("success");
      } else {
        // Only show error if we had no cached data to fall back on
        setWeather((prev) => {
          if (!prev) setStatus("error");
          return prev;
        });
      }
    }

    // If we already have cached data, refresh silently in background
    // but start with the cached data visible.
    init();
    const timer = setInterval(init, CACHE_DURATION);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [loadWeather]);

  if (status === "loading") {
    return (
      <div className="weather-widget weather-widget--loading">
        <div className="weather-spinner" />
        <span className="weather-loading-text">{"\u83B7\u53D6\u5929\u6C14\u4E2D"}</span>
      </div>
    );
  }

  if (status === "error" || !weather) {
    return (
      <button className="weather-widget weather-widget--error" onClick={handleRetry}>
        <span>{"\u5929\u6C14\u83B7\u53D6\u5931\u8D25\uFF0C\u70B9\u51FB\u91CD\u8BD5"}</span>
      </button>
    );
  }

  const info = WEATHER_CODES[weather.weatherCode] ?? {
    icon: IconSunFilled,
    label: "\u672A\u77E5",
  };
  const WeatherIcon = info.icon;

  return (
    <div
      className="weather-widget"
      title={`\u4F53\u611F ${weather.temperature}\u00B0C \u00B7 \u6E7F\u5EA6 ${weather.humidity}% \u00B7 \u98CE\u901F ${weather.windSpeed} km/h`}
    >
      <WeatherIcon
        size={22}
        stroke={1.75}
        className="weather-icon"
      />
      <div className="weather-info">
        <span className="weather-temp">{weather.temperature}°</span>
        <span className="weather-label">{info.label}</span>
      </div>
      <span className="weather-divider" />
      <span className="weather-city">
        <IconMapPinFilled size={12} stroke={1.75} />
        {weather.city}
      </span>
    </div>
  );
}
