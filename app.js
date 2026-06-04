/**
 * 百家乐路纸推演系统 - 终极完整网络版 
 */
 
// ==================== 系统密码 ====================
var lastSubmitTime = 0;  //限制提交时间计时
let diffTotal = 0;  // 追踪胜负差值用的
var GUT_MEMORY = {}; // 全局变量G 库

//=========配置追踪谁==========
const TRACKED_SIGNALS = (() => {
    try {
        const saved = localStorage.getItem('baccarat_settings');
        if (saved) {
            const settings = JSON.parse(saved);
            return settings['TRACKED_SIGNALS'] || [];
        }
    } catch(e) {}
    return [];
})();


// ==================== 全局状态 ====================
const STATE = {
    bigRoad: [],
    history: [],
    totalPredictions: 0,
    totalHits: 0,
    pendingPrediction: null,
    lastPlayerPoints: null,
    lastBankerPoints: null,
    lastCardValue: null,
    stats: { resonance: { total: 0, hit: 0 }, meihua: { total: 0, hit: 0 }, form: { total: 0, hit: 0 } },
    _lastSourceType: null,
    _consecutiveHits: 0,
    _singleJumpMissCount: 0,
    _lastNewFormMiss: false,
    _lastSmallRoadBlue: false,
    _lastPattern: null,
    _lastMeihuaDirection: null,
};

// ==================== 小路形态（用于E库） ====================
const SMALLROAD_BIGROAD = []; // [{ color: 'red', len: 2 }, ...]
function updateSmallRoadBigRoad() {
    const sr = getSmallRoad();
    if (!sr || !sr.signal) return; // 小路未启动或信号无效
    
    const lastSignal = sr.signal; // 'red' 或 'blue'
    const lastCol = SMALLROAD_BIGROAD[SMALLROAD_BIGROAD.length - 1];
    
    if (lastCol && lastCol.color === lastSignal) {
        // 同色，高度+1
        lastCol.len++;
    } else {
        // 异色或首列，新开一列
        SMALLROAD_BIGROAD.push({ color: lastSignal, len: 1 });
    }
	//console.log('小路信号:', sr.signal, '最后一列颜色:', SMALLROAD_BIGROAD[SMALLROAD_BIGROAD.length-1]?.color, '高度:', SMALLROAD_BIGROAD[SMALLROAD_BIGROAD.length-1]?.len);
}

// ==================== 下路信号历史 ====================
const ROAD_HISTORY = { bigeye: [], smallroad: [], cockroach: [] };

function pushRoadHistory(road, signal) {
    road.push(signal);
    if (road.length > 5) road.shift();
}

function getRoadPattern(history) {
    const len = history.length;
    if (len < 3) return { pattern: '数据不足', trend: null };
    const redCount = history.filter(s => s === 'red').length;
    const blueCount = history.filter(s => s === 'blue').length;
    if (redCount >= 4) return { pattern: '长红', trend: '顺列' };
    if (blueCount >= 4) return { pattern: '长蓝', trend: '断列' };
    const last3 = history.slice(-3);
    const first2of3 = last3.slice(0, 2);
    if (last3[0] !== last3[1] && last3[1] !== last3[2] && last3[0] === last3[2]) return { pattern: '红蓝交替', trend: '混乱' };
    if (first2of3.every(s => s === 'red') && last3[2] === 'blue') return { pattern: '红转蓝', trend: '断列' };
    if (first2of3.every(s => s === 'blue') && last3[2] === 'red') return { pattern: '蓝转红', trend: '顺列' };
    return { pattern: '混合', trend: null };
}

// ==================== 胜负判定 ====================
function getResult(player, banker) {
    if (player === banker) return 'T';
    return player > banker ? 'P' : 'B';
}

// ==================== 大路 ====================
function addToBigRoad(result) {
    if (result === 'T') return;
    const lastCol = STATE.bigRoad[STATE.bigRoad.length - 1];
    if (lastCol && lastCol.cells[0] === result) {
        lastCol.cells.push(result);
    } else {
        STATE.bigRoad.push({ cells: [result] });
    }
}

function getBigRoadDisplay() {
    if (STATE.bigRoad.length === 0) return '—';
    return STATE.bigRoad.map(col => col.cells.join('')).join('');   // 大路形态显示规格
}

// ==================== 大眼仔 ====================
function getBigEyeBoy(w) {
    const br = STATE.bigRoad;
    if (br.length < 2) return { signal: null, text: '未启动', color: 'default', pattern: null, trend: null, blueStreak: 0 };
    const lastCol = br[br.length - 1];
    const prevCol = br[br.length - 2];
    const curHeight = lastCol.cells.length;
    const prevHeight = prevCol.cells.length;
    const signal = curHeight <= prevHeight ? 'red' : 'blue';
    if (w) {
		pushRoadHistory(ROAD_HISTORY.bigeye, signal);
	}
		const { pattern, trend } = getRoadPattern(ROAD_HISTORY.bigeye);
    // 计算连续蓝点数量
    let blueStreak = 0;
    for (let i = ROAD_HISTORY.bigeye.length - 1; i >= 0; i--) {
        if (ROAD_HISTORY.bigeye[i] === 'blue') blueStreak++;
        else break;
    }
    return { signal, text: signal === 'red' ? '🔴 红' : '🔵 蓝', color: signal, pattern, trend, blueStreak };
}

// ==================== 小路 ====================
function getSmallRoad(w) {
    const br = STATE.bigRoad;
    if (br.length < 3) return { signal: null, text: '未启动', color: 'default', pattern: null, trend: null, tripleRed: false, tripleBlue: false };
    const lastCol = br[br.length - 1];
    const skipCol = br[br.length - 3];
    const curHeight = lastCol.cells.length;
    const skipHeight = skipCol.cells.length;
    const signal = curHeight <= skipHeight ? 'red' : 'blue';
    if (w) {
		pushRoadHistory(ROAD_HISTORY.smallroad, signal);
	}
		const { pattern, trend } = getRoadPattern(ROAD_HISTORY.smallroad);
    // 三连红/蓝检测
    const len = ROAD_HISTORY.smallroad.length;
    const tripleRed = len >= 3 && ROAD_HISTORY.smallroad.slice(-3).every(s => s === 'red');
    const tripleBlue = len >= 3 && ROAD_HISTORY.smallroad.slice(-3).every(s => s === 'blue');
    // 断层检测
    let fault = false;
    if (len >= 4) {
        const first2 = ROAD_HISTORY.smallroad.slice(-4, -2);
        const last2 = ROAD_HISTORY.smallroad.slice(-2);
        if (first2.every(s => s === 'red') && last2.every(s => s === 'blue')) fault = true;
        if (first2.every(s => s === 'blue') && last2.every(s => s === 'red')) fault = true;
    }
    return { signal, text: signal === 'red' ? '🔴 红' : '🔵 蓝', color: signal, pattern, trend, tripleRed, tripleBlue, fault };
}

