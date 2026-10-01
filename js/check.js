// 創新應用補助 TA 簽到單的檢查規則：共通規則沿用 signin-checker 的 rules.js，這裡補上本專案特有的比對
import { checkTimesheet } from "./rules.js?v=20261001m";

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
    sampleValues: ["(填校內)", "（填校內）"],
    // 中原大學校區平面圖（www.cycu.edu.tw/campus.html）與校園配置圖上的大樓名稱，加上常見簡稱；教室完整清單在 I-TOUCH 內要登入，改用「大樓＋號碼」判斷
    buildings: [
      "懷恩樓", "維澈樓", "行政大樓", "陸華樓", "真知教學大樓", "真知", "篤信大樓", "篤信", "電學大樓", "電學",
      "智信樓", "恩慈樓", "良善樓", "建築館", "建築學院", "祐生館", "設計學院", "地景建築館", "信樓", "望樓",
      "室設館", "土木館", "莊敬大樓", "莊敬", "工學館", "商設館", "資管樓", "資管大樓", "管理大樓", "自強商學大樓",
      "商學大樓", "化學館", "理學大樓", "科學館", "圖書館", "全人教育村", "全人村", "學生活動中心", "活動中心",
      "生物科技館", "生科館", "力行大樓", "力行", "喜樂樓", "忍耐樓", "和平樓", "仁愛樓", "體育館", "薄膜中心",
      "信實樓", "熱誠樓", "恩惠堂", "中正樓", "祐生建築中心", "景觀館", "知行領航館",
      // 學生常用的簡稱（例如「商設302」）
      "商設", "室設", "資管", "土木", "建築", "工學", "化學", "理學", "科學", "管理", "商學", "自強", "行政",
      "景觀", "地景", "生科", "祐生", "懷恩", "維澈", "陸華", "智信", "恩慈", "良善", "中正", "知行", "全人", "設計"
    ],
    // 這些地方沒有固定房號，寫名稱就可以
    noRoomNeeded: ["體育館"]
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

// 星期對照：用來檢查學生在日期欄寫的星期對不對
const WEEKDAY = "日一二三四五六";
export function mdw(value) {
  const d = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(value ?? "");
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY[d.getDay()]})`;
}
const md = (value) => { const d = value instanceof Date ? value : new Date(`${value}T00:00:00`); return `${d.getMonth() + 1}/${d.getDate()}`; };
export function withMonthDay(message) {
  return String(message).replaceAll(/\d{4}-\d{2}-\d{2}/g, (iso) => md(iso));
}

function weekKey(iso) {
  const d = new Date(`${iso}T00:00:00`);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${md(monday)} 那一週`;
}

