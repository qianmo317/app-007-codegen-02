// 桌数测算：给定男女两家人数、每桌位数、桌价与场地容量，
// 算出要摆多少桌、每桌坐谁（满桌 / 不满桌）、不满桌人均多少钱，
// 以及少摆一桌 / 多摆一桌的结果、长辈偏多提醒、场地容量核对。
// 每一项结果都附带 derivation（由哪几个数推出）。

export type Side = 'groom' | 'bride';

export interface SideInput {
  /** 该家宾客总人数（含长辈） */
  guests: number;
  /** 该家长辈人数（应 <= guests） */
  elders: number;
}

export interface TableCalcInput {
  groom: SideInput;
  bride: SideInput;
  /** 每桌坐几位 */
  seatsPerTable: number;
  /** 每桌酒席价钱（元/桌），用于算不满桌的人均；<=0 表示不填 */
  tablePrice: number;
  /** 场地最多能摆几张桌；null/<=0 表示未提供，不对场 */
  venueCapacity: number | null;
  /** 长辈占比提醒阈值，默认 1/3（即长辈超过宾客的三分之一时提醒） */
  elderRatioThreshold?: number;
}

/** 一桌的编排结果 */
export interface TableBreakdown {
  side: Side;
  /** 桌序号（该家内部从 1 开始） */
  index: number;
  seated: number;
  empty: number;
  full: boolean;
  /** 坐不满时这桌人均摊多少钱：桌价 ÷ 实坐人数；满桌/未填桌价时为 null */
  perPersonCost: number | null;
  derivation: string;
}

export interface SideResult {
  side: Side;
  guests: number;
  elders: number;
  fullTables: number;
  remainder: number;
  tables: number;
  emptySeats: number;
  breakdown: TableBreakdown[];
  /** 推导：如 23 ÷ 10 = 2 桌 … 3 人 => 3 桌 */
  derivation: string;
}

export interface ScenarioTable {
  label: string;
  side: Side | null;
  seated: number;
  empty: number;
  perPersonCost: number | null;
  note: string;
}

export type ScenarioKind = 'fewer' | 'extra';

export interface Scenario {
  kind: ScenarioKind;
  tables: number;
  totalCapacity: number;
  totalSeated: number;
  totalEmpty: number;
  feasible: boolean;
  /** 少摆一桌坐不下时，还差几个座位 */
  shortage: number;
  /** 多摆一桌时，多出来的空桌数（通常 1） */
  addedEmptyTables: number;
  tableList: ScenarioTable[];
  summary: string;
  derivation: string;
}

export interface ElderWarning {
  side: Side;
  elders: number;
  guests: number;
  ratio: number;
  threshold: number;
  message: string;
  derivation: string;
}

export interface VenueCheck {
  provided: boolean;
  venueCapacity: number | null;
  tablesNeeded: number;
  ok: boolean;
  /** 超出场地时还差几张桌的位置 */
  shortageTables: number;
  message: string;
  derivation: string;
}

export interface TableCalcResult {
  totalGuests: number;
  totalElders: number;
  seatsPerTable: number;
  totalTables: number;
  totalCapacity: number;
  totalEmptySeats: number;
  fullTableCount: number;
  partialTableCount: number;
  /** 所有坐不满的桌（两家合并，按桌列出人均） */
  partialTables: TableBreakdown[];
  sides: Record<Side, SideResult>;
  scenarioFewer: Scenario;
  scenarioExtra: Scenario;
  elderWarnings: ElderWarning[];
  venueCheck: VenueCheck;
}

export interface CalcError {
  errors: string[];
}

const SIDE_NAME: Record<Side, string> = { groom: '男方', bride: '女方' };

