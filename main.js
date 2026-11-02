/**
 * 計量士試験学習Web v2
 * クライアントサイドメインロジック (難易度・理解度チェックボックス連動修正版)
 */

// --- 状態管理用グローバル変数 ---
let questionsData = [];      // 読み込んだすべての過去問データ
let filteredQuestions = [];  // 現在のフィルター条件にマッチした過去問
let currentQuestionIndex = 0;// フィルター内での現在の表示位置
let selectedMode = 'edition';// 'edition'（年度別）または 'field'（分野別）
let currentUser = null;      // ログイン中のユーザー名（nullの場合はゲスト）

// トグル要素管理用
let difficultyToggles = [];
let understandingToggles = []; // ⬇ 理解度トグル保持用配列を追加
let difficultyBadge = null;
let understandingBadge = null;

// モックデータベース（ローカルストレージ連携用）
let understandingMap = {};   // { questionId: { understanding: 1|2|3, updatedAt: timestamp } }

// 難易度マッピング (プロトタイプ用の固定設定)
const difficultyMap = {
    "R05_環化_Q1": "A", "R05_環化_Q2": "B", "R05_環化_Q3": "C",
    "R04_環化_Q1": "A", "R04_環化_Q2": "B", "R03_環化_Q1": "C",
    "R05_環濃_Q1": "B", "R05_環濃_Q2": "C"
};

// --- 初期化処理 ---
window.addEventListener('DOMContentLoaded', () => {
    initializeDOM();
    loadSession();
    fetchQuestions();
});

// DOM参照の確立と基本設定
function initializeDOM() {
    difficultyToggles = document.querySelectorAll('.difficulty-toggle-checkbox');
    difficultyToggles.forEach(toggle => {
        toggle.addEventListener('change', () => {
            // 他方の難易度トグルと状態を同期
            difficultyToggles.forEach(t => t.checked = toggle.checked);
            updateDifficultyDisplay(getCurrentQuestionId());
        });
    });

    // ⬇ 理解度トグルを取得し、同期および表示更新のリスナーを設定 ⬇
    understandingToggles = document.querySelectorAll('.understanding-toggle-checkbox');
    understandingToggles.forEach(toggle => {
        toggle.addEventListener('change', () => {
            // 他方の理解度トグルと状態を同期
            understandingToggles.forEach(t => t.checked = toggle.checked);
            updateUnderstandingDisplay(getCurrentQuestionId());
        });
    });

    difficultyBadge = document.getElementById('difficulty-badge');
    understandingBadge = document.getElementById('understanding-badge');

    // フィルターの変更検知イベント
    document.getElementById('select-edition-year').addEventListener('change', applyFilters);
    document.getElementById('select-edition-subject').addEventListener('change', applyFilters);
    document.getElementById('select-field-sub').addEventListener('change', applyFilters);

    // 認証関連イベント
    document.getElementById('auth-btn').addEventListener('click', handleAuthClick);
}

// ユーザーログイン状態の読み込み
function loadSession() {
    const savedUser = localStorage.getItem('keiryoushi_user');
    if (savedUser) {
        loginUser(savedUser);
    } else {
        logoutUser();
    }
}

