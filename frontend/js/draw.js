// ===== 抽牌页逻辑 =====
var DrawPage = {
  allCards: [],
  drawnCards: [],

  async init() {
    await this.loadCards();
    this.buildArcs();
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
      { radius: 2000, count: 28, startIdx: 0 },
      { radius: 1800, count: 26, startIdx: 28 },
      { radius: 1600, count: 24, startIdx: 54 }
    ];
    
    var cx = 960, cy = 2100;
    var cardW = 80, cardH = 150;
    
    var cardIdx = 0;
    arcs.forEach(function(arc) {
      var totalAngle = 30;
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
        div.style.transform = 'rotate(var(--r, 0deg))';
        div.dataset.idx = cardIdx;
        div.dataset.seq = cardIdx + 1;
        div.innerHTML = '<img class="fan-card-img" src="/assets/cards/card_back.jpg"><div class="fan-card-hover-num">' + (cardIdx + 1) + '</div>';
        
        (function(c, el) {
          el.addEventListener('click', function() { self.pickCard(c, el); });
        })(card, div);
        
        container.appendChild(div);
        cardIdx++;
      }
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
    el.style.setProperty('transform', 'scale(1.3) rotate(var(--r, 0deg))', 'important');
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
      
      // 取当前旋转角度
      var rot = getComputedStyle(el).getPropertyValue('--r').trim() || '0deg';
      
      // 冻结：位置固定，104x195，带旋转
      el.style.cssText = 'position:fixed;left:' + (cx - 52) + 'px;top:' + (cy - 97.5) + 'px;' +
        'width:104px;height:195px;margin:0;border-radius:8px;z-index:99999;' +
        'box-shadow:0 0 20px var(--gold);' +
        'transform:translate(0,0) rotate(' + rot + ');transition:none;pointer-events:none';
      
      // 3秒直线飞行（尺寸/角度不变）
      void el.offsetHeight;
      el.style.transition = 'transform 3s linear';
      el.style.setProperty('transform', 'translate(' + dx + 'px,' + dy + 'px) rotate(' + rot + ')', 'important');
      
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
