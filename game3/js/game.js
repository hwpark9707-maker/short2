(() => {
  "use strict";

  const COLORS = ["red", "blue", "yellow", "green"];
  const COLOR_KO = { red: "빨강", blue: "파랑", yellow: "노랑", green: "초록" };
  const NAMES = ["나", "지우", "민수", "하은"];
  const HAND_SIZE = 7;
  const AI_DELAY = 900;
  const TURN_MS = 20000;
  const ONECARD_MS = 5000;

  /**
   * @typedef {{
   *   id: string,
   *   color: string|null,
   *   kind: 'number'|'reverse'|'jump'|'change'|'shield'|'attack',
   *   value?: number
   * }} Card
   */

  const state = {
    deck: /** @type {Card[]} */ ([]),
    discard: /** @type {Card[]} */ ([]),
    hands: /** @type {Card[][]} */ ([[], [], [], []]),
    current: 0,
    direction: 1,
    attackStack: 0,
    attackNeed: 0,
    forcedColor: /** @type {string|null} */ (null),
    freePlay: false,
    phase: "idle",
    drawnThisTurn: false,
    calledOneCard: /** @type {boolean[]} */ ([false, false, false, false]),
    finishOrder: /** @type {number[]} */ ([]),
    /** @type {{ player: number, endsAt: number } | null} */
    oneCardChallenge: null,
  };

  /** Bumps whenever a turn ends / game resets — invalidates stale timeouts */
  let actionSeq = 0;
  /** @type {number[]} */
  let pendingTimeouts = [];

  /** @type {{ player: number, endsAt: number, kind: 'turn'|'onecard' } | null} */
  let activeTimer = null;
  let timerRaf = 0;
  let aiTimeoutId = 0;
  let oneCardAiTimeoutId = 0;
  let extraCardSeq = 0;

  const $ = (sel) => document.querySelector(sel);
  const startScreen = $("#start-screen");
  const gameScreen = $("#game-screen");
  const rulesModal = $("#rules-modal");
  const colorModal = $("#color-modal");
  const resultModal = $("#result-modal");
  const toastEl = $("#toast");
  const turnSpotlight = $("#turn-spotlight");
  const turnName = $("#turn-name");
  const attackBadge = $("#attack-badge");
  const directionEl = $("#direction-indicator");
  const deckCount = $("#deck-count");
  const discardPile = $("#discard-pile");
  const colorIndicator = $("#color-indicator");
  const drawPile = $("#draw-pile");
  const btnDraw = $("#btn-draw");
  const btnPass = $("#btn-pass");
  const btnOnecard = $("#btn-onecard");

  function schedule(fn, delay) {
    const seq = actionSeq;
    const id = window.setTimeout(() => {
      pendingTimeouts = pendingTimeouts.filter((t) => t !== id);
      if (seq !== actionSeq) return;
      if (state.phase === "gameover") return;
      try {
        fn();
      } catch (err) {
        console.error(err);
        // Never leave the game stuck after an unexpected error
        recoverTurn();
      }
    }, delay);
    pendingTimeouts.push(id);
    return id;
  }

  function clearAllPending() {
    actionSeq += 1;
    for (const id of pendingTimeouts) clearTimeout(id);
    pendingTimeouts = [];
    if (aiTimeoutId) {
      clearTimeout(aiTimeoutId);
      aiTimeoutId = 0;
    }
    if (oneCardAiTimeoutId) {
      clearTimeout(oneCardAiTimeoutId);
      oneCardAiTimeoutId = 0;
    }
  }

  /** Last-resort: keep the match moving */
  function recoverTurn() {
    if (state.phase === "gameover") return;
    if (state.phase === "awaitingColor") {
      colorModal.classList.add("hidden");
      state.phase = "playing";
      state.forcedColor =
        state.forcedColor || COLORS[Math.floor(Math.random() * 4)];
    }
    enablePlayerInput(false);
    forceAdvance(200);
  }

  function createDeck() {
    /** @type {Card[]} */
    const cards = [];
    let n = 0;
    const id = () => `c${n++}`;

    for (const color of COLORS) {
      for (let v = 1; v <= 10; v++) {
        cards.push({ id: id(), color, kind: "number", value: v });
      }
      cards.push({ id: id(), color, kind: "reverse" });
      cards.push({ id: id(), color, kind: "jump" });
      for (let a = 1; a <= 3; a++) {
        cards.push({ id: id(), color, kind: "attack", value: a });
      }
    }
    for (let i = 0; i < 4; i++) {
      cards.push({ id: id(), color: null, kind: "change" });
    }
    cards.push({ id: id(), color: null, kind: "shield" });

    return shuffle(cards);
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function topCard() {
    return state.discard[state.discard.length - 1];
  }

  function effectiveColor() {
    return state.forcedColor || topCard()?.color || null;
  }

  function isUnderAttack() {
    return state.attackStack > 0;
  }

  function canDefendWith(card) {
    if (card.kind === "shield") return true;
    if (card.kind === "attack" && (card.value || 0) >= state.attackNeed) return true;
    return false;
  }

  function canPlay(card) {
    if (isUnderAttack()) return canDefendWith(card);
    if (state.freePlay) return true;
    if (card.kind === "change" || card.kind === "shield") return true;

    const top = topCard();
    if (!top) return true;

    const color = effectiveColor();
    if (card.color && color && card.color === color) return true;
    if (card.kind === "number" && top.kind === "number" && card.value === top.value) {
      return true;
    }
    return false;
  }

  function playableCards(hand) {
    return hand.filter(canPlay);
  }

  function reshuffleDiscard() {
    if (state.discard.length <= 1) return false;
    const top = state.discard.pop();
    state.deck = shuffle([...state.deck, ...state.discard]);
    state.discard = [top];
    showToast("버린 패를 다시 섞었습니다");
    return true;
  }

  function emergencyRefill(need) {
    if (need <= 0) return;
    const extras = [];
    while (extras.length < need) {
      for (const color of COLORS) {
        for (let v = 1; v <= 10 && extras.length < need; v++) {
          extras.push({
            id: `e${extraCardSeq++}`,
            color,
            kind: "number",
            value: v,
          });
        }
      }
    }
    state.deck = shuffle([...state.deck, ...extras]);
  }

  function ensureDeck(count) {
    if (count <= 0) return;
    if (state.deck.length >= count) return;
    reshuffleDiscard();
    if (state.deck.length >= count) return;
    emergencyRefill(count - state.deck.length);
  }

  function drawFromDeck(n = 1) {
    ensureDeck(n);
    const drawn = [];
    for (let i = 0; i < n; i++) {
      if (state.deck.length === 0) {
        reshuffleDiscard();
        if (state.deck.length === 0) ensureDeck(n - drawn.length);
      }
      if (state.deck.length === 0) break;
      drawn.push(state.deck.pop());
    }
    return drawn;
  }

  function forceAdvance(delay = 500) {
    activeTimer = null;
    schedule(() => advanceTurn(), delay);
  }

  // ——— Timers ———
  function clearTurnTimer() {
    activeTimer = null;
    if (aiTimeoutId) {
      clearTimeout(aiTimeoutId);
      aiTimeoutId = 0;
    }
    hideAllTimerBars();
  }

  function hideAllTimerBars() {
    for (let p = 0; p < 4; p++) {
      const bar = $(`#timer-${p}`);
      if (!bar) continue;
      if (state.oneCardChallenge && state.oneCardChallenge.player === p) continue;
      bar.classList.add("hidden");
      bar.classList.remove("urgent", "critical", "onecard-mode");
      const fill = bar.querySelector(".timer-bar-fill");
      if (fill) fill.style.transform = "scaleX(1)";
    }
  }

  function startTurnTimer(player) {
    activeTimer = null;
    if (aiTimeoutId) {
      clearTimeout(aiTimeoutId);
      aiTimeoutId = 0;
    }
    hideAllTimerBars();
    if (state.oneCardChallenge) updateOneCardBar();

    activeTimer = {
      player,
      endsAt: performance.now() + TURN_MS,
      kind: "turn",
    };
    if (!timerRaf) tickTimers();
  }

  function tickTimers() {
    timerRaf = requestAnimationFrame(tickTimers);
    const now = performance.now();

    if (activeTimer && activeTimer.kind === "turn") {
      const { player, endsAt } = activeTimer;
      const left = endsAt - now;
      paintTimerBar(player, Math.max(0, left / TURN_MS), false);

      if (left <= 0) {
        activeTimer = null;
        try {
          onTurnTimeout(player);
        } catch (err) {
          console.error(err);
          recoverTurn();
        }
      }
    }

    if (state.oneCardChallenge) {
      const challenge = state.oneCardChallenge;
      const left = challenge.endsAt - now;
      paintTimerBar(challenge.player, Math.max(0, left / ONECARD_MS), true);

      if (left <= 0) {
        // Clear first so this cannot re-fire every frame
        const p = challenge.player;
        state.oneCardChallenge = null;
        try {
          applyOneCardFail(p);
        } catch (err) {
          console.error(err);
        }
      }
    }
  }

  function paintTimerBar(player, ratio, isOnecard) {
    const bar = $(`#timer-${player}`);
    if (!bar) return;
    bar.classList.remove("hidden");
    bar.classList.toggle("onecard-mode", isOnecard);
    bar.classList.toggle("urgent", !isOnecard && ratio <= 0.35 && ratio > 0.15);
    bar.classList.toggle("critical", ratio <= 0.15);
    const fill = bar.querySelector(".timer-bar-fill");
    if (fill) fill.style.transform = `scaleX(${ratio})`;
  }

  function updateOneCardBar() {
    if (!state.oneCardChallenge) return;
    const { player, endsAt } = state.oneCardChallenge;
    paintTimerBar(player, Math.max(0, (endsAt - performance.now()) / ONECARD_MS), true);
  }

  function onTurnTimeout(player) {
    if (state.phase === "gameover") return;
    if (state.current !== player) return;

    if (state.phase === "awaitingColor") {
      colorModal.classList.add("hidden");
      state.phase = "playing";
      state.forcedColor =
        state.forcedColor || COLORS[Math.floor(Math.random() * 4)];
      showToast(`색 → ${COLOR_KO[state.forcedColor]}`);
    }

    enablePlayerInput(false);
    btnPass.classList.add("hidden");

    if (isUnderAttack()) {
      showToast("시간 초과!");
      resolveAttackDraw(player);
      return;
    }

    const cards = drawFromDeck(1);
    state.hands[player].push(...cards);
    if (state.hands[player].length !== 1) {
      state.calledOneCard[player] = false;
      if (state.oneCardChallenge?.player === player) clearOneCardChallenge();
    }

    showToast(`${NAMES[player]} 시간 초과 +${cards.length || 0}`);
    flashStatus(player, cards.length ? `+${cards.length}` : "패스");
    renderAll();
    forceAdvance(600);
  }

  // ——— One Card ———
  function clearOneCardChallenge() {
    if (oneCardAiTimeoutId) {
      clearTimeout(oneCardAiTimeoutId);
      oneCardAiTimeoutId = 0;
    }
    const prev = state.oneCardChallenge?.player;
    state.oneCardChallenge = null;
    btnOnecard.classList.add("hidden");
    btnOnecard.disabled = true;
    if (prev != null) {
      const bar = $(`#timer-${prev}`);
      if (bar && (!activeTimer || activeTimer.player !== prev)) {
        bar.classList.add("hidden");
        bar.classList.remove("onecard-mode", "urgent", "critical");
      }
    }
  }

  function startOneCardChallenge(player) {
    if (state.hands[player].length !== 1) return;
    if (state.calledOneCard[player]) return;
    if (state.oneCardChallenge?.player === player) return;

    if (state.oneCardChallenge && state.oneCardChallenge.player !== player) {
      const prev = state.oneCardChallenge.player;
      state.oneCardChallenge = null;
      applyOneCardFail(prev);
    }

    state.oneCardChallenge = { player, endsAt: performance.now() + ONECARD_MS };
    flashStatus(player, "원카드?");
    showToast(`${NAMES[player]} 원카드 외치기!`, true);

    if (player === 0) {
      btnOnecard.classList.remove("hidden");
      btnOnecard.disabled = false;
    } else {
      btnOnecard.classList.add("hidden");
      const delay = 400 + Math.random() * 1800;
      const seq = actionSeq;
      oneCardAiTimeoutId = window.setTimeout(() => {
        oneCardAiTimeoutId = 0;
        if (seq !== actionSeq) return;
        if (state.oneCardChallenge?.player === player) {
          succeedOneCard(player);
        }
      }, delay);
    }

    if (!timerRaf) tickTimers();
    else updateOneCardBar();
    renderAll();
  }

  function succeedOneCard(player) {
    if (!state.oneCardChallenge || state.oneCardChallenge.player !== player) return;
    state.calledOneCard[player] = true;
    clearOneCardChallenge();
    showToast(`${NAMES[player]} 원카드!`, true);
    flashStatus(player, "원카드!");
    renderAll();
  }

  function applyOneCardFail(player) {
    clearOneCardChallenge();
    state.calledOneCard[player] = false;
    const cards = drawFromDeck(2);
    state.hands[player].push(...cards);
    showToast(`${NAMES[player]} 원카드 실패 +2`);
    flashStatus(player, "+2");
    renderAll();
  }

  function failOneCard(player) {
    if (!state.oneCardChallenge || state.oneCardChallenge.player !== player) return;
    state.oneCardChallenge = null;
    applyOneCardFail(player);
  }

  function playerCallOneCard() {
    if (!state.oneCardChallenge || state.oneCardChallenge.player !== 0) return;
    succeedOneCard(0);
  }

  // ——— Game flow ———
  function startGame() {
    clearAllPending();
    clearTurnTimer();
    clearOneCardChallenge();
    if (timerRaf) {
      cancelAnimationFrame(timerRaf);
      timerRaf = 0;
    }

    state.deck = createDeck();
    state.discard = [];
    state.hands = [[], [], [], []];
    state.current = 0;
    state.direction = 1;
    state.attackStack = 0;
    state.attackNeed = 0;
    state.forcedColor = null;
    state.freePlay = false;
    state.phase = "playing";
    state.drawnThisTurn = false;
    state.calledOneCard = [false, false, false, false];
    state.finishOrder = [];
    state.oneCardChallenge = null;

    for (let p = 0; p < 4; p++) {
      state.hands[p] = drawFromDeck(HAND_SIZE);
    }

    let starterIdx = state.deck.findIndex((c) => c.kind === "number");
    if (starterIdx < 0) starterIdx = state.deck.length - 1;
    const starter = state.deck.splice(starterIdx, 1)[0];
    state.discard.push(starter);
    state.forcedColor = starter.color;

    startScreen.classList.remove("active");
    gameScreen.classList.add("active");
    resultModal.classList.add("hidden");
    colorModal.classList.add("hidden");
    renderAll();
    beginTurn();
  }

  function beginTurn() {
    if (state.phase === "gameover") return;
    if (state.phase === "awaitingColor") {
      // Should not start a new turn while choosing a color
      return;
    }
    state.phase = "playing";
    state.drawnThisTurn = false;

    const hand = state.hands[state.current];
    const playable = playableCards(hand);

    if (isUnderAttack() && playable.length === 0) {
      clearTurnTimer();
      resolveAttackDraw(state.current);
      return;
    }

    renderAll();
    startTurnTimer(state.current);

    if (state.current === 0) {
      enablePlayerInput(true);
      // No playable card → player must draw (button enabled). Timer still runs.
    } else {
      enablePlayerInput(false);
      const seq = actionSeq;
      aiTimeoutId = window.setTimeout(() => {
        aiTimeoutId = 0;
        if (seq !== actionSeq) return;
        aiTurn();
      }, AI_DELAY);
    }
  }

  function resolveAttackDraw(player) {
    clearTurnTimer();
    const n = state.attackStack;
    if (n <= 0) {
      forceAdvance(300);
      return;
    }

    const cards = drawFromDeck(n);
    state.hands[player].push(...cards);
    state.attackStack = 0;
    state.attackNeed = 0;
    state.calledOneCard[player] = false;
    if (state.oneCardChallenge?.player === player) clearOneCardChallenge();

    showToast(`${NAMES[player]} 방어 실패 +${cards.length}장`);
    flashStatus(player, `+${cards.length}`);
    renderAll();
    forceAdvance(700);
  }

  function tryPlayCard(player, cardId) {
    if (state.phase !== "playing" || state.current !== player) return false;
    const hand = state.hands[player];
    const idx = hand.findIndex((c) => c.id === cardId);
    if (idx < 0) return false;
    const card = hand[idx];
    if (!canPlay(card)) return false;

    clearTurnTimer();

    hand.splice(idx, 1);
    state.discard.push(card);
    state.drawnThisTurn = false;
    btnPass.classList.add("hidden");
    state.freePlay = false;

    if (hand.length !== 1) {
      state.calledOneCard[player] = false;
      if (state.oneCardChallenge?.player === player) clearOneCardChallenge();
    }

    if (card.kind === "shield") {
      state.attackStack = 0;
      state.attackNeed = 0;
      state.freePlay = true;
      showToast("방패! 공격 무효");
      flashStatus(player, "방패");
      afterPlay(player, hand, null);
      return true;
    }

    if (card.kind === "attack") {
      state.attackStack += card.value || 0;
      state.attackNeed = card.value || 0;
      state.forcedColor = card.color;
      showToast(`공격 +${state.attackStack}`);
    } else if (card.color) {
      state.forcedColor = card.color;
    }

    if (hand.length === 0) {
      endGameWithWinner(player);
      return true;
    }

    if (card.kind === "change") {
      if (hand.length === 1) startOneCardChallenge(player);
      if (player === 0) {
        state.phase = "awaitingColor";
        renderAll();
        colorModal.classList.remove("hidden");
        enablePlayerInput(false);
        startTurnTimer(0);
        return true;
      }
      finishChange(aiChooseColor(player), card);
      return true;
    }

    afterPlay(player, hand, card);
    return true;
  }

  function afterPlay(player, hand, card) {
    if (hand.length === 1) startOneCardChallenge(player);
    if (hand.length === 0) {
      endGameWithWinner(player);
      return;
    }
    renderAll();
    schedule(() => advanceTurn(card), 500);
  }

  function finishChange(color, card = { kind: "change" }) {
    if (!COLORS.includes(color)) {
      color = COLORS[0];
    }
    clearTurnTimer();
    state.forcedColor = color;
    state.phase = "playing";
    colorModal.classList.add("hidden");
    showToast(`색 → ${COLOR_KO[color]}`);
    const hand = state.hands[state.current];
    if (hand.length === 1) startOneCardChallenge(state.current);
    renderAll();
    schedule(() => advanceTurn(card), 450);
  }

  function advanceTurn(lastCard) {
    if (state.phase === "gameover") return;
    if (state.phase === "awaitingColor") {
      // Color must be chosen before advancing
      return;
    }
    clearTurnTimer();

    let steps = 1;
    if (lastCard) {
      if (lastCard.kind === "reverse") {
        state.direction *= -1;
        showToast(state.direction === 1 ? "시계 방향" : "반시계 방향");
      }
      if (lastCard.kind === "jump") {
        steps = 2;
        const skipped = nextPlayerIndex(1);
        flashStatus(skipped, "건너뜀");
        showToast(`${NAMES[skipped]} 건너뛰기`);
      }
    }

    state.current = nextPlayerIndex(steps);
    beginTurn();
  }

  function nextPlayerIndex(steps = 1) {
    let i = state.current;
    for (let s = 0; s < steps; s++) {
      i = (i + state.direction + 4) % 4;
    }
    return i;
  }

  function endGameWithWinner(winner) {
    if (state.phase === "gameover") return;
    clearAllPending();
    clearTurnTimer();
    clearOneCardChallenge();
    if (timerRaf) {
      cancelAnimationFrame(timerRaf);
      timerRaf = 0;
    }
    hideAllTimerBars();
    enablePlayerInput(false);
    colorModal.classList.add("hidden");

    const others = [0, 1, 2, 3]
      .filter((p) => p !== winner)
      .sort((a, b) => {
        const diff = state.hands[a].length - state.hands[b].length;
        if (diff !== 0) return diff;
        return a - b;
      });
    state.finishOrder = [winner, ...others];
    state.phase = "gameover";

    showToast(`${NAMES[winner]} 1등!`, true);
    flashStatus(winner, "1등");
    renderAll();
    schedule(() => showFinalRanking(), 700);
  }

  function playerDraw() {
    if (state.current !== 0 || state.phase !== "playing") return;
    if (state.drawnThisTurn) return;

    if (isUnderAttack()) {
      resolveAttackDraw(0);
      return;
    }

    const [card] = drawFromDeck(1);
    if (!card) {
      showToast("더 이상 뽑을 카드가 없습니다");
      forceAdvance(600);
      return;
    }
    state.hands[0].push(card);
    state.drawnThisTurn = true;
    state.calledOneCard[0] = false;
    if (state.oneCardChallenge?.player === 0) clearOneCardChallenge();

    if (canPlay(card)) {
      renderAll();
      enablePlayerInput(true);
      btnPass.classList.remove("hidden");
      btnPass.disabled = false;
      btnDraw.disabled = true;
      showToast("내거나 패스하세요");
      return;
    }

    clearTurnTimer();
    showToast("카드 받음");
    renderAll();
    forceAdvance(600);
  }

  function playerPass() {
    if (state.current !== 0 || !state.drawnThisTurn) return;
    if (state.phase !== "playing") return;
    clearTurnTimer();
    btnPass.classList.add("hidden");
    advanceTurn();
  }

  function showFinalRanking() {
    clearTurnTimer();
    clearOneCardChallenge();
    if (timerRaf) {
      cancelAnimationFrame(timerRaf);
      timerRaf = 0;
    }
    hideAllTimerBars();
    state.phase = "gameover";
    enablePlayerInput(false);
    renderAll();

    const title = $("#result-title");
    const sub = $("#result-sub");
    const list = $("#result-ranking");
    if (!list) return;

    title.textContent = "최종 순위";
    list.innerHTML = "";

    state.finishOrder.forEach((p, i) => {
      const li = document.createElement("li");
      if (p === 0) li.classList.add("you-rank");
      const cardsLeft = state.hands[p].length;
      const extra = i === 0 ? " · 완주" : ` · 남은 카드 ${cardsLeft}장`;
      li.innerHTML = `<span class="place p${i + 1}">${i + 1}등</span><span>${NAMES[p]}${extra}</span>`;
      list.appendChild(li);
    });

    if (state.finishOrder[0] === 0) {
      sub.textContent = "1등을 차지했습니다!";
    } else {
      const myPlace = state.finishOrder.indexOf(0) + 1;
      sub.textContent = myPlace > 0 ? `${myPlace}위로 마무리했습니다.` : "";
    }
    resultModal.classList.remove("hidden");
  }

  // ——— AI ———
  function aiTurn() {
    if (state.phase !== "playing" || state.current === 0) {
      // Invalid AI call — recover instead of hanging
      if (state.phase === "playing" && state.current === 0) return;
      if (state.phase !== "gameover") recoverTurn();
      return;
    }

    const p = state.current;
    const hand = state.hands[p];
    const playable = playableCards(hand);

    if (isUnderAttack()) {
      if (playable.length === 0) {
        resolveAttackDraw(p);
        return;
      }
      const shield = playable.find((c) => c.kind === "shield");
      if (shield && state.attackStack >= 4) {
        if (!tryPlayCard(p, shield.id)) recoverTurn();
        return;
      }
      const attacks = playable
        .filter((c) => c.kind === "attack")
        .sort((a, b) => (b.value || 0) - (a.value || 0));
      const choice = attacks[0] || shield || playable[0];
      if (!tryPlayCard(p, choice.id)) recoverTurn();
      return;
    }

    if (playable.length === 0) {
      const [card] = drawFromDeck(1);
      if (card) {
        hand.push(card);
        state.calledOneCard[p] = false;
        if (state.oneCardChallenge?.player === p) clearOneCardChallenge();
        showToast(`${NAMES[p]} 카드 받음`);
        if (canPlay(card)) {
          renderAll();
          schedule(() => {
            if (state.current !== p || state.phase !== "playing") {
              recoverTurn();
              return;
            }
            if (!tryPlayCard(p, card.id)) forceAdvance(200);
          }, 500);
          return;
        }
      } else {
        showToast("더 이상 뽑을 카드가 없습니다");
      }
      renderAll();
      forceAdvance(500);
      return;
    }

    const scored = playable.map((c) => ({ c, score: aiScore(c, hand) }));
    scored.sort((a, b) => b.score - a.score);
    if (!tryPlayCard(p, scored[0].c.id)) recoverTurn();
  }

  function aiScore(card, hand) {
    let s = 0;
    if (hand.length <= 2) s += 8;
    if (card.kind === "jump") s += 5;
    if (card.kind === "reverse") s += 3;
    if (card.kind === "change") s += 4;
    if (card.kind === "attack") s += hand.length <= 3 ? 7 : 1;
    if (card.kind === "shield") s -= 5;
    if (card.kind === "number") {
      s += hand.filter((h) => h.color === card.color).length;
    }
    return s;
  }

  function aiChooseColor(player) {
    const hand = state.hands[player];
    const counts = { red: 0, blue: 0, yellow: 0, green: 0 };
    for (const c of hand) {
      if (c.color) counts[c.color]++;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }

  // ——— Render ———
  function renderAll() {
    for (let p = 0; p < 4; p++) {
      const countEl = $(`#count-${p}`);
      if (countEl) countEl.textContent = String(state.hands[p].length);
      const seat = document.querySelector(`.seat[data-player="${p}"]`);
      if (!seat) continue;
      seat.classList.toggle(
        "active-turn",
        state.current === p && state.phase !== "gameover"
      );
      seat.classList.remove("finished");
      const tag = seat.querySelector(".seat-turn-tag");
      if (tag) tag.textContent = p === 0 ? "내 차례" : "차례";
    }

    renderAiHand(1);
    renderAiHand(2);
    renderAiHand(3);
    renderPlayerHand();
    renderDiscard();
    renderHud();
    updateOneCardButton();
  }

  function updateOneCardButton() {
    const need =
      state.oneCardChallenge?.player === 0 &&
      state.hands[0].length === 1 &&
      !state.calledOneCard[0];
    btnOnecard.classList.toggle("hidden", !need);
    btnOnecard.disabled = !need;
  }

  function renderAiHand(p) {
    const el = $(`#hand-${p}`);
    if (!el) return;
    const n = state.hands[p].length;
    const show = Math.min(n, 12);
    el.innerHTML = "";
    for (let i = 0; i < show; i++) {
      const d = document.createElement("div");
      d.className = "card-back";
      el.appendChild(d);
    }
  }

  function renderPlayerHand() {
    const el = $("#hand-0");
    if (!el) return;
    el.innerHTML = "";
    const hand = state.hands[0];
    const isMyTurn = state.current === 0 && state.phase === "playing";

    hand.forEach((card) => {
      const node = createCardEl(card);
      if (isMyTurn) {
        if (canPlay(card)) {
          node.classList.add("playable");
          node.addEventListener("click", () => {
            enablePlayerInput(false);
            if (!tryPlayCard(0, card.id)) {
              enablePlayerInput(true);
            }
          });
        } else {
          node.classList.add("disabled");
        }
      }
      el.appendChild(node);
    });
  }

  function createCardEl(card) {
    const el = document.createElement("div");
    el.className = `card fly-in kind-${card.kind}`;
    el.dataset.id = card.id;

    if (card.color) el.classList.add(`c-${card.color}`);
    else if (card.kind === "shield") el.classList.add("kind-shield");
    else el.classList.add("c-wild");

    if (card.kind === "number") {
      el.innerHTML = `<span class="card-num">${card.value}</span>`;
    } else if (card.kind === "attack") {
      el.innerHTML = `
        <span class="card-num">+${card.value}</span>
        <span class="card-label">공격</span>
      `;
    } else if (card.kind === "reverse") {
      el.innerHTML = `
        <span class="card-icon">↺</span>
        <span class="card-label">리버스</span>
      `;
    } else if (card.kind === "jump") {
      el.innerHTML = `
        <span class="card-icon">↠</span>
        <span class="card-label">점프</span>
      `;
    } else if (card.kind === "change") {
      el.innerHTML = `
        <span class="card-icon">✦</span>
        <span class="card-label">체인지</span>
      `;
    } else if (card.kind === "shield") {
      el.innerHTML = `
        <span class="card-icon">🛡</span>
        <span class="card-label">방패</span>
      `;
    }

    return el;
  }

  function renderDiscard() {
    discardPile.innerHTML = "";
    const top = topCard();
    if (top) discardPile.appendChild(createCardEl(top));
    deckCount.textContent = String(state.deck.length);

    const col = effectiveColor();
    if (col) {
      colorIndicator.classList.remove("hidden", "c-red", "c-blue", "c-yellow", "c-green");
      colorIndicator.classList.add(`c-${col}`);
    } else {
      colorIndicator.classList.add("hidden");
    }
  }

  function renderHud() {
    const name = NAMES[state.current];
    turnName.textContent = state.phase === "gameover" ? "종료" : name;
    turnSpotlight.classList.toggle(
      "yours",
      state.current === 0 && state.phase === "playing"
    );

    directionEl.classList.toggle("reversed", state.direction === -1);
    directionEl.textContent = state.direction === 1 ? "↻" : "↺";

    if (state.attackStack > 0) {
      attackBadge.classList.remove("hidden");
      attackBadge.textContent = `공격 +${state.attackStack} (≥${state.attackNeed})`;
    } else {
      attackBadge.classList.add("hidden");
    }
  }

  function enablePlayerInput(on) {
    const myTurn = on && state.current === 0 && state.phase === "playing";
    btnDraw.disabled = !myTurn || state.drawnThisTurn;
    if (!state.drawnThisTurn) btnPass.classList.add("hidden");
    drawPile.classList.toggle("clickable", myTurn && !state.drawnThisTurn);

    if (myTurn && isUnderAttack()) {
      btnDraw.textContent = `공격 받기 (+${state.attackStack})`;
    } else {
      btnDraw.textContent = "카드 받기";
    }
  }

  let toastTimer = null;
  function showToast(msg, onecard = false) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden", "onecard");
    if (onecard) toastEl.classList.add("onecard");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.add("hidden");
      toastEl.classList.remove("onecard");
    }, onecard ? 1600 : 1200);
  }

  function flashStatus(player, text) {
    const el = $(`#status-${player}`);
    if (!el) return;
    el.textContent = text;
    setTimeout(() => {
      if (el.textContent === text) el.textContent = "";
    }, 1400);
  }

  // ——— Events ———
  $("#btn-start").addEventListener("click", startGame);
  $("#btn-again").addEventListener("click", startGame);
  $("#btn-restart").addEventListener("click", startGame);
  $("#btn-rules").addEventListener("click", () => rulesModal.classList.remove("hidden"));
  $("#btn-close-rules").addEventListener("click", () => rulesModal.classList.add("hidden"));
  rulesModal.addEventListener("click", (e) => {
    if (e.target === rulesModal) rulesModal.classList.add("hidden");
  });

  btnDraw.addEventListener("click", playerDraw);
  drawPile.addEventListener("click", () => {
    if (!btnDraw.disabled) playerDraw();
  });
  btnPass.addEventListener("click", playerPass);
  btnOnecard.addEventListener("click", playerCallOneCard);

  document.querySelectorAll(".color-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.phase !== "awaitingColor") return;
      finishChange(btn.dataset.color);
    });
  });
})();
