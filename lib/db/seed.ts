import { getRawDb } from "@/lib/db/client";
import { ACCOUNT_SEEDS } from "@/lib/constants/accounts";
import { ENTITY_SEEDS, LICENCE_SEED } from "@/lib/constants/entities";
import { runMigrations } from "@/lib/db/migrate";

const OBLIGATION_RULE_SEEDS = [
  {
    id: "bas_quarterly",
    label: "季度 BAS",
    appliesTo: { type: "company", gstRegistered: true },
    frequency: "quarterly",
    dueCalc: "bas_online_self_lodge",
    adjustmentDirection: "forward",
    requiredFields: [],
    reminderOffsets: [-30, -10, -3, 0],
    portalUrl: "https://www.ato.gov.au/online-services/businesses-and-organisations",
    checklist: ["整理本季度已确认交易", "生成 BAS 底稿", "登录 ATO Online services for business 手动填写 G1、1A、1B", "保存回执号"],
  },
  {
    id: "company_tax_return",
    label: "公司税表",
    appliesTo: { type: "company" },
    frequency: "annual",
    dueCalc: "company_tax_return",
    adjustmentDirection: "forward",
    requiredFields: [],
    reminderOffsets: [-30, -10, -3, 0],
    portalUrl: "https://www.ato.gov.au/online-services/businesses-and-organisations",
    checklist: ["生成年度损益汇总", "补充折旧、亏损、franking account 和 Div 7A", "手动在 ATO 完成公司税表"],
  },
  {
    id: "trust_tax_return",
    label: "信托税表",
    appliesTo: { type: "trust" },
    frequency: "annual",
    dueCalc: "trust_tax_return",
    adjustmentDirection: "forward",
    requiredFields: [],
    reminderOffsets: [-30, -10, -3, 0],
    portalUrl: "https://www.ato.gov.au/online-services/businesses-and-organisations",
    checklist: ["汇总信托收入", "完成分配决议草稿", "手动在 ATO 完成信托税表"],
  },
  {
    id: "individual_tax_return",
    label: "个人税表",
    appliesTo: { type: "individual" },
    frequency: "annual",
    dueCalc: "individual_tax_return",
    adjustmentDirection: "forward",
    requiredFields: [],
    reminderOffsets: [-30, -10, -3, 0],
    portalUrl: "https://my.gov.au/",
    checklist: ["汇总信托分配、分红和 franking credit", "检查可抵扣供款通知", "手动在 myTax 完成个人税表"],
  },
  {
    id: "trust_distribution_resolution",
    label: "信托分配决议",
    appliesTo: { type: "trust" },
    frequency: "annual",
    dueCalc: "before_june_30",
    adjustmentDirection: "backward",
    requiredFields: [],
    reminderOffsets: [-60, -30, -10, -3],
    portalUrl: "",
    checklist: ["确认受益人和分配额", "生成决议文本模板", "签署并留存"],
  },
  {
    id: "asic_annual_review",
    label: "ASIC 年检",
    appliesTo: { type: "company" },
    frequency: "annual",
    dueCalc: "asic_review_plus_two_months",
    adjustmentDirection: "forward",
    requiredFields: ["asic_review_date"],
    reminderOffsets: [-14, -3, 0],
    portalUrl: "https://asic.gov.au/for-business/changes-to-your-company/annual-statements/",
    checklist: ["核对公司资料", "检查 ASIC 年检费参考值", "手动在 ASIC 完成确认/付款"],
  },
  {
    id: "estate_agent_licence_annual_statement",
    label: "牌照年度声明",
    appliesTo: { licenceType: "estate_agent" },
    frequency: "annual",
    dueCalc: "licence_anniversary_minus_six_weeks",
    adjustmentDirection: "backward",
    requiredFields: ["anniversary_date"],
    reminderOffsets: [0, 7, 14, 21],
    portalUrl: "https://my.consumer.vic.gov.au",
    checklist: ["进入牌照窗口", "手动完成年度声明", "保存确认记录"],
  },
  {
    id: "super_contribution",
    label: "个人可抵扣供款到账",
    appliesTo: { type: "individual" },
    frequency: "annual",
    dueCalc: "june_30_before",
    adjustmentDirection: "backward",
    requiredFields: [],
    reminderOffsets: [-45, -30, -10, -3],
    portalUrl: "",
    checklist: ["确认供款到账", "检查 concessional cap", "保存付款记录"],
  },
  {
    id: "super_notice",
    label: "供款抵扣意向通知",
    appliesTo: { type: "individual" },
    frequency: "one_off",
    dueCalc: "after_contribution_before_tax_return",
    adjustmentDirection: "forward",
    requiredFields: [],
    reminderOffsets: [0],
    portalUrl: "",
    checklist: ["提交抵扣意向通知", "保存基金确认"],
  },
] as const;