// 過去問モックデータの取得 (実際のフェッチを模倣)
function fetchQuestions() {
    showLoading(true);
    
    // プロトタイプ用モックデータ生成
    setTimeout(() => {
        questionsData = [
            {
                id: "R05_環化_Q1",
                year: "R05",
                subject: "環化",
                sub_field: "環化_基本法令",
                numText: "問1",
                body: "計量法第2条第1項に規定する「計量」の定義に関する記述のうち、誤っているものはどれか。",
                choices: [
                    "「計量」とは、計量器を用いて、物象の状態の量を測定することをいう。",
                    "物象の状態の量には、取引又は証明における計量に関するものが含まれる。",
                    "長さ、質量、時間、電流、温度、物質量、光度は、いずれも法で定める物象の状態の量である。",
                    "取引又は証明における計量以外の計量は、法の規制の対象外である。",
                    "「計量器」とは、計量をするための器具、機械又は装置をいう。"
                ],
                correctAnswer: 3,
                explanation: "正解は 4 です。\n計量法では、取引や証明の該当有無に関わらず、特定計量器の検定や適正な計量の実施等について一定の基準や義務を設けており、「取引又は証明以外の計量はすべて規制の対象外」というわけではありません。"
            },
            {
                id: "R05_環化_Q2",
                year: "R05",
                subject: "環化",
                sub_field: "環化_計算",
                numText: "問2",
                body: "0.10 mol/L の酢酸水溶液のpHに最も近い値はどれか。ただし、酢酸の酸解離定数 Ka = 1.8 × 10^-5 mol/L, log10(1.3) = 0.11 とする。",
                choices: [
                    "2.37",
                    "2.87",
                    "3.37",
                    "3.87",
                    "4.87"
                ],
                correctAnswer: 1,
                explanation: "正解は 2 (2.87) です。\n弱酸の水素イオン濃度 [H+] は、[H+] ≒ √(Ca * Ka) で近似できます。\n[H+] ≒ √(0.10 * 1.8 * 10^-5) = √(1.8 * 10^-6) ≒ 1.34 * 10^-3 mol/L\npH = -log10[H+] = -log10(1.34 * 10^-3) = 3 - log10(1.34) ≒ 3 - 0.13 = 2.87 となります。"
            },
            {
                id: "R05_環化_Q3",
                year: "R05",
                subject: "環化",
                sub_field: "環化_化学平衡",
                numText: "問3",
                body: "ある金属錯体の水溶液中における錯形成反応について、逐次安定度定数 log K1 = 4.0, log K2 = 3.0 である。この錯体の全安定度定数 β2 (log β2) の値として正しいものはどれか。",
                choices: [
                    "1.0",
                    "3.5",
                    "7.0",
                    "12.0",
                    "16.0"
                ],
                correctAnswer: 2,
                explanation: "正解は 3 (7.0) です。\n全安定度定数 β2 は逐次安定度定数 K1 と K2 の積（β2 = K1 * K2）で表されます。\n対数をとると、log β2 = log K1 + log K2 = 4.0 + 3.0 = 7.0 となります。"
            },
            {
                id: "R04_環化_Q1",
                year: "R04",
                subject: "環化",
                sub_field: "環化_基本法令",
                numText: "問1",
                body: "計量法における「検定」に関する次の記述のうち、正しいものはどれか。",
                choices: [
                    "検定は、特定計量器が検定基準に適合しているかどうかを検査する制度である。",
                    "すべての特定計量器には有効期間が定められていない。",
                    "検定証印は、いかなる場合でもその有効期間が切れるまで効力を失わない。",
                    "都道府県知事は、国の代わりに検定を執行することはできない。",
                    "検定に合格しなくても、取引・証明に使用できる計量器がある。"
                ],
                correctAnswer: 0,
                explanation: "正解は 1 です。\n「検定」は特定計量器の構造や器差が検定基準に適合しているかを検査し、適合したものに検定証印を付す制度です。有効期間がある特定計量器（水道メーター、ガスメーター等）も多数存在します。"
            },
            {
                id: "R05_環濃_Q1",
                year: "R05",
                subject: "環濃",
                sub_field: "環濃_GC",
                numText: "問1",
                body: "ガスクロマトグラフィー (GC) における熱伝導度検出器 (TCD) に関する記述として、最も適切なものはどれか。",
                choices: [
                    "有機化合物に対して特異的に高感度である。",
                    "水素炎を用いるため、可燃性ガスの取扱いに厳重な注意を要する。",
                    "キャリアガスと成分ガスの熱伝導率の差を利用して検出を行う、非破壊型の検出器である。",
                    "無機ガス成分の検出には使用できない。",
                    "感度はキャピラリーカラム専用のFIDよりも極めて高い。"
                ],
                correctAnswer: 2,
                explanation: "正解は 3 です。\nTCDはキャリアガスと測定対象成分との間の「熱伝導率の差」をタングステンフィラメント等の抵抗変化として検出する原理であり、成分を壊さない「非破壊型」かつ普遍的に多くの成分（無機ガス含む）を検出できる汎用検出器です。"
            }
        ];
        
        showLoading(false);
        applyFilters();
    }, 600);
}

