import { parseTimesheet } from "./parse.js?v=20260930g";
import { checkInnovation, ROLES } from "./check.js?v=20260930g";
import { annotateRenderedDocx, buildAnnotations } from "./annotations.js?v=20260930g";

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/* ---------- 深色模式 ---------- */
const root = document.documentElement;
const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
const toggle = $("#theme-toggle");
function syncToggle() {
  toggle.setAttribute("aria-label", isDark() ? "切換成淺色模式" : "切換成深色模式");
  toggle.title = toggle.getAttribute("aria-label");
}
toggle.addEventListener("click", () => {
  root.dataset.theme = isDark() ? "light" : "dark";
  try { localStorage.setItem("theme", root.dataset.theme); } catch (e) {}
  syncToggle();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncToggle);
syncToggle();

/* ---------- 分頁 ---------- */
const VIEWS = ["home", "people", "items", "receipt", "submit", "check", "files"];
function show() {
  const h = location.hash.slice(1);
  const v = VIEWS.includes(h) ? h : "home";
  VIEWS.forEach((x) => { document.getElementById("v-" + x).hidden = x !== v; });
  window.scrollTo(0, 0);
}
document.querySelectorAll("[data-home]").forEach((b) => b.addEventListener("click", () => { location.hash = "home"; }));
addEventListener("hashchange", show);
show();

/* ---------- 時間軸 ---------- */
const EVENTS = [
  ["2026-09-18", "9/18（五）", "投保資訊、經費變更、RA 合意書繳交"],
  ["2026-10-09", "10/9（五）", "放棄執行申請截止"],
  ["2026-11-27", "11/27（五）", "業務費核銷截止（工讀金可報到 12 月）"],
  ["2027-01-08", "116/1/8（五）", "專案執行截止"],
  ["2027-01-20", "116/1/20（三）", "成效報告繳交（附件 7）"]
];
function renderTimeline() {
  const day = (iso) => new Date(`${iso}T00:00:00`).getTime();
  const start = day("2026-09-01"), end = day("2027-02-01");
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const today = now.getTime();
  const pos = (t) => Math.min(100, Math.max(0, ((t - start) / (end - start)) * 100));
  const nextIdx = EVENTS.findIndex(([d]) => day(d) >= today);
  const state = (i) => (day(EVENTS[i][0]) < today ? "past" : i === nextIdx ? "next" : "");
  const months = [["2026-09-01", "9 月"], ["2026-10-01", "10 月"], ["2026-11-01", "11 月"], ["2026-12-01", "12 月"], ["2027-01-01", "1 月"]];
  const showToday = today >= start && today <= end;
  let h = `<div class="tl-h"><div class="tl-rail"></div>`;
  if (showToday) h += `<div class="tl-done" style="width:${pos(today)}%"></div>`;
  h += months.map(([d, m]) => `<span class="tl-month" style="left:${pos(day(d))}%">${m}</span>`).join("");
  EVENTS.forEach(([d, label, what], i) => {
    const p = pos(day(d)), up = i % 2 === 0, st = state(i);
    const align = p < 12 ? "l" : p > 86 ? "r" : "c";
    h += `<span class="tl-stem" style="left:${p}%;${up ? "top:72px;height:14px" : "top:101px;height:27px"}"></span>`;
    h += `<span class="tl-dot ${st}" style="left:${p}%"></span>`;
    h += `<div class="tl-lab ${up ? "up" : "down"} ${align} ${st}" style="left:${p}%">${st === "next" ? '<span class="tl-tag">下一個期限</span>' : ""}<span class="dd">${label}</span><span class="ww">${what}</span></div>`;
  });
  if (showToday) h += `<span class="tl-today" style="left:${pos(today)}%">今天</span>`;
  h += `</div><ol class="tl-v">`;
  let todayPlaced = !showToday;
  EVENTS.forEach(([d, label, what], i) => {
    if (!todayPlaced && day(d) >= today) { h += `<li class="today">今天 ${now.getMonth() + 1}/${now.getDate()}</li>`; todayPlaced = true; }
    h += `<li class="${state(i)}"><span class="dd">${label}${state(i) === "next" ? '　<span class="tl-tag">下一個期限</span>' : ""}</span><span>${what}</span></li>`;
  });
  if (!todayPlaced) h += `<li class="today">今天</li>`;
  $("#tline").innerHTML = h + "</ol>";
}
renderTimeline();

/* ---------- 品項查詢 ---------- */
const ITEMS = [
  ["隨身碟、隨身硬碟", "ok", "電腦周邊，用途要寫跟課程的關係"],
  ["外接硬碟", "ok", "電腦周邊"],
  ["簡報筆、投影筆", "ok", "電腦周邊"],
  ["錄音筆", "ok", "電腦周邊"],
  ["行動電源、電腦充電器", "ok", "電腦周邊"],
  ["線材、延長線", "ok", "電腦周邊"],
  ["耳機、麥克風", "ok", "電腦周邊"],
  ["手寫板、繪圖板", "ok", "電腦周邊"],
  ["標籤機", "ok", "電腦周邊"],
  ["滑鼠、鍵盤", "ok", "電腦周邊，要是教學用，行政用不行"],
  ["攝影機、錄影器材", "ok", "單價 2,999 元以下"],
  ["腳架、手機支架", "ok", "電腦周邊"],
  ["記憶卡", "ok", "電腦周邊"],
  ["筆、影印紙、迴紋針等文具", "ok", "教學相關才可以，不能私人用"],
  ["ChatGPT 訂閱", "warn", "只能報 9–12 月的費用；下載 Receipt，要寫中原大學；附刷卡明細與刷卡當天匯率表"],
  ["Gemini 訂閱", "warn", "只能報 9–12 月的費用；收據上方要有老師姓名與 CYCU 信箱；附刷卡明細與刷卡當天匯率表"],
  ["教學軟體授權", "warn", "與課程教學相關，只能報執行月份的費用"],
  ["印刷、影印、大圖輸出", "warn", "1,000 元以上（大圖 2,000 元以上）要附 2～3 頁樣張"],
  ["海報、文宣、網站設計", "warn", "要附設計樣本"],
  ["碳粉匣", "warn", "原則上買一個，這項不受 2,999 元限制"],
  ["學生實作材料", "warn", "申請時要先編列預算；用途寫「學生實作-材料費」並附成品照片"],
  ["郵資", "warn", "從嚴審查，要說明和課程的直接關係；寄領據不能報"],
  ["校外參訪車資", "warn", "申請時就要寫好地點、日期、目的"],
  ["活動平安保險", "warn", "保額上限 400 萬元，人數要和名冊一致"],
  ["網路外接卡", "no", "屬通用基礎工具，是學校應提供的基本設施"],
  ["課桌椅", "no", "屬通用基礎設施，是學校應提供的基本設施"],
  ["電腦、筆電、平板", "no", "財產性物品"],
  ["印表機", "no", "財產性物品"],
  ["任何 3,000 元以上的東西", "no", "單價超過 2,999 元"],
  ["書籍", "no", "不論單價都不能買"],
  ["Wi-Fi 分享器", "no", "不論單價都不能買"],
  ["清潔用品", "no", "不論單價都不能買"],
  ["碎紙機", "no", "不能用這筆教育部補助款"],
  ["電腦電池等行政用周邊", "no", "屬行政用途"],
  ["送學生的禮物、獎品", "no", "不能買商品贈送學生；獎勵學生請用競賽獎助金"],
  ["點心、零食", "no", "不得報點心零食"],
  ["餐券", "no", "獎補助不得核銷餐券"],
  ["講員交通費", "no", "本補助款不予核報講員費、演講費、諮詢費及評審費之交通費"],
  ["百元等級的鉛筆、原子筆", "no", "會計室說明會已表示不得購買"]
];
const LABEL = { ok: "可以報", warn: "有條件", no: "不能報", error: "要修正", review: "請確認" };
let filter = "all";
const list = $("#item-list"), qi = $("#q-item");
function renderItems() {
  const q = qi.value.trim().toLowerCase();
  const rows = ITEMS.filter(([n, s, r]) => (filter === "all" || s === filter) && (!q || (n + r).toLowerCase().includes(q)));
  list.innerHTML = rows.length
    ? rows.map(([n, s, r]) => `<div class="item"><span class="pill ${s}">${LABEL[s]}</span><div><div class="n">${n}</div><div class="r">${r}</div></div></div>`).join("")
    : `<div class="empty">找不到「${esc(qi.value)}」。清單裡沒有的品項，請先來電或在 LINE 群組詢問。</div>`;
}
qi.addEventListener("input", renderItems);
document.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => {
  filter = c.dataset.f;
  document.querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", x === c));
  renderItems();
}));
renderItems();