const NEWS_SOURCE_SEEDS = [
  { name: "ATO 小企业资讯", url: "https://www.ato.gov.au/businesses-and-organisations/small-business-newsroom", fetchType: "html_listing_ato", active: true },
  { name: "ASIC 公告", url: "https://asic.gov.au/newsroom/", fetchType: "html_listing_asic" },
  { name: "Consumer Affairs Victoria 房产中介", url: "https://www.consumer.vic.gov.au/latest-news?Keyword=%7B131B3520-4AFE-4D3B-8967-E1781F982526%7D", fetchType: "html_listing_cav", active: true },
  { name: "Treasury 政策发布", url: "https://treasury.gov.au/media-release", fetchType: "html_listing_treasury", active: false },
] as const;

export function seedDatabase() {
  runMigrations();
  const db = getRawDb();
  const transaction = db.transaction(() => {
    const insertEntity = db.prepare(`
      INSERT OR IGNORE INTO entities (id, name, type, gst_registered, bas_cycle, active, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const entity of ENTITY_SEEDS) {
      insertEntity.run(
        entity.id,
        entity.name,
        entity.type,
        Number(entity.gstRegistered),
        entity.basCycle,
        Number(entity.active),
        entity.sortOrder,
      );
    }

    db.prepare(`
      INSERT INTO licences (holder, type, regulator, portal_url, lodgement_window_weeks)
      SELECT ?, ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM licences WHERE holder = ? AND type = ?)
    `).run(
      LICENCE_SEED.holder,
      LICENCE_SEED.type,
      LICENCE_SEED.regulator,
      LICENCE_SEED.portalUrl,
      LICENCE_SEED.lodgementWindowWeeks,
      LICENCE_SEED.holder,
      LICENCE_SEED.type,
    );

    const insertAccount = db.prepare(`
      INSERT OR IGNORE INTO accounts (entity_id, code, name, type, default_gst_code, archived)
      VALUES (?, ?, ?, ?, ?, 0)
    `);
    for (const entity of ENTITY_SEEDS) {
      for (const account of ACCOUNT_SEEDS) {
        insertAccount.run(entity.id, account.code, account.name, account.type, account.defaultGstCode);
      }
    }

    const insertRule = db.prepare(`
      INSERT INTO obligation_rules
        (id, label, applies_to, frequency, due_calc, adjustment_direction, required_fields, reminder_offsets, portal_url, checklist)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        adjustment_direction = excluded.adjustment_direction,
        required_fields = excluded.required_fields
    `);
    for (const rule of OBLIGATION_RULE_SEEDS) {
      insertRule.run(
        rule.id,
        rule.label,
        JSON.stringify(rule.appliesTo),
        rule.frequency,
        rule.dueCalc,
        rule.adjustmentDirection,
        JSON.stringify(rule.requiredFields),
        JSON.stringify(rule.reminderOffsets),
        rule.portalUrl,
        JSON.stringify(rule.checklist),
      );
    }

    const updateSource = db.prepare("UPDATE news_sources SET url = ?, fetch_type = ?, active = ?, last_fetched_at = NULL, last_error = NULL, updated_at = datetime('now') WHERE name = ?");
    const insertSource = db.prepare(`
      INSERT INTO news_sources (name, url, fetch_type, active)
      SELECT ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM news_sources WHERE name = ?)
    `);
    for (const source of NEWS_SOURCE_SEEDS) {
      const active = "active" in source ? Number(source.active) : 1;
      updateSource.run(source.url, source.fetchType, active, source.name);
      insertSource.run(source.name, source.url, source.fetchType, active, source.name);
    }

    const insertSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
    insertSetting.run("timezone", "Australia/Melbourne");
    insertSetting.run("fy_start", "2026-07-01");
    insertSetting.run("concessional_cap_cents", "3250000");
    insertSetting.run("ai_enabled", "false");
    insertSetting.run("news_window_days", "90");
    insertSetting.run("news_exclude_irrelevant_topics", "true");
  });
  transaction();
}

if (process.argv[1]?.endsWith("lib/db/seed.ts")) {
  seedDatabase();
}