// --- 画面状態制御 ---
function showLoading(isLoading) {
    const spinner = document.getElementById('loading-spinner');
    const container = document.getElementById('question-card-container');
    const emptyState = document.getElementById('empty-state');
    
    if (isLoading) {
        spinner.classList.remove('hidden');
        container.classList.add('hidden');
        emptyState.classList.add('hidden');
    } else {
        spinner.classList.add('hidden');
    }
}

// モード切り替え (年度別 vs 分野別)
function switchMode(mode) {
    selectedMode = mode;
    
    const tabEd = document.getElementById('tab-edition');
    const tabFi = document.getElementById('tab-field');
    const panelEd = document.getElementById('panel-by-edition');
    const panelFi = document.getElementById('panel-by-field');
    
    if (mode === 'edition') {
        tabEd.classList.add('active');
        tabFi.classList.remove('active');
        panelEd.classList.remove('hidden');
        panelFi.classList.add('hidden');
    } else {
        tabEd.classList.remove('active');
        tabFi.classList.add('active');
        panelEd.classList.add('hidden');
        panelFi.classList.remove('hidden');
    }
    
    applyFilters();
}

// フィルターロジックの適用
function applyFilters() {
    if (selectedMode === 'edition') {
        const year = document.getElementById('select-edition-year').value;
        const subject = document.getElementById('select-edition-subject').value;
        
        filteredQuestions = questionsData.filter(q => {
            const matchYear = (year === 'all' || q.year === year);
            const matchSubject = (q.subject === subject);
            return matchYear && matchSubject;
        });
    } else {
        const subField = document.getElementById('select-field-sub').value;
        
        filteredQuestions = questionsData.filter(q => {
            return (subField === 'all' || q.sub_field === subField);
        });
    }
    
    currentQuestionIndex = 0;
    renderCurrentQuestion();
}

// 現在のインデックスに対応する問題カードをレンダリング
function renderCurrentQuestion() {
    const container = document.getElementById('question-card-container');
    const emptyState = document.getElementById('empty-state');
    
    if (filteredQuestions.length === 0) {
        container.classList.add('hidden');
        emptyState.classList.remove('hidden');
        updateNavButtons();
        return;
    }
    
    container.classList.remove('hidden');
    emptyState.classList.add('hidden');
    
    const q = filteredQuestions[currentQuestionIndex];
    
    // テキスト・ヘッダー更新
    document.getElementById('question-meta-text').textContent = `${getYearDisplayName(q.year)} ${q.subject === '環化' ? '環境計量管理' : '環境測定分析一般'} ${q.numText}`;
    document.getElementById('question-body-text').textContent = q.body;
    
    // バッジ類の表示更新
    updateDifficultyDisplay(q.id);
    updateUnderstandingDisplay(q.id);
    updateUnderstandingPanel(q.id);
    
    // 選択肢の生成
    const choicesBox = document.getElementById('choices-box');
    choicesBox.innerHTML = '';
    
    q.choices.forEach((text, i) => {
        const item = document.createElement('div');
        item.className = 'choice-item';
        item.dataset.index = i;
        item.addEventListener('click', () => selectChoice(i));
        
        const num = document.createElement('div');
        num.className = 'choice-num';
        num.textContent = i + 1;
        
        const content = document.createElement('div');
        content.className = 'choice-text';
        content.textContent = text;
        
        item.appendChild(num);
        item.appendChild(content);
        choicesBox.appendChild(item);
    });
    
    // 解答判定エリア・ボタン初期化
    document.getElementById('feedback-box').classList.add('hidden');
    document.getElementById('submit-btn').classList.remove('hidden');
    document.getElementById('submit-btn').disabled = true;
    document.getElementById('next-action-btn').classList.add('hidden');
    
    updateNavButtons();
}

// 難易度バッジ表示の更新
function updateDifficultyDisplay(questionId) {
    const isVisible = difficultyToggles.length > 0 && difficultyToggles[0].checked;
    if (!difficultyBadge) return;
    
    const difficulty = difficultyMap[questionId];
    
    if (isVisible && difficulty) {
        let displayText = difficulty;
        let colorClass = 'diff-normal';
        if (difficulty === 'A') { displayText = "A(易)"; colorClass = 'diff-easy'; }
        else if (difficulty === 'C') { displayText = "C(難)"; colorClass = 'diff-hard'; }
        
        difficultyBadge.textContent = `難易度: ${displayText}`;
        difficultyBadge.className = `difficulty-badge ${colorClass}`;
        difficultyBadge.classList.remove('hidden');
    } else {
        difficultyBadge.classList.add('hidden');
    }
}

