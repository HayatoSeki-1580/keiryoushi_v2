const SUPABASE_URL = 'https://yxjoqcnzqvrtwfkldqpa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4am9xY256cXZydHdma2xkcXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MDI2NTYsImV4cCI6MjA5NDk3ODY1Nn0.Dg7AfiUIN9XpAwRnQgnWwPIKjqo__r2fbh40YZDI3is';

// --- モジュールのインポート ---
import * as pdfjsLib 
    from './lib/pdfjs/build/pdf.mjs';
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
    goBtnShuffle, resultAreaShuffle, scoreCorrectShuffle, showResultsBtnShuffle, finishExamBtn,
    difficultyToggles, difficultyBadge, examTimerSpan,
    filterCheckboxes, shuffleSubjectCheckboxes, shuffleDiffCheckboxes,
    answerButtonsNodeList,
    questionSource, resultsSummary, resultsList, backToExerciseBtn,
    certificateContainer, certImageContainer, certScoreNum, certTimeValue, certDetailsTableBody, certDate, certSubjects, certDifficulties;

// 解説機能用の変数
let btnExplanationEdition, btnExplanationField, btnExplanationShuffle, explanationModal, explanationBody, explanationTitle, closeModalSpan;
let btnExplanationWeak, resultAreaWeak, scoreCorrectWeak, weakAnswerArea;
let currentExplanations = {}; 

// ★ アクティブなタブを管理する変数（'edition' | 'field' | 'shuffle' | 'weak'）
let activeMode = 'edition';

let pdfDoc = null;
let currentPageNum = 1;
let currentAnswers = {};
let currentUser = null;
let fieldsData = {};
let difficultyData = []; 
let difficultyMap = {};  
let currentFieldQuestions = [];
let currentFieldIndex = 0;
let correctCount = 0;
let answerHistory = {};
let currentSessionQuestions = [];
let understandingMap = {};
let pendingUnderstandingQuestionId = null;

// タイマー・試験モード関連変数
let isExamMode = false;
let examStartTime = 0;
let examAccumulatedTime = 0; 
let examTimerInterval = null;
let isTimerRunning = false;

// 試験設定保存用
let examSelectedSubjectsText = "";
let examSelectedDiffText = "";

// 日本語マッピング
const subjectMap = {
    kanka: "環化", kanbutsu: "環物", kannou: "環濃", kanon: "環音",
    houki: "法規", kanri: "管理", ichiki: "一基", keishitsu: "計質"
};

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

// ★ アクティブなパネル・UI要素を返す共通関数
function getActivePanelContext() {
    const panelWeakEl = document.getElementById('panel-weak');
    switch (activeMode) {
        case 'weak':
            return { panel: panelWeakEl, resultArea: resultAreaWeak, explanationBtn: btnExplanationWeak };
        case 'field':
            return { panel: panelByField, resultArea: resultAreaField, explanationBtn: btnExplanationField };
        case 'shuffle':
            return { panel: panelShuffle, resultArea: resultAreaShuffle, explanationBtn: btnExplanationShuffle };
        default: // 'edition'
            return { panel: panelByEdition, resultArea: resultAreaEdition, explanationBtn: btnExplanationEdition };
    }
}

