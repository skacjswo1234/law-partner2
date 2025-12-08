// 웹앱 엔드포인트 응답
function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};
  var message = params.msg || "OK";
  return ContentService.createTextOutput("pong: " + message);
}

// 폼 제출 시 자동 실행 (트리거 설정 필요)
function onFormSubmit(e) {
  try {
    var email = "bbong1019@gmail.com";
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
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
    bodyLines.push("구글 시트에서 확인: " + SpreadsheetApp.getActiveSpreadsheet().getUrl());
    
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