// 理解度バッジ表示の更新
function updateUnderstandingDisplay(questionId) {
    if (!understandingBadge) return;

    // ⬇ 「理解度を表示」チェックボックスがオンか確認。オフなら非表示にして終了 ⬇
    const isVisible = understandingToggles.length > 0 && understandingToggles[0].checked;
    if (!isVisible) {
        understandingBadge.classList.add('hidden');
        return;
    }

    // 現在保存されている問題の理解度データを取得
    const data = understandingMap[questionId];

    if (data && data.understanding) {
        let displayText = "";
        let colorClass = "";
        const level = parseInt(data.understanding);

        // 理解度ごとに表示テキストとカラー用クラスを設定
        if (level === 1) { displayText = "❌ 不可"; colorClass = "diff-hard"; }       // 赤
        else if (level === 2) { displayText = "🔁 要復習"; colorClass = "diff-normal"; } // オレンジ
        else if (level === 3) { displayText = "✅ 完璧！"; colorClass = "diff-easy"; }   // 緑

        understandingBadge.textContent = `理解度: ${displayText}`;
        understandingBadge.className = 'difficulty-badge';
        understandingBadge.style.backgroundColor = ''; // インラインスタイルをリセット
        understandingBadge.style.color = '';
        understandingBadge.classList.add(colorClass);
        understandingBadge.classList.remove('hidden');
    } else {
        // ログインはしているが、まだその問題を一度も解いていない（理解度未選択）場合
        if (currentUser) {
            understandingBadge.textContent = "理解度: 未設定";
            understandingBadge.className = 'difficulty-badge';
            understandingBadge.style.backgroundColor = '#999'; // グレー
            understandingBadge.style.color = '#fff';
            understandingBadge.classList.remove('hidden');
        } else {
            // 未ログイン（ゲスト）の場合は非表示
            understandingBadge.classList.add('hidden');
        }
    }
}

// ナビゲーションおよび進捗テキスト更新
function updateNavButtons() {
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const progressText = document.getElementById('progress-text');
    
    if (filteredQuestions.length === 0) {
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        progressText.textContent = "問題なし";
        return;
    }
    
    prevBtn.disabled = (currentQuestionIndex === 0);
    nextBtn.disabled = (currentQuestionIndex === filteredQuestions.length - 1);
    
    progressText.textContent = `問題 ${currentQuestionIndex + 1} / ${filteredQuestions.length}`;
}

// 選択肢のクリック挙動
function selectChoice(index) {
    // 回答判定後はクリック無効
    if (!document.getElementById('next-action-btn').classList.contains('hidden')) return;
    
    const items = document.querySelectorAll('.choice-item');
    items.forEach(item => {
        if (parseInt(item.dataset.index) === index) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
    
    document.getElementById('submit-btn').disabled = false;
}

// 解答ボタン処理
function checkAnswer() {
    const selectedItem = document.querySelector('.choice-item.selected');
    if (!selectedItem) return;
    
    const selectedIdx = parseInt(selectedItem.dataset.index);
    const q = filteredQuestions[currentQuestionIndex];
    const isCorrect = (selectedIdx === q.correctAnswer);
    
    // 正誤表示
    const items = document.querySelectorAll('.choice-item');
    items.forEach(item => {
        const idx = parseInt(item.dataset.index);
        item.classList.remove('selected');
        if (idx === q.correctAnswer) {
            item.classList.add('correct');
        } else if (idx === selectedIdx) {
            item.classList.add('wrong');
        }
    });
    
    // フィードバックパネル更新
    const feedbackBox = document.getElementById('feedback-box');
    const feedbackStatus = document.getElementById('feedback-status');
    const explanationText = document.getElementById('explanation-text');
    
    feedbackBox.classList.remove('hidden');
    explanationText.textContent = q.explanation;
    
    if (isCorrect) {
        feedbackStatus.className = "feedback-title";
        feedbackStatus.innerHTML = '<i class="fa-solid fa-circle-check"></i> <span>正解！</span>';
    } else {
        feedbackStatus.className = "feedback-title wrong";
        feedbackStatus.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> <span>不正解...</span>';
    }
    
    document.getElementById('submit-btn').classList.add('hidden');
    
    // 最後の問題以外は「次の問題へ」を促すボタンを表示
    if (currentQuestionIndex < filteredQuestions.length - 1) {
        document.getElementById('next-action-btn').classList.remove('hidden');
    }
}

// ナビゲーション：前へ
function goPrev() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        renderCurrentQuestion();
    }
}

