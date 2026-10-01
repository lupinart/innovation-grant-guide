// 簽到單解析：沿用 signin-checker 的 DOCX 解析，另外支援學校原始的 ODT 表單
import { strFromU8, unzipSync } from "./vendor/fflate.js?v=20261001b";
import { footerSignature, personalValue } from "./fields.js?v=20261001b";
import { inferPeriod } from "./period.js?v=20261001b";

function decodeXml(value) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll(/\s+/g, " ")
    .trim();
}

// ---------- DOCX ----------
function withoutTextBoxes(xml) {
  return xml.replaceAll(/<w:txbxContent(?:\s[^>]*)?>[\s\S]*?<\/w:txbxContent>/g, "");
}
function docxText(fragment) {
  return decodeXml([...fragment.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join(""));
}
function docxParagraphs(xml) {
  return [...xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)].map((m) => docxText(m[1])).filter(Boolean);
}
function docxRows(xml) {
  return [...xml.matchAll(/<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g)].map((row) =>
    [...row[1].matchAll(/<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g)].map((cell) => docxText(cell[1]))
  );
}

// ---------- ODT ----------
function odtText(fragment) {
  const withSpaces = fragment
    .replaceAll(/<text:s(?:\s+text:c="(\d+)")?\s*\/>/g, (_, n) => " ".repeat(Number(n || 1)))
    .replaceAll(/<text:(?:tab|line-break)\s*\/>/g, " ")
    .replaceAll(/<\/text:p>/g, " </text:p>");
  return decodeXml(withSpaces.replaceAll(/<[^>]+>/g, ""));
}
function odtParagraphs(xml) {
  return [...xml.matchAll(/<text:[ph](?:\s[^>]*)?>([\s\S]*?)<\/text:[ph]>/g)].map((m) => odtText(m[1])).filter(Boolean);
}
function odtRows(xml) {
  return [...xml.matchAll(/<table:table-row(?:\s[^>]*)?>([\s\S]*?)<\/table:table-row>/g)].map((row) =>
    [...row[1].matchAll(/<table:table-cell(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/table:table-cell>)/g)].map((cell) => odtText(cell[1] ?? ""))
  );
}

