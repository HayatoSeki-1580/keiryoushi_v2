// --- モジュールのインポート ---
import * as pdfjsLib from './lib/pdfjs/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = './lib/pdfjs/build/pdf.worker.mjs';

// --- グローバル変数 ---
let exerciseView, resultsPanel, welcomeOverlay, canvas, loadingSpinner,
    pageNumSpan, pageCountSpan, prevBtn, nextBtn, jumpToSelect,
    tabByEdition, tabByField, panelByEdition, panelByField,
    editionSelect, subjectSelectEdition, goBtnEdition, resultAreaEdition, scoreCorrectEdition, showResultsBtnEdition,
    subjectSelectField,
    customSelect, selectSelected, selectItems,
    goBtnField, resultAreaField, scoreCorrectField, showResultsBtnField,
    answerButtonsNodeList,
    questionSource, resultsSummary, resultsList, backToExerciseBtn;

// 【追加】解説機能用の変数
let btnExplanationEdition, btnExplanationField, explanationModal, explanationBody, explanationTitle, closeModalSpan;
let currentExplanations = {}; // 解説データを格納 { kanon: { "1": {body:...}, ... } }

let pdfDoc = null;
let currentPageNum = 1;
let currentAnswers = {};
let fieldsData = {};
let currentFieldQuestions = [];
let currentFieldIndex = 0;
let correctCount = 0;
let answerHistory = {};
let currentSessionQuestions = [];

/** ローディング表示を制御 */
function showLoading(show) {
    if(loadingSpinner) loadingSpinner.classList.toggle('hidden', !show);
}

/** 問題ID生成 */
function getQuestionId(edition, subject, pageNum) {
    const e = edition || 'unknown'; const s = subject || 'unknown'; const p = pageNum || 'unknown';
    return `${e}-${s}-${p}`;
}

/** 現在の問題ID取得 */
function getCurrentQuestionId() {
    const currentSubjectVal = subjectSelectEdition ? subjectSelectEdition.value : '';
    const currentEditionVal = editionSelect ? editionSelect.value : '';
    const currentFieldSubjectVal = subjectSelectField ? subjectSelectField.value : '';

    if (currentFieldQuestions.length > 0 && currentFieldQuestions[currentFieldIndex]) {
        const question = currentFieldQuestions[currentFieldIndex];
        return getQuestionId(question.edition, currentFieldSubjectVal, question.pageNum);
    } else {
        const pageNumVal = currentPageNum > 0 ? currentPageNum : 'unknown';
        return getQuestionId(currentEditionVal, currentSubjectVal, pageNumVal);
    }
}

/** 索引ファイル(editions.json)読込 */
async function setupEditionSelector() {
    if (!editionSelect) return;
    try {
        const url = './data/editions.json';
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTPエラー`);
        const data = await response.json();
        const editions = data.available.sort((a, b) => b.value - a.value);
        editionSelect.innerHTML = '';
        editions.forEach(info => {
            const option = document.createElement('option');
            option.value = info.value; option.textContent = info.displayText;
            editionSelect.appendChild(option);
        });
    } catch (error) { console.error("❌ editions.json読込エラー:", error); }
}

/** 分野別ファイル(fields.json)読込 */
async function loadFieldsData() {
    if (!customSelect) return;
    try {
        const response = await fetch('./data/fields.json');
        if (!response.ok) throw new Error('HTTPエラー');
        fieldsData = await response.json();
        populateFieldSelector();
    } catch (error) { console.error("❌ fields.json読込エラー:", error); }
}

/** 解答JSON読込 */
async function loadAnswersForEdition(edition) {
    const url = `./pdf/${edition}/${edition}_answer.json`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTPエラー`);
        currentAnswers = await response.json();
    } catch (error) {
        currentAnswers = {};
        console.error(`解答ファイルが見つかりません: ${url}`);
    }
}