/* ---------- 附件下載 ---------- */
const FILES = [
  ["01-program-rules.pdf", "附件1_數位教學創新應用補助專案.pdf", "附件 1　補助專案要點", "補助類別、補助項目與核銷的原則。"],
  ["03-ta-insurance.odt", "附件3_工讀學生聘任投保資訊.odt", "附件 3　工讀學生聘任投保資訊", "TA 投保用。填 10–12 月各月工作日期與時數（三個月合計 30 小時），外籍生附工作證。"],
  ["04-budget-change.odt", "附件4_經費變更申請表.odt", "附件 4　經費變更申請表", "經費項目需要調整時填寫。"],
  ["05-ra-agreement.odt", "附件5_研究獎助生合意書.odt", "附件 5　研究獎助生合意書", "RA 用。一式三份、學生與老師親簽，紙本送 101A。"],
  ["06-1-reimbursement-rules.odt", "附件6-1_核銷注意要點.odt", "附件 6-1　核銷注意要點", "可報項目、應附文件、憑證規格的完整規定。"],
  ["06-2-personal-receipt.odt", "附件6-2_支付個人款項領款收據.odt", "附件 6-2　個人領款收據", "RA 按月核銷、講員費等個人款項使用。表單上印的是 196 元，RA 請自行改成 200 元。"],
  ["06-3-timesheet.odt", "附件6-3_臨時工資簽到單.odt", "附件 6-3　臨時工資簽到單", "每月一張。填好後可以先用「簽到單送出前檢查」檢查。"],
  ["06-4-activity-record.odt", "附件6-4_數位教學相關活動紀錄.odt", "附件 6-4　活動紀錄", "辦理演講、工作坊等活動時附上。"],
  ["06-5-competition-award.odt", "附件6-5_競賽獎助推薦表.odt", "附件 6-5　競賽獎助推薦表", "核銷學生參賽獎勵金時附上。"],
  ["07-outcome-report.odt", "附件7_成效報告及案例.odt", "附件 7　成效報告及案例", "116/1/20 前繳交。"],
  ["08-expense-detail.doc", "08_支出明細表.doc", "08　支出明細表", "每筆報帳都要附，教學用途說明至少 50 字。"]
];
const fileRow = ([path, name, title, desc]) => {
  const ext = path.split(".").pop().toUpperCase();
  return `<div class="file"><span class="t">${title}<span class="fmt">${ext}</span></span><span class="d">${desc}</span><a href="files/${path}" download="${name}">下載</a></div>`;
};
$("#file-list").innerHTML = FILES.map(fileRow).join("");
// 各頁的相關附件：data-files 用檔名開頭的編號（例如 "05 06-2"）
document.querySelectorAll(".dl[data-files]").forEach((box) => {
  const rows = box.dataset.files.split(" ").map((code) => FILES.find(([path]) => path.startsWith(code + "-"))).filter(Boolean);
  box.innerHTML = `<span class="big">${box.dataset.title}</span><div class="files">${rows.map(fileRow).join("")}</div><a class="dl-all" href="#files">看全部附件 →</a>`;
});