// ==================== 曱甴路 ====================
function getCockroachRoad(w) {
    const br = STATE.bigRoad;
    if (br.length < 4) return { signal: null, text: '未启动', color: 'default', pattern: null, trend: null };
    const lastCol = br[br.length - 1];
    const skipTwoCol = br[br.length - 4];
    const curHeight = lastCol.cells.length;
    const skipTwoHeight = skipTwoCol.cells.length;
    const signal = curHeight <= skipTwoHeight ? 'red' : 'blue';
    if (w) {
		pushRoadHistory(ROAD_HISTORY.cockroach, signal);
	}
		const { pattern, trend } = getRoadPattern(ROAD_HISTORY.cockroach);
    return { signal, text: signal === 'red' ? '🔴 红' : '🔵 蓝', color: signal, pattern, trend };
}

// ==================== 三珠路 ====================
const THREE_POS = { groups: [], pending: [] };

function addToThreePos(result) {
    if (result === 'T') return;
    THREE_POS.pending.push(result);
    if (THREE_POS.pending.length === 3) {
        THREE_POS.groups.push({ combo: THREE_POS.pending.join(''), result: THREE_POS.pending[2] });
        THREE_POS.pending = [];
    }
}
		// 三珠路形态界面显示
function getThreePosDisplay() {
    if (THREE_POS.groups.length === 0 && THREE_POS.pending.length === 0) return '未启动';
    return THREE_POS.groups.map(g => g.combo).join('') + (THREE_POS.pending.length > 0 ? ' [' + THREE_POS.pending.join('') + ']' : '');
}

// ==================== 存储 ====================
function saveState() { localStorage.setItem('baccarat_state_v9', JSON.stringify(STATE)); }
function loadState() { const saved = localStorage.getItem('baccarat_state_v9'); if (saved) { try { Object.assign(STATE, JSON.parse(saved)); } catch (e) {} } }

// ==================== 渲染 ====================
// 修改 render 函数，防止投票详情块重复
function render(result) {
          //console.log('render全部投票:', result.votes.details.map(v => v.name));
	if (!result) {
        document.getElementById('final-judgment').textContent = '等待输入…';
        document.getElementById('final-judgment').className = 'final-judgment';
        return;
    }
	
    // prediction 为 null 时也继续往下走，只是不设 pendingPrediction
    if (result.prediction) {
        STATE.pendingPrediction = result.prediction;
    } else {
        STATE.pendingPrediction = null;
    }

			
    // 大路
    document.getElementById('val-bigroad').textContent = getBigRoadDisplay();

    // 三珠路
    document.getElementById('val-threepos').textContent = result.threePosDisplay || '未启动';
	
    // 大眼仔 / 小路 / 曱甴路
    const eyeEl = document.getElementById('val-bigeye');
    if (result.bigEye.pattern && result.bigEye.pattern !== '数据不足') {
        const trendText = result.bigEye.trend === '顺列' ? '→顺' : (result.bigEye.trend === '断列' ? '→断' : '');
        eyeEl.textContent = result.bigEye.pattern + ' ' + trendText + (result.bigEye.blueStreak >= 3 ? ` ⚠️${result.bigEye.blueStreak}蓝` : '');
    } else { eyeEl.textContent = result.bigEye.text; }
    eyeEl.className = 'road-value ' + result.bigEye.color;

    const smallEl = document.getElementById('val-smallroad');
    if (result.smallRoad.pattern && result.smallRoad.pattern !== '数据不足') {
        const trendText = result.smallRoad.trend === '顺列' ? '→顺' : (result.smallRoad.trend === '断列' ? '→断' : '');
        const extra = result.smallRoad.tripleRed ? ' 🔴3连' : (result.smallRoad.tripleBlue ? ' 🔵3连' : (result.smallRoad.fault ? ' ⚡断层' : ''));
        smallEl.textContent = result.smallRoad.pattern + ' ' + trendText + extra;
    } else { smallEl.textContent = result.smallRoad.text; }
    smallEl.className = 'road-value ' + result.smallRoad.color;

    const cockroachEl = document.getElementById('val-cockroach');
    if (result.cockroach.pattern && result.cockroach.pattern !== '数据不足') {
        const trendText = result.cockroach.trend === '顺列' ? '→顺' : (result.cockroach.trend === '断列' ? '→断' : '');
        cockroachEl.textContent = result.cockroach.pattern + ' ' + trendText;
    } else { cockroachEl.textContent = result.cockroach.text; }
    cockroachEl.className = 'road-value ' + result.cockroach.color;

    // 梅花易数
    const meihuaEl = document.getElementById('val-meihua');
    const huDetail = result.meihua.huScore ? result.meihua.huScore.detail : '';
    const huWarning = result.meihua.huScore && Math.abs(result.meihua.huScore.score) >= 2 ? (result.meihua.huScore.score > 0 ? ' ⚠️互卦预警：帮闲' : ' ⚠️互卦预警：帮庄') : '';
    meihuaEl.textContent = result.meihua.text + ' ' + huDetail + huWarning;
    meihuaEl.className = 'road-value gold';

    // 三大路共振
    document.getElementById('val-resonance').textContent = result.resonance.text;

    // 最终判断
	const finalEl = document.getElementById('final-judgment');
	if (result.prediction) {
		finalEl.innerHTML = `${result.source?? ''}→${result.prediction === 'B' ? '🔴' : '🔵'} | 庄${result.votes?.B.length ?? 0}票 vs 闲${result.votes?.P.length ?? 0}票`;
		finalEl.className = 'final-judgment ' + (result.prediction === 'B' ? 'red-bg' : 'blue-bg');
	} else {
		finalEl.innerHTML = `⚖️ 平票随机 | 庄${result.votes?.B.length ?? 0}票 vs 闲${result.votes?.P.length ?? 0}票`;
		finalEl.className = 'final-judgment';
	}

    // 投票详情（先移除旧块，再插入新块）
    const oldVote = document.getElementById('vote-detail');
    if (oldVote) oldVote.remove();

    const votes = result.votes;
    if (votes) {
        const voteDiv = document.createElement('div');
        voteDiv.id = 'vote-detail';
        voteDiv.className = 'vote-detail';

        let voteHtml = '<div class="vote-title">🗳 民主投票详情</div>';

        [1, 2, 3].forEach(tier => {
            const tierVotes = votes.details.filter(v => v.tier === tier);
            if (tierVotes.length >= 0) {
                const tierName = tier === 1 ? '大数据触发' : (tier === 2 ? '实时信号触发' : '专家直觉触发');
                voteHtml += `<div class="vote-tier">【议会${tier}组-${tierName}】</div>`;
                tierVotes.forEach(v => {
                    const color = v.direction === 'B' ? 'var(--red)' : 'var(--blue)';
                    const label = v.direction === 'B' ? '庄' : '闲';
					voteHtml += `<div class="vote-item">${v.name} → <span style="color:${color};">${label}</span> (${v.score}票)${v.reason ? ' <span style="color:#999;font-size:0.75rem;"> - ' + v.reason + ' </span>' : ''}</div>`;
                });
            }
        });

        voteHtml += `<div class="vote-result">票数总决：<span style="color:${result.prediction === 'B' ? 'var(--red)' : 'var(--blue)'};">${result.prediction === 'B' ? '庄 (B)' : '闲 (P)'}</span> | 庄${votes.B.length}票 vs 闲${votes.P.length}票</div>`;

        voteDiv.innerHTML = voteHtml;
        finalEl.insertAdjacentElement('afterend', voteDiv);
    }

    // 胜率
    const totalPct = STATE.totalPredictions > 0 ? Math.round((STATE.totalHits / STATE.totalPredictions) * 100) : 0;
    //document.getElementById('winrate-percent').textContent = totalPct + '%';
	    //document.getElementById('winrate-detail').textContent = `预测 ${STATE.totalPredictions} 次 | 命中 ${STATE.totalHits} 次`;
	// 上局总胜率
    const last10 = STATE.history.slice(-10);
    const last10Hits = last10.filter(e => e.correct === true).length;
    const last10Total = last10.filter(e => e.prediction !== null).length;
    const last10Pct = last10Total > 0 ? Math.round((last10Hits / last10Total) * 100) : 0;
    document.getElementById('winrate-detail').textContent = 
        `${STATE.totalPredictions} 局 | 中 ${STATE.totalHits}  | 近十 ${last10Pct}%`;

    // 历史
    const histEl = document.getElementById('history-list');
    if (STATE.history.length === 0) {
        histEl.innerHTML = '暂无记录…';
    } else {
        histEl.innerHTML = STATE.history.slice().reverse().map(entry => {
            const cls = entry.result;
            const mark = entry.correct === true ? '✅' : (entry.correct === false ? '❌' : '⬜');
            return `<span class="${cls}">${entry.result}</span> 闲${entry.player} 庄${entry.banker} 末牌${entry.lastCard} →  ${entry.prediction || '—'} ${mark}`;
        }).join('<br>');
    }

    saveState();
}

