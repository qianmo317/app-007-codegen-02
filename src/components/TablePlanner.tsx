import { useMemo, useState } from 'react';
import type { Guest, Plan, Table, Command } from '../types';
import { generateId } from '../utils';
import {
  planTables,
  summarizeGuests,
  formatYuan,
  type PlannerInput,
  type SideKey,
} from '../planner';

interface Props {
  plan: Plan;
  dispatch: (cmd: Command) => void;
  onClose: () => void;
}

type FormState = {
  capacity: number;
  groomCount: number;
  brideCount: number;
  groomElders: number;
  brideElders: number;
  venueTables: number;
  tableCost: number;
};

export default function TablePlanner({ plan, dispatch, onClose }: Props) {
  const guestSummary = useMemo(() => summarizeGuests(plan.guests), [plan.guests]);
  const [form, setForm] = useState<FormState>({
    capacity: 10,
    groomCount: guestSummary.groomCount,
    brideCount: guestSummary.brideCount,
    groomElders: guestSummary.groomElders,
    brideElders: guestSummary.brideElders,
    venueTables: 30,
    tableCost: 2000,
  });
  const [useNames, setUseNames] = useState(true);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [key]: Math.max(0, parseFloat(e.target.value) || 0) }));
  };

  // 有名有姓的宾客按家分组
  const namedBySide = useMemo(() => {
    const map: Record<SideKey, Guest[]> = {
      groom: plan.guests.filter((g) => g.tags.includes('男方亲属')),
      bride: plan.guests.filter((g) => g.tags.includes('女方亲属')),
    };
    return map;
  }, [plan.guests]);

  const input: PlannerInput = useMemo(() => ({
    ...form,
    namedGuests: useNames ? {
      groom: namedBySide.groom.map((g) => ({ id: g.id, isElder: g.tags.includes('长辈') })),
      bride: namedBySide.bride.map((g) => ({ id: g.id, isElder: g.tags.includes('长辈') })),
    } : undefined,
  }), [form, useNames, namedBySide]);

  const result = useMemo(() => planTables(input), [input]);
  const guestName = (id: string) => plan.guests.find((g) => g.id === id)?.name || '';

  const nameMismatch =
    namedBySide.groom.length > form.groomCount || namedBySide.bride.length > form.brideCount;

  const fillFromGuests = () => {
    setForm((f) => ({ ...f, ...guestSummary }));
  };

  // 把测算结果落成画布上的桌（长辈优先、按铺开顺序入座）
  const applyToCanvas = () => {
    if (plan.tables.length > 0 && !confirm(`画布上已有 ${plan.tables.length} 张桌，应用测算结果会全部替换，确定？`)) return;
    const tables: Table[] = [];
    let globalIndex = 0;
    (['groom', 'bride'] as SideKey[]).forEach((key) => {
      result.families[key].tables.forEach((t) => {
        const col = globalIndex % 5;
        const row = Math.floor(globalIndex / 5);
        tables.push({
          id: generateId(),
          label: `${t.sideName === '男方' ? '男' : '女'}${t.familyIndex}桌${t.full ? '' : '·尾桌'}`,
          x: 40 + col * 190,
          y: 40 + row * 200,
          shape: 'round',
          capacity: form.capacity,
          seatOrder: t.seats.filter((s) => s.guestId).map((s) => s.guestId!),
        });
        globalIndex++;
      });
    });
    dispatch({ type: 'updateTables', tables });
    onClose();
  };

  return (
    <div className="tp-overlay" onClick={onClose}>
      <div className="tp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tp-header">
          <h2>桌数测算</h2>
          <button className="tp-close" onClick={onClose}>×</button>
        </div>

        <div className="tp-body">
          {/* 输入区 */}
          <section className="tp-section tp-inputs">
            <div className="tp-field">
              <label>每桌坐几位</label>
              <input type="number" min={1} value={form.capacity} onChange={set('capacity')} />
            </div>
            <div className="tp-field">
              <label>男方总人数</label>
              <input type="number" min={0} value={form.groomCount} onChange={set('groomCount')} />
            </div>
            <div className="tp-field">
              <label>男方长辈数</label>
              <input type="number" min={0} value={form.groomElders} onChange={set('groomElders')} />
            </div>
            <div className="tp-field">
              <label>女方总人数</label>
              <input type="number" min={0} value={form.brideCount} onChange={set('brideCount')} />
            </div>
            <div className="tp-field">
              <label>女方长辈数</label>
              <input type="number" min={0} value={form.brideElders} onChange={set('brideElders')} />
            </div>
            <div className="tp-field">
              <label>场地最多桌数</label>
              <input type="number" min={0} value={form.venueTables} onChange={set('venueTables')} />
            </div>
            <div className="tp-field">
              <label>每桌菜钱（元）</label>
              <input type="number" min={0} value={form.tableCost} onChange={set('tableCost')} />
            </div>
            <div className="tp-field tp-fill">
              <button onClick={fillFromGuests}>按宾客池标签带入人数</button>
              <label className="tp-check">
                <input type="checkbox" checked={useNames} onChange={(e) => setUseNames(e.target.checked)} />
                每桌坐谁用宾客池实名
              </label>
            </div>
          </section>

          {nameMismatch && (
            <div className="tp-warn">
              宾客池里挂「男方亲属/女方亲属」标签的人数（男 {namedBySide.groom.length}、女 {namedBySide.bride.length}）
              比上方填写的人数多，多出来的实名宾客不会入座，请核对人数或标签。
            </div>
          )}

          {/* 总结论 */}
          <section className="tp-section tp-summary">
            <div className="tp-summary-nums">
              <span>总人数 <b>{result.totalPeople}</b></span>
              <span>共摆 <b>{result.totalTables}</b> 桌</span>
              <span>空座位 <b>{result.totalEmpty}</b></span>
              <span>总菜钱 <b>{formatYuan(result.totalCost)}</b> 元</span>
            </div>
            <div className="tp-trace">推导：{result.trace}</div>
          </section>

          {/* 各家铺开 */}
          {(['groom', 'bride'] as SideKey[]).map((key) => {
            const f = result.families[key];
            return (
              <section key={key} className="tp-section">
                <h3 className="tp-side-title">{f.sideName}（{f.count} 人，长辈 {f.elders} 人）</h3>
                <div className="tp-trace">{f.trace}</div>
                {f.tableCount === 0 && <div className="tp-muted">该家 0 人，不摆桌。</div>}
                <div className="tp-table-grid">
                  {f.tables.map((t) => (
                    <div key={t.familyIndex} className={`tp-mini-table ${t.full ? 'full' : 'partial'}`}>
                      <div className="tp-mini-head">
                        {f.sideName}第 {t.familyIndex} 桌
                        {t.full ? '（满桌）' : '（坐不满）'}
                        {t.elderCount > 0 && <span className="tp-elder-badge">长辈 {t.elderCount}</span>}
                      </div>
                      <div className="tp-mini-nums">坐 {t.seated} 人 · 空 {t.empty} 座</div>
                      <div className="tp-seat-chips">
                        {t.seats.map((s, i) => (
                          <span key={i} className={`tp-chip ${s.isElder ? 'elder' : ''}`} title={s.isElder ? '长辈' : ''}>
                            {s.guestId ? guestName(s.guestId) : s.label}
                          </span>
                        ))}
                      </div>
                      {!t.full && t.perPerson !== null && (
                        <div className="tp-per-person">
                          这桌人均那份 = {form.tableCost} ÷ {t.seated} = <b>{formatYuan(t.perPerson)} 元/人</b>
                        </div>
                      )}
                      <div className="tp-mini-trace">{t.trace}</div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}

          {/* 长辈提醒 */}
          {result.elderWarnings.length > 0 && (
            <section className="tp-section tp-warn-block">
              <h3>长辈提醒</h3>
              {result.elderWarnings.map((w, i) => (
                <div key={i} className="tp-warn">
                  <span className="tp-warn-flag">!</span> {w}
                  <div className="tp-derive">依据：男方长辈 {form.groomElders}、女方长辈 {form.brideElders}、每桌 {form.capacity} 人推得。</div>
                </div>
              ))}
            </section>
          )}

          {/* 场地核对 */}
          <section className={`tp-section ${result.venue.fits ? 'tp-ok-block' : 'tp-warn-block'}`}>
            <h3>场地桌数核对</h3>
            <div className={result.venue.fits ? 'tp-ok' : 'tp-warn'}>
              {result.venue.fits ? '✓ ' : '✗ '}
              {result.venue.trace}
            </div>
          </section>

          {/* ±1 桌推演 */}
          <section className="tp-section">
            <h3>少摆一桌 / 多摆一桌</h3>
            <div className="tp-scenario-grid">
              <div className={`tp-scenario ${result.minusOne.feasible ? 'ok' : 'bad'}`}>
                <h4>少摆一桌（{result.minusOne.tables} 桌）</h4>
                <div className={result.minusOne.feasible ? 'tp-ok' : 'tp-warn'}>{result.minusOne.trace}</div>
                {result.minusOne.feasible && result.minusOne.partialTables.map((p, i) => (
                  <div key={i} className="tp-per-person">
                    {p.sideName}：坐 {p.seated} 人，人均 = {form.tableCost} ÷ {p.seated} = <b>{formatYuan(p.perPerson)} 元/人</b>
                  </div>
                ))}
              </div>
              <div className="tp-scenario ok">
                <h4>多摆一桌（{result.plusOne.tables} 桌）</h4>
                <div className="tp-ok">{result.plusOne.trace}</div>
                {result.plusOne.partialTables.map((p, i) => (
                  <div key={i} className="tp-per-person">
                    {p.sideName}尾桌：仍是 {p.seated} 人，人均 = {form.tableCost} ÷ {p.seated} = <b>{formatYuan(p.perPerson)} 元/人</b>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <div className="tp-footer">
          <button className="tp-apply" onClick={applyToCanvas}>按此结果摆桌并入座</button>
          <button onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
