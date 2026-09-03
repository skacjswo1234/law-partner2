// ============================================
// 법무법인 태윤 - 상담 문의 웹앱
// ============================================
// 배포 후 나오는 "웹 앱 URL"을 사이트(index.html)의 form action / Worker APPS_SCRIPT_URL 에 넣어주세요.
// 구글 시트: 문의 데이터가 저장되는 스프레드시트
// ============================================

var SPREADSHEET_ID = "1MMNGsUWuX79K_g6G-uA4GNyhRmZaGcPb_8C-_dsnya4";

// Cloudflare Worker 가 토스 웹훅을 검증한 뒤 넘길 때 쓰는 공유 시크릿
// wrangler secret APPS_SCRIPT_FORWARD_SECRET 과 반드시 동일해야 합니다.
var TOSS_FORWARD_SECRET = "f30e527e287e9fe9a9bc857d98743f5b0e9008ad5f4d1b350f04c3c5f1fc794e";

var SHEET_HEADERS = [
  "제출일시",
  "이름",
  "전화번호",
  "직업",
  "상담가능시간",
  "정보수집동의",
  "유입경로",
  "lead_id"
];

var TOSS_SHEET_HEADERS = [
  "제출시각",
  "lead_id",
  "이름",
  "연락처",
  "설문답변",
  "약관동의이력",
  "campaign_id",
  "ad_set_id",
  "ad_id",
  "form_id",
  "tracking_click_id",
  "수신시각"
];

var SHEET_WEB = "상담신청";
var SHEET_TOSS = "토스_리드";
var SHEET_TOSS_TEST = "토스_테스트";

function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var message = params.msg || "OK";
  return ContentService.createTextOutput("pong: " + message);
}

function doPost(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : "";
    var type = (e && e.postData && e.postData.type) ? String(e.postData.type) : "";

    if (params.source === "toss" || (type.indexOf("application/json") !== -1 && raw)) {
      return handleTossForward(params, raw);
    }

    return handleWebForm(params);
  } catch (error) {
    Logger.log("오류: " + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getWebSheet(spreadsheet) {
  var named = spreadsheet.getSheetByName(SHEET_WEB);
  if (named) {
    ensureHeaders(named, SHEET_HEADERS);
    return named;
  }
  // 기존 운영 데이터는 보통 첫 번째 시트에 있음 → 이름 변경 없이 유지
  var sheet = spreadsheet.getSheets()[0];
  ensureHeaders(sheet, SHEET_HEADERS);
  return sheet;
}

function handleWebForm(postData) {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = getWebSheet(spreadsheet);

  var timestamp = new Date();
  var rowData = [
    timestamp,
    postData.name || "",
    postData.phone || "",
    postData.job || "",
    postData.consult_time || "",
    postData.privacy || "",
    "웹",
    ""
  ];

  sheet.appendRow(rowData);
  sendEmailNotification(rowData, false);

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: "상담 신청이 완료되었습니다."
  })).setMimeType(ContentService.MimeType.JSON);
}

function handleTossForward(params, raw) {
  if (!params.key || params.key !== TOSS_FORWARD_SECRET) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: "Unauthorized"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  var data = JSON.parse(raw || "{}");
  var isTest = !!data.is_test;
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var tossSheetName = isTest ? SHEET_TOSS_TEST : SHEET_TOSS;
  var tossSheet = getOrCreateSheet(spreadsheet, tossSheetName, TOSS_SHEET_HEADERS);
  ensureHeaders(tossSheet, TOSS_SHEET_HEADERS);

  var name = data.name || extractColumn(data.user_column_data, "name", "이름");
  var phone = data.phone || extractColumn(data.user_column_data, "phone", "연락처", "전화번호");
  var survey = JSON.stringify(data.submitted_content || []);
  var consent = JSON.stringify(data.consensus_histories || []);
  var receivedAt = new Date();

  tossSheet.appendRow([
    data.lead_submit_time || "",
    data.lead_id || "",
    name,
    phone,
    survey,
    consent,
    data.campaign_id || "",
    data.ad_set_id || "",
    data.ad_id || "",
    data.form_id || "",
    data.tracking_click_id || "",
    receivedAt
  ]);

  // 실제 리드는 기존 상담신청 시트에도 요약 적재 (같은 화면에서 확인)
  if (!isTest) {
    var webSheet = getWebSheet(spreadsheet);
    var privacy = consentSummary(data.consensus_histories);
    var job = firstSurveyAnswer(data.submitted_content, ["직업", "하시는 일"]);
    var consultTime = firstSurveyAnswer(data.submitted_content, ["상담", "가능", "시간", "희망"]);
    var webRow = [
      data.lead_submit_time ? new Date(data.lead_submit_time) : receivedAt,
      name,
      phone,
      job,
      consultTime,
      privacy,
      "토스",
      data.lead_id || ""
    ];
    webSheet.appendRow(webRow);
    sendEmailNotification(webRow, true);
  }

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    is_test: isTest,
    lead_id: data.lead_id || null
  })).setMimeType(ContentService.MimeType.JSON);
}