// ==================== 提交 ====================
function submitResult() {	
    const userId = localStorage.getItem('bac_user_id') || '';	
	const showStatus = document.getElementById('vote-detail');  //显示各种提示和投票详情
	const loadView = document.getElementById('loading-overlay');  // 连接等待返回画面
	
	if (!userId) {
		alert('❌ 请先登入 / 注册');
		showStatus.textContent = ' ❌ 请先登入 / 注册';
		return false;
	}
			//限制提交时间计时
	var now = Date.now();
	if (now - lastSubmitTime < 10000) {
		alert('❌ 操作太频繁,请10秒后再提交');
		showStatus.textContent = ' ❌ 操作请勿频繁，10秒后再提交';
		return false;
	}
	lastSubmitTime = now;
	
	loadView.style.display = 'flex';   //显示等待画面
	
    // 读取六张牌
    var p1Raw, p2Raw, p3Raw, b1Raw, b2Raw, b3Raw;
    if (window.FAKE_CARDS) {
        var fc = window.FAKE_CARDS;
        p1Raw = fc.p1; p2Raw = fc.p2; p3Raw = fc.p3;
        b1Raw = fc.b1; b2Raw = fc.b2; b3Raw = fc.b3;
    } else {
        p1Raw = document.getElementById('p1').value;
        p2Raw = document.getElementById('p2').value;
        p3Raw = document.getElementById('p3').value;
        b1Raw = document.getElementById('b1').value;
        b2Raw = document.getElementById('b2').value;
        b3Raw = document.getElementById('b3').value;
    }

    const p1Obj = parseCard(p1Raw), p2Obj = parseCard(p2Raw), p3Obj = parseCard(p3Raw);
    const b1Obj = parseCard(b1Raw), b2Obj = parseCard(b2Raw), b3Obj = parseCard(b3Raw);

    const p1 = p1Obj.value, p2 = p2Obj.value, p3 = p3Obj.value;
    const b1 = b1Obj.value, b2 = b2Obj.value, b3 = b3Obj.value;

    const p3used = p3 !== 0;
    const b3used = b3 !== 0;

    // 计算点数
    function cv(c) { return c >= 10 ? 0 : c; }
	//取牌色
	function parseCard(val) {
    if (val === '0' || val === 0 || !val) return { value: 0, color: null };
    var str = String(val);
    if (str[0] === 'R' || str[0] === 'B') {
        return { value: parseInt(str.substring(1)), color: str[0] === 'R' ? '红' : '黑' };
    }
    return { value: parseInt(str), color: null };
}
/*
	function parseCard(val) {
		if (val === '0' || val === 0 || !val) return { value: 0, color: null };
		const str = String(val);
		const color = str[0] === 'R' ? '红' : '黑';
		const num = parseInt(str.substring(1));
		return { value: num, color };
	}*/
    let pt = (cv(p1) + cv(p2)) % 10;
    let bt = (cv(b1) + cv(b2)) % 10;
	
    if (p3used) pt = (pt + cv(p3)) % 10;
    if (b3used) bt = (bt + cv(b3)) % 10;

    const result = getResult(pt, bt);

    // 最后牌：从六张牌中取最后一张非0的
    const cards = [p1, p2, b1, b2];
    if (p3used) cards.push(p3);
    if (b3used) cards.push(b3);
    const lastCard = cards[cards.length - 1];

    // 显示提交的牌型在标题后面
    const pStr = p3used ? `${cv(p1)},${cv(p2)}[${cv(p3)}]=${pt}` : `${cv(p1)},${cv(p2)}=${pt}`;
    const bStr = b3used ? `${cv(b1)},${cv(b2)}[${cv(b3)}]=${bt}` : `${cv(b1)},${cv(b2)}=${bt}`;
    document.querySelector('.card-header').textContent = `🎲 刚输入：  闲 ${pStr}  庄 ${bStr} → ${result === 'B' ? '庄赢' : result === 'P' ? '闲赢' : '和局'}`;

    STATE.lastPlayerPoints = pt;
			//console.log('赋值后立即查:', STATE.lastPlayerPoints);
    STATE.lastBankerPoints = bt;
    STATE.lastCardValue = lastCard;
	
    // 记录原始牌面值（1-13），不做点数转换
	STATE._playerFirstTwo = [p1, p2];
	STATE._bankerFirstTwo = [b1, b2];
	STATE.cardColors = [p1Obj.color, p2Obj.color, b1Obj.color, b2Obj.color];
    if (p3used) STATE.cardColors.push(p3Obj.color);
    if (b3used) STATE.cardColors.push(b3Obj.color);
	
	//-------将结果存入STATE------
	if (STATE.pendingPrediction && STATE.pendingPrediction !== null) {
        const correct = (result === STATE.pendingPrediction);
        STATE.totalPredictions++;
        if (correct) STATE.totalHits++;
        if (STATE._lastSourceType && STATE.stats[STATE._lastSourceType]) {
            STATE.stats[STATE._lastSourceType].total++;
            if (correct) STATE.stats[STATE._lastSourceType].hit++;
        }
        STATE.history.push({ 
            player: pt, banker: bt, lastCard: lastCard, result: result, 
            prediction: STATE.pendingPrediction, correct: correct,
            playerFirstTwo: STATE._playerFirstTwo,
            bankerFirstTwo: STATE._bankerFirstTwo
        });
    } else {
        STATE.history.push({ 
            player: pt, banker: bt, lastCard: lastCard, result: result, 
            prediction: null, correct: null,
            playerFirstTwo: STATE._playerFirstTwo,
            bankerFirstTwo: STATE._bankerFirstTwo
        });
    }
	
       //大路走势--界面显示
    addToBigRoad(result);
	//三珠路走势--界面显示		
    addToThreePos(result);	
    getBigEyeBoy(1); 
    getSmallRoad(1);		
	updateSmallRoadBigRoad();  //更新小路形态记忆
    getCockroachRoad(1);
	
		const lastEntry = STATE.history[STATE.history.length - 1];	//取最新的结果集合							
		if (lastEntry) {			
					
				if (STATE.history.length > 1) {
						 //---即时追踪胜负差值的--服务器写入F库--------每局清空---
					if (lastEntry.result === 'B') diffTotal++;
					else if (lastEntry.result === 'P') diffTotal--;		
				}
					
					//console.log('lastEntry：'+lastEntry);			
				//追踪决策者自己连赢连输
				if (lastEntry.correct === true) {
					STATE._consecutiveHits += 1;
				} else if (lastEntry.correct === false) {
					STATE._consecutiveHits -= 1;
				}
				
				const lastVotes = STATE._lastPredResult?.votes;				  
				    // --所有第2梯队的都在监控功能中 -- 应该用不上
				/*	// G库：记录赌徒直觉组合结果
				if (lastVotes) {
					const tierVotes = lastVotes.details.filter(v => v.tier === 2);   //-- 3 就是第3梯队 --2是与大路有关的各种形态
					tierVotes.forEach(v => {
						saveGutRecord(v.name, result);
					});
				}	*/			 
				
					// G库追踪：更新被追踪信号的连赢连输
				if (lastVotes) { 
					const allVotes = lastVotes.details;       // 上一局的投票集合 与 刚提交的牌(当前局)结果 写入库
					const actualResult = result;   //当前的结果
					if (actualResult !== 'T') {
						// 追踪其他信号
						TRACKED_SIGNALS.forEach(name => {
							if (name === '决策者') return;
							const vote = allVotes.find(v => v.name === name);
							if (vote) {
								updateGutStreak(name, vote.direction, actualResult);
							}
						});
					}
				}
		}
				
						//console.log('发送前bigRoad:', STATE.bigRoad);
						
	// 构建传给服务端的数据包
	const serverInput = {
		// 牌型
		playerCards: [p1, p2, p3 || 0],
		bankerCards: [b1, b2, b3 || 0],
		pt: pt,
		bt: bt,
		// 大路
		bigRoad: STATE.bigRoad,
		// 三珠路
		threePosGroups: THREE_POS.groups,
		threePosPending: THREE_POS.pending,
		// 下路历史
		bigEyeHistory: ROAD_HISTORY.bigeye,
		smallRoadHistory: ROAD_HISTORY.smallroad,
		cockroachHistory: ROAD_HISTORY.cockroach,
		// 梅花参数
		tableNum: parseInt(document.getElementById('table-num')?.value || 1),
		birthElement: document.getElementById('birth-element')?.value || '金',
		cardColors: STATE.cardColors || [],
		// 状态标志
		consecutiveHits: STATE._consecutiveHits || 0,
		diffTotal: diffTotal,
		historyLength: STATE.history.length,
		lastPlayerPoints: STATE.lastPlayerPoints,  
		lastBankerPoints: STATE.lastBankerPoints,
		lastCardValue: STATE.lastCardValue,		
		// 最近3局历史（连小转势等用）
		recentHistory: STATE.history.slice(-5).map(e => ({
			player: e.player,
			banker: e.banker,
			result: e.result
		})),
		// B库要用到的原始牌型
			playerFirstTwo: STATE.history.length >= 2 ? STATE.history[STATE.history.length-2].playerFirstTwo : null,
			bankerFirstTwo: STATE.history.length >= 2 ? STATE.history[STATE.history.length-2].bankerFirstTwo : null,
		// E库要用的小路形态数组
		smallRoadBigRoad: SMALLROAD_BIGROAD,
		//调用所有记忆库
		morphResults: {
			A: queryMorphMemory(),
			B: queryCardMemory(),
			C: queryBigRoad4Memory(),
			D: queryThreePosMemory(),
			E: querySmallRoadMemory(),
			F: queryDiffMemory(),
			H: queryEnhancedMemory(),
			I: queryMeihuaMemory()
		},		
		gutMemory: GUT_MEMORY || {},  //整个G库全局变量内容传过去
		winRateTrend: getWinRateTrend(),  //传递最近几轮的胜率计算过去
		userId: localStorage.getItem('bac_user_id') || '',
		userPwd: localStorage.getItem('bac_user_pwd') || '',
	};
		//console.trace('fetch 调用栈');
	const injson = JSON.stringify(serverInput);
	const compressed = pako.deflate(injson);
	fetch('https://api.k9a8.com/api/predict', {
		method: 'POST',
			//headers: { 'Content-Type': 'application/json' },
			//body: JSON.stringify(serverInput)
		headers: { 'Content-Type': 'application/json',  'Content-Encoding': 'deflate'	},
		body: compressed
	})
	.then(response => {
		if (!response.ok) {
				showStatus.textContent = ' 🔶服务端返回错误: '+ response.status + ' 请检查网络';
		}
		return response.json();
	})
	.then(predResult => {
					// 这里放原来 getPrediction() 之后的所有代码			
					console.log('服务端完整返回:',predResult);
						//console.log('saveResults:', predResult.saveResults);
						//-----写入各大库---------
						if (predResult.saveResults) {
							predResult.saveResults.forEach(item => {
								if (!item) return;
								// H 库返回的是数组，其他库返回的是单个对象
								const items = Array.isArray(item) ? item : [item];
								items.forEach(entry => {
									const existing = JSON.parse(localStorage.getItem(entry.key) || '{}');
									if (!existing[entry.recordKey]) existing[entry.recordKey] = { B: 0, P: 0, total: 0 };
									existing[entry.recordKey][entry.result]++;
									existing[entry.recordKey].total++;
									localStorage.setItem(entry.key, JSON.stringify(existing));
								});
							});
						}
		
		STATE._lastPredResult = predResult;
		STATE.bigRoad = predResult.serverBigRoad;  //服务端返回的大路覆盖本地的
						//console.log('接收覆盖后bigRoad:', STATE.bigRoad);
		
		// ... 全部保留 ...
			loadView.style.display = 'none';  //隐藏等待画面，恢复界面
				//如果result的error不为false就是有错误
				if (predResult.error) {
					showStatus.textContent = ' ❌出错！' + predResult.error ;
					alert('❌大路错乱被污染！' + predResult.error);
					return;
				} else {	
					showStatus.textContent = ' ✅ 结果计算成功 ';
				}
				
			render(predResult);
	})
	.catch(err => {
				loadView.style.display = 'none';  //隐藏等待画面，恢复界面	
				showStatus.textContent = ' 🔶远端调用失败: ' + err + ' 请检查网络';
					alert(' 🔶远端调用失败: ' + err + ' 请检查网络');
	});
	
}

