// 桌数测算器：给定两家人数与每桌座位，铺开桌数、尾桌、人均、±1 桌推演、长辈提醒、场地核对。
// 每个结论都带 trace，说明是由哪几个数推出来的。

export type SideKey = 'groom' | 'bride';

export interface NamedGuest {
  id: string;
  isElder: boolean;
}

export interface PlannerInput {
  capacity: number;        // 每桌坐几位
  groomCount: number;      // 男方总人数
  brideCount: number;      // 女方总人数
  groomElders: number;     // 男方长辈人数
  brideElders: number;     // 女方长辈人数
  venueTables: number;     // 场地最多能容纳多少桌
  tableCost: number;       // 每桌菜钱（元），用于算尾桌人均那份
  namedGuests?: Partial<Record<SideKey, NamedGuest[]>>; // 有名有姓时用于每桌坐谁
}

export interface PlannedSeat {
  guestId: string | null;  // 有名有姓时对应宾客 id，否则为空
  label: string;           // 占位名：长辈 / 宾客
  isElder: boolean;
}

export interface FamilyTableInfo {
  familyIndex: number;     // 该家内部第几桌（从 1 起）
  side: SideKey;
  sideName: string;
  seats: PlannedSeat[];
  seated: number;
  empty: number;
  full: boolean;
  elderCount: number;
  perPerson: number | null; // 不满桌的人均菜钱，满桌为 null
  trace: string;
}

export interface FamilyPlan {
  side: SideKey;
  sideName: string;
  count: number;
  elders: number;
  fullTables: number;
  remainder: number;
  tableCount: number;
  partialTable: FamilyTableInfo | null;
  tables: FamilyTableInfo[];
  trace: string;
}

export interface ScenarioResult {
  feasible: boolean;
  tables: number;           // 推演桌数
  seatsTotal: number;       // 这些桌的总座位
  empty: number;            // 空座位
  overflow: number;         // 坐不下的人数（feasible=false 时 > 0）
  costTotal: number | null; // 总菜钱
  // 坐不满的桌（人均那份不等于桌均的桌）
  partialTables: { sideName: string; seated: number; empty: number; perPerson: number }[];
  trace: string;
}

export interface PlannerResult {
  totalPeople: number;
  totalTables: number;
  totalEmpty: number;
  totalCost: number;
  families: Record<SideKey, FamilyPlan>;
  elderWarnings: string[];
  venue: {
    capacity: number;
    needed: number;
    fits: boolean;
    shortage: number;
    trace: string;
  };
  minusOne: ScenarioResult;
  plusOne: ScenarioResult;
  trace: string;
}

export const SIDE_NAME: Record<SideKey, string> = { groom: '男方', bride: '女方' };

