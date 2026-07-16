// ===== 抽牌页逻辑（集成版）=====
var DrawPage = {
  allCards: [],
  drawnCards: [],
  maxCount: 3,       // 牌阵所需牌数
  spread: 'three',    // 牌阵类型
  question: '',
  questioner: '',

  async init() {
    // 读取 URL 参数
    var params = new URLSearchParams(window.location.search);
    this.spread = params.get('spread') || 'three';
    this.maxCount = parseInt(params.get('count')) || 3;
    this.question = params.get('question') || '当下指引';
    this.questioner = params.get('questioner') || '';

    // 根据牌数动态调整槽位
    this.adjustSlots();

    await this.loadCards();
    this.buildArcs();
    this.initHoverDetection();




  },

  adjustSlots() {
    var scroll = document.getElementById('drawn-scroll');
    var slots = scroll.querySelectorAll('.drawn-slot');
    // 隐藏多余的槽位
    slots.forEach(function(s, i) {
      s.style.display = (i < DrawPage.maxCount) ? '' : 'none';
    });
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
    // 分配正逆位
    for (var i = 0; i < this.allCards.length; i++) {
      this.allCards[i].isReversed = Math.random() < 0.5;
    }
  },

  buildArcs() {
    var self = this;
    var container = document.getElementById('fan-row-1');
    // 根据视口宽度调整扇形半径
    var arcs = [
      { radius: 400, count: 52, startIdx: 0 },
      { radius: 200, count: 26, startIdx: 52 }
    ];

    var cardW = 80, cardH = 150;
    var cx = window.innerWidth / 2;
    var headerEl = document.querySelector(".draw-header");
    var headerH = headerEl ? headerEl.offsetHeight : 30;
    var barH = 250;
    var availMid = headerH + (window.innerHeight - headerH - barH) / 2;
    var cy = availMid + 200;

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
        var ox = Math.cos(angleRad) * 10;
        var oy = Math.sin(angleRad) * 10;
        div.style.setProperty('--ox', ox + 'px');
        div.style.setProperty('--oy', oy + 'px');
        div.style.transform = 'rotate(var(--r, 0deg))';
        div.dataset.idx = cardIdx;
        div.dataset.seq = cardIdx + 1;
        div.dataset.angle = angleDeg;
        div.dataset.radius = arc.radius;
        var faceSrc = self.getCardFace(card);
        var revClass = card.isReversed ? ' reversed' : '';
        div.innerHTML = '<div class="fan-card-inner">' +
          '<div class="fan-card-front">' +
            '<img class="fan-card-img" src="/assets/cards/card_back.jpg">' +
            '<div class="fan-card-hover-num">' + (cardIdx + 1) + '</div>' +
          '</div>' +
          '<div class="fan-card-back' + revClass + '">' +
            '<img class="fan-card-face-img" src="' + faceSrc + '">' +
          '</div>' +
        '</div>';

        (function(c, el) {
          el.addEventListener('click', function() { self.pickCard(c, el); });
        })(card, div);

        container.appendChild(div);
        cardIdx++;
      }
    });

    // 更新扇形中心Y偏移（适配视口）
    document.documentElement.style.setProperty('--fan-cy', cy + 'px');
  },

  initHoverDetection: function() {
    var self = this;
    var row = document.getElementById('fan-row-1');
    var cx = window.innerWidth / 2;
    var cy = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--fan-cy')) || 500;
    var cards = row.querySelectorAll('.fan-card');

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

      var dx = mx - cx;
      var dy = my - cy;
      var mouseAngle = Math.atan2(dy, dx) * 180 / Math.PI;
      var mouseDist = Math.sqrt(dx * dx + dy * dy);

      var hit = null;
      var radii = Object.keys(arcGroups).map(Number).sort(function(a,b) { return a - b; });

      for (var ri = 0; ri < radii.length; ri++) {
        var group = arcGroups[radii[ri]];
        var r = radii[ri];

        if (mouseDist < r - 120 || mouseDist > r + 120) continue;

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

        if (best && bestDiff < 1.5) {
          hit = best;
          break;
        }
      }

      cards.forEach(function(el) { el.classList.remove('hovered'); });
      if (hit) hit.classList.add('hovered');
    });

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
    if (this.drawnCards.length >= this.maxCount) return;

    card._dimmed = true;
    this.drawnCards.push(card);

    var self = this;

    // Flip
    el.classList.add('flipping');
    var row = el.parentElement;
    if (row) row.classList.add('flipping');
    el.style.pointerEvents = 'none';
    el.style.setProperty('transform', 'translate(var(--ox), var(--oy)) rotate(var(--r, 0deg))', 'important');
    el.style.setProperty('box-shadow', '0 0 20px var(--gold)', 'important');
    el.style.setProperty('z-index', '9999', 'important');

    el.classList.add('flipped');

    // 3s 飞行动画
    setTimeout(function() {
      var slot = document.querySelector('.drawn-slot:not([data-filled="true"])');
      if (!slot) { el.remove(); return; }

      var imgSrc = self.getCardFace(card);

      el.classList.remove('flipping', 'hovered');
      var row = el.parentElement;
      if (row) row.classList.remove('flipping');

      slot.dataset.filled = 'true';

      var cr = el.getBoundingClientRect();
      var sr = slot.getBoundingClientRect();
      var cx = cr.left + cr.width / 2;
      var cy = cr.top + cr.height / 2;
      var dx = sr.left + sr.width / 2 - cx;
      var dy = sr.top + sr.height / 2 - cy;

      var rotDeg = parseFloat(el.dataset.angle) + 90;
      var curW = cr.width;
      var curH = cr.height;
      el.style.cssText = 'position:fixed;left:' + (cx - 52) + 'px;top:' + (cy - 97.5) + 'px;' +
        'width:104px;height:195px;margin:0;border-radius:8px;z-index:99999;' +
        'box-shadow:0 0 20px var(--gold);' +
        'pointer-events:none;' +
        'transform:rotate(' + rotDeg + 'deg) scale(' + (curW/104) + ',' + (curH/195) + ')';

      void el.offsetHeight;
      el.style.transition = 'transform 1s cubic-bezier(0.25, 0.1, 0.25, 1)';
      el.style.transform = 'none';

      setTimeout(function() {
        el.style.transition = 'transform 3s linear';
        el.style.setProperty('transform', 'translate(' + dx + 'px,' + dy + 'px)', 'important');
      }, 1000);

      setTimeout(function() {
        el.style.position = 'relative';
        el.style.width = '100%';
        el.style.height = '100%';
        el.style.left = 'auto';
        el.style.top = 'auto';
        el.style.margin = '0';
        el.style.transform = 'none';
        el.style.transition = 'none';
        el.style.boxShadow = 'none';
        el.style.zIndex = 'auto';
        el.style.borderRadius = '0';
        el.style.pointerEvents = 'auto';
        el.classList.remove('flipping', 'hovered');

        slot.className = 'drawn-card';
        slot.innerHTML = '';
        slot.appendChild(el);

        // 更新进度

        // 满额 → 自动完成
        if (self.drawnCards.length >= self.maxCount) {
          setTimeout(function() { self.completeDrawing(); }, 500);
        }
      }, 4000);
    }, 1000);
  },

  completeDrawing() {
    // 将已抽牌数据存入 localStorage
    var session = {
      spread: this.spread,
      question: this.question,
      questioner: this.questioner,
      cards: this.drawnCards
    };
    localStorage.setItem('tarotDrawSession', JSON.stringify(session));
    window.location.href = 'index.html';
  }
};

window.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() { DrawPage.init(); }, 300);
});