/** 【追加】解説JSON読込 */
async function loadExplanations(edition) {
    console.log("解説読み込み開始:", edition); // ★これを追加して確認
    const url = `./data/explanations/${edition}.json`;
    currentExplanations = {}; // リセット
    try {
        const response = await fetch(url);
        if (response.ok) {
            currentExplanations = await response.json();
            console.log(`解説データを読み込みました: ${edition}`);
        } else {
            console.log(`解説データがありません: ${url}`);
        }
    } catch (error) {
        console.warn("解説データの読み込みに失敗しました(ファイル未存在など):", error);
    }
}

/** PDF描画 */
async function renderPdf(edition, subject, pageNum = 1) {
    if (!canvas) return;
    currentPageNum = pageNum;
    const url = `./pdf/${edition}/${edition}_${subject}.pdf`;
    const loadingTaskOptions = { cMapUrl: './lib/pdfjs/web/cmaps/', cMapPacked: true, standardFontDataUrl: './lib/pdfjs/web/standard_fonts/' };
    showLoading(true);
    try {
        const loadingTask = pdfjsLib.getDocument(url, loadingTaskOptions);
        pdfDoc = await loadingTask.promise;
        const totalQuestions = pdfDoc.numPages > 1 ? pdfDoc.numPages - 1 : 0;
        if (currentFieldQuestions.length === 0) {
            if(pageCountSpan) pageCountSpan.textContent = totalQuestions;
            populateJumpSelector(totalQuestions);
        }
        await renderPageInternal(currentPageNum);
    } catch (error) {
        console.error("❌ PDF読込エラー:", error);
        alert(`PDFファイルが見つかりません:\n${url}`);
        const context = canvas.getContext('2d');
        if (context) context.clearRect(0, 0, canvas.width, canvas.height);
        if(pageCountSpan) pageCountSpan.textContent = '0';
        if(pageNumSpan) pageNumSpan.textContent = '0';
        populateJumpSelector(0);
        if(questionSource) questionSource.style.display = 'none';
    } finally {
        showLoading(false);
    }
}

/** ジャンプ用プルダウン生成 */
function populateJumpSelector(totalQuestions) {
    if (!jumpToSelect) return;
    jumpToSelect.innerHTML = '<option value="">移動...</option>';
    for (let i = 1; i <= totalQuestions; i++) {
        const option = document.createElement('option');
        option.value = i; option.textContent = `問${i}`;
        jumpToSelect.appendChild(option);
    }
}

