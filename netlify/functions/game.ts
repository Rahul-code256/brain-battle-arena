
import { getStore } from "@netlify/blobs";

const store = getStore("brain-battle-rooms");

const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;
const TOTAL_QUESTIONS = 15;
const QUESTION_TIME_SECONDS = 15;
const BASE_POINTS = 500;
const MAX_SPEED_BONUS = 500;

type Question = {
  q: string;
  options: string[];
  answer: number;
  explanation: string;
};

type Player = {
  id: string;
  name: string;
  score: number;
  answered: boolean;
  answerIndex: number | null;
  lastAnswerCorrect: boolean | null;
};

type Room = {
  code: string;
  status: "lobby" | "playing" | "finished";
  hostId: string;
  players: Player[];
  questionIndex: number;
  questionStartedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

const questions: Question[] = [
  {
    q: "Which keyword declares a block-scoped variable in JavaScript?",
    options: ["var", "let", "define", "dim"],
    answer: 1,
    explanation: "let declares a block-scoped variable."
  },
  {
    q: "What is the time complexity of binary search on a sorted array?",
    options: ["O(n)", "O(n²)", "O(log n)", "O(1)"],
    answer: 2,
    explanation: "Binary search halves the search space each step."
  },
  {
    q: "Which data structure follows LIFO?",
    options: ["Queue", "Stack", "Linked list", "Graph"],
    answer: 1,
    explanation: "A stack follows Last In, First Out."
  },
  {
    q: "What does HTML stand for?",
    options: [
      "Hyper Trainer Marking Language",
      "HyperText Markup Language",
      "HighText Machine Language",
      "HyperText Markdown Language"
    ],
    answer: 1,
    explanation: "HTML stands for HyperText Markup Language."
  },
  {
    q: "Which Git command creates a new branch?",
    options: [
      "git branch branch-name",
      "git push branch-name",
      "git merge branch-name",
      "git status branch-name"
    ],
    answer: 0,
    explanation: "git branch creates a branch without switching to it."
  },
  {
    q: "Which Python type is immutable?",
    options: ["list", "dict", "set", "tuple"],
    answer: 3,
    explanation: "A tuple cannot be changed after creation."
  },
  {
    q: "Which SQL command retrieves data from a table?",
    options: ["GET", "FETCH ALL", "SELECT", "OPEN"],
    answer: 2,
    explanation: "SELECT retrieves rows from database tables."
  },
  {
    q: "Which HTTP method is commonly used to retrieve data?",
    options: ["POST", "GET", "PATCH", "DELETE"],
    answer: 1,
    explanation: "GET is commonly used to retrieve a resource."
  },
  {
    q: "Which Docker command lists running containers?",
  options: [
    "docker images",
    "docker ps",
    "docker build",
    "docker pull"
  ],
  answer: 1,
  explanation: "docker ps lists running containers by default."

  },
  {
    q: "What is the main purpose of Kubernetes?",
    options: [
      "Edit source code",
      "Manage containerized applications",
      "Design databases",
      "Compile JavaScript"
    ],
    answer: 1,
    explanation: "Kubernetes orchestrates containerized workloads."
  },
  {
    q: "Which AWS service provides virtual servers?",
    options: ["Amazon S3", "Amazon EC2", "Amazon Route 53", "Amazon SNS"],
    answer: 1,
    explanation: "Amazon EC2 provides resizable virtual compute capacity."
  },
  {
    q: "Which command shows the current directory in Linux?",
    options: ["ls", "cd", "pwd", "mkdir"],
    answer: 2,
    explanation: "pwd prints the working directory."
  },
  {
    q: "Which operator checks strict equality in JavaScript?",
    options: ["=", "==", "===", "!="],
    answer: 2,
    explanation: "=== compares values without type coercion."
  },
  {
    q: "Which data structure is commonly used for BFS?",
    options: ["Stack", "Queue", "Heap", "Hash map"],
    answer: 1,
    explanation: "Breadth-first search uses a queue."
  },
  {
    q: "What does CI/CD commonly stand for?",
    options: [
      "Code Integration / Code Design",
      "Continuous Integration / Continuous Delivery",

      "Central Interface / Central Deployment",
      "Continuous Inspection / Code Distribution"

    ],

    answer: 1,
    explanation: "CI/CD automates integration and software delivery workflows."

  }
];

function json(data: unknown, status = 200): Response {

  return new Response(JSON.stringify(data), {

    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function makeId(): string {
  return crypto.randomUUID();
}

function makeRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));

  return Array.from(bytes, (byte) => chars[byte % chars.length]).join("");
}

function cleanName(value: unknown): string {
  if (typeof value !== "string") return "";

  return value
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 20);
}

