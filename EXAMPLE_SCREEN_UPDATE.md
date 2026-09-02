# Example: Updating DashboardScreen with i18n

This document shows a complete example of how to update an existing screen to use translations.

## Before: DashboardScreen (Hardcoded Chinese Text)

```tsx
// Hardcoded text examples from DashboardScreen
<Text style={styles.headerTitle}>今天</Text>
<Text style={styles.macroLabel}>卡路里</Text>
<Text style={styles.macroLabel}>蛋白質</Text>
<Text style={styles.macroLabel}>碳水化合物</Text>
<Text style={styles.macroLabel}>脂肪</Text>
<Text style={styles.mealTypeText}>早餐</Text>
<Text style={styles.mealTypeText}>午餐</Text>
<Text style={styles.mealTypeText}>晚餐</Text>
<Text style={styles.mealTypeText}>點心</Text>
```

## After: DashboardScreen (Using Translations)

### Step 1: Import useLanguage Hook

```tsx
import { useLanguage } from '../context/LanguageContext';
```

### Step 2: Use the Hook in Component

```tsx
export default function DashboardScreen() {
  const navigation = useNavigation<AppNavigation>();
  const { session } = useAuth() || {};
  const { t } = useLanguage(); // Add this line
  
  // ... rest of component
}
```

### Step 3: Replace Hardcoded Text

```tsx
// Replace hardcoded text with translation keys
<Text style={styles.headerTitle}>{t('dashboard.today')}</Text>
<Text style={styles.macroLabel}>{t('dashboard.calories')}</Text>
<Text style={styles.macroLabel}>{t('dashboard.protein')}</Text>
<Text style={styles.macroLabel}>{t('dashboard.carbs')}</Text>
<Text style={styles.macroLabel}>{t('dashboard.fat')}</Text>
<Text style={styles.mealTypeText}>{t('dashboard.breakfast')}</Text>
<Text style={styles.mealTypeText}>{t('dashboard.lunch')}</Text>
<Text style={styles.mealTypeText}>{t('dashboard.dinner')}</Text>
<Text style={styles.mealTypeText}>{t('dashboard.snack')}</Text>
```

### Step 4: Handle Dynamic Text with Interpolation

For text with variables:

**Before:**
```tsx
<Text>{`剩餘 ${remaining} 大卡`}</Text>
<Text>{`超過 ${over} 大卡`}</Text>
```

**After:**
```tsx
<Text>{remaining} {t('dashboard.remaining')}</Text>
<Text>{over} {t('dashboard.over')}</Text>
```

Or with interpolation:
```tsx
// Add to translation files:
// en.json: "remainingCalories": "{{amount}} kcal remaining"
// zh-TW.json: "remainingCalories": "剩餘 {{amount}} 大卡"

<Text>{t('dashboard.remainingCalories', { amount: remaining })}</Text>
```

### Step 5: Handle Alert Messages

**Before:**
```tsx
Alert.alert('錯誤', '無法載入資料');
Alert.alert('成功', '已儲存');
```

**After:**
```tsx
Alert.alert(t('common.error'), t('errors.networkError'));
Alert.alert(t('common.success'), t('results.savedSuccess'));
```

## Complete Example: Meal Type Button

### Before:
```tsx
<TouchableOpacity onPress={() => handleMealPress('breakfast')}>
  <Text style={styles.mealTypeText}>早餐</Text>
  <Text style={styles.calorieText}>{breakfastCal || 0} 大卡</Text>
</TouchableOpacity>
```

### After:
```tsx
<TouchableOpacity onPress={() => handleMealPress('breakfast')}>
  <Text style={styles.mealTypeText}>{t('dashboard.breakfast')}</Text>
  <Text style={styles.calorieText}>{breakfastCal || 0} {t('macros.kcal')}</Text>
</TouchableOpacity>
```

## Quick Reference: Common Patterns

### 1. Simple Text Replacement
```tsx
// Before: <Text>設定</Text>
// After:  <Text>{t('settings.title')}</Text>
```

### 2. Button Labels
```tsx
// Before: <Text>儲存</Text>
// After:  <Text>{t('common.save')}</Text>
```

### 3. With Variables
```tsx
// Before: <Text>{`${value} 克`}</Text>
// After:  <Text>{value} {t('macros.grams')}</Text>
```

### 4. Alert Dialogs
```tsx
// Before:
Alert.alert('刪除確認', '確定要刪除嗎？', [
  { text: '取消', style: 'cancel' },
  { text: '刪除', style: 'destructive', onPress: handleDelete }
]);

// After:
Alert.alert(
  t('history.deleteLog'),
  t('history.deleteConfirm'),
  [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.delete'), style: 'destructive', onPress: handleDelete }
  ]
);
```

### 5. Placeholder Text
```tsx
// Before: <TextInput placeholder="輸入餐點名稱" />
// After:  <TextInput placeholder={t('results.mealName')} />
```

### 6. Navigation Titles
```tsx
// Before:
<Stack.Screen
  name="Settings"
  component={SettingsScreen}
  options={{ title: "設定" }}
/>

// After:
// Option 1: Use static title from translation
<Stack.Screen
  name="Settings"
  component={SettingsScreen}
  options={{ title: "Settings" }} // Keep English for navigation
/>

// Option 2: Dynamic title (requires more setup)
// Set headerShown: false and use custom header in component
```

## Testing Your Changes

After updating a screen:

1. **Visual Test:**
   - Open the screen in English
   - Switch to Traditional Chinese in Settings
   - Verify all text updates correctly

2. **Edge Cases:**
   - Test with long text strings
   - Test with empty/null values
   - Test with special characters

3. **Functionality:**
   - Ensure buttons still work
   - Verify navigation still functions
   - Check that data displays correctly

## Common Mistakes to Avoid

### ❌ Don't: Hardcode fallback text
```tsx
<Text>{t('dashboard.title') || '儀表板'}</Text>
```

### ✅ Do: Let i18n handle fallbacks
```tsx
<Text>{t('dashboard.title')}</Text>
```

### ❌ Don't: Mix languages in one component
```tsx
<Text>Today's {t('dashboard.calories')}</Text>
```

### ✅ Do: Use full translation keys
```tsx
<Text>{t('dashboard.todaysCalories')}</Text>
```

### ❌ Don't: Concatenate translated strings
```tsx
<Text>{t('dashboard.total')} + ': ' + t('dashboard.calories')}</Text>
```

### ✅ Do: Create combined translation keys
```tsx
// en.json: "totalCalories": "Total Calories"
// zh-TW.json: "totalCalories": "總卡路里"
<Text>{t('dashboard.totalCalories')}</Text>
```

## Screens Priority Order

Recommended order for updating screens (by user visibility):

1. ✅ **SettingsScreen** - Already updated
2. **DashboardScreen** - Main screen, high visibility
3. **MealCaptureScreen** - Core functionality
4. **ResultsScreen** - Core functionality
5. **HistoryDatesScreen** / **HistoryDayScreen** - Frequently used
6. **UserQuestionnaireScreen** - Onboarding
7. **SignInScreen** / **SignUpScreen** - Authentication
8. **BreakdownConfirmScreen** - Refine flow
9. **FeedbackScreen** - Secondary features
10. **ProfileScreen** - Settings related

## Need Help?

- Check `I18N_SETUP.md` for detailed setup instructions
- Review translation files in `src/i18n/locales/` for available keys
- Test in both languages after each screen update