/** ページ描画(内部) */
async function renderPageInternal(pdfPageNum) {
    if (!pdfDoc || !canvas) return;
    try {
        const activePanel = currentFieldQuestions.length > 0 ? panelByField : panelByEdition;
        const activeAnswerButtons = activePanel ? activePanel.querySelectorAll('.answer-btn') : [];
        activeAnswerButtons.forEach(btn => { btn.className = 'answer-btn'; btn.disabled = false; });

        // 【追加】解説ボタンを非表示にリセット
        const explanationBtn = currentFieldQuestions.length > 0 ? btnExplanationField : btnExplanationEdition;
        if(explanationBtn) explanationBtn.classList.add('hidden');

        const page = await pdfDoc.getPage(pdfPageNum + 1);
        const viewport = page.getViewport({ scale: 1.8 });
        const context = canvas.getContext('2d');
        canvas.height = viewport.height; canvas.width = viewport.width;
        context.clearRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;

        // 問題情報の更新
        let currentQuestionId;
        let questionEdition, questionSubject, questionPageNum;
        if (currentFieldQuestions.length > 0 && currentFieldQuestions[currentFieldIndex]) {
            const question = currentFieldQuestions[currentFieldIndex];
            questionEdition = question.edition;
            questionSubject = subjectSelectField ? subjectSelectField.value : '';
            questionPageNum = question.pageNum;
            if(pageNumSpan) pageNumSpan.textContent = currentFieldIndex + 1;
            let editionDisplayText = `第${question.edition}回`;
             if (editionSelect) {
                 for (let i = 0; i < editionSelect.options.length; i++) {
                     if (editionSelect.options[i].value === question.edition) {
                         editionDisplayText = editionSelect.options[i].textContent; break;
                     }
                 }
             }
            if(questionSource) {
                questionSource.textContent = `出典: ${editionDisplayText} 問${question.pageNum}`;
                questionSource.style.display = 'inline';
            }
            currentQuestionId = getQuestionId(question.edition, questionSubject, question.pageNum);
        } else {
            questionEdition = editionSelect ? editionSelect.value : '';
            questionSubject = subjectSelectEdition ? subjectSelectEdition.value : '';
            questionPageNum = pdfPageNum;
            if(pageNumSpan) pageNumSpan.textContent = pdfPageNum;
            if(questionSource) questionSource.style.display = 'none';
            currentQuestionId = getQuestionId(questionEdition, questionSubject, pdfPageNum);
            if(jumpToSelect) jumpToSelect.value = pdfPageNum;
        }

        if(resultAreaEdition) resultAreaEdition.textContent = '';
        if(resultAreaField) resultAreaField.textContent = '';
        updateNavButtons();

        // 履歴があれば反映
        const history = answerHistory[currentQuestionId];
        const resultArea = currentFieldQuestions.length > 0 ? resultAreaField : resultAreaEdition;

        if (history && activePanel && resultArea) {
            const selectedButton = activePanel.querySelector(`.answer-btn[data-choice="${history.selected}"]`);
            const correctButton = activePanel.querySelector(`.answer-btn[data-choice="${history.correctAnswer}"]`);

            if (history.correct) {
                if(selectedButton) selectedButton.classList.add('correct-selection');
                resultArea.textContent = `正解！ 🎉`;
                resultArea.className = 'result-area correct';
            } else {
                if(selectedButton) selectedButton.classList.add('incorrect-selection');
                if(correctButton) correctButton.classList.add('correct-answer');
                resultArea.textContent = `不正解... (正解は ${history.correctAnswer}) ❌`;
                resultArea.className = 'result-area incorrect';
            }
            activeAnswerButtons.forEach(btn => { btn.disabled = true; btn.classList.add('disabled'); });

            // 【追加】すでに解答済みの場合は解説ボタンを表示
            if(explanationBtn) explanationBtn.classList.remove('hidden');
        }

    } catch (error) { console.error("❌ ページ描画エラー:", error); }
}

/** 分野別プルダウン生成 */
function populateFieldSelector() {
    if (!subjectSelectField || !selectItems || !selectSelected) return;

    const subject = subjectSelectField.value;
    const fields = fieldsData[subject] || [];
    selectItems.innerHTML = '';
    selectSelected.textContent = fields.length > 0 ? '分野を選択...' : 'データがありません';
    selectSelected.dataset.value = "";

    if (fields.length === 0) return;

    const maxQuestions = Math.max(...fields.map(field => field.questions.length), 1);

    fields.forEach((field, index) => {
        const optionDiv = document.createElement('div');
        const questionCount = field.questions.length;
        const ratio = questionCount / maxQuestions;

        let colorClass = 'freq-low';
        if (ratio > 0.66) colorClass = 'freq-high';
        else if (ratio > 0.33) colorClass = 'freq-medium';

        const barWidthPercent = Math.max(Math.round(ratio * 100), 5);

        optionDiv.innerHTML = `
            <span>${field.fieldName} (${questionCount}問)</span>
            <span class="freq-bar-container">
                <span class="freq-bar ${colorClass}" style="width: ${barWidthPercent}%;"></span>
            </span>
        `;
        optionDiv.dataset.value = index;
        optionDiv.dataset.text = `${field.fieldName} (${questionCount}問)`;

        optionDiv.addEventListener('click', function(e) {
            e.stopPropagation();
            selectSelected.textContent = this.dataset.text;
            selectSelected.dataset.value = this.dataset.value;
            closeCustomSelect();
            const currentSelected = selectItems.querySelector('.same-as-selected');
            if (currentSelected) currentSelected.classList.remove('same-as-selected');
            this.classList.add('same-as-selected');
        });
        selectItems.appendChild(optionDiv);
    });
}

