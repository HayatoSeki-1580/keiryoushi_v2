// --- モジュールのインポート ---
import * as pdfjsLib from './lib/pdfjs/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = './lib/pdfjs/build/pdf.worker.mjs';

// --- グローバル変数 ---
let exerciseView, resultsPanel, welcomeOverlay, canvas, loadingSpinner,
    pageNumSpan, pageCountSpan, prevBtn, nextBtn, jumpToSelect,
    tabByEdition, tabByField, tabByDifficulty,
    panelByEdition, panelByField, panelByDifficulty,
    editionSelect, subjectSelectEdition, goBtnEdition, resultAreaEdition, scoreCorrectEdition, showResultsBtnEdition,
    subjectSelectField,
    customSelect, selectSelected, selectItems,
    goBtnField, resultAreaField, scoreCorrectField, showResultsBtnField,
    difficultySelect, goBtnDifficulty, resultAreaDifficulty, scoreCorrectDifficulty, showResultsBtnDifficulty,
    difficultyToggles, difficultyBadge, // 【変更】トグルを配列で管理
    answerButtonsNodeList,
    questionSource, resultsSummary, resultsList, backToExerciseBtn;

// 解説機能用の変数
let btnExplanationEdition, btnExplanationField, btnExplanationDifficulty, explanationModal, explanationBody, explanationTitle, closeModalSpan;
let currentExplanations = {}; 