// ナビゲーション：次へ
function goNext() {
    if (currentQuestionIndex < filteredQuestions.length - 1) {
        currentQuestionIndex++;
        renderCurrentQuestion();
    }
}


// --- ユーザー認証・状態保持 ---
function handleAuthClick() {
    if (currentUser) {
        // ログアウト処理
        logoutUser();
    } else {
        // モーダルオープン
        document.getElementById('username-input').value = '';
        document.getElementById('auth-modal').classList.remove('hidden');
    }
}

function closeAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
}

function performLogin() {
    const val = document.getElementById('username-input').value.trim();
    if (!val) {
        alert("ユーザー名を入力してください。");
        return;
    }
    
    loginUser(val);
    closeAuthModal();
}

function loginUser(username) {
    currentUser = username;
    localStorage.setItem('keiryoushi_user', username);
    
    // UI更新
    const userDisplay = document.getElementById('user-display');
    userDisplay.textContent = `${username} さん`;
    userDisplay.classList.remove('hidden');
    
    document.getElementById('auth-btn').textContent = "ログアウト";
    
    // 理解度マップをローカルストレージから復元
    const savedMap = localStorage.getItem(`keiryoushi_under_${username}`);
    understandingMap = savedMap ? JSON.parse(savedMap) : {};
    
    // 現在の問題画面をリロードして登録パネルやバッジ、理解度を反映
    if (filteredQuestions.length > 0) {
        renderCurrentQuestion();
    }
}

function logoutUser() {
    currentUser = null;
    localStorage.removeItem('keiryoushi_user');
    understandingMap = {};
    
    // UI更新
    document.getElementById('user-display').classList.add('hidden');
    document.getElementById('auth-btn').textContent = "ログイン";
    
    if (filteredQuestions.length > 0) {
        renderCurrentQuestion();
    }
}


// --- 理解度登録機能 ---

// 理解度登録用パネルの状態をリセットして問題ごとの選択状態を表示
function updateUnderstandingPanel(questionId) {
    const panel = document.getElementById('understanding-panel');
    if (!currentUser) {
        panel.classList.add('hidden');
        return;
    }
    
    panel.classList.remove('hidden');
    
    // 全ボタンのアクティブクラスを解除
    const btns = panel.querySelectorAll('.under-btn');
    btns.forEach(btn => {
        btn.className = 'under-btn';
    });
    
    const data = understandingMap[questionId];
    if (data && data.understanding) {
        const level = data.understanding;
        const targetBtn = panel.querySelector(`.under-btn[data-level="${level}"]`);
        if (targetBtn) {
            targetBtn.classList.add(`active-${level}`);
        }
    }
}

// 理解度クリック選択
function selectUnderstanding(level) {
    if (!currentUser) return;
    
    const qId = getCurrentQuestionId();
    if (!qId) return;
    
    // 保存
    understandingMap[qId] = {
        understanding: level,
        updatedAt: Date.now()
    };
    
    localStorage.setItem(`keiryoushi_under_${currentUser}`, JSON.stringify(understandingMap));
    
    // 表示の連動更新
    updateUnderstandingPanel(qId);
    updateUnderstandingDisplay(qId);
}


// --- 補助ヘルパー ---
function getCurrentQuestionId() {
    if (filteredQuestions.length === 0) return null;
    return filteredQuestions[currentQuestionIndex].id;
}

function getYearDisplayName(yearCode) {
    const years = {
        "R05": "令和5年",
        "R04": "令和4年",
        "R03": "令和3年"
    };
    return years[yearCode] || yearCode;
}
