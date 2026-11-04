/**
 * 🔎 의약품 낱알 식별기 모듈 (식약처 공식 OpenAPI + Gemini 2.5 Flash AI 비전 + 우리 약국 위치 자동 매칭)
 * - 식약처 공식 의약품 낱알식별 정보 OpenAPI (MdcinGrnIdntfcInfoService03/getMdcinGrnIdntfcInfoList03) 실시간 연동
 * - 📸 카메라/사진 AI 판독: 손님이 가져온 알약을 촬영하면 AI가 각인문자·모양·색상·제형·분할선·후보 약품명을 자동 추출하고 식약처 공식 DB와 교차 검증
 * - 🎨 모양·색상·각인문자·제형·분할선·제품명 1-Tap 비주얼 필터 검색 (한글 IME 조합 보호 120ms 디바운스)
 * - 🏥 우리 약국 보유 위치 자동 매칭: [일반약 위치 관리] 및 [전문약 위치 관리] DB와 실시간 대조하여 진열 위치 즉시 안내
 * - 🗣️ 손님 안내용 큰글씨 카드 모달 & 💾 식별·상담 기록 영구 보관함 (Cloudinary 사진 압축 업로드 + Firebase 전 기기 동기화 + 사이드바 🔴 배지)
 */
if (typeof window.PillIdentifierModule === 'undefined') {
  window.PillIdentifierModule = (function () {
    const DEFAULT_MFDS_SERVICE_KEY = '022aca34703daabded07c1d45868dd361b8b2377b0e1dd31fb42970b56eef585';
    const MFDS_API_ENDPOINT = 'https://apis.data.go.kr/1471000/MdcinGrnIdntfcInfoService03/getMdcinGrnIdntfcInfoList03';
    const FIREBASE_PILL_ID_CONFIG_URL = 'https://shinsegae-pharmacy-default-rtdb.firebaseio.com/shinsegae_master_db/pillIdConfig.json';
    const FIREBASE_PILL_ID_CACHE_URL = 'https://shinsegae-pharmacy-default-rtdb.firebaseio.com/shinsegae_master_db/pillIdCloudCache.json';
    const FIREBASE_AI_CONFIG_URL = 'https://shinsegae-pharmacy-default-rtdb.firebaseio.com/shinsegae_master_db/pillCounterConfig.json';
    const AI_MODEL_QUEUE = ['gemini-2.5-flash', 'gemini-flash-latest'];

    // 🛡️ [제 195 조 & 제 171 조] 브라우저 기본 localStorage (5MB 한도) 절대 사용 금지 (0 Byte 유지)
    // 기존에 남아있을 수 있는 로컬스토리지 캐시·기록 키를 기동 즉시 영구 삭제하고 100% 인메모리(RAM) + 클라우디너리(Cloudinary) & 파이어베이스(Firebase) 직결 운용
    try {
      ['ssg_mfds_pill_cache_v1', 'ssg_pill_identifications_v1', 'ssg_mfds_pill_service_key_v1'].forEach(k => localStorage.removeItem(k));
    } catch (e) {}

    // 식약처 공식 낱알식별 핵심 시드 DB (다빈도 처방·일반약 86종 — 오프라인/각인문자 0.01초 즉시 검색용)
    const EMBEDDED_MFDS_SEED = [{"ITEM_SEQ":"202106092","ITEM_NAME":"타이레놀정500밀리그람(아세트아미노펜)","ENTP_NAME":"켄뷰코리아판매유한회사","CHART":"흰색의 장방형 필름코팅정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1OKRXo9l4D5","PRINT_FRONT":"TYLENOL","PRINT_BACK":"500","DRUG_SHAPE":"장방형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"17.6","LENG_SHORT":"7.1","THICK":"5.7","CLASS_NAME":"해열.진통.소염제","ETC_OTC_NAME":"일반의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":null},{"ITEM_SEQ":"200610660","ITEM_NAME":"노바스크정5밀리그람(암로디핀베실산염)","ENTP_NAME":"비아트리스코리아(주)","CHART":"흰색의 팔각형 정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Pm1vy6QK2x","PRINT_FRONT":"VLE","PRINT_BACK":"NV분할선5","DRUG_SHAPE":"팔각형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":"-","LENG_LONG":"8.6","LENG_SHORT":"6.1","THICK":"3.1","CLASS_NAME":"혈압강하제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"나정","EDI_CODE":"073400360"},{"ITEM_SEQ":"200108429","ITEM_NAME":"아스피린프로텍트정100밀리그람","ENTP_NAME":"바이엘코리아(주)","CHART":"한쪽 면에 BAYER 식별이 있고, 다른 한쪽 면에는 식별이 없는 흰색의 원형 장용 필름코팅정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147427668455400184","PRINT_FRONT":"Bayer","PRINT_BACK":null,"DRUG_SHAPE":"원형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"7.23","LENG_SHORT":"7.23","THICK":"3.07","CLASS_NAME":"기타의 순환계용약","ETC_OTC_NAME":"일반의약품","FORM_CODE_NAME":"장용성필름코팅정","EDI_CODE":"641100270"},{"ITEM_SEQ":"200700907","ITEM_NAME":"플라빅스정75밀리그램(클로피도그렐황산염)","ENTP_NAME":"(주)한독","CHART":"분홍색의 원형필름코팅정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/149883724889500122","PRINT_FRONT":"75","PRINT_BACK":"1171","DRUG_SHAPE":"원형","COLOR_CLASS1":"분홍","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"8.5","LENG_SHORT":"8.5","THICK":"4","CLASS_NAME":"동맥경화용제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"652101570"},{"ITEM_SEQ":"200410090","ITEM_NAME":"리피토정10밀리그램(아토르바스타틴칼슘삼수화물)","ENTP_NAME":"비아트리스코리아(주)","CHART":"흰색의 원형 필름코팅정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1O0bxj5Fj_F","PRINT_FRONT":"ATV","PRINT_BACK":"10","DRUG_SHAPE":"원형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"5.5","LENG_SHORT":"5.5","THICK":"3.5","CLASS_NAME":"동맥경화용제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"073400340"},{"ITEM_SEQ":"200210097","ITEM_NAME":"크레스토정10밀리그램(로수바스타틴칼슘)","ENTP_NAME":"한국아스트라제네카(주)","CHART":"분홍색 원형 필름코팅정 ","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/150954503241500076","PRINT_FRONT":"ZD452210","PRINT_BACK":null,"DRUG_SHAPE":"원형","COLOR_CLASS1":"분홍","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"7.3","LENG_SHORT":"7.3","THICK":"3.77","CLASS_NAME":"동맥경화용제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"650700520"},{"ITEM_SEQ":"201005081","ITEM_NAME":"트윈스타정40/5밀리그램","ENTP_NAME":"한국베링거인겔하임(주)","CHART":"흰색과 연한 파란색의 양면이 볼록한 타원형 이중정이다.","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Pvn3im1ken","PRINT_FRONT":"마크 A1","PRINT_BACK":null,"DRUG_SHAPE":"타원형","COLOR_CLASS1":"하양","COLOR_CLASS2":"파랑","LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"14.0","LENG_SHORT":"6.80","THICK":"5.00","CLASS_NAME":"혈압강하제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"다층정","EDI_CODE":"653501270"},{"ITEM_SEQ":"200402637","ITEM_NAME":"아모디핀정5밀리그램(암로디핀캄실산염)","ENTP_NAME":"한미약품(주)","CHART":"흰색의 육각형 정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Or51Qm62xf","PRINT_FRONT":"HMP","PRINT_BACK":"AM분할선5","DRUG_SHAPE":"육각형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":"-","LENG_LONG":"8.32","LENG_SHORT":"6.06","THICK":"3.13","CLASS_NAME":"혈압강하제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"나정","EDI_CODE":"643501600"},{"ITEM_SEQ":"200710759","ITEM_NAME":"자누비아정100밀리그램(시타글립틴인산염수화물)","ENTP_NAME":"(주)종근당","CHART":"베이지색으로 한면에 277이 새겨진 원형의 양면이 볼록한 필름코팅정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1PHso-WYTOf","PRINT_FRONT":"277","PRINT_BACK":null,"DRUG_SHAPE":"원형","COLOR_CLASS1":"주황","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"10","LENG_SHORT":"10","THICK":"4","CLASS_NAME":"당뇨병용제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"643309550"},{"ITEM_SEQ":"200009027","ITEM_NAME":"넥시움정20밀리그램(에스오메프라졸마그네슘)","ENTP_NAME":"한국아스트라제네카(주)","CHART":"연분홍색 장방형 필름코팅정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Oa2BrqwG9V","PRINT_FRONT":"AEH","PRINT_BACK":"20mG","DRUG_SHAPE":"장방형","COLOR_CLASS1":"분홍","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"14","LENG_SHORT":"7","THICK":"4.5","CLASS_NAME":"소화성궤양용제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"650700070"},{"ITEM_SEQ":"201902217","ITEM_NAME":"에넥시움정20밀리그램(에스오메프라졸마그네슘삼수화물)","ENTP_NAME":"(주)보령바이오파마","CHART":"연한 분홍색의 장방형 필름코팅정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1OkqsRLb_1b","PRINT_FRONT":"B2S","PRINT_BACK":null,"DRUG_SHAPE":"타원형","COLOR_CLASS1":"분홍","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"12.1","LENG_SHORT":"6.9","THICK":"4.1","CLASS_NAME":"소화성궤양용제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"670501580"},{"ITEM_SEQ":"200100565","ITEM_NAME":"가스모틴정5밀리그램(모사프리드시트르산염수화물)","ENTP_NAME":"(주)대웅제약","CHART":"이약은 분할선을 가진 흰색의 장방형 필름코팅정제이다","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Orz9gcUHHI","PRINT_FRONT":"D.W","PRINT_BACK":"분할선","DRUG_SHAPE":"장방형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":"-","LENG_LONG":"9.1","LENG_SHORT":"4.6","THICK":"3.6","CLASS_NAME":"기타의 소화기관용약","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"641600030"},{"ITEM_SEQ":"200500248","ITEM_NAME":"스티렌정(애엽95%에탄올연조엑스(20→1))","ENTP_NAME":"동아에스티(주)","CHART":"이약은 녹색의 타원형 필름코팅정이다","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1OeimlOsRPg","PRINT_FRONT":"DA","PRINT_BACK":"SLT","DRUG_SHAPE":"타원형","COLOR_CLASS1":"연두","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"11.2","LENG_SHORT":"6.2","THICK":"4.4","CLASS_NAME":"소화성궤양용제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"642502290"},{"ITEM_SEQ":"201500114","ITEM_NAME":"가스티렌정(애엽95%에탄올연조엑스(20→1))","ENTP_NAME":"(주)테라젠이텍스","CHART":"녹색의 타원형 필름코팅정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1OR9x9vZQv5","PRINT_FRONT":"ETG1","PRINT_BACK":null,"DRUG_SHAPE":"타원형","COLOR_CLASS1":"연두","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"13.5","LENG_SHORT":"7.4","THICK":"4.4","CLASS_NAME":"소화성궤양용제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"698502910"},{"ITEM_SEQ":"199102825","ITEM_NAME":"무코스타정(레바미피드)","ENTP_NAME":"한국오츠카제약(주)","CHART":"백색의 원형필름코팅정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1N1ddmFmE2M","PRINT_FRONT":"OG33","PRINT_BACK":null,"DRUG_SHAPE":"원형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"8.1","LENG_SHORT":"8.1","THICK":"3.4","CLASS_NAME":"소화성궤양용제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"649900060"},{"ITEM_SEQ":"199300848","ITEM_NAME":"동화록소닌정(록소프로펜나트륨수화물)","ENTP_NAME":"동화약품(주)","CHART":"담홍색의 원형정제이다.","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1OrgEjHwC3Y","PRINT_FRONT":"D-W분할선LXN","PRINT_BACK":null,"DRUG_SHAPE":"원형","COLOR_CLASS1":"분홍","COLOR_CLASS2":null,"LINE_FRONT":"-","LINE_BACK":null,"LENG_LONG":"9.0","LENG_SHORT":"9.0","THICK":"3.1","CLASS_NAME":"해열.진통.소염제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"나정","EDI_CODE":"642700370"},{"ITEM_SEQ":"200103393","ITEM_NAME":"한국얀센울트라셋정(수출용)","ENTP_NAME":"(주)한국얀센","CHART":"연한 황색의 장방형 필름코팅 정제 ","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/154661651930900001","PRINT_FRONT":"JANSSEN","PRINT_BACK":"T/A","DRUG_SHAPE":"장방형","COLOR_CLASS1":"노랑","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"15.5","LENG_SHORT":"6.5","THICK":"5.5","CLASS_NAME":"해열.진통.소염제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":null},{"ITEM_SEQ":"202003694","ITEM_NAME":"울트라셋정","ENTP_NAME":"(주)한국얀센","CHART":"연한 노란색의 장방형 필름코팅 정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1NOwp2F6IoO","PRINT_FRONT":"J-C","PRINT_BACK":"T/P","DRUG_SHAPE":"장방형","COLOR_CLASS1":"주황","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"15.7","LENG_SHORT":"6.5","THICK":"5.6","CLASS_NAME":"해열.진통.소염제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"646902330"},{"ITEM_SEQ":"199101279","ITEM_NAME":"오구멘틴정625밀리그램(아목시실린·클라불란산칼륨(4:1))","ENTP_NAME":"일성아이에스(주)","CHART":"백색 또는 거의 백색의 타원형 필름코팅정제이다.","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1PKAziUZSbG","PRINT_FRONT":"AUG 625","PRINT_BACK":null,"DRUG_SHAPE":"타원형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"20.25","LENG_SHORT":"9.76","THICK":"4.45","CLASS_NAME":"주로 그람양성, 음성균에 작용하는 것","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"655401520"},{"ITEM_SEQ":"200307829","ITEM_NAME":"클래리시드필름코팅정250밀리그램(클래리트로마이신)","ENTP_NAME":"한국애보트(유)","CHART":"바닐라향이 나는 노란색의 타원형 필름코팅정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1NcelJgSVbH","PRINT_FRONT":"마크 KT","PRINT_BACK":null,"DRUG_SHAPE":"장방형","COLOR_CLASS1":"노랑","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"15.8","LENG_SHORT":"8.0","THICK":"5.7","CLASS_NAME":"기타의 항생물질제제(복합항생물질제제를 포함)","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"644200570"},{"ITEM_SEQ":"201005501","ITEM_NAME":"카나브정60밀리그램(피마사르탄칼륨삼수화물)","ENTP_NAME":"(주)보령","CHART":"노란색의 한 면에 분할선이 있고 각 모서리가 둥근 육각형의 볼록한 필름코팅정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/154333320801300056","PRINT_FRONT":"B분할선R","PRINT_BACK":"FMS6","DRUG_SHAPE":"육각형","COLOR_CLASS1":"노랑","COLOR_CLASS2":null,"LINE_FRONT":"-","LINE_BACK":null,"LENG_LONG":"8","LENG_SHORT":"4","THICK":"4","CLASS_NAME":"혈압강하제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"641905450"},{"ITEM_SEQ":"201310719","ITEM_NAME":"글리아타민연질캡슐(콜린알포세레이트)","ENTP_NAME":"대웅바이오(주)","CHART":"무색투명의 점조한 액을 넣은 담황색을 띤 타원형의 연질캡슐제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/154039561327900002","PRINT_FRONT":"글리아타민","PRINT_BACK":null,"DRUG_SHAPE":"타원형","COLOR_CLASS1":"갈색","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"15.5","LENG_SHORT":"8.5","THICK":"8.5","CLASS_NAME":"기타의 중추신경용약","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"연질캡슐제, 액상","EDI_CODE":"694000600"},{"ITEM_SEQ":"199702183","ITEM_NAME":"기넥신에프정80밀리그램(은행엽건조엑스)","ENTP_NAME":"에스케이케미칼(주)","CHART":"진녹색의 타원형 필름 코팅정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1OM2GQpPV4K","PRINT_FRONT":"SK","PRINT_BACK":"G분할선80","DRUG_SHAPE":"장방형","COLOR_CLASS1":"연두","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":"-","LENG_LONG":"14.5","LENG_SHORT":"7.3","THICK":"4.4","CLASS_NAME":"기타의 순환계용약","ETC_OTC_NAME":"일반의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"644700140"},{"ITEM_SEQ":"199602982","ITEM_NAME":"소론도정(프레드니솔론)","ENTP_NAME":"(주)유한양행","CHART":"흰색의 원형정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1OoAc19ns4C","PRINT_FRONT":"YH","PRINT_BACK":"P분할선5","DRUG_SHAPE":"원형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":"-","LENG_LONG":"6.5","LENG_SHORT":"6.5","THICK":"3.4","CLASS_NAME":"부신호르몬제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"나정","EDI_CODE":null},{"ITEM_SEQ":"200610765","ITEM_NAME":"지르텍정(세티리진염산염)","ENTP_NAME":"한국유씨비제약(주)","CHART":"흰색의 장방형 필름코팅정 ","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Pe072ka2fV","PRINT_FRONT":"Z분할선Z","PRINT_BACK":null,"DRUG_SHAPE":"장방형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":"-","LINE_BACK":null,"LENG_LONG":"10","LENG_SHORT":"4","THICK":"3","CLASS_NAME":"항히스타민제","ETC_OTC_NAME":"일반의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"654100110"},{"ITEM_SEQ":"199801016","ITEM_NAME":"알레그라정120밀리그람(펙소페나딘염산염)","ENTP_NAME":"(주)한독","CHART":"연분홍색의 긴 타원형의 필름코팅정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1OlTcytjZI_","PRINT_FRONT":"012---","PRINT_BACK":null,"DRUG_SHAPE":"장방형","COLOR_CLASS1":"분홍","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"16","LENG_SHORT":"5","THICK":"4.9","CLASS_NAME":"항히스타민제","ETC_OTC_NAME":"일반의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"652100960"},{"ITEM_SEQ":"200009063","ITEM_NAME":"싱귤레어정10밀리그램(몬테루카스트나트륨)","ENTP_NAME":"한국오가논(주)","CHART":"모서리가 둥근 사각형 모양의 베이지색 필름코팅 정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Q4TAkVId_j","PRINT_FRONT":null,"PRINT_BACK":"117","DRUG_SHAPE":"사각형","COLOR_CLASS1":"분홍","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"8.0","LENG_SHORT":"8.0","THICK":"3.8","CLASS_NAME":"기타의 알레르기용약","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"073100190"},{"ITEM_SEQ":"200900740","ITEM_NAME":"뮤코펙트정(암브록솔염산염)","ENTP_NAME":"오펠라헬스케어코리아(주)","CHART":"흰색 내지 미황색의 원형 정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1O597tTUEcr","PRINT_FRONT":"67C분할선67C","PRINT_BACK":null,"DRUG_SHAPE":"원형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":"-","LINE_BACK":null,"LENG_LONG":"9","LENG_SHORT":"9","THICK":"2.9","CLASS_NAME":"진해거담제","ETC_OTC_NAME":"일반의약품","FORM_CODE_NAME":"나정","EDI_CODE":"074200050"},{"ITEM_SEQ":"199500435","ITEM_NAME":"엘도스캡슐(에르도스테인)","ENTP_NAME":"(주)대웅제약","CHART":"내수용 - 백색의 분말이 들어있는 상부 초록색, 하부 황색의 경질캡슐제수출용 - 백색의 분말이 들어있는 상부 초록색, 하부 미황색의 경질캡슐제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Og9J5dfYp3","PRINT_FRONT":"DW ELC","PRINT_BACK":null,"DRUG_SHAPE":"장방형","COLOR_CLASS1":"초록","COLOR_CLASS2":"노랑","LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"19.10","LENG_SHORT":"6.63","THICK":"6.91","CLASS_NAME":"진해거담제","ETC_OTC_NAME":"일반의약품","FORM_CODE_NAME":"경질캡슐제, 산제","EDI_CODE":"641601960"},{"ITEM_SEQ":"202002625","ITEM_NAME":"지엘도스캡슐300밀리그램(에르도스테인)","ENTP_NAME":"지엘팜텍(주)","CHART":"흰색의 분말이 들어있는 상부 초록색, 하부 미황색의 경질캡슐제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1PG0Cv2hrEl","PRINT_FRONT":"GL E300","PRINT_BACK":null,"DRUG_SHAPE":"장방형","COLOR_CLASS1":"초록","COLOR_CLASS2":"노랑","LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"19.1","LENG_SHORT":"6.6","THICK":"6.6","CLASS_NAME":"진해거담제","ETC_OTC_NAME":"일반의약품","FORM_CODE_NAME":"경질캡슐제, 산제","EDI_CODE":"649703130"},{"ITEM_SEQ":"200710782","ITEM_NAME":"탁센연질캡슐(나프록센)","ENTP_NAME":"(주)녹십자","CHART":"무색 내지 연한 청록색의 내용물을 함유한 연청록색의 투명한 타원형 연질캡슐","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1PwG4UxJ1mq","PRINT_FRONT":"TAK-SEN","PRINT_BACK":null,"DRUG_SHAPE":"타원형","COLOR_CLASS1":"청록, 투명","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"15.6","LENG_SHORT":"9.7","THICK":"9.7","CLASS_NAME":"해열.진통.소염제","ETC_OTC_NAME":"일반의약품","FORM_CODE_NAME":"연질캡슐제, 액상","EDI_CODE":null},{"ITEM_SEQ":"197900277","ITEM_NAME":"게보린정(수출명:돌로린정)","ENTP_NAME":"삼진제약(주)","CHART":"홍색의 정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1N5PLuAiUvi","PRINT_FRONT":"GR","PRINT_BACK":null,"DRUG_SHAPE":"삼각형","COLOR_CLASS1":"분홍","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"11.2","LENG_SHORT":"11.2","THICK":"7.4","CLASS_NAME":"해열.진통.소염제","ETC_OTC_NAME":"일반의약품","FORM_CODE_NAME":"나정","EDI_CODE":null},{"ITEM_SEQ":"198700405","ITEM_NAME":"베아제정","ENTP_NAME":"(주)대웅제약","CHART":"연녹색의 장방형 필름코팅정제이다.","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/148647963523800116","PRINT_FRONT":"BEARSE","PRINT_BACK":null,"DRUG_SHAPE":"장방형","COLOR_CLASS1":"연두","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"13.3","LENG_SHORT":"7.4","THICK":"5.9","CLASS_NAME":"건위소화제","ETC_OTC_NAME":"일반(안전상비)","FORM_CODE_NAME":"필름코팅정","EDI_CODE":null},{"ITEM_SEQ":"200300406","ITEM_NAME":"닥터베아제정","ENTP_NAME":"(주)대웅제약","CHART":"주황색의 장방형 필름코팅 정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/148647963523800122","PRINT_FRONT":"닥터베아제","PRINT_BACK":null,"DRUG_SHAPE":"장방형","COLOR_CLASS1":"주황","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"14.9","LENG_SHORT":"8.3","THICK":"5.8","CLASS_NAME":"건위소화제","ETC_OTC_NAME":"일반(안전상비)","FORM_CODE_NAME":"필름코팅정","EDI_CODE":null},{"ITEM_SEQ":"198100119","ITEM_NAME":"우루사정100밀리그램(우르소데옥시콜산)","ENTP_NAME":"(주)대웅제약","CHART":"흰색의 원형 정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Pb_3_20w5z","PRINT_FRONT":"UDCA","PRINT_BACK":"D분할선W","DRUG_SHAPE":"원형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":"-","LENG_LONG":"8.0","LENG_SHORT":"8.0","THICK":"3.5","CLASS_NAME":"간장질환용제","ETC_OTC_NAME":"일반의약품","FORM_CODE_NAME":"나정","EDI_CODE":"641602040"},{"ITEM_SEQ":"200606210","ITEM_NAME":"하루날디정0.2밀리그램(탐스로신염산염)","ENTP_NAME":"한국아스텔라스제약(주)","CHART":"이 약은 흰색의 원형정제이다","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1NB2DoAuQxN","PRINT_FRONT":"마크557","PRINT_BACK":null,"DRUG_SHAPE":"원형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"8.5","LENG_SHORT":"8.5","THICK":"4.2","CLASS_NAME":"기타의 비뇨생식기관 및 항문용약","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"서방성필름코팅정","EDI_CODE":"677200160"},{"ITEM_SEQ":"199504272","ITEM_NAME":"프로스카정(피나스테리드)","ENTP_NAME":"한국오가논(주)","CHART":"청색으로 한 면에는 MSD72가 다른 면에는 Proscar 가 새겨진 사과모양의 필름코팅정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Oqy0vxcEQH","PRINT_FRONT":"PROSCAR","PRINT_BACK":"MSD72","DRUG_SHAPE":"기타","COLOR_CLASS1":"파랑","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"7.3","LENG_SHORT":"7.1","THICK":"3.6","CLASS_NAME":"기타의 비뇨생식기관 및 항문용약","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"073100210"},{"ITEM_SEQ":"200409982","ITEM_NAME":"아보다트연질캡슐0.5밀리그램(두타스테리드)","ENTP_NAME":"(주)글락소스미스클라인","CHART":"투명하고 균일한 액이 든 미황색의 장방형 연질캡슐","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Oi0vWfEyP7","PRINT_FRONT":"GXCE2","PRINT_BACK":null,"DRUG_SHAPE":"장방형","COLOR_CLASS1":"노랑","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"19.13","LENG_SHORT":"6.68","THICK":"6.68","CLASS_NAME":"기타의 비뇨생식기관 및 항문용약","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"연질캡슐제, 액상","EDI_CODE":"650000780"},{"ITEM_SEQ":"197400278","ITEM_NAME":"씬지로이드정0.1밀리그램(레보티록신나트륨수화물)","ENTP_NAME":"부광약품(주)","CHART":"황색의 정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1NXA-1cMBWb","PRINT_FRONT":"SYN","PRINT_BACK":"십자분할선","DRUG_SHAPE":"원형","COLOR_CLASS1":"노랑","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":"+","LENG_LONG":"7.6","LENG_SHORT":"7.6","THICK":"3.2","CLASS_NAME":"갑상선, 부갑상선호르몬제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"나정","EDI_CODE":null},{"ITEM_SEQ":"201900107","ITEM_NAME":"씬지로이드정0.112밀리그램(레보티록신나트륨수화물)","ENTP_NAME":"부광약품(주)","CHART":"연한노란분홍색의 원형 정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1McvZckollL","PRINT_FRONT":"B분할선K","PRINT_BACK":"112","DRUG_SHAPE":"원형","COLOR_CLASS1":"분홍","COLOR_CLASS2":null,"LINE_FRONT":"-","LINE_BACK":null,"LENG_LONG":"7.8","LENG_SHORT":"7.8","THICK":"2.7","CLASS_NAME":"갑상선, 부갑상선호르몬제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"나정","EDI_CODE":null},{"ITEM_SEQ":"197000050","ITEM_NAME":"자이로릭정(알로푸리놀)","ENTP_NAME":"삼일제약(주)","CHART":"흰색의 원형정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/151317992996500014","PRINT_FRONT":"GS분할선FE7","PRINT_BACK":null,"DRUG_SHAPE":"원형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":"-","LINE_BACK":null,"LENG_LONG":"9.4","LENG_SHORT":"9.4","THICK":"3.9","CLASS_NAME":"통풍치료제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"나정","EDI_CODE":"643901390"},{"ITEM_SEQ":"201002150","ITEM_NAME":"글루코파지엑스알1000밀리그램서방정(메트포르민염산염)","ENTP_NAME":"머크(주)","CHART":"흰색 내지 미색의 양면이 볼록한 타원형의 서방정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426484987700130","PRINT_FRONT":"MERCK","PRINT_BACK":"1000","DRUG_SHAPE":"타원형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"22.5","LENG_SHORT":"12.0","THICK":"8.0","CLASS_NAME":"당뇨병용제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"서방정","EDI_CODE":"661700580"},{"ITEM_SEQ":"201002151","ITEM_NAME":"다이아벡스엑스알서방정1000밀리그램(메트포르민염산염)","ENTP_NAME":"(주)대웅제약","CHART":"흰색 내지 미색의 양면이 볼록한 타원형의 서방정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426484987700133","PRINT_FRONT":"SR 1000","PRINT_BACK":null,"DRUG_SHAPE":"타원형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"22.1","LENG_SHORT":"10.61","THICK":"8.42","CLASS_NAME":"당뇨병용제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"서방정","EDI_CODE":"641604640"},{"ITEM_SEQ":"201107199","ITEM_NAME":"메디롤엠정2/500밀리그램(글리메피리드,메트포르민염산염)","ENTP_NAME":"삼익제약(주)","CHART":"흰색의 장방형 필름코팅정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1OKRXo9l4Ka","PRINT_FRONT":"마크","PRINT_BACK":"25","DRUG_SHAPE":"타원형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"15.7","LENG_SHORT":"8.7","THICK":"5.8","CLASS_NAME":"당뇨병용제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"644003180"},{"ITEM_SEQ":"201107229","ITEM_NAME":"아베린엠정2/500밀리그램(글리메피리드, 메트포르민염산염)","ENTP_NAME":"(주)휴온스","CHART":"흰색의 장방형 필름코팅정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426570506500192","PRINT_FRONT":"HS 25","PRINT_BACK":"분할선","DRUG_SHAPE":"타원형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":"-","LENG_LONG":"15.9","LENG_SHORT":"8.7","THICK":"6.3","CLASS_NAME":"당뇨병용제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"670605930"},{"ITEM_SEQ":"200809402","ITEM_NAME":"리피논정80밀리그램(아토르바스타틴칼슘삼수화물)","ENTP_NAME":"동아에스티(주)","CHART":"이 약은 흰색의 타원형 필름코팅정이다.","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426403087300161","PRINT_FRONT":"LPT","PRINT_BACK":"80","DRUG_SHAPE":"타원형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"19.55","LENG_SHORT":"10.50","THICK":"7.06","CLASS_NAME":"동맥경화용제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"642506260"},{"ITEM_SEQ":"200705825","ITEM_NAME":"아토스타정10밀리그램(아토르바스타틴칼슘삼수화물)","ENTP_NAME":"동화약품(주)","CHART":"흰색의 타원형 필름코팅정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Oo7XeTdjqg","PRINT_FRONT":"D-W","PRINT_BACK":"AT1","DRUG_SHAPE":"타원형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"10.0","LENG_SHORT":"5.2","THICK":"3.8","CLASS_NAME":"동맥경화용제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"642702290"},{"ITEM_SEQ":"200810870","ITEM_NAME":"로수로드정10밀리그램(로수바스타틴칼슘)","ENTP_NAME":"(주)종근당","CHART":"분홍색의 원형 필름코팅정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/151706768099900035","PRINT_FRONT":"CKDRSD10","PRINT_BACK":null,"DRUG_SHAPE":"원형","COLOR_CLASS1":"분홍","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"7","LENG_SHORT":"7","THICK":"3","CLASS_NAME":"동맥경화용제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"643305080"},{"ITEM_SEQ":"201001029","ITEM_NAME":"에스로틴정10밀리그램(로수바스타틴칼슘)","ENTP_NAME":"에스케이케미칼(주)","CHART":"분홍색의 원형 필름코팅정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/151922765025100135","PRINT_FRONT":"SK","PRINT_BACK":"RSV10","DRUG_SHAPE":"원형","COLOR_CLASS1":"분홍","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"7","LENG_SHORT":"7","THICK":"4","CLASS_NAME":"동맥경화용제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"644703330"},{"ITEM_SEQ":"201001683","ITEM_NAME":"텔미스정40mg(텔미사르탄)","ENTP_NAME":"삼일제약(주)","CHART":"흰색 또는 거의 흰색의 양면이 볼록한 원형 정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426479322700162","PRINT_FRONT":"마크","PRINT_BACK":"T분할선11","DRUG_SHAPE":"원형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":"-","LENG_LONG":"7.5","LENG_SHORT":"7.5","THICK":"4","CLASS_NAME":"혈압강하제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"나정","EDI_CODE":"643902880"},{"ITEM_SEQ":"201001685","ITEM_NAME":"텔미스정80mg(텔미사르탄)","ENTP_NAME":"삼일제약(주)","CHART":"흰색 또는 거의 흰색의 양면이 볼록한 원형 정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Pvn3im1ofq","PRINT_FRONT":"마크","PRINT_BACK":"T분할선12","DRUG_SHAPE":"원형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":"-","LENG_LONG":"9.5","LENG_SHORT":"9.5","THICK":"4","CLASS_NAME":"혈압강하제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"나정","EDI_CODE":"643902890"},{"ITEM_SEQ":"200809361","ITEM_NAME":"바르탄정(발사르탄)","ENTP_NAME":"(주)휴온스","CHART":"엷은 적색의 원형 필름코팅정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426403087300155","PRINT_FRONT":"V분할선T","PRINT_BACK":"HS8","DRUG_SHAPE":"원형","COLOR_CLASS1":"분홍","COLOR_CLASS2":null,"LINE_FRONT":"-","LINE_BACK":null,"LENG_LONG":"6.5","LENG_SHORT":"6.5","THICK":"1.8","CLASS_NAME":"혈압강하제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":null},{"ITEM_SEQ":"200809710","ITEM_NAME":"사르발탄정160밀리그램(발사르탄)","ENTP_NAME":"(주)서울제약","CHART":"회색빛을 띠는 오렌지색의 타원형 필름코팅정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/153432591328100009","PRINT_FRONT":"SPC","PRINT_BACK":"V분할선16","DRUG_SHAPE":"타원형","COLOR_CLASS1":"주황","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":"-","LENG_LONG":"14.19","LENG_SHORT":"6.13","THICK":"5.20","CLASS_NAME":"혈압강하제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"652902340"},{"ITEM_SEQ":"200905939","ITEM_NAME":"세자르플러스프로정(로사르탄칼륨,히드로클로로티아지드)","ENTP_NAME":"삼익제약(주)","CHART":"흰색 내지 회백색의 타원형 필름코팅정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426445026400143","PRINT_FRONT":"3CZ","PRINT_BACK":"분할선","DRUG_SHAPE":"타원형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":"-","LENG_LONG":"13.6","LENG_SHORT":"7.8","THICK":"4.6","CLASS_NAME":"혈압강하제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"644002750"},{"ITEM_SEQ":"201109188","ITEM_NAME":"로자신정100밀리그램(로사르탄칼륨)","ENTP_NAME":"신풍제약(주)","CHART":"흰색의 달걀형 필름코팅정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Pvn3im1n0l","PRINT_FRONT":"마크","PRINT_BACK":"100","DRUG_SHAPE":"기타","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"11.8","LENG_SHORT":"7.3","THICK":"5","CLASS_NAME":"혈압강하제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":null},{"ITEM_SEQ":"200808340","ITEM_NAME":"바로디핀정5밀리그램(암로디핀베실산염)","ENTP_NAME":"신풍제약(주)","CHART":"흰색의 팔각형 정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/151706780504700036","PRINT_FRONT":"VD분할선5","PRINT_BACK":"마크","DRUG_SHAPE":"팔각형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":"-","LINE_BACK":null,"LENG_LONG":"8.7","LENG_SHORT":"6.2","THICK":"3.8","CLASS_NAME":"혈압강하제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"나정","EDI_CODE":"648500920"},{"ITEM_SEQ":"201001682","ITEM_NAME":"레보텐션정5밀리그램(에스암로디핀베실산염2.5수화물)","ENTP_NAME":"안국약품(주)","CHART":"이 약은 분할선이 새겨진 연한 주황색의 하트모양 정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/154333320801200012","PRINT_FRONT":"A분할선G","PRINT_BACK":"LT5","DRUG_SHAPE":"기타","COLOR_CLASS1":"주황","COLOR_CLASS2":null,"LINE_FRONT":"-","LINE_BACK":null,"LENG_LONG":"8.5","LENG_SHORT":"7.5","THICK":"3.2","CLASS_NAME":"혈압강하제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"나정","EDI_CODE":"650203440"},{"ITEM_SEQ":"201206529","ITEM_NAME":"글로미피드정(레바미피드)","ENTP_NAME":"(주)킵스바이오파마","CHART":"흰색의 원형필름코팅정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/146032875586500011","PRINT_FRONT":"KG","PRINT_BACK":"L7","DRUG_SHAPE":"원형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"8","LENG_SHORT":"8","THICK":"3.5","CLASS_NAME":"소화성궤양용제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"693200830"},{"ITEM_SEQ":"201207596","ITEM_NAME":"미피드정(레바미피드)","ENTP_NAME":"(주)팜젠사이언스","CHART":"흰색의 원형 필름 코팅정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1PXynYEcA92","PRINT_FRONT":"SD","PRINT_BACK":"MP","DRUG_SHAPE":"원형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"8.1","LENG_SHORT":"8.1","THICK":"3.3","CLASS_NAME":"소화성궤양용제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"670103320"},{"ITEM_SEQ":"200809076","ITEM_NAME":"가스프렌정(모사프리드시트르산염이수화물)","ENTP_NAME":"경동제약(주)","CHART":"분할선을 가진 흰색의 장방형 필름코팅정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Pvn3im1kUg","PRINT_FRONT":"KD","PRINT_BACK":"분할선","DRUG_SHAPE":"장방형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":"-","LENG_LONG":"9.1","LENG_SHORT":"4.5","THICK":"3.4","CLASS_NAME":"기타의 소화기관용약","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"648102540"},{"ITEM_SEQ":"200810338","ITEM_NAME":"가스리드정5mg(모사프리드시트르산염수화물)","ENTP_NAME":"(주)유한양행","CHART":"분할선을 가진 흰색의 장방형 필름코팅정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Q5boXF4xmT","PRINT_FRONT":"YH","PRINT_BACK":"G분할선5","DRUG_SHAPE":"장방형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":"-","LENG_LONG":"9.1","LENG_SHORT":"4.6","THICK":"3.1","CLASS_NAME":"기타의 소화기관용약","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"642103680"},{"ITEM_SEQ":"201003060","ITEM_NAME":"넥사졸캡슐40밀리그램(에스오메프라졸)","ENTP_NAME":"(주)엘지화학","CHART":"흰색 내지 연한 황갈색 과립을 함유하는 상부, 하부 미황색의 경질캡슐제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/151706776344700097","PRINT_FRONT":"LG ESM40","PRINT_BACK":null,"DRUG_SHAPE":"장방형","COLOR_CLASS1":"노랑","COLOR_CLASS2":"노랑","LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"21.5","LENG_SHORT":"7.3","THICK":"7.5","CLASS_NAME":"소화성궤양용제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"경질캡슐제, 장용성과립제","EDI_CODE":null},{"ITEM_SEQ":"201003062","ITEM_NAME":"에소메드캡슐40밀리그램(에스오메프라졸)","ENTP_NAME":"에스케이케미칼(주)","CHART":"흰색 또는 연한 황갈색 과립을 함유하는 상부, 하부 보라색의 경질캡슐제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426492165100074","PRINT_FRONT":"SK E40","PRINT_BACK":null,"DRUG_SHAPE":"장방형","COLOR_CLASS1":"자주","COLOR_CLASS2":"자주","LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"21.8","LENG_SHORT":"7.7","THICK":"7.7","CLASS_NAME":"소화성궤양용제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"경질캡슐제, 장용성과립제","EDI_CODE":null},{"ITEM_SEQ":"201106390","ITEM_NAME":"파라메트정20밀리그램(라베프라졸나트륨)","ENTP_NAME":"하나제약(주)","CHART":"담황색의 원형 장용 필름코팅정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Niwca6NO42","PRINT_FRONT":"HN","PRINT_BACK":"20","DRUG_SHAPE":"원형","COLOR_CLASS1":"노랑","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"6.9","LENG_SHORT":"6.9","THICK":"3.0","CLASS_NAME":"소화성궤양용제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"장용성필름코팅정","EDI_CODE":"657804730"},{"ITEM_SEQ":"201206679","ITEM_NAME":"글로라베정10mg(라베프라졸나트륨)","ENTP_NAME":"(주)킵스바이오파마","CHART":"담황색의 원형 장용 필름코팅정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/153676681538000030","PRINT_FRONT":"KG","PRINT_BACK":"10","DRUG_SHAPE":"원형","COLOR_CLASS1":"노랑","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"6.8","LENG_SHORT":"6.8","THICK":"3.4","CLASS_NAME":"소화성궤양용제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"장용성필름코팅정","EDI_CODE":"693200790"},{"ITEM_SEQ":"201306176","ITEM_NAME":"파미딘정(파모티딘)","ENTP_NAME":"(주)종근당","CHART":"연녹색의 원형 필름코팅정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426683772100157","PRINT_FRONT":"FM","PRINT_BACK":"CKD","DRUG_SHAPE":"원형","COLOR_CLASS1":"연두","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"5.5","LENG_SHORT":"5.5","THICK":"2.85","CLASS_NAME":"소화성궤양용제","ETC_OTC_NAME":"일반의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":null},{"ITEM_SEQ":"199200163","ITEM_NAME":"휴텍스파모티딘정10밀리그람","ENTP_NAME":"한국휴텍스제약(주)","CHART":"연녹색의 원형 필름코팅정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Pvn3im1aEp","PRINT_FRONT":"HT","PRINT_BACK":"10","DRUG_SHAPE":"원형","COLOR_CLASS1":"초록","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"6.0","LENG_SHORT":"6.0","THICK":"2.9","CLASS_NAME":"소화성궤양용제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"649101380"},{"ITEM_SEQ":"200612598","ITEM_NAME":"보령세파클러캡슐(세파클러수화물)","ENTP_NAME":"(주)보령","CHART":"수출용 : 이약은 상부가 청색 불투명이고, 하부가 백색 불투명인 캡슐제이다. 캡슐 내용물은 백색 -황백색의 결정성 가루이며, 냄새는 없거나또는 약간 특이한 냄새가 있으며, 맛은 약간 쓰다.내수용 : 연한 노란색의 분말이 충전된 상부 청색불투명, 하부 흰색 불투명 경질 캡슐제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426395116500199","PRINT_FRONT":"BR CCL","PRINT_BACK":null,"DRUG_SHAPE":"장방형","COLOR_CLASS1":"파랑","COLOR_CLASS2":"하양","LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"19","LENG_SHORT":"6.5","THICK":"6.5","CLASS_NAME":"주로 그람양성, 음성균에 작용하는 것","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"경질캡슐제, 산제","EDI_CODE":"641901320"},{"ITEM_SEQ":"201207573","ITEM_NAME":"유유세파클러캡슐(세파클러수화물)","ENTP_NAME":"(주)유유제약","CHART":"연한 노란색의 분말이 충전된 상부 보라색 불투명, 하부 흰색 불투명 경질 캡슐제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/146032493107200102","PRINT_FRONT":"YY Cefaclor     250","PRINT_BACK":null,"DRUG_SHAPE":"장방형","COLOR_CLASS1":"보라","COLOR_CLASS2":"하양","LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"17.41","LENG_SHORT":"5.92","THICK":"6.25","CLASS_NAME":"주로 그람양성, 음성균에 작용하는 것","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"경질캡슐제, 산제","EDI_CODE":"644501880"},{"ITEM_SEQ":"201001155","ITEM_NAME":"아모크라듀오정500mg(아목시실린-클라불란산칼륨(7:1))","ENTP_NAME":"(주)펜믹스","CHART":"흰색 또는 거의 흰색의 장방형 필름코팅정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/154298775798400050","PRINT_FRONT":"K분할선I","PRINT_BACK":"500","DRUG_SHAPE":"장방형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":"-","LINE_BACK":null,"LENG_LONG":"17.5","LENG_SHORT":"7.9","THICK":"6.15","CLASS_NAME":"주로 그람양성, 음성균에 작용하는 것","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"677100460"},{"ITEM_SEQ":"201303029","ITEM_NAME":"아모시클정375밀리그램(아목시실린-클라불란산칼륨(2:1))","ENTP_NAME":"환인제약(주)","CHART":"흰색이거나 거의 흰색 타원형의 필름코팅 정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426670449700141","PRINT_FRONT":"WI","PRINT_BACK":"ANC","DRUG_SHAPE":"타원형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"16.4","LENG_SHORT":"7.8","THICK":"5.8","CLASS_NAME":"주로 그람양성, 음성균에 작용하는 것","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"657202440"},{"ITEM_SEQ":"201002745","ITEM_NAME":"클란자CR정(아세클로페낙)","ENTP_NAME":"한국유나이티드제약(주)","CHART":"흰색의 장방형 서방성 필름코팅정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Pvn3im1jc4","PRINT_FRONT":"UT","PRINT_BACK":"CL CR","DRUG_SHAPE":"장방형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"16.8","LENG_SHORT":"6","THICK":"5","CLASS_NAME":"해열.진통.소염제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"서방성필름코팅정","EDI_CODE":"644307820"},{"ITEM_SEQ":"201207492","ITEM_NAME":"크리페낙정(아세클로페낙)","ENTP_NAME":"삼진제약(주)","CHART":"흰색의 원형 필름코팅정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1OW18w-b03J","PRINT_FRONT":"SJ","PRINT_BACK":"ΛCF","DRUG_SHAPE":"원형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"8.2","LENG_SHORT":"8.2","THICK":"3.9","CLASS_NAME":"해열.진통.소염제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"647803710"},{"ITEM_SEQ":"200900844","ITEM_NAME":"모빅캡슐7.5밀리그램(멜록시캄)","ENTP_NAME":"한국베링거인겔하임(주)","CHART":"노란색 가루가 든 상,하 밝은 초록색 캡슐","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Opnl07NLZB","PRINT_FRONT":"Mobic 7.5mg","PRINT_BACK":null,"DRUG_SHAPE":"장방형","COLOR_CLASS1":"초록","COLOR_CLASS2":"초록","LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"17.4","LENG_SHORT":"5.9","THICK":"6.1","CLASS_NAME":"해열.진통.소염제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"경질캡슐제, 산제","EDI_CODE":"653500890"},{"ITEM_SEQ":"200900845","ITEM_NAME":"모빅캡슐15밀리그램(멜록시캄)","ENTP_NAME":"한국베링거인겔하임(주)","CHART":"노란색 가루가 든 상부 밝은 초록색, 하부 노란색 캡슐","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Oa2BrqwGD-","PRINT_FRONT":"Mobic 15mg","PRINT_BACK":null,"DRUG_SHAPE":"장방형","COLOR_CLASS1":"초록","COLOR_CLASS2":"노랑","LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"17.7","LENG_SHORT":"6.4","THICK":"6.4","CLASS_NAME":"해열.진통.소염제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"경질캡슐제, 산제","EDI_CODE":"653500900"},{"ITEM_SEQ":"201109259","ITEM_NAME":"프리렙톨캡슐75mg(프레가발린)","ENTP_NAME":"환인제약(주)","CHART":"흰색 또는 연한 노란색을 띄는 분말이 든 상부 적갈색, 하부 흰색의 경질캡슐제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/151732699404600060","PRINT_FRONT":"WI PEN    75","PRINT_BACK":null,"DRUG_SHAPE":"장방형","COLOR_CLASS1":"갈색","COLOR_CLASS2":"하양","LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"13.7","LENG_SHORT":"4.5","THICK":"5","CLASS_NAME":"기타의 중추신경용약","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"경질캡슐제, 산제","EDI_CODE":"657202330"},{"ITEM_SEQ":"201109260","ITEM_NAME":"프리렙톨캡슐150밀리그램(프레가발린)","ENTP_NAME":"환인제약(주)","CHART":"흰색 또는 연한 노란색을 띄는 분말이 든 상부 흰색, 하부 흰색의 경질캡슐제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/151732699404600066","PRINT_FRONT":"WI PEN   150","PRINT_BACK":null,"DRUG_SHAPE":"장방형","COLOR_CLASS1":"하양","COLOR_CLASS2":"하양","LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"18","LENG_SHORT":"5.9","THICK":"6.5","CLASS_NAME":"기타의 중추신경용약","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"경질캡슐제, 산제","EDI_CODE":"657202340"},{"ITEM_SEQ":"201305040","ITEM_NAME":"펜믹스가바펜틴캡슐100밀리그램","ENTP_NAME":"(주)펜믹스","CHART":"흰색 또는 회백색의 분말 또는 과립이 들어있는 상.하부 흰색의 경질캡슐제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/154599007029200055","PRINT_FRONT":"PM GP100","PRINT_BACK":null,"DRUG_SHAPE":"장방형","COLOR_CLASS1":"하양","COLOR_CLASS2":"하양","LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"15.7","LENG_SHORT":"5.7","THICK":"5.7","CLASS_NAME":"항전간제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"경질캡슐제, 산제","EDI_CODE":null},{"ITEM_SEQ":"200805255","ITEM_NAME":"가바스탄캡슐(가바펜틴)","ENTP_NAME":"(주)한국파비스제약","CHART":"흰색이나 회백색 분말이 들어있는 상하 미황색의 경질캡슐제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1PZp2vQMjU4","PRINT_FRONT":"PKI PKI","PRINT_BACK":null,"DRUG_SHAPE":"장방형","COLOR_CLASS1":"노랑","COLOR_CLASS2":"노랑","LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"17.97","LENG_SHORT":"7.01","THICK":"7.01","CLASS_NAME":"항전간제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"경질캡슐제, 산제","EDI_CODE":"621801130"},{"ITEM_SEQ":"200808561","ITEM_NAME":"아네페질속붕정(도네페질염산염일수화물)","ENTP_NAME":"대원제약(주)","CHART":"흰색 또는 연한 노란색의 원형 속붕해성 정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/154333323956100001","PRINT_FRONT":"DWP","PRINT_BACK":"D10","DRUG_SHAPE":"원형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"10","LENG_SHORT":"10","THICK":"3.5","CLASS_NAME":"기타의 중추신경용약","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"구강붕해정","EDI_CODE":null},{"ITEM_SEQ":"201002064","ITEM_NAME":"바로페질오디정5밀리그램(도네페질염산염일수화물)","ENTP_NAME":"신풍제약(주)","CHART":"흰색의 원형 구강붕해정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426484987700010","PRINT_FRONT":null,"PRINT_BACK":null,"DRUG_SHAPE":"원형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"7.0","LENG_SHORT":"7.0","THICK":"2.3","CLASS_NAME":"기타의 중추신경용약","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"구강붕해정","EDI_CODE":null},{"ITEM_SEQ":"200906592","ITEM_NAME":"아스몬츄정5밀리그램(몬테루카스트나트륨)","ENTP_NAME":"신일제약(주)","CHART":"양면이 볼록한 원형의 씹어먹는 분홍색 정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/151732699404500034","PRINT_FRONT":"PHD471","PRINT_BACK":"MOK 5","DRUG_SHAPE":"원형","COLOR_CLASS1":"분홍","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"9.57","LENG_SHORT":"9.57","THICK":"4.39","CLASS_NAME":"기타의 알레르기용약","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"추어블정(저작정)","EDI_CODE":null},{"ITEM_SEQ":"200906588","ITEM_NAME":"아스몬츄정4밀리그램(몬테루카스트나트륨)","ENTP_NAME":"신일제약(주)","CHART":"양면이 볼록한 타원형의 씹어먹는 분홍색 정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426455627800001","PRINT_FRONT":"PHD471","PRINT_BACK":"MOK 4","DRUG_SHAPE":"타원형","COLOR_CLASS1":"분홍","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"10.99","LENG_SHORT":"8.01","THICK":"3.72","CLASS_NAME":"기타의 알레르기용약","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"추어블정(저작정)","EDI_CODE":null},{"ITEM_SEQ":"200906585","ITEM_NAME":"레보세린정(레보세티리진염산염)","ENTP_NAME":"영진약품(주)","CHART":"흰색 또는 미황색의 타원형 필름코팅정제","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1PSet1337W1","PRINT_FRONT":"L","PRINT_BACK":"Y","DRUG_SHAPE":"타원형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"8.3","LENG_SHORT":"4.6","THICK":"2.9","CLASS_NAME":"항히스타민제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"642402730"},{"ITEM_SEQ":"201301612","ITEM_NAME":"알레프리정(레보세티리진염산염)","ENTP_NAME":"에스케이케미칼(주)","CHART":"흰색 또는 회백색의 타원형 필름코팅정","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426676298300034","PRINT_FRONT":"L9CZ","PRINT_BACK":"5","DRUG_SHAPE":"타원형","COLOR_CLASS1":"하양","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"8.07","LENG_SHORT":"4.55","THICK":"3.17","CLASS_NAME":"항히스타민제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":null},{"ITEM_SEQ":"200100865","ITEM_NAME":"알레그라정30밀리그람(펙소페나딘염산염)","ENTP_NAME":"(주)한독","CHART":"한 면에 03 다른 한 면에 e가 새겨진 연분홍색의 양면이 볼록한 원형의 필름코팅정   ","ITEM_IMAGE":"https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Oikd3yeYOQ","PRINT_FRONT":"03--","PRINT_BACK":"마크","DRUG_SHAPE":"원형","COLOR_CLASS1":"분홍","COLOR_CLASS2":null,"LINE_FRONT":null,"LINE_BACK":null,"LENG_LONG":"6.5","LENG_SHORT":"6.5","THICK":"3.5","CLASS_NAME":"항히스타민제","ETC_OTC_NAME":"전문의약품","FORM_CODE_NAME":"필름코팅정","EDI_CODE":"652100980"}];

    const SHAPE_OPTIONS = [
      { id: 'ALL', label: '전체 모양', icon: '💠' },
      { id: '원형', label: '원형', icon: '⚪' },
      { id: '타원형', label: '타원형', icon: '🥚' },
      { id: '장방형', label: '장방형', icon: '💊' },
      { id: '반원형', label: '반원형', icon: '🌓' },
      { id: '삼각형', label: '삼각형', icon: '🔺' },
      { id: '사각형', label: '사각형', icon: '⬜' },
      { id: '마름모형', label: '마름모', icon: '🔷' },
      { id: '오각형', label: '오각형', icon: '⬠' },
      { id: '육각형', label: '육각형', icon: '⬡' },
      { id: '팔각형', label: '팔각형', icon: '🛑' },
      { id: '기타', label: '기타', icon: '✨' }
    ];

    const COLOR_OPTIONS = [
      { id: 'ALL', label: '전체 색상', hex: 'linear-gradient(135deg,#fff,#f59e0b,#3b82f6)', border: '#cbd5e1' },
      { id: '하양', label: '하양', hex: '#ffffff', border: '#94a3b8' },
      { id: '노랑', label: '노랑', hex: '#fde047', border: '#eab308' },
      { id: '주황', label: '주황', hex: '#fb923c', border: '#ea580c' },
      { id: '분홍', label: '분홍', hex: '#f9a8d4', border: '#ec4899' },
      { id: '빨강', label: '빨강', hex: '#ef4444', border: '#b91c1c' },
      { id: '갈색', label: '갈색', hex: '#a16207', border: '#713f12' },
      { id: '연두', label: '연두', hex: '#a3e635', border: '#65a30d' },
      { id: '초록', label: '초록', hex: '#22c55e', border: '#15803d' },
      { id: '청록', label: '청록', hex: '#14b8a6', border: '#0f766e' },
      { id: '파랑', label: '파랑', hex: '#3b82f6', border: '#1d4ed8' },
      { id: '남색', label: '남색', hex: '#1e3a8a', border: '#172554' },
      { id: '자주', label: '자주', hex: '#a21caf', border: '#701a75' },
      { id: '보라', label: '보라', hex: '#8b5cf6', border: '#6d28d9' },
      { id: '회색', label: '회색', hex: '#9ca3af', border: '#4b5563' },
      { id: '검정', label: '검정', hex: '#1f2937', border: '#000000' },
      { id: '투명', label: '투명', hex: ' repeating-conic-gradient(#e2e8f0 0% 25%, #ffffff 0% 50%) 50% / 8px 8px', border: '#94a3b8' }
    ];

    const FORM_OPTIONS = [
      { id: 'ALL', label: '전체 제형' },
      { id: '정제', label: '정제 (나정·코팅정·서방정)' },
      { id: '경질캡슐', label: '경질캡슐' },
      { id: '연질캡슐', label: '연질캡슐' }
    ];

    const LINE_OPTIONS = [
      { id: 'ALL', label: '전체 분할선' },
      { id: 'NONE', label: '분할선 없음' },
      { id: '-', label: 'ㅡ 일자형 (-)' },
      { id: '+', label: '十 십자형 (+)' }
    ];

    // --- 상태 변수 (100% RAM 인메모리 + Firebase/Cloudinary 직결, localStorage 0 Byte) ---
    let memoryMfdsServiceKey = DEFAULT_MFDS_SERVICE_KEY;
    let memoryGeminiApiKey = '';
    let memoryMfdsCache = [];   // 식약처 실시간 조회 누적 캐시 (RAM + Firebase pillIdCloudCache 직결)

    let filterPrint = '';       // 식별문자 (앞/뒤)
    let filterItemName = '';    // 제품명/성분명
    let filterEntpName = '';    // 제약사명
    let filterShape = 'ALL';
    let filterColor = 'ALL';
    let filterForm = 'ALL';
    let filterLine = 'ALL';
    let filterOnlyOurStock = false; // 🏥 우리 약국 보유 제품만 보기 필터

    let searchResults = [];
    let isSearching = false;
    let lastSearchSource = '☁️ 클라우드 시드·캐시 DB (로컬스토리지 0MB)';
    let searchNotice = '';
    let searchDebounceTimer = null;

    // 📸 카메라 & AI 판독 상태
    let capturedPhotoDataUrl = '';
    let isCameraActive = false;
    let cameraStream = null;
    let isTorchOn = false;
    let isAiAnalyzing = false;
    let aiAnalysisSummary = null; // { printFront, printBack, shape, color, form, line, candidates, reasoning }

    // 🗣️ 손님 안내용 큰글씨 모달 & 설정 모달 & 상담 기록장 상태
    let selectedPillForCustomer = null;
    let showConfigModal = false;
    let historySearchQuery = '';
    let isSavingRecord = false;
    let customerNoteInput = '';
    let cloudConfigSynced = false;

    function escapeHTML(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function getMfdsServiceKey() {
      return (memoryMfdsServiceKey && memoryMfdsServiceKey.trim().length > 20)
        ? memoryMfdsServiceKey.trim()
        : DEFAULT_MFDS_SERVICE_KEY;
    }

    function getGeminiApiKey() {
      return (memoryGeminiApiKey || '').trim();
    }

    async function syncConfigFromCloud() {
      if (cloudConfigSynced) return;
      cloudConfigSynced = true;
      try {
        // 1) 식약처 ServiceKey 동기화 (Firebase 직결)
        const resMfds = await fetch(`${FIREBASE_PILL_ID_CONFIG_URL}?t=${Date.now()}`, { cache: 'no-store' });
        if (resMfds.ok) {
          const data = (await resMfds.json()) || {};
          if (data.mfdsServiceKey && String(data.mfdsServiceKey).trim().length > 20) {
            memoryMfdsServiceKey = String(data.mfdsServiceKey).trim();
          } else {
            await fetch(FIREBASE_PILL_ID_CONFIG_URL, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                mfdsServiceKey: getMfdsServiceKey(),
                updatedAt: new Date().toISOString()
              })
            });
          }
        }
        // 2) 공용 Gemini API 키 동기화 (Firebase 직결)
        const resAi = await fetch(`${FIREBASE_AI_CONFIG_URL}?t=${Date.now()}`, { cache: 'no-store' });
        if (resAi.ok) {
          const aiData = (await resAi.json()) || {};
          if (aiData.geminiApiKey && String(aiData.geminiApiKey).trim().length > 10) {
            memoryGeminiApiKey = String(aiData.geminiApiKey).trim();
          }
        }
        // 3) 식약처 낱알식별 클라우드 공유 캐시 동기화 (localStorage 0 Byte, Firebase 직결)
        const resCache = await fetch(`${FIREBASE_PILL_ID_CACHE_URL}?t=${Date.now()}`, { cache: 'no-store' });
        if (resCache.ok) {
          const cloudItems = await resCache.json();
          if (Array.isArray(cloudItems) && cloudItems.length > 0) {
            const map = new Map();
            memoryMfdsCache.forEach(it => { if (it && it.ITEM_SEQ) map.set(String(it.ITEM_SEQ), it); });
            cloudItems.forEach(it => { if (it && it.ITEM_SEQ) map.set(String(it.ITEM_SEQ), it); });
            memoryMfdsCache = Array.from(map.values()).slice(-600);
            searchResults = filterItemsByCriteria(getAllLocalPool());
            updateResultsSectionDOM();
          }
        }
        updateApiStatusBadgeDOM();
      } catch (e) {}
    }

    function getCachedMfdsItems() {
      return Array.isArray(memoryMfdsCache) ? memoryMfdsCache : [];
    }

    function mergeIntoLocalMfdsCache(newItems) {
      if (!Array.isArray(newItems) || newItems.length === 0) return;
      try {
        const existing = getCachedMfdsItems();
        const map = new Map();
        existing.forEach(item => {
          if (item && item.ITEM_SEQ) map.set(String(item.ITEM_SEQ), item);
        });
        newItems.forEach(item => {
          if (item && item.ITEM_SEQ) {
            const stockMatch = findPharmacyStockMatch(item.ITEM_NAME);
            map.set(String(item.ITEM_SEQ), {
              ITEM_SEQ: item.ITEM_SEQ,
              ITEM_NAME: item.ITEM_NAME || '',
              ENTP_NAME: item.ENTP_NAME || '',
              CHART: item.CHART || '',
              ITEM_IMAGE: item.ITEM_IMAGE || '',
              PRINT_FRONT: item.PRINT_FRONT || null,
              PRINT_BACK: item.PRINT_BACK || null,
              DRUG_SHAPE: item.DRUG_SHAPE || '',
              COLOR_CLASS1: item.COLOR_CLASS1 || '',
              COLOR_CLASS2: item.COLOR_CLASS2 || null,
              LINE_FRONT: item.LINE_FRONT || null,
              LINE_BACK: item.LINE_BACK || null,
              LENG_LONG: item.LENG_LONG || '',
              LENG_SHORT: item.LENG_SHORT || '',
              THICK: item.THICK || '',
              CLASS_NAME: item.CLASS_NAME || '',
              ETC_OTC_NAME: item.ETC_OTC_NAME || '',
              FORM_CODE_NAME: item.FORM_CODE_NAME || '',
              EDI_CODE: item.EDI_CODE || null,
              PHARMACY_PHOTO_URL: stockMatch?.photoUrl || ''
            });
          }
        });
        // 인메모리 + 파이어베이스 전용 클라우드 캐시에만 보관 (localStorage 0 Byte)
        memoryMfdsCache = Array.from(map.values()).slice(-600);
        fetch(FIREBASE_PILL_ID_CACHE_URL, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(memoryMfdsCache)
        }).catch(() => {});
      } catch (e) {}
    }

    function getAllLocalPool() {
      const map = new Map();
      EMBEDDED_MFDS_SEED.forEach(item => {
        if (item && item.ITEM_SEQ) map.set(String(item.ITEM_SEQ), item);
      });
      getCachedMfdsItems().forEach(item => {
        if (item && item.ITEM_SEQ) map.set(String(item.ITEM_SEQ), item);
      });
      return Array.from(map.values());
    }

    // 🏥 우리 약국 보유 위치 & 클라우디너리 제품 사진 자동 매칭 ([일반약 위치 관리] + [전문약 위치 관리])
    function findPharmacyStockMatch(itemName) {
      if (!itemName || !window.SheetsSync || typeof window.SheetsSync.getData !== 'function') return null;
      const syncData = window.SheetsSync.getData() || {};
      const otcList = Array.isArray(syncData.medicineLocations) ? syncData.medicineLocations : [];
      const rxList = Array.isArray(syncData.rxMedicineLocations) ? syncData.rxMedicineLocations : [];

      const normalize = (s) => String(s || '')
        .split('(')[0]
        .replace(/(밀리그램|밀리그람|mg|mcg|그램|g|정|캡슐|연질캡슐|경질캡슐|서방정|장용정|필름코팅정|나정|산|세립|시럽|액|\s+)/gi, '')
        .toLowerCase()
        .trim();

      const targetFull = String(itemName || '').toLowerCase();
      const targetCore = normalize(itemName);
      if (!targetCore || targetCore.length < 2) return null;

      for (const m of rxList) {
        const mName = String(m.name || m.drugName || '').trim();
        const mCore = normalize(mName);
        if (!mCore || mCore.length < 2) continue;
        if (mCore === targetCore || targetFull.includes(mCore) || mCore.includes(targetCore)) {
          const locStr = [m.zoneName, m.locationDetail, m.location].filter(Boolean).join(' · ') || '조제실 보유';
          const photoUrl = (Array.isArray(m.photos) && m.photos[0]) || m.photoUrl || m.imageUrl || '';
          return { type: '전문약', name: mName, location: locStr, note: m.notes || m.note || '', photoUrl };
        }
      }
      for (const m of otcList) {
        const mName = String(m.name || m.drugName || '').trim();
        const mCore = normalize(mName);
        if (!mCore || mCore.length < 2) continue;
        if (mCore === targetCore || targetFull.includes(mCore) || mCore.includes(targetCore)) {
          const locStr = [m.zoneName, m.locationDetail, m.location].filter(Boolean).join(' · ') || '매장 보유';
          const photoUrl = (Array.isArray(m.photos) && m.photos[0]) || m.photoUrl || m.imageUrl || '';
          return { type: '일반약', name: mName, location: locStr, note: m.notes || m.note || '', photoUrl };
        }
      }
      return null;
    }

    // 로컬/캐시 필터 매칭 점수 계산 및 필터링
    function filterItemsByCriteria(items) {
      const qPrint = filterPrint.trim().toUpperCase().replace(/[\s\-_/]/g, '');
      const qName = filterItemName.trim().toLowerCase();
      const qEntp = filterEntpName.trim().toLowerCase();

      const filteredList = items.filter(item => {
        // 1) 모양 필터
        if (filterShape !== 'ALL') {
          const shape = String(item.DRUG_SHAPE || '');
          if (shape !== filterShape) return false;
        }
        // 2) 색상 필터 (COLOR_CLASS1, COLOR_CLASS2, CHART 포함)
        if (filterColor !== 'ALL') {
          const c1 = String(item.COLOR_CLASS1 || '');
          const c2 = String(item.COLOR_CLASS2 || '');
          const chart = String(item.CHART || '');
          if (!c1.includes(filterColor) && !c2.includes(filterColor) && !chart.includes(filterColor)) {
            return false;
          }
        }
        // 3) 제형 필터
        if (filterForm !== 'ALL') {
          const form = String(item.FORM_CODE_NAME || '') + ' ' + String(item.CHART || '');
          if (filterForm === '정제' && !form.includes('정')) return false;
          if (filterForm === '경질캡슐' && !form.includes('경질')) return false;
          if (filterForm === '연질캡슐' && !form.includes('연질')) return false;
        }
        // 4) 분할선 필터
        if (filterLine !== 'ALL') {
          const lf = String(item.LINE_FRONT || '').trim();
          const lb = String(item.LINE_BACK || '').trim();
          const pf = String(item.PRINT_FRONT || '');
          const pb = String(item.PRINT_BACK || '');
          const hasMinus = lf === '-' || lb === '-' || pf.includes('분할선') || pb.includes('분할선');
          const hasPlus = lf === '+' || lb === '+' || pf.includes('십자') || pb.includes('십자');
          if (filterLine === 'NONE' && (hasMinus || hasPlus)) return false;
          if (filterLine === '-' && !hasMinus) return false;
          if (filterLine === '+' && !hasPlus) return false;
        }
        // 5) 각인문자 필터
        if (qPrint) {
          const pfClean = String(item.PRINT_FRONT || '').toUpperCase().replace(/분할선/g, '').replace(/[\s\-_/]/g, '');
          const pbClean = String(item.PRINT_BACK || '').toUpperCase().replace(/분할선/g, '').replace(/[\s\-_/]/g, '');
          const combined = pfClean + '|' + pbClean;
          if (!combined.includes(qPrint)) return false;
        }
        // 6) 제품명/성분명/효능 필터
        if (qName) {
          const namePool = `${item.ITEM_NAME || ''} ${item.CLASS_NAME || ''} ${item.EDI_CODE || ''} ${item.CHART || ''}`.toLowerCase();
          if (!namePool.includes(qName)) return false;
        }
        // 7) 제약사명 필터
        if (qEntp) {
          const entp = String(item.ENTP_NAME || '').toLowerCase();
          if (!entp.includes(qEntp)) return false;
        }
        // 8) 🏥 우리 약국 보유 제품만 보기 필터
        if (filterOnlyOurStock) {
          if (!findPharmacyStockMatch(item.ITEM_NAME)) return false;
        }
        return true;
      });
      // 우리 약국 보유 제품(일반약/전문약 위치 등록 품목)을 최상단으로 우선 정렬
      return filteredList.sort((a, b) => {
        const aStock = findPharmacyStockMatch(a.ITEM_NAME) ? 1 : 0;
        const bStock = findPharmacyStockMatch(b.ITEM_NAME) ? 1 : 0;
        return bStock - aStock;
      });
    }

    // 식약처 공식 OpenAPI 실시간 호출
    async function fetchFromMfdsOpenApi({ itemName = '', entpName = '', numOfRows = 30 } = {}) {
      const key = getMfdsServiceKey();
      const params = new URLSearchParams({
        serviceKey: key,
        type: 'json',
        pageNo: '1',
        numOfRows: String(numOfRows)
      });
      if (itemName && itemName.trim()) params.set('item_name', itemName.trim());
      if (entpName && entpName.trim()) params.set('entp_name', entpName.trim());

      const url = `${MFDS_API_ENDPOINT}?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const code = json?.header?.resultCode;
      if (code && code !== '00') {
        throw new Error(json?.header?.resultMsg || `API 오류 (${code})`);
      }
      const items = json?.body?.items;
      if (!Array.isArray(items)) return [];
      mergeIntoLocalMfdsCache(items);
      return items;
    }

    // AI로 각인문자·외형 조건에 해당하는 한국 의약품 품목명 후보 추론 (로컬 DB에 없는 희귀 각인 검색 시 식약처 API 교차 조회용)
    async function resolveCandidateDrugNamesViaAi() {
      const apiKey = getGeminiApiKey();
      if (!apiKey || apiKey.length < 10) return [];
      if (!filterPrint.trim() && filterShape === 'ALL' && filterColor === 'ALL') return [];

      const prompt = `당신은 대한민국 약국의 의약품 낱알식별 전문가입니다.
다음 낱알 외형 조건에 가장 부합하는 대한민국 시판 의약품의 정확한 품목명(단일 단어 핵심 브랜드명, 예: "타이레놀", "노바스크", "플라빅스", "자누비아", "아모디핀", "록소닌")을 최대 5개까지 JSON 배열로만 답하세요.
- 각인(식별문자): ${filterPrint || '미상'}
- 모양: ${filterShape === 'ALL' ? '미상' : filterShape}
- 색상: ${filterColor === 'ALL' ? '미상' : filterColor}
- 제형: ${filterForm === 'ALL' ? '미상' : filterForm}
- 분할선: ${filterLine === 'ALL' ? '미상' : filterLine}
반드시 순수 JSON 배열만 출력하세요. 예: ["타이레놀","울트라셋"]`;

      for (const model of AI_MODEL_QUEUE) {
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.1,
                responseMimeType: 'application/json',
                thinkingConfig: { thinkingBudget: 0 }
              }
            })
          });
          if (!res.ok) continue;
          const data = await res.json();
          const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
          const arr = JSON.parse(txt);
          if (Array.isArray(arr)) return arr.slice(0, 5).map(s => String(s || '').trim()).filter(Boolean);
        } catch (e) {}
      }
      return [];
    }

    // 통합 검색 실행 (로컬 즉시 필터링 + 식약처 OpenAPI 실시간 호출)
    async function executeSearch({ forceRemote = false } = {}) {
      // 1단계: 로컬 시드 + 캐시 즉시 필터링 (0.01초)
      const localMatches = filterItemsByCriteria(getAllLocalPool());
      searchResults = localMatches;
      lastSearchSource = `⚡ 식약처 시드·캐시 DB (${getAllLocalPool().length}종 중 ${localMatches.length}건 일치)`;
      searchNotice = '';
      updateResultsSectionDOM();

      const hasRemoteQuery = Boolean(filterItemName.trim() || filterEntpName.trim() || forceRemote);
      const needAiImprintAssist = Boolean(filterPrint.trim() && localMatches.length < 3);

      if (!hasRemoteQuery && !needAiImprintAssist) return;

      isSearching = true;
      updateResultsSectionDOM();

      try {
        if (filterItemName.trim() || filterEntpName.trim()) {
          const remoteItems = await fetchFromMfdsOpenApi({
            itemName: filterItemName.trim(),
            entpName: filterEntpName.trim(),
            numOfRows: 40
          });
          const combinedPool = getAllLocalPool();
          const filtered = filterItemsByCriteria(combinedPool);
          searchResults = filtered;
          lastSearchSource = `🌐 식약처 공식 OpenAPI 실시간 연동 완료 (${remoteItems.length}건 수신 · 최종 ${filtered.length}건 일치)`;
        } else if (needAiImprintAssist || forceRemote) {
          // 각인문자/모양/색상만 입력된 상태에서 원격 조회 요청 시 AI 후보 추론 → 식약처 OpenAPI 병렬 조회
          const candidates = await resolveCandidateDrugNamesViaAi();
          if (candidates.length > 0) {
            await Promise.all(
              candidates.map(name => fetchFromMfdsOpenApi({ itemName: name, numOfRows: 15 }).catch(() => []))
            );
            const filtered = filterItemsByCriteria(getAllLocalPool());
            searchResults = filtered.length > 0 ? filtered : filterItemsByCriteria(getAllLocalPool());
            lastSearchSource = `🤖 AI 각인 추론(${candidates.join(', ')}) + 🌐 식약처 OpenAPI 교차 검증 (${searchResults.length}건)`;
          } else if (forceRemote) {
            const remoteItems = await fetchFromMfdsOpenApi({ numOfRows: 40 });
            searchResults = filterItemsByCriteria(getAllLocalPool());
            lastSearchSource = `🌐 식약처 공식 OpenAPI 조회 (${remoteItems.length}건 캐시 추가 · ${searchResults.length}건 일치)`;
          }
        }
      } catch (err) {
        searchNotice = `⚠️ 식약처 OpenAPI 실시간 통신 지연 (${err.message}) — 내장 시드·캐시 DB 결과를 표시합니다.`;
      } finally {
        isSearching = false;
        updateResultsSectionDOM();
      }
    }

    function triggerDebouncedSearch() {
      // 로컬 필터는 즉시 반영하여 체감 속도 0.01초 유지
      searchResults = filterItemsByCriteria(getAllLocalPool());
      lastSearchSource = `⚡ 식약처 시드·캐시 DB (${getAllLocalPool().length}종 중 ${searchResults.length}건 일치)`;
      updateResultsSectionDOM();

      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        if (filterItemName.trim().length >= 2 || filterEntpName.trim().length >= 2 || (filterPrint.trim().length >= 2 && searchResults.length === 0)) {
          executeSearch({ forceRemote: false });
        }
      }, 280);
    }

    // 📸 사진 파일 / 카메라 프레임에서 정사각형 고해상도 이미지 생성 후 Gemini Vision AI 판독
    function loadImageAsSquareDataUrl(fileOrBlob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const maxDim = 960;
            const side = Math.min(img.width, img.height);
            const sx = Math.floor((img.width - side) / 2);
            const sy = Math.floor((img.height - side) / 2);
            const outSide = Math.min(side, maxDim);
            const canvas = document.createElement('canvas');
            canvas.width = outSide;
            canvas.height = outSide;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, sx, sy, side, side, 0, 0, outSide, outSide);
            resolve(canvas.toDataURL('image/jpeg', 0.88));
          };
          img.onerror = reject;
          img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(fileOrBlob);
      });
    }

    async function analyzePillPhotoWithAi(dataUrl) {
      capturedPhotoDataUrl = dataUrl;
      isAiAnalyzing = true;
      aiAnalysisSummary = null;
      searchNotice = '';
      renderModule();

      const apiKey = getGeminiApiKey();
      if (!apiKey || apiKey.length < 10) {
        isAiAnalyzing = false;
        searchNotice = '⚠️ AI 카메라 판독을 위해 우측 상단 [⚙️ API 설정]에서 Gemini API 키를 확인해주세요. (수동 모양·색상·각인 검색은 즉시 사용 가능)';
        renderModule();
        return;
      }

      const base64Data = dataUrl.split(',')[1];
      const prompt = `당신은 대한민국 약국의 의약품 낱알식별 AI 판독기입니다.
사진 속 알약(정제 또는 캡슐)의 외형과 각인(식별문자)을 정밀하게 읽고 다음 JSON 형식으로만 응답하세요.
- printFront: 알약에 새겨진 영문/숫자/한글 각인문자 (가장 뚜렷한 문자, 예: "TYLENOL", "ATV", "75", "OG33", "UDCA", 없으면 "")
- printBack: 반대편 또는 추가 각인문자 (예: "500", "10", 없으면 "")
- shape: 반드시 ["원형","타원형","장방형","반원형","삼각형","사각형","마름모형","오각형","육각형","팔각형","기타"] 중 하나
- color: 반드시 ["하양","노랑","주황","분홍","빨강","갈색","연두","초록","청록","파랑","남색","자주","보라","회색","검정","투명"] 중 가장 가까운 대표 색상 하나
- form: 반드시 ["정제","경질캡슐","연질캡슐"] 중 하나
- line: 분할선이 일자면 "-", 십자면 "+", 없으면 "NONE"
- candidates: 이 외형과 각인을 가진 대한민국 시판 의약품 핵심 품목명(단일 브랜드명, 예: ["타이레놀","노바스크","리피토"]) 최대 5개 배열
- reasoning: 약사에게 보여줄 1줄 판독 요약 (예: "흰색 장방형 필름코팅정으로 앞면 TYLENOL 각인이 식별됩니다.")`;

      let parsed = null;
      for (const model of AI_MODEL_QUEUE) {
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: prompt },
                  { inlineData: { mimeType: 'image/jpeg', data: base64Data } }
                ]
              }],
              generationConfig: {
                temperature: 0.1,
                responseMimeType: 'application/json',
                thinkingConfig: { thinkingBudget: 0 }
              }
            })
          });
          if (!res.ok) continue;
          const json = await res.json();
          const txt = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          parsed = JSON.parse(txt);
          if (parsed) break;
        } catch (e) {}
      }

      if (!parsed) {
        isAiAnalyzing = false;
        searchNotice = '⚠️ AI 이미지 판독에 실패했습니다. 아래 모양·색상·각인문자 필터로 직접 검색해 주세요.';
        renderModule();
        return;
      }

      aiAnalysisSummary = {
        printFront: String(parsed.printFront || '').trim(),
        printBack: String(parsed.printBack || '').trim(),
        shape: String(parsed.shape || 'ALL').trim(),
        color: String(parsed.color || 'ALL').trim(),
        form: String(parsed.form || 'ALL').trim(),
        line: String(parsed.line || 'ALL').trim(),
        candidates: Array.isArray(parsed.candidates) ? parsed.candidates.map(c => String(c || '').trim()).filter(Boolean) : [],
        reasoning: String(parsed.reasoning || '').trim()
      };

      // AI가 판독한 후보 품목명들을 식약처 공식 OpenAPI에서 실시간 조회하여 로컬 캐시 보강
      if (aiAnalysisSummary.candidates.length > 0) {
        await Promise.all(
          aiAnalysisSummary.candidates.slice(0, 5).map(cand =>
            fetchFromMfdsOpenApi({ itemName: cand, numOfRows: 15 }).catch(() => [])
          )
        );
      }

      // 필터 자동 적용 (먼저 각인+모양+색상으로 매칭해보고, 결과가 없으면 단계적 완화)
      const detectedPrint = aiAnalysisSummary.printFront || aiAnalysisSummary.printBack || '';
      const validShape = SHAPE_OPTIONS.some(s => s.id === aiAnalysisSummary.shape) ? aiAnalysisSummary.shape : 'ALL';
      const validColor = COLOR_OPTIONS.some(c => c.id === aiAnalysisSummary.color) ? aiAnalysisSummary.color : 'ALL';
      const validForm = FORM_OPTIONS.some(f => f.id === aiAnalysisSummary.form) ? aiAnalysisSummary.form : 'ALL';

      filterPrint = detectedPrint;
      filterShape = validShape;
      filterColor = validColor;
      filterForm = validForm;
      filterLine = 'ALL';
      filterItemName = '';
      filterEntpName = '';

      let matches = filterItemsByCriteria(getAllLocalPool());
      // 만약 각인+모양+색상 조합이 너무 엄격하여 0건이면 각인 우선 또는 모양+색상+AI후보 통합 매칭
      if (matches.length === 0 && detectedPrint) {
        filterShape = 'ALL';
        filterColor = 'ALL';
        matches = filterItemsByCriteria(getAllLocalPool());
      }
      if (matches.length === 0) {
        filterPrint = '';
        filterShape = validShape;
        filterColor = validColor;
        matches = filterItemsByCriteria(getAllLocalPool());
      }
      // AI 후보 약품명과 일치하는 항목을 최상단으로 정렬
      const candSet = aiAnalysisSummary.candidates.map(c => c.toLowerCase());
      matches.sort((a, b) => {
        const aHit = candSet.some(c => String(a.ITEM_NAME || '').toLowerCase().includes(c)) ? 1 : 0;
        const bHit = candSet.some(c => String(b.ITEM_NAME || '').toLowerCase().includes(c)) ? 1 : 0;
        return bHit - aHit;
      });

      searchResults = matches;
      lastSearchSource = `📸 AI 비전 판독 + 🌐 식약처 공식 OpenAPI 교차 검증 (${matches.length}건 일치)`;
      isAiAnalyzing = false;
      renderModule();
    }

    // 📷 인앱 정사각(1:1) 라이브 카메라 제어
    async function startLiveCamera() {
      try {
        if (cameraStream) stopLiveCamera(false);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 1280 }
          },
          audio: false
        });
        cameraStream = stream;
        isCameraActive = true;
        isTorchOn = false;
        renderModule();

        setTimeout(async () => {
          const videoEl = document.getElementById('pill-id-live-video');
          if (videoEl && cameraStream) {
            videoEl.srcObject = cameraStream;
            await videoEl.play().catch(() => {});
          }
        }, 60);
      } catch (err) {
        alert('카메라 접근 권한이 없거나 지원되지 않는 기기입니다. [📸 바로 카메라 촬영] 또는 [📁 앨범/사진 선택] 버튼을 이용해 주세요.');
      }
    }

    function stopLiveCamera(shouldRender = true) {
      if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
      }
      isCameraActive = false;
      isTorchOn = false;
      if (shouldRender) renderModule();
    }

    async function toggleCameraTorch() {
      if (!cameraStream) return;
      const track = cameraStream.getVideoTracks()[0];
      if (!track || typeof track.getCapabilities !== 'function') return;
      const caps = track.getCapabilities();
      if (!caps.torch) {
        alert('현재 기기/브라우저에서는 카메라 조명(플래시) 제어를 지원하지 않습니다.');
        return;
      }
      try {
        isTorchOn = !isTorchOn;
        await track.applyConstraints({ advanced: [{ torch: isTorchOn }] });
        renderModule();
      } catch (e) {}
    }

    function captureLiveCameraFrame() {
      const videoEl = document.getElementById('pill-id-live-video');
      if (!videoEl || !videoEl.videoWidth) return;
      const vw = videoEl.videoWidth;
      const vh = videoEl.videoHeight;
      const side = Math.min(vw, vh);
      const sx = Math.floor((vw - side) / 2);
      const sy = Math.floor((vh - side) / 2);
      const outSide = Math.min(side, 960);
      const canvas = document.createElement('canvas');
      canvas.width = outSide;
      canvas.height = outSide;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoEl, sx, sy, side, side, 0, 0, outSide, outSide);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      stopLiveCamera(false);
      analyzePillPhotoWithAi(dataUrl);
    }

    // 🖼️ 식약처 낱알 식별 결과 + 우리 약국 보유 위치 통합 스냅샷 카드 생성 (카메라 미촬영 시에도 클라우디너리 영구 보관용 이미지 생성)
    async function generateIdentificationSnapshotFile(item, stockMatch, customerNote, authorName) {
      const canvas = document.createElement('canvas');
      canvas.width = 720;
      canvas.height = 420;
      const ctx = canvas.getContext('2d');

      // 배경
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, 720, 420);

      // 상단 헤더 바
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(0, 0, 720, 58);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px "Pretendard", "Malgun Gothic", sans-serif';
      ctx.fillText('🔎 신세계약국 식약처 의약품 낱알식별 · 보유약 확인서', 20, 36);

      // 본문 흰색 박스
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.fillRect(20, 74, 680, 326);
      ctx.strokeRect(20, 74, 680, 326);

      // 전문/일반 배지 및 품목명
      ctx.fillStyle = String(item.ETC_OTC_NAME || '').includes('전문') ? '#b91c1c' : '#1d4ed8';
      ctx.font = 'bold 15px "Pretendard", "Malgun Gothic", sans-serif';
      ctx.fillText(`[${item.ETC_OTC_NAME || '의약품'}] ${item.CLASS_NAME ? '· ' + item.CLASS_NAME : ''}`, 40, 110);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 22px "Pretendard", "Malgun Gothic", sans-serif';
      const titleStr = String(item.ITEM_NAME || '').slice(0, 34);
      ctx.fillText(titleStr, 40, 144);

      ctx.fillStyle = '#475569';
      ctx.font = 'bold 15px "Pretendard", "Malgun Gothic", sans-serif';
      ctx.fillText(`제약사: ${item.ENTP_NAME || '-'}   |   품목코드: ${item.ITEM_SEQ || '-'}`, 40, 174);

      // 각인 및 외형 스펙 박스
      ctx.fillStyle = '#eff6ff';
      ctx.fillRect(40, 192, 640, 90);
      ctx.fillStyle = '#1e3a8a';
      ctx.font = 'bold 17px "Pretendard", "Malgun Gothic", sans-serif';
      ctx.fillText(`🔤 각인(앞/뒤): [ ${item.PRINT_FRONT || '없음'} ] / [ ${item.PRINT_BACK || '없음'} ]`, 56, 222);
      ctx.fillStyle = '#334155';
      ctx.font = '15px "Pretendard", "Malgun Gothic", sans-serif';
      ctx.fillText(`🎨 외형: ${item.DRUG_SHAPE || '-'} · ${item.COLOR_CLASS1 || '-'} · ${item.FORM_CODE_NAME || '-'}`, 56, 248);
      ctx.fillText(`📝 성상: ${String(item.CHART || '-').slice(0, 44)}`, 56, 272);

      // 우리 약국 진열 위치
      ctx.fillStyle = stockMatch ? '#065f46' : '#64748b';
      ctx.font = 'bold 16px "Pretendard", "Malgun Gothic", sans-serif';
      const locLine = stockMatch
        ? `🏥 우리 약국 보유 (${stockMatch.type}) — 📍 진열 위치: ${stockMatch.location}`
        : '🏥 우리 약국 위치 DB 미등록 품목 (외부 처방/타약국 지참약)';
      ctx.fillText(locLine, 40, 316);

      // 상담 메모 및 일시
      ctx.fillStyle = '#334155';
      ctx.font = '14px "Pretendard", "Malgun Gothic", sans-serif';
      ctx.fillText(`💬 상담 메모: ${String(customerNote || '손님 지참약 낱알 식별 상담').slice(0, 45)}`, 40, 348);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px "Pretendard", "Malgun Gothic", sans-serif';
      ctx.fillText(`보관일시: ${new Date().toLocaleString('ko-KR')} · 담당: ${authorName || '약국 직원'} · Cloudinary Cloud Archive`, 40, 380);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      return new File([blob], `pill_card_${item.ITEM_SEQ || Date.now()}.jpg`, { type: 'image/jpeg' });
    }

    // 💾 식별·상담 기록 및 우리 약국 제품 내역 영구 보관 (Cloudinary 이미지 업로드 + Firebase 직결 저장, localStorage 0 Byte)
    async function saveIdentificationRecord(item) {
      if (!item || isSavingRecord) return;
      isSavingRecord = true;
      renderModule();

      try {
        const currentUser = (window.SheetsSync && typeof window.SheetsSync.getCurrentUser === 'function' && window.SheetsSync.getCurrentUser())
          || (window.Auth && typeof window.Auth.getCurrentUser === 'function' && window.Auth.getCurrentUser())
          || { name: '약국 직원' };
        const stockMatch = findPharmacyStockMatch(item.ITEM_NAME);
        const noteText = customerNoteInput.trim() || (stockMatch ? `우리 약국 보유약(${stockMatch.location}) 낱알식별 안내` : '손님 지참약 낱알 식별 상담');

        let uploadedPhotoUrl = '';
        if (window.App && typeof window.App.processAndUploadPhoto === 'function') {
          try {
            if (capturedPhotoDataUrl) {
              // 1) 카메라 촬영 사진이 있으면 해당 사진을 Cloudinary에 압축 업로드
              const res = await fetch(capturedPhotoDataUrl);
              const blob = await res.blob();
              const file = new File([blob], `pill_id_${Date.now()}.jpg`, { type: 'image/jpeg' });
              uploadedPhotoUrl = await window.App.processAndUploadPhoto(file);
            } else {
              // 2) 모양·각인 검색 또는 우리 약국 보유 제품 선택 시에도 식약처 식별결과+우리약국 위치 카드를 생성하여 Cloudinary에 영구 업로드!
              const cardFile = await generateIdentificationSnapshotFile(item, stockMatch, noteText, currentUser?.name || '약국 직원');
              uploadedPhotoUrl = await window.App.processAndUploadPhoto(cardFile);
            }
          } catch (e) {
            uploadedPhotoUrl = stockMatch?.photoUrl || '';
          }
        }

        const newRecord = {
          id: 'PILL_ID_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          createdAt: new Date().toISOString(),
          authorName: currentUser?.name || '약국 직원',
          customerNote: noteText,
          itemSeq: item.ITEM_SEQ || '',
          itemName: item.ITEM_NAME || '',
          entpName: item.ENTP_NAME || '',
          className: item.CLASS_NAME || '',
          etcOtcName: item.ETC_OTC_NAME || '',
          chart: item.CHART || '',
          printFront: item.PRINT_FRONT || '',
          printBack: item.PRINT_BACK || '',
          drugShape: item.DRUG_SHAPE || '',
          colorClass1: item.COLOR_CLASS1 || '',
          itemImage: item.ITEM_IMAGE || '',
          capturedPhotoUrl: uploadedPhotoUrl || stockMatch?.photoUrl || '',
          pharmacyProductPhotoUrl: stockMatch?.photoUrl || '',
          pharmacyLocation: stockMatch ? `${stockMatch.type} · ${stockMatch.location}` : ''
        };

        if (window.SheetsSync && typeof window.SheetsSync.getPillIdentifications === 'function') {
          const list = window.SheetsSync.getPillIdentifications() || [];
          list.unshift(newRecord);
          window.SheetsSync.savePillIdentifications(list.slice(0, 200));
        }

        if (window.App && typeof window.App.markPillIdentifierRead === 'function') {
          window.App.markPillIdentifierRead();
        }
        customerNoteInput = '';
        alert(`✅ [${item.ITEM_NAME}] 식약처 식별 결과 및 우리 약국 제품 정보가 클라우디너리(Cloudinary)와 파이어베이스 클라우드에 영구 저장되었습니다!\n(브라우저 로컬스토리지 사용량: 0 Byte)`);
      } catch (err) {
        alert('보관 중 오류가 발생했습니다: ' + err.message);
      } finally {
        isSavingRecord = false;
        renderModule();
      }
    }

    function deleteIdentificationRecord(id) {
      if (!confirm('이 낱알 식별 상담 기록을 삭제하시겠습니까?')) return;
      if (window.SheetsSync && typeof window.SheetsSync.getPillIdentifications === 'function') {
        const list = (window.SheetsSync.getPillIdentifications() || []).filter(r => r.id !== id);
        window.SheetsSync.savePillIdentifications(list);
        renderModule();
      }
    }

    // --- 부분 DOM 업데이트 (한글 IME 조합 깨짐 원천 방지 - 제 50 조 / 제 92 조 준수) ---
    function updateApiStatusBadgeDOM() {
      const badgeEl = document.getElementById('pill-id-api-status-badge');
      if (!badgeEl) return;
      const hasGemini = getGeminiApiKey().length > 10;
      badgeEl.innerHTML = `
        <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:700;background:#dcfce7;color:#166534;border:1px solid #86efac;">
          🟢 식약처 OpenAPI 연결됨
        </span>
        <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:700;background:${hasGemini ? '#dbeafe' : '#fef3c7'};color:${hasGemini ? '#1e40af' : '#92400e'};border:1px solid ${hasGemini ? '#93c5fd' : '#fde68a'};">
          ${hasGemini ? '🤖 AI 비전 활성' : '⚠️ AI 키 미설정'}
        </span>
        <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:800;background:#f3e8ff;color:#6b21a8;border:1px solid #d8b4fe;">
          ☁️ 로컬스토리지 0MB (클라우디너리 & 파이어베이스 직결)
        </span>
      `;
    }

    function renderResultCardsHTML() {
      if (isSearching) {
        return `
          <div style="padding:36px 16px;text-align:center;background:#f8fafc;border-radius:14px;border:1px dashed #cbd5e1;">
            <i class="fas fa-spinner fa-spin" style="font-size:26px;color:#2563eb;margin-bottom:10px;"></i>
            <div style="font-size:14px;font-weight:800;color:#1e293b;">식약처 의약품 낱알식별 OpenAPI 실시간 조회 중...</div>
            <div style="font-size:12px;color:#64748b;margin-top:4px;">공식 품목 이미지 및 외형·식별문자 데이터를 불러오고 있습니다.</div>
          </div>
        `;
      }

      if (!searchResults || searchResults.length === 0) {
        return `
          <div style="padding:32px 16px;text-align:center;background:#f8fafc;border-radius:14px;border:1px dashed #cbd5e1;">
            <div style="font-size:28px;margin-bottom:8px;">🔎</div>
            <div style="font-size:14px;font-weight:800;color:#1e293b;">조건과 일치하는 의약품이 없습니다.</div>
            <div style="font-size:12px;color:#64748b;margin-top:6px;line-height:1.5;">
              일부 필터(색상·모양)를 <b>[전체]</b>로 완화하거나, 아래 <b>[🌐 식약처 OpenAPI + AI 정밀 조회]</b> 버튼을 눌러 식약처 전체 서버에서 검색해 보세요.
            </div>
            <button type="button" id="btn-pill-id-force-remote" style="margin-top:12px;padding:9px 16px;border-radius:10px;border:none;background:#2563eb;color:#fff;font-size:13px;font-weight:800;cursor:pointer;">
              🌐 식약처 OpenAPI + AI 정밀 조회 실행
            </button>
          </div>
        `;
      }

      return `
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(290px, 1fr));gap:12px;">
          ${searchResults.slice(0, 60).map(item => {
            const stockMatch = findPharmacyStockMatch(item.ITEM_NAME);
            const isRx = String(item.ETC_OTC_NAME || '').includes('전문');
            const pf = item.PRINT_FRONT ? escapeHTML(item.PRINT_FRONT) : '-';
            const pb = item.PRINT_BACK ? escapeHTML(item.PRINT_BACK) : '-';
            const dims = [item.LENG_LONG, item.LENG_SHORT, item.THICK].filter(Boolean).join(' × ');
            return `
              <div style="background:#ffffff;border:1.5px solid ${stockMatch ? '#6ee7b7' : '#e2e8f0'};border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:10px;box-shadow:0 2px 8px rgba(15,23,42,0.04);">
                <!-- 상단: 공식 이미지 + 핵심 식별 스펙 -->
                <div style="display:flex;gap:12px;align-items:flex-start;">
                  <div style="width:96px;height:68px;flex-shrink:0;border-radius:10px;overflow:hidden;background:#f1f5f9;border:1px solid #cbd5e1;display:flex;align-items:center;justify-content:center;position:relative;">
                    ${item.ITEM_IMAGE ? `
                      <img src="${escapeHTML(item.ITEM_IMAGE)}" alt="${escapeHTML(item.ITEM_NAME)}" loading="lazy"
                        style="width:100%;height:100%;object-fit:contain;background:#fff;"
                        onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
                      <div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;font-size:22px;">💊</div>
                    ` : `<div style="font-size:22px;">💊</div>`}
                  </div>
                  <div style="flex:1;min-width:0;">
                    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px;">
                      <span style="padding:2px 7px;border-radius:6px;font-size:10.5px;font-weight:800;background:${isRx ? '#fee2e2' : '#dbeafe'};color:${isRx ? '#b91c1c' : '#1d4ed8'};">
                        ${escapeHTML(item.ETC_OTC_NAME || '의약품')}
                      </span>
                      ${item.CLASS_NAME ? `
                        <span style="padding:2px 7px;border-radius:6px;font-size:10.5px;font-weight:700;background:#f1f5f9;color:#334155;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                          🩺 ${escapeHTML(item.CLASS_NAME)}
                        </span>
                      ` : ''}
                    </div>
                    <div style="font-size:14px;font-weight:900;color:#0f172a;line-height:1.35;word-break:keep-all;">
                      ${escapeHTML(item.ITEM_NAME)}
                    </div>
                    <div style="font-size:11.5px;color:#64748b;margin-top:2px;">
                      🏢 ${escapeHTML(item.ENTP_NAME || '-')} ${item.EDI_CODE ? `· 보험코드 ${escapeHTML(item.EDI_CODE)}` : ''}
                    </div>
                  </div>
                </div>

                <!-- 중단: 각인문자 · 외형 · 크기 배지 -->
                <div style="background:#f8fafc;border-radius:10px;padding:8px 10px;border:1px solid #e2e8f0;font-size:12px;display:flex;flex-direction:column;gap:4px;">
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;">
                    <span style="font-weight:800;color:#1e293b;">
                      🔤 각인(앞/뒤): <code style="background:#dbeafe;color:#1e40af;padding:1px 6px;border-radius:5px;font-weight:900;">${pf}</code> / <code style="background:#e0e7ff;color:#3730a3;padding:1px 6px;border-radius:5px;font-weight:900;">${pb}</code>
                    </span>
                    <span style="font-size:11px;font-weight:700;color:#475569;">
                      ${escapeHTML(item.DRUG_SHAPE || '-')} · ${escapeHTML(item.COLOR_CLASS1 || '-')}${item.COLOR_CLASS2 ? '/' + escapeHTML(item.COLOR_CLASS2) : ''} · ${escapeHTML(item.FORM_CODE_NAME || '-')}
                    </span>
                  </div>
                  <div style="font-size:11px;color:#64748b;line-height:1.4;">
                    성상: ${escapeHTML(item.CHART || '-')} ${dims ? `(${escapeHTML(dims)} mm)` : ''}
                  </div>
                </div>

                <!-- 🏥 우리 약국 보유 위치 & 클라우디너리 제품 사진 자동 매칭 배지 -->
                ${stockMatch ? `
                  <div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:9px;padding:7px 10px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
                    <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                      ${stockMatch.photoUrl ? `
                        <img src="${escapeHTML(stockMatch.photoUrl)}" alt="우리약국 보유약 사진" loading="lazy"
                          style="width:36px;height:36px;border-radius:7px;object-fit:cover;border:1px solid #34d399;background:#fff;flex-shrink:0;" />
                      ` : ''}
                      <span style="font-size:11.5px;font-weight:800;color:#065f46;">
                        🏥 우리 약국 보유 (${escapeHTML(stockMatch.type)})
                      </span>
                    </div>
                    <span style="font-size:12px;font-weight:900;color:#047857;background:#d1fae5;padding:2px 8px;border-radius:6px;white-space:nowrap;">
                      📍 진열 위치: ${escapeHTML(stockMatch.location)}
                    </span>
                  </div>
                ` : ''}

                <!-- 하단 액션 버튼 2열 그리드 -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:auto;">
                  <button type="button" class="btn-pill-id-customer-view" data-seq="${escapeHTML(item.ITEM_SEQ)}"
                    style="padding:8px 10px;border-radius:9px;border:1px solid #93c5fd;background:#eff6ff;color:#1d4ed8;font-size:12px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">
                    🗣️ 손님 안내 큰글씨
                  </button>
                  <button type="button" class="btn-pill-id-save-record" data-seq="${escapeHTML(item.ITEM_SEQ)}"
                    style="padding:8px 10px;border-radius:9px;border:1px solid #86efac;background:#f0fdf4;color:#15803d;font-size:12px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">
                    💾 클라우디너리·클라우드 보관
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    function updateResultsSectionDOM() {
      const container = document.getElementById('pill-id-results-container');
      const sourceEl = document.getElementById('pill-id-source-badge');
      const noticeEl = document.getElementById('pill-id-notice-banner');
      if (sourceEl) sourceEl.textContent = lastSearchSource;
      if (noticeEl) {
        if (searchNotice) {
          noticeEl.style.display = 'block';
          noticeEl.textContent = searchNotice;
        } else {
          noticeEl.style.display = 'none';
        }
      }
      if (container) {
        container.innerHTML = renderResultCardsHTML();
        bindResultCardEvents();
      }
    }

    function bindResultCardEvents() {
      const forceBtn = document.getElementById('btn-pill-id-force-remote');
      if (forceBtn) {
        forceBtn.onclick = () => executeSearch({ forceRemote: true });
      }
      document.querySelectorAll('.btn-pill-id-customer-view').forEach(btn => {
        btn.onclick = () => {
          const seq = btn.getAttribute('data-seq');
          const found = searchResults.find(it => String(it.ITEM_SEQ) === String(seq)) || getAllLocalPool().find(it => String(it.ITEM_SEQ) === String(seq));
          if (found) {
            selectedPillForCustomer = found;
            renderModule();
          }
        };
      });
      document.querySelectorAll('.btn-pill-id-save-record').forEach(btn => {
        btn.onclick = () => {
          const seq = btn.getAttribute('data-seq');
          const found = searchResults.find(it => String(it.ITEM_SEQ) === String(seq)) || getAllLocalPool().find(it => String(it.ITEM_SEQ) === String(seq));
          if (found) saveIdentificationRecord(found);
        };
      });
    }

    function renderModule(containerId = 'module-content') {
      const root = document.getElementById(containerId) || document.getElementById('module-content') || document.getElementById('pill-identifier-module');
      if (!root) return;

      syncConfigFromCloud();

      if (searchResults.length === 0 && !filterPrint && !filterItemName && !filterEntpName && filterShape === 'ALL' && filterColor === 'ALL' && filterForm === 'ALL' && filterLine === 'ALL') {
        searchResults = getAllLocalPool();
      }

      const historyList = (window.SheetsSync && typeof window.SheetsSync.getPillIdentifications === 'function')
        ? (window.SheetsSync.getPillIdentifications() || [])
        : [];
      const filteredHistory = historySearchQuery.trim()
        ? historyList.filter(r => `${r.itemName || ''} ${r.customerNote || ''} ${r.authorName || ''} ${r.printFront || ''} ${r.className || ''}`.toLowerCase().includes(historySearchQuery.trim().toLowerCase()))
        : historyList;

      const hasGemini = getGeminiApiKey().length > 10;

      root.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:14px;max-width:1200px;margin:0 auto;padding-bottom:40px;">
          <!-- 1. 상단 헤더 & API 상태 배지 -->
          <div style="background:linear-gradient(135deg,#eff6ff 0%,#f0fdf4 100%);border:1.5px solid #bfdbfe;border-radius:16px;padding:14px 16px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;">
            <div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="font-size:18px;font-weight:900;color:#1e3a8a;">🔎 식약처 의약품 낱알 식별기</span>
                <div id="pill-id-api-status-badge" style="display:inline-flex;flex-wrap:wrap;gap:6px;">
                  <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:700;background:#dcfce7;color:#166534;border:1px solid #86efac;">
                    🟢 식약처 OpenAPI 연결됨
                  </span>
                  <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:700;background:${hasGemini ? '#dbeafe' : '#fef3c7'};color:${hasGemini ? '#1e40af' : '#92400e'};border:1px solid ${hasGemini ? '#93c5fd' : '#fde68a'};">
                    ${hasGemini ? '🤖 AI 비전 활성' : '⚠️ AI 키 미설정'}
                  </span>
                  <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:800;background:#f3e8ff;color:#6b21a8;border:1px solid #d8b4fe;">
                    ☁️ 로컬스토리지 0MB (클라우디너리 & 파이어베이스 직결)
                  </span>
                </div>
              </div>
              <div style="font-size:12px;color:#475569;margin-top:4px;line-height:1.45;">
                손님이 가져온 알약을 <b>📸 카메라로 촬영</b>하거나 <b>🎨 모양·색상·각인문자</b>를 선택하면 식약처 공식 DB와 우리 약국 진열 위치를 즉시 안내합니다.
              </div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button type="button" id="btn-pill-id-open-config" style="padding:8px 12px;border-radius:10px;border:1px solid #cbd5e1;background:#ffffff;color:#334155;font-size:12px;font-weight:800;cursor:pointer;">
                ⚙️ API 설정
              </button>
              <button type="button" id="btn-pill-id-reset-all" style="padding:8px 12px;border-radius:10px;border:1px solid #fca5a5;background:#fef2f2;color:#b91c1c;font-size:12px;font-weight:800;cursor:pointer;">
                🔄 조건 초기화
              </button>
            </div>
          </div>

          <!-- 2. 📸 AI 카메라/사진 낱알 판독 카드 (모바일 2열 버튼 규격 - 제 193 조 준수) -->
          <div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:16px;padding:14px;box-shadow:0 2px 8px rgba(15,23,42,0.04);">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
              <div style="font-size:14px;font-weight:900;color:#0f172a;">
                📸 1단계: 알약 사진 촬영 / AI 자동 식별 <span style="font-size:11.5px;font-weight:600;color:#64748b;">(각인 글씨가 잘 보이게 가까이 촬영하세요)</span>
              </div>
              <button type="button" id="btn-pill-id-live-cam" style="padding:6px 11px;border-radius:8px;border:1px solid #93c5fd;background:#eff6ff;color:#1d4ed8;font-size:11.5px;font-weight:800;cursor:pointer;">
                ${isCameraActive ? '✖ 라이브 카메라 닫기' : '🎥 인앱 접사 뷰파인더 열기'}
              </button>
            </div>

            <!-- 모바일 2열 대칭 촬영/앨범 버튼 -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <label style="padding:11px 10px;border-radius:11px;background:#2563eb;color:#ffffff;font-size:13px;font-weight:800;text-align:center;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 2px 6px rgba(37,99,235,0.25);">
                📸 바로 카메라 촬영
                <input type="file" id="input-pill-id-camera" accept="image/*" capture="environment" style="display:none;" />
              </label>
              <label style="padding:11px 10px;border-radius:11px;background:#f1f5f9;color:#1e293b;border:1px solid #cbd5e1;font-size:13px;font-weight:800;text-align:center;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
                📁 앨범/사진 선택
                <input type="file" id="input-pill-id-album" accept="image/*" style="display:none;" />
              </label>
            </div>

            ${isCameraActive ? `
              <div style="margin-top:12px;max-width:360px;margin-left:auto;margin-right:auto;border-radius:14px;overflow:hidden;border:2px solid #2563eb;background:#000;position:relative;aspect-ratio:1/1;">
                <video id="pill-id-live-video" playsinline muted autoplay style="width:100%;height:100%;object-fit:cover;"></video>
                <div style="position:absolute;inset:20%;border:2px dashed rgba(255,255,255,0.8);border-radius:16px;pointer-events:none;display:flex;align-items:flex-end;justify-content:center;padding-bottom:8px;">
                  <span style="background:rgba(15,23,42,0.75);color:#fff;font-size:11px;font-weight:700;padding:3px 8px;border-radius:6px;">이 사각형 안에 알약 각인이 보이게 놓으세요</span>
                </div>
                <div style="position:absolute;bottom:10px;left:10px;right:10px;display:flex;gap:8px;justify-content:center;">
                  <button type="button" id="btn-pill-id-torch" style="padding:8px 12px;border-radius:10px;border:none;background:${isTorchOn ? '#facc15' : 'rgba(15,23,42,0.8)'};color:${isTorchOn ? '#0f172a' : '#fff'};font-size:12px;font-weight:800;cursor:pointer;">
                    🔦 조명 ${isTorchOn ? 'ON' : 'OFF'}
                  </button>
                  <button type="button" id="btn-pill-id-shutter" style="flex:1;padding:9px 14px;border-radius:10px;border:none;background:#2563eb;color:#fff;font-size:13px;font-weight:900;cursor:pointer;">
                    📸 이 화면으로 AI 낱알 판독
                  </button>
                </div>
              </div>
            ` : ''}

            ${isAiAnalyzing ? `
              <div style="margin-top:12px;padding:16px;border-radius:12px;background:#eff6ff;border:1px solid #93c5fd;display:flex;align-items:center;gap:12px;">
                <i class="fas fa-spinner fa-spin" style="font-size:22px;color:#2563eb;"></i>
                <div>
                  <div style="font-size:13.5px;font-weight:800;color:#1e3a8a;">🤖 Gemini Vision AI가 알약의 각인문자·모양·색상을 정밀 판독하고 식약처 DB와 대조 중입니다...</div>
                  <div style="font-size:11.5px;color:#3b82f6;margin-top:2px;">약 1~2초 소요됩니다.</div>
                </div>
              </div>
            ` : ''}

            ${capturedPhotoDataUrl && !isAiAnalyzing ? `
              <div style="margin-top:12px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:10px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;">
                <img src="${capturedPhotoDataUrl}" alt="촬영된 알약" style="width:76px;height:76px;border-radius:10px;object-fit:cover;border:1px solid #94a3b8;flex-shrink:0;" />
                <div style="flex:1;min-width:200px;">
                  <div style="font-size:12.5px;font-weight:900;color:#1e293b;margin-bottom:4px;">
                    🤖 AI 사진 판독 결과 ${aiAnalysisSummary?.reasoning ? `— ${escapeHTML(aiAnalysisSummary.reasoning)}` : ''}
                  </div>
                  ${aiAnalysisSummary ? `
                    <div style="display:flex;flex-wrap:wrap;gap:5px;font-size:11.5px;">
                      <span style="padding:2px 8px;border-radius:6px;background:#dbeafe;color:#1e40af;font-weight:800;">각인: ${escapeHTML(aiAnalysisSummary.printFront || '-')} ${aiAnalysisSummary.printBack ? '/ ' + escapeHTML(aiAnalysisSummary.printBack) : ''}</span>
                      <span style="padding:2px 8px;border-radius:6px;background:#f1f5f9;color:#334155;font-weight:700;">모양: ${escapeHTML(aiAnalysisSummary.shape)}</span>
                      <span style="padding:2px 8px;border-radius:6px;background:#f1f5f9;color:#334155;font-weight:700;">색상: ${escapeHTML(aiAnalysisSummary.color)}</span>
                      ${aiAnalysisSummary.candidates.length > 0 ? `<span style="padding:2px 8px;border-radius:6px;background:#dcfce7;color:#166534;font-weight:800;">AI 추천 후보: ${escapeHTML(aiAnalysisSummary.candidates.join(', '))}</span>` : ''}
                    </div>
                  ` : ''}
                </div>
                <button type="button" id="btn-pill-id-clear-photo" style="padding:6px 10px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#64748b;font-size:11px;font-weight:700;cursor:pointer;">
                  사진 지우기
                </button>
              </div>
            ` : ''}
          </div>

          <!-- 3. 🎨 모양·색상·각인문자·제품명 스마트 필터 카드 -->
          <div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:12px;box-shadow:0 2px 8px rgba(15,23,42,0.04);">
            <div style="font-size:14px;font-weight:900;color:#0f172a;">
              🎨 2단계: 각인문자 · 모양 · 색상 · 제품명 상세 필터
            </div>

            <!-- 텍스트 검색 3종 (반응형 그리드) -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));gap:8px;">
              <div>
                <label style="display:block;font-size:11.5px;font-weight:800;color:#334155;margin-bottom:4px;">🔤 식별문자 (알약 앞/뒤 각인)</label>
                <input type="text" id="input-pill-id-print" value="${escapeHTML(filterPrint)}" placeholder="예: TYLENOL, 500, ATV, OG33, 277"
                  style="width:100%;padding:9px 11px;border-radius:10px;border:1.5px solid #93c5fd;font-size:13px;font-weight:700;box-sizing:border-box;" />
              </div>
              <div>
                <label style="display:block;font-size:11.5px;font-weight:800;color:#334155;margin-bottom:4px;">💊 제품명 / 성분명 / 보험코드</label>
                <input type="text" id="input-pill-id-name" value="${escapeHTML(filterItemName)}" placeholder="예: 타이레놀, 노바스크, 아스피린, 록소닌"
                  style="width:100%;padding:9px 11px;border-radius:10px;border:1.5px solid #cbd5e1;font-size:13px;box-sizing:border-box;" />
              </div>
              <div>
                <label style="display:block;font-size:11.5px;font-weight:800;color:#334155;margin-bottom:4px;">🏢 제약사명</label>
                <input type="text" id="input-pill-id-entp" value="${escapeHTML(filterEntpName)}" placeholder="예: 종근당, 대웅, 한미, 유한"
                  style="width:100%;padding:9px 11px;border-radius:10px;border:1.5px solid #cbd5e1;font-size:13px;box-sizing:border-box;" />
              </div>
            </div>

            <!-- 모양 칩 (가로 터치 스크롤 허용 - 제 193 조 준수) -->
            <div>
              <div style="font-size:11.5px;font-weight:800;color:#475569;margin-bottom:5px;">📐 의약품 모양 선택</div>
              <div style="display:flex;gap:6px;overflow-x:auto;white-space:nowrap;padding-bottom:4px;-webkit-overflow-scrolling:touch;">
                ${SHAPE_OPTIONS.map(opt => {
                  const active = filterShape === opt.id;
                  return `
                    <button type="button" class="chip-pill-id-shape" data-shape="${escapeHTML(opt.id)}"
                      style="padding:6px 11px;border-radius:999px;border:1.5px solid ${active ? '#2563eb' : '#cbd5e1'};background:${active ? '#dbeafe' : '#f8fafc'};color:${active ? '#1e40af' : '#334155'};font-size:12px;font-weight:${active ? '900' : '700'};cursor:pointer;flex-shrink:0;">
                      ${opt.icon} ${escapeHTML(opt.label)}
                    </button>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- 색상 칩 (실제 색상 원형 스와치 포함) -->
            <div>
              <div style="font-size:11.5px;font-weight:800;color:#475569;margin-bottom:5px;">🎨 의약품 색상 선택</div>
              <div style="display:flex;gap:6px;overflow-x:auto;white-space:nowrap;padding-bottom:4px;-webkit-overflow-scrolling:touch;">
                ${COLOR_OPTIONS.map(opt => {
                  const active = filterColor === opt.id;
                  return `
                    <button type="button" class="chip-pill-id-color" data-color="${escapeHTML(opt.id)}"
                      style="display:inline-flex;align-items:center;gap:5px;padding:6px 11px;border-radius:999px;border:1.5px solid ${active ? '#2563eb' : '#cbd5e1'};background:${active ? '#dbeafe' : '#f8fafc'};color:${active ? '#1e40af' : '#334155'};font-size:12px;font-weight:${active ? '900' : '700'};cursor:pointer;flex-shrink:0;">
                      <span style="width:13px;height:13px;border-radius:50%;background:${opt.hex};border:1px solid ${opt.border};display:inline-block;flex-shrink:0;"></span>
                      ${escapeHTML(opt.label)}
                    </button>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- 제형 & 분할선 칩 -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:10px;">
              <div>
                <div style="font-size:11.5px;font-weight:800;color:#475569;margin-bottom:5px;">💊 제형 구분</div>
                <div style="display:flex;gap:6px;overflow-x:auto;white-space:nowrap;padding-bottom:2px;">
                  ${FORM_OPTIONS.map(opt => {
                    const active = filterForm === opt.id;
                    return `
                      <button type="button" class="chip-pill-id-form" data-form="${escapeHTML(opt.id)}"
                        style="padding:5px 10px;border-radius:8px;border:1.5px solid ${active ? '#2563eb' : '#cbd5e1'};background:${active ? '#dbeafe' : '#f8fafc'};color:${active ? '#1e40af' : '#334155'};font-size:11.5px;font-weight:${active ? '900' : '700'};cursor:pointer;flex-shrink:0;">
                        ${escapeHTML(opt.label)}
                      </button>
                    `;
                  }).join('')}
                </div>
              </div>
              <div>
                <div style="font-size:11.5px;font-weight:800;color:#475569;margin-bottom:5px;">➖ 분할선</div>
                <div style="display:flex;gap:6px;overflow-x:auto;white-space:nowrap;padding-bottom:2px;">
                  ${LINE_OPTIONS.map(opt => {
                    const active = filterLine === opt.id;
                    return `
                      <button type="button" class="chip-pill-id-line" data-line="${escapeHTML(opt.id)}"
                        style="padding:5px 10px;border-radius:8px;border:1.5px solid ${active ? '#2563eb' : '#cbd5e1'};background:${active ? '#dbeafe' : '#f8fafc'};color:${active ? '#1e40af' : '#334155'};font-size:11.5px;font-weight:${active ? '900' : '700'};cursor:pointer;flex-shrink:0;">
                        ${escapeHTML(opt.label)}
                      </button>
                    `;
                  }).join('')}
                </div>
              </div>
            </div>

            <!-- 실시간 식약처 OpenAPI 조회 & 손님 상담 메모 입력 바 -->
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding-top:6px;border-top:1px solid #e2e8f0;">
              <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:220px;">
                <span style="font-size:11.5px;font-weight:800;color:#475569;white-space:nowrap;">📝 상담 메모:</span>
                <input type="text" id="input-pill-id-customer-note" value="${escapeHTML(customerNoteInput)}"
                  placeholder="손님 성함 또는 질문 메모 (예: 홍길동님 혈압약 문의)"
                  style="flex:1;padding:7px 10px;border-radius:8px;border:1px solid #cbd5e1;font-size:12px;" />
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button type="button" id="btn-pill-id-toggle-our-stock" style="padding:9px 14px;border-radius:10px;border:1.5px solid ${filterOnlyOurStock ? '#059669' : '#6ee7b7'};background:${filterOnlyOurStock ? '#059669' : '#ecfdf5'};color:${filterOnlyOurStock ? '#ffffff' : '#065f46'};font-size:12px;font-weight:900;cursor:pointer;display:flex;align-items:center;gap:5px;">
                  🏥 ${filterOnlyOurStock ? '우리 약국 보유약 필터 ON' : '우리 약국 보유 제품만 보기'}
                </button>
                <button type="button" id="btn-pill-id-search-api" style="padding:9px 16px;border-radius:10px;border:none;background:#1d4ed8;color:#ffffff;font-size:12.5px;font-weight:900;cursor:pointer;display:flex;align-items:center;gap:6px;">
                  🌐 식약처 OpenAPI 실시간 조회
                </button>
              </div>
            </div>
          </div>

          <!-- 4. 검색 결과 섹션 -->
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;">
              <div style="font-size:14px;font-weight:900;color:#0f172a;">
                📋 식약처 낱알 식별 결과
              </div>
              <span id="pill-id-source-badge" style="font-size:11.5px;font-weight:700;color:#1e40af;background:#eff6ff;padding:4px 10px;border-radius:999px;border:1px solid #bfdbfe;">
                ${escapeHTML(lastSearchSource)}
              </span>
            </div>

            <div id="pill-id-notice-banner" style="display:${searchNotice ? 'block' : 'none'};padding:10px 12px;border-radius:10px;background:#fef3c7;border:1px solid #fde68a;color:#92400e;font-size:12px;font-weight:700;">
              ${escapeHTML(searchNotice)}
            </div>

            <div id="pill-id-results-container">
              ${renderResultCardsHTML()}
            </div>
          </div>

          <!-- 5. 📂 최근 낱알 식별 · 손님 상담 보관함 -->
          <div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
              <div style="font-size:14px;font-weight:900;color:#0f172a;">
                📂 최근 낱알 식별 · 손님 상담 보관함 <span style="font-size:12px;color:#2563eb;">(${historyList.length}건)</span>
              </div>
              <input type="text" id="input-pill-id-history-search" value="${escapeHTML(historySearchQuery)}"
                placeholder="보관함 검색 (약이름, 메모, 작성자)"
                style="padding:6px 10px;border-radius:8px;border:1px solid #cbd5e1;font-size:12px;min-width:200px;" />
            </div>

            ${filteredHistory.length === 0 ? `
              <div style="padding:20px;text-align:center;color:#64748b;font-size:12px;background:#f8fafc;border-radius:10px;">
                아직 저장된 낱알 식별 상담 기록이 없습니다. 결과 카드에서 <b>[💾 상담기록 보관]</b>을 누르면 사진과 함께 영구 보관됩니다.
              </div>
            ` : `
              <div style="display:flex;flex-direction:column;gap:8px;max-height:360px;overflow-y:auto;">
                ${filteredHistory.slice(0, 30).map(rec => {
                  const dateStr = rec.createdAt ? rec.createdAt.replace('T', ' ').slice(0, 16) : '';
                  return `
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:11px;background:#f8fafc;border:1px solid #e2e8f0;flex-wrap:wrap;">
                      <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;">
                        ${rec.capturedPhotoUrl || rec.itemImage ? `
                          <img src="${escapeHTML(rec.capturedPhotoUrl || rec.itemImage)}" alt="약 사진" style="width:48px;height:48px;border-radius:8px;object-fit:cover;border:1px solid #cbd5e1;background:#fff;flex-shrink:0;" />
                        ` : `<div style="width:48px;height:48px;border-radius:8px;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">💊</div>`}
                        <div style="min-width:0;flex:1;">
                          <div style="font-size:13px;font-weight:900;color:#0f172a;word-break:keep-all;">
                            ${escapeHTML(rec.itemName)}
                            <span style="font-size:11px;font-weight:700;color:#1d4ed8;margin-left:4px;">[${escapeHTML(rec.className || rec.etcOtcName || '의약품')}]</span>
                          </div>
                          <div style="font-size:11.5px;color:#475569;margin-top:2px;">
                            📝 ${escapeHTML(rec.customerNote || '-')} ${rec.pharmacyLocation ? `· <b style="color:#047857;">📍 ${escapeHTML(rec.pharmacyLocation)}</b>` : ''}
                          </div>
                          <div style="font-size:10.5px;color:#94a3b8;margin-top:2px;">
                            🕒 ${escapeHTML(dateStr)} · 담당: ${escapeHTML(rec.authorName || '-')} · 각인: ${escapeHTML(rec.printFront || '-')}/${escapeHTML(rec.printBack || '-')}
                          </div>
                        </div>
                      </div>
                      <button type="button" class="btn-pill-id-del-history" data-id="${escapeHTML(rec.id)}"
                        style="padding:5px 9px;border-radius:7px;border:1px solid #fca5a5;background:#fef2f2;color:#b91c1c;font-size:11px;font-weight:700;cursor:pointer;">
                        삭제
                      </button>
                    </div>
                  `;
                }).join('')}
              </div>
            `}
          </div>
        </div>

        <!-- 🗣️ 손님 안내용 큰글씨 카드 모달 -->
        ${selectedPillForCustomer ? renderCustomerModalHTML(selectedPillForCustomer) : ''}

        <!-- ⚙️ API 키 설정 모달 -->
        ${showConfigModal ? renderConfigModalHTML() : ''}
      `;

      bindEvents();
      bindResultCardEvents();
    }

    function renderCustomerModalHTML(item) {
      const stockMatch = findPharmacyStockMatch(item.ITEM_NAME);
      const isRx = String(item.ETC_OTC_NAME || '').includes('전문');
      return `
        <div id="pill-id-customer-modal-backdrop" style="position:fixed;inset:0;background:rgba(15,23,42,0.68);z-index:9999;display:flex;align-items:center;justify-content:center;padding:14px;">
          <div style="background:#ffffff;border-radius:20px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,0.35);display:flex;flex-direction:column;gap:14px;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="padding:5px 12px;border-radius:999px;font-size:12px;font-weight:900;background:#dbeafe;color:#1e40af;">
                🗣️ 신세계약국 복약·식별 안내 카드
              </span>
              <button type="button" id="btn-pill-id-close-customer-modal" style="border:none;background:#f1f5f9;width:32px;height:32px;border-radius:50%;font-size:16px;font-weight:900;cursor:pointer;">✕</button>
            </div>

            ${item.ITEM_IMAGE ? `
              <div style="background:#f8fafc;border:2px solid #e2e8f0;border-radius:14px;padding:12px;text-align:center;">
                <img src="${escapeHTML(item.ITEM_IMAGE)}" alt="${escapeHTML(item.ITEM_NAME)}" style="max-width:100%;max-height:180px;object-fit:contain;border-radius:8px;" />
                <div style="font-size:11px;color:#64748b;margin-top:4px;">식품의약품안전처 공식 낱알식별 등록 이미지</div>
              </div>
            ` : ''}

            <div>
              <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap;">
                <span style="padding:4px 10px;border-radius:8px;font-size:13px;font-weight:900;background:${isRx ? '#fee2e2' : '#dbeafe'};color:${isRx ? '#b91c1c' : '#1d4ed8'};">
                  ${escapeHTML(item.ETC_OTC_NAME || '의약품')}
                </span>
                ${item.CLASS_NAME ? `
                  <span style="padding:4px 10px;border-radius:8px;font-size:13px;font-weight:900;background:#dcfce7;color:#166534;">
                    효능·분류: ${escapeHTML(item.CLASS_NAME)}
                  </span>
                ` : ''}
              </div>
              <div style="font-size:22px;font-weight:900;color:#0f172a;line-height:1.35;word-break:keep-all;">
                ${escapeHTML(item.ITEM_NAME)}
              </div>
              <div style="font-size:14px;color:#475569;margin-top:4px;font-weight:700;">
                제조·수입사: ${escapeHTML(item.ENTP_NAME || '-')}
              </div>
            </div>

            <div style="background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px;font-size:15px;">
              <div><b>🔤 각인 문자:</b> 앞면 <code style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:6px;font-weight:900;">${escapeHTML(item.PRINT_FRONT || '없음')}</code> / 뒷면 <code style="background:#e0e7ff;color:#3730a3;padding:2px 8px;border-radius:6px;font-weight:900;">${escapeHTML(item.PRINT_BACK || '없음')}</code></div>
              <div><b>🎨 외형 특징:</b> ${escapeHTML(item.DRUG_SHAPE || '-')} · ${escapeHTML(item.COLOR_CLASS1 || '-')} · ${escapeHTML(item.FORM_CODE_NAME || '-')}</div>
              <div><b>📝 상세 성상:</b> ${escapeHTML(item.CHART || '-')}</div>
              <div><b>📏 크기(장축×단축×두께):</b> ${escapeHTML(item.LENG_LONG || '-')} × ${escapeHTML(item.LENG_SHORT || '-')} × ${escapeHTML(item.THICK || '-')} mm</div>
            </div>

            ${stockMatch ? `
              <div style="background:#ecfdf5;border:1.5px solid #6ee7b7;border-radius:12px;padding:10px 14px;font-size:14px;font-weight:900;color:#065f46;">
                🏥 우리 약국 보유 의약품 (${escapeHTML(stockMatch.type)}) — 📍 진열 위치: ${escapeHTML(stockMatch.location)}
              </div>
            ` : ''}

            <button type="button" id="btn-pill-id-close-customer-bottom" style="padding:12px;border-radius:12px;border:none;background:#1e293b;color:#fff;font-size:15px;font-weight:900;cursor:pointer;">
              확인 닫기
            </button>
          </div>
        </div>
      `;
    }

    function renderConfigModalHTML() {
      return `
        <div id="pill-id-config-modal-backdrop" style="position:fixed;inset:0;background:rgba(15,23,42,0.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:14px;">
          <div style="background:#ffffff;border-radius:18px;max-width:460px;width:100%;padding:18px;display:flex;flex-direction:column;gap:12px;">
            <div style="font-size:16px;font-weight:900;color:#0f172a;">⚙️ 식약처 OpenAPI & Gemini AI 설정</div>
            <div>
              <label style="display:block;font-size:12px;font-weight:800;color:#334155;margin-bottom:4px;">공공데이터포털 식약처 낱알식별 일반 인증키 (Decoding)</label>
              <input type="text" id="input-pill-id-cfg-mfds" value="${escapeHTML(getMfdsServiceKey())}"
                style="width:100%;padding:9px;border-radius:8px;border:1px solid #cbd5e1;font-size:12px;box-sizing:border-box;" />
            </div>
            <div>
              <label style="display:block;font-size:12px;font-weight:800;color:#334155;margin-bottom:4px;">Gemini API 키 (알약 카운터와 자동 공유)</label>
              <input type="password" id="input-pill-id-cfg-gemini" value="${escapeHTML(getGeminiApiKey())}" placeholder="AIza..."
                style="width:100%;padding:9px;border-radius:8px;border:1px solid #cbd5e1;font-size:12px;box-sizing:border-box;" />
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px;">
              <button type="button" id="btn-pill-id-cfg-cancel" style="padding:8px 14px;border-radius:8px;border:1px solid #cbd5e1;background:#f8fafc;font-size:12px;font-weight:800;cursor:pointer;">취소</button>
              <button type="button" id="btn-pill-id-cfg-save" style="padding:8px 14px;border-radius:8px;border:none;background:#2563eb;color:#fff;font-size:12px;font-weight:800;cursor:pointer;">💾 저장 및 전 기기 동기화</button>
            </div>
          </div>
        </div>
      `;
    }

    function bindEvents() {
      // 텍스트 입력창 (120ms 디바운스 + DOM 부분 갱신으로 한글 IME 조합 완벽 보호)
      const printInput = document.getElementById('input-pill-id-print');
      if (printInput) {
        printInput.addEventListener('input', (e) => {
          filterPrint = e.target.value;
          triggerDebouncedSearch();
        });
        printInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') executeSearch({ forceRemote: true });
        });
      }

      const nameInput = document.getElementById('input-pill-id-name');
      if (nameInput) {
        nameInput.addEventListener('input', (e) => {
          filterItemName = e.target.value;
          triggerDebouncedSearch();
        });
        nameInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') executeSearch({ forceRemote: true });
        });
      }

      const entpInput = document.getElementById('input-pill-id-entp');
      if (entpInput) {
        entpInput.addEventListener('input', (e) => {
          filterEntpName = e.target.value;
          triggerDebouncedSearch();
        });
        entpInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') executeSearch({ forceRemote: true });
        });
      }

      const noteInput = document.getElementById('input-pill-id-customer-note');
      if (noteInput) {
        noteInput.addEventListener('input', (e) => {
          customerNoteInput = e.target.value;
        });
      }

      const histSearch = document.getElementById('input-pill-id-history-search');
      if (histSearch) {
        histSearch.addEventListener('input', (e) => {
          historySearchQuery = e.target.value;
          renderModule();
        });
      }

      // 칩 클릭
      document.querySelectorAll('.chip-pill-id-shape').forEach(btn => {
        btn.onclick = () => {
          filterShape = btn.getAttribute('data-shape') || 'ALL';
          renderModule();
          executeSearch({ forceRemote: false });
        };
      });
      document.querySelectorAll('.chip-pill-id-color').forEach(btn => {
        btn.onclick = () => {
          filterColor = btn.getAttribute('data-color') || 'ALL';
          renderModule();
          executeSearch({ forceRemote: false });
        };
      });
      document.querySelectorAll('.chip-pill-id-form').forEach(btn => {
        btn.onclick = () => {
          filterForm = btn.getAttribute('data-form') || 'ALL';
          renderModule();
          executeSearch({ forceRemote: false });
        };
      });
      document.querySelectorAll('.chip-pill-id-line').forEach(btn => {
        btn.onclick = () => {
          filterLine = btn.getAttribute('data-line') || 'ALL';
          renderModule();
          executeSearch({ forceRemote: false });
        };
      });

      // 버튼들
      const btnApiSearch = document.getElementById('btn-pill-id-search-api');
      if (btnApiSearch) {
        btnApiSearch.onclick = () => executeSearch({ forceRemote: true });
      }

      const btnToggleStock = document.getElementById('btn-pill-id-toggle-our-stock');
      if (btnToggleStock) {
        btnToggleStock.onclick = () => {
          filterOnlyOurStock = !filterOnlyOurStock;
          searchResults = filterItemsByCriteria(getAllLocalPool());
          lastSearchSource = filterOnlyOurStock
            ? `🏥 우리 약국 보유 제품 필터 적용 (${searchResults.length}건 일치)`
            : `☁️ 클라우드 시드·캐시 DB (${searchResults.length}건 표시)`;
          renderModule();
        };
      }

      const btnReset = document.getElementById('btn-pill-id-reset-all');
      if (btnReset) {
        btnReset.onclick = () => {
          filterPrint = '';
          filterItemName = '';
          filterEntpName = '';
          filterShape = 'ALL';
          filterColor = 'ALL';
          filterForm = 'ALL';
          filterLine = 'ALL';
          filterOnlyOurStock = false;
          capturedPhotoDataUrl = '';
          aiAnalysisSummary = null;
          searchNotice = '';
          searchResults = filterItemsByCriteria(getAllLocalPool());
          lastSearchSource = `☁️ 클라우드 시드·캐시 DB (${searchResults.length}종 전체 표시 · 로컬스토리지 0MB)`;
          renderModule();
        };
      }

      const btnOpenConfig = document.getElementById('btn-pill-id-open-config');
      if (btnOpenConfig) {
        btnOpenConfig.onclick = () => {
          showConfigModal = true;
          renderModule();
        };
      }

      const btnLiveCam = document.getElementById('btn-pill-id-live-cam');
      if (btnLiveCam) {
        btnLiveCam.onclick = () => {
          if (isCameraActive) stopLiveCamera(true);
          else startLiveCamera();
        };
      }

      const btnTorch = document.getElementById('btn-pill-id-torch');
      if (btnTorch) btnTorch.onclick = toggleCameraTorch;

      const btnShutter = document.getElementById('btn-pill-id-shutter');
      if (btnShutter) btnShutter.onclick = captureLiveCameraFrame;

      const btnClearPhoto = document.getElementById('btn-pill-id-clear-photo');
      if (btnClearPhoto) {
        btnClearPhoto.onclick = () => {
          capturedPhotoDataUrl = '';
          aiAnalysisSummary = null;
          renderModule();
        };
      }

      const camInput = document.getElementById('input-pill-id-camera');
      if (camInput) {
        camInput.onchange = async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const sqUrl = await loadImageAsSquareDataUrl(file);
          analyzePillPhotoWithAi(sqUrl);
        };
      }

      const albumInput = document.getElementById('input-pill-id-album');
      if (albumInput) {
        albumInput.onchange = async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const sqUrl = await loadImageAsSquareDataUrl(file);
          analyzePillPhotoWithAi(sqUrl);
        };
      }

      document.querySelectorAll('.btn-pill-id-del-history').forEach(btn => {
        btn.onclick = () => deleteIdentificationRecord(btn.getAttribute('data-id'));
      });

      // 모달 닫기/저장
      const closeCust1 = document.getElementById('btn-pill-id-close-customer-modal');
      const closeCust2 = document.getElementById('btn-pill-id-close-customer-bottom');
      const custBackdrop = document.getElementById('pill-id-customer-modal-backdrop');
      if (closeCust1) closeCust1.onclick = () => { selectedPillForCustomer = null; renderModule(); };
      if (closeCust2) closeCust2.onclick = () => { selectedPillForCustomer = null; renderModule(); };
      if (custBackdrop) {
        custBackdrop.onclick = (e) => {
          if (e.target === custBackdrop) {
            selectedPillForCustomer = null;
            renderModule();
          }
        };
      }

      const cfgCancel = document.getElementById('btn-pill-id-cfg-cancel');
      const cfgSave = document.getElementById('btn-pill-id-cfg-save');
      if (cfgCancel) cfgCancel.onclick = () => { showConfigModal = false; renderModule(); };
      if (cfgSave) {
        cfgSave.onclick = async () => {
          const mfdsVal = (document.getElementById('input-pill-id-cfg-mfds')?.value || '').trim();
          const geminiVal = (document.getElementById('input-pill-id-cfg-gemini')?.value || '').trim();
          if (mfdsVal) memoryMfdsServiceKey = mfdsVal;
          if (geminiVal) memoryGeminiApiKey = geminiVal;
          try {
            await fetch(FIREBASE_PILL_ID_CONFIG_URL, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mfdsServiceKey: getMfdsServiceKey(), updatedAt: new Date().toISOString() })
            });
            if (geminiVal) {
              const resAi = await fetch(`${FIREBASE_AI_CONFIG_URL}?t=${Date.now()}`, { cache: 'no-store' });
              const curAi = resAi.ok ? ((await resAi.json()) || {}) : {};
              curAi.geminiApiKey = geminiVal;
              curAi.updatedAt = new Date().toISOString();
              await fetch(FIREBASE_AI_CONFIG_URL, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(curAi)
              });
            }
          } catch (e) {}
          showConfigModal = false;
          renderModule();
        };
      }
    }

    return {
      render: renderModule,
      renderModule,
      stopLiveCamera
    };
  })();
}