function extractColumn(columns, id, optName1, optName2) {
  if (!columns || !columns.length) return "";
  for (var i = 0; i < columns.length; i++) {
    var col = columns[i] || {};
    if (col.column_id === id) return col.string_value || "";
    if (optName1 && col.column_name === optName1) return col.string_value || "";
    if (optName2 && col.column_name === optName2) return col.string_value || "";
  }
  return "";
}

function firstSurveyAnswer(submitted, keywords) {
  if (!submitted || !submitted.length) return "";
  for (var i = 0; i < submitted.length; i++) {
    var q = String((submitted[i] && submitted[i].question) || "");
    var hit = false;
    for (var k = 0; k < keywords.length; k++) {
      if (q.indexOf(keywords[k]) !== -1) {
        hit = true;
        break;
      }
    }
    if (!hit) continue;
    var answers = (submitted[i] && submitted[i].answer) || [];
    return answers.join(", ");
  }
  return "";
}

function consentSummary(histories) {
  if (!histories || !histories.length) return "";
  var parts = [];
  for (var i = 0; i < histories.length; i++) {
    var item = histories[i] || {};
    parts.push("terms_id=" + item.terms_id + "@" + (item.agreed_at || ""));
  }
  return parts.join(" | ");
}

function getOrCreateSheet(spreadsheet, name, headers) {
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    formatHeaderRange(sheet, headers.length);
  }
  return sheet;
}

function ensureHeaders(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    formatHeaderRange(sheet, headers.length);
    return;
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  formatHeaderRange(sheet, headers.length);
}

function formatHeaderRange(sheet, colCount) {
  var headerRange = sheet.getRange(1, 1, 1, colCount);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#4285f4");
  headerRange.setFontColor("#ffffff");
  for (var i = 1; i <= colCount; i++) {
    sheet.autoResizeColumn(i);
  }
}

function sendEmailNotification(rowData, fromToss) {
  try {
    var toEmail = "bbong1019@gmail.com";
    var subject = fromToss
      ? "[법무법인 태윤] 토스 광고 상담 문의가 접수되었습니다"
      : "[법무법인 태윤] 새 상담 문의가 접수되었습니다";
    var labels = ["제출일시", "이름", "전화번호", "직업", "상담가능시간", "정보수집동의", "유입경로", "lead_id"];
    var lines = [
      fromToss
        ? "토스애즈 잠재고객 웹훅으로 새로운 상담 신청이 접수되었습니다."
        : "법무법인 태윤 홈페이지에서 새로운 상담 신청이 접수되었습니다.",
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      ""
    ];
    for (var i = 0; i < labels.length && i < rowData.length; i++) {
      if (rowData[i] !== "" && rowData[i] !== null && typeof rowData[i] !== "undefined") {
        lines.push(labels[i] + ": " + rowData[i]);
      }
    }
    lines.push("");
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    lines.push("");
    lines.push("구글 시트: https://docs.google.com/spreadsheets/d/" + SPREADSHEET_ID + "/edit");

    MailApp.sendEmail({
      to: toEmail,
      subject: subject,
      htmlBody: lines.join("<br>")
    });
  } catch (error) {
    Logger.log("이메일 전송 오류: " + error.toString());
  }
}

function setupSheetHeaders() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  ensureHeaders(getOrCreateSheet(spreadsheet, SHEET_WEB, SHEET_HEADERS), SHEET_HEADERS);
  ensureHeaders(getOrCreateSheet(spreadsheet, SHEET_TOSS, TOSS_SHEET_HEADERS), TOSS_SHEET_HEADERS);
  ensureHeaders(getOrCreateSheet(spreadsheet, SHEET_TOSS_TEST, TOSS_SHEET_HEADERS), TOSS_SHEET_HEADERS);
  return "시트 헤더 설정 완료";
}