// ---------- 共用 ----------
function normalizeTime(value) {
  const match = /(\d{1,2})\s*[:：]\s*(\d{2})/.exec(value);
  return match ? `${String(Number(match[1])).padStart(2, "0")}:${match[2]}` : "";
}
function normalizeDate(value, year, fallbackMonth) {
  const match = /(\d{1,2})\s*[\/.-]\s*(\d{1,2})/.exec(value);
  if (!match) return "";
  const month = Number(match[1]) || fallbackMonth;
  const day = Number(match[2]);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function numberValue(value) {
  const match = String(value).replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}
function optionalNumberValue(value) {
  const match = String(value).replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : "";
}
function metadata(lines, label, nextLabel) {
  const line = lines.find((value) => value.includes(label));
  if (!line) return "";
  const after = line.slice(line.indexOf(label) + label.length);
  return (nextLabel ? after.split(nextLabel)[0] : after).replace(/^\s*[：:]\s*/, "").replaceAll(/[_＿]+/g, "").trim();
}

function workEntry(cells, context) {
  const id = numberValue(cells[0]);
  if (!id || !/^\s*\d+\s*$/.test(cells[0])) return null;
  let dateCell, startCell, endCell, hoursCell, payCell, locationCell, workCell, signatureCell;
  if (cells.length >= 9) {
    [, dateCell, startCell, endCell, hoursCell, payCell, locationCell, workCell, signatureCell] = cells;
  } else if (cells.length >= 8) {
    const times = [...cells[2].matchAll(/\d{1,2}\s*[:：]\s*\d{2}/g)].map((m) => m[0]);
    dateCell = cells[1];
    [startCell = "", endCell = ""] = times;
    [, , , hoursCell, payCell, locationCell, workCell, signatureCell] = cells;
  } else {
    return null;
  }
  const date = normalizeDate(dateCell, context.year, context.month);
  const start = normalizeTime(startCell);
  const end = normalizeTime(endCell);
  if (!date && !start && !end) return null;
  return {
    id: String(id),
    isSample: /範例/.test(dateCell) || /[(（]填校內[)）]|切勿寫行政/.test(`${locationCell}${workCell}`),
    date, start, end,
    dateText: String(dateCell ?? "").trim(),
    hours: numberValue(hoursCell),
    pay: optionalNumberValue(payCell),
    location: String(locationCell ?? "").trim(),
    workContent: String(workCell ?? "").trim(),
    signature: String(signatureCell ?? "").trim()
  };
}

function checked(text, label) {
  return new RegExp(`[■☑✓✔☒vVＶ]\\s*${label}`).test(text);
}

export async function parseTimesheet(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let archive;
  try {
    archive = unzipSync(bytes);
  } catch {
    throw new Error("讀不到這個檔案。請上傳 .docx 或 .odt 電子檔；舊版 .doc、PDF、照片沒辦法自動檢查。");
  }
  let rawXml, lines, allLines, rows, fullText;
  if (archive["word/document.xml"]) {
    rawXml = strFromU8(archive["word/document.xml"]);
    const xml = withoutTextBoxes(rawXml);
    lines = docxParagraphs(xml);
    allLines = lines;
    rows = docxRows(xml);
    fullText = docxText(rawXml);
  } else if (archive["content.xml"]) {
    rawXml = strFromU8(archive["content.xml"]);
    const body = rawXml.slice(Math.max(0, rawXml.indexOf("<office:body")));
    lines = odtParagraphs(body.replaceAll(/<table:table[\s>][\s\S]*?<\/table:table>/g, ""));
    rows = odtRows(body);
    allLines = odtParagraphs(body);
    fullText = odtParagraphs(body).join(" ");
  } else {
    throw new Error("這不是 Word（.docx）或 ODT 檔案，請確認上傳的是簽到單電子檔。");
  }

  const context = inferPeriod(fullText);
  const entries = rows.map((cells) => workEntry(cells, context)).filter(Boolean);
  const completeText = lines.join(" ");
  // ODT 表單的合計與頁尾簽名放在表格裡，表格外找不到就從整份文件找
  const allText = allLines.join(" ");
  const hoursRe = /(?:X|×|x)[\s_＿]*(\d+(?:\.\d+)?)[\s_＿]*小時/i;
  const payRe = /金額\s*[:：]?[\s_＿]*(\d[\d,]*(?:\.\d+)?)[\s_＿]*元/;
  const hoursMatch = hoursRe.exec(completeText) ?? hoursRe.exec(allText);
  const payMatch = payRe.exec(completeText) ?? payRe.exec(allText);
  const footer = (() => { const f = footerSignature(lines); return f.found ? f : footerSignature(allLines); })();
  const monthWritten = /(\d{2,4})\s*年\s*(\d{1,2})\s*月/.exec(fullText);

  return {
    period: { ...context, written: Boolean(monthWritten) },
    footerSignatureFound: footer.found,
    footerSignature: footer.value.replace(/【?是否為外籍生.*$/, "").trim(),
    planName: metadata(lines, "計畫名稱", "二、"),
    planNumber: metadata(lines, "計畫編號", "四、"),
    unit: metadata(lines, "執行單位", "三、"),
    name: personalValue(fullText, "姓名", ["學系", "學號", "聯絡電話", "□校外", "■校外"]),
    department: personalValue(fullText, "學系", ["學號", "聯絡電話"]),
    studentId: personalValue(fullText, "學號", ["校外人士", "聯絡電話"]),
    phone: personalValue(fullText, "聯絡電話", ["編號", "工作日期"]),
    outsider: checked(fullText, "校外人士"),
    foreign: /外籍生[】\]]?\s*[■☑✓✔☒]\s*是/.test(fullText),
    entries,
    claimedTotalHours: hoursMatch ? Number(hoursMatch[1]) : "",
    claimedTotalPay: payMatch ? numberValue(payMatch[1]) : ""
  };
}
