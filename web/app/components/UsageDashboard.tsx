import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './UsageDashboard.css';

interface ModelStats {
  tokens: number;
  requests: number;
}

interface DashboardStats {
  dailyStats: { date: string; tokens: number; requests: number; models?: Record<string, ModelStats>; }[];
  hourlyStats: { hour: number; tokens: number; requests: number; models?: Record<string, ModelStats>; }[];
  modelStats: { model: string; tokens: number; requests: number; }[];
  todayTokens: number;
  todayRequests: number;
  avgResponseTime: number;
}

interface UsageDashboardProps {
  stats: DashboardStats;
  selectedDate: Date;
}

const MODEL_COLORS: Record<string, string> = {
  'claude-opus': '#9333ea',
  'claude-sonnet': '#3b82f6',
  'claude-haiku': '#10b981',
};

function getModelDisplayName(model: string): string {
  if (model.includes('opus')) return 'Opus';
  if (model.includes('sonnet')) return 'Sonnet';
  if (model.includes('haiku')) return 'Haiku';
  return model;
}

function getModelColor(model: string): string {
  if (model.includes('opus')) return MODEL_COLORS['claude-opus'];
  if (model.includes('sonnet')) return MODEL_COLORS['claude-sonnet'];
  if (model.includes('haiku')) return MODEL_COLORS['claude-haiku'];
  return '#6b7280';
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000_000) return `${(tokens / 1_000_000_000).toFixed(1)}B`;
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

