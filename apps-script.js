// ============================================
// 배포 정보
// ============================================
// 배포 ID: AKfycbzgvEaTGFqp8lIZiwA7B5JwGI0RSiswi6f1X267lrtjWrrW9j1N1OvcnbRNpKLbAlhSRg
// 웹앱 URL: https://script.google.com/macros/s/AKfycbzgvEaTGFqp8lIZiwA7B5JwGI0RSiswi6f1X267lrtjWrrW9j1N1OvcnbRNpKLbAlhSRg/exec
// 구글 시트 URL: https://docs.google.com/spreadsheets/d/1MMNGsUWuX79K_g6G-uA4GNyhRmZaGcPb_8C-_dsnya4/edit
// ============================================

// 구글 시트 ID (URL에서 추출)
var SPREADSHEET_ID = "1MMNGsUWuX79K_g6G-uA4GNyhRmZaGcPb_8C-_dsnya4";

// 웹앱 URL
var WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzgvEaTGFqp8lIZiwA7B5JwGI0RSiswi6f1X267lrtjWrrW9j1N1OvcnbRNpKLbAlhSRg/exec";

// 웹앱 엔드포인트 응답
function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};
  var message = params.msg || "OK";
  return ContentService.createTextOutput("pong: " + message);
}

// 웹에서 폼 데이터를 받아서 시트에 추가하는 함수
function doPost(e) {
  try {
    var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = spreadsheet.getActiveSheet();
    var postData = (e && e.parameter) ? e.parameter : {};
    
    // 헤더가 없으면 자동으로 추가
    var lastRow = sheet.getLastRow();
    if (lastRow === 0) {
      // 헤더 배열
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
      
      // 1행에 헤더 설정
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      
      // 헤더 행 스타일 설정
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#4285f4");
      headerRange.setFontColor("#ffffff");
      
      // 열 너비 자동 조정
      for (var i = 1; i <= headers.length; i++) {
        sheet.autoResizeColumn(i);
      }
    }
    
    // 현재 시간
    var timestamp = new Date();
    
    // 데이터 배열 (시트 헤더 순서에 맞춤: 제출일시, 이름, 전화번호, 직업, 월소득, 채무금액, 상담가능시간, 연체여부)
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
    
    // 시트에 데이터 추가
    sheet.appendRow(rowData);
    
    // 이메일 전송
    sendEmailNotification(rowData);
    
    // 성공 응답
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: "상담 신청이 완료되었습니다."
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log("오류 발생: " + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// 이메일 알림 전송 함수
function sendEmailNotification(rowData) {
  try {
    var email = "bbong1019@gmail.com";
    var subject = "[법무법인 파트너] 새 문의가 접수되었습니다 [싸이렌24]";
    
    var headers = ["제출일시", "이름", "전화번호", "직업", "월소득", "채무금액", "상담가능시간", "연체여부"];
    
    var bodyLines = [];
    bodyLines.push("새로운 상담 신청이 접수되었습니다.");
    bodyLines.push("");
    bodyLines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    bodyLines.push("");
    
    for (var i = 0; i < headers.length && i < rowData.length; i++) {
      if (rowData[i]) {
        bodyLines.push(headers[i] + ": " + rowData[i]);
      }
    }
    
    bodyLines.push("");
    bodyLines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    bodyLines.push("");
    bodyLines.push("구글 시트에서 확인: https://docs.google.com/spreadsheets/d/" + SPREADSHEET_ID + "/edit");
    
    var htmlBody = bodyLines.join("<br>");
    
    MailApp.sendEmail({
      to: email,
      subject: subject,
      htmlBody: htmlBody
    });
    
    Logger.log("이메일 전송 완료: " + email);
    
  } catch (error) {
    Logger.log("이메일 전송 오류: " + error.toString());
  }
}

// 폼 제출 시 자동 실행 (트리거 설정 필요)
function onFormSubmit(e) {
  try {
    var email = "bbong1019@gmail.com";
    var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = spreadsheet.getActiveSheet();
    
    // e가 없거나 undefined인 경우 체크
    if (!e) {
      Logger.log("이벤트 객체가 없습니다. 시트의 마지막 행을 읽어옵니다.");
    }
    
    // 시트의 헤더 행 확인 (일반적으로 1행)
    var headerRow = 1;
    var lastRow = sheet.getLastRow();
    
    // 데이터가 없으면 종료
    if (lastRow <= headerRow) {
      Logger.log("전송할 데이터가 없습니다.");
      return;
    }
    
    // 새로 추가된 행의 데이터 가져오기
    var rowData = sheet.getRange(lastRow, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // 이메일 제목
    var subject = "[법무법인 파트너] 새 문의가 접수되었습니다";
    
    // 이메일 본문 작성
    var bodyLines = [];
    bodyLines.push("새로운 상담 신청이 접수되었습니다.");
    bodyLines.push("");
    bodyLines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    bodyLines.push("");
    
    // 시트의 헤더와 데이터 매칭하여 이메일 본문 작성
    var headers = sheet.getRange(headerRow, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    for (var i = 0; i < headers.length; i++) {
      var header = headers[i];
      var value = rowData[i] || "";
      
      if (header && value) {
        // 타임스탬프는 "제출일시"로 표시
        if (header.toString().toLowerCase().includes("timestamp") || 
            header.toString().includes("제출") || 
            header.toString().includes("타임스탬프")) {
          bodyLines.push("제출일시: " + value);
        } else {
          bodyLines.push(header + ": " + value);
        }
      }
    }
    
    bodyLines.push("");
    bodyLines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    bodyLines.push("");
    bodyLines.push("구글 시트에서 확인: https://docs.google.com/spreadsheets/d/" + SPREADSHEET_ID + "/edit");
    
    // HTML 형식으로 이메일 전송
    var htmlBody = bodyLines.join("<br>");
    
    MailApp.sendEmail({
      to: email,
      subject: subject,
      htmlBody: htmlBody
    });
    
    Logger.log("이메일 전송 완료: " + email);
    
  } catch (error) {
    Logger.log("오류 발생: " + error.toString());
    // 오류가 발생해도 폼 제출은 정상적으로 처리되도록 함
  }
}

// 시트 헤더 자동 설정 함수 (한 번만 실행하면 됩니다)
function setupSheetHeaders() {
  try {
    var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = spreadsheet.getActiveSheet();
    
    // 헤더 배열 (구글 폼은 첫 번째 열에 타임스탬프를 자동으로 넣습니다)
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
    
    // 1행에 헤더 설정
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // 헤더 행 스타일 설정 (선택사항)
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#4285f4");
    headerRange.setFontColor("#ffffff");
    
    // 열 너비 자동 조정
    for (var i = 1; i <= headers.length; i++) {
      sheet.autoResizeColumn(i);
    }
    
    Logger.log("시트 헤더가 성공적으로 설정되었습니다.");
    return "시트 헤더 설정 완료!";
    
  } catch (error) {
    Logger.log("오류 발생: " + error.toString());
    return "오류: " + error.toString();
  }
}

