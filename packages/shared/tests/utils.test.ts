import { describe, expect, it } from 'vitest';
import { desensitizeName, hoursBetween, maskContact, moduleLabel } from '../src/utils';
import { TICKET_TRANSITIONS, TicketStatus } from '../src/enums';
import { queryCodeSchema } from '../src/schemas';

describe('脱敏工具', () => {
  it('圈名保留首字符', () => {
    expect(desensitizeName('星野凛')).toBe('星**');
    expect(desensitizeName('A')).toBe('*');
    expect(desensitizeName('  长风万里  ')).toBe('长****');
  });

  it('联系方式保留前两位', () => {
    expect(maskContact('1234567890')).toBe('12********');
    expect(maskContact('ab')).toBe('**');
  });
});

describe('模块标签', () => {
  it('BOTH 展示为双端', () => {
    expect(moduleLabel('BOTH')).toBe('PE + PC PVP');
    expect(moduleLabel('PE')).toBe('PE PVP');
  });
});

describe('时间工具', () => {
  it('计算小时差并保留一位小数', () => {
    expect(
      hoursBetween('2026-09-18T10:00:00Z', '2026-09-18T11:30:00Z'),
    ).toBe(1.5);
    expect(
      hoursBetween('2026-09-18T10:00:00Z', '2026-09-18T09:00:00Z'),
    ).toBe(0);
  });
});

describe('查询码格式', () => {
  it('接受 8 位无歧义字符', () => {
    expect(queryCodeSchema.safeParse('A2B3C4D5').success).toBe(true);
  });

  it('拒绝易混淆字符与错误长度', () => {
    expect(queryCodeSchema.safeParse('O1I0AAAA').success).toBe(false);
    expect(queryCodeSchema.safeParse('A2B3C4D').success).toBe(false);
  });
});

describe('工单状态机', () => {
  it('已公示为终态', () => {
    expect(TICKET_TRANSITIONS[TicketStatus.Published]).toHaveLength(0);
  });

  it('合法跳转覆盖核心链路', () => {
    const chain: TicketStatus[] = [
      TicketStatus.Draft,
      TicketStatus.PendingClaim,
      TicketStatus.Reviewing,
      TicketStatus.Resulted,
      TicketStatus.Published,
    ];
    for (let i = 0; i < chain.length - 1; i++) {
      const from = chain[i]!;
      const to = chain[i + 1]!;
      expect(TICKET_TRANSITIONS[from]).toContain(to);
    }
  });

  it('非法跳转不包含在迁移表内', () => {
    // 待接单不能直接公示
    expect(TICKET_TRANSITIONS[TicketStatus.PendingClaim]).not.toContain(TicketStatus.Published);
    // 补充中不能直接出结果
    expect(TICKET_TRANSITIONS[TicketStatus.Supplementing]).not.toContain(TicketStatus.Resulted);
  });
});
