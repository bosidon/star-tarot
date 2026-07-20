require("./load-env");
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const spreadsPath = path.join(__dirname, "../shared/spreads.json");

const { verifyToken, extractToken } = require("/var/www/auth-verify");

// Database (sql.js - pure JS SQLite)
const initSqlJs = require("sql.js");
const dbPath = path.join(__dirname, "tarot.db");
let db = null;
let dbReady = false;

async function initDb() {
  const SQL = await initSqlJs();
  try {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
    console.log("📋 已打开现有数据库");
  } catch {
    db = new SQL.Database();
    console.log("📋 创建新数据库");
  }
  db.run("PRAGMA journal_mode=WAL");
  db.run(`
    CREATE TABLE IF NOT EXISTS readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      username TEXT DEFAULT '',
      question TEXT NOT NULL,
      questioner TEXT DEFAULT '',
      spread TEXT DEFAULT 'single',
      cards_json TEXT NOT NULL,
      interpretation TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now','localtime'))
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS idx_readings_user ON readings(user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_readings_time ON readings(created_at)");
  saveDb();
  dbReady = true;
  console.log("📋 塔罗解读记录表已就绪");
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

initDb();

const app = express();
const PORT = process.env.PORT || 3004;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";


app.use(cors());
app.use(express.json());
app.use(require("cookie-parser")());

app.use(express.static(path.join(__dirname, "..", "frontend")));

let cardsData = null;

function loadCards() {
  try {
    cardsData = JSON.parse(
      fs.readFileSync(path.join(__dirname, "cards.json"), "utf-8")
    );
    console.log("🃏 已加载 " + cardsData.length + " 张塔罗牌");
  } catch (e) {
    console.error("❌ 加载卡牌数据失败:", e.message);
    cardsData = [];
  }
}
loadCards();

// Admin check helper
async function checkAdmin(token) {
  const result = await verifyToken(token);
  return result.success && result.user && result.user.role === "admin";
}

async function checkUsage(token) {
  const res = await fetch("http://localhost:3050/api/usage/check?service=tarot", {
    headers: { cookie: "xianbao_token=" + token },
  });
  return res.json();
}

async function incrementUsage(token) {
  const resp = await fetch("http://localhost:3050/api/usage/increment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: "xianbao_token=" + token,
    },
    body: JSON.stringify({ service: "tarot" }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    console.error("用量递增失败: HTTP" + resp.status + " " + body);
  }
}

app.get("/api/user", async (req, res) => {
  const token = extractToken(req);
  if (!token) {
    return res.json({ success: false, error: "未登录" });
  }
  const result = await verifyToken(token);
  if (!result.success) {
    return res.json({ success: false, error: result.error });
  }
  res.json({ success: true, user: result.user });
});

app.get("/api/cards", (req, res) => {
  res.json({ success: true, data: cardsData });
});

app.post("/api/draw", (req, res) => {
  const { count = 1 } = req.body;
  if (cardsData.length === 0) {
    return res.json({ success: false, error: "卡牌数据未加载" });
  }
  const shuffled = [...cardsData].sort(() => Math.random() - 0.5);
  const drawn = shuffled.slice(0, Math.min(count, cardsData.length));
  const result = drawn.map((card) => ({
    ...card,
    reversed: Math.random() < 0.3,
  }));
  res.json({ success: true, data: result });
});

// ===== 牌阵配置 API =====
function loadSpreads() {
  try {
    return JSON.parse(fs.readFileSync(spreadsPath, "utf8"));
  } catch (e) {
    return { presets: {}, custom: [] };
  }
}

app.get("/api/spreads", (req, res) => {
  res.json({ success: true, data: loadSpreads() });
});

app.post("/api/reading", async (req, res) => {
  const { question, cards, spread = "single", questioner = "" } = req.body;

  if (!question || !cards || !Array.isArray(cards) || cards.length === 0) {
    return res.json({ success: false, error: "缺少问题或卡牌信息" });
  }

  if (!DEEPSEEK_API_KEY) {
    return res.json({ success: false, error: "DeepSeek API 密钥未配置" });
  }

  // === 用量校验 ===
  const token = extractToken(req);
  let isLoggedIn = false;

  if (token) {
    const result = await verifyToken(token);
    if (result.success) {
      isLoggedIn = true;
      try {
        const usageResult = await checkUsage(token);
        if (usageResult.success === false) {
          console.error("用量检查接口报错:", usageResult.error);
        } else if (usageResult.data && !usageResult.data.allowed) {
          return res.json({ success: false, error: "free_tarot_limit" });
        }
      } catch (e) {
        console.error("用量检查失败（放行）:", e.message);
      }
    }
  }

  // 未登录用户拒绝解牌
  if (!isLoggedIn) {
    return res.json({ success: false, error: "need_login" });
  }

  const cardsText = cards
    .map((c, i) => {
      const pos = c.reversed ? "逆位" : "正位";
      return (i + 1) + ". " + c.name + "（" + c.arcana + "·" + pos + "）\n   关键词：" + c.keywords + "\n   含义：" + (c.reversed ? c.meaning_reversed : c.meaning_upright);
    })
    .join("\n\n");

  const allSpreadsData = loadSpreads();
  const spreadConf = allSpreadsData.presets[spread] || allSpreadsData.presets.single;
  const spreadLabel = spreadConf.label;
  const positions = spreadConf.positionDetails || spreadConf.positions;
  const systemPrompt = "你是一个塔罗解读助手。根据用户的问题、选择的牌阵和抽到的牌，给出实用的解读。\n\n## 要求\n- 语言直白、说人话，不要刻意装神秘\n- 结合牌义和用户的问题给出具体分析，不要空泛\n- 每张牌按位置含义逐一解读，说清楚每张牌在这个位置上意味着什么\n- 最后给出可操作的建议，不要只说\"顺其自然\"\n- 用\"你\"，别用\"您\"\n- 每条解读100-300字，说清楚就行\n\n## 不准\n- 不准用：能量场、频率、振动、宇宙能量、神圣、灵性觉醒、灵魂课题、高我、扬升\n- 不准用：亲爱的、宝贝、缘主、信众\n- 不准写：\"让我为你解读\"、\"接下来我将\"、\"综上所述\"、\"总的来说\"\n- 不准排比句、三连句\n- 不加emoji\n- 不要总结自己刚说过的话\n\n## 输出格式\n牌面解读\n[*牌阵位置1~n*]：[解读]\n\n占卜结果\n[正文]\n\n建议\n[正文]\n\n谶语\n[一句短诗或总结]";

  // 构建位置含义文本
  const positionText = cards.map((c, i) => {
    return (i + 1) + "号位 - " + (positions[i] || "第" + (i+1) + "张牌");
  }).join("\n");

  const userPrompt = (questioner ? "## 提问人\n" + questioner + "\n\n" : "") + "## 提问者的问题\n" + question + "\n\n## 牌阵\n" + spreadLabel + "\n\n## 每张牌的位置含义\n" + positionText + "\n\n## 抽出的塔罗牌\n" + cardsText + "\n\n请严格按照OutputFormat格式输出。";

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + DEEPSEEK_API_KEY,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2048,
        stream: false,
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("DeepSeek API 错误:", data.error);
      return res.json({ success: false, error: data.error.message || "解读生成失败" });
    }

    const interpretation = data.choices[0].message.content;

    // === 保存解读记录 ===
    try {
      const userResult2 = await verifyToken(token);
      if (userResult2.success && userResult2.user && dbReady) {
        db.run(
          "INSERT INTO readings (user_id, username, question, questioner, spread, cards_json, interpretation) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [
            userResult2.user.id,
            userResult2.user.username || "",
            question,
            questioner || "",
            spread,
            JSON.stringify(cards),
            interpretation
          ]
        );
        saveDb();
      }
    } catch (saveErr) {
      console.error("保存解读记录失败:", saveErr.message);
    }

    // === 用量递增 ===
    if (isLoggedIn && token) {
      try {
        await incrementUsage(token);
      } catch (e) {
        console.error("用量递增失败（不影响返回）:", e.message);
      }
    }

    res.json({
      success: true,
      data: {
        interpretation,
        cards: cards,
        question: question,
        spread: spread,
        tokens: data.usage?.total_tokens || 0,
      },
    });
  } catch (error) {
    console.error("解读请求失败:", error.message);
    res.json({ success: false, error: "网络请求失败，请稍后重试" });
  }
});

// ===== 解读记录查询 =====

// 获取解读记录列表
app.get("/api/readings", async (req, res) => {
  const token = extractToken(req);
  if (!token) return res.json({ success: false, error: "未登录" });

  const userResult = await verifyToken(token);
  if (!userResult.success) return res.json({ success: false, error: userResult.error });

  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = (page - 1) * limit;
  const isAdmin = userResult.user.role === "admin";
  const searchQuestioner = req.query.questioner || "";
  const searchDate = req.query.date || "";

  if (!dbReady) return res.json({ success: false, error: "数据库未就绪" });

  try {
    // Build WHERE conditions
    const conditions = [];
    const params = [];
    const countParams = [];

    if (!isAdmin) {
      conditions.push("user_id = ?");
      params.push(userResult.user.id);
      countParams.push(userResult.user.id);
    }

    if (searchQuestioner) {
      conditions.push("questioner LIKE ?");
      params.push("%" + searchQuestioner + "%");
      countParams.push("%" + searchQuestioner + "%");
    }

    if (searchDate) {
      conditions.push("date(created_at) = ?");
      params.push(searchDate);
      countParams.push(searchDate);
    }

    const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    // Build SELECT columns
    let selectCols;
    if (isAdmin) {
      selectCols = "id, user_id, username, question, questioner, spread, cards_json, created_at";
    } else {
      selectCols = "id, question, questioner, spread, cards_json, created_at";
    }

    let stmt, countStmt;
    const listSQL = "SELECT " + selectCols + " FROM readings " + whereClause + " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    const countSQL = "SELECT COUNT(*) as count FROM readings " + whereClause;

    stmt = db.prepare(listSQL);
    countStmt = db.prepare(countSQL);

    stmt.bind([...params, limit, offset]);
    countStmt.bind([...countParams]);

    const rawRows = [];
    while (stmt.step()) {
      rawRows.push(stmt.getAsObject());
    }
    stmt.free();

    countStmt.step();
    const total = countStmt.getAsObject().count;
    countStmt.free();

    const rows = rawRows;

    res.json({
      success: true,
      data: {
        readings: rows.map(r => ({ ...r, cards_json: JSON.parse(r.cards_json) })),
        total,
        page,
        totalPages: Math.ceil(total / limit),
        isAdmin
      }
    });
  } catch (e) {
    console.error("查询记录失败:", e.message);
    res.json({ success: false, error: "查询失败" });
  }
});

// 获取单条解读详情（含完整解读内容）
app.get("/api/readings/:id", async (req, res) => {
  const token = extractToken(req);
  if (!token) return res.json({ success: false, error: "未登录" });

  const userResult = await verifyToken(token);
  if (!userResult.success) return res.json({ success: false, error: userResult.error });

  const readingId = parseInt(req.params.id);
  const isAdmin = userResult.user.role === "admin";

  if (!dbReady) return res.json({ success: false, error: "数据库未就绪" });

  try {
    let stmt;
    if (isAdmin) {
      stmt = db.prepare("SELECT * FROM readings WHERE id = ? AND user_id = ?");
      stmt.bind([readingId, userResult.user.id]);
    } else {
      stmt = db.prepare("SELECT * FROM readings WHERE id = ? AND user_id = ?");
      stmt.bind([readingId, userResult.user.id]);
    }

    let row = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();

    if (!row) {
      return res.json({ success: false, error: "记录不存在或无权查看" });
    }

    res.json({
      success: true,
      data: { ...row, cards_json: JSON.parse(row.cards_json) }
    });
  } catch (e) {
    console.error("查询详情失败:", e.message);
    res.json({ success: false, error: "查询失败" });
  }
});

app.listen(PORT, () => {
  console.log("🃏 塔罗解读网站后端运行于 http://localhost:" + PORT);
  console.log("📡 DeepSeek API: " + (DEEPSEEK_API_KEY ? "已配置 ✓" : "未配置 ✗"));
});