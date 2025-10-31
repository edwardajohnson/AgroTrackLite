// dashboard/src/App.tsx
import React, { useEffect, useMemo, useState } from 'react';

type HcsMsg = {
  consensus_timestamp: string;
  sequence_number: number;
  raw: string;
  json: any;
};

export default function App() {
  const [topicId, setTopicId] = useState<string>('');
  const [rows, setRows] = useState<HcsMsg[]>([]);
  const [pending, setPending] = useState<Record<string, any>>({});
  const [filter, setFilter] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [runningReport, setRunningReport] = useState<boolean>(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/messages?limit=200').then((r) => r.json());
      setTopicId(r.topicId || '');
      setRows(r.messages || []);

      const p = await fetch('/api/pending').then((r) => r.json());
      setPending(p.data || {});
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    if (!filter) return rows;
    const f = filter.toLowerCase();
    return rows.filter((m) => {
      const s = (m.raw || '').toLowerCase();
      return s.includes(f) || (m.json ? JSON.stringify(m.json).toLowerCase().includes(f) : false);
    });
  }, [rows, filter]);

  // ---- Daily Report extraction ----
  const latestDailyReport = useMemo(() => {
    const reports = rows
      .map((m) => ({
        ts: tsToMs(m.consensus_timestamp),
        data: m.json?.label === 'DailyReport' ? m.json?.payload : null,
      }))
      .filter((x) => !!x.data)
      .sort((a, b) => b.ts - a.ts);
    return reports[0]?.data || null;
  }, [rows]);

  const dailyCounts = latestDailyReport?.summary?.counts || {};
  const dailyTotals = latestDailyReport?.summary?.totals || {};
  const dailyParties = latestDailyReport?.summary?.parties || {};
  const dailyEscrow = latestDailyReport?.summary?.escrow || {};
  const dailyDay = latestDailyReport?.day;

  async function runDemo() {
    await fetch('/api/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    setTimeout(load, 1500);
  }

  async function triggerDailyReport() {
    try {
      setRunningReport(true);
      await fetch('/api/report/run', { method: 'POST' });
      // give the mirror node a moment to catch up
      setTimeout(load, 1500);
    } catch (e) {
      console.error(e);
    } finally {
      setRunningReport(false);
    }
  }

  return (
    <div style={{ fontFamily: 'Inter, system-ui, Arial, sans-serif', padding: 20, background: '#0a0a0a', color: '#eee', minHeight: '100vh' }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>AgroTrack-Lite Dashboard</h1>
        <div style={{ opacity: 0.8, fontSize: 14 }}>
          Topic: <code>{topicId || '(initializing...)'}</code>
        </div>
      </header>

      <section style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <input
          placeholder="Filter by text, label, otp…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ padding: 8, minWidth: 280, borderRadius: 8, border: '1px solid #333', background: '#111', color: '#eee' }}
        />
        <button onClick={load} disabled={loading} style={btnStyle}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
        <button onClick={runDemo} style={btnStyle}>Run Demo (delivery + confirm)</button>
        <button onClick={triggerDailyReport} disabled={runningReport} style={btnStyleAlt}>
          {runningReport ? 'Posting Daily Report…' : 'Post Daily Report'}
        </button>
      </section>

      {/* ---- Daily Report Card ---- */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '8px 0' }}>📊 Daily Report {dailyDay ? <span style={{ opacity: 0.7 }}>(UTC Day: {dailyDay})</span> : null}</h3>
        {latestDailyReport ? (
          <div style={cardRow}>
            <Kpi label="Deliveries" value={safeNum(dailyCounts.totalDeliveries)} />
            <Kpi label="Stored (OTP)" value={safeNum(dailyCounts.totalStored)} />
            <Kpi label="Buyer Confirms" value={safeNum(dailyCounts.totalBuyerConfirms)} />
            <Kpi label="Escrow Releases" value={safeNum(dailyCounts.totalEscrow)} />
            <Kpi label="Qty Delivered" value={safeNum(dailyTotals.totalQtyDelivered)} />
            <Kpi label="Farmers" value={safeNum(dailyParties.farmers)} />
            <Kpi label="Buyers" value={safeNum(dailyParties.buyers)} />
            <Kpi label="Retries" value={safeNum(dailyCounts.retries)} />
            <Kpi label="Failures" value={safeNum(dailyCounts.failed)} />
          </div>
        ) : (
          <div style={{ ...muted, padding: 8 }}>No DailyReport found yet. Click “Post Daily Report”.</div>
        )}
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '8px 0' }}>Pending OTPs</h3>
        <pre style={preStyle}>{JSON.stringify(pending, null, 2)}</pre>
      </section>

      <section>
        <h3 style={{ margin: '8px 0' }}>HCS Messages (latest)</h3>
        <div style={{ overflowX: 'auto', border: '1px solid #333', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#151515' }}>
              <tr>
                <th style={thtd}>Time</th>
                <th style={thtd}>Seq</th>
                <th style={thtd}>Label</th>
                <th style={thtd}>Payload</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const label = m.json?.label || '(raw)';
                const payload = m.json?.payload || m.raw;
                const time = prettyTs(m.consensus_timestamp);
                return (
                  <tr key={m.sequence_number} style={{ borderTop: '1px solid #222' }}>
                    <td style={thtd}>{time}</td>
                    <td style={thtd}>{m.sequence_number}</td>
                    <td style={thtd}><code>{label}</code></td>
                    <td style={{ ...thtd, maxWidth: 700 }}>
                      <pre style={preStyle}>{typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)}</pre>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr><td colSpan={4} style={{ ...thtd, textAlign: 'center', opacity: 0.7 }}>No messages.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={kpiBox}>
      <div style={{ fontSize: 12, opacity: 0.75 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function tsToMs(ts: string) {
  // 'consensus_timestamp' like "1730392283.894399013"
  const s = Number(String(ts).split('.')[0] || '0');
  return s * 1000;
}

function prettyTs(ts: string) {
  const ms = tsToMs(ts);
  if (!ms) return ts;
  return new Date(ms).toLocaleString();
}

function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const btnStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: '#1f6feb',
  color: '#fff',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer'
};

const btnStyleAlt: React.CSSProperties = {
  ...btnStyle,
  background: '#10a37f'
};

const preStyle: React.CSSProperties = {
  background: '#0f0f0f',
  color: '#ddd',
  borderRadius: 8,
  padding: 12,
  margin: 0,
  overflowX: 'auto'
};

const thtd: React.CSSProperties = {
  padding: 8,
  verticalAlign: 'top',
  textAlign: 'left'
};

const muted: React.CSSProperties = { opacity: 0.7, fontSize: 14 };

const cardRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: 12
};

const kpiBox: React.CSSProperties = {
  background: '#101010',
  border: '1px solid #282828',
  borderRadius: 12,
  padding: 12,
  minWidth: 140
};