/* ---------- 簽到單檢查 ---------- */
const sheets = []; // { id, fileName, sheet, role, insuredFrom, plannedHours, foreign, error }
let seq = 0;
let pickedRole = "";

async function addFiles(fileList) {
  for (const file of fileList) {
    const item = { id: ++seq, fileName: file.name, role: pickedRole, insuredFrom: "", plannedHours: "", foreign: false };
    try {
      item.bytes = await file.arrayBuffer();
      item.sheet = await parseTimesheet(item.bytes.slice(0));
      item.isDocx = /\.docx$/i.test(file.name);
      item.foreign = item.sheet.foreign;
    } catch (err) {
      item.error = err.message;
    }
    sheets.push(item);
  }
  renderSheets();
}

function key(v) { return String(v ?? "").replaceAll(/\s+/g, ""); }

function renderCross() {
  const box = $("#cross");
  const ok = sheets.filter((s) => s.sheet);
  const clashes = [];
  for (const ra of ok.filter((s) => s.role === "RA")) {
    for (const ta of ok.filter((s) => s.role === "TA")) {
      const sameId = key(ra.sheet.studentId) && key(ra.sheet.studentId) === key(ta.sheet.studentId);
      const sameName = key(ra.sheet.name) && key(ra.sheet.name) === key(ta.sheet.name);
      if (sameId || sameName) clashes.push(`${esc(ra.sheet.name || ra.sheet.studentId)}（${esc(ra.fileName)} 與 ${esc(ta.fileName)}）`);
    }
  }
  const msgs = [];
  if (clashes.length) msgs.push(`<b>同一人不能同時是 RA 和 TA：</b>${clashes.join("、")}。一個人只能擔任其中一種，請跟老師確認身分。`);
  // 同一人同身分的多張簽到單，加總後不能超過總時數（TA 30、RA 50）
  const groups = new Map();
  for (const s of ok) {
    const who = key(s.sheet.studentId) || key(s.sheet.name);
    if (!who) continue;
    const k = `${s.role}|${who}`;
    const hours = checkInnovation(s.sheet, s).calculated.totalHours;
    const g = groups.get(k) ?? { role: s.role, name: s.sheet.name || s.sheet.studentId, hours: 0, count: 0 };
    g.hours += hours; g.count += 1; groups.set(k, g);
  }
  for (const g of groups.values()) {
    const cap = ROLES[g.role].totalHours;
    if (g.count > 1 && g.hours > cap) msgs.push(`<b>${esc(g.name)}（${g.role}）超過總時數：</b>這 ${g.count} 張簽到單合計 ${Math.round(g.hours * 100) / 100} 小時，三個月總共只能 ${cap} 小時。`);
  }
  box.hidden = !msgs.length;
  box.innerHTML = msgs.join("<br>");
}