/** 分野別問題表示 */
async function displayFieldQuestion(index) {
    if (!currentFieldQuestions[index]) return;
    const question = currentFieldQuestions[index];
    
    // その問題の回の解答と解説をロード
    await loadAnswersForEdition(question.edition);
    await loadExplanations(question.edition); // 【追加】解説もロード

    const subject = subjectSelectField ? subjectSelectField.value : '';
    await renderPdf(question.edition, subject, parseInt(question.pageNum, 10));
}

/** 正答数更新 */
function updateScoreDisplay() {
    if(scoreCorrectEdition) scoreCorrectEdition.textContent = correctCount;
    if(scoreCorrectField) scoreCorrectField.textContent = correctCount;
}

/** 正誤判定 */
function checkAnswer(selectedChoice) {
    const questionId = getCurrentQuestionId();
    const resultArea = currentFieldQuestions.length > 0 ? resultAreaField : resultAreaEdition;
    const activePanel = currentFieldQuestions.length > 0 ? panelByField : panelByEdition;
    const explanationBtn = currentFieldQuestions.length > 0 ? btnExplanationField : btnExplanationEdition;

    if (!resultArea || !activePanel) return;
    const activeAnswerButtons = activePanel.querySelectorAll('.answer-btn');

    if (answerHistory[questionId]) { return; }

    let correctAnswer;
    let subjectKey;
    let questionPageNum;

     if (currentFieldQuestions.length > 0 && currentFieldQuestions[currentFieldIndex]) {
         const q = currentFieldQuestions[currentFieldIndex];
         subjectKey = subjectSelectField ? subjectSelectField.value : '';
         questionPageNum = q.pageNum;
         correctAnswer = currentAnswers?.[subjectKey]?.[questionPageNum];
     } else {
         subjectKey = subjectSelectEdition ? subjectSelectEdition.value : '';
         questionPageNum = currentPageNum;
         correctAnswer = currentAnswers?.[subjectKey]?.[questionPageNum];
     }

    if (correctAnswer === undefined) {
        resultArea.textContent = '解答データがありません。'; resultArea.className = 'result-area';
        answerHistory[questionId] = { selected: selectedChoice, correct: null, correctAnswer: '?' };
        activeAnswerButtons.forEach(btn => { btn.disabled = true; btn.classList.add('disabled'); });
        return;
    }

    const isCorrect = parseInt(selectedChoice, 10) === correctAnswer;
    answerHistory[questionId] = { selected: selectedChoice, correct: isCorrect, correctAnswer: correctAnswer };

    const selectedButton = activePanel.querySelector(`.answer-btn[data-choice="${selectedChoice}"]`);
    const correctButton = activePanel.querySelector(`.answer-btn[data-choice="${correctAnswer}"]`);

    if (isCorrect) {
        correctCount++; updateScoreDisplay();
        resultArea.textContent = `正解！ 🎉`; resultArea.className = 'result-area correct';
        if (selectedButton) selectedButton.classList.add('correct-selection');
    } else {
        resultArea.textContent = `不正解... (正解は ${correctAnswer}) ❌`; resultArea.className = 'result-area incorrect';
        if (selectedButton) selectedButton.classList.add('incorrect-selection');
        if (correctButton) correctButton.classList.add('correct-answer');
    }

    activeAnswerButtons.forEach(btn => { btn.disabled = true; btn.classList.add('disabled'); });

    // 【追加】解答後に解説ボタンを表示
    if(explanationBtn) explanationBtn.classList.remove('hidden');
}