// ==================== 形态记忆库 ====================
//==================== A库 --两局点数+梅花卦向 ====================
const MORPH_MEMORY_KEY = 'baccarat_morph_memory';
function queryMorphMemory() {
    if (STATE.history.length < 2) return null;
    
    const firstEntry = STATE.history[STATE.history.length - 2];
    const secondEntry = STATE.history[STATE.history.length - 1];
    const summary = firstEntry.player + '-' + firstEntry.banker + '|' + secondEntry.player + '-' + secondEntry.banker;
    
    const fullKey = summary;
    //console.log('A库查询key:', fullKey);
    
    let memory = {};
    try {
        const saved = localStorage.getItem(MORPH_MEMORY_KEY);
        if (saved) memory = JSON.parse(saved);
    } catch(e) { return null; }
    const record = memory[fullKey];
    //console.log('A库命中记录:', record);
    if (!record || record.total < 1) return null;
    
    const bRate = record.B / record.total;
    const pRate = record.P / record.total;
    if (bRate > 0.5) return { direction: 'B', confidence: Math.round(bRate * 100), source: '两局点数记忆' };
    if (pRate > 0.5) return { direction: 'P', confidence: Math.round(pRate * 100), source: '两局点数记忆' };
    return null;
}

//==================== B库 --4张牌面记忆 ====================
const MORPH_CARD_KEY = 'baccarat_morph_cards';
function queryCardMemory() {
    if (STATE.history.length === 0) return null;
    const lastEntry = STATE.history[STATE.history.length - 1];
    if (!lastEntry.playerFirstTwo || !lastEntry.bankerFirstTwo) return null;
    
    const playerFirstTwo = lastEntry.playerFirstTwo[0] + '-' + lastEntry.playerFirstTwo[1];
    const bankerFirstTwo = lastEntry.bankerFirstTwo[0] + '-' + lastEntry.bankerFirstTwo[1];
    const cardKey = playerFirstTwo + '|' + bankerFirstTwo;
    
    let cardMemory = {};
    try {
        const saved = localStorage.getItem(MORPH_CARD_KEY);
        if (saved) cardMemory = JSON.parse(saved);
    } catch(e) { return null; }
    
    const record = cardMemory[cardKey];
	//console.log('B库命中记录:', cardKey);
    if (!record || record.total < 1) return null;
    
    const bRate = record.B / record.total;
    const pRate = record.P / record.total;
    
    if (bRate > 0.5) return { direction: 'B', confidence: Math.round(bRate * 100), source: '牌面记忆' };
    if (pRate > 0.5) return { direction: 'P', confidence: Math.round(pRate * 100), source: '牌面记忆' };
    return null;
}