// 日保要在生效日前 7 天把投保資料送到數位處
// 以簽到單上最早的工作日當保險生效日，往前推 7 天
function insuranceDue(entries) {
  const first = entries.map((e) => e.date).filter(Boolean).sort()[0];
  if (!first) return "投保資料要在第一天工作的前 7 天送到數位處。例如 10/23 開始工作，就要在 10/16 以前送到。";
  const d = new Date(`${first}T00:00:00`);
  const md = (x) => `${x.getMonth() + 1}/${x.getDate()}`;
  const start = md(d);
  d.setDate(d.getDate() - 7);
  return `這張簽到單第一天工作是 <b>${start}</b>，投保資料要在 <b>${md(d)}</b> 以前送到數位處。`;
}

function rowsLabel(ids) { return ids?.length ? `第 ${ids.join("、")} 列：` : ""; }

function renderSheet(item) {
  if (item.error) {
    return `<div class="panel sheet"><div class="sheet-head"><h3>${esc(item.fileName)}</h3><button class="remove" data-remove="${item.id}">移除</button></div><div class="note"><b>無法檢查：</b>${esc(item.error)}</div></div>`;
  }
  const r = checkInnovation(item.sheet, item);
  const errors = r.issues.filter((i) => i.severity === "error");
  const reviews = r.issues.filter((i) => i.severity === "review");
  const notes = buildAnnotations([...errors, ...reviews], item.sheet);
  item.notes = notes;
  const s = item.sheet;
  const who = [s.name, s.studentId].filter(Boolean).map(esc).join("　") || "（姓名、學號未填）";
  const ta = item.role === "TA";
  return `<div class="panel sheet">
    <div class="sheet-head">
      <h3>${who}<span class="fmt">${esc(item.fileName)}</span></h3>
      <button class="remove" data-remove="${item.id}">移除</button>
    </div>
    <div class="opts-row">
      <span>身分（選錯可以在這裡改）</span>
      <span class="seg" role="group" aria-label="身分">
        ${Object.entries(ROLES).map(([k, v]) => `<button data-role="${k}" data-id="${item.id}" aria-pressed="${item.role === k}">${v.label}（${v.rate} 元）</button>`).join("")}
      </span>
    </div>
    ${ta ? `<div class="opts-row">
      <span class="ins-due">${insuranceDue(r.entries)}</span>
      <label>投保資訊表填的本月時數 <input type="number" min="0" step="0.5" id="plan-${item.id}" data-field="plannedHours" data-id="${item.id}" value="${esc(item.plannedHours)}"></label>
      <label><input type="checkbox" id="fr-${item.id}" data-field="foreign" data-id="${item.id}" ${item.foreign ? "checked" : ""}> 外籍生</label>
    </div>` : ""}
    <div class="stats">
      <span>${s.period.written ? `${s.period.year - 1911} 年 ${s.period.month} 月` : "月份未填"}</span>
      <span>工作紀錄 <b>${r.entries.length}</b> 筆</span>
      <span>應為 <b>${r.calculated.totalHours}</b> 小時</span>
    </div>
    ${notes.length
      ? `<ul class="issues">${notes.map((i) => `<li><button class="num" data-sev="${i.severity}" data-focus="${item.id}:${i.number}" title="在簽到單上找到這一處">${i.number}</button><span class="pill ${i.severity === "error" ? "no" : "warn"}">${LABEL[i.severity]}</span><span>${rowsLabel(i.entryIds)}${esc(i.message)}</span></li>`).join("")}</ul>`
      : `<div class="allgood">沒有發現需要修正的地方。網頁只能幫忙抓常見錯誤，送出前請再對著簽到單自己看一次。</div>`}
    <figure class="doc-fig"><figcaption>簽到單上有編號框線的地方，就是要改或要確認的位置</figcaption><div class="doc-view" id="doc-${item.id}"></div></figure>
    <div class="decl"><b>送出前請自己確認：</b>${r.declarations.map((d, n) => `<label><input type="checkbox" id="d-${item.id}-${n}"> ${esc(d.label)}</label>`).join("")}</div>
  </div>`;
}

