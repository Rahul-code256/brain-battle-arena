
import "./style.css";

const API = "/.netlify/functions/game";
const POLL_INTERVAL = 1000;

const state = {
  room: null,
  playerId: null,
  playerName: "",
  selectedAnswer: null,
  submitting: false,
  feedback: "",
  feedbackCorrect: null,
  revealedAnswer: null,
  busy: false,
  error: "",
  pollTimer: null,
  secondsLeft: null
};

const app = document.querySelector("#app");

if (!app) {
  throw new Error('Missing <div id="app"></div> in index.html');
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function initials(name) {
  return String(name || "?").slice(0, 1).toUpperCase();
}

function isHost() {
  return Boolean(state.room && state.playerId === state.room.hostId);
}

function currentPlayer() {
  return state.room?.players?.find((p) => p.id === state.playerId);
}

function formatScore(score) {
  return Number(score || 0).toLocaleString();
}

async function apiGet(params) {
  const url = new URL(API, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

async function apiPost(payload) {
  const response = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function showError(message) {
  state.error = message;
  render();
}

function clearPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

function startPolling() {
  clearPolling();

  state.pollTimer = setInterval(async () => {
    if (!state.room || state.busy) return;

    try {
      const data = await apiGet({
        action: "get",
        code: state.room.code
      });

      const oldIndex = state.room.questionIndex;
      const oldStatus = state.room.status;

      state.room = data.room;

      if (
        oldIndex !== state.room.questionIndex ||
        oldStatus !== state.room.status
      ) {
        state.selectedAnswer = null;
        state.feedback = "";
        state.feedbackCorrect = null;
        state.revealedAnswer = null;
      }

      if (state.room.status === "finished") {
        clearPolling();
      }

      render();
    } catch (error) {
      // Keep the current screen if a temporary poll fails.
      console.warn("Room refresh failed:", error.message);
    }
  }, POLL_INTERVAL);
}

function setRoom(data, name) {
  state.room = data.room;
  state.playerId = data.playerId;
  state.playerName = name;
  state.selectedAnswer = null;
  state.feedback = "";
  state.feedbackCorrect = null;
  state.error = "";

  startPolling();
  render();
}

function renderHeader() {
  return `
    <header class="topbar">
      <a class="brand" href="#" id="brand-home" aria-label="Brain Battle Arena home">
        <span class="brand-mark">⚡</span>
        <span>BRAIN<span class="brand-accent">BATTLE</span></span>
      </a>
      <div class="online-pill"><span class="pulse-dot"></span> ARENA ONLINE</div>
    </header>
  `;
}

function renderHome() {
  return `
    <main class="hero">
      <div class="hero-glow"></div>
      <div class="eyebrow"><span class="pulse-dot"></span> THE ULTIMATE CODING SHOWDOWN</div>
      <h1>Think fast.<br><span class="gradient-text">Code faster.</span></h1>
      <p class="hero-copy">
        Challenge your friends in a real-time coding quiz.
        15 questions. 15 seconds each. One arena champion.
      </p>

      <div class="home-grid">
        <section class="panel">
          <div class="panel-icon purple">✦</div>
          <h2>Create a room</h2>
          <p>Host a battle and invite your friends with a room code.</p>
          <form id="create-form">
            <label for="host-name">Your player name</label>
            <input id="host-name" name="name" maxlength="20"
              placeholder="Enter your name" autocomplete="nickname" required />
            <button class="btn btn-primary" type="submit">Create room <span>→</span></button>
          </form>
        </section>

        <section class="panel">
          <div class="panel-icon cyan">⌁</div>
          <h2>Join a room</h2>
          <p>Got a code? Jump straight into the competition.</p>
          <form id="join-form">
            <label for="join-name">Your player name</label>
            <input id="join-name" name="name" maxlength="20"
              placeholder="Enter your name" autocomplete="nickname" required />
            <label for="room-code">Room code</label>
            <input id="room-code" name="code" maxlength="6"
              placeholder="e.g. DWS3U5" class="code-input" required />
            <button class="btn btn-secondary" type="submit">Join battle <span>→</span></button>
          </form>
        </section>
      </div>

      <div class="feature-strip">
        <div><strong>15</strong><span>Questions</span></div>
        <div><strong>15s</strong><span>Per question</span></div>
        <div><strong>8</strong><span>Players max</span></div>
        <div><strong>1</strong><span>Arena champion</span></div>
      </div>
      ${state.error ? `<p class="error-message">${escapeHtml(state.error)}</p>` : ""}
    </main>
  `;
}

function renderPlayerList() {
  const players = state.room?.players || [];

  return `
    <div class="player-list">
      ${players.map((player, index) => `
        <div class="player-row">
          <div class="avatar ${index % 2 ? "avatar-cyan" : "avatar-purple"}">
            ${escapeHtml(initials(player.name))}
          </div>
          <div class="player-details">
            <strong>${escapeHtml(player.name)}
              ${player.id === state.room.hostId ? '<span class="host-tag">HOST</span>' : ""}
              ${player.id === state.playerId ? '<span class="you-tag">YOU</span>' : ""}
            </strong>
            <span>${player.id === state.room.hostId ? "Room host" : "Challenger"}</span>
          </div>
          <div class="player-score">${formatScore(player.score)} <small>PTS</small></div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderLobby() {
  const room = state.room;
  const canStart = isHost() && room.players.length >= 2;

  return `
    <main class="game-shell">
      <div class="eyebrow">MULTIPLAYER LOBBY</div>
      <section class="panel lobby-panel">
        <div class="lobby-heading">
          <div>
            <h1>Battle <span class="gradient-text">lobby</span></h1>
            <p>Share your room code with your opponents.</p>
          </div>
          <span class="status-tag"><span class="pulse-dot"></span> WAITING</span>
        </div>

        <div class="room-code-box">
          <span>YOUR ROOM CODE</span>
          <strong>${escapeHtml(room.code)}</strong>
          <button id="copy-code" class="btn btn-small btn-secondary" type="button">Copy code</button>
        </div>

        <div class="section-heading">
          <h2>Players in arena</h2>
          <span class="count-tag">${room.players.length}/8</span>
        </div>

        ${renderPlayerList()}

        <div class="lobby-actions">
          ${isHost()
            ? `<button class="btn btn-primary" id="start-game" ${canStart ? "" : "disabled"}>
                 ${canStart ? "Start battle →" : "Waiting for another player..."}
               </button>`
            : `<p class="muted center">Waiting for the host to start the battle…</p>`
          }
        </div>

        <p class="muted center">At least 2 players are needed. Up to 8 can join.</p>
        ${state.error ? `<p class="error-message">${escapeHtml(state.error)}</p>` : ""}
      </section>
    </main>
  `;
}

function renderQuestion() {
  const room = state.room;
  const question = room.question;
  const player = currentPlayer();

  if (!question) {
    return `
      <main class="game-shell">
        <section class="panel">
          <h2>Loading question…</h2>
          <p class="muted">Waiting for the game state to update.</p>
        </section>
      </main>
    `;
  }

  const options = question.options || [];
  const alreadyAnswered = Boolean(player?.answered) || state.submitting;
  const timeLeft = room.timeLeft ?? state.secondsLeft ?? question.timeLimit;
  const letters = ["A", "B", "C", "D"];

  return `
    <main class="game-shell">
      <div class="game-topline">
        <div>
          <div class="eyebrow">ROUND ${Math.floor((question.number - 1) / 5) + 1} / 3</div>
          <h1>Question <span class="gradient-text">${question.number}</span><span class="muted">/${question.total}</span></h1>
        </div>
        <div class="timer-badge ${timeLeft <= 5 ? "timer-danger" : ""}">
          <span>◷</span> <strong id="timer-value">${timeLeft}</strong><small>SEC</small>
        </div>
      </div>

      <div class="progress-track">
        <div class="progress-fill" style="width:${Math.max(0, Math.min(100, question.number / question.total * 100))}%"></div>
      </div>

      <section class="panel question-panel">
        <div class="question-meta"><span class="status-tag">CODING CHALLENGE</span><span>+500 base points</span></div>
        <h2 class="question-text">${escapeHtml(question.q)}</h2>

        <div class="answer-grid">
          ${options.map((option, index) => {
            let classes = "answer-option";
            if (state.selectedAnswer === index) classes += " answer-selected";
            if (state.revealedAnswer === index) classes += " answer-correct";
            if (state.selectedAnswer === index && state.feedbackCorrect === false) classes += " answer-wrong";

            return `
              <button type="button" class="${classes}" data-answer="${index}"
                ${alreadyAnswered || timeLeft <= 0 ? "disabled" : ""}>
                <span class="answer-letter">${letters[index] || index + 1}</span>
                <span>${escapeHtml(option)}</span>
              </button>
            `;
          }).join("")}
        </div>

        ${state.feedback ? `
          <div class="feedback ${state.feedbackCorrect ? "feedback-success" : "feedback-error"}">
            ${escapeHtml(state.feedback)}
          </div>
        ` : ""}

        ${alreadyAnswered ? '<p class="muted center">Answer submitted. Waiting for the next question…</p>' : ""}
        ${timeLeft <= 0 && !alreadyAnswered ? '<p class="error-message">Time is up. Wait for the host to advance.</p>' : ""}
        ${state.error ? `<p class="error-message">${escapeHtml(state.error)}</p>` : ""}
      </section>

      <section class="panel mini-leaderboard">
        <div class="section-heading"><h2>Live leaderboard</h2><span class="count-tag">${room.players.length} players</span></div>
        ${renderPlayerList()}
      </section>

      ${isHost() ? `
        <div class="host-controls">
          <button class="btn btn-secondary" id="next-question" type="button">
            ${question.number === question.total ? "Finish game →" : "Next question →"}
          </button>
          <span class="muted">Host control · advance after everyone answers or time expires</span>
        </div>
      ` : ""}
    </main>
  `;
}

function renderFinished() {
  const players = [...(state.room?.players || [])]
    .sort((a, b) => b.score - a.score);

  return `
    <main class="game-shell">
      <section class="panel finished-panel">
        <div class="eyebrow">BATTLE COMPLETE</div>
        <div class="trophy">🏆</div>
        <h1>ARENA <span class="gradient-text">CHAMPION</span></h1>
        <p class="muted">The final scores are in. Great battle!</p>

        <div class="final-leaderboard">
          ${players.map((player, index) => `
            <div class="final-player ${index === 0 ? "winner-row" : ""}">
              <div class="rank">${index === 0 ? "🏆" : `#${index + 1}`}</div>
              <div class="avatar ${index % 2 ? "avatar-cyan" : "avatar-purple"}">${escapeHtml(initials(player.name))}</div>
              <strong>${escapeHtml(player.name)} ${player.id === state.playerId ? "(You)" : ""}</strong>
              <span class="final-score">${formatScore(player.score)} pts</span>
            </div>
          `).join("")}
        </div>

        <button class="btn btn-primary" id="home-button" type="button">Back to arena →</button>
      </section>
    </main>
  `;
}

function render() {
  if (!state.room) {
    app.innerHTML = renderHeader() + renderHome();
    bindHomeEvents();
    return;
  }

  let screen = "";

  if (state.room.status === "lobby") {
    screen = renderLobby();
  } else if (state.room.status === "playing") {
    screen = renderQuestion();
  } else {
    screen = renderFinished();
  }

  app.innerHTML = renderHeader() + screen;
  bindRoomEvents();
}

function bindHomeEvents() {
  document.querySelector("#brand-home")?.addEventListener("click", (event) => {
    event.preventDefault();
    leaveRoom();
  });

  document.querySelector("#create-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.busy) return;

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    if (!name) return;

    state.busy = true;
    state.error = "";
    render();

    try {
      const data = await apiPost({ action: "create", name });
      setRoom(data, name);
    } catch (error) {
      state.error = error.message;
    } finally {
      state.busy = false;
      render();
    }
  });

  document.querySelector("#join-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.busy) return;

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const code = String(form.get("code") || "").trim().toUpperCase();

    if (!name || !code) return;

    state.busy = true;
    state.error = "";
    render();

    try {
      const data = await apiPost({ action: "join", code, name });
      setRoom(data, name);
    } catch (error) {
      state.error = error.message;
    } finally {
      state.busy = false;
      render();
    }
  });
}

function bindRoomEvents() {
  document.querySelector("#brand-home")?.addEventListener("click", (event) => {
    event.preventDefault();
    if (confirm("Leave this room and return to the home screen?")) {
      leaveRoom();
    }
  });

  document.querySelector("#copy-code")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(state.room.code);
      const button = document.querySelector("#copy-code");
      if (button) button.textContent = "Copied!";
    } catch {
      showError("Copy failed. Select the room code and copy it manually.");
    }
  });

  document.querySelector("#start-game")?.addEventListener("click", async () => {
    await runAction(async () => {
      const data = await apiPost({
        action: "start",
        code: state.room.code,
        playerId: state.playerId
      });

      state.room = data.room;
      state.error = "";
      state.selectedAnswer = null;
      state.feedback = "";
    });
  });

  document.querySelectorAll("[data-answer]").forEach((button) => {
    button.addEventListener("click", async () => {
      const answerIndex = Number(button.getAttribute("data-answer"));
      if (!Number.isInteger(answerIndex) || state.submitting) return;

      state.selectedAnswer = answerIndex;
      state.submitting = true;
      state.error = "";
      render();

      try {
        const data = await apiPost({
          action: "answer",
          code: state.room.code,
          playerId: state.playerId,
          answerIndex
        });

        state.feedback = `${data.message} +${data.pointsEarned} points.`;
        state.feedbackCorrect = data.correct;

        // Update the local score immediately; polling will refresh all players.
        const me = state.room.players.find((p) => p.id === state.playerId);
        if (me) {
          me.score = data.totalScore;
          me.answered = true;
          me.lastAnswerCorrect = data.correct;
        }
      } catch (error) {
        state.error = error.message;
        state.selectedAnswer = null;
      } finally {
        state.submitting = false;
        render();
      }
    });
  });

  document.querySelector("#next-question")?.addEventListener("click", async () => {
    await runAction(async () => {
      const data = await apiPost({
        action: "next",
        code: state.room.code,
        playerId: state.playerId
      });

      state.room = data.room;
      state.error = "";
      state.selectedAnswer = null;
      state.feedback = "";
      state.feedbackCorrect = null;
      state.revealedAnswer = null;
    });
  });

  document.querySelector("#home-button")?.addEventListener("click", leaveRoom);
}

async function runAction(action) {
  if (state.busy) return;

  state.busy = true;
  state.error = "";
  render();

  try {
    await action();
  } catch (error) {
    state.error = error.message;
  } finally {
    state.busy = false;
    render();
  }
}

function leaveRoom() {
  clearPolling();

  state.room = null;
  state.playerId = null;
  state.playerName = "";
  state.selectedAnswer = null;
  state.submitting = false;
  state.feedback = "";
  state.feedbackCorrect = null;
  state.revealedAnswer = null;
  state.error = "";
  state.busy = false;

  render();
}

render();
