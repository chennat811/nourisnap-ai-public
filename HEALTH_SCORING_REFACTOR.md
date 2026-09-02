# Health Scoring & Tag Generation Refactor

## Overview
Refactored health scoring and tag generation logic to align with NouriQuest branding and Taiwan HPA/USDA nutrition guidelines.

## Changes Summary

### 1. New Utility Module
**File:** `/src/utils/calculateHealthMetadata.ts`

A clean, testable utility that encapsulates all health scoring logic:

```typescript
export function calculateHealthMetadata(
  score: number,
  nutrition: NutritionData,
  colors: { green: string; lime: string; coral: string }
)
```

**Key Functions:**
- `getHealthScoreMetadata()` - Maps 0-10 score to 5 stages
- `generateHealthTags()` - Advanced tag generation with conditional logic
- `calculateHealthMetadata()` - Combined metadata calculation

---

### 2. Updated Health Score Labels

**5-Stage System (Updated from "Excellent/Healthy" to "Highly Nutritious/Balanced"):**

| Score Range | Label | Color | Translation Key |
|-------------|-------|-------|-----------------|
| 8.0 - 10.0 | **Highly Nutritious** | Green | `results.scoreHighlyNutritious` |
| 6.0 - 7.9 | **Balanced** | Lime | `results.scoreBalanced` |
| 4.0 - 5.9 | Moderate | Gold (#F4A347) | `results.scoreModerate` |
| 2.0 - 3.9 | Could be improved | Gold (#F4A347) | `results.scoreCouldImprove` |
| 0.0 - 1.9 | Needs improvement | Coral | `results.scorePoor` |

**Translations Added:**
- English: "Highly Nutritious", "Balanced"
- Chinese: "營養豐富", "均衡"

---

### 3. Advanced Tag Generation Logic

**Replaced simple thresholds with conditional nutrition science:**

#### Positive/Info Tags:
- **High Protein** (`good`): `protein > 20g` *(increased from 15g)*
- **High Fiber** (`good`): `fiber > 5g` *(increased from 3g)*
- **Fiber Source** (`info`): `fiber >= 3g AND fiber <= 5g` *(NEW)*
- **Low Glycemic Potential** (`good`): `fiber > 3g AND carbs < 40g` *(NEW)*

#### Warning Tags:
- **High Sodium** (`warn`): `sodium > 800mg` *(increased from 500mg)*
- **Refined Carbs** (`warn`): `carbs > 60g AND fiber < 2g` *(NEW: considers fiber ratio)*
- **High Fat** (`warn`): `(fat * 9) / calories > 0.35 OR fat > 30g` *(NEW: fat ratio logic)*
- **Heavy Meal** (`warn`): `calories > 800` *(NEW)*

**Tag Sorting:** Good → Info → Warn (automatically sorted)

---

### 4. Translation Keys Added

**English (`en.json`):**
```json
"tagHighProtein": "High Protein",
"tagHighFiber": "High Fiber",
"tagFiberSource": "Fiber Source",
"tagLowGlycemic": "Low Glycemic Potential",
"tagHighSodium": "High Sodium",
"tagRefinedCarbs": "Refined Carbs",
"tagHighFat": "High Fat",
"tagHeavyMeal": "Heavy Meal"
```

**Chinese (`zh-TW.json`):**
```json
"tagHighProtein": "高蛋白",
"tagHighFiber": "高纖維",
"tagFiberSource": "纖維來源",
"tagLowGlycemic": "低升糖潛力",
"tagHighSodium": "高鈉",
"tagRefinedCarbs": "精緻碳水",
"tagHighFat": "高脂肪",
"tagHeavyMeal": "高熱量"
```

---

### 5. UI Components Updated

**ResultsScreen.tsx** now uses the utility function in 3 places:

1. **Health Score Card** (below photo)
   - Shows stage label with colored background
   - Displays all tags inline

2. **Identified Food Card**
   - Shows all tags with full styling
   - Good/Info/Warn color coding

3. **Health Popup Modal**
   - Shows stage label (no numerical score)
   - Displays up to 4 tags
   - Health recommendation text

**All components now:**
- Use `t(tag.translationKey)` for proper i18n
- Support 3 tag types: `good`, `info`, `warn`
- Hide numerical scores (e.g., no "7.4/10")

---

### 6. Backward Compatibility

Helper functions maintained for existing code:
```typescript
const getScoreColor = (score: number) => { ... }
const getScoreLabel = (score: number) => { ... }
```

---

## Testing Recommendations

### Unit Tests for `calculateHealthMetadata.ts`

```typescript
describe('generateHealthTags', () => {
  it('should generate High Protein tag when protein > 20g', () => {
    const tags = generateHealthTags({
      calories: 500,
      protein: 25,
      carbs: 30,
      fat: 10,
      fiber: 2,
      sodium: 400,
    });
    expect(tags).toContainEqual({
      label: 'High Protein',
      type: 'good',
      translationKey: 'results.tagHighProtein',
    });
  });

  it('should generate Refined Carbs tag when carbs > 60g AND fiber < 2g', () => {
    const tags = generateHealthTags({
      calories: 600,
      protein: 10,
      carbs: 70,
      fat: 15,
      fiber: 1,
      sodium: 300,
    });
    expect(tags).toContainEqual({
      label: 'Refined Carbs',
      type: 'warn',
      translationKey: 'results.tagRefinedCarbs',
    });
  });

  it('should generate High Fat tag based on fat ratio', () => {
    const tags = generateHealthTags({
      calories: 500,
      protein: 20,
      carbs: 30,
      fat: 25, // (25 * 9) / 500 = 0.45 > 0.35
      fiber: 3,
      sodium: 400,
    });
    expect(tags).toContainEqual({
      label: 'High Fat',
      type: 'warn',
      translationKey: 'results.tagHighFat',
    });
  });

  it('should sort tags: good, info, warn', () => {
    const tags = generateHealthTags({
      calories: 900, // Heavy Meal (warn)
      protein: 25,   // High Protein (good)
      carbs: 35,     // Low Glycemic with fiber (good)
      fat: 15,
      fiber: 4,      // Fiber Source (info)
      sodium: 900,   // High Sodium (warn)
    });
    expect(tags[0].type).toBe('good');
    expect(tags[tags.length - 1].type).toBe('warn');
  });
});

describe('getHealthScoreMetadata', () => {
  const colors = { green: '#3D7A5A', lime: '#A8D08D', coral: '#E57373' };

  it('should return Highly Nutritious for score >= 8', () => {
    const metadata = getHealthScoreMetadata(8.5, colors);
    expect(metadata.stage).toBe('highly_nutritious');
    expect(metadata.translationKey).toBe('results.scoreHighlyNutritious');
  });

  it('should return Balanced for score 6-7.9', () => {
    const metadata = getHealthScoreMetadata(7.0, colors);
    expect(metadata.stage).toBe('balanced');
    expect(metadata.translationKey).toBe('results.scoreBalanced');
  });
});
```

---

## Migration Notes

### Breaking Changes
- Old translation keys removed:
  - `results.scoreExcellent` → `results.scoreHighlyNutritious`
  - `results.scoreHealthy` → `results.scoreBalanced`
  - `results.tagProtein` → `results.tagHighProtein`

### Non-Breaking Changes
- Tag thresholds updated (more accurate nutrition science)
- New tags added (Fiber Source, Low Glycemic, Heavy Meal)
- Fat calculation now considers calorie ratio

---

## Benefits

1. **Testable:** Logic extracted to pure functions
2. **Maintainable:** Single source of truth for health calculations
3. **Accurate:** Based on Taiwan HPA/USDA guidelines
4. **Scalable:** Easy to add new tags or adjust thresholds
5. **i18n Ready:** All labels use translation keys
6. **Non-Judgmental:** Positive branding ("Highly Nutritious" vs "Excellent")

---

## Future Enhancements

1. Add unit tests for `calculateHealthMetadata.ts`
2. Consider backend validation of tag logic
3. Add user preferences for tag sensitivity
4. Track tag analytics for nutrition insights
5. Add more granular glycemic index calculations
