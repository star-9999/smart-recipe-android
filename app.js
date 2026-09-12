const AI_PROVIDERS = {
  deepseek: {
    label: 'DeepSeek',
    url: 'https://api.deepseek.com/chat/completions',
    textModels: ['deepseek-flash', 'deepseek-reasoner', 'deepseek-chat'],
    visionModels: ['deepseek-flash'],
    defaultModel: 'deepseek-flash',
    site: 'https://platform.deepseek.com',
    keyStorage: 'deepseek_api_key'
  },
  glm: {
    label: '智谱 GLM',
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    textModels: ['glm-4-flash', 'glm-4'],
    visionModels: ['glm-4v', 'glm-4v-flash'],
    defaultModel: 'glm-4-flash',
    site: 'https://open.bigmodel.cn',
    keyStorage: 'glm_api_key'
  }
};

const AI_API = {
  provider: localStorage.getItem('ai_provider') || 'glm',

  get config() {
    return AI_PROVIDERS[this.provider] || AI_PROVIDERS.glm;
  },

  get model() {
    const saved = localStorage.getItem('ai_model');
    if (saved) {
      for (const p of Object.values(AI_PROVIDERS)) {
        if (p.textModels.includes(saved)) return saved;
      }
    }
    return this.config.defaultModel;
  },

  get modelProvider() {
    const m = this.model;
    for (const [id, p] of Object.entries(AI_PROVIDERS)) {
      if (p.textModels.includes(m)) return id;
    }
    return this.provider;
  },

  get visionModel() {
    const saved = localStorage.getItem('ai_vision_model');
    const valid = Object.values(AI_PROVIDERS).flatMap(p => p.visionModels);
    if (saved && valid.includes(saved)) return saved;
    return 'glm-4v';
  },

  setVisionModel(model) {
    const valid = Object.values(AI_PROVIDERS).flatMap(p => p.visionModels);
    if (valid.includes(model)) localStorage.setItem('ai_vision_model', model);
  },

  get key() {
    return localStorage.getItem(this.config.keyStorage) || '';
  },

  get glmKey() {
    return localStorage.getItem(AI_PROVIDERS.glm.keyStorage) || '';
  },

  setProvider(provider) {
    if (!AI_PROVIDERS[provider]) return;
    this.provider = provider;
    localStorage.setItem('ai_provider', provider);
  },

  setModel(model) {
    for (const p of Object.values(AI_PROVIDERS)) {
      if (p.textModels.includes(model)) {
        localStorage.setItem('ai_model', model);
        return;
      }
    }
  },

  setKey(key) {
    localStorage.setItem(this.config.keyStorage, String(key || '').trim());
  },

  async chat(messages) {
    const providerId = this.modelProvider;
    const config = AI_PROVIDERS[providerId] || this.config;
    const key = (localStorage.getItem(config.keyStorage) || '').trim();
    if (!key) {
      throw new Error(`请先在"偏好与 API"中配置 ${config.label} 的 API Key`);
    }
    if (/[^\x00-\xFF]/.test(key)) {
      throw new Error(`${config.label} API Key 包含异常字符（可能混入了中文、空格或换行），请重新从官网复制，只保留 sk- 开头的那串字符`);
    }

    const res = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.7,
        max_tokens: 2200
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API 错误: ${res.status}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || '暂时没有生成结果。';
  },

  async chatVision(imageDataUrl, textPrompt) {
    const model = this.visionModel;
    const providerId = model === 'deepseek-flash' ? 'deepseek' : 'glm';
    const config = AI_PROVIDERS[providerId];
    const key = (localStorage.getItem(config.keyStorage) || '').trim();
    if (!key) {
      throw new Error(`拍照识别需要${config.label} API Key（视觉模型：${model}），请先在"偏好与 API"中配置`);
    }
    if (/[^\x00-\xFF]/.test(key)) {
      throw new Error(`${config.label} API Key 包含异常字符，请重新复制`);
    }

    const res = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: textPrompt },
            { type: 'image_url', image_url: { url: imageDataUrl } }
          ]
        }],
        max_tokens: 1200
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `视觉识别失败（HTTP ${res.status}）`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }
};

const PREFERENCE_PRESETS = {
  light: {
    label: '清爽健康',
    summary: '优先少油、蔬菜更多、汤菜更轻盈。'
  },
  balanced: {
    label: '均衡家常',
    summary: '兼顾营养、口味和食材利用率。'
  },
  protein: {
    label: '高蛋白',
    summary: '优先鸡肉、鱼虾、蛋类和豆制品。'
  },
  quick: {
    label: '省时快手',
    summary: '优先 30 分钟内完成、步骤更稳妥。'
  },
  comfort: {
    label: '香浓满足',
    summary: '更偏向风味饱满、适合下饭的选择。'
  }
};

const CATEGORY_DEFAULTS = {
  肉类: { amount: '300', unit: 'g' },
  蛋奶: { amount: '4', unit: '个' },
  蔬菜: { amount: '2', unit: '个' },
  主食: { amount: '2', unit: '份' },
  调料: { amount: '1', unit: '瓶' },
  '饮品/其他': { amount: '1', unit: '份' },
  其他: { amount: '1', unit: '份' }
};

const COMMON_UNITS = ['g', 'kg', 'ml', 'L', '个', '颗', '根', '条', '块', '片', '瓣', '包', '瓶', '勺', '份'];

const STATUS_META = {
  ready: { label: '库存充足', tone: 'ready' },
  nearly: { label: '补一点就能做', tone: 'nearly' },
  planned: { label: '还缺关键食材', tone: 'planned' },
  idea: { label: '先作备选灵感', tone: 'idea' }
};

const INGREDIENT_LOOKUP = Object.entries(INGREDIENT_CATEGORIES).reduce((acc, [category, subs]) => {
  Object.entries(subs).forEach(([sub, items]) => {
    items.forEach(item => {
      acc[item.name] = { emoji: item.emoji, category, subCategory: sub };
    });
  });
  return acc;
}, {});

