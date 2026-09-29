// 創新應用補助 TA 簽到單的檢查規則：共通規則沿用 signin-checker 的 rules.js，這裡補上本專案特有的比對
import { checkTimesheet } from "./rules.js";

export const PROFILE = {
  planName: "A82 發展雲端知識體系計畫",
  planNumber: "115609782",
  unit: "數位教育發展處數位課程發展組",
  hourlyRate: 196,
  // 週六日不排工作；平日的國定假日與學校公告休假日（人事行政總處 115 年辦公日曆表、中原大學 115 學年度行事曆）
  allowedWeekdays: [1, 2, 3, 4, 5],
  earliestStart: "",
  latestEnd: "",
  blockedDates: ["2026-09-25", "2026-09-28", "2026-10-09", "2026-10-26", "2026-12-24", "2026-12-25", "2027-01-01"],
  location: {
    schoolOnly: true,
    requireRoom: false,
    requiredKeywords: [],
    forbiddenKeywords: ["家裡", "家中", "住家", "宿舍", "咖啡", "麥當勞", "星巴克"],
    sampleValues: ["(填校內)", "（填校內）"]
  },
  allowedWorkContents: []
};


function issue(code, severity, message, entryIds, field) {
  return { code, severity, message, ...(entryIds ? { entryIds } : {}), ...(field ? { field } : {}) };
}

function minutes(value) {
  const m = /^(\d{2}):(\d{2})$/.exec(value ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function weekKey(iso) {
  const d = new Date(`${iso}T00:00:00`);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${monday.getMonth() + 1}/${monday.getDate()} 那一週`;
}

export const ROLES = {
  TA: { label: "助教工讀生 TA", rate: 196, totalHours: 30 },
  RA: { label: "研究助理 RA", rate: 200, totalHours: 50 }
};

export function checkInnovation(sheet, options = {}) {
  const role = options.role === "RA" ? "RA" : "TA";
  const isTA = role === "TA";
  const rate = ROLES[role].rate;
  const samples = sheet.entries.filter((e) => e.isSample);
  const entries = sheet.entries.filter((e) => !e.isSample);
  const base = checkTimesheet({ ...sheet, entries }, { ...PROFILE, hourlyRate: rate });
  const issues = base.issues.filter((i) => !["LOCATION_CONFIRM", "WORK_CONTENT_CONFIRM"].includes(i.code));
  for (const i of issues) {
    if (i.code === "ENTRIES_UNREADABLE") i.message = "沒有讀到任何工作紀錄。請確認表格裡已填工作日期與起迄時間。";
    if (i.code === "BLOCKED_DATE") i.message = "這一天是國定假日或學校公告的休假日，不能排工作。";
    if (i.code === "WEEKDAY_NOT_ALLOWED") i.message = "這一天是週六或週日，不能排工作。";
  }
  const extra = [];

  if (samples.length) {
    extra.push(issue("SAMPLE_ROW", "error", "表單上的範例列（9/1、9:00–12:00）還在，請刪除或改成實際資料。", samples.map((e) => e.id), "date"));
  }
  if (sheet.outsider) {
    extra.push(issue("OUTSIDER", "error", "勾選了「校外人士」。外校生或已畢業的學生不能用本補助款支領工讀金。"));
  }
  if (!sheet.period.written) {
    extra.push(issue("MONTH_MISSING", "error", "表頭「115年　月」的月份沒有填。"));
  } else {
    const other = entries.filter((e) => e.date && Number(e.date.slice(5, 7)) !== sheet.period.month);
    if (other.length) extra.push(issue("MONTH_MISMATCH", "error", `有工作日期不在表頭的 ${sheet.period.month} 月。每個月要分開填一張簽到單。`, other.map((e) => e.id), "date"));
  }

  if (isTA && options.insuredFrom) {
    const early = entries.filter((e) => e.date && e.date < options.insuredFrom);
    if (early.length) extra.push(issue("BEFORE_INSURANCE", "error", `有工作日期早於保險生效日（${options.insuredFrom.slice(5).replace("-", "/")}）。保險生效前不能開始工作。`, early.map((e) => e.id), "date"));
  }

  const foreign = sheet.foreign || options.foreign;
  if (isTA && foreign) {
    const weeks = new Map();
    for (const e of entries) {
      const s = minutes(e.start), t = minutes(e.end);
      if (!e.date || s === null || t === null || t <= s) continue;
      const k = weekKey(e.date);
      weeks.set(k, [(weeks.get(k)?.[0] ?? 0) + (t - s), [...(weeks.get(k)?.[1] ?? []), e.id]]);
    }
    for (const [k, [m, ids]] of weeks) {
      if (m > 20 * 60) extra.push(issue("FOREIGN_WEEKLY", "error", `外籍生每週最多 20 小時，${k}合計 ${Math.round(m / 6) / 10} 小時。`, ids, "date"));
    }
  }

  // 網頁只寫「正常工作時間」，簽到單檢查才抓 7:00 前、20:00 後
  const offHours = entries.filter((e) => {
    const s = minutes(e.start), t = minutes(e.end);
    return s !== null && t !== null && (s < 7 * 60 || t > 20 * 60);
  });
  if (offHours.length) extra.push(issue("OFF_HOURS", "error", "有工作時間在早上 7 點以前或晚上 8 點以後，請改到正常工作時間。", offHours.map((e) => e.id), "time"));

  const total = base.calculated.totalHours;
  const cap = ROLES[role].totalHours;
  if (entries.length && total > cap) {
    extra.push(issue("MONTH_OVER_CAP", "error", `本月合計 ${total} 小時，超過${isTA ? " TA 三個月總共的 30 小時（每月不能超過 30 小時）" : " RA 三個月總共的 50 小時"}。`, null, "totalHours"));
  }
  if (isTA && options.plannedHours && entries.length && Math.abs(Number(options.plannedHours) - total) > 0.001) {
    extra.push(issue("PLAN_MISMATCH", "review", `跟投保資訊表填的本月 ${options.plannedHours} 小時不同（簽到單合計 ${total} 小時），請跟老師確認。`, null, "totalHours"));
  }

  return {
    role,
    rate,
    entries,
    issues: [...extra, ...issues],
    calculated: base.calculated,
    declarations: [
      isTA
        ? { code: "NOT_RA", label: "我沒有同時擔任本專案的研究助理（RA）。" }
        : { code: "NOT_TA", label: "我是碩博士生，已簽合意書，而且沒有同時擔任本專案的助教工讀生（TA）。" },
      { code: "NOT_IN_CLASS", label: "工作時間沒有跟我自己的上課時間重疊。" },
      ...base.declarations
    ]
  };
}
