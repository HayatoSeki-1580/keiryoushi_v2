// --- モジュールのインポート ---
import * as pdfjsLib from './lib/pdfjs/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = './lib/pdfjs/build/pdf.worker.mjs';

// --- グローバル変数 ---
let exerciseView, resultsPanel, welcomeOverlay, canvas, loadingSpinner,
    pageNumSpan, pageCountSpan, prevBtn, nextBtn, jumpToSelect,
    tabByEdition, tabByField, tabShuffle,
    panelByEdition, panelByField, panelShuffle,
    editionSelect, subjectSelectEdition, goBtnEdition, resultAreaEdition, scoreCorrectEdition, showResultsBtnEdition,
    subjectSelectField,
    customSelect, selectSelected, selectItems,
    goBtnField, resultAreaField, scoreCorrectField, showResultsBtnField,
    subjectSelectShuffle, goBtnShuffle, resultAreaShuffle, scoreCorrectShuffle, showResultsBtnShuffle,
    difficultyToggles, difficultyBadge,
    filterCheckboxes,
    answerButtonsNodeList,
    questionSource, resultsSummary, resultsList, backToExerciseBtn;

// 解説機能用の変数
let btnExplanationEdition, btnExplanationField, btnExplanationShuffle, explanationModal, explanationBody, explanationTitle, closeModalSpan;
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
    if (currentFieldQuestions.length > 0 && currentFieldQuestions[currentFieldIndex]) {
        const question = currentFieldQuestions[currentFieldIndex];
        const subject = question.subject || (subjectSelectField ? subjectSelectField.value : '') || (subjectSelectEdition ? subjectSelectEdition.value : '');
        return getQuestionId(question.edition, subject, question.pageNum);
    } 
    return 'unknown';
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
    try {
        const response = await fetch('./data/difficulty.json');
        if (!response.ok) throw new Error('難易度データ読込失敗');
        const data = await response.json();
        difficultyData = data.levels;

        // ID検索用マップ作成
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

/** 難易度フィルター判定 */
function isDifficultyAllowed(questionId) {
    // フィルターチェックボックスの状態を確認
    const allowed = new Set();
    filterCheckboxes.forEach(cb => {
        if (cb.checked) allowed.add(cb.value);
    });

    const difficulty = difficultyMap[questionId];
    if (!difficulty) return true; // 難易度未定義は表示
    return allowed.has(difficulty);
}

/** リストの難易度フィルタリング */
function filterQuestionsByDifficulty(questions, defaultSubject = '') {
    return questions.filter(q => {
        const subject = q.subject || defaultSubject;
        const id = getQuestionId(q.edition, subject, q.pageNum);
        return isDifficultyAllowed(id);
    });
}

/** 配列をシャッフルする */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
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
        await renderPageInternal(currentPageNum);
    } catch (error) {
        console.error("❌ PDF読込エラー:", error);
        alert(`PDFファイルが見つかりません:\n${url}`);
        const context = canvas.getContext('2d');
        if (context) context.clearRect(0, 0, canvas.width, canvas.height);
    } finally {
        showLoading(false);
    }
}

/** ジャンプ用プルダウン生成 */
function populateJumpSelector(questions) {
    if (!jumpToSelect) return;
    jumpToSelect.innerHTML = '<option value="">移動...</option>';
    if (Array.isArray(questions)) {
        questions.forEach((q, index) => {
            const option = document.createElement('option');
            option.value = index; 
            option.textContent = `問${q.pageNum}`; 
            jumpToSelect.appendChild(option);
        });
    } else {
        const total = typeof questions === 'number' ? questions : 0;
        for (let i = 1; i <= total; i++) {
            const option = document.createElement('option');
            option.value = i - 1;
            option.textContent = `問${i}`;
            jumpToSelect.appendChild(option);
        }
    }
}