function publicQuestion(room: Room) {
  if (room.status !== "playing") return null;

  const question = questions[room.questionIndex];

  if (!question) return null;

  // Never send the correct answer to clients before scoring.

  return {
    q: question.q,

    options: question.options,
    number: room.questionIndex + 1,

    total: TOTAL_QUESTIONS,
    timeLimit: QUESTION_TIME_SECONDS

  };
}

function publicRoom(room: Room) {

  const now = Date.now();
  const deadline = room.questionStartedAt
    ? room.questionStartedAt + QUESTION_TIME_SECONDS * 1000
    : null;

  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score,
      answered: player.answered,
      lastAnswerCorrect: player.lastAnswerCorrect
    })),
    questionIndex: room.questionIndex,
    question: publicQuestion(room),
    questionStartedAt: room.questionStartedAt,
    timeLeft: deadline
      ? Math.max(0, Math.ceil((deadline - now) / 1000))
      : null
  };
}

async function loadRoom(code: string): Promise<Room | null> {
  if (!/^[A-Z0-9]{6}$/.test(code)) return null;

  return (
    (await store.get<Room>(`room:${code}`, {

      type: "json"
    })) ?? null
  );
}

async function saveRoom(room: Room): Promise<void> {

  room.updatedAt = Date.now();

  await store.setJSON(`room:${room.code}`, room);
}

function findPlayer(room: Room, playerId: unknown): Player | undefined {

  if (typeof playerId !== "string") return undefined;
  return room.players.find((player) => player.id === playerId);

}

async function handleGet(url: URL): Promise<Response> {
  const action = url.searchParams.get("action");
  const code = (url.searchParams.get("code") || "").toUpperCase();

  if (action !== "get") {
    return error("Unknown GET action. Use action=get.", 400);
  }

  if (!code) {
    return error("Room code is required.");
  }

  const room = await loadRoom(code);

  if (!room) {
    return error("Room not found.", 404);
  }

  return json({ room: publicRoom(room) });
}

