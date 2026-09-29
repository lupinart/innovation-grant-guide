# 創新應用補助小幫手

115-1 數位教學創新應用補助專案給老師用的快速指引：RA／TA 差別、品項能不能報、憑證規格、用途說明寫法、簽到單送出前檢查、附件下載。

- 純靜態網頁，GitHub Pages 直接部署，不需要 build。
- 簽到單檢查只在瀏覽器讀檔，不上傳任何資料。支援 .docx、.odt。
- 檢查核心（`js/rules.js`、`fields.js`、`period.js`）沿用 signin-checker；`js/check.js` 放本專案規則（RA 200 元、TA 196 元、TA 三個月合計 30 小時、RA 50 小時、保險生效日、外籍生每週 20 小時、RA／TA 不可同一人）。
- 附件放在 `files/`；更新表單時直接換檔，並同步 `js/app.js` 的 `FILES` 清單。