/** 索引ファイル(editionsjson)読込 */
async function setupEditionSelector() {
    if (!editionSelect) return;
    try {
        const url = './data/editions.json';
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTPエラー`);
        const data = await response.json();
        const editions = data.availablesort((a, b) => b.value - a.value);
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
    const res = await fetch(`${SUPABASE_URL}/rest/v1/difficulty?select=*`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const rows = await res.json();
    if (Array.isArray(rows) && rows.length > 0) {
      difficultyData = rows;
      difficultyMap = {};
      rows.forEach(r => {
        const id = `${r.edition}-${r.subject}-${r.question_num}`;
        difficultyMap[id] = r.difficulty;
      });
      console.log('難易度データをSupabaseから取得しました');
      return;
    }
  } catch (e) {
    console.warn('Supabase取得失敗、ローカルにフォールバック', e);
  }
  const res = await fetch('./data/difficulty.json');
  difficultyData = await res.json();
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
    const allowed = new Set();
    filterCheckboxes.forEach(cb => {
        if (cb.checked) allowed.add(cb.value);
    });

    const isAllChecked = allowed.has('A') && allowed.has('B') && allowed.has('C');
    const difficulty = difficultyMap[questionId];
    
    if (!difficulty) {
        return allowed.has('none') || isAllChecked;
    }
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

// ==========================================
//  タイマー機能
// ==========================================

/** 表示更新 */
function updateTimerDisplay() {
    if (!examTimerSpan) return;
    
    let totalSeconds = 0;
    if (isTimerRunning) {
        const currentSession = Date.now() - examStartTime;
        totalSeconds = Math.floor((examAccumulatedTime + currentSession) / 1000);
    } else {
        totalSeconds = Math.floor(examAccumulatedTime / 1000);
    }

    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    examTimerSpan.textContent = `${minutes}:${seconds}`;
}

/** タイマー開始 (再開) */
function startTimer() {
    if (isTimerRunning) return; 
    examStartTime = Date.now();
    isTimerRunning = true;
    
    if(examTimerSpan) examTimerSpan.classList.remove('hidden');
    updateTimerDisplay(); 
    examTimerInterval = setInterval(updateTimerDisplay, 1000);
}

/** タイマー停止 (一時停止・終了) */
function stopTimer() {
    if (!isTimerRunning) return;

    if (examTimerInterval) {
        clearInterval(examTimerInterval);
        examTimerInterval = null;
    }
    
    examAccumulatedTime += Date.now() - examStartTime;
    isTimerRunning = false;
    updateTimerDisplay(); 
}

/** タイマーリセット */
function resetTimer() {
    if (examTimerInterval) {
        clearInterval(examTimerInterval);
        examTimerInterval = null;
    }
    isTimerRunning = false;
    examAccumulatedTime = 0;
    examStartTime = 0;
    if (examTimerSpan) examTimerSpan.textContent = "00:00";
}

/** 最終時間取得文字列 */
function getFinalTimeStr() {
    const totalSeconds = Math.floor(examAccumulatedTime / 1000);
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
}

// ==========================================

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
    jumpToSelect.innerHTML = '';
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

/** 難易度表示の更新 */
function updateDifficultyDisplay(questionId) {
    const isVisible = difficultyToggles.length > 0 && difficultyToggles[0].checked;
    
    if (!difficultyBadge) return;

    const difficulty = difficultyMap[questionId];

    if (isVisible && difficulty) {
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

/** ナビボタン更新 */
function updateNavButtons() {
    if (!prevBtn || !nextBtn || !jumpToSelect) return;
    prevBtn.disabled = (currentFieldIndex <= 0);
    nextBtn.disabled = (currentFieldIndex >= currentFieldQuestions.length - 1);
    jumpToSelect.disabled = false;
}

/** ページ描画(内部) */
async function renderPageInternal(pdfPageNum) {
    if (!pdfDoc || !canvas) return;
    try {
        // ★ activeMode を使って一元的にアクティブパネルを取得
        const { panel: activePanel, resultArea: activeResultArea, explanationBtn: activeExplanationBtn } = getActivePanelContext();

        const activeAnswerButtons = activePanel ? activePanel.querySelectorAll('.answer-btn') : [];
        activeAnswerButtons.forEach(btn => { 
            btn.className = 'answer-btn'; 
            btn.disabled = false; 
        });

        if(btnExplanationEdition) btnExplanationEdition.classList.add('hidden');
        if(btnExplanationField) btnExplanationField.classList.add('hidden');
        if(btnExplanationShuffle) btnExplanationShuffle.classList.add('hidden');
        if(btnExplanationWeak) btnExplanationWeak.classList.add('hidden');
        
        // 試験終了ボタン制御
        if (isExamMode && finishExamBtn && nextBtn) {
            if (currentFieldIndex >= currentFieldQuestions.length - 1) {
                nextBtn.classList.add('hidden');
                finishExamBtn.classList.remove('hidden');
            } else {
                nextBtn.classList.remove('hidden');
                finishExamBtn.classList.add('hidden');
            }
        } else {
            if(nextBtn) nextBtn.classList.remove('hidden');
            if(finishExamBtn) finishExamBtn.classList.add('hidden');
        }

        // 表紙スキップ (+1)
        const pageObj = await pdfDoc.getPage(pdfPageNum + 1); 
        
        const viewport = pageObj.getViewport({ scale: 1.8 });
        const context = canvas.getContext('2d');
        canvas.height = viewport.height; canvas.width = viewport.width;
        context.clearRect(0, 0, canvas.width, canvas.height);
        await pageObj.render({ canvasContext: context, viewport }).promise;

        if (currentFieldQuestions.length > 0 && currentFieldQuestions[currentFieldIndex]) {
            const question = currentFieldQuestions[currentFieldIndex];
            const subject = question.subject || (subjectSelectField ? subjectSelectField.value : '') || (subjectSelectEdition ? subjectSelectEdition.value : '');
            
            if(pageNumSpan) pageNumSpan.textContent = currentFieldIndex + 1;
            
            let editionDisplayText = `第${question.edition}回`;
             if (editionSelect) {
                 for (let i = 0; i < editionSelect.options.length; i++) {
                     if (editionSelect.options[i].value === question.edition) {
                         editionDisplayText = editionSelect.options[i].textContent; break;
                     }
                 }
             }
            
            const subjName = subjectMap[subject] || subject; 
            if(questionSource) {
                questionSource.textContent = `[${subjName}] ${editionDisplayText} 問${question.pageNum}`;
                questionSource.style.display = 'inline';
            }
            
            const currentQuestionId = getQuestionId(question.edition, subject, question.pageNum);
            
            if(resultAreaEdition) resultAreaEdition.textContent = '';
            if(resultAreaField) resultAreaField.textContent = '';
            if(resultAreaShuffle) resultAreaShuffle.textContent = '';
            if(resultAreaWeak) resultAreaWeak.textContent = '';

            updateNavButtons();
            updateDifficultyDisplay(currentQuestionId);

            // 未解答かつ試験モードならタイマーをスタート（再開）
            const history = answerHistory[currentQuestionId];
            if (isExamMode && !history) {
                startTimer();
            }

            if (history && activePanel && activeResultArea) {
                const selectedButton = activePanel.querySelector(`.answer-btn[data-choice="${history.selected}"]`);
                const correctButton = activePanel.querySelector(`.answer-btn[data-choice="${history.correctAnswer}"]`);

                if (isExamMode) {
                    if (selectedButton) {
                        selectedButton.classList.add('selected-answer-exam');
                    }
                    activeResultArea.textContent = '解答済み';
                } else {
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
                    if(activeExplanationBtn) activeExplanationBtn.classList.remove('hidden');
                }
                
                activeAnswerButtons.forEach(btn => { btn.disabled = true; btn.classList.add('disabled'); });
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
            ${field.fieldName} (${questionCount}問)
              
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
    if(scoreCorrectWeak) scoreCorrectWeak.textContent = correctCount;
}

/** 正誤判定 */
function checkAnswer(selectedChoice) {
    const questionId = getCurrentQuestionId();

    // ★ activeMode を使って一元的にアクティブパネルを取得
    const { panel: activePanel, resultArea, explanationBtn } = getActivePanelContext();

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

    if (isExamMode) { stopTimer(); }

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
    if (explanationBtn) explanationBtn.classList.remove('hidden');

    activeAnswerButtons.forEach(btn => { btn.disabled = true; btn.classList.add('disabled'); });

    // 理解度パネル表示（ログインユーザーのみ）
    if (currentUser) {
        showUnderstandingPanel(questionId, isCorrect);
    }
}

/** 試験終了処理 */
function finishExam() {
    stopTimer();
    showResults();
}

/** 成績ページ表示 */
function showResults() {
    if(!exerciseView || !resultsPanel || !resultsList || !resultsSummary) return;
    exerciseView.classList.add('hidden'); resultsPanel.classList.remove('hidden');
    window.scrollTo(0, 0);
    
    let finalTime = "--:--";
    if (isExamMode) {
        stopTimer();
        finalTime = getFinalTimeStr();
        isExamMode = false;
        if(examTimerSpan) examTimerSpan.classList.add('hidden');
        if(certificateContainer) certificateContainer.classList.remove('hidden');
    } else {
        if(certificateContainer) certificateContainer.classList.add('hidden');
    }

    const totalQuestions = currentSessionQuestions.length;
    let answeredCount = 0; 
    let sessionCorrectCount = 0; 
    
    resultsList.innerHTML = '';
    const table = document.createElement('table');
    table.innerHTML = `
        <thead><tr><th>問題</th><th>結果</th><th>あなたの解答</th><th>正解</th><th>復習</th></tr></thead>
        <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');
    
    const certDetails = [];

    if (tbody) {
        currentSessionQuestions.forEach((qInfo, index) => {
            const subject = qInfo.subject || (subjectSelectField ? subjectSelectField.value : '') || (subjectSelectEdition ? subjectSelectEdition.value : '');
            const questionId = getQuestionId(qInfo.edition, subject, qInfo.pageNum);
            const history = answerHistory[questionId];
            const tr = document.createElement('tr');
            
            const questionNumDisplay = `第${qInfo.edition}回 問${qInfo.pageNum}`;
            let statusText = '未解答'; let statusClass = '';
            let yourAnswer = '-'; let correctAnswer = currentAnswers?.[subject]?.[qInfo.pageNum] ?? '?';
            let isCorrect = false;

            if (history) {
                answeredCount++; 
                yourAnswer = history.selected; 
                correctAnswer = history.correctAnswer;
                if (history.correct === null) { statusText = '不明'; }
                else if (history.correct) { 
                    sessionCorrectCount++; 
                    statusText = '正解'; 
                    statusClass = 'result-status-correct'; 
                    isCorrect = true;
                }
                else { 
                    statusText = '不正解'; 
                    statusClass = 'result-status-incorrect'; 
                }
            }
            tr.innerHTML = `<td>${questionNumDisplay}</td><td class="${statusClass}">${statusText}</td><td>${yourAnswer}</td><td>${correctAnswer}</td><td><button class="review-btn" data-index="${index}">解き直す</button></td>`;
            tbody.appendChild(tr);

            certDetails.push({
                no: index + 1,
                subject: subjectMap[subject] || subject,
                edition: `第${qInfo.edition}回`,
                question: `問${qInfo.pageNum}`,
                result: isCorrect ? '○' : '×',
                resultClass: isCorrect ? 'cert-o' : 'cert-x'
            });
        });
    }
    resultsList.appendChild(table);
    
    const accuracy = totalQuestions > 0 ? ((sessionCorrectCount / totalQuestions) * 100).toFixed(1) : 0;
    resultsSummary.innerHTML = `総問題数: ${totalQuestions}問 / 解答済み: ${answeredCount}問<br>正答数: ${sessionCorrectCount}問 / 正答率: ${accuracy}%`;

    // 証明書生成
    if (certificateContainer && !certificateContainer.classList.contains('hidden')) {
        if(certScoreNum) certScoreNum.textContent = sessionCorrectCount;
        if(certTimeValue) certTimeValue.textContent = finalTime;
        if(certSubjects) certSubjects.textContent = examSelectedSubjectsText;
        if(certDifficulties) certDifficulties.textContent = examSelectedDiffText;
        
        if(certDetailsTableBody) {
            certDetailsTableBody.innerHTML = '';
            certDetails.forEach(d => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${d.no}</td><td>${d.subject}</td><td>${d.edition}</td><td>${d.question}</td><td class="${d.resultClass}">${d.result}</td>`;
                certDetailsTableBody.appendChild(tr);
            });
        }

        if(certDate) {
            const d = new Date();
            certDate.textContent = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 ${d.getHours()}:${d.getMinutes().toString().padStart(2,'0')}`;
        }

        if (certImageContainer) {
            certImageContainer.innerHTML = ''; 
            setTimeout(() => {
                html2canvas(certificateContainer, {
                    scale: 2, 
                    backgroundColor: "#fffdf5"
                }).then(canvas => {
                    const imgData = canvas.toDataURL("image/png");
                    const img = document.createElement('img');
                    img.src = imgData;
                    img.style.maxWidth = '100%';
                    img.style.boxShadow = '0 4px 10px rgba(0,0,0,0.1)';
                    certificateContainer.classList.add('hidden');
                    certImageContainer.classList.remove('hidden');
                    certImageContainer.appendChild(img);
                });
            }, 100);
        }
    } else {
        if(certImageContainer) certImageContainer.classList.add('hidden');
    }
    
    document.querySelectorAll('.review-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index, 10);
            if (index < 0 || index >= currentSessionQuestions.length) return;
            const questionInfo = currentSessionQuestions[index];
            resultsPanel.classList.add('hidden'); exerciseView.classList.remove('hidden');
            
            isExamMode = false;
            if(scoreCorrectShuffle) scoreCorrectShuffle.parentElement.classList.remove('hidden'); 
            if(finishExamBtn) finishExamBtn.classList.add('hidden');
            if(nextBtn) nextBtn.classList.remove('hidden');

            currentFieldQuestions = currentSessionQuestions;
            currentFieldIndex = index;
            displayFieldQuestion(index);
        });
    });
}

