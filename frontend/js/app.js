/* ============ 塔罗解读 - 前端逻辑 ============ */

const API_BASE = '/api';

const ARCANA_SYMBOLS = {
  '大阿卡纳': '🌟',
  '小阿卡纳—权杖': '🔥',
  '小阿卡纳—圣杯': '💧',
  '小阿卡纳—宝剑': '⚔️',
  '小阿卡纳—星币': '🪙'
};

const ARCANA_COLORS = {
  '大阿卡纳': '#d4a853',
  '小阿卡纳—权杖': '#f97316',
  '小阿卡纳—圣杯': '#22d3ee',
  '小阿卡纳—宝剑': '#a78bfa',
  '小阿卡纳—星币': '#34d399'
};
// 卡牌图片映射
function getCardImagePath(card) {
  const num = card.number;
  const arcana = card.arcana;
  
  // 大阿卡纳
  if (arcana === '大阿卡纳') {
    const names = ['Fool','Magician','High_Priestess','Empress','Emperor','Hierophant','Lovers','Chariot','Strength','Hermit','Wheel_of_Fortune','Justice','Hanged_Man','Death','Temperance','Devil','Tower','Star','Moon','Sun','Judgement','World'];
    return '/assets/cards/RWS_Tarot_' + String(num).padStart(2,'0') + '_' + names[num] + '.jpg';
  }
  
  // 小阿卡纳
  const suitMap = {
    '小阿卡纳—权杖': 'Wands',
    '小阿卡纳—圣杯': 'Cups',
    '小阿卡纳—宝剑': 'Swords',
    '小阿卡纳—星币': 'Pents'
  };
  const suit = suitMap[arcana];
  if (suit) {
    return '/assets/cards/' + suit + String(num).padStart(2,'0') + '.jpg';
  }
  
  return null;
}


// 分组配置
const CARD_GROUPS = [
  { key: 'major', label: '🌟 大阿卡纳', filter: c => c.arcana === '大阿卡纳' },
  { key: 'wands', label: '🔥 权杖', filter: c => c.arcana === '小阿卡纳—权杖' },
  { key: 'cups', label: '💧 圣杯', filter: c => c.arcana === '小阿卡纳—圣杯' },
  { key: 'swords', label: '⚔️ 宝剑', filter: c => c.arcana === '小阿卡纳—宝剑' },
  { key: 'coins', label: '🪙 星币', filter: c => c.arcana === '小阿卡纳—星币' }
];

// 数字→罗马数字
function toRoman(n) {
  const map = {1:'I',2:'II',3:'III',4:'IV',5:'V',6:'VI',7:'VII',8:'VIII',9:'IX',10:'X',
    11:'XI',12:'XII',13:'XIII',14:'XIV',15:'XV',16:'XVI',17:'XVII',18:'XVIII',19:'XIX',20:'XX',21:'XXI'};
  return map[n] || n;
}