/** 【修正・不具合解消版】解説を表示する関数 */
function showExplanationModal() {
    // 1. 変数宣言
    let subjectKey = "";
    let pageNum = "";
    let edition = "";

    // 2. モード判定
    const context = currentFieldQuestions.length > 0 && currentFieldQuestions[currentFieldIndex]
        ? { q: currentFieldQuestions[currentFieldIndex], mode: 'field' }
        : { q: null, mode: 'edition' };

    if (context.mode === 'field') {
        const q = context.q;
        subjectKey = subjectSelectField ? subjectSelectField.value : '';
        pageNum = q.pageNum;
        edition = q.edition;
    } else {
        subjectKey = subjectSelectEdition ? subjectSelectEdition.value : '';
        pageNum = currentPageNum;
        edition = editionSelect ? editionSelect.value : '';
    }

    console.log(`解説表示: 第${edition}回 ${subjectKey} 問${pageNum}`);

    // 3. データ取得
    const explanationData = currentExplanations?.[subjectKey]?.[pageNum];
    let displayText = explanationData ? explanationData.body : "この問題の解説はまだ登録されていません。";

    // 4. 【重要】数式保護処理（修正ポイント）
    // アンダースコア(_)を使わず、Markdown記法と被らない英数字のみのIDを使います
    const mathBlocks = [];
    displayText = displayText.replace(/(\$\$[\s\S]*?\$\$|\$[^$\n]*?\$)/g, (match) => {
        mathBlocks.push(match);
        // "MATHBLOCK" + 数字 + "END" という形式なら太字変換されません
        return `MATHBLOCK${mathBlocks.length - 1}END`;
    });

    // 5. Marked.js で Markdown を HTML に変換
    if (typeof marked !== 'undefined') {
        explanationBody.innerHTML = marked.parse(displayText);
    } else {
        explanationBody.textContent = displayText;
    }

    // 6. 【重要】数式の復元（修正ポイント）
    // 保護していたIDを探して、元の数式に戻します
    explanationBody.innerHTML = explanationBody.innerHTML.replace(/MATHBLOCK(\d+)END/g, (match, index) => {
        return mathBlocks[index];
    });

    // 7. KaTeX で数式をレンダリング
    if (typeof renderMathInElement !== 'undefined') {
        renderMathInElement(explanationBody, {
            delimiters: [
                {left: "$$", right: "$$", display: true},
                {left: "$", right: "$", display: false}
            ],
            throwOnError: false
        });
    }

    // 8. タイトル設定と表示
    explanationTitle.textContent = `解説 (第${edition}回 問${pageNum})`;
    explanationModal.style.display = 'block';
}

/** ナビボタン更新 */
function updateNavButtons() {
    if (!prevBtn || !nextBtn || !jumpToSelect) return;
    if (currentFieldQuestions.length > 0) {
        prevBtn.disabled = (currentFieldIndex <= 0);
        nextBtn.disabled = (currentFieldIndex >= currentFieldQuestions.length - 1);
        jumpToSelect.disabled = true;
    } else {
        const total = pdfDoc ? pdfDoc.numPages - 1 : 0;
        prevBtn.disabled = (currentPageNum <= 1);
        nextBtn.disabled = (currentPageNum >= total);
        jumpToSelect.disabled = false;
    }
}

