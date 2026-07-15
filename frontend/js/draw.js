// ===== 抽牌页逻辑 =====
var DrawPage = {
  allCards: [],
  drawnCards: [],

  async init() {
    await this.loadCards();
    this.buildArcs();
    this.initHoverDetection();
  },

  async loadCards() {
    try {
      var resp = await fetch('/api/cards');
      var data = await resp.json();
      this.allCards = data.data || data;
    } catch (e) {
      for (var i = 0; i < 78; i++) {
        this.allCards.push({ id: i, name: 'Card' + (i + 1), number: i, arcana: '大阿卡纳' });
      }
    }
    this.shuffle(this.allCards);
  },

  buildArcs() {
    var self = this;
    var container = document.getElementById('fan-row-1');
    var arcs = [
      { radius: 600, count: 48, startIdx: 0 },
      { radius: 400, count: 30, startIdx: 48 },
      { radius: 200, count: 0, startIdx: 78 }
    ];
    
    var cx = 960, cy = 700;
    var cardW = 80, cardH = 150;
    
    var cardIdx = 0;
    arcs.forEach(function(arc) {
      var totalAngle = 120;
      var halfAngle = totalAngle / 2;
      var step = totalAngle / (arc.count - 1);
      
      for (var j = 0; j < arc.count; j++) {
        var angleDeg = -90 - halfAngle + j * step;
        var angleRad = angleDeg * Math.PI / 180;
        
        var x = cx + arc.radius * Math.cos(angleRad);
        var y = cy + arc.radius * Math.sin(angleRad);
        var rot = angleDeg + 90;
        
        var card = self.allCards[cardIdx];
        
        var div = document.createElement('div');
        div.className = 'fan-card';
        div.style.left = (x - cardW / 2) + 'px';
        div.style.top = (y - cardH / 2) + 'px';
        div.style.setProperty('--r', rot + 'deg');
        // Radial outward offset for hover
        var ox = Math.cos(angleRad) * 10;
        var oy = Math.sin(angleRad) * 10;
        div.style.setProperty('--ox', ox + 'px');
        div.style.setProperty('--oy', oy + 'px');
        div.style.transform = 'rotate(var(--r, 0deg))';
        div.dataset.idx = cardIdx;
        div.dataset.seq = cardIdx + 1;
        div.dataset.angle = angleDeg;
        div.dataset.radius = arc.radius;
        div.innerHTML = '<img class="fan-card-img" src="/assets/cards/card_back.jpg">';
        
        (function(c, el) {
          el.addEventListener('click', function() { self.pickCard(c, el); });
        })(card, div);
        
        container.appendChild(div);
        cardIdx++;
      }
    });
  },

  initHoverDetection: function() {
    var self = this;
    var row = document.getElementById('fan-row-1');
    var cx = 960, cy = 700;
    var cards = row.querySelectorAll('.fan-card');
    
    // Build angle->card map for each arc
    var arcGroups = {};
    cards.forEach(function(el) {
      var r = parseFloat(el.dataset.radius);
      if (!arcGroups[r]) arcGroups[r] = [];
      arcGroups[r].push(el);
    });
    
    row.addEventListener('mousemove', function(e) {
      var rect = row.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      
      // Angle from arc center to mouse
      var dx = mx - cx;
      var dy = my - cy;
      var mouseAngle = Math.atan2(dy, dx) * 180 / Math.PI;
      var mouseDist = Math.sqrt(dx * dx + dy * dy);
      
      // Find best card: check each arc from inner (on top) to outer
      var hit = null;
      var radii = Object.keys(arcGroups).map(Number).sort(function(a,b) { return a - b; }); // inner first = on top
      
      for (var ri = 0; ri < radii.length; ri++) {
        var group = arcGroups[radii[ri]];
        var r = radii[ri];
        
        // Distance check: within ~100px of this arc's radius
        if (mouseDist < r - 120 || mouseDist > r + 120) continue;
        
        // Find closest card by angle
        var best = null, bestDiff = Infinity;
        for (var ci = 0; ci < group.length; ci++) {
          var cardAngle = parseFloat(group[ci].dataset.angle);
          var diff = Math.abs(mouseAngle - cardAngle);
          if (diff > 180) diff = 360 - diff;
          if (diff < bestDiff) {
            bestDiff = diff;
            best = group[ci];
          }
        }
        
        // Check if mouse is within the angular width of this card
        // Card angular half-width ~ half of step
        if (best && bestDiff < 1.5) {
          hit = best;
          break; // inner arc wins
        }
      }
      
      // Update hovered class
      cards.forEach(function(el) { el.classList.remove('hovered'); });
      if (hit) hit.classList.add('hovered');
    });
    
    // Remove on mouseleave
    row.addEventListener('mouseleave', function() {
      cards.forEach(function(el) { el.classList.remove('hovered'); });
    });
  },

  getCardFace: function(card) {
    var num = card.number;
    var arcana = card.arcana;
    
    if (arcana === '大阿卡纳' && num >= 0 && num <= 21) {
      var names = ['Fool','Magician','High_Priestess','Empress','Emperor','Hierophant','Lovers','Chariot','Strength','Hermit','Wheel_of_Fortune','Justice','Hanged_Man','Death','Temperance','Devil','Tower','Star','Moon','Sun','Judgement','World'];
      return '/assets/cards/RWS_Tarot_' + String(num).padStart(2, '0') + '_' + names[num] + '.jpg';
    }
    
    var suitMap = {
      '小阿卡纳—权杖': 'Wands',
      '小阿卡纳—圣杯': 'Cups',
      '小阿卡纳—宝剑': 'Swords',
      '小阿卡纳—星币': 'Pents'
    };
    var suit = suitMap[arcana];
    if (suit && num >= 1 && num <= 14) {
      return '/assets/cards/' + suit + String(num).padStart(2, '0') + '.jpg';
    }
    
    return '/assets/cards/card_back.jpg';
  },

  shuffle: function(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
  },

  pickCard: function(card, el) {
    if (!card || card._dimmed) return;
    card._dimmed = true;
    
    var self = this;
    var imgSrc;
    
    // Flip at current hover scale
    el.classList.add('flipping');
    var row = el.parentElement;
    if (row) row.classList.add('flipping');
    el.style.pointerEvents = 'none';
    el.style.setProperty('transform', 'translate(var(--ox), var(--oy)) rotate(var(--r, 0deg))', 'important');
    el.style.setProperty('box-shadow', '0 0 20px var(--gold)', 'important');
    el.style.setProperty('z-index', '9999', 'important');
    
    setTimeout(function() {
      imgSrc = self.getCardFace(card);
      var img = el.querySelector('.fan-card-img');
      if (img) img.src = imgSrc;
    }, 250);
    
    // Keep flipping class showing for z-index
    
    // === 3s 飞行动画 ===
    setTimeout(function() {
      var slot = document.querySelector('.drawn-slot:not([data-filled="true"])');
      if (!slot) { el.remove(); return; }
      
      // 去掉翻转类
      el.classList.remove('flipping');
      var row = el.parentElement;
      if (row) row.classList.remove('flipping');
      
      // 起飞时标记槽位已占用，防止多卡抢同一槽
      slot.dataset.filled = 'true';
      
      // 取当前位置和槽位坐标
      var cr = el.getBoundingClientRect();
      var sr = slot.getBoundingClientRect();
      var cx = cr.left + cr.width / 2;
      var cy = cr.top + cr.height / 2;
      var dx = sr.left + sr.width / 2 - cx;
      var dy = sr.top + sr.height / 2 - cy;
      
      // 冻结：位置固定，104x195
      el.style.cssText = 'position:fixed;left:' + (cx - 52) + 'px;top:' + (cy - 97.5) + 'px;' +
        'width:104px;height:195px;margin:0;border-radius:8px;z-index:99999;' +
        'box-shadow:0 0 20px var(--gold);' +
        'transform:translate(0,0);transition:none;pointer-events:none';
      
      // 3秒直线飞行（尺寸不变，不偏转）
      void el.offsetHeight;
      el.style.transition = 'transform 3s linear';
      el.style.setProperty('transform', 'translate(' + dx + 'px,' + dy + 'px)', 'important');
      
      // 到达后：卡已在槽位，直接填槽，不需过渡
      setTimeout(function() {
        slot.className = 'drawn-card';
        slot.innerHTML = '<img src="' + imgSrc + '">';
        self.drawnCards.push(card);
        el.remove();
      }, 3000);
    }, 1000);
  }
};

window.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() { DrawPage.init(); }, 300);
});
