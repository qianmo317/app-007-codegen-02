import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { calcTables, isCalcError, SIDE_LABEL } from '../calc/tableCalc';
import type { TableCalcInput, TableCalcResult, Side, Scenario } from '../calc/tableCalc';

interface FormState {
  groomGuests: string;
  groomElders: string;
  brideGuests: string;
  brideElders: string;
  seats: string;
  price: string;
  venue: string;
  threshold: string;
}

const DEFAULT_FORM: FormState = {
  groomGuests: '23',
  groomElders: '10',
  brideGuests: '18',
  brideElders: '2',
  seats: '10',
  price: '2000',
  venue: '5',
  threshold: '33',
};

function toInt(s: string): number {
  const t = s.trim();
  if (t === '') return 0;
  return Number(t);
}

function Derivation({ children }: { children: React.ReactNode }) {
  return <p className="te-derivation">📐 推导依据：{children}</p>;
}

function Money({ v }: { v: number | null }) {
  if (v === null) return <span className="te-muted">—</span>;
  return <span className="te-money">{v.toFixed(2)} 元/人</span>;
}

function SideCard({ result, accent }: { result: TableCalcResult['sides'][Side]; accent: string }) {
  return (
    <section className={`te-card te-side-card ${accent}`}>
      <h3>{SIDE_LABEL[result.side]}（{result.guests} 人，其中长辈 {result.elders} 人）</h3>
      <div className="te-kpi-row">
        <div className="te-kpi">
          <span className="te-kpi-num">{result.tables}</span>
          <span className="te-kpi-label">桌数</span>
        </div>
        <div className="te-kpi">
          <span className="te-kpi-num">{result.fullTables}</span>
          <span className="te-kpi-label">满桌</span>
        </div>
        <div className="te-kpi">
          <span className="te-kpi-num">{result.remainder > 0 ? 1 : 0}</span>
          <span className="te-kpi-label">不满桌</span>
        </div>
        <div className="te-kpi">
          <span className="te-kpi-num">{result.emptySeats}</span>
          <span className="te-kpi-label">空位</span>
        </div>
      </div>
      <ol className="te-table-list">
        {result.breakdown.map((t) => (
          <li key={t.index} className={t.full ? 'te-row-full' : 'te-row-partial'}>
            <span className="te-table-name">第 {t.index} 桌</span>
            <span className="te-tag">{t.full ? '满桌' : '不满桌'}</span>
            <span>坐 {t.seated} 人 · 空 {t.empty} 位</span>
            <span className="te-cost"><Money v={t.perPersonCost} /></span>
          </li>
        ))}
        {result.breakdown.length === 0 && <li className="te-empty">该家 0 人，不摆桌</li>}
      </ol>
      <Derivation>{result.derivation}</Derivation>
    </section>
  );
}

function ScenarioCard({ scenario, title }: { scenario: Scenario; title: string }) {
  const cls = scenario.kind === 'fewer'
    ? (scenario.feasible ? 'te-ok' : 'te-bad')
    : 'te-warn';
  return (
    <section className={`te-card te-scenario ${cls}`}>
      <h3>{title}（{scenario.tables} 桌）</h3>
      <p className="te-scenario-summary">
            <span className={`te-badge ${scenario.feasible || scenario.kind === 'extra' ? 'badge-ok' : 'badge-bad'}`}>
              {scenario.kind === 'fewer' ? (scenario.feasible ? '可行' : '坐不下') : '可行但浪费'}
            </span>
        {' '}{scenario.summary}
      </p>
      <ul className="te-scenario-meta">
        <li>总座位 {scenario.totalCapacity}，总人数 {scenario.totalSeated}，空位 {scenario.totalEmpty}{scenario.shortage > 0 ? `，缺 ${scenario.shortage} 座` : ''}</li>
      </ul>
      <ol className="te-table-list">
        {scenario.tableList.map((t, i) => (
          <li key={i} className={t.empty === 0 ? 'te-row-full' : t.seated === 0 ? 'te-row-empty' : 'te-row-partial'}>
            <span className="te-table-name">{t.label}</span>
            <span>{t.note}</span>
            <span className="te-cost"><Money v={t.perPersonCost} /></span>
          </li>
        ))}
      </ol>
      <Derivation>{scenario.derivation}</Derivation>
    </section>
  );
}