const TarotApp = {
  drawnCards: [],
  currentQuestion: '',
  currentSpread: 'single',

  // 牌阵配置：牌数 + 位置标签
  SPREAD_CONFIG: {},
  SPREAD_ORDER: [],

  async loadSpreads() {
    try {
      const r = await fetch('/api/spreads');
      const d = await r.json();
      if (d.success) {
        // Merge custom spreads from localStorage
        const custom = this.loadCustomSpreads();
        const allPresets = { ...d.data.presets };
        const allKeys = Object.keys(allPresets);
        const allConfigs = { ...allPresets };
        
        // Add custom spreads
        if (custom.length > 0) {
          custom.forEach(s => {
            const key = 'custom_' + s.id;
            allKeys.push(key);
            allConfigs[key] = s;
          });
        }
        
        this.SPREAD_CONFIG = allConfigs;
        this.SPREAD_ORDER = allKeys;
        // Default to first preset
        const presetKeys = allKeys.filter(k => !k.startsWith('custom_'));
        if (presetKeys.length > 0 && !this.currentSpread) {
          this.currentSpread = presetKeys[0];
        }
        this.renderSpreadSelectors();
      }
    } catch (e) {
      console.error('loadSpreads failed:', e);
    }
  },

  loadCustomSpreads() {
    try {
      return JSON.parse(localStorage.getItem('tarotCustomSpreads') || '[]');
    } catch(e) { return []; }
  },

  saveCustomSpreads(spreads) {
    localStorage.setItem('tarotCustomSpreads', JSON.stringify(spreads));
  },

  renderSpreadSelectors() {
    const container = document.querySelector('.spread-selector');
    if (!container) return;
    
    container.innerHTML = '<div style="width:100%;">' + [
      '<div class="spread-tabs" style="display:flex;gap:0;margin-bottom:16px;border-bottom:1px solid rgba(201,168,76,0.15);">',
        '<button class="spread-tab tab-preset" data-tab="preset" style="padding:10px 16px;text-align:center;font-size:14px;font-weight:700;cursor:pointer;border:none;background:none;font-family:&apos;Songti SC&apos;,&apos;Noto Serif SC&apos;,&apos;STSong&apos;,&apos;SimSun&apos;,serif;color:var(--gold,#c9a84c);border-bottom:2px solid var(--gold,#c9a84c);transition:.2s;">常规牌阵</button>',
        '<button class="spread-tab tab-custom" data-tab="custom" style="padding:10px 16px;text-align:center;font-size:14px;font-weight:700;cursor:pointer;border:none;background:none;font-family:&apos;Songti SC&apos;,&apos;Noto Serif SC&apos;,&apos;STSong&apos;,&apos;SimSun&apos;,serif;color:rgba(201,168,76,0.5);border-bottom:2px solid transparent;transition:.2s;">自定义</button>',
        '<button class="spread-tab tab-nopos" data-tab="nopos" style="padding:10px 16px;text-align:center;font-size:14px;font-weight:700;cursor:pointer;border:none;background:none;font-family:&apos;Songti SC&apos;,&apos;Noto Serif SC&apos;,&apos;STSong&apos;,&apos;SimSun&apos;,serif;color:rgba(201,168,76,0.5);border-bottom:2px solid transparent;transition:.2s;">无位置</button>',
      '</div>',
      '<div id="spreadTabContent"></div>'
    ].join('') + '</div>';
    
    this.switchSpreadTab('preset');
    
    // Bind tab clicks
    container.querySelectorAll('.spread-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchSpreadTab(tab.dataset.tab));
    });
  },

  switchSpreadTab(tabName) {
    const content = document.getElementById('spreadTabContent');
    if (!content) return;
    
    // Update tab styles
    document.querySelectorAll('.spread-tab').forEach(t => {
      const isActive = t.dataset.tab === tabName;
      t.style.color = isActive ? 'var(--gold,#c9a84c)' : 'rgba(201,168,76,0.5)';
      t.style.borderBottom = isActive ? '2px solid var(--gold,#c9a84c)' : '2px solid transparent';
    });
    
    if (tabName === 'preset') {
      this.renderPresetTab(content);
    } else if (tabName === 'custom') {
      this.renderCustomTab(content);
    } else if (tabName === 'nopos') {
      this.renderNoPosTab(content);
    }
  },

  renderPresetTab(content) {
    // Filter only preset spreads (not custom_)
    const presetKeys = this.SPREAD_ORDER.filter(k => !k.startsWith('custom_') && k !== 'nopos');
    const currentIsPreset = presetKeys.includes(this.currentSpread);
    if (!currentIsPreset && presetKeys.length > 0) {
      this.currentSpread = presetKeys[0];
    }
    
    let html = '<div style="margin-bottom:12px;">';
    html += '<select id="spreadSelect" style="padding:10px 14px;background:rgba(26,26,36,0.8);border:1px solid rgba(201,168,76,0.2);border-radius:24px;color:#d4a853;font-size:14px;outline:none;cursor:pointer;font-family:&apos;Songti SC&apos;,&apos;Noto Serif SC&apos;,&apos;STSong&apos;,&apos;SimSun&apos;,serif;">';
    presetKeys.forEach(key => {
      const cfg = this.SPREAD_CONFIG[key];
      if (!cfg) return;
      const sel = key === this.currentSpread ? ' selected' : '';
      html += '<option value="' + key + '"' + sel + '>' + cfg.label + '</option>';
    });
    html += '</select>';
    html += '</div>';
    html += '<div id="spreadDetail" style="background:rgba(26,26,36,0.6);border:1px solid rgba(201,168,76,0.12);border-radius:12px;padding:14px 16px;margin-bottom:8px;"></div>';
    content.innerHTML = html;
    
    this.updateSpreadDetail();
    
    const sel = document.getElementById('spreadSelect');
    if (sel) {
      sel.addEventListener('change', (e) => {
        this.currentSpread = e.target.value;
        this.updateSpreadDetail();
        this.resetCards();
      });
    }
  },

  renderCustomTab(content) {
    const custom = this.loadCustomSpreads();
    
    let html = '<div style="margin-bottom:10px;">';
    html += '<button id="btnNewCustom" style="padding:10px 28px;border:1px solid rgba(201,168,76,0.25);border-radius:24px;background:transparent;color:var(--gold-light,#d4a853);font-family:&apos;Songti SC&apos;,&apos;Noto Serif SC&apos;,&apos;STSong&apos;,&apos;SimSun&apos;,serif;font-size:0.95rem;cursor:pointer;transition:all 0.2s;">✧ 创建自定义牌阵</button>';
    html += '</div>';
    
    if (custom.length === 0) {
      html += '<div style="text-align:center;padding:20px;color:#64748b;font-size:13px;">还没有自定义牌阵，点击上方按钮创建</div>';
    } else {
      custom.forEach((s, idx) => {
        const isActive = this.currentSpread === 'custom_' + s.id;
        const activeStyle = isActive ? 'border-color:var(--gold,#c9a84c);background:rgba(201,168,76,0.08);' : '';
        html += '<div class="custom-spread-item" data-custom-id="' + s.id + '" style="padding:12px 14px;background:rgba(26,26,36,0.6);border:1px solid rgba(201,168,76,0.12);border-radius:12px;margin-bottom:8px;cursor:pointer;transition:.2s;' + activeStyle + '">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
        html += '<div><strong style="color:#e2e8f0;font-size:14px;">' + s.label + '</strong> <span style="color:#64748b;font-size:12px;">' + s.count + '张</span></div>';
        html += '<button class="del-custom" data-idx="' + idx + '" style="background:none;border:none;color:#f87171;cursor:pointer;font-size:16px;padding:2px 6px;">×</button>';
        html += '</div>';
        html += '<div style="margin-top:6px;">' + s.positions.map((p, i) => '<span style="display:inline-block;padding:2px 10px;margin:2px 3px 2px 0;background:rgba(201,168,76,0.1);border:1px solid rgba(201,168,76,0.25);border-radius:12px;font-size:11px;color:#d4a853;">' + (i+1) + '.' + p + '</span>').join('') + '</div>';
        html += '</div>';
      });
    }
    
    content.innerHTML = html;
    
    // Bind create
    const btn = document.getElementById('btnNewCustom');
    if (btn) btn.onclick = () => this.showCustomSpreadEditor();
    
    // Bind select
    content.querySelectorAll('.custom-spread-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.customId;
        this.currentSpread = 'custom_' + id;
        this.resetCards();
        // Update visual
        content.querySelectorAll('.custom-spread-item').forEach(e => {
          e.style.borderColor = 'rgba(201,168,76,0.12)';
          e.style.background = 'rgba(26,26,36,0.6)';
        });
        el.style.borderColor = 'var(--gold,#c9a84c)';
        el.style.background = 'rgba(201,168,76,0.08)';
      });
    });
    
    // Bind delete
    content.querySelectorAll('.del-custom').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        const custom = this.loadCustomSpreads();
        custom.splice(idx, 1);
        this.saveCustomSpreads(custom);
        this.loadSpreads();
      });
    });
  },

  renderNoPosTab(content) {
    let count = 3;
    // Check if current is nopos
    if (this.currentSpread === 'nopos') {
      count = this._noposCount || 3;
    }
    
    content.innerHTML = [
      '<div style="color:rgba(201,168,76,0.5);font-size:13px;margin-bottom:12px;">不定义牌位置，直接指定抽取的牌数，由 AI 自由解读</div>',
      '<div style="display:flex;align-items:center;gap:12px;">',
        '<label style="color:var(--gold-light,#d4a853);font-size:14px;font-family:&apos;Songti SC&apos;,&apos;Noto Serif SC&apos;,&apos;STSong&apos;,&apos;SimSun&apos;,serif;">抽取</label>',
        '<input id="noposCount" type="number" min="1" max="10" value="' + count + '" style="width:70px;padding:10px 12px;background:rgba(26,26,36,0.8);border:1px solid rgba(201,168,76,0.2);border-radius:24px;color:#d4a853;font-size:14px;outline:none;text-align:center;font-family:&apos;Songti SC&apos;,&apos;Noto Serif SC&apos;,&apos;STSong&apos;,&apos;SimSun&apos;,serif;">',
        '<label style="color:var(--gold-light,#d4a853);font-size:14px;font-family:&apos;Songti SC&apos;,&apos;Noto Serif SC&apos;,&apos;STSong&apos;,&apos;SimSun&apos;,serif;">张牌</label>',
      '</div>'
    ].join('');
    
    const input = document.getElementById('noposCount');
    const apply = () => {
      const n = parseInt(input.value) || 3;
      this._noposCount = n;
      if (!this.SPREAD_CONFIG['nopos']) {
        this.SPREAD_CONFIG['nopos'] = { count: n, label: '无位置', positions: [], positionDetails: [] };
      }
      this.SPREAD_CONFIG['nopos'].count = n;
      const pos = [];
      for (let i = 0; i < n; i++) pos.push('第' + (i+1) + '张');
      this.SPREAD_CONFIG['nopos'].positions = pos;
      this.SPREAD_CONFIG['nopos'].positionDetails = pos.map((p, i) => (i+1) + '号位');
      this.currentSpread = 'nopos';
      this.resetCards();
    };
    
    apply();
    if (input) input.onchange = apply;
  },

  resetCards() {
    this.drawnCards = [];
    this.selectedCardsCount = 0;
    document.querySelectorAll('.picker-card').forEach(el => el.classList.remove('selected', 'reversed'));
    this.updatePickerStatus();
  },

  updateSpreadDetail() {
    const cfg = this.SPREAD_CONFIG[this.currentSpread];
    if (!cfg) return;
    const el = document.getElementById('spreadDetail');
    if (!el) return;
    
    let posHtml = cfg.positions.map((p, i) => {
      return '<span style="display:inline-block;padding:4px 12px;margin:3px 4px 3px 0;background:rgba(201,168,76,0.1);border:1px solid rgba(201,168,76,0.25);border-radius:14px;font-size:12px;color:#d4a853;">' + (i+1) + '. ' + p + '</span>';
    }).join('');
    
    el.innerHTML = '<div style="font-size:14px;font-weight:700;color:var(--gold-light,#d4a853);margin-bottom:6px;font-family:&apos;Songti SC&apos;,&apos;Noto Serif SC&apos;,&apos;STSong&apos;,&apos;SimSun&apos;,serif;">' + cfg.label + ' · ' + cfg.count + '张</div>' +
      '<div style="margin-bottom:6px;">' + posHtml + '</div>' +
      '<div style="font-size:13px;color:rgba(201,168,76,0.5);line-height:1.6;">' + (cfg.description || '') + '</div>';
  },

  showCustomSpreadEditor() {
    // Create modal for custom spread
    const existing = document.getElementById('customSpreadModal');
    if (existing) existing.remove();
    
    const modal = document.createElement('div');
    modal.id = 'customSpreadModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;';
    
    modal.innerHTML = [
      '<div style="background:#14141e;border:1px solid #1e1e2a;border-radius:16px;padding:28px;width:420px;max-width:90vw;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">',
        '<h3 style="margin:0 0 16px;font-size:18px;">创建自定义牌阵</h3>',
        '<label style="font-size:13px;color:#94a3b8;display:block;margin-bottom:4px;">牌阵名称</label>',
        '<input id="csName" style="width:100%;padding:10px 12px;background:#1e293b;border:1px solid #2a2a3a;border-radius:8px;color:#e2e8f0;font-size:14px;outline:none;margin-bottom:12px;box-sizing:border-box;" placeholder="如：工作分析" maxlength="20">',
        '<label style="font-size:13px;color:#94a3b8;display:block;margin-bottom:4px;">牌数（2~10张）</label>',
        '<input id="csCount" type="number" min="2" max="10" value="3" style="width:80px;padding:10px 12px;background:#1e293b;border:1px solid #2a2a3a;border-radius:8px;color:#e2e8f0;font-size:14px;outline:none;margin-bottom:12px;box-sizing:border-box;">',
        '<div id="csPositions" style="margin-bottom:16px;"></div>',
        '<div style="display:flex;gap:8px;justify-content:flex-end;">',
          '<button id="csCancel" style="padding:10px 20px;background:transparent;border:1px solid #2a2a3a;border-radius:8px;color:#94a3b8;cursor:pointer;font-size:14px;">取消</button>',
          '<button id="csSave" style="padding:10px 20px;background:#7c3aed;border:none;border-radius:8px;color:#fff;cursor:pointer;font-size:14px;font-weight:600;">保存</button>',
        '</div>',
      '</div>'
    ].join('');
    
    document.body.appendChild(modal);
    
    const countInput = modal.querySelector('#csCount');
    const posContainer = modal.querySelector('#csPositions');
    
    function renderPosInputs() {
      const count = parseInt(countInput.value) || 3;
      let html = '<label style="font-size:13px;color:#94a3b8;display:block;margin-bottom:4px;">各位置名称</label>';
      for (let i = 0; i < count; i++) {
        const placeholders = ['现状','障碍','目标','建议','结果','他人','希望','恐惧','环境','核心'];
        html += '<input class="csPos" style="width:100%;padding:8px 10px;background:#1e293b;border:1px solid #2a2a3a;border-radius:6px;color:#e2e8f0;font-size:13px;outline:none;margin-bottom:6px;box-sizing:border-box;" placeholder="位置' + (i+1) + '（如：' + (placeholders[i]||'') + '）" maxlength="10">';
      }
      posContainer.innerHTML = html;
    }
    
    countInput.addEventListener('input', renderPosInputs);
    renderPosInputs();
    
    modal.querySelector('#csCancel').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    
    modal.querySelector('#csSave').onclick = () => {
      const name = modal.querySelector('#csName').value.trim();
      const count = parseInt(modal.querySelector('#csCount').value) || 3;
      const posInputs = modal.querySelectorAll('.csPos');
      const positions = [];
      posInputs.forEach(inp => {
        const v = inp.value.trim();
        positions.push(v || '位置' + (positions.length + 1));
      });
      
      if (!name) { alert('请输入牌阵名称'); return; }
      
      const custom = this.loadCustomSpreads();
      const id = Date.now().toString(36);
      custom.push({
        id: id,
        count: count,
        label: name,
        positions: positions,
        positionDetails: positions,
        description: '自定义牌阵：' + name
      });
      this.saveCustomSpreads(custom);
      modal.remove();
      
      // Reload spreads
      this.loadSpreads();
    };
  },
  cardsData: [],
  allCardsData: [],
  selectedCardsCount: 0,
  currentGroup: 'major',
  _interpreting: false,  // 防连击锁


  updateSpreadDescription() {
    // Handled by updateSpreadDetail
  },

  init() {
    this.bindEvents();
    this.loadCards();
    this.loadSpreads();
    // 检测是否从 draw.html 返回
    this.checkDrawSession();
  },

  loadCards() {
    fetch(`${API_BASE}/cards`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          this.allCardsData = data.data;
          this.buildGroupTabs();
          this.renderGroup('major');
          // 牌数据加载完成后检查 draw.html 返回的抽牌会话
          this.processDrawSession();
        }
      })
      .catch(() => {});
  },

  bindEvents() {
    document.getElementById('btnSelfDraw').addEventListener('click', () => this.openCardPicker());
    document.getElementById('btnConfirmCards').addEventListener('click', () => this.confirmUserCards());
    document.getElementById('btnNewQuestion').addEventListener('click', () => this.reset());
    document.getElementById('btnInterpret').addEventListener('click', () => this.getInterpretation());


// spread-option events now handled in renderSpreadSelectors()

        // 点击弹窗外关闭
    document.getElementById('cardPickerModal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closeCardPicker();
    });
    document.getElementById('historyModal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closeHistory();
    });
    document.getElementById('historyDetailModal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closeHistoryDetail();
    });
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  getQuestioner() {
    return document.getElementById("questionerInput").value.trim();
  },

  getQuestion() {
    const q = document.getElementById('questionInput').value.trim();
    if (!q) return '当下指引';
    return q;
  },

  // 确保当前问题状态同步
  syncQuestion() {
    this.currentQuestion = this.getQuestion();
    return this.currentQuestion;
  },

  checkDrawSession() {
    try {
      var raw = localStorage.getItem('tarotDrawSession');
      if (!raw) return false;
      var session = JSON.parse(raw);
      return session;
    } catch(e) {
      localStorage.removeItem('tarotDrawSession');
      return false;
    }
  },

  processDrawSession() {
    var session = this.checkDrawSession();
    if (!session) return;
    // 清除会话，防止刷新重复触发
    localStorage.removeItem('tarotDrawSession');
    
    // 恢复牌阵
    this.currentSpread = session.spread;
    this.currentQuestion = session.question || '当下指引';
    if (session.questioner) {
      document.getElementById('questionerInput').value = session.questioner;
    }
    this.updateSpreadDescription();
    
    // 映射牌数据：用序号匹配 allCardsData
    var self = this;
    this.drawnCards = [];
    session.cards.forEach(function(c) {
      // 按 name 和 number 查找
      var found = self.allCardsData.find(function(ac) {
        return ac.number === c.number && ac.arcana === c.arcana;
      });
      if (found) {
        self.drawnCards.push({ ...found, reversed: c.isReversed || c.reversed || false });
      }
    });
    
    if (this.drawnCards.length > 0) {
      this.displayCards(this.drawnCards);
      this.showInterpretButton();
      // 定位到占卜区域
      setTimeout(function() {
        var area = document.querySelector('.draw-area');
        if (area) area.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      this.showToast('✅ 已从扇形抽牌页带回 ' + this.drawnCards.length + ' 张牌');
    }
  },

  shakeElement(el) {
    el.style.borderColor = '#f87171';
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = 'shake 0.5s ease';
    setTimeout(() => el.style.borderColor = '', 1000);
  },

  // ============ 分组 Tab ============
  buildGroupTabs() {
    const container = document.getElementById('groupTabs');
    container.innerHTML = CARD_GROUPS.map(g => `
      <div class="group-tab ${g.key === 'major' ? 'active' : ''}" data-group="${g.key}"
           onclick="TarotApp.switchGroup('${g.key}')">
        ${g.label}
      </div>
    `).join('');
  },

  switchGroup(key) {
    this.currentGroup = key;
    document.querySelectorAll('.group-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.group-tab[data-group="${key}"]`).classList.add('active');
        this.renderGroup(key);
  },

  renderGroup(key) {
    const grid = document.getElementById('cardPickerGrid');
    const group = CARD_GROUPS.find(g => g.key === key);
    const cards = this.allCardsData.filter(group.filter);

    grid.innerHTML = cards.map(card => {
      const isSelected = this.drawnCards.some(c => c.id === card.id);
      const selCard = this.drawnCards.find(c => c.id === card.id);
      const isRev = selCard?.reversed || false;

      return `
        <div class="picker-card ${isSelected ? 'selected' : ''} ${isRev ? 'reversed' : ''}" onclick="TarotApp.toggleCard(${card.id})">
          <img class="picker-img" src="${getCardImagePath(card)}" alt="${card.name}" 
               onerror="this.style.display='none';this.parentElement.querySelector('.picker-fallback').style.display='flex'">
          <div class="picker-fallback" style="display:none">
            <div class="picker-symbol">${ARCANA_SYMBOLS[card.arcana] || '🃏'}</div>
          </div>
          <div class="picker-name">${card.name}</div>
          <div class="picker-hover">
            <span class="picker-hover-btn" onclick="event.stopPropagation(); TarotApp.selectCard(${card.id}, false)">正</span>
            <span class="picker-hover-btn reverse" onclick="event.stopPropagation(); TarotApp.selectCard(${card.id}, true)">逆</span>
          </div>
        </div>
      `;
    }).join('');
  },


  // ============ 选牌交互 ============

  toggleCard(cardId) {
    const idx = this.drawnCards.findIndex(c => c.id === cardId);
    if (idx !== -1) {
      this.drawnCards.splice(idx, 1);
      this.selectedCardsCount--;
      this.renderGroup(this.currentGroup);
      this.updatePickerStatus();
    }
  },

  selectCard(cardId, reversed) {
    const maxCards = (this.SPREAD_CONFIG[this.currentSpread] || this.SPREAD_CONFIG.single).count;
    const idx = this.drawnCards.findIndex(c => c.id === cardId);

    if (idx !== -1) {
      // 已选中 → 切换正逆位
      this.drawnCards[idx].reversed = reversed;
      this.renderGroup(this.currentGroup);
      this.updatePickerStatus();
      return;
    }

    if (this.selectedCardsCount >= maxCards) {
      this.showToast(`最多选 ${maxCards} 张牌`);
      return;
    }

    const card = this.allCardsData.find(c => c.id === cardId);
    if (card) {
      this.drawnCards.push({ ...card, reversed });
      this.selectedCardsCount++;
      this.renderGroup(this.currentGroup);
      this.updatePickerStatus();
    }
  },

  updatePickerStatus() {
    const maxCards = (this.SPREAD_CONFIG[this.currentSpread] || this.SPREAD_CONFIG.single).count;
    const status = document.getElementById('pickerStatus');
    const btn = document.getElementById('btnConfirmCards');
    status.innerHTML = `已选 <span style="color:var(--gold);font-weight:700;">${this.selectedCardsCount}</span> / ${maxCards} 张`;
    btn.disabled = this.selectedCardsCount !== maxCards;


  },

  openCardPicker() {
    const question = this.syncQuestion();
    if (!question) return;

    // 重置
    this.drawnCards = [];
    this.selectedCardsCount = 0;
    this.switchGroup('major');
    this.updatePickerStatus();

    // 恢复「开始解读」按钮（解读完成后重新抽牌时）
    const btnI = document.getElementById('btnInterpret');
    if (btnI) {
      btnI.style.display = '';
      btnI.classList.remove('loading');
      btnI.disabled = false;
    }
    document.getElementById('cardPickerModal').classList.add('visible');
    document.body.style.overflow = 'hidden';
  },

  closeCardPicker() {
    document.getElementById('cardPickerModal').classList.remove('visible');
    document.body.style.overflow = '';
  },

  confirmUserCards() {
    this.closeCardPicker();
    this.displayCards(this.drawnCards);
    this.showInterpretButton();
  },

  // ============ AI 抽牌 ============
  async aiDraw() {
    this.syncQuestion();
    this.showLoading('星辰之力正在为你选牌...');

    try {
      const count = (this.SPREAD_CONFIG[this.currentSpread] || this.SPREAD_CONFIG.single).count;
      const resp = await fetch(`${API_BASE}/draw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ count })
      });
      const data = await resp.json();
      if (!data.success) throw new Error(data.error);

      this.drawnCards = data.data;
      this.hideLoading();
      this.displayCards(data.data);
      this.showInterpretButton();

    } catch (e) {
      this.hideLoading();
      this.showToast('抽牌失败：' + e.message);
    }
  },

  // ============ 显示卡牌 ============
  displayCards(cards) {
    const container = document.getElementById('cardDisplay');
    const area = document.querySelector('.draw-area');
    area.classList.add('visible');
    container.setAttribute('data-count', cards.length);
    
    // 更新标题为牌阵名称
    var titleEl = null; // section-title removed from step 3
    if (titleEl) {
      var config = this.SPREAD_CONFIG[this.currentSpread] || this.SPREAD_CONFIG.single;
      titleEl.innerHTML = '🃏 ' + config.label;
    }

    // 花色→CSS类映射
    const suitClasses = {
      '大阿卡纳': 'card-face-suit-major',
      '小阿卡纳—权杖': 'card-face-suit-wands',
      '小阿卡纳—圣杯': 'card-face-suit-cups',
      '小阿卡纳—宝剑': 'card-face-suit-swords',
      '小阿卡纳—星币': 'card-face-suit-coins'
    };
    const suitLabels = {
      '大阿卡纳': 'MAJOR ARCANA',
      '小阿卡纳—权杖': 'WANDS',
      '小阿卡纳—圣杯': 'CUPS',
      '小阿卡纳—宝剑': 'SWORDS',
      '小阿卡纳—星币': 'PENTACLES'
    };

    container.innerHTML = cards.map((card, i) => {
      const symb = ARCANA_SYMBOLS[card.arcana] || '🃏';
      const numText = card.arcana === '大阿卡纳'
        ? toRoman(card.number)
        : card.number;
      const suitClass = suitClasses[card.arcana] || 'card-face-suit-major';
      const suitLabel = suitLabels[card.arcana] || '';
      const posClass = card.reversed ? 'pos-reversed' : 'pos-upright';
      const posText = card.reversed ? '逆位' : '正位';

      var cardClass = 'tarot-card flipped' + (card.reversed ? ' pos-reversed' : '');
      return `
        <div class="${cardClass}">
          <div class="card-inner">
            <div class="card-back">
              <img src="/assets/cards/card_back.jpg" alt="牌背面">
            </div>
            <div class="card-face ${suitClass}">
              <div class="card-face-content">
                <img class="card-face-img" src="${getCardImagePath(card)}" alt="${card.name}"
                     onerror="this.style.display='none'">
              </div>
              <div class="card-info">
                <div class="card-name-row">
                  <div class="card-name">${card.name}</div>
                  <div class="card-position ${posClass}">${posText}</div>
                </div>

                <div class="card-keywords">${card.keywords ? card.keywords.split('、').slice(0, 3).join(' · ') : ''}</div>
                <div class="card-position-label">${(this.SPREAD_CONFIG[this.currentSpread] || this.SPREAD_CONFIG.single).positions[i] || ''}</div>
            </div>
          </div>
        </div>
        </div>
      `;
    }).join('');
  },

  showInterpretButton() {
    const ib2 = document.querySelector('.interaction-bar'); if (ib2) ib2.classList.add('visible');
  },

  // ============ 解读（核心优化） ============
  async getInterpretation() {
    // 防连击：已经在解读中则忽略
    if (this._interpreting) return;
    this._interpreting = true;

    // 预校验
    if (!this.drawnCards || this.drawnCards.length === 0) {
      this._interpreting = false;
      this.showToast('请先抽牌');
      return;
    }

    // 同步问题
    this.syncQuestion();

    // 按钮视觉反馈
    const btn = document.getElementById('btnInterpret');
    btn.classList.add('loading');
    btn.disabled = true;

    this.showLoading('✨ 塔罗能量正在流动，解读中...');

    try {
      const resp = await fetch(`${API_BASE}/reading`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          question: this.currentQuestion,
          questioner: (document.getElementById("questionerInput").value.trim() || ""),
          cards: this.drawnCards,
          spread: this.currentSpread
        })
      });
      const data = await resp.json();
      this.hideLoading();

      if (!data.success) {
        if (data.error === 'free_tarot_limit') {
          this.showHtml(
            '<div style="text-align:center;padding:40px 20px;">' +
            '<div style="font-size:48px;margin-bottom:16px;">🔮</div>' +
            '<h3 style="margin:0 0 12px;color:#a78bfa;">免费次数已用完</h3>' +
            '<p style="margin:0 0 20px;color:#888;font-size:14px;line-height:1.8;">' +
            '你的免费塔罗解读次数已用完。升级VIP后可无限使用<br>' +
            '塔罗解读 · 玛雅天赋 · 灵修阅读 · 心理测评等全部功能。</p>' +
            '<a href="https://xianbao.online/vip.html" target="_blank" ' +
            'style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#a78bfa,#f472b6);' +
            'color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">' +
            '✨ 了解VIP会员</a></div>'
          );
        } else {
          const msg = data.error === 'need_login'
            ? '请先登录后使用塔罗解读'
            : (data.error || '解读生成失败，请稍后重试');
          this.showToast(msg);
        }
        this._interpreting = false;
        btn.classList.remove('loading');
        btn.disabled = false;
        return;
      }

      this.showInterpretation(data.data.interpretation);
    } catch (e) {
      this.hideLoading();
      this.showToast('网络请求失败，请检查网络后重试');
    }

    this._interpreting = false;
    btn.classList.remove('loading');
    btn.disabled = false;
  },

  _esc: function(s) {
    var div = document.createElement("div");
    div.textContent = s || "";
    return div.innerHTML;
  },

  showInterpretation(text) {
    this.showHtml(this.mdToHtml(text));
  },

  // 直接渲染 HTML 内容到解读区（不经过 Markdown 转换）
  showHtml(html) {
    const area = document.querySelector('.interpretation-area');
    const content = document.getElementById('interpretationContent');
    content.innerHTML = html;
    area.classList.add('visible');
    document.getElementById('btnInterpret').style.display = 'none';
    const actions = document.getElementById('interpretationActions');
    if (actions) actions.style.display = 'flex';
    area.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  // Markdown → HTML 轻量转换（支持更多格式）
  mdToHtml(text) {
    // 先转义 HTML 特殊字符
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 代码块（行内）
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 标题
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // 加粗和斜体（先加粗后斜体避免冲突）
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // 行内分隔线
    html = html.replace(/^---$/gm, '<hr>');

    // 无序列表
    html = html.replace(/^- (.+)$/gm, '• $1');

    // 换行
    html = html.replace(/\n/g, '<br>');

    return html;
  },


  downloadPdf() {
    const content = document.getElementById('interpretationContent');
    const html = this._buildPrintHtml(content.innerHTML);
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.focus();
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
    win.document.title = `星语塔罗_${ts}`;
    win.print();
  },

  _buildPrintHtml(innerHtml) {
    const question = this.currentQuestion;
    const cards = this.drawnCards;
    const spreadName = (this.SPREAD_CONFIG[this.currentSpread] || this.SPREAD_CONFIG.single).label;

    let cardsList = '';
    cards.forEach((c, i) => {
      cardsList += `<li><strong>${c.name}</strong>（${c.arcana}·${c.reversed ? '逆位' : '正位'}）</li>`;
    });

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>星语塔罗·解读报告</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;padding:40px;max-width:700px;margin:0 auto;color:#333;line-height:1.8}
  h1{text-align:center;color:#b8860b;font-size:1.6rem;border-bottom:2px solid #b8860b;padding-bottom:12px}
  h2{color:#b8860b;font-size:1.2rem;margin-top:24px}
  .meta{color:#666;margin:16px 0}
  .cards-list{background:#faf6ef;padding:12px 20px;border-radius:8px;margin:12px 0}
  .interpretation{padding:16px 0;white-space:pre-wrap}
  hr{border:none;border-top:1px solid #ddd;margin:24px 0}
  .footer{text-align:center;color:#999;font-size:0.8rem;margin-top:40px}
</style></head><body>
<h1>✦ 星语塔罗 · 解读报告 ✦</h1>
<div class="meta"><p><strong>提问人：</strong>${this.getQuestioner() || "匿名"}</p>
<p><strong>问题：</strong>${question}</p>
<p><strong>牌阵：</strong>${spreadName}</p></div>
<div class="cards-list"><strong>抽到的牌：</strong><ol>${cardsList}</ol></div>
<hr><div class="interpretation">${innerHtml}</div>
<hr><div class="footer"><p>解读内容仅供参考 · https://tarot.xianbao.online</p></div>
</body></html>`;
  },

  showLoading(msg) {
    document.querySelector('#loadingOverlay .loading-text').textContent = msg || '加载中...';
    document.getElementById('loadingOverlay').classList.add('visible');
  },

  hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('visible');
  },

  showError(msg) {
    document.querySelector('.interpretation-area').classList.add('visible');
    document.getElementById('interpretationContent').textContent = '❌ ' + msg;
  },

  showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2500);
  },

  // ============ 历史记录 ============
  historyPage: 1,

  async openHistory() {
    document.getElementById('historyModal').classList.add('visible');
    document.body.style.overflow = 'hidden';
    this.historyPage = 1;
    document.getElementById('historySearchName').value = '';
    document.getElementById('historySearchDate').value = '';
    await this.loadHistory();
  },

  closeHistory() {
    document.getElementById('historyModal').classList.remove('visible');
    document.body.style.overflow = '';
  },

  searchHistory() {
    this.historyPage = 1;
    this.loadHistory();
  },

  async loadHistory() {
    const tbody = document.getElementById('historyTableBody');
    const thead = document.getElementById('historyTableHead');
    const pag = document.getElementById('historyPagination');
    tbody.innerHTML = '<tr><td colspan="6" class="history-loading">加载中...</td></tr>';
    pag.innerHTML = '';

    const name = document.getElementById('historySearchName').value.trim();
    const date = document.getElementById('historySearchDate').value;

    let url = '/api/readings?page=' + this.historyPage + '&limit=15';
    if (name) url += '&questioner=' + encodeURIComponent(name);
    if (date) url += '&date=' + encodeURIComponent(date);

    try {
      const resp = await fetch(url, { credentials: 'include' });
      const data = await resp.json();

      const spreadNames = { single: '单张', three: '三张', horseshoe: '马蹄', relationship: '关系', celtic: '凯尔特十字' };

      if (!data.success) {
        thead.innerHTML = '';
        tbody.innerHTML = '<tr><td colspan="6" class="history-empty">' + (data.error === '未登录' ? '请先登录后查看记录' : '加载失败') + '</td></tr>';
        return;
      }

      const readings = data.data.readings;
      if (!readings || readings.length === 0) {
        thead.innerHTML = '';
        tbody.innerHTML = '<tr><td colspan="6" class="history-empty">暂无记录</td></tr>';
        return;
      }

      // Table header
      let cols = ['时间', '问题'];
      if (data.data.isAdmin) cols.push('用户');
      cols.push('提问人', '牌阵', '操作');
      thead.innerHTML = '<tr>' + cols.map(c => '<th>' + c + '</th>').join('') + '</tr>';

      // Rows
      tbody.innerHTML = readings.map(r => {
        const time = (r.created_at || '').replace('T', ' ').substring(0, 16);
        const spreadLabel = spreadNames[r.spread] || r.spread;
        const question = this.escapeHtml((r.question || '').substring(0, 25)) + ((r.question || '').length > 25 ? '...' : '');
        const questioner = this.escapeHtml(r.questioner || '-');

        let row = '<tr class="history-row" onclick="TarotApp.viewReading(' + r.id + ')">';
        row += '<td class="td-time">' + time + '</td>';
        row += '<td class="td-question">' + question + '</td>';
        if (data.data.isAdmin) row += '<td class="td-user">' + (r.username || '用户' + r.user_id) + '</td>';
        row += '<td class="td-questioner">' + questioner + '</td>';
        row += '<td class="td-spread">' + spreadLabel + '</td>';
        row += '<td class="td-action"><button class="history-view-btn" onclick="event.stopPropagation();TarotApp.viewReading(' + r.id + ')">查看</button></td>';
        row += '</tr>';
        return row;
      }).join('');

      // Pagination
      const totalPages = data.data.totalPages;
      if (totalPages > 1) {
        let pagHtml = '';
        if (this.historyPage > 1) {
          pagHtml += '<button class="pag-btn" onclick="TarotApp.historyPage=' + (this.historyPage - 1) + ';TarotApp.loadHistory()">← 上一页</button>';
        }
        pagHtml += '<span class="pag-info">' + this.historyPage + ' / ' + totalPages + '</span>';
        if (this.historyPage < totalPages) {
          pagHtml += '<button class="pag-btn" onclick="TarotApp.historyPage=' + (this.historyPage + 1) + ';TarotApp.loadHistory()">下一页 →</button>';
        }
        pag.innerHTML = pagHtml;
      }
    } catch (e) {
      thead.innerHTML = '';
      tbody.innerHTML = '<tr><td colspan="6" class="history-empty">网络错误</td></tr>';
    }
  },  reset() {
    this.drawnCards = [];
    this.selectedCardsCount = 0;
    this.currentQuestion = '';
    this._interpreting = false;

    const da = document.querySelector('.draw-area'); if (da) da.classList.remove('visible');
    const ia = document.querySelector('.interpretation-area'); if (ia) ia.classList.remove('visible');
    document.getElementById('interpretationContent').innerHTML = '';
    const actEl = document.getElementById('interpretationActions');
    if (actEl) actEl.style.display = 'none';
    const ib = document.querySelector('.interaction-bar'); if (ib) ib.classList.remove('visible');
    document.getElementById('questionInput').value = '';
    document.getElementById('questionInput').focus();

    // 清空步骤3卡片展示
    const cd = document.getElementById('cardDisplay');
    if (cd) cd.innerHTML = '';

    // 恢复按钮
    const btn = document.getElementById('btnInterpret');
    btn.style.display = '';
    btn.classList.remove('loading');
    btn.disabled = false;

    // 滚动到占卜流程区
    const readEl = document.getElementById("read");
    if (readEl) readEl.scrollIntoView({ behavior: "smooth", block: "start" });
  },

  // ============ 线上抽牌模式 ============
  drawMode: false,
  drawDeckCards: [],

  toggleDrawMode() {
    const question = this.syncQuestion();
    if (!question) return;
    
    // 桌面端（>768px）→ iframe 弹窗
    if (window.innerWidth > 768) {
      this.startFanDraw();
      return;
    }
    
    // 移动端 → 现有弹窗
    this.drawMode = true;
    this.drawnCards = [];
    this.drawDeckCards = [];
    this.initDrawDeck();
    document.getElementById('drawDeckModal').classList.add('visible');
    document.body.style.overflow = 'hidden';
  },

  closeDrawDeck() {
    this.drawMode = false;
    document.getElementById('drawDeckModal').classList.remove('visible');
    document.body.style.overflow = '';
    this.drawDeckCards = [];
  },

  drawDeckAllCards: [],  // 所有78张牌的数据
  drawDeckPage: 0,      // 当前页码
  drawDeckPerPage: 78,  // 每页24张

  initDrawDeck() {
    const container = document.getElementById('drawDeck');
    const infoArea = document.getElementById('drawnCardInfo');
    
    this.drawDeckCards = [];
    this.drawDeckAllCards = [];
    this.drawDeckPage = 0;
    
    const config = this.SPREAD_CONFIG[this.currentSpread];
    const maxCards = config.count;
    
    // 更新标题和状态
    document.getElementById('drawDeckTitle').textContent = config.label + '（0/' + maxCards + '）';
    
    // 创建78张牌，随机排列
    const deck = [...Array(78).keys()];
    this.shuffleArray(deck);
    
    // 预创建所有牌的数据
    var self = this;
    deck.forEach(function(cardIndex, i) {
      self.drawDeckAllCards.push({
        index: cardIndex,
        position: i,
        seq: i + 1,
        flipped: false,
        reversed: false,
        imgSrc: self.getCardImageByIndex(cardIndex)
      });
    });
    
    // 渲染第一页
    this.renderDrawDeckPage();
  },

  renderDrawDeckPage() {
    var self = this;
    var container = document.getElementById('drawDeck');
    container.innerHTML = '';
    
    var start = this.drawDeckPage * this.drawDeckPerPage;
    var end = Math.min(start + this.drawDeckPerPage, 78);
    var items = this.drawDeckAllCards.slice(start, end);
    
    items.forEach(function(data) {
      var card = document.createElement('div');
      card.className = 'deck-card' + (data.flipped ? ' flipped' : '');
      card.dataset.origIdx = data.position;
      if (data.reversed) {
        card.innerHTML = '<div class="deck-card-inner">' +
          '<div class="deck-card-front"><img src="/assets/cards/card_back.jpg" alt="牌背面"><div class="deck-number">' + data.seq + '</div></div>' +
          '<div class="deck-card-back reversed"><img src="' + data.imgSrc + '" alt="牌面"></div>' +
          '</div>';
      } else {
        card.innerHTML = '<div class="deck-card-inner">' +
          '<div class="deck-card-front"><img src="/assets/cards/card_back.jpg" alt="牌背面"><div class="deck-number">' + data.seq + '</div></div>' +
          '<div class="deck-card-back"><img src="' + data.imgSrc + '" alt="牌面"></div>' +
          '</div>';
      }
      card.addEventListener('click', function() { self.flipDeckCard(card); });
      container.appendChild(card);
    });
    
    // 分页控件
    this.renderDrawPagination();
  },

  renderDrawPagination() {
    var pagEl = document.getElementById('drawDeckPag');
    if (!pagEl) return;
    var totalPages = Math.ceil(78 / this.drawDeckPerPage);
    if (totalPages <= 1) { pagEl.innerHTML = ''; return; }
    
    var self = this;
    var html = '';
    html += '<button class="pag-arrow" ' + (this.drawDeckPage === 0 ? 'disabled' : '') + ' onclick="TarotApp.goDrawPage(' + (this.drawDeckPage - 1) + ')">◀</button>';
    html += '<span class="pag-info">' + (this.drawDeckPage + 1) + ' / ' + totalPages + '</span>';
    html += '<button class="pag-arrow" ' + (this.drawDeckPage >= totalPages - 1 ? 'disabled' : '') + ' onclick="TarotApp.goDrawPage(' + (this.drawDeckPage + 1) + ')">▶</button>';
    pagEl.innerHTML = html;
  },

  goDrawPage(page) {
    this.drawDeckPage = page;
    this.renderDrawDeckPage();
  },

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  },

  getCardImageByIndex(index) {
    if (this.allCardsData && this.allCardsData[index]) {
      return getCardImagePath(this.allCardsData[index]);
    }
    return '/assets/cards/card_back.jpg';
  },

  flipDeckCard(cardElement) {
    if (cardElement.classList.contains('flipped')) return;
    
    const config = this.SPREAD_CONFIG[this.currentSpread];
    const maxCards = config.count;
    
    if (this.drawDeckCards.length >= maxCards) {
      this.showToast('该牌阵只需 ' + maxCards + ' 张牌');
      return;
    }
    
    var origIdx = parseInt(cardElement.dataset.origIdx);
    var deckData = this.drawDeckAllCards[origIdx];
    if (!deckData) return;
    
    var cardIndex = deckData.index;
    const card = this.allCardsData[cardIndex];
    if (!card) return;
    
    cardElement.classList.add('flipped');
    deckData.flipped = true;
    
    const reversed = Math.random() < 0.3;
    if (reversed) {
      cardElement.querySelector('.deck-card-back').classList.add('reversed');
      deckData.reversed = true;
    }
    
    const drawnCard = { ...card, reversed };
    this.drawDeckCards.push(drawnCard);
    this.drawnCards.push(drawnCard);
    
    // 更新状态显示
    document.getElementById('drawDeckTitle').textContent = config.label + '（' + this.drawDeckCards.length + '/' + maxCards + '）';
    
    // 显示抽到的牌
    this.showDrawnCardInfo();
    
    // 如果已抽够牌数，自动显示牌局
    if (this.drawDeckCards.length === maxCards) {
      setTimeout(() => {
        this.closeDrawDeck();
        this.displayCards(this.drawnCards);
        this.showInterpretButton();
        this.showToast('已完成抽牌，请查看牌局');
      }, 800);
    }
  },

  showDrawnCardInfo() {
    const infoArea = document.getElementById('drawnCardInfo');
    if (!infoArea) return;
    const config = this.SPREAD_CONFIG[this.currentSpread];
    const positions = config.positions;
    
    let html = '<div class="drawn-cards-list">';
    this.drawDeckCards.forEach((card, i) => {
      const pos = positions[i] || '牌' + (i + 1);
      const status = card.reversed ? '逆位' : '正位';
      html += '<div class="drawn-card-item"><span class="pos">' + pos + '</span> ' + card.name + ' · ' + status + '</div>';
    });
    html += '</div>';
    html += '<div class="draw-progress">已选 ' + this.drawDeckCards.length + ' / ' + config.count + ' 张</div>';
    
    infoArea.innerHTML = html;
    infoArea.classList.add('visible');
  },

  async viewReading(id) {
    try {
      const resp = await fetch('/api/readings/' + id, { credentials: 'include' });
      const data = await resp.json();
      if (!data.success) {
        alert(data.error || '加载失败');
        return;
      }
      const r = data.data;
      const spreadNames = { single: '单张指引', three: '三张牌阵', horseshoe: '马蹄牌阵', relationship: '关系牌阵', celtic: '凯尔特十字' };
      const time = (r.created_at || '').replace('T', ' ').substring(0, 16);
      const questioner = this.escapeHtml(r.questioner || '-');
      const question = this.escapeHtml(r.question || '-');
      const spread = spreadNames[r.spread] || r.spread;
      const readingHtml = this.mdToHtml(r.interpretation || '');
      const cardsHtml = (r.cards_json || []).map(c => '<div class="history-mini-card' + (c.reversed ? ' reversed' : '') + '">' + this.escapeHtml(c.name) + (c.reversed ? ' · 逆位' : ' · 正位') + '</div>').join('');

      document.getElementById('historyDetailTitle').textContent = '📖 解读详情';
      document.getElementById('historyDetailContent').innerHTML =
        '<div class="history-detail-meta">' +
          '<p><strong>⏰ 时间</strong> ' + time + '</p>' +
          '<p><strong>👤 提问人</strong> ' + questioner + '</p>' +
          '<p><strong>📝 问题</strong> ' + question + '</p>' +
          '<p><strong>🃏 牌阵</strong> ' + spread + '</p>' +
          (cardsHtml ? '<div class="history-cards-mini">' + cardsHtml + '</div>' : '') +
        '</div>' +
        '<div class="history-detail-reading">' + readingHtml + '</div>';

      document.getElementById('historyDetailModal').classList.add('visible');
      document.body.style.overflow = 'hidden';
    } catch (e) {
      alert('网络错误：' + e.message);
    }
  },

  closeHistoryDetail() {
    document.getElementById('historyDetailModal').classList.remove('visible');
    document.body.style.overflow = '';
  },

  downloadHistoryPdf() {
    const title = document.getElementById('historyDetailTitle').textContent;
    const content = document.getElementById('historyDetailContent').innerHTML;
    const now = new Date();
    const ts = now.getFullYear() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + '_' + String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0');

    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + title + '_' + ts + '</title><style>' +
      'body{font-family:"Microsoft YaHei",sans-serif;max-width:700px;margin:40px auto;padding:0 20px;color:#222;line-height:1.8}' +
      'h1{text-align:center;color:#2d1b69;border-bottom:2px solid #d4a853;padding-bottom:12px}' +
      '.meta{padding:16px 0;border-bottom:1px solid #ddd;margin-bottom:20px}' +
      '.meta p{margin:6px 0;font-size:0.95rem}' +
      '.meta strong{color:#2d1b69}' +
      '.cards{margin:12px 0}' +
      '.card-tag{display:inline-block;padding:3px 10px;border:1px solid #d4a853;border-radius:4px;color:#d4a853;margin-right:6px;font-size:0.85rem}' +
      '.reading{font-size:0.95rem}' +
      '.reading h2,.reading h3{color:#2d1b69;margin:16px 0 8px}' +
      '@media print{body{margin:0;padding:0}}' +
      '</style></head><body><h1>' + title + '</h1>' +
      '<div class="meta">' + content.split('<div class="history-detail-reading">')[0].replace(/history-detail-meta/g,'meta').replace(/history-cards-mini/g,'cards').replace(/history-mini-card/g,'card-tag').replace(/ reversed/g,'').replace('history-detail-reading','reading') + '</div>' +
      '<div class="reading">' + (content.split('<div class="history-detail-reading">')[1] || '').replace('</div></div>','') + '</div>' +
      '</body></html>';

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.focus();
    win.document.title = title + '_' + ts;
    setTimeout(() => win.print(), 500);
  },

  // ============ 扇形抽牌 iframe 弹窗 ============
  _fanStorageHandler: null,

  startFanDraw() {
    var config = this.SPREAD_CONFIG[this.currentSpread] || this.SPREAD_CONFIG.single;
    var params = new URLSearchParams();
    params.set('spread', this.currentSpread);
    params.set('count', config.count);
    params.set('question', this.currentQuestion);
    var questioner = document.getElementById('questionerInput').value.trim();
    if (questioner) params.set('questioner', questioner);

    var iframe = document.getElementById('drawFrame');
    iframe.src = 'draw.html?' + params.toString();

    document.getElementById('drawFanModal').classList.add('visible');
    document.body.style.overflow = 'hidden';

    var self = this;

    // 监听 iframe 写入 localStorage 完成抽牌
    this._fanStorageHandler = function(e) {
      if (e.key === 'tarotDrawSession') {
        window.removeEventListener('storage', self._fanStorageHandler);
        self._fanStorageHandler = null;
        self.closeFanDraw();
        // 延迟等数据加载
        setTimeout(function() { self.processDrawSession(); }, 200);
      }
    };
    window.addEventListener('storage', this._fanStorageHandler);

    // 检测 iframe 导航（❌取消或导航回 index.html）
    iframe.onload = function() {
      try {
        iframe.style.height = iframe.contentWindow.document.body.scrollHeight + 'px';
      } catch(e) {}
      try {
        var url = iframe.contentWindow.location.href;
        if (url.indexOf('index.html') >= 0) {
          if (self._fanStorageHandler) {
            window.removeEventListener('storage', self._fanStorageHandler);
            self._fanStorageHandler = null;
          }
          self.closeFanDraw();
        }
      } catch(e) {}
    };

    // 弹窗 ❌ 按钮
    document.getElementById('fanBackBtn').onclick = function() {
      if (self._fanStorageHandler) {
        window.removeEventListener('storage', self._fanStorageHandler);
        self._fanStorageHandler = null;
      }
      self.closeFanDraw();
    };
  },

  closeFanDraw() {
    document.getElementById('drawFanModal').classList.remove('visible');
    document.body.style.overflow = '';
    if (this._fanStorageHandler) {
      window.removeEventListener('storage', this._fanStorageHandler);
      this._fanStorageHandler = null;
    }
    var iframe = document.getElementById('drawFrame');
    if (iframe) iframe.src = 'about:blank';
  },
};