/** 成績ページ表示 */
function showResults() {
    if(!exerciseView || !resultsPanel || !resultsList || !resultsSummary) return;
    exerciseView.classList.add('hidden'); resultsPanel.classList.remove('hidden');
    window.scrollTo(0, 0);
    const totalQuestions = currentSessionQuestions.length;
    let answeredCount = 0; let sessionCorrectCount = 0;
    resultsList.innerHTML = '';
    const table = document.createElement('table');
    table.innerHTML = `<thead><tr><th>問題</th><th>結果</th><th>あなたの解答</th><th>正解</th><th>復習</th></tr></thead><tbody></tbody>`;
    const tbody = table.querySelector('tbody');
    if (tbody) {
        currentSessionQuestions.forEach((qInfo, index) => {
            const questionId = getQuestionId(qInfo.edition, qInfo.subject, qInfo.pageNum);
            const history = answerHistory[questionId];
            const tr = document.createElement('tr');
            const questionNumDisplay = (currentFieldQuestions.length > 0)? `${index + 1} (第${qInfo.edition}回 問${qInfo.pageNum})`: `問 ${qInfo.pageNum}`;
            let statusText = '未解答'; let statusClass = '';
            let yourAnswer = '-'; let correctAnswer = currentAnswers?.[qInfo.subject]?.[qInfo.pageNum] ?? '?';
            if (history) {
                answeredCount++; yourAnswer = history.selected; correctAnswer = history.correctAnswer;
                if (history.correct === null) { statusText = '不明'; }
                else if (history.correct) { sessionCorrectCount++; statusText = '正解'; statusClass = 'result-status-correct'; }
                else { statusText = '不正解'; statusClass = 'result-status-incorrect'; }
            }
            tr.innerHTML = `<td>${questionNumDisplay}</td><td class="${statusClass}">${statusText}</td><td>${yourAnswer}</td><td>${correctAnswer}</td><td><button class="review-btn" data-index="${index}">解き直す</button></td>`;
            tbody.appendChild(tr);
        });
    }
    resultsList.appendChild(table);
    const accuracy = totalQuestions > 0 ? ((sessionCorrectCount / totalQuestions) * 100).toFixed(1) : 0;
    resultsSummary.innerHTML = `総問題数: ${totalQuestions}問 / 解答済み: ${answeredCount}問<br>正答数: ${sessionCorrectCount}問 / 正答率: ${accuracy}%`;
    
    document.querySelectorAll('.review-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index, 10);
            if (index < 0 || index >= currentSessionQuestions.length) return;
            const questionInfo = currentSessionQuestions[index];
            resultsPanel.classList.add('hidden'); exerciseView.classList.remove('hidden');
            if (currentFieldQuestions.length > 0) {
                 if(tabByField) tabByField.click();
                 if(subjectSelectField) subjectSelectField.value = questionInfo.subject;
                 populateFieldSelector();
                 const fieldIdx = fieldsData[questionInfo.subject]?.findIndex(f => f.questions.some(q => q.edition === questionInfo.edition && q.pageNum === questionInfo.pageNum));
                 if(fieldIdx !== undefined && fieldIdx > -1 && selectSelected) {
                     const targetOption = selectItems ? selectItems.querySelector(`div[data-value="${fieldIdx}"]`) : null;
                     if(targetOption){
                         selectSelected.textContent = targetOption.dataset.text;
                         selectSelected.dataset.value = fieldIdx;
                         const currentSelected = selectItems.querySelector('.same-as-selected');
                         if (currentSelected) currentSelected.classList.remove('same-as-selected');
                         targetOption.classList.add('same-as-selected');
                     }
                 }
                 currentFieldIndex = index;
                 displayFieldQuestion(index);
            } else {
                 if(tabByEdition) tabByEdition.click();
                 if(editionSelect) editionSelect.value = questionInfo.edition;
                 if(subjectSelectEdition) subjectSelectEdition.value = questionInfo.subject;
                 
                 // 【修正】解説もロードしてから描画
                 loadExplanations(questionInfo.edition).then(() => {
                     renderPdf(questionInfo.edition, questionInfo.subject, questionInfo.pageNum);
                 });
            }
        });
    });
}

/** カスタムセレクトを閉じる */
function closeCustomSelect() {
    if(selectItems) selectItems.classList.add('select-hide');
    if(selectSelected) selectSelected.classList.remove('select-arrow-active');
}