export default function TableEstimate() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const { result, errors } = useMemo(() => {
    const input: TableCalcInput = {
      groom: { guests: toInt(form.groomGuests), elders: toInt(form.groomElders) },
      bride: { guests: toInt(form.brideGuests), elders: toInt(form.brideElders) },
      seatsPerTable: toInt(form.seats),
      tablePrice: toInt(form.price),
      venueCapacity: form.venue.trim() === '' ? null : toInt(form.venue),
      elderRatioThreshold: (toInt(form.threshold) || 33) / 100,
    };
    const r = calcTables(input);
    return isCalcError(r)
      ? { result: null, errors: r.errors }
      : { result: r as TableCalcResult, errors: [] };
  }, [form]);

  return (
    <div className="te-container">
      <header className="te-header">
        <h1>桌数测算</h1>
        <Link to="/" className="te-back">← 返回方案列表</Link>
      </header>
      <p className="te-intro">
        填好总人数（分男女两家、含长辈数）和每桌坐几位，自动算出要摆几桌、每桌坐几人、不满桌人均多少钱，
        以及少摆/多摆一桌的后果，并与场地容量对一遍。每一项结论下面都写明了由哪几个数推出。
      </p>

      <div className="te-layout">
        <form className="te-card te-form" onSubmit={(e) => e.preventDefault()}>
          <h2>输入</h2>

          <div className="te-field-group">
            <h4 className="te-group-title groom">男方</h4>
            <label>宾客总人数（含长辈）
              <input type="number" min={0} value={form.groomGuests} onChange={set('groomGuests')} />
            </label>
            <label>其中长辈人数
              <input type="number" min={0} value={form.groomElders} onChange={set('groomElders')} />
            </label>
          </div>

          <div className="te-field-group">
            <h4 className="te-group-title bride">女方</h4>
            <label>宾客总人数（含长辈）
              <input type="number" min={0} value={form.brideGuests} onChange={set('brideGuests')} />
            </label>
            <label>其中长辈人数
              <input type="number" min={0} value={form.brideElders} onChange={set('brideElders')} />
            </label>
          </div>

          <div className="te-field-group">
            <h4 className="te-group-title">桌与场地</h4>
            <label>每桌坐几位
              <input type="number" min={1} value={form.seats} onChange={set('seats')} />
            </label>
            <label>每桌酒席价钱（元/桌，不填不算人均）
              <input type="number" min={0} value={form.price} onChange={set('price')} />
            </label>
            <label>场地最多能摆几桌（留空则不比对）
              <input type="number" min={0} value={form.venue} onChange={set('venue')} />
            </label>
            <label>长辈占比提醒线（%，默认 33%）
              <input type="number" min={1} max={100} value={form.threshold} onChange={set('threshold')} />
            </label>
          </div>

          {errors.length > 0 && (
            <div className="te-errors">
              {errors.map((e, i) => <p key={i}>⚠️ {e}</p>)}
            </div>
          )}
        </form>

        {result && (
          <div className="te-results">
            <section className="te-card te-summary-card">
              <h2>测算结果</h2>
              <div className="te-kpi-row big">
                <div className="te-kpi">
                  <span className="te-kpi-num">{result.totalGuests}</span>
                  <span className="te-kpi-label">总人数（长辈 {result.totalElders} 人）</span>
                </div>
                <div className="te-kpi highlight">
                  <span className="te-kpi-num">{result.totalTables}</span>
                  <span className="te-kpi-label">要摆桌数</span>
                </div>
                <div className="te-kpi">
                  <span className="te-kpi-num">{result.fullTableCount}</span>
                  <span className="te-kpi-label">满桌</span>
                </div>
                <div className="te-kpi">
                  <span className="te-kpi-num">{result.partialTableCount}</span>
                  <span className="te-kpi-label">不满桌</span>
                </div>
                <div className="te-kpi">
                  <span className="te-kpi-num">{result.totalEmptySeats}</span>
                  <span className="te-kpi-label">空位合计</span>
                </div>
              </div>
              <Derivation>
                总人数 = 男方 {result.sides.groom.guests} + 女方 {result.sides.bride.guests} = {result.totalGuests}；
                总桌数 = 男方 {result.sides.groom.tables} 桌 + 女方 {result.sides.bride.tables} 桌 = {result.totalTables} 桌
                （每家按 ⌈人数 ÷ {result.seatsPerTable}⌉ 向上取整，坐不满的零头也单独开一桌）；
                满桌 {result.fullTableCount}、不满桌 {result.partialTableCount}、空位 {result.totalEmptySeats}
                （由两家零头桌空位相加）。
              </Derivation>
            </section>

            <div className="te-two-col">
              <SideCard result={result.sides.groom} accent="groom-accent" />
              <SideCard result={result.sides.bride} accent="bride-accent" />
            </div>

            {result.partialTables.length > 0 && (
              <section className="te-card te-partial-card">
                <h2>坐不满的桌（单独列出）</h2>
                <ol className="te-table-list">
                  {result.partialTables.map((t, i) => (
                    <li key={i} className="te-row-partial">
                      <span className="te-table-name">{SIDE_LABEL[t.side]}第 {t.index} 桌</span>
                      <span>坐 {t.seated} 人 · 空 {t.empty} 位</span>
                      <span className="te-cost">
                        这桌人均 <Money v={t.perPersonCost} />
                      </span>
                    </li>
                  ))}
                </ol>
                <Derivation>
                  每张不满桌的人均 = 整桌价钱 ÷ 实际坐的人数；人越少的零头桌人均越贵
                  （满桌人均作对照：{toInt(form.price) > 0
                    ? `${toInt(form.price)} ÷ ${result.seatsPerTable} = ${(toInt(form.price) / result.seatsPerTable).toFixed(2)} 元/人`
                    : '未填桌价，无法计算'}）。
                  由「每桌价钱 {form.price || '—'} 元」与「各零头桌实坐人数」推出。
                </Derivation>
              </section>
            )}

            <div className="te-two-col">
              <ScenarioCard scenario={result.scenarioFewer} title="少摆一桌" />
              <ScenarioCard scenario={result.scenarioExtra} title="多摆一桌" />
            </div>

            {result.elderWarnings.length > 0 && (
              <section className="te-card te-warning-card">
                <h2>长辈人数提醒</h2>
                {result.elderWarnings.map((w) => (
                  <div key={w.side} className="te-warning-item">
                    <p>⚠️ {w.message}</p>
                    <Derivation>{w.derivation}</Derivation>
                  </div>
                ))}
              </section>
            )}
            {result.elderWarnings.length === 0 && (
              <section className="te-card te-ok-card">
                <h2>长辈人数提醒</h2>
                <p>✅ 两家长辈人数都未超过提醒线，也未超过一整桌（{result.seatsPerTable} 人），按顺序铺开时不会被明显拆散。</p>
                <Derivation>
                  男方长辈 {result.sides.groom.elders}/{result.sides.groom.guests} 人、女方长辈 {result.sides.bride.elders}/{result.sides.bride.guests} 人，
                  占比均 ≤ {form.threshold}%，且均 ≤ {result.seatsPerTable} 人。由「两家长辈数、总人数、每桌 {result.seatsPerTable} 位、提醒线 {form.threshold}%」推出。
                </Derivation>
              </section>
            )}

            <section className={`te-card ${result.venueCheck.ok ? 'te-ok-card' : 'te-danger-card'}`}>
              <h2>场地容量核对</h2>
              <p className="te-venue-message">
                {result.venueCheck.ok ? '✅ ' : '🛑 '}{result.venueCheck.message}
              </p>
              <Derivation>{result.venueCheck.derivation}</Derivation>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
