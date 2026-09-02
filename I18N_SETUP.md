# Internationalization (i18n) Setup Guide

## Overview

This app now supports multiple languages (English and Traditional Chinese) with a language selector in the Settings screen. Users can switch languages and their preference is persisted across app sessions.

## Installation

### 1. Install Required Packages

Run the following command to install the necessary i18n packages:

```bash
npm install i18next react-i18next expo-localization
```

### 2. Verify Package Installation

After installation, verify that these packages are in your `package.json`:
- `i18next`
- `react-i18next`
- `expo-localization`

## Architecture

### File Structure

```
src/
├── i18n/
│   ├── config.ts                 # i18n configuration
│   └── locales/
│       ├── en.json              # English translations
│       └── zh-TW.json           # Traditional Chinese translations
├── context/
│   ├── AuthContext.tsx
│   └── LanguageContext.tsx      # Language state management
└── screens/
    └── SettingsScreen.tsx       # Updated with language selector
```

### Key Components

1. **i18n Configuration** (`src/i18n/config.ts`)
   - Initializes i18next with react-i18next
   - Loads translation files
   - Handles language persistence with AsyncStorage
   - Detects device locale as fallback

2. **LanguageContext** (`src/context/LanguageContext.tsx`)
   - Provides language state across the app
   - Exposes `t()` function for translations
   - Handles language switching

3. **Translation Files** (`src/i18n/locales/*.json`)
   - Organized by feature/screen
   - Supports interpolation (e.g., `{{percent}}%`)
   - Nested structure for better organization

## Usage

### In React Components

```tsx
import { useLanguage } from '../context/LanguageContext';

function MyScreen() {
  const { t, language, setLanguage } = useLanguage();
  
  return (
    <View>
      <Text>{t('dashboard.title')}</Text>
      <Text>{t('dashboard.calories')}: {calories}</Text>
      <Text>{t('mealCapture.portionPercent', { percent: 50 })}</Text>
    </View>
  );
}
```

### Translation Key Structure

Translation keys follow a hierarchical structure:

```
common.*           - Common UI elements (cancel, confirm, save, etc.)
auth.*             - Authentication screens
settings.*         - Settings screen
dashboard.*        - Dashboard screen
mealCapture.*      - Meal capture screen
results.*          - Results screen
history.*          - History screens
questionnaire.*    - User questionnaire
macros.*           - Macro/nutrition labels
errors.*           - Error messages
```

### Adding New Translations

1. Add the key-value pair to both `en.json` and `zh-TW.json`:

**en.json:**
```json
{
  "myScreen": {
    "title": "My Screen",
    "description": "This is my screen"
  }
}
```

**zh-TW.json:**
```json
{
  "myScreen": {
    "title": "我的畫面",
    "description": "這是我的畫面"
  }
}
```

2. Use in your component:
```tsx
<Text>{t('myScreen.title')}</Text>
<Text>{t('myScreen.description')}</Text>
```

## Language Switching

Users can change language from the Settings screen:
1. Navigate to Settings
2. Tap on "Language" / "語言"
3. Select desired language (English or 繁體中文)
4. The app will immediately update all text

The selected language is stored in AsyncStorage and persists across app restarts.

## Handling API Responses

For AI-generated content (like meal analysis results, tips, and recommendations), you have two options:

### Option 1: Pass Language to API
Update the API call to include the user's language preference:

```tsx
const { language } = useLanguage();

const response = await sendPhotoBase64ToOpenAI({
  base64Image,
  mode: 'single_pass',
  language: language, // 'en' or 'zh-TW'
  // ... other params
});
```

Then update the backend prompt to respond in the requested language.

### Option 2: Client-Side Translation
For static or predictable responses, add translations to the JSON files and map API responses to translation keys.

## Example: Updating a Screen

Here's an example of updating the DashboardScreen to use translations:

**Before:**
```tsx
<Text style={styles.title}>儀表板</Text>
<Text>卡路里</Text>
<Text>早餐</Text>
```

**After:**
```tsx
import { useLanguage } from '../context/LanguageContext';

function DashboardScreen() {
  const { t } = useLanguage();
  
  return (
    <>
      <Text style={styles.title}>{t('dashboard.title')}</Text>
      <Text>{t('dashboard.calories')}</Text>
      <Text>{t('dashboard.breakfast')}</Text>
    </>
  );
}
```

## Testing

1. **Test Language Switching:**
   - Open Settings
   - Change language
   - Verify all screens update immediately

2. **Test Persistence:**
   - Change language
   - Close and reopen the app
   - Verify language preference is maintained

3. **Test Device Locale:**
   - Uninstall app (clears AsyncStorage)
   - Set device to Chinese
   - Install and open app
   - Should default to Traditional Chinese

## Troubleshooting

### Lint Errors After Setup

The lint errors about missing modules will disappear after running `npm install`. If they persist:

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Translation Not Updating

1. Check that the translation key exists in both language files
2. Verify you're using the `useLanguage` hook, not `useTranslation` directly
3. Check console for missing translation warnings

### Language Not Persisting

1. Verify AsyncStorage permissions
2. Check that `@react-native-async-storage/async-storage` is installed
3. Clear app data and test again

## Next Steps

1. **Install packages** (see Installation section above)
2. **Update remaining screens** to use translation keys
3. **Test thoroughly** on both iOS and Android
4. **Update API calls** to pass language preference if needed
5. **Add more languages** by creating new locale files (e.g., `zh-CN.json` for Simplified Chinese)

## Adding Additional Languages

To add a new language:

1. Create a new locale file: `src/i18n/locales/[language-code].json`
2. Copy the structure from `en.json` and translate all values
3. Update `src/i18n/config.ts`:
   ```ts
   import newLang from './locales/[language-code].json';
   
   const resources = {
     en: { translation: en },
     'zh-TW': { translation: zh },
     '[language-code]': { translation: newLang },
   };
   ```
4. Update `SettingsScreen.tsx` to add the new language option

## Support

For issues or questions about the i18n implementation, refer to:
- [i18next documentation](https://www.i18next.com/)
- [react-i18next documentation](https://react.i18next.com/)
- [expo-localization documentation](https://docs.expo.dev/versions/latest/sdk/localization/)