/** 解説を表示する関数 */
function showExplanationModal() {
    let subjectKey = "";
    let pageNum = "";
    let edition = "";

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
    const panelWeakEl = document.getElementById('panel-weak');

    if (tabByEdition) tabByEdition.addEventListener('click', () => {
        activeMode = 'edition'; // ★
        tabs.forEach(t => t.classList.remove('active')); tabByEdition.classList.add('active');
        panels.forEach(p => p.classList.add('hidden'));
        if (panelWeakEl) panelWeakEl.classList.add('hidden');
        panelByEdition.classList.remove('hidden');
        if(questionSource) questionSource.style.display = 'none';
        isExamMode = false;
    });
    if (tabByField) tabByField.addEventListener('click', () => {
        activeMode = 'field'; // ★
        tabs.forEach(t => t.classList.remove('active')); tabByField.classList.add('active');
        panels.forEach(p => p.classList.add('hidden'));
        if (panelWeakEl) panelWeakEl.classList.add('hidden');
        panelByField.classList.remove('hidden');
        isExamMode = false;
    });
    if (tabShuffle) tabShuffle.addEventListener('click', () => {
        activeMode = 'shuffle'; // ★
        tabs.forEach(t => t.classList.remove('active')); tabShuffle.classList.add('active');
        panels.forEach(p => p.classList.add('hidden'));
        if (panelWeakEl) panelWeakEl.classList.add('hidden');
        panelShuffle.classList.remove('hidden');
        isExamMode = false; 
    });

    // 年度別「表示」
    if (goBtnEdition) goBtnEdition.addEventListener('click', async () => {
        if(welcomeOverlay) welcomeOverlay.style.display = 'none'; window.scrollTo(0, 0);
        correctCount = 0; updateScoreDisplay(); answerHistory = {}; isExamMode = false;
        
        const selectedEdition = editionSelect ? editionSelect.value : '';
        const selectedSubject = subjectSelectEdition ? subjectSelectEdition.value : '';
        
        const url = `./pdf/${selectedEdition}/${selectedEdition}_${selectedSubject}.pdf`;
        showLoading(true);
        let tempQuestions = [];
        try {
            const tempLoadingTask = pdfjsLib.getDocument(url);
            const tempPdfDoc = await tempLoadingTaskpromise;
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
        correctCount = 0; updateScoreDisplay(); answerHistory = {}; isExamMode = false;
        const subject = subjectSelectField ? subjectSelectField.value : '';
        const fieldIndex = selectSelected ? selectSelected.dataset.value : '';
        if (fieldIndex === "" || !fieldsData[subject] || !fieldsData[subject][fieldIndex]) {
             alert("分野を選択してください。"); return;
        }
        
        let tempQuestions = fieldsData[subject][fieldIndex].questions;
        tempQuestions = tempQuestions.map(q => ({q, subject: subject}));
        
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

    // シャッフル演習「演習開始」
    if (goBtnShuffle) goBtnShuffle.addEventListener('click', async () => {
        if(welcomeOverlay) welcomeOverlay.style.display = 'none'; window.scrollTo(0, 0);
        correctCount = 0; updateScoreDisplay(); answerHistory = {};
        
        const targetSubjects = new Set();
        const selectedSubjectsTexts = [];
        shuffleSubjectCheckboxes.forEach(cb => {
            if (cb.checked) {
                targetSubjects.add(cb.value);
                selectedSubjectsTexts.push(cb.parentNode.textContent.trim());
            }
        });
        
        if (targetSubjects.size === 0) {
            alert("出題科目を少なくとも1つ選択してください。"); return;
        }

        const allowedDiff = new Set();
        const selectedDiffTexts = [];
        shuffleDiffCheckboxes.forEach(cb => { 
            if (cb.checked) {
                allowedDiff.add(cb.value);
                selectedDiffTexts.push(cb.parentNode.textContent.trim());
            }
        });

        if (allowedDiff.size === 0) {
            alert("難易度を少なくとも1つ選択してください。"); return;
        }

        examSelectedSubjectsText = selectedSubjectsTexts.join(", ");
        examSelectedDiffText = selectedDiffTexts.join(", ");

        let candidates = [];
        const seenIds = new Set();

        targetSubjects.forEach(subjKey => {
            const fieldList = fieldsData[subjKey];
            if(fieldList) {
                fieldList.forEach(field => {
                    field.questions.forEach(q => {
                        const subject = subjKey;
                        const id = getQuestionId(q.edition, subject, q.pageNum);
                        
                        if (!seenIds.has(id)) {
                            const diff = difficultyMap[id];
                            let isMatch = false;
                            if (!diff) {
                                if (allowedDiff.has('none')) isMatch = true;
                            } else {
                                if (allowedDiff.has(diff)) isMatch = true;
                            }

                            if (isMatch) {
                                candidates.push({ ...q, subject: subject });
                                seenIds.add(id);
                            }
                        }
                    });
                });
            }
        });
        
        if (candidates.length === 0) {
            alert("条件に合致する問題がありません。"); return;
        }
        
        shuffleArray(candidates);
        currentFieldQuestions = candidates.slice(0, 5); 
        currentSessionQuestions = currentFieldQuestions;
        
        if(pageCountSpan) pageCountSpan.textContent = currentFieldQuestions.length;
        populateJumpSelector(currentFieldQuestions);
        
        isExamMode = true;
        resetTimer();
        
        if(scoreCorrectShuffle) scoreCorrectShuffle.parentElement.classList.remove('hidden');

        showLoading(true);
        currentFieldIndex = 0;
        await displayFieldQuestion(currentFieldIndex);
        showLoading(false);
    });

    if (finishExamBtn) finishExamBtn.addEventListener('click', finishExam);

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
    if (btnExplanationWeak) btnExplanationWeak.addEventListener('click', showExplanationModal);

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
    tabShuffle = document.getElementById('tab-shuffle'); 

    panelByEdition = document.getElementById('panel-by-edition');
    panelByField = document.getElementById('panel-by-field');
    panelShuffle = document.getElementById('panel-shuffle'); 

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
    
    goBtnShuffle = document.getElementById('go-btn-shuffle');
    resultAreaShuffle = document.getElementById('result-area-shuffle');
    scoreCorrectShuffle = panelShuffle ? panelShuffle.querySelector('.score-correct') : null;
    showResultsBtnShuffle = document.getElementById('show-results-btn-shuffle');
    finishExamBtn = document.getElementById('finish-exam-btn'); 
    
    difficultyToggles = document.querySelectorAll('.difficulty-toggle-checkbox');
    filterCheckboxes = document.querySelectorAll('.diff-filter-cb');
    shuffleSubjectCheckboxes = document.querySelectorAll('.shuffle-subject-cb'); 
    shuffleDiffCheckboxes = document.querySelectorAll('.shuffle-diff-cb'); 
    difficultyBadge = document.getElementById('difficulty-badge');
    examTimerSpan = document.getElementById('exam-timer'); 

    questionSource = document.getElementById('question-source');
    resultsSummary = document.getElementById('results-summary');
    resultsList = document.getElementById('results-list');
    backToExerciseBtn = document.getElementById('back-to-exercise-btn');

    certificateContainer = document.getElementById('certificate-container');
    certImageContainer = document.getElementById('cert-image-container'); 
    certScoreNum = document.getElementById('cert-score-num');
    certTimeValue = document.getElementById('cert-time-value');
    certSubjects = document.getElementById('cert-subjects');
    certDifficulties = document.getElementById('cert-difficulties');
    certDetailsTableBody = document.querySelector('#cert-details-table tbody');
    certDate = document.getElementById('cert-date');

    btnExplanationEdition = document.getElementById('btn-explanation-edition');
    btnExplanationField = document.getElementById('btn-explanation-field');
    btnExplanationShuffle = document.getElementById('btn-explanation-shuffle');
    btnExplanationWeak = document.getElementById('btn-explanation-weak');
    resultAreaWeak = document.getElementById('result-area-weak');
    scoreCorrectWeak = document.getElementById('score-correct-weak');
    weakAnswerArea = document.getElementById('weak-answer-area');
    explanationModal = document.getElementById('explanation-modal');
    explanationBody = document.getElementById('explanation-body');
    explanationTitle = document.getElementById('explanation-title');
    closeModalSpan = document.querySelector('.close-modal');

    await setupEditionSelector();
    await loadFieldsData();
    await loadDifficultyData();

    setupLoginUI();
    setupWeakUI();

    setupEventListeners();
    setupCsvUploadUI();

    console.log("✅ 初期化完了。");
}

// ============================================================
// ログイン機能
// ============================================================
function setupLoginUI() {
  const loginOverlay = document.getElementById('login-overlay');
  const loginBtn = document.getElementById('login-btn');
  const guestBtn = document.getElementById('guest-btn');
  const loginError = document.getElementById('login-error');

  if (guestBtn) guestBtn.addEventListener('click', () => {
    currentUser = null;
    if (loginOverlay) loginOverlay.style.display = 'none';
    if (welcomeOverlay) welcomeOverlay.style.display = 'none';
    updateWeakTabVisibility();
  });

  if (loginBtn) loginBtn.addEventListener('click', async () => {
    const userId = document.getElementById('login-userid').value.trim();
    const password = document.getElementById('login-password').value;
    if (!userId || !password) {
      loginError.textContent = 'IDとパスワードを入力してください';
      loginError.style.display = 'block';
      return;
    }
    loginBtn.textContent = 'ログイン中...';
    loginBtn.disabled = true;
    try {
      const hash = await sha256(password);
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/users?user_id=eq.${encodeURIComponent(userId)}&password_hash=eq.${hash}&select=user_id`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
      );
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0) {
        currentUser = { userId };
        sessionStorage.setItem('currentUser', userId);
        await loadUnderstandingData();
        if (loginOverlay) loginOverlay.style.display = 'none';
        if (welcomeOverlay) welcomeOverlay.style.display = 'none';
        updateWeakTabVisibility();
        showCurrentUser(userId);
      } else {
        loginError.textContent = 'IDまたはパスワードが違います';
        loginError.style.display = 'block';
      }
    } catch (e) {
      loginError.textContent = 'サーバーに接続できませんでした';
      loginError.style.display = 'block';
    }
    loginBtn.textContent = 'ログイン';
    loginBtn.disabled = false;
  });

  const savedUser = sessionStorage.getItem('currentUser');
  if (savedUser) {
    currentUser = { userId: savedUser };
    if (loginOverlay) loginOverlay.style.display = 'none';
    if (welcomeOverlay) welcomeOverlay.style.display = 'none';
    updateWeakTabVisibility();
    loadUnderstandingData();
    showCurrentUser(savedUser);
  }
}

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================
// 理解度データ取得
// ============================================================
async function loadUnderstandingData() {
  if (!currentUser) return;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/understanding?user_id=eq.${encodeURIComponent(currentUser.userId)}&select=question_id,level`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const rows = await res.json();
    understandingMap = {};
    rows.forEach(r => { understandingMap[r.question_id] = { understanding: r.level }; });
    updateWeakCount();
  } catch (e) {
    console.warn('理解度データ取得失敗', e);
  }
}

// ============================================================
// 理解度パネル表示・送信
// ============================================================
function showUnderstandingPanel(questionId, isCorrect) {
  if (!currentUser) return;
  pendingUnderstandingQuestionId = questionId;
  const panel = document.getElementById('understanding-panel');
  if (panel) panel.style.display = 'block';

  document.querySelectorAll('.understanding-btn').forEach(btn => {
    btn.onclick = async () => {
      const level = parseInt(btn.dataset.level);
      panel.style.display = 'none';
      await saveUnderstanding(questionId, level, isCorrect);

      // ★ 理解度入力後、自動で次の問題へ移行
      if (currentFieldIndex < currentFieldQuestions.length - 1) {
        currentFieldIndex++;
        displayFieldQuestion(currentFieldIndex);
      } else if (isExamMode) {
        finishExam();
      }
      // 最終問題かつ通常モードの場合は何もしない
    };
  });
}

async function saveUnderstanding(questionId, level, isCorrect) {
  if (!currentUser) return;
  understandingMap[questionId] = { understanding: level, isCorrect };
  updateWeakCount();
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/understanding`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        user_id: currentUser.userId,
        question_id: questionId,
        level: level,
        updated_at: new Date().toISOString()
      })
    });
  } catch (e) {
    console.warn('理解度送信失敗', e);
  }
}

// ============================================================
// 苦手問題演習
// ============================================================
function setupWeakUI() {
  const tabWeak = document.getElementById('tab-weak');
  const panelWeak = document.getElementById('panel-weak');
  const goBtnWeak = document.getElementById('go-btn-weak');
  const showResultsBtnWeak = document.getElementById('show-results-btn-weak');
  const weakSubjectFilter = document.getElementById('weak-subject-filter');

  if (tabWeak) tabWeak.addEventListener('click', () => {
    activeMode = 'weak'; // ★
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    tabWeak.classList.add('active');
    [panelByEdition, panelByField, panelShuffle].forEach(p => { if(p) p.classList.add('hidden'); });
    if (panelWeak) panelWeak.classList.remove('hidden');
    isExamMode = false;
    updateWeakCount();
  });

  if (weakSubjectFilter) weakSubjectFilter.addEventListener('change', updateWeakCount);
  document.querySelectorAll('input[name="weak-level"]').forEach(r => {
    r.addEventListener('change', updateWeakCount);
  });

  if (goBtnWeak) goBtnWeak.addEventListener('click', async () => {
    if (!currentUser) { alert('苦手問題演習はログインが必要です'); return; }
    const questions = getWeakQuestions();
    if (questions.length === 0) { alert('対象の問題がありません'); return; }

    if (welcomeOverlay) welcomeOverlay.style.display = 'none';
    correctCount = 0; updateScoreDisplay(); answerHistory = {}; isExamMode = false;

    shuffleArray(questions);
    currentFieldQuestions = questions;
    currentSessionQuestions = questions;

    if (pageCountSpan) pageCountSpan.textContent = questions.length;
    populateJumpSelector(questions);
    if (weakAnswerArea) weakAnswerArea.style.display = 'block';
    showLoading(true);
    currentFieldIndex = 0;
    await displayFieldQuestion(0);
    showLoading(false);
  });

  if (showResultsBtnWeak) showResultsBtnWeak.addEventListener('click', showResults);
}

function getWeakQuestions() {
  const levelVal = document.querySelector('input[name="weak-level"]:checked')?.value || '12';
  const subjectFilter = document.getElementById('weak-subject-filter')?.value || 'all';
  const targetLevels = levelVal === '12' ? [1, 2] : [parseInt(levelVal)];

  return Object.entries(understandingMap)
    .filter(([id, data]) => {
      if (!targetLevels.includes(data.understanding)) return false;
      if (subjectFilter !== 'all') {
        const parts = id.split('-');
        return parts[1] === subjectFilter;
      }
      return true;
    })
    .map(([id]) => {
      const parts = id.split('-');
      return { edition: parts[0], subject: parts[1], pageNum: parseInt(parts[2]) };
    });
}

function updateWeakCount() {
  const countEl = document.getElementById('weak-count');
  if (!countEl) return;
  if (!currentUser) {
    countEl.textContent = '対象問題数：ログインして確認';
    return;
  }
  const questions = getWeakQuestions();
  countEl.textContent = `対象問題数：${questions.length}問`;
}

function updateWeakTabVisibility() {
  const tabWeak = document.getElementById('tab-weak');
  if (!tabWeak) return;
  tabWeak.style.opacity = currentUser ? '1' : '0.5';
  tabWeak.title = currentUser ? '' : 'ログインが必要です';
}

function showCurrentUser(userId) {
  let userDisplay = document.getElementById('user-display');
  if (!userDisplay) {
    userDisplay = document.createElement('div');
    userDisplay.id = 'user-display';
    userDisplay.style.cssText = 'position:fixed; top:10px; right:10px; background:#fff; border:1px solid #ccc; border-radius:8px; padding:6px 12px; font-size:14px; z-index:9999; box-shadow:0 2px 6px rgba(0,0,0,0.15);';
    document.body.appendChild(userDisplay);
  }
  userDisplay.textContent = `👤 ${userId} でログイン中`;
}

// ============================================================
// 難易度CSVアップロード機能
// ============================================================

const subjectNameToKey = {
  '法規': 'houki', '管理': 'kanri', '一基': 'ichiki', '計質': 'keishitsu',
  '環化': 'kanka', '環物': 'kanbutsu', '環濃': 'kannou', '環音': 'kanon'
};

function parseEdition(str) {
  const m = str.match(/^(\d+)回/);
  return m ? parseInt(m[1]) : null;
}

function parseDifficulty(str) {
  const m = str.match(/^([ABC])/);
  return m ? m[1] : null;
}

function setupCsvUploadUI() {
  let tapCount = 0;
  let tapTimer = null;

  const titleEl = document.querySelector('h1') || document.querySelector('.app-title') || document.body;
  titleEl.addEventListener('click', () => {
    tapCount++;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { tapCount = 0; }, 2000);
    if (tapCount >= 5) {
      tapCount = 0;
      const panel = document.getElementById('csv-upload-panel');
      if (panel) {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      }
    }
  });

  const container = document.createElement('div');
  container.id = 'csv-upload-container';
  container.style.cssText = 'position:fixed; bottom:80px; right:16px; z-index:9999;';

  container.innerHTML = `
    <div id="csv-upload-panel" style="display:none; background:#fff; border:1px solid #ccc; border-radius:8px; padding:16px; box-shadow:0 2px 8px rgba(0,0,0,0.15); min-width:260px;">
      <h4 style="margin:0 0 8px">📊 難易度データ更新</h4>
      <input type="file" id="csv-file-input" accept=".csv" style="margin-bottom:8px; display:block;">
      <button id="csv-upload-btn" style="padding:6px 16px; background:#4a90e2; color:#fff; border:none; border-radius:4px; cursor:pointer;">アップロード</button>
      <div id="csv-upload-status" style="margin-top:8px; font-size:13px;"></div>
    </div>
  `;
  document.body.appendChild(container);

  document.getElementById('csv-upload-btn').addEventListener('click', async () => {
    const fileInput = document.getElementById('csv-file-input');
    const status = document.getElementById('csv-upload-status');
    const file = fileInput.files[0];

    if (!file) {
      status.textContent = '⚠️ CSVファイルを選択してください';
      status.style.color = 'orange';
      return;
    }

    status.textContent = '⏳ 処理中...';
    status.style.color = '#555';

    try {
      const text = await file.text();
      const rows = text.trim().split('\n').map(r => r.split(',').map(c => c.trim()));
      const header = rows[0];
      const subjectRaw = header[0];
      const subject = subjectNameToKey[subjectRaw] || subjectRaw;
      const editions = header.slice(1).map(parseEdition);
      const records = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row[0] || !row[0].startsWith('問')) continue;
        const questionNum = parseInt(row[0].replace('問', ''));
        if (isNaN(questionNum)) continue;
        for (let j = 1; j < row.length; j++) {
          const edition = editions[j - 1];
          if (!edition) continue;
          const difficulty = parseDifficulty(row[j]);
          if (!difficulty) continue;
          records.push({ subject, edition, question_num: questionNum, difficulty });
        }
      }

      if (records.length === 0) {
        status.textContent = '⚠️ 有効なデータが見つかりませんでした';
        status.style.color = 'orange';
        return;
      }

      const res = await fetch(`${SUPABASE_URL}/rest/v1/difficulty`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(records)
      });

      if (res.ok) {
        status.textContent = `✅ ${records.length}件を更新しました！`;
        status.style.color = 'green';
        await loadDifficultyData();
      } else {
        const err = await res.text();
        status.textContent = `❌ エラー: ${err}`;
        status.style.color = 'red';
      }
    } catch (e) {
      status.textContent = `❌ 処理エラー: ${e.message}`;
      status.style.color = 'red';
    }
  });
}

document.addEventListener('DOMContentLoaded', initialize);