export const TA_START_DATE = "2026-10-07";
export const PERIOD_MONTHS = [10, 11, 12];

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
  const issues = base.issues.filter((i) => !["LOCATION_CONFIRM", "WORK_CONTENT_CONFIRM", "SIGNATURE_CHECK", "FOOTER_SIGNATURE_CHECK"].includes(i.code));
  for (const i of issues) {
    if (i.code === "ENTRIES_UNREADABLE") i.message = "沒有讀到任何工作紀錄。請確認表格裡已填工作日期與起迄時間。";
    if (i.code === "BLOCKED_DATE") i.message = "這一天是國定假日或學校公告的休假日，不能排工作。";
    if (i.code === "WEEKDAY_NOT_ALLOWED") i.message = "這一天是週六或週日，不能排工作。";
    if (i.code === "PLAN_NAME_MISMATCH") i.message = /教資/.test(sheet.planName ?? "")
      ? `這是教資案的簽到單。創新應用補助的計畫名稱應為「${PROFILE.planName}」，請改用本頁附件 6-3 的簽到單。`
      : `計畫名稱應為「${PROFILE.planName}」。`;
    if (i.code === "PLAN_NUMBER_MISMATCH") i.message = `計畫編號應為 ${PROFILE.planNumber}。`;
    if (i.code === "UNIT_MISMATCH") i.message = `執行單位應為「${PROFILE.unit}」。`;
    if (i.code === "WEEKLY_HOURS_EXCEEDED") {
      const first = entries.filter((e) => i.entryIds?.includes(e.id) && e.date).map((e) => e.date).sort()[0];
      if (first) i.message = i.message.replace(/^\S+ 在這份文件中/, `${weekKey(first)}`);
    }
    i.message = withMonthDay(i.message);
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

  // RA、TA 都只在 10、11、12 月工作
  const outside = entries.filter((e) => e.date && !PERIOD_MONTHS.includes(Number(e.date.slice(5, 7))));
  if (outside.length) extra.push(issue("OUTSIDE_PERIOD", "error", "有工作日期不在 10–12 月。RA、TA 都只能在 10、11、12 月工作。", outside.map((e) => e.id), "date"));

  // 硬性規定（Lupin 2026-09-30）：TA 每個人都是 10/7 投保、10/7 開始工作，10/7 以前不能排
  if (isTA) {
    const tooEarly = entries.filter((e) => e.date && e.date < TA_START_DATE && !outside.includes(e));
    if (tooEarly.length) extra.push(issue("TA_START_DATE", "error", `TA 保險一律從 ${md(TA_START_DATE)} 生效，第一天工作是 ${md(TA_START_DATE)}，${md(TA_START_DATE)} 以前不能排工作。`, tooEarly.map((e) => e.id), "date"));
  }

  if (isTA && options.insuredFrom) {
    const early = entries.filter((e) => e.date && e.date < options.insuredFrom);
    if (early.length) extra.push(issue("BEFORE_INSURANCE", "error", `有工作日期早於保險生效日（${md(options.insuredFrom)}）。保險生效前不能開始工作。`, early.map((e) => e.id), "date"));
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

  // 日期欄要由學生自己寫上星期，例如 11/12(四)，承辦核對比較快
  const noWeekday = [], wrongWeekday = [];
  for (const e of entries) {
    if (!e.date) continue;
    const written = /[（(]\s*(?:星期|週|周)?\s*([一二三四五六日天])\s*[)）]/.exec(e.dateText ?? "");
    if (!written) { noWeekday.push(e); continue; }
    const actual = WEEKDAY[new Date(`${e.date}T00:00:00`).getDay()];
    if ((written[1] === "天" ? "日" : written[1]) !== actual) wrongWeekday.push([e, actual, written[1]]);
  }
  if (noWeekday.length) {
    extra.push(issue("WEEKDAY_MISSING", "error", `工作日期要寫上星期，例如「${mdw(noWeekday[0].date)}」。`, noWeekday.map((e) => e.id), "date"));
  }
  for (const [e, actual, written] of wrongWeekday) {
    extra.push(issue("WEEKDAY_WRONG", "error", `${Number(e.date.slice(5, 7))}/${Number(e.date.slice(8))} 是星期${actual}，不是星期${written}。`, [e.id], "date"));
  }

  // 網頁只寫「正常工作時間」，簽到單檢查才抓 7:00 前、20:00 後（紅）；18:00 後不建議（黃）
  const offHours = entries.filter((e) => {
    const s = minutes(e.start), t = minutes(e.end);
    return s !== null && t !== null && (s < 7 * 60 || t > 20 * 60);
  });
  if (offHours.length) extra.push(issue("OFF_HOURS", "error", "有工作時間在早上 7 點以前或晚上 8 點以後，請改到正常工作時間。", offHours.map((e) => e.id), "time"));
  const lateHours = entries.filter((e) => {
    const t = minutes(e.end);
    return !offHours.includes(e) && t !== null && t > 18 * 60;
  });
  if (lateHours.length) extra.push(issue("LATE_HOURS", "review", "工讀不建議超過晚上 6 點，請再確認是否需要排到這麼晚。", lateHours.map((e) => e.id), "time"));

  // 簽名一律用黃框提醒本人列印後親筆簽
  if (entries.length) extra.push(issue("SIGN_HERE", "review", "列印後，每一列的簽章欄都要本人親筆簽名（Word 裡打字的簽名不算）。", entries.map((e) => e.id), "signature"));
  extra.push(issue("SIGN_FOOTER", "review", "列印後，頁尾聲明的「簽名」要本人親筆簽名。", null, "footerSignature"));

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