// --- イベントリスナー設定 ---
function setupEventListeners() {
    answerButtonsNodeList = document.querySelectorAll('.answer-btn');

    if (tabByEdition) tabByEdition.addEventListener('click', () => {
        tabByEdition.classList.add('active'); if(tabByField) tabByField.classList.remove('active');
        if(panelByEdition) panelByEdition.classList.remove('hidden'); if(panelByField) panelByField.classList.add('hidden');
        if(questionSource) questionSource.style.display = 'none';
    });
    if (tabByField) tabByField.addEventListener('click', () => {
        tabByField.classList.add('active'); if(tabByEdition) tabByEdition.classList.remove('active');
        if(panelByField) panelByField.classList.remove('hidden'); if(panelByEdition) panelByEdition.classList.add('hidden');
    });

    if (goBtnEdition) goBtnEdition.addEventListener('click', async () => {
        if(welcomeOverlay) welcomeOverlay.style.display = 'none'; window.scrollTo(0, 0);
        correctCount = 0; updateScoreDisplay(); answerHistory = {};
        currentFieldQuestions = [];
        const selectedEdition = editionSelect ? editionSelect.value : '';
        const selectedSubject = subjectSelectEdition ? subjectSelectEdition.value : '';
        currentSessionQuestions = [];
        const url = `./pdf/${selectedEdition}/${selectedEdition}_${selectedSubject}.pdf`;
        showLoading(true);
        try {
            const tempLoadingTask = pdfjsLib.getDocument(url);
            const tempPdfDoc = await tempLoadingTask.promise;
            const total = tempPdfDoc.numPages > 1 ? tempPdfDoc.numPages - 1 : 0;
            for (let i = 1; i <= total; i++) {
                currentSessionQuestions.push({ edition: selectedEdition, subject: selectedSubject, pageNum: i });
            }
        } catch (error) {
             console.error("セッションリスト生成PDF読込失敗", error); alert(`PDFファイルが見つかりません:\n${url}`);
             showLoading(false); return;
        }
        await loadAnswersForEdition(selectedEdition);
        await loadExplanations(selectedEdition); // 【追加】解説読み込み
        await renderPdf(selectedEdition, selectedSubject);
    });

    if (goBtnField) goBtnField.addEventListener('click', async () => {
        if(welcomeOverlay) welcomeOverlay.style.display = 'none'; window.scrollTo(0, 0);
        correctCount = 0; updateScoreDisplay(); answerHistory = {};
        const subject = subjectSelectField ? subjectSelectField.value : '';
        const fieldIndex = selectSelected ? selectSelected.dataset.value : '';
        if (fieldIndex === "" || !fieldsData[subject] || !fieldsData[subject][fieldIndex]) {
             alert("分野を選択してください。"); return;
        }
        currentFieldQuestions = fieldsData[subject][fieldIndex].questions;
        currentFieldIndex = 0;
        currentSessionQuestions = currentFieldQuestions.map(q => ({...q, subject: subject}));
        if (currentFieldQuestions.length === 0) {
            alert("この分野には問題が登録されていません。");
            return;
        }
        if(pageCountSpan) pageCountSpan.textContent = currentFieldQuestions.length;
        populateJumpSelector(0);
        showLoading(true);
        await displayFieldQuestion(currentFieldIndex);
    });

    if (subjectSelectEdition) subjectSelectEdition.addEventListener('change', (e) => { });
    if (editionSelect) editionSelect.addEventListener('change', (e) => { });
    if (subjectSelectField) subjectSelectField.addEventListener('change', populateFieldSelector);

    if (prevBtn) prevBtn.addEventListener('click', () => {
        if (currentFieldQuestions.length > 0) {
            if (currentFieldIndex > 0) { currentFieldIndex--; displayFieldQuestion(currentFieldIndex); }
        } else {
            if (currentPageNum > 1) { currentPageNum--; renderPageInternal(currentPageNum); }
        }
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
        if (currentFieldQuestions.length > 0) {
            if (currentFieldIndex < currentFieldQuestions.length - 1) { currentFieldIndex++; displayFieldQuestion(currentFieldIndex); }
        } else {
            const total = pdfDoc ? pdfDoc.numPages - 1 : 0;
            if (currentPageNum < total) { currentPageNum++; renderPageInternal(currentPageNum); }
        }
    });

    if (answerButtonsNodeList) answerButtonsNodeList.forEach(button => {
        button.addEventListener('click', (e) => {
            const parentPanel = e.currentTarget.closest('.control-panel');
            if (!parentPanel || parentPanel.classList.contains('hidden')) return;
            if (e.currentTarget.disabled) return;
            checkAnswer(e.currentTarget.dataset.choice);
        });
    });

    if (jumpToSelect) jumpToSelect.addEventListener('change', (e) => {
        if (currentFieldQuestions.length === 0) {
            const target = parseInt(e.target.value, 10);
            if (target) { currentPageNum = target; renderPageInternal(currentPageNum); }
        }
    });
    if (showResultsBtnEdition) showResultsBtnEdition.addEventListener('click', showResults);
    if (showResultsBtnField) showResultsBtnField.addEventListener('click', showResults);
    if (backToExerciseBtn) backToExerciseBtn.addEventListener('click', () => {
        if(resultsPanel) resultsPanel.classList.add('hidden');
        if(exerciseView) exerciseView.classList.remove('hidden');
    });

    // カスタムプルダウンのイベント
    if (selectSelected) selectSelected.addEventListener('click', function(e) {
        e.stopPropagation();
        if(selectItems) selectItems.classList.toggle('select-hide');
        this.classList.toggle('select-arrow-active');
    });
    document.addEventListener('click', function() { closeCustomSelect(); });

    // 【追加】解説ボタンとモーダルのイベント
    if (btnExplanationEdition) btnExplanationEdition.addEventListener('click', showExplanationModal);
    if (btnExplanationField) btnExplanationField.addEventListener('click', showExplanationModal);
    if (closeModalSpan) closeModalSpan.addEventListener('click', () => { explanationModal.style.display = "none"; });
    window.addEventListener('click', (e) => {
        if (e.target == explanationModal) { explanationModal.style.display = "none"; }
    });
}

