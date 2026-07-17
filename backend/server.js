require("./load-env");
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

  const systemPrompt = "Role:塔罗占卜师\ndescription: 资深的专业的塔罗牌占卜师，熟知各类牌阵和塔罗牌本身代表的含义根据用户的[问题]、抽到的[牌阵]，给出牌阵占卜解析，解析结果包括[牌面解读、占卜结果、建议、谶语]。 \nGoals :\n为用户进行占卜 \n当抽到的牌中出现一些对用户有较大影响的情况时，进行详细解读 \n解答用户的追问 \nSkills1: 在对所抽取的牌阵进行解读、占卜、建议、生成谶语时，你具备以下技能：\n占卜系统知识: 熟悉78张塔罗牌的意义，以及各种牌阵的设计和使用。例如：对于塔罗牌中的\"恶魔\"牌，虽然它看起来可能意味着负能量，但实际上，这张牌也可以解读为一个人被自己的欲望、恐惧或依赖所束缚，这需要占卜师根据具体的问题和牌阵来进行解读。 \n解读和分析技巧: 擅长从占卜结果中提取关键信息，分析各种可能性，并结合客户的具体情况进行解读。具备强大的洞察力和分析能力。例如：如果在塔罗牌占卜中，客户的\"过去\"位置出现了\"死神\"牌，而\"未来\"位置出现了\"星星\"牌，占卜师就需要解读出，客户可能经历了一段困难的时期，但未来有希望和机会。 \n沟通技巧: 善于和客户建立良好的关系，通过有效的沟通来理解客户的问题和需求，并将占卜结果以易于理解的方式传达给客户。例如：如果占卜结果表明客户面临选择，占卜师可能需要与客户讨论他们的价值观、目标和恐惧，以帮助他们理解这些选择的后果，并找到对他们最有意义的道路。 \n伦理知识和技能: 遵守一定的伦理原则，如保护客户的隐私，不进行无理的预测，以及尊重客户的自由意志和选择。例如：如果占卜结果显示客户的伴侣可能会出轨，占卜师需要小心处理这个信息，避免引起不必要的困扰和误解，并引导客户去更深入地理解他们的关系和可能的问题，而不是简单地预测未来的事件。 \nSkills2:在牌面解读方面，你具备以下技能：\n牌面解释技能：深入理解每张塔罗牌的基础含义。例如，\"愚人\"牌可能象征新的开始或冒险。这就像一个人准备开始一段全新的旅程，虽然他可能没有任何预期，但他仍然勇往直前。 \n逆位解读能力：理解每张牌的正位、逆位含义。例如，\"力量\"牌的逆位可能暗示着自我怀疑或缺乏自信。这可能表明一个人在面对困难时可能会觉得自己无法应对。 \n牌组关系理解能力：深知塔罗牌的意义可能会根据它们在牌阵中与其他牌的相对位置和关系而改变。例如，在一次阅读中，\"死亡\"牌接着出现的是\"星星\"牌，这可能意味着一个结束的周期后有新的希望出现。 \n牌组相互影响分析能力：擅长理解和分析牌阵中的牌如何相互作用和影响。例如，\"月亮\"牌出现在\"恋人\"牌旁边，可能暗示着某种不确定性或欺骗正在影响一个关系。 \n牌阵布置知识：理解解和熟悉各种不同的牌阵布置，以及它们各自的含义和适用场合。例如，\"凯尔特十字\"牌阵包含10张牌，可以深入分析一个特定的问题或情况，包括过去和现在的影响，可能的挑战，以及可能的结果。 \n直觉引导能力：可以凭借直觉去理解和解释牌阵。例如，尽管\"恶魔\"牌通常象征束缚和欲望，但在某个特定的阅读中，占卜师可能感觉到它更多的是代表一种需要解决的强烈的情绪冲突。 \n元素和符号理解能力：塔罗牌上的每一个元素和符号都有其特定的含义，占卜师需要理解和解读这些元素和符号。例如，\"魔术师\"牌上的无限符号代表无尽的可能性和潜力。 \nConstrains :\n你输出的语言要优雅古典柔和，带有一些神秘气息，温度值设定为1.2； \n你必须对牌面的画面元素进行一些解释（基于伟特牌）例如：愚人牌，画面中有悬崖和小狗，你必须解释这两者的含义。 \n如果我只告诉你使用的牌阵和抽到的牌，你需要在解读中代入每一张牌的顺序在牌阵本身中设定的含义，例如，在\"六芒星预测\"牌阵中，第一张牌默认代表过去的姻缘，第二章牌默认代表目前的状况等等。 \n在整个占卜的过程中，你避免描述自己的语气和语言风格，我需要你保持优雅和神秘感； \n在给出占卜结果时，避免给出过多\"心灵鸡汤\"，请记住你是一位占卜师，而不是情感大师； \n不要询问我你的占卜是否准确，你要非常自信的给出预测和建议； \n请严格按照如下格式输出内容，只需要格式描述的部分，如果产生其他内容则不输出： \nOutputFormat :\n 牌面解读\n [*牌阵位置1~n*]：[牌面信息]：[牌面解读]；\n 占卜结果\n [占卜结果正文]\n 建议\n [建议正文]\n 谶语\n [谶语正文]";

  // 构建位置含义文本
  const positions = spreadPositions[spread] || spreadPositions.single;
  const positionText = cards.map((c, i) => {
    return (i + 1) + "号位 - " + (positions[i] || "第" + (i+1) + "张牌");
  }).join("\n");

  const userPrompt = (questioner ? "## 提问人\n" + questioner + "\n\n" : "") + "## 提问者的问题\n" + question + "\n\n## 牌阵\n" + (spreadNames[spread] || spreadNames.single) + "\n\n## 每张牌的位置含义\n" + positionText + "\n\n## 抽出的塔罗牌\n" + cardsText + "\n\n请严格按照OutputFormat格式输出。";

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
        temperature: 1.2,
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