export function validateInput(input: TableCalcInput): string[] {
  const errors: string[] = [];
  const { seatsPerTable } = input;
  if (!Number.isFinite(seatsPerTable) || seatsPerTable <= 0 || !Number.isInteger(seatsPerTable)) {
    errors.push('每桌坐几位必须是大于 0 的整数。');
  }
  (['groom', 'bride'] as Side[]).forEach((side) => {
    const { guests, elders } = input[side];
    const name = SIDE_NAME[side];
    if (!Number.isFinite(guests) || guests < 0 || !Number.isInteger(guests)) {
      errors.push(`${name}宾客人数必须是不小于 0 的整数。`);
    }
    if (!Number.isFinite(elders) || elders < 0 || !Number.isInteger(elders)) {
      errors.push(`${name}长辈人数必须是不小于 0 的整数。`);
    }
    if (Number.isFinite(guests) && Number.isFinite(elders) && elders > guests) {
      errors.push(`${name}长辈人数（${elders} 人）不能多于该家总人数（${guests} 人）。`);
    }
  });
  if (input.venueCapacity !== null && input.venueCapacity !== undefined) {
    const v = input.venueCapacity;
    if (!Number.isFinite(v) || v <= 0 || !Number.isInteger(v)) {
      errors.push('场地能容纳的桌数必须是大于 0 的整数，或留空不比对。');
    }
  }
  return errors;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function perPerson(tablePrice: number, seated: number): number | null {
  if (!Number.isFinite(tablePrice) || tablePrice <= 0 || seated <= 0) return null;
  return round2(tablePrice / seated);
}

function buildSide(side: Side, guests: number, elders: number, cap: number, price: number): SideResult {
  const fullTables = Math.floor(guests / cap);
  const remainder = guests % cap;
  const tables = Math.ceil(guests / cap); // 0 人时为 0 桌
  const emptySeats = remainder === 0 ? 0 : cap - remainder;

  const breakdown: TableBreakdown[] = [];
  for (let i = 1; i <= tables; i++) {
    const seated = i <= fullTables ? cap : remainder;
    const empty = cap - seated;
    const full = seated === cap;
    breakdown.push({
      side,
      index: i,
      seated,
      empty,
      full,
      perPersonCost: full ? perPerson(price, cap) : perPerson(price, seated),
      derivation: full
        ? `第 ${i} 桌坐满：${cap} 人 ÷ 每桌 ${cap} 位 = 满桌${price > 0 ? `；人均 ${price} ÷ ${cap} = ${round2(price / cap)} 元` : ''}`
        : `第 ${i} 桌是零头桌：${guests} 人前面坐满 ${fullTables} 桌后剩 ${remainder} 人，坐 ${seated} 人、空 ${empty} 位${price > 0 ? `；人均 ${price} ÷ ${seated} = ${round2(price / seated)} 元` : ''}`,
    });
  }

  return {
    side,
    guests,
    elders,
    fullTables,
    remainder,
    tables,
    emptySeats,
    breakdown,
    derivation:
      guests === 0
        ? `${SIDE_NAME[side]} 0 人，不摆桌。`
        : remainder === 0
          ? `${SIDE_NAME[side]}：${guests} 人 ÷ 每桌 ${cap} 位 = ${fullTables} 桌（正好坐满，无零头桌）。`
          : `${SIDE_NAME[side]}：${guests} 人 ÷ 每桌 ${cap} 位 = ${fullTables} 桌 … ${remainder} 人，余下 ${remainder} 人也要单独开 1 桌，共 ${fullTables} + 1 = ${tables} 桌，零头桌空 ${emptySeats} 位。`,
  };
}

/** 基线方案的桌清单 */
function baselineTables(r: SideResult, cap: number, price: number): ScenarioTable[] {
  return r.breakdown.map((t) => ({
    label: `${SIDE_NAME[r.side]}第 ${t.index} 桌`,
    side: r.side,
    seated: t.seated,
    empty: t.empty,
    perPersonCost: t.full ? perPerson(price, cap) : perPerson(price, t.seated),
    note: t.full ? '满桌' : `不满桌（坐 ${t.seated} 人，空 ${cap - t.seated} 位）`,
  }));
}

/**
 * 少摆一桌：两家总桌数 - 1。
 * 数学事实（按家各自铺开时）：总人数 N = 满桌数*cap + r1 + r2，
 * 减一桌后座位 = (T-1)*cap，缺口 = max(0, r1+r2-cap)（只有一家有余数时另一家 r 视为 0）。
 * 所以「坐得下」当且仅当两家零头之和 ≤ cap，恰好等价于两张零头桌可以拼成一桌，
 * 不存在「容量够却必须拆满桌」的情况。
 */
function buildFewerScenario(
  sides: Record<Side, SideResult>,
  cap: number,
  price: number,
  totalTables: number,
  totalGuests: number,
): Scenario {
  const tables = totalTables - 1;
  const totalCapacity = tables * cap;
  const totalEmpty = totalCapacity - totalGuests;
  const shortage = Math.max(0, totalGuests - totalCapacity);

  const rg = sides.groom.remainder;
  const rb = sides.bride.remainder;
  const remainderSum = rg + rb;

  const base: ScenarioTable[] = [];
  (['groom', 'bride'] as Side[]).forEach((s) => base.push(...baselineTables(sides[s], cap, price)));

  if (totalTables === 0) {
    return {
      kind: 'fewer',
      tables: 0,
      totalCapacity: 0,
      totalSeated: totalGuests,
      totalEmpty: 0,
      feasible: false,
      shortage: 0,
      addedEmptyTables: 0,
      tableList: base,
      summary: `两家一共 0 人、本来就不摆桌，没有桌可以少。`,
      derivation: `基线桌数 = 0（男方 0 桌 + 女方 0 桌），0 − 1 无意义。由「两家总人数 ${totalGuests}」推出。`,
    };
  }

  if (shortage > 0) {
    let detail: string;
    if (rg > 0 && rb > 0) {
      detail = `两张零头桌分别是男方 ${rg} 人、女方 ${rb} 人，${rg} + ${rb} = ${remainderSum} > ${cap}，也拼不成一桌。`;
    } else if (rg > 0 || rb > 0) {
      const side = rg > 0 ? '男方' : '女方';
      const r = Math.max(rg, rb);
      detail = `只有${side}一张零头桌（${r} 人），少开一桌后这 ${r} 人无处可去（没人能和他们拼桌）。`;
    } else {
      detail = `两家所有桌都正好坐满，少一桌就有整整 ${cap} 人站着。`;
    }
    return {
      kind: 'fewer',
      tables,
      totalCapacity,
      totalSeated: totalGuests,
      totalEmpty: Math.max(0, totalEmpty),
      feasible: false,
      shortage,
      addedEmptyTables: 0,
      tableList: base,
      summary: `少摆一桌（${totalTables} − 1 = ${tables} 桌）只能放 ${totalCapacity} 个座位，${totalGuests} 人坐不下，还差 ${shortage} 个座位。${detail}`,
      derivation: `座位 = ${tables} 桌 × ${cap} 位 = ${totalCapacity} 位；缺口 = ${totalGuests} − ${totalCapacity} = ${shortage} 位（等于零头之和 ${remainderSum} − ${cap}）。由「桌数 ${totalTables} 减 1」「总人数 ${totalGuests}」「两家零头 ${rg}、${rb}」推出。`,
    };
  }

  // 坐得下：两家都有零头且 rg + rb <= cap，零头桌合并成一桌，正好省下一桌
  const tableList: ScenarioTable[] = [];
  (['groom', 'bride'] as Side[]).forEach((s) => {
    const r = sides[s];
    for (let i = 1; i <= r.fullTables; i++) {
      tableList.push({
        label: `${SIDE_NAME[s]}第 ${i} 桌`,
        side: s,
        seated: cap,
        empty: 0,
        perPersonCost: perPerson(price, cap),
        note: '满桌',
      });
    }
  });
  const seated = rg + rb;
  tableList.push({
    label: `两家拼桌（男方 ${rg} 人 + 女方 ${rb} 人）`,
    side: null,
    seated,
    empty: cap - seated,
    perPersonCost: perPerson(price, seated),
    note: `不满桌（拼桌坐 ${seated} 人，空 ${cap - seated} 位）`,
  });

  return {
    kind: 'fewer',
    tables,
    totalCapacity,
    totalSeated: totalGuests,
    totalEmpty,
    feasible: true,
    shortage: 0,
    addedEmptyTables: 0,
    tableList,
    summary: `少摆一桌可以坐下，还空 ${totalEmpty} 位：把男方零头 ${rg} 人和女方零头 ${rb} 人拼成 1 桌（${rg} + ${rb} = ${seated} ≤ ${cap}），两家各少出一张零头桌，总共省下 1 桌${price > 0 ? `、少花 ${price} 元` : ''}。代价是男女两家混坐一桌。`,
    derivation: `桌数 = ${totalTables} − 1 = ${tables}；座位 = ${tables} × ${cap} = ${totalCapacity} ≥ 人数 ${totalGuests}（空位 ${totalEmpty}）；零头合并 ${rg} + ${rb} = ${seated} ≤ ${cap}，故两张零头桌并一张，正好省 1 桌。由「两家余数 ${rg}、${rb}」与「每桌 ${cap} 位」推出。`,
  };
}

/**
 * 多摆一桌：总桌数 + 1，多出一桌空桌（仍按整桌计价）。
 */
function buildExtraScenario(
  sides: Record<Side, SideResult>,
  cap: number,
  price: number,
  totalTables: number,
  totalGuests: number,
): Scenario {
  const tables = totalTables + 1;
  const totalCapacity = tables * cap;
  const totalEmpty = totalCapacity - totalGuests;

  const tableList: ScenarioTable[] = [];
  (['groom', 'bride'] as Side[]).forEach((s) => tableList.push(...baselineTables(sides[s], cap, price)));
  tableList.push({
    label: '新增空桌',
    side: null,
    seated: 0,
    empty: cap,
    perPersonCost: null,
    note: `空桌（0 人，${cap} 个位置全空，仍按整桌收费）`,
  });

  const priceNote = price > 0 ? `多花 1 桌酒席钱 ${price} 元；` : '';
  return {
    kind: 'extra',
    tables,
    totalCapacity,
    totalSeated: totalGuests,
    totalEmpty,
    feasible: true,
    shortage: 0,
    addedEmptyTables: 1,
    tableList,
    summary: `多摆一桌 = ${tables} 桌，新增的一桌没人坐（${cap} 个位置全空），${priceNote}可作为临时加人/备用桌。`,
    derivation: `桌数 = ${totalTables} + 1 = ${tables}；座位 = ${tables} × ${cap} = ${totalCapacity}；空位 = ${totalCapacity} − ${totalGuests} = ${totalEmpty}，其中新增桌独占 ${cap} 个空位。由「基线桌数 ${totalTables}」与「每桌 ${cap} 位」推出。`,
  };
}

export function calcTables(input: TableCalcInput): TableCalcResult | CalcError {
  const errors = validateInput(input);
  if (errors.length > 0) return { errors };

  const cap = input.seatsPerTable;
  const price = input.tablePrice && input.tablePrice > 0 ? input.tablePrice : 0;
  const threshold = input.elderRatioThreshold ?? 1 / 3;

  const groom = buildSide('groom', input.groom.guests, input.groom.elders, cap, price);
  const bride = buildSide('bride', input.bride.guests, input.bride.elders, cap, price);
  const sides = { groom, bride };

  const totalGuests = groom.guests + bride.guests;
  const totalElders = groom.elders + bride.elders;
  const totalTables = groom.tables + bride.tables;
  const totalCapacity = totalTables * cap;
  const totalEmptySeats = groom.emptySeats + bride.emptySeats;
  const fullTableCount = groom.fullTables + bride.fullTables;
  const partialTableCount = totalTables - fullTableCount;
  const partialTables = [...groom.breakdown, ...bride.breakdown].filter((t) => !t.full);

  // 长辈偏多提醒：
  // 规则一：该家长辈占该家宾客比例超过阈值（默认 1/3）
  // 规则二：该家长辈人数超过一桌（cap 人），一桌主桌坐不下，必然要拆到别的桌
  const elderWarnings: ElderWarning[] = [];
  (['groom', 'bride'] as Side[]).forEach((side) => {
    const { guests, elders } = sides[side];
    if (guests === 0 || elders === 0) return;
    const ratio = elders / guests;
    const overRatio = ratio > threshold;
    const overOneTable = elders > cap;
    if (overRatio || overOneTable) {
      const reasons: string[] = [];
      if (overRatio) reasons.push(`长辈占比 ${round2(ratio * 100)}% 超过提醒线 ${round2(threshold * 100)}%`);
      if (overOneTable) reasons.push(`长辈 ${elders} 人已超过一整桌（${cap} 人），一张长辈桌坐不下`);
      elderWarnings.push({
        side,
        elders,
        guests,
        ratio: round2(ratio),
        threshold,
        message: `${SIDE_NAME[side]}长辈 ${elders} 人明显偏多（${reasons.join('；')}）。请确认：这些长辈是不是要被拆到别的桌去坐？按「坐满为止」的顺序自动铺开时，长辈会散落在多张桌里（平均每桌约 ${(elders / sides[side].tables).toFixed(1)} 位长辈），第 1 桌装不下的长辈会坐到后面的桌；如果想让长辈集中，需要单独设长辈桌/主桌再手工调整。`,
        derivation: `占比 = ${elders} ÷ ${guests} = ${(ratio * 100).toFixed(1)}%（提醒线 ${(threshold * 100).toFixed(1)}%，由「长辈 ${elders} 人、该家总人数 ${guests} 人」推出）；长辈桌容量 = 1 × ${cap} = ${cap} 人，比较 ${elders} 与 ${cap}（由「每桌 ${cap} 位」推出）；每桌平均长辈 = ${elders} ÷ ${sides[side].tables} 桌 = ${(elders / sides[side].tables).toFixed(1)} 人。`,
      });
    }
  });

  // 场地容量核对
  const v = input.venueCapacity ?? null;
  let venueCheck: VenueCheck;
  if (v === null || v <= 0) {
    venueCheck = {
      provided: false,
      venueCapacity: null,
      tablesNeeded: totalTables,
      ok: true,
      shortageTables: 0,
      message: `未填写场地桌数，未做容量比对。本次测算需要 ${totalTables} 桌，建议向酒店确认场地至少能摆 ${totalTables} 桌（另留通道/备桌空间）。`,
      derivation: `需要桌数 = 男方 ${groom.tables} 桌 + 女方 ${bride.tables} 桌 = ${totalTables} 桌。由「两家各自 ceil(人数 ÷ ${cap})」推出。`,
    };
  } else if (totalTables <= v) {
    venueCheck = {
      provided: true,
      venueCapacity: v,
      tablesNeeded: totalTables,
      ok: true,
      shortageTables: 0,
      message: `场地可摆 ${v} 桌，本次需要 ${totalTables} 桌，放得下，还剩 ${v - totalTables} 桌的富余（可作备用桌/通道）。`,
      derivation: `富余 = ${v} − ${totalTables} = ${v - totalTables} 桌。由「场地容量 ${v}」与「需要桌数 ${totalTables}」推出。`,
    };
  } else {
    venueCheck = {
      provided: true,
      venueCapacity: v,
      tablesNeeded: totalTables,
      ok: false,
      shortageTables: totalTables - v,
      message: `场地只能摆 ${v} 桌，本次需要 ${totalTables} 桌，超出容量，还差 ${totalTables - v} 张桌的位置。建议：换更大厅 / 每桌加位（改为每桌 ${Math.ceil(totalGuests / v)} 位可塞下，但会拥挤）/ 削减人数。`,
      derivation: `超出 = ${totalTables} − ${v} = ${totalTables - v} 桌；若加位，需每桌 ⌈${totalGuests} ÷ ${v}⌉ = ${Math.ceil(totalGuests / v)} 位。由「需要 ${totalTables} 桌、场地 ${v} 桌、总人数 ${totalGuests}」推出。`,
    };
  }

  return {
    totalGuests,
    totalElders,
    seatsPerTable: cap,
    totalTables,
    totalCapacity,
    totalEmptySeats,
    fullTableCount,
    partialTableCount,
    partialTables,
    sides,
    scenarioFewer: buildFewerScenario(sides, cap, price, totalTables, totalGuests),
    scenarioExtra: buildExtraScenario(sides, cap, price, totalTables, totalGuests),
    elderWarnings,
    venueCheck,
  };
}

export function isCalcError(r: TableCalcResult | CalcError): r is CalcError {
  return Object.prototype.hasOwnProperty.call(r, 'errors');
}

export const SIDE_LABEL = SIDE_NAME;