function renderSheets() {
  $("#sheets").innerHTML = sheets.map(renderSheet).join("");
  $("#check-empty").hidden = sheets.length > 0;
  renderCross();
  sheets.filter((s) => s.sheet).forEach(renderDoc);
}

// 簽到單原貌＋標記：Word 檔照原排版顯示；ODT 或無法顯示時，用讀到的內容重畫成表格
let previewLib;
function loadScript(src) {
  return new Promise((ok, fail) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = fail; document.head.append(s); });
}
function docxPreview() {
  previewLib ??= loadScript("js/vendor/jszip.min.js?v=20260930g").then(() => loadScript("js/vendor/docx-preview.min.js?v=20260930g")).then(() => window.docx);
  return previewLib;
}
function fallbackPaper(s) {
  const cell = (v, tag = "td") => `<${tag}>${esc(v)}</${tag}>`;
  return `<div class="paper">
    <h4>計畫案工讀生及臨時工簽到單</h4>
    <div class="paper-meta">${[["計畫名稱", s.planName], ["執行單位", s.unit], ["計畫編號", s.planNumber], ["姓名", s.name], ["學系", s.department], ["學號", s.studentId], ["聯絡電話", s.phone]].map(([k, v]) => `<p>${k}：${esc(v)}</p>`).join("")}</div>
    <table><tr>${["編號", "工作日期", "開始", "結束", "工作時數", "工作酬金", "工作地點", "工作內容", "簽章"].map((v) => cell(v, "th")).join("")}</tr>
    ${s.entries.map((e) => `<tr>${[e.id, e.dateText ?? e.date, e.start, e.end, e.hours, e.pay, e.location, e.workContent, e.signature].map((v) => cell(v)).join("")}</tr>`).join("")}</table>
    <p class="paper-total">計酬基準 X ${esc(s.claimedTotalHours)} 小時　金額：${esc(s.claimedTotalPay)} 元</p>
    <p>簽名：${esc(s.footerSignature)}</p>
  </div>`;
}
async function renderDoc(item) {
  const box = document.getElementById(`doc-${item.id}`);
  if (!box) return;
  if (item.isDocx) {
    try {
      const lib = await docxPreview();
      const holder = document.createElement("div");
      holder.className = "docx-render";
      await lib.renderAsync(item.bytes.slice(0), holder, null, { inWrapper: true, ignoreWidth: false, ignoreHeight: false, debug: false });
      if (!box.isConnected) return;
      box.replaceChildren(holder);
      annotateRenderedDocx(holder, item.notes);
      return;
    } catch { /* 顯示不了就改用重畫的表格 */ }
  }
  box.innerHTML = fallbackPaper(item.sheet);
  annotateRenderedDocx(box, item.notes);
}

