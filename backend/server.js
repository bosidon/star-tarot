const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

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

  const spreadNames = {
    single: "单张牌阵（直接指引）",
    three: "三张牌阵（过去·现在·未来）",
    horseshoe: "马蹄牌阵（现状·障碍·潜意识·近期·结果）",
    relationship: "关系牌阵（你·对方·关系核心·需求·建议）",
    celtic: "凯尔特十字牌阵（全方位深度剖析）",
  };

  // 牌阵位置含义（用于引导AI解读）
  const spreadPositions = {
    single: ["指引：这张牌是你此刻最需要的智慧"],
    three: ["过去：影响当前局面的根源或过去经历", "现在：当下的处境和能量状态", "未来：事态发展的趋势和可能性"],
    horseshoe: [
      "现状：你目前的处境",
      "障碍：当前面临的挑战或阻碍",
      "潜意识：你可能未意识到的深层影响",
      "近期：即将发生的事件或变化",
      "结果：按照当前轨迹的可能结局"
    ],
    relationship: [
      "你：你在这段关系中的状态和感受",
      "对方：对方的状态和感受",
      "关系核心：这段关系的本质和当前能量",
      "你的需求：你内心真正渴望的",
      "对方需求：对方内心真正渴望的",
      "建议/结果：关系的发展方向和建议"
    ],
    celtic: [
      "现况：当前的核心处境",
      "挑战：你面临的障碍或对立力量",
      "根源：造成现状的根本原因",
      "过去：影响当下的过去经历",
      "可能：最好的结果或潜力",
      "近未来：近期的发展趋势",
      "自我：你如何看待自己",
      "环境：外界的影响和他人看法",
      "希望：你的期望或恐惧",
      "结局：最终的走向"
    ]
  };

  const systemPrompt = "你是一位塔罗解读师，用聊天的方式帮人看牌。\n\n## 怎么说话\n- 说人话，用短句，别写得像公众号文章\n- 用\"你\"，别用\"您\"\n- 正位和逆位要说清楚区别在哪\n- 结尾随口说一句，像朋友聊完天那样\n\n## 不准说这些\n- 不准用：能量场、频率、振动、宇宙能量、神圣、灵性觉醒、灵魂课题、高我\n- 不准用：亲爱的、宝贝、缘主、信众\n- 不准写：\"让我为你解读\"、\"接下来我将\"、\"综上所述\"、\"总的来说\"、\"希望这篇解读能帮到你\"\n- 不准排比，不准三连句\n- 不准加emoji\n- 不准总结自己刚说过的话\n- 不准凑字数，说到点子上就行\n\n## 长度\n单张200字左右，三张400字左右，牌越多单张越精简";

  // 构建位置含义文本
  const positions = spreadPositions[spread] || spreadPositions.single;
  const positionText = cards.map((c, i) => {
    return (i + 1) + "号位 - " + (positions[i] || "第" + (i+1) + "张牌");
  }).join("\n");

  const userPrompt = (questioner ? "## 提问人\n" + questioner + "\n\n" : "") + "## 提问者的问题\n" + question + "\n\n## 牌阵\n" + (spreadNames[spread] || spreadNames.single) + "\n\n## 每张牌的位置含义\n" + positionText + "\n\n## 抽出的塔罗牌\n" + cardsText + "\n\n请以塔罗解读师的身份，按照每张牌的位置含义逐一解读，最后给出综合建议。";

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
        temperature: 0.8,
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