/** 難易度表示の更新 (修正版) */
function updateDifficultyDisplay(questionId) {
    const isVisible = difficultyToggles.length > 0 && difficultyToggles[0].checked;
    
    if (!difficultyBadge) return;

    const difficulty = difficultyMap[questionId];

    if (isVisible && difficulty) {
        // 【修正】難易度記号を表示用テキストに変換
        let displayText = difficulty;
        let colorClass = 'diff-normal';

        if (difficulty === 'A') { displayText = "A(易)"; colorClass = 'diff-easy'; }
        else if (difficulty === 'B') { displayText = "B(普)"; colorClass = 'diff-normal'; }
        else if (difficulty === 'C') { displayText = "C(難)"; colorClass = 'diff-hard'; }

        difficultyBadge.textContent = `難易度: ${displayText}`;
        difficultyBadge.classList.remove('hidden');
        
        difficultyBadge.className = 'difficulty-badge'; 
        difficultyBadge.classList.add(colorClass);
        
    } else {
        difficultyBadge.classList.add('hidden');
    }
}

/** ページ描画(内部) */
async function renderPageInternal(pdfPageNum) {
    if (!pdfDoc || !canvas) return;
    try {
        let activePanel = panelByEdition;
        if (!panelByField.classList.contains('hidden')) activePanel = panelByField;
        if (!panelShuffle.classList.contains('hidden')) activePanel = panelShuffle;

        const activeAnswerButtons = activePanel ? activePanel.querySelectorAll('.answer-btn') : [];
        activeAnswerButtons.forEach(btn => { btn.className = 'answer-btn'; btn.disabled = false; });

        // 解説ボタンリセット
        if(btnExplanationEdition) btnExplanationEdition.classList.add('hidden');
        if(btnExplanationField) btnExplanationField.classList.add('hidden');
        if(btnExplanationShuffle) btnExplanationShuffle.classList.add('hidden');

        const pageObj = await pdfDoc.getPage(pdfPageNum); 
        const viewport = pageObj.getViewport({ scale: 1.8 });
        const context = canvas.getContext('2d');
        canvas.height = viewport.height; canvas.width = viewport.width;
        context.clearRect(0, 0, canvas.width, canvas.height);
        await pageObj.render({ canvasContext: context, viewport }).promise;

        // 問題情報の更新
        if (currentFieldQuestions.length > 0 && currentFieldQuestions[currentFieldIndex]) {
            const question = currentFieldQuestions[currentFieldIndex];
            const subject = question.subject || (subjectSelectField ? subjectSelectField.value : '') || (subjectSelectEdition ? subjectSelectEdition.value : '');
            
            if(pageNumSpan) pageNumSpan.textContent = currentFieldIndex + 1; // 何問目か
            
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
            
            const currentQuestionId = getQuestionId(question.edition, subject, question.pageNum);
            
            // 結果表示リセット
            if(resultAreaEdition) resultAreaEdition.textContent = '';
            if(resultAreaField) resultAreaField.textContent = '';
            if(resultAreaShuffle) resultAreaShuffle.textContent = '';
            
            updateNavButtons();
            updateDifficultyDisplay(currentQuestionId);

            // 履歴反映
            const history = answerHistory[currentQuestionId];
            let activeResultArea = resultAreaEdition;
            if (activePanel === panelByField) activeResultArea = resultAreaField;
            if (activePanel === panelShuffle) activeResultArea = resultAreaShuffle;

            let activeExplanationBtn = btnExplanationEdition;
            if (activePanel === panelByField) activeExplanationBtn = btnExplanationField;
            if (activePanel === panelShuffle) activeExplanationBtn = btnExplanationShuffle;

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
                if(activeExplanationBtn) activeExplanationBtn.classList.remove('hidden');
            }
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

/** 問題表示 (全モード共通) */
async function displayFieldQuestion(index) {
    if (!currentFieldQuestions[index]) return;
    const question = currentFieldQuestions[index];
    
    await loadAnswersForEdition(question.edition);
    await loadExplanations(question.edition);

    const subject = question.subject || (subjectSelectField ? subjectSelectField.value : '') || (subjectSelectEdition ? subjectSelectEdition.value : '');
    await renderPdf(question.edition, subject, parseInt(question.pageNum, 10));
}

/** 正答数更新 */
function updateScoreDisplay() {
    if(scoreCorrectEdition) scoreCorrectEdition.textContent = correctCount;
    if(scoreCorrectField) scoreCorrectField.textContent = correctCount;
    if(scoreCorrectShuffle) scoreCorrectShuffle.textContent = correctCount;
}

/** 正誤判定 */
function checkAnswer(selectedChoice) {
    const questionId = getCurrentQuestionId();
    
    let activePanel = panelByEdition;
    let resultArea = resultAreaEdition;
    let explanationBtn = btnExplanationEdition;
    
    if (!panelByField.classList.contains('hidden')) {
        activePanel = panelByField;
        resultArea = resultAreaField;
        explanationBtn = btnExplanationField;
    } else if (!panelShuffle.classList.contains('hidden')) {
        activePanel = panelShuffle;
        resultArea = resultAreaShuffle;
        explanationBtn = btnExplanationShuffle;
    }

    if (!resultArea || !activePanel) return;
    const activeAnswerButtons = activePanel.querySelectorAll('.answer-btn');

    if (answerHistory[questionId]) { return; }

    let correctAnswer;
    let subjectKey;
    let questionPageNum;

     if (currentFieldQuestions.length > 0 && currentFieldQuestions[currentFieldIndex]) {
         const q = currentFieldQuestions[currentFieldIndex];
         subjectKey = q.subject || (subjectSelectField ? subjectSelectField.value : '') || (subjectSelectEdition ? subjectSelectEdition.value : '');
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
    if(explanationBtn) explanationBtn.classList.remove('hidden');
}

/** 解説を表示する関数 */
function showExplanationModal() {
    let subjectKey = "";
    let pageNum = "";
    let edition = "";

    const q = currentFieldQuestions[currentFieldIndex];
    if (q) {
        subjectKey = q.subject || (subjectSelectField ? subjectSelectField.value : '') || (subjectSelectEdition ? subjectSelectEdition.value : '');
        pageNum = q.pageNum;
        edition = q.edition;
    } else {
        return;
    }

    const explanationData = currentExplanations?.[subjectKey]?.[pageNum];
    let displayText = explanationData ? explanationData.body : "この問題の解説はまだ登録されていません。";

    const mathBlocks = [];
    displayText = displayText.replace(/(\$\$[\s\S]*?\$\$|\$[^$\n]*?\$)/g, (match) => {
        mathBlocks.push(match);
        return `MATHBLOCK${mathBlocks.length - 1}END`;
    });

    if (typeof marked !== 'undefined') {
        explanationBody.innerHTML = marked.parse(displayText);
    } else {
        explanationBody.textContent = displayText;
    }

    explanationBody.innerHTML = explanationBody.innerHTML.replace(/MATHBLOCK(\d+)END/g, (match, index) => {
        return mathBlocks[index];
    });

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
    prevBtn.disabled = (currentFieldIndex <= 0);
    nextBtn.disabled = (currentFieldIndex >= currentFieldQuestions.length - 1);
    jumpToSelect.disabled = false;
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
            const subject = qInfo.subject || (subjectSelectField ? subjectSelectField.value : '') || (subjectSelectEdition ? subjectSelectEdition.value : '');
            const questionId = getQuestionId(qInfo.edition, subject, qInfo.pageNum);
            const history = answerHistory[questionId];
            const tr = document.createElement('tr');
            
            const questionNumDisplay = `第${qInfo.edition}回 問${qInfo.pageNum}`;
            let statusText = '未解答'; let statusClass = '';
            let yourAnswer = '-'; let correctAnswer = currentAnswers?.[subject]?.[qInfo.pageNum] ?? '?';
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
            
            currentFieldQuestions = currentSessionQuestions;
            currentFieldIndex = index;
            displayFieldQuestion(index);
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

    const tabs = [tabByEdition, tabByField, tabShuffle];
    const panels = [panelByEdition, panelByField, panelShuffle];

    if (tabByEdition) tabByEdition.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active')); tabByEdition.classList.add('active');
        panels.forEach(p => p.classList.add('hidden')); panelByEdition.classList.remove('hidden');
        if(questionSource) questionSource.style.display = 'none';
    });
    if (tabByField) tabByField.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active')); tabByField.classList.add('active');
        panels.forEach(p => p.classList.add('hidden')); panelByField.classList.remove('hidden');
    });
    if (tabShuffle) tabShuffle.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active')); tabShuffle.classList.add('active');
        panels.forEach(p => p.classList.add('hidden')); panelShuffle.classList.remove('hidden');
    });

    // 回数別「表示」
    if (goBtnEdition) goBtnEdition.addEventListener('click', async () => {
        if(welcomeOverlay) welcomeOverlay.style.display = 'none'; window.scrollTo(0, 0);
        correctCount = 0; updateScoreDisplay(); answerHistory = {};
        
        const selectedEdition = editionSelect ? editionSelect.value : '';
        const selectedSubject = subjectSelectEdition ? subjectSelectEdition.value : '';
        
        const url = `./pdf/${selectedEdition}/${selectedEdition}_${selectedSubject}.pdf`;
        showLoading(true);
        let tempQuestions = [];
        try {
            const tempLoadingTask = pdfjsLib.getDocument(url);
            const tempPdfDoc = await tempLoadingTask.promise;
            const total = tempPdfDoc.numPages > 1 ? tempPdfDoc.numPages - 1 : 0;
            for (let i = 1; i <= total; i++) {
                tempQuestions.push({ edition: selectedEdition, subject: selectedSubject, pageNum: i });
            }
        } catch (error) {
             console.error("PDF読込失敗", error); alert(`PDFファイルが見つかりません:\n${url}`);
             showLoading(false); return;
        }

        currentFieldQuestions = filterQuestionsByDifficulty(tempQuestions, selectedSubject);
        currentSessionQuestions = currentFieldQuestions;

        if (currentFieldQuestions.length === 0) {
            showLoading(false);
            alert("該当する難易度の問題がありません。");
            return;
        }

        if(pageCountSpan) pageCountSpan.textContent = currentFieldQuestions.length;
        populateJumpSelector(currentFieldQuestions);
        currentFieldIndex = 0;
        
        await displayFieldQuestion(0);
        showLoading(false);
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
        
        let tempQuestions = fieldsData[subject][fieldIndex].questions;
        tempQuestions = tempQuestions.map(q => ({...q, subject: subject}));
        
        currentFieldQuestions = filterQuestionsByDifficulty(tempQuestions, subject);
        currentSessionQuestions = currentFieldQuestions;
        
        if (currentFieldQuestions.length === 0) {
            alert("該当する難易度の問題がありません。"); return;
        }
        if(pageCountSpan) pageCountSpan.textContent = currentFieldQuestions.length;
        populateJumpSelector(currentFieldQuestions);
        
        showLoading(true);
        currentFieldIndex = 0;
        await displayFieldQuestion(currentFieldIndex);
        showLoading(false);
    });

    // シャッフル演習「シャッフル出題」
    if (goBtnShuffle) goBtnShuffle.addEventListener('click', async () => {
        if(welcomeOverlay) welcomeOverlay.style.display = 'none'; window.scrollTo(0, 0);
        correctCount = 0; updateScoreDisplay(); answerHistory = {};
        
        const targetSubject = subjectSelectShuffle ? subjectSelectShuffle.value : 'all';
        
        // difficultyDataから全問題を取得し、難易度と科目でフィルタリング
        let tempQuestions = [];
        
        const allowed = new Set();
        filterCheckboxes.forEach(cb => { if (cb.checked) allowed.add(cb.value); });

        difficultyData.forEach(level => {
            if (allowed.has(level.value)) {
                // 科目フィルタ
                const filtered = level.questions.filter(q => targetSubject === 'all' || q.subject === targetSubject);
                tempQuestions = tempQuestions.concat(filtered);
            }
        });
        
        if (tempQuestions.length === 0) {
            alert("条件に合致する問題がありません（難易度フィルターや科目を確認してください）。"); return;
        }
        
        // シャッフル実行
        shuffleArray(tempQuestions);
        
        currentFieldQuestions = tempQuestions;
        currentSessionQuestions = currentFieldQuestions;
        
        if(pageCountSpan) pageCountSpan.textContent = currentFieldQuestions.length;
        populateJumpSelector(currentFieldQuestions);
        
        showLoading(true);
        currentFieldIndex = 0;
        await displayFieldQuestion(currentFieldIndex);
        showLoading(false);
    });

    // 難易度トグル同期
    if (difficultyToggles.length > 0) {
        difficultyToggles.forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                difficultyToggles.forEach(t => t.checked = isChecked);
                const currentQId = getCurrentQuestionId();
                updateDifficultyDisplay(currentQId);
            });
        });
    }

    // フィルターチェックボックス同期
    if (filterCheckboxes.length > 0) {
        filterCheckboxes.forEach(cb => {
            cb.addEventListener('change', (e) => {
                const val = e.target.value;
                const isChecked = e.target.checked;
                filterCheckboxes.forEach(other => {
                    if (other.value === val) other.checked = isChecked;
                });
            });
        });
    }

    if (subjectSelectEdition) subjectSelectEdition.addEventListener('change', (e) => { });
    if (editionSelect) editionSelect.addEventListener('change', (e) => { });
    if (subjectSelectField) subjectSelectField.addEventListener('change', populateFieldSelector);

    if (prevBtn) prevBtn.addEventListener('click', () => {
        if (currentFieldIndex > 0) { 
            currentFieldIndex--; 
            displayFieldQuestion(currentFieldIndex); 
        }
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
        if (currentFieldIndex < currentFieldQuestions.length - 1) { 
            currentFieldIndex++; 
            displayFieldQuestion(currentFieldIndex); 
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
        const targetIndex = parseInt(e.target.value, 10);
        if (!isNaN(targetIndex) && currentFieldQuestions[targetIndex]) {
            currentFieldIndex = targetIndex;
            displayFieldQuestion(currentFieldIndex);
        }
    });
    
    if (showResultsBtnEdition) showResultsBtnEdition.addEventListener('click', showResults);
    if (showResultsBtnField) showResultsBtnField.addEventListener('click', showResults);
    if (showResultsBtnShuffle) showResultsBtnShuffle.addEventListener('click', showResults);

    if (backToExerciseBtn) backToExerciseBtn.addEventListener('click', () => {
        if(resultsPanel) resultsPanel.classList.add('hidden');
        if(exerciseView) exerciseView.classList.remove('hidden');
    });

    if (selectSelected) selectSelected.addEventListener('click', function(e) {
        e.stopPropagation();
        if(selectItems) selectItems.classList.toggle('select-hide');
        this.classList.toggle('select-arrow-active');
    });
    document.addEventListener('click', function() { closeCustomSelect(); });

    if (btnExplanationEdition) btnExplanationEdition.addEventListener('click', showExplanationModal);
    if (btnExplanationField) btnExplanationField.addEventListener('click', showExplanationModal);
    if (btnExplanationShuffle) btnExplanationShuffle.addEventListener('click', showExplanationModal);

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
    tabShuffle = document.getElementById('tab-shuffle'); 

    // パネル
    panelByEdition = document.getElementById('panel-by-edition');
    panelByField = document.getElementById('panel-by-field');
    panelShuffle = document.getElementById('panel-shuffle'); 

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
    
    // シャッフル演習
    subjectSelectShuffle = document.getElementById('subject-select-shuffle');
    goBtnShuffle = document.getElementById('go-btn-shuffle');
    resultAreaShuffle = document.getElementById('result-area-shuffle');
    scoreCorrectShuffle = panelShuffle ? panelShuffle.querySelector('.score-correct') : null;
    showResultsBtnShuffle = document.getElementById('show-results-btn-shuffle');
    
    // トグル・フィルター
    difficultyToggles = document.querySelectorAll('.difficulty-toggle-checkbox');
    filterCheckboxes = document.querySelectorAll('.diff-filter-cb');
    difficultyBadge = document.getElementById('difficulty-badge');

    questionSource = document.getElementById('question-source');
    resultsSummary = document.getElementById('results-summary');
    resultsList = document.getElementById('results-list');
    backToExerciseBtn = document.getElementById('back-to-exercise-btn');

    // 解説機能
    btnExplanationEdition = document.getElementById('btn-explanation-edition');
    btnExplanationField = document.getElementById('btn-explanation-field');
    btnExplanationShuffle = document.getElementById('btn-explanation-shuffle');
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
