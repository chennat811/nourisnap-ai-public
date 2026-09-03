# Forkcast

An AI-powered mobile application that helps users analyze their meals by capturing photos and providing nutritional information.

> **Note:** This is the public-facing mobile app repository. The AI backend (Supabase Edge Function that calls OpenAI) is kept in a separate private repository and is not included here.

## Demo

Watch the app in action: [YouTube Demo](https://youtu.be/6O7CGHmkIAc)

## Features

- Meal photo capture using device camera
- Image selection from device gallery
- AI-powered nutritional analysis
- Meal history tracking
- User-friendly interface
- Cross-platform support (iOS, Android, Web)

## Tech Stack

- React Native with Expo (Frontend)
- TypeScript
- Supabase (auth, database, storage)
- React Navigation for routing
- Open Food Facts API for nutritional data

## Repository Structure

This public repo contains the mobile application source (screens, components, hooks, utilities). The AI-powered Supabase Edge Function backend is maintained separately as private source code.

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Expo CLI
- A modern web browser (for web version)
- iOS/Android device or simulator (for mobile versions)
- Expo Account (for EAS builds)

### EAS Setup

To set up EAS (Expo Application Services) for building and deploying your app:

1. Install the EAS CLI globally:
```bash
npm install -g eas-cli
```

2. Login to your Expo account:
```bash
eas login
```

3. Initialize EAS:
```bash
eas init
```

4. Build your app:
```bash
eas build
```

5. Submit to app stores:
```bash
eas submit
```

For more detailed instructions, see the [Expo EAS documentation](https://docs.expo.dev/build/introduction/)

### Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd new_ai_food_app
```

2. Install dependencies:
```bash
# Install frontend dependencies
npm install
```

3. Start the Supabase backend (Edge Functions, DB, etc):
```bash
supabase start
```

4. Start the frontend development server:
```bash
npm start
```

### Running the App

You can run the app in several ways:

1. **Mobile Version**:
   - Install the Expo Go app on your mobile device
   - Run `npm start`
   - Scan the QR code with Expo Go

2. **iOS Simulator**:
```bash
npm run ios
```

3. **Android Emulator**:
```bash
npm run android
```

### Running on Physical Device

When running on a physical device, ensure your mobile device and computer are on the same network. Update the frontend API base URL if needed to point to your computer's local IP and Supabase Edge Function endpoint.

### Project Structure

```
new_ai_food_app/
├── src/
│   ├── screens/          # Main application screens
│   ├── components/       # Reusable UI components
│   ├── services/         # Service layer (AI, storage)
│   └── types/           # TypeScript type definitions
├── assets/              # Static assets
└── App.tsx             # Root component
```

---

### Supabase Edge Functions & Environment Variables

If you use Supabase Edge Functions (e.g., for OpenAI integration), you must set environment variables correctly for both local development and production deployment.

### Setting the `OPENAI_API_KEY`

**Locally:**
- Create a `.env` file in your project root and add:
  ```
  OPENAI_API_KEY=sk-...
  ```
- When serving functions locally, use:
  ```sh
  supabase functions serve openai --env-file ../../.env
  ```
  (Adjust the path if your `.env` is elsewhere.)

- Link to a supabase project
```bash
supabase link --project-ref project-ref
```

**On Supabase Cloud:**
- Go to the Supabase Dashboard → Project → Functions → Environment Variables.
- Add `OPENAI_API_KEY` with your API key value.
- Re-deploy your function after making changes.

---

## Deploying & Managing Supabase Edge Functions

### Local Development

1. **Serve the Edge Function Locally (with environment variables):**
   ```sh
   supabase functions serve openai --env-file ../../.env
   ```
   - Adjust the path to your `.env` file as needed.
   - This will hot-reload on changes to the function code.

2. **Restart the Local Function:**
   - Stop the running process (Ctrl+C) and rerun the above command.

### Deploying to Supabase Cloud

1. **Deploy the Function:**
   ```sh
   supabase link --project-ref cidkmfusikeddkqxierk
   supabase functions deploy openai
   ```
   - This uploads your latest function code to Supabase Cloud.

2. **(Re)Deploy After Changes:**
   - Run the deploy command again after any code or environment variable change.
   ```sh
   eas build -p ios --profile staging
   eas submit -p ios --latest  
   ```

3. **Set/Update Environment Variables:**
   - Go to Supabase Dashboard → Project → Functions → Environment Variables.
   - Add or update variables (e.g., `OPENAI_API_KEY`).
   - After updating, you must redeploy the function for changes to take effect.

### Notes & Troubleshooting
- Supabase Edge Functions do **not** auto-load `.env` files in production; set variables in the dashboard.
- Locally, always use the `--env-file` flag if you rely on a `.env` file.
- If you see `OPENAI_API_KEY environment variable not set`, double-check your setup as above.
- For mock mode, set `USE_OPENAI_MOCK=true` in your `.env` (local) or dashboard (cloud).
- For quota/billing errors from OpenAI, check your usage and billing at [OpenAI dashboard](https://platform.openai.com/account/usage).

### Evaluation

To run evals, set model name, prompt version, edge function url, and repeat count:
```
export EVAL_MODEL_NAME="gpt-4o"
export EVAL_PROMPT_VERSION="2025-12-18-breakdown-tuned"

python eval/run_eval.py --function-url "https://.../openai" --repeats 5

### Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### License

This project is licensed under the MIT License - see the LICENSE file for details.

### Acknowledgments

- Expo for cross-platform development
- React Navigation for routing

### Privacy & Data Sharing (Optional Feature) ## TODO
Next steps for Option 3 (when you're ready)
Later, when you want to add the opt-in feature:

Add translation keys for the consent feature:
json
"dataSharing": {
  "title": "Help Improve NouriSnap",
  "titleZh": "協助改善 NouriSnap",
  "description": "Allow us to use your meal photos to train our AI model and improve food recognition accuracy. You can change this anytime in Settings.",
  "descriptionZh": "允許我們使用你的餐點照片來訓練 AI 模型，提升食物辨識準確度。你可以隨時在設定中更改此選項。",
  "enabled": "Share photos to improve service",
  "disabled": "Don't share my photos"
}
Add a toggle in SettingsScreen (I can help implement this when you're ready)
Store the preference in user settings table in Supabase
Check the preference before using photos for training