/** 初期化処理 */
async function initialize() {
    console.log("🔄 アプリケーションの初期化を開始...");

    exerciseView = document.getElementById('exercise-view');
    resultsPanel = document.getElementById('results-panel');
    welcomeOverlay = document.getElementById('welcome-overlay');
    canvas = document.getElementById('pdf-canvas');
    loadingSpinner = document.getElementById('loading-spinner');
    pageNumSpan = document.getElementById('page-num');
    pageCountSpan = document.getElementById('page-count');
    prevBtn = document.getElementById('prev-btn');
    nextBtn = document.getElementById('next-btn');
    jumpToSelect = document.getElementById('jump-to-select');
    tabByEdition = document.getElementById('tab-by-edition');
    tabByField = document.getElementById('tab-by-field');
    panelByEdition = document.getElementById('panel-by-edition');
    panelByField = document.getElementById('panel-by-field');
    editionSelect = document.getElementById('edition-select');
    subjectSelectEdition = document.getElementById('subject-select-edition');
    goBtnEdition = document.getElementById('go-btn-edition');
    resultAreaEdition = document.getElementById('result-area-edition');
    scoreCorrectEdition = panelByEdition ? panelByEdition.querySelector('.score-correct') : null;
    showResultsBtnEdition = document.getElementById('show-results-btn-edition');
    subjectSelectField = document.getElementById('subject-select-field');
    customSelect = document.getElementById('field-select-custom');
    selectSelected = customSelect ? customSelect.querySelector('.select-selected') : null;
    selectItems = customSelect ? customSelect.querySelector('.select-items') : null;
    goBtnField = document.getElementById('go-btn-field');
    resultAreaField = document.getElementById('result-area-field');
    scoreCorrectField = panelByField ? panelByField.querySelector('.score-correct') : null;
    showResultsBtnField = document.getElementById('show-results-btn-field');
    questionSource = document.getElementById('question-source');
    resultsSummary = document.getElementById('results-summary');
    resultsList = document.getElementById('results-list');
    backToExerciseBtn = document.getElementById('back-to-exercise-btn');

    // 【追加】解説機能用の要素取得
    btnExplanationEdition = document.getElementById('btn-explanation-edition');
    btnExplanationField = document.getElementById('btn-explanation-field');
    explanationModal = document.getElementById('explanation-modal');
    explanationBody = document.getElementById('explanation-body');
    explanationTitle = document.getElementById('explanation-title');
    closeModalSpan = document.querySelector('.close-modal');

    setupEventListeners();
    await setupEditionSelector();
    await loadFieldsData();

    console.log("✅ 初期化完了。");
}

document.addEventListener('DOMContentLoaded', initialize);