let pdfDoc = null;
let currentPageNum = 1;
let currentAnswers = {};
let fieldsData = {};
let difficultyData = []; 
let difficultyMap = {};  
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
    // 表示中のモードと問題に応じてIDを生成
    if (currentFieldQuestions.length > 0 && currentFieldQuestions[currentFieldIndex]) {
        // 分野別 または 難易度別モード
        const question = currentFieldQuestions[currentFieldIndex];
        // 難易度別の場合、questionオブジェクト内にsubjectが含まれている想定
        const subject = question.subject || (subjectSelectField ? subjectSelectField.value : '');
        return getQuestionId(question.edition, subject, question.pageNum);
    } else {
        // 回数別モード
        const currentSubjectVal = subjectSelectEdition ? subjectSelectEdition.value : '';
        const currentEditionVal = editionSelect ? editionSelect.value : '';
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

/** 難易度ファイル(difficulty.json)読込 */
async function loadDifficultyData() {
    if (!difficultySelect) return;
    try {
        const response = await fetch('./data/difficulty.json');
        if (!response.ok) throw new Error('難易度データ読込失敗');
        const data = await response.json();
        difficultyData = data.levels;

        // 1. セレクトボックスの作成
        difficultySelect.innerHTML = '<option value="">難易度を選択...</option>';
        difficultyData.forEach((level, index) => {
            const option = document.createElement('option');
            option.value = index; 
            option.textContent = `${level.levelName} (${level.questions.length}問)`;
            difficultySelect.appendChild(option);
        });

        // 2. 逆引きマップ (Difficulty Map) の作成
        difficultyMap = {}; 
        difficultyData.forEach(level => {
            level.questions.forEach(q => {
                const id = getQuestionId(q.edition, q.subject, q.pageNum);
                difficultyMap[id] = level.value;
            });
        });

    } catch (e) {
        console.error("❌ difficulty.json読込エラー:", e);
    }
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

/** 解説JSON読込 */
async function loadExplanations(edition) {
    const url = `./data/explanations/${edition}.json`;
    currentExplanations = {}; 
    try {
        const response = await fetch(url);
        if (response.ok) {
            currentExplanations = await response.json();
        }
    } catch (error) {
        console.warn("解説データの読み込みに失敗しました:", error);
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

/** 難易度表示の更新 */
function updateDifficultyDisplay(questionId) {
    // どれか一つのトグルがONなら表示する（同期している前提）
    const isVisible = difficultyToggles.length > 0 && difficultyToggles[0].checked;
    
    if (!difficultyBadge) return;

    const difficulty = difficultyMap[questionId];

    if (isVisible && difficulty) {
        difficultyBadge.textContent = `難易度: ${difficulty}`;
        difficultyBadge.classList.remove('hidden');
        
        // 色分け
        difficultyBadge.className = 'difficulty-badge'; // リセット
        if (difficulty === 'A') difficultyBadge.classList.add('diff-easy');
        else if (difficulty === 'B') difficultyBadge.classList.add('diff-normal');
        else if (difficulty === 'C') difficultyBadge.classList.add('diff-hard');
        else difficultyBadge.classList.add('diff-normal'); // デフォルト
        
    } else {
        difficultyBadge.classList.add('hidden');
    }
}

/** ページ描画(内部) */
async function renderPageInternal(pdfPageNum) {
    if (!pdfDoc || !canvas) return;
    try {
        // 現在アクティブなパネルを特定
        let activePanel = panelByEdition;
        if (!panelByField.classList.contains('hidden')) activePanel = panelByField;
        if (!panelByDifficulty.classList.contains('hidden')) activePanel = panelByDifficulty;

        const activeAnswerButtons = activePanel ? activePanel.querySelectorAll('.answer-btn') : [];
        activeAnswerButtons.forEach(btn => { btn.className = 'answer-btn'; btn.disabled = false; });

        // 解説ボタンを非表示にリセット
        if(btnExplanationEdition) btnExplanationEdition.classList.add('hidden');
        if(btnExplanationField) btnExplanationField.classList.add('hidden');
        if(btnExplanationDifficulty) btnExplanationDifficulty.classList.add('hidden');

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
            // 分野別・難易度別モード
            const question = currentFieldQuestions[currentFieldIndex];
            questionEdition = question.edition;
            questionSubject = question.subject || (subjectSelectField ? subjectSelectField.value : '');
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
            // 回数別モード
            questionEdition = editionSelect ? editionSelect.value : '';
            questionSubject = subjectSelectEdition ? subjectSelectEdition.value : '';
            questionPageNum = pdfPageNum;
            if(pageNumSpan) pageNumSpan.textContent = pdfPageNum;
            if(questionSource) questionSource.style.display = 'none';
            currentQuestionId = getQuestionId(questionEdition, questionSubject, pdfPageNum);
            if(jumpToSelect) jumpToSelect.value = pdfPageNum;
        }

        // 結果表示エリアのリセット
        if(resultAreaEdition) resultAreaEdition.textContent = '';
        if(resultAreaField) resultAreaField.textContent = '';
        if(resultAreaDifficulty) resultAreaDifficulty.textContent = '';
        
        updateNavButtons();

        // 難易度表示更新
        updateDifficultyDisplay(currentQuestionId);

        // 履歴があれば反映
        const history = answerHistory[currentQuestionId];
        // アクティブな結果エリアを特定
        let activeResultArea = resultAreaEdition;
        if (activePanel === panelByField) activeResultArea = resultAreaField;
        if (activePanel === panelByDifficulty) activeResultArea = resultAreaDifficulty;

        // アクティブな解説ボタンを特定
        let activeExplanationBtn = btnExplanationEdition;
        if (activePanel === panelByField) activeExplanationBtn = btnExplanationField;
        if (activePanel === panelByDifficulty) activeExplanationBtn = btnExplanationDifficulty;

        if (history && activePanel && activeResultArea) {
            const selectedButton = activePanel.querySelector(`.answer-btn[data-choice="${history.selected}"]`);
            const correctButton = activePanel.querySelector(`.answer-btn[data-choice="${history.correctAnswer}"]`);

            if (history.correct) {
                if(selectedButton) selectedButton.classList.add('correct-selection');
                activeResultArea.textContent = `正解！ 🎉`;
                activeResultArea.className = 'result-area correct';
            } else {
                if(selectedButton) selectedButton.classList.add('incorrect-selection');
                if(correctButton) correctButton.classList.add('correct-answer');
                activeResultArea.textContent = `不正解... (正解は ${history.correctAnswer}) ❌`;
                activeResultArea.className = 'result-area incorrect';
            }
            activeAnswerButtons.forEach(btn => { btn.disabled = true; btn.classList.add('disabled'); });

            // すでに解答済みの場合は解説ボタンを表示
            if(activeExplanationBtn) activeExplanationBtn.classList.remove('hidden');
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

/** 分野別・難易度別問題表示 */
async function displayFieldQuestion(index) {
    if (!currentFieldQuestions[index]) return;
    const question = currentFieldQuestions[index];
    
    // その問題の回の解答と解説をロード
    await loadAnswersForEdition(question.edition);
    await loadExplanations(question.edition);

    // 難易度別の場合、question自体にsubjectが含まれている。分野別はセレクトボックスから。
    const subject = question.subject || (subjectSelectField ? subjectSelectField.value : '');
    await renderPdf(question.edition, subject, parseInt(question.pageNum, 10));
}

/** 正答数更新 */
function updateScoreDisplay() {
    if(scoreCorrectEdition) scoreCorrectEdition.textContent = correctCount;
    if(scoreCorrectField) scoreCorrectField.textContent = correctCount;
    if(scoreCorrectDifficulty) scoreCorrectDifficulty.textContent = correctCount;
}

/** 正誤判定 */
function checkAnswer(selectedChoice) {
    const questionId = getCurrentQuestionId();
    
    // 現在のアクティブなパネルを判定
    let activePanel = panelByEdition;
    let resultArea = resultAreaEdition;
    let explanationBtn = btnExplanationEdition;
    
    if (!panelByField.classList.contains('hidden')) {
        activePanel = panelByField;
        resultArea = resultAreaField;
        explanationBtn = btnExplanationField;
    } else if (!panelByDifficulty.classList.contains('hidden')) {
        activePanel = panelByDifficulty;
        resultArea = resultAreaDifficulty;
        explanationBtn = btnExplanationDifficulty;
    }

    if (!resultArea || !activePanel) return;
    const activeAnswerButtons = activePanel.querySelectorAll('.answer-btn');

    if (answerHistory[questionId]) { return; }

    let correctAnswer;
    let subjectKey;
    let questionPageNum;

     if (currentFieldQuestions.length > 0 && currentFieldQuestions[currentFieldIndex]) {
         const q = currentFieldQuestions[currentFieldIndex];
         subjectKey = q.subject || (subjectSelectField ? subjectSelectField.value : '');
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

    // 解答後に解説ボタンを表示
    if(explanationBtn) explanationBtn.classList.remove('hidden');
}

/** 解説を表示する関数 */
function showExplanationModal() {
    let subjectKey = "";
    let pageNum = "";
    let edition = "";

    // モード判定
    const context = currentFieldQuestions.length > 0 && currentFieldQuestions[currentFieldIndex]
        ? { q: currentFieldQuestions[currentFieldIndex], mode: 'field' }
        : { q: null, mode: 'edition' };

    if (context.mode === 'field') {
        const q = context.q;
        subjectKey = q.subject || (subjectSelectField ? subjectSelectField.value : '');
        pageNum = q.pageNum;
        edition = q.edition;
    } else {
        subjectKey = subjectSelectEdition ? subjectSelectEdition.value : '';
        pageNum = currentPageNum;
        edition = editionSelect ? editionSelect.value : '';
    }

    // データ取得
    const explanationData = currentExplanations?.[subjectKey]?.[pageNum];
    let displayText = explanationData ? explanationData.body : "この問題の解説はまだ登録されていません。";

    // 数式保護処理
    const mathBlocks = [];
    displayText = displayText.replace(/(\$\$[\s\S]*?\$\$|\$[^$\n]*?\$)/g, (match) => {
        mathBlocks.push(match);
        return `MATHBLOCK${mathBlocks.length - 1}END`;
    });

    // Marked.js で Markdown を HTML に変換
    if (typeof marked !== 'undefined') {
        explanationBody.innerHTML = marked.parse(displayText);
    } else {
        explanationBody.textContent = displayText;
    }

    // 数式の復元
    explanationBody.innerHTML = explanationBody.innerHTML.replace(/MATHBLOCK(\d+)END/g, (match, index) => {
        return mathBlocks[index];
    });

    // KaTeX で数式をレンダリング
    if (typeof renderMathInElement !== 'undefined') {
        renderMathInElement(explanationBody, {
            delimiters: [
                {left: "$$", right: "$$", display: true},
                {left: "$", right: "$", display: false}
            ],
            throwOnError: false
        });
    }

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
            
            // モードに応じた復帰処理
            // 難易度別モードからの復帰
            if (!panelByDifficulty.classList.contains('hidden')) {
                 currentFieldIndex = index;
                 displayFieldQuestion(index);
                 return;
            }

            // 分野別モードからの復帰
            if (!panelByField.classList.contains('hidden')) {
                 if(subjectSelectField) subjectSelectField.value = questionInfo.subject;
                 populateFieldSelector();
                 currentFieldIndex = index;
                 displayFieldQuestion(index);
                 return;
            }

            // 回数別モードからの復帰
            if(tabByEdition) tabByEdition.click();
            if(editionSelect) editionSelect.value = questionInfo.edition;
            if(subjectSelectEdition) subjectSelectEdition.value = questionInfo.subject;
            loadExplanations(questionInfo.edition).then(() => {
                renderPdf(questionInfo.edition, questionInfo.subject, questionInfo.pageNum);
            });
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

    // タブ切り替え処理の修正
    const tabs = [tabByEdition, tabByField, tabByDifficulty];
    const panels = [panelByEdition, panelByField, panelByDifficulty];

    if (tabByEdition) tabByEdition.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active')); tabByEdition.classList.add('active');
        panels.forEach(p => p.classList.add('hidden')); panelByEdition.classList.remove('hidden');
        if(questionSource) questionSource.style.display = 'none';
    });
    if (tabByField) tabByField.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active')); tabByField.classList.add('active');
        panels.forEach(p => p.classList.add('hidden')); panelByField.classList.remove('hidden');
    });
    if (tabByDifficulty) tabByDifficulty.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active')); tabByDifficulty.classList.add('active');
        panels.forEach(p => p.classList.add('hidden')); panelByDifficulty.classList.remove('hidden');
    });

    // 回数別「表示」
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
        await loadExplanations(selectedEdition);
        await renderPdf(selectedEdition, selectedSubject);
    });

    // 分野別「表示」
    if (goBtnField) goBtnField.addEventListener('click', async () => {
        if(welcomeOverlay) welcomeOverlay.style.display = 'none'; window.scrollTo(0, 0);
        correctCount = 0; updateScoreDisplay(); answerHistory = {};
        const subject = subjectSelectField ? subjectSelectField.value : '';
        const fieldIndex = selectSelected ? selectSelected.dataset.value : '';
        if (fieldIndex === "" || !fieldsData[subject] || !fieldsData[subject][fieldIndex]) {
             alert("分野を選択してください。"); return;
        }
        currentFieldQuestions = fieldsData[subject][fieldIndex].questions;
        // 分野データにはsubjectがない場合があるので補完
        currentFieldQuestions = currentFieldQuestions.map(q => ({...q, subject: subject}));
        
        currentFieldIndex = 0;
        currentSessionQuestions = currentFieldQuestions; // そのまま参照渡し
        if (currentFieldQuestions.length === 0) {
            alert("この分野には問題が登録されていません。"); return;
        }
        if(pageCountSpan) pageCountSpan.textContent = currentFieldQuestions.length;
        populateJumpSelector(0);
        showLoading(true);
        await displayFieldQuestion(currentFieldIndex);
    });

    // 難易度別「表示」
    if (goBtnDifficulty) goBtnDifficulty.addEventListener('click', async () => {
        if(welcomeOverlay) welcomeOverlay.style.display = 'none'; window.scrollTo(0, 0);
        correctCount = 0; updateScoreDisplay(); answerHistory = {};
        
        const index = difficultySelect ? difficultySelect.value : '';
        if (index === "") { alert("難易度を選択してください。"); return; }
        
        currentFieldQuestions = difficultyData[index].questions;
        
        currentFieldIndex = 0;
        currentSessionQuestions = currentFieldQuestions;
        
        if (currentFieldQuestions.length === 0) {
            alert("この難易度には問題が登録されていません。"); return;
        }
        if(pageCountSpan) pageCountSpan.textContent = currentFieldQuestions.length;
        populateJumpSelector(0);
        showLoading(true);
        await displayFieldQuestion(currentFieldIndex);
    });

    // 難易度トグル切り替え (全て連動させる)
    if (difficultyToggles.length > 0) {
        difficultyToggles.forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                // 全てのトグルの状態を合わせる
                difficultyToggles.forEach(t => t.checked = isChecked);
                
                const currentQId = getCurrentQuestionId();
                updateDifficultyDisplay(currentQId);
            });
        });
    }

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
    
    // 成績表示ボタン
    if (showResultsBtnEdition) showResultsBtnEdition.addEventListener('click', showResults);
    if (showResultsBtnField) showResultsBtnField.addEventListener('click', showResults);
    if (showResultsBtnDifficulty) showResultsBtnDifficulty.addEventListener('click', showResults);

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

    // 解説ボタンとモーダルのイベント
    if (btnExplanationEdition) btnExplanationEdition.addEventListener('click', showExplanationModal);
    if (btnExplanationField) btnExplanationField.addEventListener('click', showExplanationModal);
    if (btnExplanationDifficulty) btnExplanationDifficulty.addEventListener('click', showExplanationModal);

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
    
    // タブ
    tabByEdition = document.getElementById('tab-by-edition');
    tabByField = document.getElementById('tab-by-field');
    tabByDifficulty = document.getElementById('tab-by-difficulty');

    // パネル
    panelByEdition = document.getElementById('panel-by-edition');
    panelByField = document.getElementById('panel-by-field');
    panelByDifficulty = document.getElementById('panel-by-difficulty');

    // 回数別
    editionSelect = document.getElementById('edition-select');
    subjectSelectEdition = document.getElementById('subject-select-edition');
    goBtnEdition = document.getElementById('go-btn-edition');
    resultAreaEdition = document.getElementById('result-area-edition');
    scoreCorrectEdition = panelByEdition ? panelByEdition.querySelector('.score-correct') : null;
    showResultsBtnEdition = document.getElementById('show-results-btn-edition');
    
    // 分野別
    subjectSelectField = document.getElementById('subject-select-field');
    customSelect = document.getElementById('field-select-custom');
    selectSelected = customSelect ? customSelect.querySelector('.select-selected') : null;
    selectItems = customSelect ? customSelect.querySelector('.select-items') : null;
    goBtnField = document.getElementById('go-btn-field');
    resultAreaField = document.getElementById('result-area-field');
    scoreCorrectField = panelByField ? panelByField.querySelector('.score-correct') : null;
    showResultsBtnField = document.getElementById('show-results-btn-field');
    
    // 難易度別
    difficultySelect = document.getElementById('difficulty-select');
    goBtnDifficulty = document.getElementById('go-btn-difficulty');
    resultAreaDifficulty = document.getElementById('result-area-difficulty');
    scoreCorrectDifficulty = panelByDifficulty ? panelByDifficulty.querySelector('.score-correct') : null;
    showResultsBtnDifficulty = document.getElementById('show-results-btn-difficulty');
    
    // 難易度トグル (クラスでまとめて取得)
    difficultyToggles = document.querySelectorAll('.difficulty-toggle-checkbox');
    difficultyBadge = document.getElementById('difficulty-badge');

    questionSource = document.getElementById('question-source');
    resultsSummary = document.getElementById('results-summary');
    resultsList = document.getElementById('results-list');
    backToExerciseBtn = document.getElementById('back-to-exercise-btn');

    // 解説機能用の要素取得
    btnExplanationEdition = document.getElementById('btn-explanation-edition');
    btnExplanationField = document.getElementById('btn-explanation-field');
    btnExplanationDifficulty = document.getElementById('btn-explanation-difficulty');
    explanationModal = document.getElementById('explanation-modal');
    explanationBody = document.getElementById('explanation-body');
    explanationTitle = document.getElementById('explanation-title');
    closeModalSpan = document.querySelector('.close-modal');

    await setupEditionSelector();
    await loadFieldsData();
    await loadDifficultyData();

    setupEventListeners();

    console.log("✅ 初期化完了。");
}

document.addEventListener('DOMContentLoaded', initialize);