export function formatYuan(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

// 整数除法：向上取整
function ceilDiv(a: number, b: number): number {
  return Math.ceil(a / b);
}

interface FamilyArgs {
  side: SideKey;
  count: number;
  elders: number;
  capacity: number;
  tableCost: number;
  named: { id: string; isElder: boolean }[];
}

// 按一家的人数铺开：先摆若干满桌，余数再开一桌。
function planFamily({ side, count, elders, capacity, tableCost, named }: FamilyArgs): FamilyPlan {
  const sideName = SIDE_NAME[side];
  const fullTables = Math.floor(count / capacity);
  const remainder = count % capacity;
  const tableCount = ceilDiv(count, capacity);

  // 有名有姓时：长辈排前面先坐主桌，其余随后
  const orderedNamed = [...named].sort((a, b) => Number(b.isElder) - Number(a.isElder));
  let nameCursor = 0;

  const nextSeat = (isElder: boolean): PlannedSeat => {
    const g = orderedNamed[nameCursor++];
    return {
      guestId: g ? g.id : null,
      label: g ? '' : isElder ? '长辈' : '宾客',
      isElder,
    };
  };

  const tables: FamilyTableInfo[] = [];
  let eldersLeft = Math.max(0, Math.min(elders, count));

  for (let i = 0; i < tableCount; i++) {
    const isLast = i === tableCount - 1;
    const seated = isLast && remainder > 0 ? remainder : Math.min(capacity, count - i * capacity);
    const seats: PlannedSeat[] = [];
    let elderInTable = 0;
    for (let s = 0; s < seated; s++) {
      // 长辈优先坐靠前的桌（主桌），一桌放不下再顺延
      const isElder = eldersLeft > 0;
      if (isElder) {
        eldersLeft--;
        elderInTable++;
      }
      seats.push(nextSeat(isElder));
    }
    // 空位补 null，方便画布直接铺座位格
    const empty = capacity - seated;
    const full = empty === 0;
    const perPerson = full ? null : tableCost / seated;
    tables.push({
      familyIndex: i + 1,
      side,
      sideName,
      seats,
      seated,
      empty,
      full,
      elderCount: elderInTable,
      perPerson,
      trace: full
        ? `${sideName}第 ${i + 1} 桌：满桌 ${seated}/${capacity} 人（座位 ${capacity}）`
        : `${sideName}第 ${i + 1} 桌（尾桌）：坐 ${seated} 人，空 ${empty} 个座位；` +
          `人均那份 = 桌钱 ${tableCost} ÷ ${seated} = ${formatYuan(perPerson!)} 元`,
    });
  }

  const partialTable = tables.find((t) => !t.full) || null;

  return {
    side,
    sideName,
    count,
    elders,
    fullTables,
    remainder,
    tableCount,
    partialTable,
    tables,
    trace:
      `${sideName} ${count} 人，每桌 ${capacity} 人：${count} ÷ ${capacity} = ` +
      `${fullTables} 桌满桌余 ${remainder} 人` +
      (remainder > 0 ? `，余数 ${remainder} 人另开 1 桌，共 ${tableCount} 桌` : `，正好 ${tableCount} 桌，没有尾桌`),
  };
}

// 推演 ±1 桌：
// 少一桌 = 撤掉一张桌，两家尾桌尽量合并成一桌，合并不下就坐不下；
// 多一桌 = 原座位不动，多出整张空桌（白付一桌菜钱）。
function evaluateScenario(delta: -1 | 1, input: PlannerInput, families: Record<SideKey, FamilyPlan>): ScenarioResult {
  const { capacity, tableCost } = input;
  const totalPeople = input.groomCount + input.brideCount;
  const baseTables = families.groom.tableCount + families.bride.tableCount;
  const tables = baseTables + delta;

  if (tables <= 0) {
    return {
      feasible: false,
      tables: 0,
      seatsTotal: 0,
      empty: 0,
      overflow: totalPeople,
      costTotal: null,
      partialTables: [],
      trace: `少摆一桌后一桌都不剩，${totalPeople} 人无处可坐`,
    };
  }

  const seatsTotal = tables * capacity;
  const overflow = Math.max(0, totalPeople - seatsTotal);
  const empty = Math.max(0, seatsTotal - totalPeople);
  const feasible = overflow === 0;
  const partialTables: ScenarioResult['partialTables'] = [];
  let trace = '';

  if (delta === -1) {
    if (!feasible) {
      trace = `撤掉 1 桌后只剩 ${tables} 桌 × ${capacity} 座 = ${seatsTotal} 座，` +
        `${totalPeople} 人坐不下，还剩 ${overflow} 人没位置（${totalPeople} − ${seatsTotal} = ${overflow}）`;
    } else {
      // 能撤：两家尾桌合并成一桌
      const remG = families.groom.remainder;
      const remB = families.bride.remainder;
      const merged = remG + remB;
      if (merged > 0) {
        partialTables.push({
          sideName: '男+女尾桌合并',
          seated: merged,
          empty: capacity - merged,
          perPerson: tableCost / merged,
        });
      }
      trace = `撤掉 1 桌：男方尾桌 ${remG} 人 + 女方尾桌 ${remB} 人 = ${merged} 人挤 1 桌` +
        (merged > 0 ? `（≤ ${capacity}，坐得下，空 ${capacity - merged} 座）；该桌人均 = ${tableCost} ÷ ${merged} = ${formatYuan(tableCost / merged)} 元；` : '；') +
        `共 ${tables} 桌，总菜钱 ${tables} × ${tableCost} = ${tables * tableCost} 元（比原来省 ${tableCost} 元）`;
    }
  } else {
    // 多一桌：原桌不动，多一整张空桌
    (['groom', 'bride'] as SideKey[]).forEach((key) => {
      const f = families[key];
      if (f.partialTable && f.partialTable.perPerson !== null) {
        partialTables.push({
          sideName: f.sideName,
          seated: f.partialTable.seated,
          empty: f.partialTable.empty,
          perPerson: f.partialTable.perPerson,
        });
      }
    });
    trace = `加 1 桌：原来的 ${baseTables} 桌照样坐人，新增 1 张全空桌` +
      `（${tables} 桌 × ${capacity} 座 = ${seatsTotal} 座，只用 ${totalPeople} 座，空 ${empty} 座）；` +
      `空桌也要付菜钱，总菜钱 ${tables} × ${tableCost} = ${tables * tableCost} 元（比原来多花 ${tableCost} 元）；` +
      `各家尾桌人均不变`;
  }

  return {
    feasible,
    tables,
    seatsTotal,
    empty,
    overflow,
    costTotal: feasible ? tables * tableCost : null,
    partialTables,
    trace,
  };
}

export function planTables(input: PlannerInput): PlannerResult {
  const capacity = Math.max(1, Math.floor(input.capacity));
  const groomCount = Math.max(0, Math.floor(input.groomCount));
  const brideCount = Math.max(0, Math.floor(input.brideCount));
  const groomElders = Math.max(0, Math.min(Math.floor(input.groomElders), groomCount));
  const brideElders = Math.max(0, Math.min(Math.floor(input.brideElders), brideCount));
  const venueTables = Math.max(0, Math.floor(input.venueTables));
  const tableCost = Math.max(0, input.tableCost);

  // 有名有姓的宾客：用现有宾客池（标签区分男方/女方/长辈），测算器同时支持纯人数模式
  const families = {
    groom: planFamily({ side: 'groom', count: groomCount, elders: groomElders, capacity, tableCost, named: input.namedGuests?.groom || [] }),
    bride: planFamily({ side: 'bride', count: brideCount, elders: brideElders, capacity, tableCost, named: input.namedGuests?.bride || [] }),
  };

  const totalPeople = groomCount + brideCount;
  const totalTables = families.groom.tableCount + families.bride.tableCount;
  const totalEmpty = families.groom.tables.reduce((s, t) => s + t.empty, 0) +
    families.bride.tables.reduce((s, t) => s + t.empty, 0);
  const totalCost = totalTables * tableCost;

  // —— 长辈提醒 ——
  const elderWarnings: string[] = [];
  (['groom', 'bride'] as SideKey[]).forEach((key) => {
    const f = families[key];
    if (f.elders > capacity) {
      elderWarnings.push(
        `${f.sideName}长辈 ${f.elders} 人，已经超过一桌 ${capacity} 人，` +
        `长辈必然被拆到至少 ${ceilDiv(f.elders, capacity)} 张桌，请确认是不是有意把长辈拆到别的桌（一般长辈应集中在主桌）。`
      );
    } else if (f.tableCount > 1 && f.elders > 0) {
      // 长辈不足一桌也提醒：铺开时长辈集中在第 1 桌，确认没有被拆
      elderWarnings.push(
        `${f.sideName}长辈 ${f.elders} 人，按铺开结果已集中在${f.sideName}第 1 桌；` +
        `若现场发现长辈分散在多桌，请检查是不是被误拆到别的桌。`
      );
    }
  });
  // 两家长辈明显偏多（一家比另一家多出一整桌还多）
  const diff = Math.abs(groomElders - brideElders);
  if (groomElders > 0 && brideElders > 0 && diff > capacity) {
    const more = groomElders > brideElders ? '男方' : '女方';
    const less = more === '男方' ? '女方' : '男方';
    elderWarnings.push(
      `${more}长辈 ${Math.max(groomElders, brideElders)} 人比${less} ${Math.min(groomElders, brideElders)} 人多出 ${diff} 人` +
      `（超过一桌 ${capacity} 人），明显偏多：请核对是不是把${less}的长辈算漏了，或把本属${less}的长辈拆记到了${more}名下。`
    );
  }

  // —— 场地桌数核对 ——
  const shortage = Math.max(0, totalTables - venueTables);
  const venue = {
    capacity: venueTables,
    needed: totalTables,
    fits: totalTables <= venueTables,
    shortage,
    trace: totalTables <= venueTables
      ? `需要 ${totalTables} 桌 ≤ 场地 ${venueTables} 桌，放得下，还富余 ${venueTables - totalTables} 桌的空间`
      : `需要 ${totalTables} 桌 ＞ 场地 ${venueTables} 桌，放不下，还差 ${shortage} 张桌（${totalTables} − ${venueTables} = ${shortage}）`,
  };

  const norm = { ...input, capacity, groomCount, brideCount, groomElders, brideElders, venueTables, tableCost };
  const minusOne = evaluateScenario(-1, norm, families);
  const plusOne = evaluateScenario(1, norm, families);

  return {
    totalPeople,
    totalTables,
    totalEmpty,
    totalCost,
    families,
    elderWarnings,
    venue,
    minusOne,
    plusOne,
    trace: `总人数 = 男方 ${groomCount} + 女方 ${brideCount} = ${totalPeople} 人；` +
      `总桌数 = 男方 ${families.groom.tableCount} + 女方 ${families.bride.tableCount} = ${totalTables} 桌；` +
      `总座位 ${totalTables * capacity}，空 ${totalEmpty} 座；总菜钱 ${totalTables} × ${tableCost} = ${totalCost} 元`,
  };
}

// 从现有宾客池按标签统计两家人数与长辈人数（供输入框一键带入）
export function summarizeGuests(guests: { tags: string[] }[]): {
  groomCount: number; brideCount: number; groomElders: number; brideElders: number;
} {
  let groomCount = 0, brideCount = 0, groomElders = 0, brideElders = 0;
  for (const g of guests) {
    const isGroom = g.tags.includes('男方亲属');
    const isBride = g.tags.includes('女方亲属');
    const isElder = g.tags.includes('长辈');
    if (isGroom) {
      groomCount++;
      if (isElder) groomElders++;
    }
    if (isBride) {
      brideCount++;
      if (isElder) brideElders++;
    }
  }
  return { groomCount, brideCount, groomElders, brideElders };
}