async function handlePost(request: Request): Promise<Response> {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return error("Request body must be valid JSON.");
  }

  const action = body.action;

  // CREATE ROOM
  if (action === "create") {
    const name = cleanName(body.name);

    if (!name) {
      return error("Enter a player name.");
    }

    let code = "";
    let room: Room | null = null;

    // Try several codes to reduce the chance of a collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      code = makeRoomCode();

      if (!(await loadRoom(code))) {
        room = {
          code,
          status: "lobby",
          hostId: "",
          players: [],
          questionIndex: 0,
          questionStartedAt: null,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        break;
      }
    }

    if (!room) {
      return error("Could not create a room. Please try again.", 503);
    }

    const playerId = makeId();

    room.hostId = playerId;
    room.players.push({
      id: playerId,
      name,
      score: 0,
      answered: false,
      answerIndex: null,
      lastAnswerCorrect: null
    });

    await saveRoom(room);

    return json({
      message: "Room created.",
      playerId,
      room: publicRoom(room)
    }, 201);
  }

  const code =
    typeof body.code === "string"
      ? body.code.trim().toUpperCase()
      : "";

  if (!code) {
    return error("Room code is required.");
  }

  const room = await loadRoom(code);

  if (!room) {
    return error("Room not found.", 404);
  }

  // JOIN ROOM
  if (action === "join") {
    const name = cleanName(body.name);

    if (!name) {
      return error("Enter a player name.");
    }

    if (room.status !== "lobby") {
      return error("This game has already started.");
    }

    if (room.players.length >= MAX_PLAYERS) {
      return error("This room is full. Maximum 8 players.");
    }

    const normalizedName = name.toLowerCase();

    if (
      room.players.some(
        (player) => player.name.toLowerCase() === normalizedName
      )
    ) {
      return error("That name is already in use in this room.");
    }

    const playerId = makeId();

    room.players.push({
      id: playerId,
      name,
      score: 0,
      answered: false,
      answerIndex: null,
      lastAnswerCorrect: null
    });

    await saveRoom(room);

    return json({
      message: "Joined room.",
      playerId,
      room: publicRoom(room)
    }, 201);
  }

  const playerId = body.playerId;
  const player = findPlayer(room, playerId);

  if (!player) {
    return error("Player not found in this room. Join again.", 403);
  }

  // START GAME
  if (action === "start") {
    if (player.id !== room.hostId) {
      return error("Only the room host can start the game.", 403);
    }

    if (room.status !== "lobby") {
      return error("The game has already started.");
    }

    if (room.players.length < MIN_PLAYERS) {
      return error("At least 2 players are required to start.");
    }

    room.status = "playing";
    room.questionIndex = 0;
    room.questionStartedAt = Date.now();

    for (const participant of room.players) {
      participant.score = 0;
      participant.answered = false;
      participant.answerIndex = null;
      participant.lastAnswerCorrect = null;
    }

    await saveRoom(room);

    return json({
      message: "Game started.",
      room: publicRoom(room)
    });
  }

  // SUBMIT ANSWER
  if (action === "answer") {
    if (room.status !== "playing") {
      return error("The game is not currently running.");
    }

    const question = questions[room.questionIndex];

    if (!question || room.questionStartedAt === null) {
      return error("No active question.");
    }

    const answerIndex = body.answerIndex;

    if (
      typeof answerIndex !== "number" ||
      !Number.isInteger(answerIndex) ||
      answerIndex < 0 ||
      answerIndex >= question.options.length
    ) {
      return error("Select a valid answer.");
    }

    if (player.answered) {
      return error("You have already answered this question.");
    }

    const elapsed = Date.now() - room.questionStartedAt;
    const deadline = QUESTION_TIME_SECONDS * 1000;

    if (elapsed >= deadline) {
      return error("Time is up for this question.");
    }

    const isCorrect = answerIndex === question.answer;

    let points = 0;

    if (isCorrect) {
      const remainingMs = Math.max(0, deadline - elapsed);
      const speedBonus = Math.floor(
        (remainingMs / deadline) * MAX_SPEED_BONUS
      );

      points = BASE_POINTS + speedBonus;
      player.score += points;
    }

    player.answered = true;
    player.answerIndex = answerIndex;
    player.lastAnswerCorrect = isCorrect;

    await saveRoom(room);

    return json({
      message: isCorrect ? "Correct answer!" : "Incorrect answer.",
      correct: isCorrect,
      pointsEarned: points,
      totalScore: player.score,
      allPlayersAnswered: room.players.every(
        (participant) => participant.answered
      )
    });
  }

  // ADVANCE TO NEXT QUESTION
  if (action === "next") {
    if (player.id !== room.hostId) {
      return error("Only the room host can advance the question.", 403);
    }

    if (room.status !== "playing") {
      return error("The game is not currently running.");
    }

    const elapsed = room.questionStartedAt
      ? Date.now() - room.questionStartedAt
      : 0;

    const timeExpired =
      elapsed >= QUESTION_TIME_SECONDS * 1000;

    const allAnswered = room.players.every(
      (participant) => participant.answered
    );

    if (!timeExpired && !allAnswered) {
      return error(
        "Wait until everyone answers or the 15-second timer expires."
      );
    }

    if (room.questionIndex + 1 >= TOTAL_QUESTIONS) {
      room.status = "finished";
      room.questionStartedAt = null;
      await saveRoom(room);

      return json({
        message: "Game finished.",
        room: publicRoom(room),
        leaderboard: [...room.players]
          .sort((a, b) => b.score - a.score)
          .map((participant, index) => ({
            rank: index + 1,
            name: participant.name,
            score: participant.score
          }))
      });
    }

    room.questionIndex += 1;
    room.questionStartedAt = Date.now();

    for (const participant of room.players) {
      participant.answered = false;
      participant.answerIndex = null;
      participant.lastAnswerCorrect = null;
    }

    await saveRoom(room);

    return json({
      message: "Next question.",
      room: publicRoom(room)
    });
  }

  return error(
    "Unknown action. Use create, join, start, answer, or next."
  );
}

export default async function handler(request: Request): Promise<Response> {
  try {
    if (request.method === "GET") {
      return await handleGet(new URL(request.url));
    }

    if (request.method === "POST") {
      return await handlePost(request);
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed." }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          Allow: "GET, POST"
        }
      }
    );
  } catch (err) {
    console.error("Brain Battle Arena API error:", err);

    return error(
      "An internal server error occurred. Check the Netlify function logs.",
      500
    );
  }
}