const find = (id) => sheets.find((s) => s.id === Number(id));
$("#sheets").addEventListener("click", (e) => {
  const focus = e.target.closest("[data-focus]");
  if (focus) {
    const [id, n] = focus.dataset.focus.split(":");
    const marks = [...document.querySelectorAll(`#doc-${id} [data-annotation-number="${n}"]`)];
    marks.forEach((m) => { m.dataset.active = "true"; });
    marks[0]?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    setTimeout(() => marks.forEach((m) => delete m.dataset.active), 1600);
    return;
  }
  const role = e.target.closest("[data-role]");
  if (role) { find(role.dataset.id).role = role.dataset.role; renderSheets(); return; }
  const rm = e.target.closest("[data-remove]");
  if (rm) { sheets.splice(sheets.indexOf(find(rm.dataset.remove)), 1); renderSheets(); }
});
$("#sheets").addEventListener("change", (e) => {
  const el = e.target.closest("[data-field]");
  if (!el) return;
  find(el.dataset.id)[el.dataset.field] = el.type === "checkbox" ? el.checked : el.value;
  renderSheets();
});

const input = $("#file-input"), drop = $("#drop");
document.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => {
  pickedRole = b.dataset.pick;
  document.querySelectorAll("[data-pick]").forEach((x) => x.setAttribute("aria-pressed", x === b));
  drop.setAttribute("aria-disabled", "false");
  $("#drop-title").textContent = `第二步：上傳${ROLES[pickedRole].label}的簽到單（點這裡選檔，或把檔案拖進來）`;
}));
input.addEventListener("change", () => { addFiles([...input.files]); input.value = ""; });
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => { e.preventDefault(); if (!pickedRole) return; drop.classList.remove("over"); addFiles([...e.dataTransfer.files]); });