document.addEventListener('DOMContentLoaded', () => TarotApp.init());

// 注入shake动画
const s = document.createElement('style');
s.textContent = `
  @keyframes shake {
    0%,100%{transform:translateX(0)}
    20%{transform:translateX(-8px)}
    40%{transform:translateX(8px)}
    60%{transform:translateX(-5px)}
    80%{transform:translateX(5px)}
  }
  @keyframes toastIn {
    from{opacity:0;transform:translateY(20px)}
    to{opacity:1;transform:translateY(0)}
  }
`;
document.head.appendChild(s);
/* ============ Canvas 星空背景 ============ */
(function initStars() {
  const canvas = document.getElementById('stars-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let stars = [];
  let w, h;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // 生成星星
  for (let i = 0; i < 120; i++) {
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 2 + 0.5,
      alpha: Math.random(),
      speed: Math.random() * 0.3 + 0.1,
      phase: Math.random() * Math.PI * 2
    });
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    stars.forEach(s => {
      s.alpha += (Math.sin(Date.now() * 0.001 + s.phase) + 1) * 0.005;
      s.alpha = Math.max(0.1, Math.min(1, s.alpha));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, ' + s.alpha.toFixed(2) + ')';
      ctx.fill();
      // 大星星加光晕
      if (s.r > 1.5) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(201, 168, 76, ' + (s.alpha * 0.15).toFixed(2) + ')';
        ctx.fill();
      }
    });
    requestAnimationFrame(draw);
  }
  draw();
})();


/* ============ 热门牌阵点击 - 滚动到占卜区并切换牌阵 ============ */
(function initSpreadCards() {
  document.querySelectorAll('.spread-card').forEach((card, i) => {
    card.addEventListener('click', () => {
      document.getElementById('read').scrollIntoView({ behavior: 'smooth' });
      const spreads = ['single', 'three', 'celtic', 'relationship'];
      const spread = spreads[i] || 'single';
      // spread-options now in dropdown
      options.forEach(o => o.classList.remove('active'));
      // spread now selected via dropdown
      if (target) {
        target.classList.add('active');
        TarotApp.currentSpread = spread;
        TarotApp.updateSpreadDetail();
      }
    });
  });
})();