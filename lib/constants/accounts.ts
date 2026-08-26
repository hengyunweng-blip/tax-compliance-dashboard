export const ACCOUNT_SEEDS = [
  { code: "100", name: "银行账户", type: "asset", defaultGstCode: "NO_GST" },
  { code: "400", name: "地产销售佣金收入", type: "income", defaultGstCode: "GST_INCOME" },
  { code: "410", name: "学生租房服务费收入", type: "income", defaultGstCode: "GST_INCOME" },
  { code: "500", name: "运营费用", type: "expense", defaultGstCode: "GST_EXPENSE" },
  { code: "510", name: "资本采购", type: "asset", defaultGstCode: "GST_CAPITAL" },
  { code: "600", name: "私人用途", type: "expense", defaultGstCode: "PRIVATE" },
] as const;