// ==================== C库：四列大路记忆 → 下一局胜负 ====================
const MORPH_BIGROAD4_KEY = 'baccarat_morph_bigroad4';
function queryBigRoad4Memory() {
    const br = STATE.bigRoad;
    if (br.length < 4) return null;

    const last4 = br.slice(-4);
    const summary = last4.map(c => c.cells[0] + String(c.cells.length)).join('/');

    //console.log('C库读取 - 当前四列形态:', summary);

    let memory = {};
    try {
        const saved = localStorage.getItem(MORPH_BIGROAD4_KEY);
        if (saved) memory = JSON.parse(saved);
    } catch(e) { return null; }
    const record = memory[summary];
    //console.log('C库读取 - 命中的记忆:', summary, record || '无');
    if (!record || record.total < 1) return null;

    const bRate = record.B / record.total;
    const pRate = record.P / record.total;
    //console.log('C库读取 - B率:', Math.round(bRate*100) + '%', 'P率:', Math.round(pRate*100) + '%', '总次数:', record.total);
    if (bRate > 0.5) return { direction: 'B', confidence: Math.round(bRate * 100), source: '四列大路记忆' };
    if (pRate > 0.5) return { direction: 'P', confidence: Math.round(pRate * 100), source: '四列大路记忆' };
    return null;
}

// ==================== D库：三局总点数和序列 → 下一局胜负（替代原三珠路） ====================
const MORPH_THREEPOS_KEY = 'baccarat_morph_threepos';
function queryThreePosMemory() {
    if (STATE.history.length < 3) return null;
    
    const last3 = STATE.history.slice(-3);
    if (last3.some(e => !e || e.player === undefined)) return null;
    
    const summary = last3.map(e => (e.player + e.banker)).join('-');
    
    let memory = {};
    try {
        const saved = localStorage.getItem(MORPH_THREEPOS_KEY);
        if (saved) memory = JSON.parse(saved);
    } catch(e) { return null; }
    const record = memory[summary];
    if (!record || record.total < 1) return null;
    
    const bRate = record.B / record.total;
    const pRate = record.P / record.total;
    if (bRate > 0.5) return { direction: 'B', confidence: Math.round(bRate * 100), source: '三局总点数记忆' };
    if (pRate > 0.5) return { direction: 'P', confidence: Math.round(pRate * 100), source: '三局总点数记忆' };
    return null;
}

// ==================== E库：三列小路形态 → 下一局胜负 ====================
const MORPH_SMALLROAD_KEY = 'baccarat_morph_smallroad';
function querySmallRoadMemory() {
    const br = SMALLROAD_BIGROAD;
    if (br.length < 3) return null;
    
    const last3 = br.slice(-3);
    const summary = last3.map(c => (c.color === 'red' ? 'R' : 'B') + c.len).join('-');

    let memory = {};
    try {
        const saved = localStorage.getItem(MORPH_SMALLROAD_KEY);
        if (saved) memory = JSON.parse(saved);
    } catch(e) { return null; }
    const record = memory[summary];
    if (!record || record.total < 1) return null;

    const bRate = record.B / record.total;
    const pRate = record.P / record.total;
    if (bRate > 0.5) return { direction: 'B', confidence: Math.round(bRate * 100), source: '小路形态记忆' };
    if (pRate > 0.5) return { direction: 'P', confidence: Math.round(pRate * 100), source: '小路形态记忆' };
    return null;
}

