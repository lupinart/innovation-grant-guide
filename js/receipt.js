// 個人領據（附件 6-2 支付個人款項領款收據）的解析與檢查
import { strFromU8, unzipSync } from "./vendor/fflate.js?v=20261002e";
import { ROLES, PERIOD_MONTHS, PROFILE } from "./check.js?v=20261002e";
import { checkTimesheet } from "./rules.js?v=20261002e";

function decodeXml(value) {
  return value
    .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'").replaceAll("&amp;", "&")
    .replaceAll(/\s+/g, " ").trim();
}
const compact = (v) => String(v ?? "").replaceAll(/[\s_＿]+/g, "");

// 表格逐列讀出；ODT 的合併儲存格（covered-table-cell）也算一格，欄位才對得齊
function odtRows(xml) {
  const cellText = (f) => decodeXml((f ?? "")
    .replaceAll(/<text:s(?:\s+text:c="(\d+)")?\s*\/>/g, (_, n) => " ".repeat(Number(n || 1)))
    .replaceAll(/<\/text:p>/g, " </text:p>")
    .replaceAll(/<[^>]+>/g, ""));
  return [...xml.matchAll(/<table:table-row(?:\s[^>]*)?>([\s\S]*?)<\/table:table-row>/g)].map((row) =>
    [...row[1].matchAll(/<table:(?:covered-)?table-cell(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/table:(?:covered-)?table-cell>)/g)].map((c) => cellText(c[1]))
  );
}
function docxRows(xml) {
  const cellText = (f) => decodeXml([...f.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join(""));
  return [...xml.matchAll(/<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g)].map((row) =>
    [...row[1].matchAll(/<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g)].map((c) => cellText(c[1]))
  );
}

// 中文大寫金額 → 數字（壹仟玖佰陸拾、一千九百六十都可以）；也接受直接寫阿拉伯數字
const DIGIT = { 零: 0, 〇: 0, 壹: 1, 一: 1, 貳: 2, 贰: 2, 二: 2, 兩: 2, 參: 3, 叁: 3, 叄: 3, 三: 3, 肆: 4, 四: 4, 伍: 5, 五: 5, 陸: 6, 六: 6, 柒: 7, 七: 7, 捌: 8, 八: 8, 玖: 9, 九: 9 };
const UNIT = { 拾: 10, 十: 10, 佰: 100, 百: 100, 仟: 1000, 千: 1000 };
export function chineseAmount(text) {
  const s = compact(text).replace(/^(新台幣|新臺幣|NT\$?)/i, "").replace(/(元整|元|整)+$/, "");
  if (!s) return null;
  if (/^\d[\d,]*$/.test(s)) return Number(s.replaceAll(",", ""));
  let total = 0, section = 0, digit = 0;
  for (const ch of s) {
    if (ch in DIGIT) digit = DIGIT[ch];
    else if (ch in UNIT) { section += (digit || 1) * UNIT[ch]; digit = 0; }
    else if (ch === "萬" || ch === "万") { total += (section + digit) * 10000; section = 0; digit = 0; }
    else return null;
  }
  return total + section + digit;
}

export function isReceipt(bytes) {
  try {
    const a = unzipSync(new Uint8Array(bytes));
    const xml = a["content.xml"] ? strFromU8(a["content.xml"]) : a["word/document.xml"] ? strFromU8(a["word/document.xml"]) : "";
    return /領款收據/.test(compact(xml.replaceAll(/<[^>]+>/g, "")));
  } catch { return false; }
}

export function parseReceipt(input) {
  const a = unzipSync(new Uint8Array(input));
  let rows, xml;
  if (a["content.xml"]) {
    xml = strFromU8(a["content.xml"]);
    xml = xml.slice(Math.max(0, xml.indexOf("<office:body")));
    rows = odtRows(xml);
  } else {
    xml = strFromU8(a["word/document.xml"]);
    rows = docxRows(xml);
  }
  const cells = rows.flat();
  // 表格讀不到（例如另存時表格被拆掉）時，改從整份文字找
  const all = compact(xml.replaceAll(/<[^>]+>/g, ""));

  // 領款名稱：數位創新應用-研究助理助學金115年 月 (196元X 小時= 元)
  const nameCell = compact(cells.find((c) => /助學金|工讀金/.test(c)) ?? "") || (/領款名稱(.*?)活動日期/.exec(all)?.[1] ?? "");
  const ym = /(\d{2,3})年(\d{0,2})月/.exec(nameCell);
  const calc = /[(（](\d*)元[XxＸ×＊*](\d*(?:\.\d+)?)小時[=＝]([\d,]*)元[)）]/.exec(nameCell);

  // 金額（大寫）：新台幣 OOO 元整
  const amountCell = cells.find((c) => /新[台臺]幣/.test(c)) ?? (/新[台臺]幣.*?元整/.exec(all)?.[0] ?? "");
  const words = compact(amountCell).replace(/[(（]大寫[)）]/, "").replace(/^.*?(新[台臺]幣)/, "$1");
  const filledWords = compact(words).replace(/^新[台臺]幣/, "").replace(/(元整|元|整)+$/, "");

  // 具領人：表頭那一列的下一列，同一欄就是填的內容
  const h = rows.findIndex((r) => r.some((c) => compact(c) === "職稱") && r.some((c) => compact(c).startsWith("姓名")));
  const pick = (label) => {
    if (h < 0 || !rows[h + 1]) return "";
    const i = rows[h].findIndex((c) => compact(c).startsWith(label));
    return i < 0 ? "" : compact(rows[h + 1][i] ?? "");
  };
  const idRow = rows.find((r) => r.some((c) => /人事代碼/.test(c)));
  const idAt = idRow ? idRow.findIndex((c) => /人事代碼/.test(c)) : -1;
  const studentId = idAt < 0 ? "" : compact(idRow.slice(idAt + 1).find((c) => compact(c)) ?? "");

  // 活動地點：標題格右邊那一格；款付：「□款付：」後面寫的字
  const placeRow = rows.find((r) => r.some((c) => compact(c) === "活動地點"));
  const placeAt = placeRow ? placeRow.findIndex((c) => compact(c) === "活動地點") : -1;
  const place = placeAt >= 0 ? compact(placeRow.slice(placeAt + 1).find((c) => compact(c)) ?? "") : (/活動地點(.*?)金額/.exec(all)?.[1] ?? "");
  const payee = /款付[：:]?(.*?)(?:[□■☑✓✔☒vVＶ]?沖銷借款|$)/.exec(compact(cells.find((c) => /款付/.test(c)) ?? "") || all)?.[1] ?? "";

  return {
    place,
    payee: payee.replace(/^[：:]/, ""),
    year: ym ? Number(ym[1]) : 0,
    month: ym && ym[2] ? Number(ym[2]) : 0,
    nameText: nameCell,
    rate: calc && calc[1] ? Number(calc[1]) : 0,
    hours: calc && calc[2] ? Number(calc[2]) : 0,
    amount: calc && calc[3] ? Number(calc[3].replaceAll(",", "")) : 0,
    amountWords: filledWords ? words : "",
    amountFromWords: filledWords ? chineseAmount(words) : null,
    unit: pick("單位"),
    title: pick("職稱"),
    name: pick("姓名"),
    studentId,
    personRead: h >= 0,
    readable: Boolean(nameCell) && /領款收據/.test(all)
  };
}

const fmt = (n) => Number(n).toLocaleString("en-US");
function issue(code, severity, message) { return { code, severity, message }; }

// sheets：同一批上傳、已讀到的簽到單（{ role, sheet, hours }），用來核對同一人同月份的時數
export function checkReceipt(r, options = {}) {
  const role = options.role === "RA" ? "RA" : "TA";
  const rate = ROLES[role].rate;
  const out = [];
  if (!r.readable) {
    out.push(issue("UNREADABLE", "error", "讀不到領款名稱那一格。請用本頁下載的附件 6-2 個人領據填寫，不要改動表格。"));
    return { role, rate, issues: out };
  }

  if (!r.month) out.push(issue("MONTH_MISSING", "error", "領款名稱的「115年　月」月份沒有填。"));
  else if (!PERIOD_MONTHS.includes(r.month)) out.push(issue("MONTH_OUTSIDE", "error", `領款名稱寫的是 ${r.month} 月。RA、TA 只在 10、11、12 月工作，請確認月份。`));

  if (r.rate !== rate) {
    out.push(issue("RATE", "error", role === "RA"
      ? `RA 時薪是 200 元。領據上印的 ${r.rate || 196} 元，請自行改成 200 元。`
      : `TA 時薪是 196 元，領據上寫的是 ${r.rate || "（空白）"} 元。`));
  }
  if (!r.hours) out.push(issue("HOURS_MISSING", "error", "領款名稱括號裡的「X　小時」時數沒有填。"));
  if (!r.amount) out.push(issue("AMOUNT_MISSING", "error", "領款名稱括號裡的「=　元」金額沒有填。"));
  const expected = r.hours ? Math.round(rate * r.hours) : 0;
  if (r.hours && r.amount && r.amount !== expected) {
    out.push(issue("AMOUNT_WRONG", "error", `${rate} 元 × ${r.hours} 小時應為 ${fmt(expected)} 元，領據寫的是 ${fmt(r.amount)} 元。`));
  }

  if (!r.amountWords) {
    out.push(issue("WORDS_MISSING", "error", `「金額」欄的大寫沒有填${expected ? `，例如「新台幣${toChinese(expected)}元整」` : ""}。`));
  } else if (/[0-9０-９一二三四五六七八九十百千]/.test(r.amountWords.replace(/^新[台臺]幣/, ""))) {
    const target = expected || r.amount || r.amountFromWords;
    out.push(issue("WORDS_NOT_UPPER", "error", `大寫金額要用國字大寫（壹貳參肆伍陸柒捌玖拾佰仟），不能寫阿拉伯數字或一二三${target ? `，例如「新台幣${toChinese(target)}元整」` : ""}。`));
  } else if (r.amountFromWords === null) {
    out.push(issue("WORDS_UNREADABLE", "review", `大寫金額「${r.amountWords}」讀不懂，請確認是用壹貳參肆伍陸柒捌玖拾佰仟寫的。`));
  } else {
    const target = expected || r.amount;
    if (target && r.amountFromWords !== target) {
      out.push(issue("WORDS_WRONG", "error", `大寫金額寫的是 ${fmt(r.amountFromWords)} 元，跟 ${fmt(target)} 元不一樣。應寫「新台幣${toChinese(target)}元整」。`));
    }
  }

  // 活動地點填工作的教室，沿用簽到單的地點規則（大樓名稱＋教室號碼）
  if (!r.place) {
    out.push(issue("PLACE_MISSING", "error", "「活動地點」沒有填，請寫工作的教室，例如「電學大樓 301」。"));
  } else {
    const loc = checkTimesheet({ entries: [{ id: "1", date: "", start: "", end: "", hours: 0, location: r.place, workContent: "x" }] }, PROFILE)
      .issues.filter((i) => /^(LOCATION|ROOM)/.test(i.code) && !["LOCATION_CONFIRM", "LOCATION_REQUIRED"].includes(i.code));
    for (const i of loc) out.push(issue(`PLACE_${i.code}`, i.severity, `活動地點：${i.message.replace("工作地點", "地點")}`));
  }
  if (!r.payee) out.push(issue("PAYEE_MISSING", "error", "「款付：」後面要寫「本人」。"));
  else if (!/本人/.test(r.payee)) out.push(issue("PAYEE_WRONG", "error", `「款付：」後面寫的是「${r.payee}」，要寫「本人」。`));

  const missing = !r.personRead ? [] : [["單位", r.unit], ["職稱", r.title], ["姓名", r.name], ["學號", r.studentId]].filter(([, v]) => !v).map(([k]) => k);
  if (!r.personRead) out.push(issue("PERSON_UNREAD", "review", "讀不到具領人的欄位，請自己確認單位、職稱、姓名、學號都有填。"));
  else if (missing.length) out.push(issue("PERSON_MISSING", "error", `具領人的${missing.join("、")}沒有填。`));

  if (r.hours > ROLES[role].totalHours) {
    out.push(issue("OVER_CAP", "error", `${r.hours} 小時超過${role === "TA" ? " TA 三個月總共的 30 小時" : " RA 三個月總共的 50 小時"}。`));
  }

  // 跟同一人、同月份的簽到單核對時數
  const who = (s) => [compact(s.studentId), compact(s.name)].filter(Boolean);
  const mine = who(r);
  const match = (options.sheets ?? []).filter((s) => s.sheet.period.written && s.sheet.period.month === r.month && who(s.sheet).some((k) => mine.includes(k)));
  if (r.month && mine.length && match.length) {
    const total = Math.round(match.reduce((n, s) => n + s.hours, 0) * 100) / 100;
    if (r.hours && Math.abs(total - r.hours) > 0.001) {
      out.push(issue("SHEET_MISMATCH", "error", `${r.month} 月簽到單合計 ${total} 小時，領據寫 ${r.hours} 小時，兩邊要一樣。`));
    }
    if (match.some((s) => s.role !== role)) out.push(issue("ROLE_MISMATCH", "error", "領據和簽到單選的身分（RA／TA）不一樣，請確認。"));
  } else if (r.month) {
    out.push(issue("NO_SHEET", "hint", `小提醒：把 ${r.month} 月的簽到單也一起上傳，網頁會幫你比對領據和簽到單的時數有沒有一樣。`));
  }

  out.push(issue("SIGN", "review", "列印後，「蓋章或簽名」欄要本人親筆簽名或蓋章（Word 裡打字的不算）。"));

  // 每個問題對應到領據上的哪一格，網頁用紅框／黃框標出來
  const FIELD = { 單位: "unit", 職稱: "title", 姓名: "name", 學號: "studentId" };
  const AT = {
    MONTH_MISSING: ["month"], MONTH_OUTSIDE: ["month"], RATE: ["rate"], ROLE_MISMATCH: ["rate"],
    HOURS_MISSING: ["hours"], OVER_CAP: ["hours"], SHEET_MISMATCH: ["hours"],
    AMOUNT_MISSING: ["amount"], AMOUNT_WRONG: ["amount"],
    WORDS_MISSING: ["words"], WORDS_NOT_UPPER: ["words"], WORDS_UNREADABLE: ["words"], WORDS_WRONG: ["words"],
    PLACE_MISSING: ["place"], PAYEE_MISSING: ["payee"], PAYEE_WRONG: ["payee"],
    PERSON_MISSING: missing.map((k) => FIELD[k]), PERSON_UNREAD: Object.values(FIELD), SIGN: ["sign"]
  };
  for (const i of out) i.fields = AT[i.code] ?? (i.code.startsWith("PLACE_") ? ["place"] : []);
  const hints = out.filter((i) => i.severity === "hint").map((i) => i.message);
  const rest = out.filter((i) => i.severity !== "hint");
  return { role, rate, hints, issues: [...rest.filter((i) => i.severity === "error"), ...rest.filter((i) => i.severity !== "error")] };
}

// 數字 → 大寫金額（給錯誤訊息示範寫法）
export function toChinese(n) {
  const D = "零壹貳參肆伍陸柒捌玖", U = ["", "拾", "佰", "仟"];
  const four = (x) => {
    let s = "", zero = false;
    for (let i = 3; i >= 0; i -= 1) {
      const d = Math.floor(x / 10 ** i) % 10;
      if (d) { if (zero && s) s += "零"; s += D[d] + U[i]; zero = false; } else zero = true;
    }
    return s;
  };
  if (!n) return "零";
  const hi = Math.floor(n / 10000), lo = n % 10000;
  return (hi ? four(hi) + "萬" + (lo && lo < 1000 ? "零" : "") : "") + four(lo);
}
