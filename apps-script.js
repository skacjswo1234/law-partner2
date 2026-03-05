// ============================================
// 법무법인 태윤 - 상담 문의 웹앱
// ============================================
// 배포 후 나오는 "웹 앱 URL"을 사이트(index.html)의 form action 주소에 넣어주세요.
// 구글 시트: 문의 데이터가 저장되는 스프레드시트 (아래 시트 ID를 본인 시트로 변경)
// ============================================

var SPREADSHEET_ID = "1MMNGsUWuX79K_g6G-uA4GNyhRmZaGcPb_8C-_dsnya4";

// GET 요청 (헬스체크·테스트용)
function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var message = params.msg || "OK";
  return ContentService.createTextOutput("pong: " + message);
}

// POST 요청 (사이트 문의 폼 제출 시 호출)
function doPost(e) {
  try {
    var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = spreadsheet.getActiveSheet();
    var postData = (e && e.parameter) ? e.parameter : {};

    if (sheet.getLastRow() === 0) {
      var headers = [
        "제출일시",
        "이름",
        "전화번호",
        "직업",
        "월소득",
        "채무금액",
        "상담가능시간",
        "연체여부"
      ];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#4285f4");
      headerRange.setFontColor("#ffffff");
      for (var i = 1; i <= headers.length; i++) {
        sheet.autoResizeColumn(i);
      }
    }

    var timestamp = new Date();
    var rowData = [
      timestamp,
      postData.name || "",
      postData.phone || "",
      postData.job || "",
      postData.income || "",
      postData.debt || "",
      postData.consultation_time || "",
      postData.overdue || ""
    ];

    sheet.appendRow(rowData);
    sendEmailNotification(rowData);

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: "상담 신청이 완료되었습니다."
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log("오류: " + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// 문의 접수 시 이메일 알림 (법무법인 태윤)
function sendEmailNotification(rowData) {
  try {
    var toEmail = "bbong1019@gmail.com";
    var subject = "[법무법인 태윤] 새 상담 문의가 접수되었습니다";
    var labels = ["제출일시", "이름", "전화번호", "직업", "월소득", "채무금액", "상담가능시간", "연체여부"];
    var lines = [
      "법무법인 태윤 홈페이지에서 새로운 상담 신청이 접수되었습니다.",
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      ""
    ];
    for (var i = 0; i < labels.length && i < rowData.length; i++) {
      if (rowData[i]) lines.push(labels[i] + ": " + rowData[i]);
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
    Logger.log("이메일 전송 완료: " + toEmail);
  } catch (error) {
    Logger.log("이메일 전송 오류: " + error.toString());
  }
}

// 시트 헤더가 없을 때 한 번만 수동 실행하면 됨 (선택)
function setupSheetHeaders() {
  try {
    var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = spreadsheet.getActiveSheet();
    var headers = [
      "제출일시",
      "이름",
      "전화번호",
      "직업",
      "월소득",
      "채무금액",
      "상담가능시간",
      "연체여부"
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#4285f4");
    headerRange.setFontColor("#ffffff");
    for (var i = 1; i <= headers.length; i++) {
      sheet.autoResizeColumn(i);
    }
    Logger.log("법무법인 태윤 시트 헤더 설정 완료");
    return "시트 헤더 설정 완료";
  } catch (error) {
    Logger.log("오류: " + error.toString());
    return "오류: " + error.toString();
  }
}