// ==================== F库：累计三珠三三记忆 ====================
const MORPH_DIFF_KEY = 'baccarat_morph_diff';
function queryDiffMemory() {
	const groups = THREE_POS.groups;
    const pending = THREE_POS.pending;
    if (groups.length < 2) return null;

    var key = '';
    if (groups.length >= 3) {
        if (pending.length === 0) {   //如果没有pending则取前三组形态去查询
            key = groups.slice(-3).map(g => g.combo).join('/');
        }
        if (pending.length === 1) {  //如果pending只有一颗则取前二组形态和pending第一颗去查询
			key = groups.slice(-2).map(g => g.combo).join('/') + '/' + pending[0];
        }
    }
    if (pending.length === 2) {
            key = groups.slice(-2).map(g => g.combo).join('/') + '/' + pending.slice(0, 2).join('');  //如果pending有两颗则取前二组形态和pending两颗去查询
    }

    if (!key) return null;

    var memory = {};
    try {
        var saved = localStorage.getItem(MORPH_DIFF_KEY);
        if (saved) memory = JSON.parse(saved);
    } catch(e) { return null; }
    
    var record = memory[key];
    if (!record || record.total < 2) return null;

    var bRate = record.B / record.total;
    var pRate = record.P / record.total;
    if (bRate > 0.50) return { direction: 'B', confidence: Math.round(bRate * 100), source: '三珠三三记忆' };
    if (pRate > 0.50) return { direction: 'P', confidence: Math.round(pRate * 100), source: '三珠三三记忆' };
	
    return null;
}


// ==================== G库全局变量：赌徒直觉组合记忆 ====================
function saveGutRecord(comboKey, result) {
    if (!comboKey || !result || result === 'T') return;
    if (!GUT_MEMORY[comboKey]) GUT_MEMORY[comboKey] = { B: 0, P: 0, total: 0 };
    GUT_MEMORY[comboKey][result]++;
    GUT_MEMORY[comboKey].total++;	
			//console.log('G库:', GUT_MEMORY[comboKey]);
}


const MORPH_GUT_KEY = 'baccarat_morph_gut';
    //G库 计算最近 5 - 9 轮的总胜率
function getWinRateTrend() {
    const gut = JSON.parse(localStorage.getItem(MORPH_GUT_KEY) || '{}');
    const rates = gut._shoeRates;
    if (!rates || rates.length < 5) return null;
    
    let bestHint = null;
    let bestDiff = 0;
    
    [5, 6, 7, 8, 9].forEach(n => {
        if (rates.length < n) return;
        const recent = rates.slice(-n);
        let totalGames = 0, totalHits = 0;
        recent.forEach(r => { totalGames += r.games; totalHits += r.hits; });
        const rate = Math.round(totalHits / totalGames * 100);
        const diff = Math.abs(rate - 50);
        
        if (diff > bestDiff && diff >= 5) {
            bestDiff = diff;
            bestHint = {
                rounds: n,
                totalGames: totalGames,
                rate: rate,
                direction: rate > 50 ? '偏高' : '偏低',
                hint: rate > 60 ? ' 近' + n + '轮胜率' + rate + '%，可能回调' :
                      rate < 40 ? ' 近' + n + '轮胜率' + rate + '%，可能反弹' : null
            };
        }
    });
    
    return bestHint;
}

// ==================== H库：两局点数记忆增强版 ====================
const MORPH_ENHANCED_KEY = 'baccarat_morph_enhanced';
function queryEnhancedMemory() {
    if (STATE.history.length < 2) return null;
    
    const firstEntry = STATE.history[STATE.history.length - 2];
    const secondEntry = STATE.history[STATE.history.length - 1];
    
    const queries = [
        'P:' + firstEntry.player + '-' + firstEntry.banker + '|' + secondEntry.player + '-' + secondEntry.banker,
        'D:' + (firstEntry.player - firstEntry.banker) + '|' + (secondEntry.player - secondEntry.banker),
        'S:' + (firstEntry.player + firstEntry.banker) + '|' + (secondEntry.player + secondEntry.banker)
    ];

    let memory = {};
    try {
        const saved = localStorage.getItem(MORPH_ENHANCED_KEY);
        if (saved) memory = JSON.parse(saved);
    } catch(e) { return null; }

    let bestResult = null;
    let bestConfidence = 0;

    queries.forEach(fullKey => {
        const record = memory[fullKey];
        if (!record || record.total < 1) return;
        
        const bRate = record.B / record.total;
        const pRate = record.P / record.total;
        
        if (bRate > bestConfidence && bRate > 0.5) {
            bestConfidence = bRate;
            bestResult = { direction: 'B', confidence: Math.round(bRate * 100), source: '二次三维记忆' };
        }
        if (pRate > bestConfidence && pRate > 0.5) {
            bestConfidence = pRate;
            bestResult = { direction: 'P', confidence: Math.round(pRate * 100), source: '二次三维记忆' };
        }
    });

    return bestResult;
}

//-----共用G库-------------
function updateGutStreak(signalName, predictedDir, actualResult) {
    if (!signalName || !predictedDir || actualResult === 'T') return;
    if (!GUT_MEMORY[signalName]) GUT_MEMORY[signalName] = { B: 0, P: 0, total: 0, streak: 0, reverseCount: 0 };
    
    const record = GUT_MEMORY[signalName];
    record.total++;
    record[actualResult]++;
    
    const correct = (predictedDir === actualResult);
    if (correct) {
        record.streak = record.streak > 0 ? record.streak + 1 : 1;
    } else {
        record.streak = record.streak < 0 ? record.streak - 1 : -1;
    }
    
    if (record.reverseCount > 0) record.reverseCount--;
	
    //console.log('G库222:', GUT_MEMORY);
}

function queryGutStreak(signalName) {
    if (!signalName) return null;
	const record = GUT_MEMORY[signalName];
    if (!record || record.total < 3) return null;
    if (record.reverseCount > 0) {
        return record.streak >= 4 ? 'reverse' : (record.streak <= -4 ? 'follow' : null);
    }
    if (record.streak >= 4) { record.reverseCount = 2; return 'reverse'; }
    if (record.streak <= -4) { record.reverseCount = 2; return 'follow'; }
    return null;	
}

//========I库 前局玄点记忆 =======
const MORPH_MEIHUA_KEY = 'baccarat_morph_meihua';
function queryMeihuaMemory() {
    if (STATE.history.length < 1) return null;
    const lastEntry = STATE.history[STATE.history.length - 1];
			//console.log('上一局：', lastEntry);
    const pointsKey = lastEntry.player + '-' + lastEntry.banker;
    
    let memory = {};
    try {
        const saved = localStorage.getItem(MORPH_MEIHUA_KEY);
        if (saved) memory = JSON.parse(saved);
    } catch(e) { return null; }
    const record = memory[pointsKey];
    if (!record || record.total < 1) return null;
    
    const bRate = record.B / record.total;
    const pRate = record.P / record.total;
    if (bRate > 0.50) return { direction: 'B', confidence: Math.round(bRate * 100), source: '前局玄点记忆' };
    if (pRate > 0.50) return { direction: 'P', confidence: Math.round(pRate * 100), source: '前局玄点记忆' };
    return null;
}