const App = {
  state: {
    fridge: [],
    servings: 2,
    dishCount: 3,
    preference: 'light',
    selectedRecipe: null,
    chatMessages: [],
    page: 'planner',
    activeCategory: '全部',
    activeSubCategory: '全部',
    inventoryExpanded: true,
    ingredientSearch: '',
    modal: null,
    ingredientDraft: {
      name: '',
      amount: '300',
      unit: 'g',
      category: '其他'
    },
    isListening: false,
    isBatchListening: false,
    speechSupported: false
  },

  init() {
    this.loadState();
    this.render();
    this.listenForAppUpdate();
  },

  listenForAppUpdate() {
    if (!('serviceWorker' in navigator)) return;
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      this.showToast('已更新到最新版本，正在刷新...');
      setTimeout(() => window.location.reload(), 800);
    });
    // Check for waiting SW (new version ready)
    navigator.serviceWorker.ready.then((reg) => {
      if (reg.waiting) {
        this.showToast('发现新版本，正在应用...');
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        if (!newSW) return;
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            this.showToast('发现新版本，正在应用...');
            newSW.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
    });
  },

  loadState() {
    try {
      const saved = localStorage.getItem('cook_app_state');
      if (!saved) return;

      const parsed = JSON.parse(saved);
      this.state.fridge = (parsed.fridge || []).map((item, index) => this.normalizeFridgeItem(item, index)).filter(Boolean);
      this.state.servings = this.clampNumber(parsed.servings, 1, 10, 2);
      this.state.dishCount = this.clampNumber(parsed.dishCount, 1, 5, 3);
      this.state.preference = PREFERENCE_PRESETS[parsed.preference] ? parsed.preference : 'light';
      this.state.chatMessages = Array.isArray(parsed.chatMessages) ? parsed.chatMessages : [];
      this.state.page = parsed.page === 'fridge' ? 'planner' : parsed.page || 'planner';
      this.state.ingredientDraft = {
        ...this.state.ingredientDraft,
        ...(parsed.ingredientDraft || {})
      };
    } catch (error) {
      console.warn('状态读取失败，已回退默认配置。', error);
    }

    this.state.speechSupported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
    this.syncDraftCategory();
  },

  saveState() {
    localStorage.setItem('cook_app_state', JSON.stringify({
      fridge: this.state.fridge,
      servings: this.state.servings,
      dishCount: this.state.dishCount,
      preference: this.state.preference,
      chatMessages: this.state.chatMessages,
      page: this.state.page
    }));
  },

  normalizeFridgeItem(item, index) {
    if (!item?.name) return null;
    const guessed = this.getIngredientMeta(item.name, item.category);
    const category = item.category || guessed.category || '其他';
    const fallback = this.getDefaultInventoryPreset(item.name, category);

    return {
      id: item.id || `ingredient-${index}-${item.name}`,
      name: item.name,
      amount: String(item.amount ?? fallback.amount ?? '1').trim() || '1',
      unit: String(item.unit || fallback.unit || '份').trim() || '份',
      category
    };
  },

  clampNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.round(parsed)));
  },

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  formatMarkdown(text) {
    const escaped = this.escapeHtml(text);
    return escaped
      .replace(/^### (.*)$/gm, '<h4>$1</h4>')
      .replace(/^## (.*)$/gm, '<h3>$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  },

  formatNumber(value) {
    if (!Number.isFinite(value)) return '';
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.0$/, '');
  },

  parseNumericAmount(value) {
    const match = String(value ?? '').trim().match(/^(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : null;
  },

  parseAmountText(text) {
    const source = String(text ?? '').trim();
    const match = source.match(/^(\d+(?:\.\d+)?)(.*)$/);
    if (!match) {
      return {
        raw: source,
        value: null,
        unit: source
      };
    }

    return {
      raw: source,
      value: Number(match[1]),
      unit: (match[2] || '').trim()
    };
  },

  isMassUnit(unit) {
    return ['g', '克', 'kg', '千克'].includes(unit);
  },

  isVolumeUnit(unit) {
    return ['ml', '毫升', 'l', 'L', '升'].includes(unit);
  },

  isCountUnit(unit) {
    return ['个', '颗', '枚', '根', '条', '块', '片', '只', '瓣', '朵', '把', '包', '勺', '份', '瓶'].includes(unit);
  },

  normalizeComparableAmount(amount, unit) {
    if (!Number.isFinite(amount) || !unit) return null;
    if (this.isMassUnit(unit)) {
      return { value: unit === 'kg' || unit === '千克' ? amount * 1000 : amount, kind: 'mass' };
    }
    if (this.isVolumeUnit(unit)) {
      return { value: unit === 'l' || unit === 'L' || unit === '升' ? amount * 1000 : amount, kind: 'volume' };
    }
    if (this.isCountUnit(unit)) {
      return { value: amount, kind: `count:${unit}` };
    }
    return { value: amount, kind: `unit:${unit}` };
  },

  scaleAmountText(text, ratio) {
    const parsed = this.parseAmountText(text);
    if (!Number.isFinite(parsed.value)) return text;
    return `${this.formatNumber(parsed.value * ratio)}${parsed.unit}`;
  },

  getIngredientMeta(name, fallbackCategory) {
    return INGREDIENT_LOOKUP[name] || { emoji: '🥣', category: fallbackCategory || '其他' };
  },

  getDefaultInventoryPreset(name, category) {
    const fromRecipes = RECIPES.flatMap(recipe => recipe.ingredients.filter(ingredient => ingredient.name === name));
    const parseable = fromRecipes.map(item => this.parseAmountText(item.amount)).find(item => Number.isFinite(item.value) && item.unit);

    if (parseable) {
      return {
        amount: this.formatNumber(parseable.value),
        unit: parseable.unit
      };
    }

    return CATEGORY_DEFAULTS[category] || CATEGORY_DEFAULTS.其他;
  },

  compareIngredientInventory(ingredient) {
    const fridgeItem = this.state.fridge.find(item => item.name === ingredient.name);
    if (!fridgeItem) {
      return {
        status: ingredient.type === 'condiment' ? 'optional-missing' : 'missing',
        ratio: ingredient.type === 'condiment' ? 0.4 : 0,
        stockText: '未添加'
      };
    }

    const need = this.parseAmountText(ingredient.amount);
    const haveValue = this.parseNumericAmount(fridgeItem.amount);
    const haveUnit = String(fridgeItem.unit || '').trim();

    if (!Number.isFinite(need.value) || !Number.isFinite(haveValue)) {
      return {
        status: 'estimated',
        ratio: 0.75,
        stockText: `库存 ${fridgeItem.amount}${haveUnit}`
      };
    }

    const needNormalized = this.normalizeComparableAmount(need.value, need.unit || haveUnit);
    const haveNormalized = this.normalizeComparableAmount(haveValue, haveUnit || need.unit);

    if (!needNormalized || !haveNormalized) {
      return {
        status: 'estimated',
        ratio: 0.75,
        stockText: `库存 ${fridgeItem.amount}${haveUnit}`
      };
    }

    if (needNormalized.kind !== haveNormalized.kind) {
      const fallbackRatio = this.isCountUnit(need.unit) && this.isCountUnit(haveUnit)
        ? Math.min(1, haveValue / need.value) * 0.7
        : 0.45;
      return {
        status: fallbackRatio >= 0.95 ? 'enough' : 'short',
        ratio: fallbackRatio,
        stockText: `库存 ${fridgeItem.amount}${haveUnit}`
      };
    }

    const ratio = Math.min(1, haveNormalized.value / needNormalized.value);
    return {
      status: ratio >= 0.95 ? 'enough' : 'short',
      ratio,
      stockText: `库存 ${fridgeItem.amount}${haveUnit}`
    };
  },

  getRecipeLane(recipe) {
    if (recipe.category.includes('汤')) return 'soup';
    if (recipe.category.includes('早餐') || recipe.category.includes('主食')) return 'staple';
    if (recipe.category.includes('荤')) return 'protein';
    if (recipe.category.includes('素')) return 'vegetable';
    return 'other';
  },

  parseTimeMinutes(text) {
    const match = String(text ?? '').match(/(\d+)/);
    return match ? Number(match[1]) : 30;
  },

  getHealthScore(recipe) {
    const names = recipe.ingredients.map(item => item.name);
    const steps = recipe.steps.join(' ');
    let score = 58;

    if (recipe.category.includes('汤')) score += 12;
    if (names.some(name => ['西兰花', '西红柿', '青菜', '白菜', '豆腐', '鲈鱼', '草鱼', '虾仁', '玉米', '木耳'].includes(name))) score += 10;
    if (names.some(name => ['鸡胸肉', '鸡蛋', '鸡肉'].includes(name))) score += 6;
    if (steps.includes('蒸') || steps.includes('焯')) score += 4;
    if (['红烧', '可乐', '糖醋', '回锅'].some(keyword => recipe.name.includes(keyword))) score -= 12;
    if (names.some(name => ['五花肉', '排骨', '冰糖'].includes(name))) score -= 10;
    if (steps.includes('炸')) score -= 10;

    return Math.min(95, Math.max(18, score));
  },

  getComfortScore(recipe) {
    const names = recipe.ingredients.map(item => item.name);
    let score = 52;

    if (['红烧', '糖醋', '宫保', '回锅', '麻婆', '可乐'].some(keyword => recipe.name.includes(keyword))) score += 18;
    if (names.some(name => ['豆瓣酱', '花椒', '蒜', '葱', '姜', '干辣椒'].includes(name))) score += 10;
    if (recipe.category.includes('汤')) score += 4;

    return Math.min(95, Math.max(20, score));
  },

  getPreferenceScore(recipe, healthScore) {
    const lane = this.getRecipeLane(recipe);
    const comfort = this.getComfortScore(recipe);
    const timeMinutes = this.parseTimeMinutes(recipe.time);
    const names = recipe.ingredients.map(item => item.name);

    switch (this.state.preference) {
      case 'light':
        return Math.min(95, healthScore + (lane === 'vegetable' || lane === 'soup' ? 10 : 0) - (timeMinutes > 40 ? 6 : 0));
      case 'protein':
        return Math.min(95, 45 + (lane === 'protein' ? 25 : 0) + (names.some(name => ['鸡胸肉', '鸡肉', '虾仁', '鲈鱼', '草鱼', '鸡蛋', '豆腐'].includes(name)) ? 18 : 0));
      case 'quick':
        return Math.min(95, 96 - timeMinutes - recipe.difficulty * 8);
      case 'comfort':
        return comfort;
      case 'balanced':
      default:
        return Math.round((healthScore + comfort) / 2);
    }
  },

  getRecipeInsights(recipe) {
    const adjusted = this.adjustServings(recipe, this.state.servings);
    const coreIngredients = adjusted.ingredients.filter(item => item.type !== 'condiment');
    const comparisons = adjusted.ingredients.map(item => ({
      ...item,
      inventory: this.compareIngredientInventory(item)
    }));

    const coreComparisons = comparisons.filter(item => item.type !== 'condiment');
    const matchedCore = coreComparisons.filter(item => item.inventory.status !== 'missing');
    const enoughCore = coreComparisons.filter(item => item.inventory.status === 'enough');
    const shortCore = coreComparisons.filter(item => item.inventory.status === 'short');
    const missingCore = coreComparisons.filter(item => item.inventory.status === 'missing');
    const optionalShort = comparisons.filter(item => item.type === 'condiment' && item.inventory.status !== 'enough');

    const coverage = coreIngredients.length ? matchedCore.length / coreIngredients.length : 0;
    const quantityScore = coreIngredients.length
      ? coreComparisons.reduce((sum, item) => sum + item.inventory.ratio, 0) / coreIngredients.length
      : 0;

    const healthScore = this.getHealthScore(adjusted);
    const preferenceScore = this.getPreferenceScore(adjusted, healthScore);
    const comfortScore = this.getComfortScore(adjusted);
    const timeMinutes = this.parseTimeMinutes(adjusted.time);
    const easeScore = Math.max(28, 96 - timeMinutes - adjusted.difficulty * 8);

    let score = coverage * 34 + quantityScore * 26 + healthScore * 0.18 + preferenceScore * 0.14 + easeScore * 0.08;
    if (missingCore.length >= 2) score -= 12;
    if (coverage === 0) score -= 18;

    let statusKey = 'idea';
    if (missingCore.length === 0 && shortCore.length === 0) {
      statusKey = 'ready';
    } else if (missingCore.length <= 1 && coverage >= 0.6) {
      statusKey = 'nearly';
    } else if (coverage >= 0.34) {
      statusKey = 'planned';
    }

    const reasons = [];
    if (statusKey === 'ready') reasons.push('主要食材已够量，可以直接开做');
    if (statusKey === 'nearly') reasons.push('只需补少量食材，采购压力较小');
    if (this.state.preference === 'light' && healthScore >= 70) reasons.push('蔬菜和轻烹饪占比更高，整体更清爽');
    if (this.state.preference === 'protein' && preferenceScore >= 72) reasons.push('蛋白质主料更突出，适合想吃扎实一点');
    if (this.state.preference === 'quick' && timeMinutes <= 30) reasons.push('30 分钟内更容易完成，适合工作日晚餐');
    if (this.state.preference === 'comfort' && comfortScore >= 72) reasons.push('风味更浓，满足感更强');
    if (healthScore >= 76 && !reasons.some(item => item.includes('清爽'))) reasons.push('这道菜的健康评分更高，油糖负担更轻');
    if (optionalShort.length === 0 && coverage > 0.6) reasons.push('调味料缺口较少，做出来会更稳定');

    return {
      ...adjusted,
      score: Math.round(score),
      healthScore,
      preferenceScore: Math.round(preferenceScore),
      comfortScore,
      coverage,
      quantityScore,
      matchedCount: matchedCore.length,
      missingCore,
      shortCore,
      optionalShort,
      comparisons,
      statusKey,
      statusLabel: STATUS_META[statusKey].label,
      statusTone: STATUS_META[statusKey].tone,
      reasons: reasons.slice(0, 3),
      timeMinutes
    };
  },

  matchRecipes() {
    return RECIPES.map(recipe => this.getRecipeInsights(recipe))
      .filter(recipe => recipe.score >= 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.healthScore !== a.healthScore) return b.healthScore - a.healthScore;
        return a.timeMinutes - b.timeMinutes;
      });
  },

  adjustServings(recipe, servings) {
    const ratio = servings / recipe.servings;
    return {
      ...recipe,
      servings,
      ingredients: recipe.ingredients.map(item => ({
        ...item,
        amount: this.scaleAmountText(item.amount, ratio)
      }))
    };
  },

  getPreferredLanes() {
    const count = this.state.dishCount;
    if (count === 1) {
      return this.state.preference === 'light' ? ['vegetable', 'soup', 'protein'] : ['protein', 'vegetable', 'soup'];
    }
    if (count === 2) {
      return this.state.preference === 'light' ? ['vegetable', 'protein', 'soup'] : ['protein', 'vegetable', 'soup'];
    }
    return ['protein', 'vegetable', 'soup', 'staple'];
  },

  getMenuPlan(recipes = this.matchRecipes()) {
    const preferredLanes = this.getPreferredLanes();
    const picked = [];
    const usedIds = new Set();

    preferredLanes.forEach(lane => {
      if (picked.length >= this.state.dishCount) return;
      // 优先选库存充足的菜
      let candidate = recipes.find(recipe =>
        !usedIds.has(recipe.id) &&
        this.getRecipeLane(recipe) === lane &&
        recipe.statusKey === 'ready'
      );
      // 没有库存充足的，再选高分菜
      if (!candidate) {
        candidate = recipes.find(recipe =>
          !usedIds.has(recipe.id) &&
          this.getRecipeLane(recipe) === lane &&
          recipe.score >= 42
        );
      }
      if (candidate) {
        picked.push(candidate);
        usedIds.add(candidate.id);
      }
    });

    // 补位时也优先库存充足
    ['ready', 'nearly'].forEach(status => {
      recipes.forEach(recipe => {
        if (picked.length >= this.state.dishCount || usedIds.has(recipe.id)) return;
        if (recipe.statusKey === status && recipe.score >= 35) {
          picked.push(recipe);
          usedIds.add(recipe.id);
        }
      });
    });

    recipes.forEach(recipe => {
      if (picked.length >= this.state.dishCount || usedIds.has(recipe.id)) return;
      if (recipe.score >= 40) {
        picked.push(recipe);
        usedIds.add(recipe.id);
      }
    });

    const missing = picked.flatMap(recipe => recipe.missingCore.map(item => item.name));
    const short = picked.flatMap(recipe => recipe.shortCore.map(item => item.name));
    const healthAverage = picked.length
      ? Math.round(picked.reduce((sum, item) => sum + item.healthScore, 0) / picked.length)
      : 0;

    return {
      items: picked,
      missing,
      short,
      healthAverage,
      summary: picked.length
        ? `${PREFERENCE_PRESETS[this.state.preference].label} · ${picked.length} 道菜 · 平均健康分 ${healthAverage}`
        : '先补充库存后再生成今日菜单'
    };
  },

  getFilteredIngredients() {
    const search = this.state.ingredientSearch.trim().toLowerCase();
    const categories = this.state.activeCategory === '全部'
      ? Object.keys(INGREDIENT_CATEGORIES)
      : [this.state.activeCategory];

    const rows = [];
    categories.forEach(category => {
      const subs = INGREDIENT_CATEGORIES[category] || {};
      Object.entries(subs).forEach(([sub, items]) => {
        if (this.state.activeSubCategory !== '全部' && this.state.activeSubCategory !== sub) return;
        items.forEach(item => {
          if (!search || item.name.toLowerCase().includes(search)) {
            rows.push({ ...item, category, subCategory: sub });
          }
        });
      });
    });
    return rows;
  },

  getFridgeByCategory() {
    const groups = {};
    const categoryOrder = Object.keys(INGREDIENT_CATEGORIES);
    this.state.fridge.forEach(item => {
      const cat = item.category && item.category !== '其他'
        ? item.category
        : (this.inferCategoryFromName(item.name) || '其他');
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    const sorted = {};
    categoryOrder.forEach(cat => { if (groups[cat]) sorted[cat] = groups[cat]; });
    Object.keys(groups).forEach(cat => { if (!sorted[cat]) sorted[cat] = groups[cat]; });
    return sorted;
  },

  getCategoryEmoji(cat) {
    const subs = INGREDIENT_CATEGORIES[cat];
    if (subs) {
      const firstSub = Object.values(subs)[0];
      if (firstSub && firstSub[0]) return firstSub[0].emoji;
    }
    return '📦';
  },

  toggleInventory() {
    this.state.inventoryExpanded = !this.state.inventoryExpanded;
    this.render();
  },

  renderFridgeOverview() {
    const total = this.state.fridge.length;
    if (total === 0) {
      return `
        <div class="fridge-overview empty" onclick="App.toggleInventory()">
          <div class="overview-main">
            <span class="overview-icon">📦</span>
            <div>
              <strong>我的冰箱</strong>
              <span>还没有添加食材</span>
            </div>
          </div>
          <span class="overview-toggle">去添加 ▼</span>
        </div>
      `;
    }
    const groups = this.getFridgeByCategory();
    return `
      <div class="fridge-overview" onclick="App.toggleInventory()">
        <div class="overview-main">
          <span class="overview-icon">📦</span>
          <div>
            <strong>我的冰箱</strong>
            <span>${total} 项食材</span>
          </div>
        </div>
        <div class="overview-cats">
          ${Object.entries(groups).map(([cat, items]) => `
            <span class="overview-cat-tag">${this.getCategoryEmoji(cat)} ${cat} ${items.length}</span>
          `).join('')}
        </div>
        <span class="overview-toggle">${this.state.inventoryExpanded ? '收起 ▲' : '展开 ▼'}</span>
      </div>
    `;
  },

  renderGroupedInventory() {
    if (!this.state.inventoryExpanded) return '';
    if (!this.state.fridge.length) return '';
    const groups = this.getFridgeByCategory();
    return `
      <div class="inventory-list">
        ${Object.entries(groups).map(([cat, items]) => `
          <div class="inventory-group">
            <p class="inventory-group-title">${this.getCategoryEmoji(cat)} ${cat}（${items.length}项）</p>
            ${items.map(item => {
              const meta = this.getIngredientMeta(item.name, item.category);
              return `
                <div class="inventory-compact-row" onclick='App.editIngredient(${JSON.stringify(item.name)})'>
                  <span class="inventory-icon">${this.escapeHtml(meta.emoji)}</span>
                  <strong>${this.escapeHtml(item.name)}</strong>
                  <span class="compact-amount">${this.escapeHtml(item.amount)}${this.escapeHtml(item.unit)}</span>
                </div>
              `;
            }).join('')}
          </div>
        `).join('')}
      </div>
    `;
  },

  syncDraftCategory() {
    const draftName = this.state.ingredientDraft.name.trim();
    if (!draftName) {
      if (!this.state.ingredientDraft.category) this.state.ingredientDraft.category = '其他';
      return;
    }

    const inferredCategory = this.inferCategoryFromName(draftName);
    if (inferredCategory && this.state.ingredientDraft.category === '其他') {
      this.state.ingredientDraft.category = inferredCategory;
    }
  },

  inferCategoryFromName(name) {
    for (const [category, subs] of Object.entries(INGREDIENT_CATEGORIES)) {
      for (const items of Object.values(subs)) {
        if (items.some(item => item.name === name)) return category;
      }
    }

    const lowerName = name.toLowerCase();
    if (['鸡', '牛', '猪', '羊', '虾', '鱼', '肉'].some(keyword => lowerName.includes(keyword))) return '肉类';
    if (['蛋', '奶'].some(keyword => lowerName.includes(keyword))) return '蛋奶';
    if (['米', '面', '粉', '饭', '面条'].some(keyword => lowerName.includes(keyword))) return '主食';
    if (['油', '酱', '盐', '醋', '糖', '辣椒', '姜', '蒜', '葱'].some(keyword => lowerName.includes(keyword))) return '调料';
    if (['菜', '椒', '瓜', '豆', '萝卜', '茄', '菇', '番茄', '西红柿'].some(keyword => lowerName.includes(keyword))) return '蔬菜';
    return '其他';
  },

  getDraftUnitOptions() {
    const preferred = ['g', '个', 'ml', '份', '根', '条', '颗', '块', '片', '瓶'];
    const unitSet = new Set([this.state.ingredientDraft.unit, ...preferred, ...COMMON_UNITS]);
    return Array.from(unitSet).filter(Boolean);
  },

  setIngredientDraftField(field, value) {
    this.state.ingredientDraft = {
      ...this.state.ingredientDraft,
      [field]: value
    };

    if (field === 'name') {
      const inferredCategory = this.inferCategoryFromName(value.trim());
      this.state.ingredientDraft.category = inferredCategory || this.state.ingredientDraft.category || '其他';
    }

    this.saveState();
  },

  setDraftCategory(category) {
    this.state.ingredientDraft.category = category;
    this.saveState();
    this.render();
  },

  applySuggestedIngredient(name, category) {
    const existing = this.state.fridge.find(item => item.name === name);
    const fallback = this.getDefaultInventoryPreset(name, category);
    const amount = existing?.amount || fallback.amount || '1';
    const unit = existing?.unit || fallback.unit || '份';
    const resolvedCategory = existing?.category || category || this.inferCategoryFromName(name) || '其他';

    if (existing) {
      const newAmount = String(Math.round((parseFloat(existing.amount) + parseFloat(amount)) * 100) / 100);
      this.state.fridge = this.state.fridge.map(item =>
        item.name === name ? { ...item, amount: newAmount } : item
      );
      this.showToast(`已累加：${name} ${newAmount}${unit}`);
    } else {
      const newItem = this.normalizeFridgeItem({
        id: `ingredient-${Date.now()}`,
        name,
        amount,
        unit,
        category: resolvedCategory
      }, this.state.fridge.length);
      this.state.fridge.unshift(newItem);
      this.showToast(`已添加：${name} ${amount}${unit}`);
    }

    this.saveState();
    this.render();
  },

  resetIngredientDraft() {
    this.state.ingredientDraft = {
      name: '',
      amount: '300',
      unit: 'g',
      category: '其他'
    };
  },

  showToast(message) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.82);color:#fff;padding:10px 20px;border-radius:20px;font-size:14px;z-index:9999;opacity:0;transition:opacity 0.25s;pointer-events:none;max-width:80%;text-align:center;line-height:1.4;';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2200);
  },

  addIngredientFromDraft() {
    const name = this.state.ingredientDraft.name.trim();
    const amount = this.state.ingredientDraft.amount.trim() || '1';
    const unit = this.state.ingredientDraft.unit.trim() || '份';
    const category = this.state.ingredientDraft.category || this.inferCategoryFromName(name) || '其他';

    if (!name) {
      const input = document.getElementById('ingredient-name-input');
      if (input) input.focus();
      return;
    }

    const existingIndex = this.state.fridge.findIndex(item => item.name === name);

    if (existingIndex >= 0) {
      const existing = this.state.fridge[existingIndex];
      const accumulated = String(Math.round((parseFloat(existing.amount) + parseFloat(amount)) * 100) / 100);
      const ok = confirm(`库存中已有「${name} ${existing.amount}${existing.unit}」。\n\n点"确定"：覆盖为 ${amount}${unit}\n点"取消"：累加为 ${accumulated}${existing.unit}`);
      if (ok) {
        const nextItem = this.normalizeFridgeItem({
          id: existing.id,
          name,
          amount,
          unit,
          category
        }, existingIndex);
        this.state.fridge.splice(existingIndex, 1, nextItem);
        this.showToast(`已更新：${name} ${amount}${unit}`);
      } else {
        this.state.fridge[existingIndex].amount = accumulated;
        this.showToast(`已累加：${name} ${accumulated}${existing.unit}`);
      }
    } else {
      const nextItem = this.normalizeFridgeItem({
        id: `ingredient-${Date.now()}`,
        name,
        amount,
        unit,
        category
      }, this.state.fridge.length);
      this.state.fridge.unshift(nextItem);
      this.showToast(`已添加：${name} ${amount}${unit}`);
    }

    this.resetIngredientDraft();
    this.saveState();
    this.render();
  },

  getSpeechRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return null;

    if (!this.speechRecognition) {
      this.speechRecognition = new Recognition();
      this.speechRecognition.lang = 'zh-CN';
      this.speechRecognition.continuous = false;
      this.speechRecognition.interimResults = false;
      this.speechRecognition.maxAlternatives = 1;

      this.speechRecognition.onresult = event => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim() || '';
        if (transcript) {
          this.state.ingredientDraft.name = transcript.replace(/[，。！？,.!?]$/g, '');
          const inferredCategory = this.inferCategoryFromName(this.state.ingredientDraft.name);
          if (inferredCategory) this.state.ingredientDraft.category = inferredCategory;
          this.saveState();
        }
      };

      this.speechRecognition.onerror = (event) => {
        this.state.isListening = false;
        this.render();
        const msg = event.error === 'not-allowed'
          ? '麦克风权限被拒绝，请在浏览器设置中允许后重试'
          : event.error === 'no-speech'
            ? '没有听到声音，请再试一次'
            : '语音识别失败，请手动输入食材名称';
        this.showToast(msg);
      };

      this.speechRecognition.onend = () => {
        this.state.isListening = false;
        this.render();
      };
    }

    return this.speechRecognition;
  },

  toggleVoiceInput() {
    const recognition = this.getSpeechRecognition();
    if (!recognition) {
      alert('当前浏览器暂不支持语音输入，请使用 Safari 或 Chrome 的移动端语音识别能力。');
      return;
    }

    if (this.state.isListening) {
      recognition.stop();
      this.state.isListening = false;
      this.render();
      return;
    }

    try {
      this.state.isListening = true;
      this.render();
      recognition.start();
    } catch (error) {
      this.state.isListening = false;
      this.render();
    }
  },

  setAiModel(model) {
    AI_API.setModel(model);
    const providerId = AI_API.modelProvider;
    if (providerId && providerId !== AI_API.provider) {
      AI_API.setProvider(providerId);
    }
    this.render();
  },

  setVisionModel(model) {
    AI_API.setVisionModel(model);
    this.render();
  },

  parseJsonArray(text) {
    const cleaned = String(text || '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) {
        try { return JSON.parse(match[0]); } catch (e2) { return []; }
      }
      return [];
    }
  },

  normalizeBatchItems(items) {
    return (Array.isArray(items) ? items : []).map(item => {
      const name = String(item?.name || item?.食材 || '').trim();
      if (!name) return null;
      const amount = String(item?.amount ?? item?.数量 ?? '1').trim() || '1';
      const unit = String(item?.unit ?? item?.单位 ?? '份').trim() || '份';
      const category = String(item?.category ?? item?.分类 ?? '').trim();
      return {
        name,
        amount,
        unit,
        category: category || this.inferCategoryFromName(name) || '其他'
      };
    }).filter(Boolean);
  },

  openBatchPreview(items) {
    this.state.modal = { mode: 'batch-preview', items };
    this.render();
  },

  async startBatchVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('当前浏览器不支持语音输入，请使用手机 Chrome。');
      return;
    }
    if (this.state.isBatchListening) {
      if (this.batchRecognition) this.batchRecognition.stop();
      this.state.isBatchListening = false;
      this.render();
      return;
    }
    this.batchRecognition = new SpeechRecognition();
    this.batchRecognition.lang = 'zh-CN';
    this.batchRecognition.continuous = false;
    this.batchRecognition.interimResults = false;
    this.batchRecognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim() || '';
      if (transcript) this.parseIngredientsFromText(transcript);
    };
    this.batchRecognition.onerror = () => {
      this.state.isBatchListening = false;
      this.render();
      alert('语音识别失败，请检查麦克风权限后重试。');
    };
    this.batchRecognition.onend = () => {
      this.state.isBatchListening = false;
      this.render();
    };
    try {
      this.state.isBatchListening = true;
      this.render();
      this.batchRecognition.start();
    } catch (e) {
      this.state.isBatchListening = false;
      this.render();
    }
  },

  async parseIngredientsFromText(text) {
    const prompt = `你是一个食材解析助手。用户用一句话描述家里的食材，请解析成 JSON 数组。
每个元素包含：name(食材名，中文)、amount(数量，纯数字)、unit(单位，如 g、个、根、块、包)、category(分类，可选：肉类/蛋奶/蔬菜/主食/调料/其他)。
只输出 JSON 数组，不要输出任何解释、markdown 或代码块标记。
用户说：${text}`;
    try {
      const reply = await AI_API.chat([{ role: 'user', content: prompt }]);
      const items = this.normalizeBatchItems(this.parseJsonArray(reply));
      if (!items.length) {
        alert('没能从这句话里识别出食材，请说得更具体，例如"三个鸡蛋、两个西红柿、一块五花肉"。');
        return;
      }
      this.openBatchPreview(items);
    } catch (error) {
      alert(`语音解析失败（${AI_API.config.label} · ${AI_API.model}）：${error.message}`);
    }
  },

  startPhotoRecognition() {
    if (!AI_API.key) {
      if (!confirm('拍照识别需要配置 AI API（视觉模型），去设置页配置？')) return;
      this.state.page = 'settings';
      this.render();
      return;
    }
    const input = document.getElementById('photo-input');
    if (input) input.click();
  },

  resizeImage(file, maxWidth = 1024, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width);
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  async handlePhotoFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    try {
      const dataUrl = await this.resizeImage(file);
      const prompt = `识别图片中的所有食材。输出 JSON 数组，每个元素包含：name(食材名，中文)、amount(估计数量，纯数字)、unit(单位)、category(分类：肉类/蛋奶/蔬菜/主食/调料/其他)。
无法判断数量时 amount 填 1、unit 填"份"。只输出 JSON 数组，不要解释。`;
      const reply = await AI_API.chatVision(dataUrl, prompt);
      const items = this.normalizeBatchItems(this.parseJsonArray(reply));
      if (!items.length) {
        alert('没能从照片里识别出食材，请换个角度或光线再试一次。');
        return;
      }
      this.openBatchPreview(items);
    } catch (error) {
      alert(`拍照识别失败（视觉模型：${AI_API.visionModel}）：${error.message}`);
    }
  },

  confirmBatchAdd() {
    const items = this.state.modal?.items || [];
    items.forEach(item => {
      const existingIndex = this.state.fridge.findIndex(f => f.name === item.name);
      const normalized = this.normalizeFridgeItem({
        id: existingIndex >= 0 ? this.state.fridge[existingIndex].id : `ingredient-${Date.now()}-${item.name}`,
        name: item.name,
        amount: item.amount,
        unit: item.unit,
        category: item.category
      }, existingIndex >= 0 ? existingIndex : this.state.fridge.length);
      if (existingIndex >= 0) {
        this.state.fridge.splice(existingIndex, 1, normalized);
      } else {
        this.state.fridge.unshift(normalized);
      }
    });
    this.state.modal = null;
    this.saveState();
    this.render();
  },

  removeBatchItem(index) {
    if (!this.state.modal?.items) return;
    this.state.modal.items.splice(index, 1);
    if (!this.state.modal.items.length) {
      this.state.modal = null;
    }
    this.render();
  },

  render() {
    const root = document.getElementById('app');
    root.innerHTML = `
      ${this.renderNavbar()}
      <main class="app-shell">
        ${this.renderPage()}
      </main>
      ${this.renderIngredientModal()}
    `;
    this.afterRender();
  },

  afterRender() {
    if (this.state.modal) {
      setTimeout(() => {
        const input = document.getElementById('modal-name');
        if (input) input.focus();
      }, 20);
    }

    if (this.state.page === 'chat') {
      setTimeout(() => {
        const box = document.getElementById('chat-messages');
        if (box) box.scrollTop = box.scrollHeight;
      }, 30);
    }
  },

  renderPage() {
    switch (this.state.page) {
      case 'recipes':
        return this.renderRecipesPage();
      case 'recipe':
        return this.renderRecipeDetailPage();
      case 'chat':
        return this.renderChatPage();
      case 'settings':
        return this.renderSettingsPage();
      case 'planner':
      default:
        return this.renderPlannerPage();
    }
  },

  renderNavbar() {
    const tabs = [
      ['planner', '录入', '添加食材'],
      ['recipes', '菜单', '今晚推荐'],
      ['chat', '问厨', '语音问答'],
      ['settings', '设置', '偏好与 API']
    ];

    return `
      <nav class="app-nav">
        ${tabs.map(([page, shortLabel, longLabel]) => `
          <button class="nav-link ${this.state.page === page ? 'active' : ''}" onclick='App.navigate(${JSON.stringify(page)})'>
            <span>${shortLabel}</span>
            <strong>${longLabel}</strong>
          </button>
        `).join('')}
      </nav>
    `;
  },

  renderHeroStats(recipes, menuPlan) {
    const readyRecipes = recipes.filter(recipe => recipe.statusKey === 'ready' || recipe.statusKey === 'nearly').length;
    const categoryCount = new Set(this.state.fridge.map(item => item.category)).size;
    return `
      <div class="hero-stats">
        <div class="stat-tile">
          <span class="stat-label">库存食材</span>
          <strong>${this.state.fridge.length}</strong>
          <span class="stat-note">${categoryCount} 类</span>
        </div>
        <div class="stat-tile">
          <span class="stat-label">可做菜谱</span>
          <strong>${readyRecipes}</strong>
          <span class="stat-note">按当前库存计算</span>
        </div>
        <div class="stat-tile">
          <span class="stat-label">今日菜单</span>
          <strong>${menuPlan.items.length || 0}</strong>
          <span class="stat-note">${PREFERENCE_PRESETS[this.state.preference].label}</span>
        </div>
      </div>
    `;
  },

  renderAiStatusBar() {
    const providerId = AI_API.modelProvider;
    const config = AI_PROVIDERS[providerId] || AI_API.config;
    const hasKey = !!(localStorage.getItem(config.keyStorage) || '').trim();
    return `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 12px;background:#fafafa;border:1px solid #eee;border-radius:8px;margin-bottom:12px;font-size:12px;color:#666;">
        <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${hasKey ? '#27ae60' : '#c0392b'};flex-shrink:0;"></span>
        <span>对话：${AI_API.model} · 视觉：${AI_API.visionModel}</span>
        <a href="#" onclick="App.navigate('settings');return false;" style="color:${hasKey ? '#27ae60' : '#c0392b'};margin-left:auto;text-decoration:none;font-weight:500;">${hasKey ? '已配置' : '未配置，点此配置'}</a>
      </div>
    `;
  },

  renderChatModelSelector() {
    const configured = Object.entries(AI_PROVIDERS).filter(([id, p]) => !!(localStorage.getItem(p.keyStorage) || '').trim());
    const deepseekConfigured = configured.some(([id]) => id === 'deepseek');

    if (configured.length) {
      const currentProviderConfigured = configured.some(([id]) => id === AI_API.modelProvider);
      if (!currentProviderConfigured) {
        const [firstId, firstConfig] = configured[0];
        AI_API.setProvider(firstId);
        AI_API.setModel(firstConfig.defaultModel);
      }
    }

    const options = configured.length
      ? configured.flatMap(([id, p]) => p.textModels.map(m => ({ value: m, label: `${p.label} · ${m}` })))
      : [{ value: '', label: '请先在"偏好与 API"中配置 API Key' }];

    const currentModel = AI_API.model;
    const selectedValue = options.some(o => o.value === currentModel) ? currentModel : (options[0]?.value || '');

    return `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;background:#fef5ee;border:1px solid #f0d9c4;border-radius:10px;margin-bottom:14px;font-size:13px;">
        <span style="color:#7a5c3e;font-weight:600;">对话模型：</span>
        <select class="search-input" style="width:auto;padding:6px 10px;font-size:13px;min-width:180px;" onchange="App.setAiModel(this.value)" ${configured.length ? '' : 'disabled'}>
          ${options.map(o => `<option value="${o.value}" ${selectedValue === o.value ? 'selected' : ''}>${this.escapeHtml(o.label)}</option>`).join('')}
        </select>
        <span style="font-size:12px;font-weight:500;">
          ${configured.length
            ? `<span style="color:#27ae60;">已配置：${configured.map(([_, p]) => p.label).join('、')}</span>`
            : `<a href="#" onclick="App.navigate('settings');return false;" style="color:#c0392b;text-decoration:none;">未配置 API，点此去设置</a>`}
        </span>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;width:100%;margin-top:6px;padding-top:8px;border-top:1px dashed #e8d5c0;">
          <span style="color:#7a5c3e;font-weight:600;">视觉模型：</span>
          <select class="search-input" style="width:auto;padding:6px 10px;font-size:13px;min-width:180px;" onchange="App.setVisionModel(this.value)">
            <option value="glm-4v" ${AI_API.visionModel === 'glm-4v' ? 'selected' : ''}>智谱 GLM · glm-4v</option>
            <option value="glm-4v-flash" ${AI_API.visionModel === 'glm-4v-flash' ? 'selected' : ''}>智谱 GLM · glm-4v-flash</option>
            ${deepseekConfigured ? `<option value="deepseek-flash" ${AI_API.visionModel === 'deepseek-flash' ? 'selected' : ''}>DeepSeek · deepseek-flash</option>` : ''}
          </select>
          <span style="color:#999;font-size:12px;">用于拍照识别食材，默认 glm-4v</span>
        </div>
      </div>
    `;
  },

  renderPlannerPage() {
    const recipes = this.matchRecipes();
    const menuPlan = this.getMenuPlan(recipes);
    const filteredIngredients = this.getFilteredIngredients();
    const preference = PREFERENCE_PRESETS[this.state.preference];
    const draft = this.state.ingredientDraft;
    const suggestionRows = filteredIngredients.slice(0, 48);

    return `
      <section class="page planner-page">
        <header class="planner-hero">
          <div class="hero-copy">
            <p class="eyebrow">Mobile Cooking Planner</p>
            <h1>先录食材，再生成今晚菜单。</h1>
            <p class="hero-subtitle">手机上直接输入食材名，选分量后一项项添加；需要时可以点麦克风用语音录入。</p>
          </div>
          ${this.renderHeroStats(recipes, menuPlan)}
        </header>

        ${this.renderAiStatusBar()}

        <div class="mobile-stack">
          ${this.renderFridgeOverview()}
          <section class="panel inventory-panel">
            ${this.renderGroupedInventory()}
          </section>

          <section class="panel quick-input-panel">
            <div class="panel-head mobile-tight">
              <div>
                <p class="section-kicker">一步添加食材</p>
                <h2>名字、分量、立即加入库存</h2>
              </div>
            </div>

            <div class="ingredient-composer">
              <label class="composer-label">
                食材名称
                <div class="voice-row">
                  <input
                    id="ingredient-name-input"
                    type="text"
                    class="search-input"
                    placeholder="例如：鸡翅、西兰花、三文鱼"
                    value="${this.escapeHtml(draft.name)}"
                    oninput="App.setIngredientDraftField('name', this.value)"
                  >
                  <button class="voice-button ${this.state.isListening ? 'active' : ''}" onclick="App.toggleVoiceInput()">
                    ${this.state.isListening ? '停止' : '语音'}
                  </button>
                </div>
              </label>

              <div class="composer-grid">
                <label class="composer-label">
                  数量
                  <input
                    type="text"
                    class="search-input"
                    placeholder="例如：300"
                    value="${this.escapeHtml(draft.amount)}"
                    oninput="App.setIngredientDraftField('amount', this.value)"
                  >
                </label>

                <label class="composer-label">
                  单位
                  <select class="search-input" onchange="App.setIngredientDraftField('unit', this.value)">
                    ${this.getDraftUnitOptions().map(unit => `
                      <option value="${this.escapeHtml(unit)}" ${draft.unit === unit ? 'selected' : ''}>${this.escapeHtml(unit)}</option>
                    `).join('')}
                  </select>
                </label>
              </div>

              <div class="draft-meta">
                <span class="control-label">分类</span>
                <div class="chip-row compact-chips">
                  ${['肉类', '蛋奶', '蔬菜', '豆制品', '主食', '调料', '饮品/其他', '其他'].map(category => `
                    <button class="draft-category-chip ${draft.category === category ? 'active' : ''}" onclick='App.setDraftCategory(${JSON.stringify(category)})'>
                      ${this.escapeHtml(category)}
                    </button>
                  `).join('')}
                </div>
              </div>

              <div class="composer-actions">
                <button class="secondary-button" onclick="App.resetIngredientDraft(); App.saveState(); App.render();">清空</button>
                <button class="primary-button add-button" onclick="App.addIngredientFromDraft()">添加这一项</button>
              </div>

              <div class="composer-actions" style="margin-top:8px;">
                <button class="secondary-button" onclick="App.startBatchVoice()">${this.state.isBatchListening ? '停止录音' : '语音批量添加'}</button>
                <button class="secondary-button" onclick="App.startPhotoRecognition()">拍照识别添加</button>
              </div>
              <input type="file" id="photo-input" accept="image/*" capture="environment" style="display:none" onchange="App.handlePhotoFile(event)">

              <p class="support-copy">${this.state.speechSupported ? '支持语音输入食材名称。识别后仍可手动改字和单位。' : '当前浏览器未检测到语音识别，仍可手动输入食材名称。'}</p>
            </div>
          </section>

          <section class="panel plan-panel">
            <div class="panel-head mobile-tight">
              <div>
                <p class="section-kicker">今日菜单规划</p>
                <h2>先定人数、菜数和口味</h2>
              </div>
              <button class="secondary-button" onclick="App.navigate('recipes')">看推荐</button>
            </div>

            <div class="planner-controls">
              <div class="control-card">
                <span class="control-label">用餐人数</span>
                <div class="stepper">
                  <button onclick="App.changeServings(-1)">−</button>
                  <strong>${this.state.servings} 人</strong>
                  <button onclick="App.changeServings(1)">+</button>
                </div>
              </div>

              <div class="control-card">
                <span class="control-label">计划做几道</span>
                <div class="stepper">
                  <button onclick="App.changeDishCount(-1)">−</button>
                  <strong>${this.state.dishCount} 道</strong>
                  <button onclick="App.changeDishCount(1)">+</button>
                </div>
              </div>
            </div>

            <div class="preference-block">
              <div class="preference-head">
                <span class="control-label">本次偏好</span>
                <p>${this.escapeHtml(preference.summary)}</p>
              </div>
              <div class="chip-row">
                ${Object.entries(PREFERENCE_PRESETS).map(([key, value]) => `
                  <button class="pref-chip ${key === this.state.preference ? 'active' : ''}" onclick='App.setPreference(${JSON.stringify(key)})'>
                    ${this.escapeHtml(value.label)}
                  </button>
                `).join('')}
              </div>
            </div>

            <div class="menu-preview">
              <div class="panel-head compact">
                <div>
                  <p class="section-kicker">系统建议</p>
                  <h3>今日推荐菜单</h3>
                </div>
                <span class="summary-badge">${this.escapeHtml(menuPlan.summary)}</span>
              </div>
              ${menuPlan.items.length ? `
                <div class="menu-strip">
                  ${menuPlan.items.map(recipe => `
                    <button class="mini-menu-card" onclick='App.showRecipe(${recipe.id})'>
                      <span class="mini-menu-top">
                        <em class="status-dot ${recipe.statusTone}"></em>
                        ${this.escapeHtml(recipe.statusLabel)}
                      </span>
                      <strong>${this.escapeHtml(recipe.name)}</strong>
                      <span>${this.escapeHtml(recipe.category)} · 健康分 ${recipe.healthScore}</span>
                    </button>
                  `).join('')}
                </div>
              ` : `
                <div class="empty-state subtle">
                  <p>库存还不够成型。先录入主食材和重量，推荐会明显更准。</p>
                </div>
              `}
            </div>
          </section>

          <section class="panel browser-panel">
            <div class="panel-head mobile-tight">
              <div>
                <p class="section-kicker">常用食材捷径</p>
                <h2>点一下填入名称，再选分量</h2>
              </div>
            </div>

            <div class="search-row">
              <input
                type="text"
                class="search-input"
                placeholder="筛选常用食材，例如：鸡翅、西兰花、虾仁"
                value="${this.escapeHtml(this.state.ingredientSearch)}"
                oninput="App.setIngredientSearch(this.value)"
              >
            </div>

            <div class="chip-row category-row">
              ${['全部', ...Object.keys(INGREDIENT_CATEGORIES)].map(category => `
                <button class="category-chip ${category === this.state.activeCategory ? 'active' : ''}" onclick='App.setActiveCategory(${JSON.stringify(category)})'>
                  ${this.escapeHtml(category)}
                </button>
              `).join('')}
            </div>

            ${this.state.activeCategory !== '全部' ? `
              <div class="chip-row category-row" style="margin-top:6px;">
                ${['全部', ...Object.keys(INGREDIENT_CATEGORIES[this.state.activeCategory] || {})].map(sub => `
                  <button class="category-chip ${sub === this.state.activeSubCategory ? 'active' : ''}" onclick='App.setActiveSubCategory(${JSON.stringify(sub)})' style="font-size:12px;padding:4px 10px;">
                    ${this.escapeHtml(sub)}
                  </button>
                `).join('')}
              </div>
            ` : ''}

            <div class="suggestion-grid">
              ${this.renderSuggestionGroups(suggestionRows)}
            </div>
          </section>
        </div>
      </section>
    `;
  },

  renderRecipeCard(recipe) {
    return `
      <article class="recipe-card" onclick='App.showRecipe(${recipe.id})'>
        <div class="recipe-head">
          <div>
            <span class="status-pill ${recipe.statusTone}">${this.escapeHtml(recipe.statusLabel)}</span>
            <h3>${this.escapeHtml(recipe.name)}</h3>
          </div>
          <div class="score-pill">
            <span>综合</span>
            <strong>${recipe.score}</strong>
          </div>
        </div>

        <div class="meta-row">
          <span>${this.escapeHtml(recipe.category)}</span>
          <span>${'★'.repeat(recipe.difficulty)}</span>
          <span>${this.escapeHtml(recipe.time)}</span>
          <span>健康 ${recipe.healthScore}</span>
        </div>

        <p class="reason-copy">${this.escapeHtml(recipe.reasons.join(' · ') || '按当前库存和偏好综合排序')}</p>

        <div class="recipe-footer">
          <span>主料命中 ${Math.round(recipe.coverage * 100)}%</span>
          <span>${recipe.missingCore.length ? `缺 ${recipe.missingCore.map(item => item.name).join('、')}` : '主料完整'}</span>
        </div>
      </article>
    `;
  },

  renderRecipesPage() {
    const recipes = this.matchRecipes();
    const menuPlan = this.getMenuPlan(recipes);
    const preference = PREFERENCE_PRESETS[this.state.preference];

    return `
      <section class="page recipes-page">
        <header class="page-header-block">
          <div>
            <p class="eyebrow">Recommended Menus</p>
            <h1>按库存和健康度，排好今晚菜单。</h1>
          </div>
          <div class="header-actions">
            <button class="secondary-button" onclick="App.navigate('planner')">返回库存工作台</button>
            <button class="primary-button" onclick="App.aiRecommendRecipes()">AI 生成今日菜单</button>
          </div>
        </header>

        ${this.renderAiStatusBar()}

        <section class="panel featured-panel">
          <div class="panel-head">
            <div>
              <p class="section-kicker">今日菜单方案</p>
              <h2>${this.state.dishCount} 道菜 · ${this.escapeHtml(preference.label)}</h2>
            </div>
            <span class="summary-badge">${this.escapeHtml(menuPlan.summary)}</span>
          </div>

          <div class="featured-grid">
            ${menuPlan.items.length ? menuPlan.items.map(recipe => `
              <article class="feature-card" onclick='App.showRecipe(${recipe.id})'>
                <span class="status-pill ${recipe.statusTone}">${this.escapeHtml(recipe.statusLabel)}</span>
                <h3>${this.escapeHtml(recipe.name)}</h3>
                <p>${this.escapeHtml(recipe.reasons[0] || '按当前偏好和库存优先排序')}</p>
                <div class="feature-metrics">
                  <span>健康 ${recipe.healthScore}</span>
                  <span>匹配 ${Math.round(recipe.coverage * 100)}%</span>
                  <span>${this.escapeHtml(recipe.time)}</span>
                </div>
              </article>
            `).join('') : `
              <div class="empty-state">
                <p>暂时还没拼出完整菜单。建议回到库存页把主料数量补完整。</p>
              </div>
            `}
          </div>

          <div class="ai-result" id="ai-result" style="display:none"></div>
        </section>

        <section class="recipe-list-section">
          <div class="panel-head">
            <div>
              <p class="section-kicker">更多可选菜谱</p>
              <h2>按可做性、健康度和你的偏好排序</h2>
            </div>
          </div>
          <div class="recipe-list">
            ${recipes.length ? recipes.map(recipe => this.renderRecipeCard(recipe)).join('') : `
              <div class="empty-state">
                <p>先录入库存食材后，这里会出现更具体的菜谱排序。</p>
              </div>
            `}
          </div>
        </section>
      </section>
    `;
  },

  renderRecipeDetailPage() {
    const recipe = RECIPES.find(item => item.id === this.state.selectedRecipe);
    if (!recipe) {
      this.state.page = 'recipes';
      return this.renderRecipesPage();
    }

    const detail = this.getRecipeInsights(recipe);

    return `
      <section class="page recipe-detail-page">
        <header class="page-header-block">
          <div>
            <button class="inline-back" onclick="App.navigate('recipes')">返回推荐列表</button>
            <h1>${this.escapeHtml(detail.name)}</h1>
            <p class="hero-subtitle">${this.escapeHtml(detail.category)} · ${this.escapeHtml(detail.time)} · ${detail.servings} 人份</p>
          </div>
          <div class="header-actions">
            <span class="status-pill ${detail.statusTone}">${this.escapeHtml(detail.statusLabel)}</span>
            <button class="secondary-button" onclick='App.askAboutRecipe(${JSON.stringify(detail.name)})'>问厨师技巧</button>
          </div>
        </header>

        <div class="detail-grid">
          <section class="panel">
            <div class="panel-head compact">
              <div>
                <p class="section-kicker">推荐理由</p>
                <h2>这道菜为什么排在前面</h2>
              </div>
            </div>

            <div class="insight-strip">
              <div class="insight-chip">
                <span>综合分</span>
                <strong>${detail.score}</strong>
              </div>
              <div class="insight-chip">
                <span>健康分</span>
                <strong>${detail.healthScore}</strong>
              </div>
              <div class="insight-chip">
                <span>主料命中</span>
                <strong>${Math.round(detail.coverage * 100)}%</strong>
              </div>
            </div>

            <div class="reason-stack">
              ${detail.reasons.map(reason => `<p>${this.escapeHtml(reason)}</p>`).join('') || '<p>按当前库存、数量和偏好综合排序。</p>'}
            </div>

            ${(detail.missingCore.length || detail.shortCore.length) ? `
              <div class="shopping-note">
                <strong>需要补充</strong>
                <p>
                  ${detail.missingCore.length ? `缺少 ${this.escapeHtml(detail.missingCore.map(item => item.name).join('、'))}` : ''}
                  ${detail.shortCore.length ? `${detail.missingCore.length ? '；' : ''}数量偏少 ${this.escapeHtml(detail.shortCore.map(item => item.name).join('、'))}` : ''}
                </p>
              </div>
            ` : `
              <div class="shopping-note ready">
                <strong>可以直接做</strong>
                <p>主料已经够量，补齐常规调味后就能开始。</p>
              </div>
            `}
          </section>

          <section class="panel">
            <div class="panel-head compact">
              <div>
                <p class="section-kicker">食材清单</p>
                <h2>按 ${detail.servings} 人份自动换算</h2>
              </div>
            </div>
            <div class="ingredient-detail-list">
              ${detail.comparisons.map(item => `
                <div class="ingredient-detail-row">
                  <div>
                    <strong>${this.escapeHtml(item.name)}</strong>
                    <span>${this.escapeHtml(item.amount)}</span>
                  </div>
                  <div class="ingredient-state ${item.inventory.status}">
                    <em>${this.escapeHtml(item.inventory.stockText)}</em>
                    <strong>${this.escapeHtml(this.translateInventoryStatus(item.inventory.status))}</strong>
                  </div>
                </div>
              `).join('')}
            </div>
          </section>
        </div>

        <section class="panel">
          <div class="panel-head compact">
            <div>
              <p class="section-kicker">制作步骤</p>
              <h2>按顺序执行更稳</h2>
            </div>
          </div>
          <div class="step-list">
            ${detail.steps.map((step, index) => `
              <div class="step-row">
                <span>${index + 1}</span>
                <p>${this.escapeHtml(step)}</p>
              </div>
            `).join('')}
          </div>
        </section>
      </section>
    `;
  },

  translateInventoryStatus(status) {
    switch (status) {
      case 'enough':
        return '库存足够';
      case 'short':
        return '数量偏少';
      case 'missing':
        return '还未添加';
      case 'optional-missing':
        return '可选调料';
      default:
        return '估算匹配';
    }
  },

  renderChatPage() {
    return `
      <section class="page chat-page">
        <header class="page-header-block">
          <div>
            <p class="eyebrow">Chef Assistant</p>
            <h1>问厨师，围绕你的库存和偏好。</h1>
          </div>
        </header>

        ${this.renderChatModelSelector()}

        <div class="chat-layout panel">
          <div class="chat-hints">
            ${['这周想吃得更健康，怎么搭配？', '鸡翅更嫩一点怎么做？', '少买两样调料也能完成吗？'].map(prompt => `
              <button class="hint-chip" onclick='App.fillPrompt(${JSON.stringify(prompt)})'>${this.escapeHtml(prompt)}</button>
            `).join('')}
          </div>

          <div class="chat-messages" id="chat-messages">
            ${this.state.chatMessages.length
              ? this.state.chatMessages.map(message => `
                <div class="chat-msg ${message.role}">
                  <strong>${message.role === 'user' ? '你' : '厨师助手'}</strong>
                  <div class="chat-bubble">${this.formatMarkdown(message.content)}</div>
                </div>
              `).join('')
              : `
                <div class="empty-state subtle">
                  <p>你可以问更健康的替代做法、如何减少调料、或者今晚这顿怎么搭配更均衡。</p>
                </div>
              `
            }
          </div>

          <div class="chat-input-row">
            <input type="text" id="chat-input" class="search-input" placeholder="输入你的烹饪问题..." onkeydown="if(event.key==='Enter') App.sendChat()">
            <button class="primary-button" onclick="App.sendChat()">发送</button>
          </div>
        </div>
      </section>
    `;
  },

  renderSettingsPage() {
    return `
      <section class="page settings-page">
        <header class="page-header-block">
          <div>
            <p class="eyebrow">Settings</p>
            <h1>偏好与 AI 设置</h1>
          </div>
        </header>

        <div class="settings-grid">
          <section class="panel">
            <div class="panel-head compact">
              <div>
                <p class="section-kicker">AI 模型</p>
                <h2>选择模型并配置 API Key</h2>
              </div>
            </div>
            <p class="support-copy">选择你想用的 AI 模型，然后填入对应平台的 API Key。未配置时，本地推荐仍可使用。</p>
            <div class="chip-row" style="margin-bottom:12px;">
              ${Object.entries(AI_PROVIDERS).map(([id, p]) => `
                <button class="pref-chip ${AI_API.provider === id ? 'active' : ''}" onclick='App.setAiProvider(${JSON.stringify(id)})'>${this.escapeHtml(p.label)}</button>
              `).join('')}
            </div>
            <p class="support-copy">从 <a href="${AI_API.config.site}" target="_blank" rel="noreferrer">${AI_API.config.site}</a> 获取 ${AI_API.config.label} API Key。配置成功后，可在"语音问答"页选择具体模型；拍照识别支持 DeepSeek-Flash 或智谱 GLM-4V。</p>
            <div class="settings-row">
              <input type="password" id="ai-key" class="search-input" placeholder="${AI_API.key ? '已配置（输入新值可覆盖）' : `输入你的 ${AI_API.config.label} API Key`}">
              <button class="primary-button" onclick="App.saveApiKey()">保存</button>
            </div>
            <p class="support-copy" id="api-save-status">${AI_API.key ? `已配置 ${AI_API.config.label}，可以用 AI 生成今日菜单。` : `未配置 ${AI_API.config.label}，当前只使用本地规则推荐。`}</p>
          </section>

          <section class="panel">
            <div class="panel-head compact">
              <div>
                <p class="section-kicker">数据管理</p>
                <h2>重置本地状态</h2>
              </div>
            </div>
            <p class="support-copy">会清空库存、聊天记录和人数偏好。</p>
            <button class="secondary-button danger" onclick="App.clearData()">清空所有数据</button>
          </section>
        </div>
      </section>
    `;
  },

  renderIngredientModal() {
    if (!this.state.modal) return '';
    if (this.state.modal.mode === 'batch-preview') {
      return this.renderBatchPreviewModal();
    }
    const unitOptions = Array.from(new Set([...COMMON_UNITS, this.state.modal.unit].filter(Boolean)));

    return `
      <div class="modal-overlay" onclick="App.dismissModal(event)">
        <div class="modal-sheet">
          <div class="panel-head">
            <div>
              <p class="section-kicker">${this.state.modal.mode === 'edit' ? '编辑库存' : '新增库存'}</p>
              <h2>${this.state.modal.mode === 'edit' ? '调整食材数量和单位' : '录入这次实际库存'}</h2>
            </div>
            <button class="text-button" onclick="App.closeModal()">关闭</button>
          </div>

          <div class="modal-form">
            <label>
              食材名称
              <input id="modal-name" class="search-input" value="${this.escapeHtml(this.state.modal.name)}" placeholder="例如：三文鱼">
            </label>

            <div class="modal-grid">
              <label>
                数量
                <div class="modal-stepper">
                  <button type="button" class="stepper-btn" onclick="App.modalNudge(-1)">减</button>
                  <input id="modal-amount" class="search-input" value="${this.escapeHtml(this.state.modal.amount)}" placeholder="例如：500">
                  <button type="button" class="stepper-btn" onclick="App.modalNudge(1)">加</button>
                </div>
              </label>

              <label>
                单位
                <select id="modal-unit" class="search-input">
                  ${unitOptions.map(unit => `<option value="${this.escapeHtml(unit)}" ${unit === this.state.modal.unit ? 'selected' : ''}>${this.escapeHtml(unit)}</option>`).join('')}
                </select>
              </label>
            </div>

            <label>
              分类
              <select id="modal-category" class="search-input">
                ${['肉类', '蛋奶', '蔬菜', '豆制品', '主食', '调料', '饮品/其他', '其他'].map(category => `
                  <option value="${this.escapeHtml(category)}" ${category === this.state.modal.category ? 'selected' : ''}>${this.escapeHtml(category)}</option>
                `).join('')}
              </select>
            </label>
          </div>

          <div class="modal-actions">
            ${this.state.modal.mode === 'edit'
              ? `<button class="secondary-button danger" onclick='App.deleteIngredientFromModal(${JSON.stringify(this.state.modal.originalName)})'>删除这项</button>`
              : '<span></span>'
            }
            <button class="primary-button" onclick="App.saveIngredientFromModal()">保存到库存</button>
          </div>
        </div>
      </div>
    `;
  },

  renderBatchPreviewModal() {
    const items = this.state.modal?.items || [];
    return `
      <div class="modal-overlay" onclick="App.dismissModal(event)">
        <div class="modal-sheet">
          <div class="panel-head">
            <div>
              <p class="section-kicker">识别结果</p>
              <h2>确认要添加的食材（${items.length} 项）</h2>
            </div>
            <button class="text-button" onclick="App.closeModal()">关闭</button>
          </div>
          <div class="inventory-list" style="max-height:50vh;overflow-y:auto;">
            ${items.map((item, i) => `
              <div class="inventory-row">
                <div class="inventory-main">
                  <span class="inventory-icon">${this.escapeHtml(this.getIngredientMeta(item.name, item.category).emoji)}</span>
                  <div>
                    <strong>${this.escapeHtml(item.name)}</strong>
                    <span>${this.escapeHtml(item.category)}</span>
                  </div>
                </div>
                <div class="inventory-qty">
                  <strong>${this.escapeHtml(item.amount)}${this.escapeHtml(item.unit)}</strong>
                </div>
                <div class="inventory-actions">
                  <button class="text-button danger" onclick='App.removeBatchItem(${i})'>移除</button>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="modal-actions">
            <button class="secondary-button" onclick="App.closeModal()">取消</button>
            <button class="primary-button" onclick="App.confirmBatchAdd()">全部加入库存</button>
          </div>
        </div>
      </div>
    `;
  },

  navigate(page) {
    this.state.page = page;
    this.saveState();
    this.render();
  },

  changeServings(delta) {
    this.state.servings = this.clampNumber(this.state.servings + delta, 1, 10, this.state.servings);
    this.saveState();
    this.render();
  },

  changeDishCount(delta) {
    this.state.dishCount = this.clampNumber(this.state.dishCount + delta, 1, 5, this.state.dishCount);
    this.saveState();
    this.render();
  },

  setPreference(preference) {
    if (!PREFERENCE_PRESETS[preference]) return;
    this.state.preference = preference;
    this.saveState();
    this.render();
  },

  setIngredientSearch(value) {
    this.state.ingredientSearch = value;
    this.render();
  },

  setActiveCategory(category) {
    this.state.activeCategory = category;
    this.state.activeSubCategory = '全部';
    this.render();
  },

  setActiveSubCategory(sub) {
    this.state.activeSubCategory = sub;
    this.render();
  },

  renderSuggestionGroups(rows) {
    if (!rows.length) {
      return `<div class="empty-state subtle" style="grid-column:1/-1;"><p>没找到匹配食材，直接在上面输入名字即可。</p></div>`;
    }
    const order = [];
    const groups = {};
    rows.forEach(item => {
      const key = item.subCategory || item.category || '其他';
      if (!order.includes(key)) { order.push(key); groups[key] = []; }
      groups[key].push(item);
    });
    return order.map(key => `
      <p style="grid-column:1/-1;font-size:12px;color:#999;margin:8px 0 0;font-weight:600;">${this.escapeHtml(key)}</p>
      ${groups[key].map(item => {
        const hasItem = this.state.fridge.some(entry => entry.name === item.name);
        return `
          <button class="suggestion-chip ${hasItem ? 'selected' : ''}" onclick='App.applySuggestedIngredient(${JSON.stringify(item.name)}, ${JSON.stringify(item.category)})'>
            <span>${this.escapeHtml(item.emoji)}</span>
            <strong>${this.escapeHtml(item.name)}</strong>
          </button>
        `;
      }).join('')}
    `).join('');
  },

  getInventoryNudge(unit) {
    if (unit === 'kg') return 0.1;
    if (unit === 'g' || unit === 'ml') return 50;
    if (unit === 'L') return 0.1;
    return 1;
  },

  modalNudge(direction) {
    const amountInput = document.getElementById('modal-amount');
    const unitSelect = document.getElementById('modal-unit');
    if (!amountInput) return;
    const current = parseFloat(amountInput.value) || 0;
    const unit = unitSelect?.value || '份';
    const step = this.getInventoryNudge(unit);
    const next = Math.max(0, +(current + direction * step).toFixed(2));
    amountInput.value = next;
  },

  nudgeIngredient(name, direction) {
    const item = this.state.fridge.find(entry => entry.name === name);
    if (!item) return;

    const current = this.parseNumericAmount(item.amount);
    if (!Number.isFinite(current)) {
      this.editIngredient(name);
      return;
    }

    const next = current + this.getInventoryNudge(item.unit) * direction;
    if (next <= 0) {
      this.removeFromFridge(name);
      return;
    }

    item.amount = this.formatNumber(next);
    this.saveState();
    this.render();
  },

  openIngredientModal(name = '', category = '其他') {
    const existing = name ? this.state.fridge.find(item => item.name === name) : null;
    const meta = this.getIngredientMeta(name, category);
    const resolvedCategory = existing?.category || category || meta.category || '其他';
    const fallback = this.getDefaultInventoryPreset(name, resolvedCategory);

    this.state.modal = {
      mode: existing ? 'edit' : 'create',
      originalName: existing?.name || name || '',
      name: existing?.name || name || '',
      amount: existing?.amount || fallback.amount || '1',
      unit: existing?.unit || fallback.unit || '份',
      category: resolvedCategory
    };
    this.render();
  },

  editIngredient(name) {
    this.openIngredientModal(name);
  },

  closeModal() {
    this.state.modal = null;
    this.render();
  },

  dismissModal(event) {
    if (event.target.classList.contains('modal-overlay')) {
      this.closeModal();
    }
  },

  saveIngredientFromModal() {
    const name = document.getElementById('modal-name')?.value.trim();
    const amount = document.getElementById('modal-amount')?.value.trim() || '1';
    const unit = document.getElementById('modal-unit')?.value.trim() || '份';
    const category = document.getElementById('modal-category')?.value || '其他';

    if (!name) {
      const input = document.getElementById('modal-name');
      if (input) input.focus();
      return;
    }

    const existingIndex = this.state.fridge.findIndex(item => item.name === this.state.modal.originalName);
    const nextItem = this.normalizeFridgeItem({
      id: existingIndex >= 0 ? this.state.fridge[existingIndex].id : `ingredient-${Date.now()}`,
      name,
      amount,
      unit,
      category
    }, existingIndex >= 0 ? existingIndex : this.state.fridge.length);

    if (existingIndex >= 0) {
      this.state.fridge.splice(existingIndex, 1, nextItem);
    } else {
      const duplicateIndex = this.state.fridge.findIndex(item => item.name === name);
      if (duplicateIndex >= 0) {
        this.state.fridge.splice(duplicateIndex, 1, nextItem);
      } else {
        this.state.fridge.push(nextItem);
      }
    }

    this.state.modal = null;
    this.saveState();
    this.render();
  },

  deleteIngredientFromModal(name) {
    this.state.fridge = this.state.fridge.filter(item => item.name !== name);
    this.state.modal = null;
    this.saveState();
    this.render();
  },

  removeFromFridge(name) {
    this.state.fridge = this.state.fridge.filter(item => item.name !== name);
    this.saveState();
    this.render();
  },

  showRecipe(id) {
    this.state.selectedRecipe = id;
    this.state.page = 'recipe';
    this.saveState();
    this.render();
  },

  getFridgeSummaryText() {
    return this.state.fridge.length
      ? this.state.fridge.map(item => `${item.name} ${item.amount}${item.unit}`).join('、')
      : '库存暂时为空';
  },

  async aiRecommend() {
    if (!this.state.fridge.length) {
      throw new Error('请先录入库存食材，再生成 AI 菜单。');
    }

    const messages = [
      {
        role: 'system',
        content: `你是一位擅长家常菜和健康搭配的中文厨师助手。请根据用户库存与偏好生成今晚菜单。
要求：
1. 以 ${this.state.servings} 人、${this.state.dishCount} 道菜为目标。
2. 偏好为“${PREFERENCE_PRESETS[this.state.preference].label}”。
3. 推荐时优先考虑健康、美味、库存利用率和实际可操作性。
4. 输出每道菜的定位（主菜/素菜/汤/配菜），并给出按人数换算后的食材用量。
5. 明确说明哪些食材库存已足够，哪些还需要补一点。
6. 尽量减少复杂调料依赖，给出更稳妥的替代建议。`
      },
      {
        role: 'user',
        content: `我的库存有：${this.getFridgeSummaryText()}。请为我设计今晚菜单。`
      }
    ];

    return AI_API.chat(messages);
  },

  async aiRecommendRecipes() {
    const resultDiv = document.getElementById('ai-result');
    if (!resultDiv) return;

    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<div class="support-copy">AI 正在根据库存、人数和偏好生成菜单...</div>';

    try {
      const result = await this.aiRecommend();
      resultDiv.innerHTML = `<div class="ai-content">${this.formatMarkdown(result)}</div>`;
    } catch (error) {
      resultDiv.innerHTML = `<div class="support-copy error-text">AI 生成失败（${AI_API.config.label} · ${AI_API.model}）：${this.escapeHtml(error.message)}。请检查当前 AI 模型对应的 API Key 是否配置成功，或在"语音问答"页切换模型后重试。</div>`;
    }
  },

  fillPrompt(prompt) {
    const input = document.getElementById('chat-input');
    if (!input) return;
    input.value = prompt;
    input.focus();
  },

  async chat(userMsg) {
    this.state.chatMessages.push({ role: 'user', content: userMsg });
    this.render();

    const systemMsg = {
      role: 'system',
      content: `你是一位务实的中文厨师助手。用户库存：${this.getFridgeSummaryText()}。人数：${this.state.servings} 人。偏好：${PREFERENCE_PRESETS[this.state.preference].label}。
请优先回答：
- 更健康但不寡淡的做法
- 食材替代方案
- 如何减少调料和失败率
- 如何搭配成一顿更均衡的餐`
    };

    try {
      const reply = await AI_API.chat([systemMsg, ...this.state.chatMessages.slice(-8)]);
      this.state.chatMessages.push({ role: 'assistant', content: reply });
    } catch (error) {
      this.state.chatMessages.push({
        role: 'assistant',
        content: `暂时无法调用 AI（${AI_API.config.label} · ${AI_API.model}）：${error.message}\n可在上方"对话模型"下拉框切换，或去"偏好与 API"重新配置 Key。`
      });
    }

    this.saveState();
    this.render();
  },

  async sendChat() {
    const input = document.getElementById('chat-input');
    const value = input?.value?.trim();
    if (!value) return;
    input.value = '';
    await this.chat(value);
  },

  askAboutRecipe(name) {
    if (!AI_API.key) {
      if (!confirm('需要先配置 AI API 才能问厨师技巧，去设置页配置？')) return;
      this.state.page = 'settings';
      this.render();
      return;
    }
    this.state.page = 'chat';
    this.saveState();
    this.render();
    this.chat(`${name} 怎么做得更稳、更健康、更好吃？如果库存不够，请告诉我最重要的替代方案。`);
  },

  setAiProvider(provider) {
    AI_API.setProvider(provider);
    this.render();
  },

  showApiSaveStatus(message, tone) {
    const el = document.getElementById('api-save-status');
    if (!el) return;
    el.textContent = message;
    el.style.color = tone === 'error' ? '#c0392b' : tone === 'success' ? '#1e8449' : '';
  },

  async saveApiKey() {
    const input = document.getElementById('ai-key');
    const key = input?.value.trim();
    if (!key) return;

    if (/[^\x00-\xFF]/.test(key)) {
      this.showApiSaveStatus('API Key 包含异常字符，请重新复制（只保留 sk- 开头的那串字符）', 'error');
      return;
    }

    const btn = input?.nextElementSibling;
    const originalText = btn?.textContent;
    if (btn) { btn.textContent = '验证中...'; btn.disabled = true; }

    try {
      const res = await fetch(AI_API.config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`
        },
        body: JSON.stringify({
          model: AI_API.config.defaultModel,
          messages: [{ role: 'user', content: 'ok' }],
          max_tokens: 1
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `验证失败（HTTP ${res.status}），请检查 Key 是否正确或账户是否有余额`);
      }

      AI_API.setKey(key);
      this.showApiSaveStatus(`${AI_API.config.label} API 已配置成功`, 'success');
      this.render();
    } catch (error) {
      this.showApiSaveStatus(`验证未通过：${error.message}`, 'error');
      if (btn) { btn.textContent = originalText; btn.disabled = false; }
      if (confirm('API Key 验证失败，是否重新配置？\n点"取消"则跳过，此服务商暂不配置。')) {
        input?.focus();
      } else {
        if (input) input.value = '';
        this.showApiSaveStatus('已跳过，此服务商 API 暂未配置', '');
      }
    }
  },

  clearData() {
    if (!confirm('确定清空库存、聊天记录和设置吗？')) return;

    localStorage.removeItem('cook_app_state');
    localStorage.removeItem('glm_api_key');
    localStorage.removeItem('deepseek_api_key');
    localStorage.removeItem('ai_provider');
    localStorage.removeItem('ai_model');
    localStorage.removeItem('ai_vision_model');
    AI_API.provider = 'glm';
    AI_API.model = AI_API.providers.glm.defaultModel;
    AI_API.visionModel = AI_API.providers.glm.defaultVisionModel;
    this.state = {
      ...this.state,
      fridge: [],
      servings: 2,
      dishCount: 3,
      preference: 'light',
      selectedRecipe: null,
      chatMessages: [],
      page: 'planner',
      activeCategory: '全部',
      activeSubCategory: '全部',
      inventoryExpanded: true,
      ingredientSearch: '',
      modal: null,
      ingredientDraft: {
        name: '',
        amount: '300',
        unit: 'g',
        category: '其他'
      },
      isListening: false,
      isBatchListening: false,
      speechSupported: this.state.speechSupported
    };
    this.render();
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