export function UsageDashboard({ stats, selectedDate = new Date() }: UsageDashboardProps) {
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  const processedStats = useMemo(() => {
    const selectedDateStr = selectedDate.toISOString().split('T')[0];

    // Build week (Sunday through Saturday) containing the selected date
    const days = [];
    const dailyMap = new Map(stats.dailyStats.map(d => [d.date, d]));

    const actualToday = new Date();
    actualToday.setHours(0, 0, 0, 0);
    const actualTodayStr = actualToday.toISOString().split('T')[0];

    // Find the Sunday of the week containing selectedDate
    const weekStart = new Date(selectedDate);
    weekStart.setHours(0, 0, 0, 0);
    const dayOfWeek = weekStart.getDay(); // 0 = Sunday, 1 = Monday, etc.
    weekStart.setDate(weekStart.getDate() - dayOfWeek); // Go back to Sunday

    // Build all 7 days of the week (Sun-Sat)
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      const dayData = dailyMap.get(dateStr) || { tokens: 0, requests: 0 };

      // Always show short day name (Sun, Mon, Tue, etc.)
      const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short' });

      days.push({
        date: dateStr,
        dayName: dayLabel,
        tokens: dayData.tokens,
        requests: dayData.requests,
        models: dayData.models || {},
        isToday: dateStr === actualTodayStr, // Mark actual today, not selected date
      });
    }

    // Build 24 hours with data from backend
    const hours = [];
    const hourMap = new Map(stats.hourlyStats.map(h => [h.hour, h]));

    for (let h = 0; h < 24; h++) {
      const hourData = hourMap.get(h) || { tokens: 0, requests: 0, models: {} };
      hours.push({
        hour: h,
        tokens: hourData.tokens,
        requests: hourData.requests,
        models: hourData.models || {},
      });
    }

    // Process model stats
    const models = stats.modelStats.map(m => ({
      model: m.model,
      displayName: getModelDisplayName(m.model),
      tokens: m.tokens,
      requests: m.requests,
      color: getModelColor(m.model),
    }));

    // Calculate max values for chart scaling
    const maxDayTokens = Math.max(...days.map(d => d.tokens), 1);
    const maxHourTokens = Math.max(...hours.map(h => h.tokens), 1);
    const maxModelTokens = Math.max(...models.map(m => m.tokens), 1);

    // Generate week label (always show date range for clarity)
    let weekLabel = 'THIS WEEK';

    if (days.length > 0) {
      // Parse dates as local dates (not UTC) to avoid timezone shifts
      const parseLocalDate = (dateStr: string) => {
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day);
      };

      const firstDay = parseLocalDate(days[0].date); // Sunday
      const lastDay = parseLocalDate(days[6].date);  // Saturday

      // Check if this week contains today
      const containsToday = days.some(day => day.isToday);

      if (containsToday) {
        weekLabel = 'THIS WEEK';
      } else {
        // Format: "Nov 22 - 28" or "Nov 22 - Dec 5" if crossing months
        const firstMonth = firstDay.toLocaleDateString('en-US', { month: 'short' });
        const lastMonth = lastDay.toLocaleDateString('en-US', { month: 'short' });
        const firstDate = firstDay.getDate();
        const lastDate = lastDay.getDate();

        if (firstMonth === lastMonth) {
          weekLabel = `${firstMonth} ${firstDate} - ${lastDate}`;
        } else {
          weekLabel = `${firstMonth} ${firstDate} - ${lastMonth} ${lastDate}`;
        }
      }
    }

    // Calculate average daily tokens for the week (excluding days with zero tokens)
    const daysWithData = days.filter(day => day.tokens > 0);
    const avgDayTokens = daysWithData.length > 0
      ? Math.round(daysWithData.reduce((sum, day) => sum + day.tokens, 0) / daysWithData.length)
      : 0;

    // Get current time if viewing today (including minutes for precise positioning)
    const now = new Date();
    const isViewingToday = selectedDateStr === now.toISOString().split('T')[0];
    const currentTimePosition = isViewingToday
      ? (now.getHours() + now.getMinutes() / 60) / 24 * 100
      : null;

    return {
      days,
      hours,
      models,
      maxDayTokens,
      maxHourTokens,
      maxModelTokens,
      todayTokens: stats.todayTokens,
      todayRequests: stats.todayRequests,
      avgResponseTime: stats.avgResponseTime,
      weekLabel,
      avgDayTokens,
      currentTimePosition,
    };
  }, [stats, selectedDate]);

  const isToday = selectedDate.toDateString() === new Date().toDateString();
  const dateLabel = isToday ? 'Today' : selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="usage-dashboard">
      <div className="usage-main">
        <div className="usage-total">
          <div className="usage-total-label">Tokens {dateLabel}</div>
          <div className="usage-total-value">
            {formatTokens(processedStats.todayTokens)}
            {processedStats.todayTokens >= 1000 && <span className="usage-total-unit">tokens</span>}
          </div>
          <div className="quick-stats">
            <div className="quick-stat">
              <span className="quick-stat-value">{processedStats.todayRequests}</span>
              <span className="quick-stat-label">Requests</span>
            </div>
            <div className="quick-stat">
              <span className="quick-stat-value">{(processedStats.avgResponseTime / 1000).toFixed(1)}s</span>
              <span className="quick-stat-label">Avg Time</span>
            </div>
            <div className="quick-stat">
              <span className="quick-stat-value">{formatTokens(Math.round(processedStats.todayTokens / Math.max(processedStats.todayRequests, 1)))}</span>
              <span className="quick-stat-label">Avg/Request</span>
            </div>
          </div>
        </div>

        <div className="usage-charts">
          <div className="chart-row">
            <span className="chart-label">{processedStats.weekLabel}</span>
            <div className="chart-with-axis">
              <div className="chart-y-axis">
                <span className="y-axis-label">{formatTokens(processedStats.maxDayTokens)}</span>
                <span className="y-axis-label">{formatTokens(Math.floor(processedStats.maxDayTokens / 2))}</span>
                <span className="y-axis-label">0</span>
              </div>
              <div className="weekly-chart">
                {processedStats.days.map((day, i) => {
                  // Calculate stacked heights for each model - check all possible model name variations
                  const modelKeys = Object.keys(day.models || {});
                  const opusTokens = modelKeys.find(k => k.includes('opus'))
                    ? (day.models[modelKeys.find(k => k.includes('opus'))!]?.tokens || 0)
                    : 0;
                  const sonnetTokens = modelKeys.find(k => k.includes('sonnet'))
                    ? (day.models[modelKeys.find(k => k.includes('sonnet'))!]?.tokens || 0)
                    : 0;
                  const haikuTokens = modelKeys.find(k => k.includes('haiku'))
                    ? (day.models[modelKeys.find(k => k.includes('haiku'))!]?.tokens || 0)
                    : 0;

                  const totalHeight = Math.max((day.tokens / processedStats.maxDayTokens) * 100, 4);
                  const opusHeight = day.tokens > 0 ? (opusTokens / day.tokens) * totalHeight : 0;
                  const sonnetHeight = day.tokens > 0 ? (sonnetTokens / day.tokens) * totalHeight : 0;
                  const haikuHeight = day.tokens > 0 ? (haikuTokens / day.tokens) * totalHeight : 0;

                  return (
                    <div
                      key={i}
                      className="day-bar"
                      onMouseEnter={() => setHoveredDay(i)}
                      onMouseLeave={() => setHoveredDay(null)}
                    >
                      <div className="day-bar-fill-container" style={{ height: `${totalHeight}%` }}>
                        {opusHeight > 0 && (
                          <div
                            className="day-bar-segment opus"
                            style={{ height: `${(opusHeight / totalHeight) * 100}%` }}
                          />
                        )}
                        {sonnetHeight > 0 && (
                          <div
                            className="day-bar-segment sonnet"
                            style={{ height: `${(sonnetHeight / totalHeight) * 100}%` }}
                          />
                        )}
                        {haikuHeight > 0 && (
                          <div
                            className="day-bar-segment haiku"
                            style={{ height: `${(haikuHeight / totalHeight) * 100}%` }}
                          />
                        )}
                      </div>
                      {hoveredDay === i && day.tokens > 0 && (
                        <div className="day-tooltip">
                          <div className="day-tooltip-time">{day.dayName}</div>
                          {opusTokens > 0 && (
                            <div className="day-tooltip-item">
                              <div className="day-tooltip-dot opus"></div>
                              <span className="day-tooltip-label">Opus</span>
                              <span className="day-tooltip-value">{formatTokens(opusTokens)}</span>
                            </div>
                          )}
                          {sonnetTokens > 0 && (
                            <div className="day-tooltip-item">
                              <div className="day-tooltip-dot sonnet"></div>
                              <span className="day-tooltip-label">Sonnet</span>
                              <span className="day-tooltip-value">{formatTokens(sonnetTokens)}</span>
                            </div>
                          )}
                          {haikuTokens > 0 && (
                            <div className="day-tooltip-item">
                              <div className="day-tooltip-dot haiku"></div>
                              <span className="day-tooltip-label">Haiku</span>
                              <span className="day-tooltip-value">{formatTokens(haikuTokens)}</span>
                            </div>
                          )}
                          <div className="day-tooltip-total">
                            <span>Total</span>
                            <span>{formatTokens(day.tokens)}</span>
                          </div>
                        </div>
                      )}
                      <span className={`day-bar-label ${day.isToday ? 'is-today' : ''}`}>{day.dayName}</span>
                    </div>
                  );
                })}
                {/* Average line */}
                {processedStats.avgDayTokens > 0 && (
                  <div
                    className="average-line"
                    style={{
                      bottom: `${(processedStats.avgDayTokens / processedStats.maxDayTokens) * 100}%`
                    }}
                  >
                    <span className="average-label">avg</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="chart-row">
            <span className="chart-label">Today by Hour</span>
            <div className="chart-with-axis">
              <div className="chart-y-axis">
                <span className="y-axis-label">{formatTokens(processedStats.maxHourTokens)}</span>
                <span className="y-axis-label">{formatTokens(Math.floor(processedStats.maxHourTokens / 2))}</span>
                <span className="y-axis-label">0</span>
              </div>
              <div className="hourly-chart-container">
                <div className="hourly-chart">
                  {processedStats.hours.map((hour, i) => {
                    // Calculate stacked heights for each model - check all possible model name variations
                    const modelKeys = Object.keys(hour.models || {});
                    const opusTokens = modelKeys.find(k => k.includes('opus'))
                      ? (hour.models[modelKeys.find(k => k.includes('opus'))!]?.tokens || 0)
                      : 0;
                    const sonnetTokens = modelKeys.find(k => k.includes('sonnet'))
                      ? (hour.models[modelKeys.find(k => k.includes('sonnet'))!]?.tokens || 0)
                      : 0;
                    const haikuTokens = modelKeys.find(k => k.includes('haiku'))
                      ? (hour.models[modelKeys.find(k => k.includes('haiku'))!]?.tokens || 0)
                      : 0;

                    const totalHeight = Math.max((hour.tokens / processedStats.maxHourTokens) * 100, 3);
                    const opusHeight = hour.tokens > 0 ? (opusTokens / hour.tokens) * totalHeight : 0;
                    const sonnetHeight = hour.tokens > 0 ? (sonnetTokens / hour.tokens) * totalHeight : 0;
                    const haikuHeight = hour.tokens > 0 ? (haikuTokens / hour.tokens) * totalHeight : 0;

                    const hourLabel = i === 0 ? '12 AM' : i === 12 ? '12 PM' : i < 12 ? `${i} AM` : `${i - 12} PM`;

                    return (
                      <div
                        key={i}
                        className="hour-bar-container"
                        onMouseEnter={() => setHoveredHour(i)}
                        onMouseLeave={() => setHoveredHour(null)}
                      >
                        <div
                          className="hour-bar"
                          style={{ height: `${totalHeight}%` }}
                        >
                          {opusHeight > 0 && (
                            <div
                              className="hour-bar-segment opus"
                              style={{ height: `${(opusHeight / totalHeight) * 100}%` }}
                            />
                          )}
                          {sonnetHeight > 0 && (
                            <div
                              className="hour-bar-segment sonnet"
                              style={{ height: `${(sonnetHeight / totalHeight) * 100}%` }}
                            />
                          )}
                          {haikuHeight > 0 && (
                            <div
                              className="hour-bar-segment haiku"
                              style={{ height: `${(haikuHeight / totalHeight) * 100}%` }}
                            />
                          )}
                        </div>
                        {hoveredHour === i && hour.tokens > 0 && (
                          <div className="hour-tooltip">
                            <div className="hour-tooltip-time">{hourLabel}</div>
                            {opusTokens > 0 && (
                              <div className="hour-tooltip-item">
                                <div className="hour-tooltip-dot opus"></div>
                                <span className="hour-tooltip-label">Opus</span>
                                <span className="hour-tooltip-value">{formatTokens(opusTokens)}</span>
                              </div>
                            )}
                            {sonnetTokens > 0 && (
                              <div className="hour-tooltip-item">
                                <div className="hour-tooltip-dot sonnet"></div>
                                <span className="hour-tooltip-label">Sonnet</span>
                                <span className="hour-tooltip-value">{formatTokens(sonnetTokens)}</span>
                              </div>
                            )}
                            {haikuTokens > 0 && (
                              <div className="hour-tooltip-item">
                                <div className="hour-tooltip-dot haiku"></div>
                                <span className="hour-tooltip-label">Haiku</span>
                                <span className="hour-tooltip-value">{formatTokens(haikuTokens)}</span>
                              </div>
                            )}
                            <div className="hour-tooltip-total">
                              <span>Total</span>
                              <span>{formatTokens(hour.tokens)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* "Now" indicator line */}
                  {processedStats.currentTimePosition !== null && (
                    <div
                      className="now-indicator"
                      style={{
                        left: `${processedStats.currentTimePosition}%`
                      }}
                    />
                  )}
                </div>
                <div className="hour-x-axis">
                  <span className="hour-x-label">12 AM</span>
                  <span className="hour-x-label">6 AM</span>
                  <span className="hour-x-label">12 PM</span>
                  <span className="hour-x-label">6 PM</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="usage-breakdown">
          <div className="breakdown-title">Models</div>
          {processedStats.models.map((model, i) => (
            <div key={i} className="breakdown-item">
              <div className="breakdown-header">
                <span className="breakdown-model">{model.displayName}</span>
                <span className="breakdown-tokens">{formatTokens(model.tokens)}</span>
              </div>
              <div className="breakdown-bar">
                <div
                  className="breakdown-bar-fill"
                  style={{
                    width: `${(model.tokens / processedStats.maxModelTokens) * 100}%`,
                    backgroundColor: model.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