// ==================== 重置 ====================
function resetAll() {
    const isIndex = !!document.getElementById('btn-submit');
	
    // 保存上一轮胜率
    if (STATE.totalPredictions >= 30) {
		let gut = JSON.parse(localStorage.getItem('baccarat_morph_gut') || '{}');
		if (!gut._shoeRates) gut._shoeRates = [];
		gut._shoeRates.push({
			games: STATE.totalPredictions,
			hits: STATE.totalHits,
			rate: Math.round((STATE.totalHits / STATE.totalPredictions) * 100)
		});
		if (gut._shoeRates.length > 20) gut._shoeRates.shift();
		localStorage.setItem('baccarat_morph_gut', JSON.stringify(gut));
	}
	
    // ===== 数据层面：所有页面共用，全部清空 =====
    STATE.bigRoad = [];
    STATE.history = [];
    STATE.totalPredictions = 0;
    STATE.totalHits = 0;
    STATE.pendingPrediction = null;
    STATE.lastPlayerPoints = null;
    STATE.lastBankerPoints = null;
    STATE.lastCardValue = null;
    STATE.stats = { resonance: { total: 0, hit: 0 }, meihua: { total: 0, hit: 0 }, form: { total: 0, hit: 0 } };
    STATE._singleJumpMissCount = 0;
    STATE._lastSourceType = null;
    STATE._consecutiveHits = 0;
    STATE._lastNewFormMiss = false;
    STATE._lastSmallRoadBlue = false;
    STATE._lastPattern = null;
    STATE._lastMeihuaDirection = null;
    STATE._lastWriteId = null;
    STATE._playerFirstTwo = null;
    STATE._bankerFirstTwo = null;
    ROAD_HISTORY.bigeye = [];
    ROAD_HISTORY.smallroad = [];
    ROAD_HISTORY.cockroach = [];
    SMALLROAD_BIGROAD.length = 0;
    THREE_POS.groups = [];
    THREE_POS.pending = [];
	STATE.cardColors = null;
    diffTotal = 0;
	GUT_MEMORY = {};
    saveState();

    // ===== 界面层面：只有 index.html 才操作 DOM =====
    if (isIndex) {
        document.getElementById('val-bigroad').textContent = '—';
        document.getElementById('val-bigeye').textContent = '未启动';
        document.getElementById('val-bigeye').className = 'road-value default';
        document.getElementById('val-smallroad').textContent = '未启动';
        document.getElementById('val-smallroad').className = 'road-value default';
        document.getElementById('val-cockroach').textContent = '未启动';
        document.getElementById('val-cockroach').className = 'road-value default';
        document.getElementById('val-threepos').textContent = '未启动';
        document.getElementById('val-meihua').textContent = '未启动';
        document.getElementById('val-resonance').textContent = '否';
        document.getElementById('final-judgment').textContent = '等待牌局开始…';
        document.getElementById('final-judgment').className = 'final-judgment';
        //document.getElementById('winrate-percent').textContent = '0%';
        document.getElementById('winrate-detail').textContent = '共 0 次 | 中 0 次';
        document.getElementById('history-list').innerHTML = '暂无记录…';
        //document.getElementById('card-header-title').textContent = '📊 实时路纸';
        //document.getElementById('logonOK').textContent = '请先登入账号才能开始...';
		//document.getElementById('card-header-title').textContent = `📊 实时路纸 | 上一轮 ${STATE.lastShoePct || 0}%`;
        document.getElementById('vote-detail').innerHTML = '等待新一轮分析开始…';
        //if (oldVote) oldVote.remove();
    }
}

// ==================== 复选框联动 ====================
function bindCheckboxes() {
    const map = { 'chk-bigroad':'row-bigroad','chk-3roads': 'row-3roads','chk-threepos':'row-threepos','chk-meihua':'row-meihua','chk-resonance':'row-resonance' };
    Object.entries(map).forEach(([chkId, rowId]) => { const chk = document.getElementById(chkId); const row = document.getElementById(rowId); if (chk && row) { row.style.display = chk.checked ? 'flex' : 'none'; chk.addEventListener('change', () => { row.style.display = chk.checked ? 'flex' : 'none'; }); } });
}

// ---------退出登录 -------------
function logout() {
    localStorage.removeItem('bac_user_id');
    localStorage.removeItem('bac_user_pwd');
    location.reload();
}

// ==================== 初始化 ====================
function init() {
    // =========== 密码登录验证 ====================
	var userId = localStorage.getItem('bac_user_id');
	const showStatus = document.getElementById('vote-detail');  //显示各种提示和投票详情
	const loginStatus = document.getElementById('login-status');  //显示登陆注册的提示	
	const loadView = document.getElementById('loading-overlay');  // 连接等待返回画面
		
	document.getElementById('btn-login').addEventListener('click', function() {
		var phone = document.getElementById('login-phone').value.trim();
		var pwd = document.getElementById('login-pwd').value.trim();
		if (!phone || !pwd) { loginStatus.textContent = '❌ ' +  '手机号码和密码请填写正确'; return; }		
		if (!/^\d{1,11}$/.test(phone) || phone.length < 6 || phone.length > 11) { loginStatus.textContent = '❌ ' +  '请填写纯数字手机号码，最多11位'; return; }
		if (pwd.length < 6 || pwd.length > 25) { loginStatus.textContent = '❌ ' +  '密码需要6-25位';	return; }
		
		loadView.style.display = 'flex';   //显示等待画面
		
		fetch('https://api.k9a8.com/api/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ phone: phone, password: pwd })
		})
		.then(r => r.json())
		.then(data => {
			if (data.success) {
				userId = data.userId;
				localStorage.setItem('bac_user_id', userId);
				localStorage.setItem('bac_user_pwd', data.userPwd); 				
				document.getElementById('login-card').style.display = 'none';  //隐藏输入框
				showStatus.innerHTML = document.getElementById('user' + [data.level] || 0).innerHTML;  // 按等级显示内容
				document.getElementById('logonOK').innerHTML = '已登录: ' + userId + ' <a href="#" onclick="logout()" style="color:#8b5cf6; margin-left:8px;">退出</a>';
				startApp();
			} else {
				loginStatus.textContent = '❌ ' + (data.error || ' 登录失败,请检查输入是否正确');
			}
			
			loadView.style.display = 'none';   //关闭等待画面
		});		
	});
	
	document.getElementById('btn-register').addEventListener('click', function() {
		var phone = document.getElementById('login-phone').value.trim();
		var email = document.getElementById('login-email').value.trim();
		var pwd = document.getElementById('login-pwd').value.trim();
		var pwd2 = document.getElementById('login-pwd2').value.trim();
		if (!phone || !email || !pwd || !pwd2) { loginStatus.textContent = '❌ ' +  '四个框都请填写正确';	return; }
		if (!/^\d{1,11}$/.test(phone) || phone.length < 6 || phone.length > 11) {	loginStatus.textContent = '❌ ' +  '请填写纯数字手机号码，最多11位';	return; }
		if (pwd.length < 6 || pwd.length > 25) { loginStatus.textContent = '❌ ' +  '密码需要6-25位';	return; }
		const emailRegex = /^[a-zA-Z0-9._%+-]{1,20}@(qq|163|126|gmail|hotmail|sina|yahoo)\.(com|com\.cn|cn|net|com\.hk|hk)$/;
		if (!emailRegex.test(email)) { loginStatus.textContent = '❌ ' +  'Email格式不正确,仅支持qq.com、163、126、gmail、hotmail、sina、yahoo，@前最多20位';	return; }
		if (pwd !== pwd2) { loginStatus.textContent = '❌ 两次密码不一致'; return; }
		
		loadView.style.display = 'flex';   //显示等待画面
		
		fetch('https://api.k9a8.com/api/register', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ phone: phone, email: email, password: pwd })
		})
		.then(r => r.json())
		.then(data => {
			if (data.success) {
				loginStatus.textContent = '✅ -- 注册成功！请直接登录 --';
			} else {
				loginStatus.textContent = '❌ ' + (data.error || '注册失败,请检查输入是否正确');
			}
			
			loadView.style.display = 'none';   //关闭等待画面
		});		
	});

	// 已登录自动跳过
	if (userId) {
		document.getElementById('login-card').style.display = 'none';
		//document.getElementById('stats-card').style.display = 'block';
		document.getElementById('logonOK').innerHTML = '已登录: ' + userId + ' <a href="#" onclick="logout()" style="color:#8b5cf6; margin-left:8px;">退出</a>';
		startApp();
	}

   //===========================================

    // 初始化六张牌下拉框
    function fillSelect(id, includeZero) {
		const sel = document.getElementById(id);
		if (!sel) return;
		sel.innerHTML = '';
		if (includeZero) sel.innerHTML = '<option value="0">无</option>';
		for (let v = 1; v <= 13; v++) {
			const label = v === 1 ? 'A' : v === 11 ? 'J' : v === 12 ? 'Q' : v === 13 ? 'K' : v;
			sel.innerHTML += `<option value="R${v}">红${label}</option>`;
			sel.innerHTML += `<option value="B${v}">黑${label}</option>`;
		}
	}
    fillSelect('p1', false);
    fillSelect('p2', false);
    fillSelect('p3', true);
    fillSelect('b1', false);
    fillSelect('b2', false);
    fillSelect('b3', true);

    // 重置所有下拉框
    function resetSelects(isF) {		
		if (isF === false) return;
			//console.log('submitResult：'+isF);
		
		const p1 = document.getElementById('p1');
		if (!p1) return;
		p1.value = 'R1';
		document.getElementById('p2').value = 'R1';
		document.getElementById('p3').value = '0';
		document.getElementById('b1').value = 'B1';
		document.getElementById('b2').value = 'B1';
		document.getElementById('b3').value = '0';
    }
    // 只有 index.html 才初始化六张牌下拉框
    if (document.getElementById('p1')) {
        fillSelect('p1', false);
        fillSelect('p2', false);
        fillSelect('p3', true);
        fillSelect('b1', false);
        fillSelect('b2', false);
        fillSelect('b3', true);
        resetSelects();
    }
	
	function startApp() {
		     //console.log('startApp 被调用');
		const isIndex = !!document.getElementById('btn-submit');  // 发牌页有提交按钮
		const isMemory = !!document.getElementById('preview-A');  // 记忆库页有预览区

		if (isIndex) {
			// ===== 发牌页 (index.html) =====
			// 清空游戏状态
			STATE.bigRoad = [];
			STATE.history = [];
			STATE.totalPredictions = 0;
			STATE.totalHits = 0;
			STATE.pendingPrediction = null;
			STATE.lastPlayerPoints = null;
			STATE.lastBankerPoints = null;
			STATE.lastCardValue = null;
			STATE.stats = { resonance: { total: 0, hit: 0 }, meihua: { total: 0, hit: 0 }, form: { total: 0, hit: 0 } };
			STATE._singleJumpMissCount = 0;
			STATE._lastSourceType = null;
			STATE._consecutiveHits = 0;
			STATE._lastNewFormMiss = false;
			STATE._lastSmallRoadBlue = false;
			STATE._lastPattern = null;
			STATE._lastMeihuaDirection = null;
			STATE._lastWriteId = null;
			STATE._playerFirstTwo = null;
			STATE._bankerFirstTwo = null;
			ROAD_HISTORY.bigeye = [];
			ROAD_HISTORY.smallroad = [];
			ROAD_HISTORY.cockroach = [];
			SMALLROAD_BIGROAD.length = 0;
			THREE_POS.groups = [];
			THREE_POS.pending = [];
			STATE.cardColors = null;
			diffTotal = 0;
			GUT_MEMORY = {};
			saveState();

			// 绑定事件
			bindCheckboxes();
			document.getElementById('btn-submit').addEventListener('click', () => {
				const success = submitResult();
				resetSelects(success);
			});
			document.getElementById('btn-reset').addEventListener('click', resetAll);

			// 初始界面
			document.getElementById('val-bigroad').textContent = '等待第一局牌提交...';
			document.getElementById('val-bigeye').textContent = '大眼仔';
			document.getElementById('val-bigeye').className = 'road-value default';
			document.getElementById('val-smallroad').textContent = '小路';
			document.getElementById('val-smallroad').className = 'road-value default';
			document.getElementById('val-cockroach').textContent = '曱甴路';
			document.getElementById('val-cockroach').className = 'road-value default';
			document.getElementById('val-threepos').textContent = '未启动';
			document.getElementById('val-meihua').textContent = '无 - 请先填好当前牌桌号和自己本命八字的五行先';
			document.getElementById('val-resonance').textContent = '否';
			document.getElementById('final-judgment').textContent = '等待分析…';
			document.getElementById('final-judgment').className = 'final-judgment';
			document.getElementById('history-list').innerHTML = '暂无记录…';
			//document.getElementById('winrate-percent').textContent = '0%';
			//document.getElementById('winrate-detail').textContent = '预测 0 次 | 命中 0 次';
			//document.getElementById('card-header-title').textContent = '📊 实时路纸';
		}

		if (isMemory) {
			// ===== 记忆库管理页 =====
			// 这里不需要初始化游戏状态，只需要绑定记忆库页面的按钮
			// 如果你的记忆库页面按钮是用 onclick 写在 HTML 里的，这里可以空着
			// 如果有需要动态绑定的逻辑，放在这里
		}

		// 如果是其他页面（比如 fapai.html），什么都不做，只依赖 HTML 里已有的逻辑
	}

}

window.addEventListener('DOMContentLoaded', init);

