# 🍴 Forkcast Setup Guide - Complete Checklist

## 📋 Overview

This guide will help you create a separate gamified nutrition app ("Forkcast") from your existing food tracking app, with its own:
- GitHub repository
- Supabase project
- App Store Connect listing
- TestFlight builds
- Windsurf workspace

**Estimated Timeline**: 3-5 days for complete setup

---

## 🎯 Strategy: Monorepo vs Separate Repo

### Option A: Monorepo (Recommended for Shared Code)
**Pros**:
- Share common code (AI analysis, image processing)
- Single codebase for bug fixes
- Easier dependency management
- Can extract shared logic to packages

**Cons**:
- More complex build configuration
- Need to manage multiple app configs

### Option B: Separate Repository (Recommended for Independence)
**Pros**:
- Complete independence
- Simpler deployment
- No risk of breaking original app
- Easier to sell/transfer later

**Cons**:
- Code duplication
- Bug fixes need to be applied twice
- More maintenance overhead

**My Recommendation**: **Option B (Separate Repo)** for now, then refactor to monorepo later if needed.

---

## 📅 DAILY AGENDA - 5-DAY SETUP PLAN

---

## 🗓️ DAY 1: Repository & Project Setup

### Morning (2-3 hours)

#### ✅ Task 1.1: Create New GitHub Repository
- [ ] Go to GitHub.com
- [ ] Click "New Repository"
- [ ] Name: `forkcast-nutrition-app` (or your preferred name)
- [ ] Description: "Gamified nutrition learning app - Duolingo for nutrition science"
- [ ] Set to Private (for now)
- [ ] Initialize with README
- [ ] Add .gitignore (Node)
- [ ] Create repository

#### ✅ Task 1.2: Clone and Setup Local Project
```bash
# Navigate to your projects folder
cd ~/CascadeProjects

# Clone the new repo
git clone https://github.com/YOUR_USERNAME/forkcast-nutrition-app.git
cd forkcast-nutrition-app

# Copy files from original app (excluding node_modules, .git)
rsync -av --exclude='node_modules' \
         --exclude='.git' \
         --exclude='.expo' \
         --exclude='build' \
         --exclude='dist' \
         ../new_ai_food_app/ ./

# Initialize git
git add .
git commit -m "Initial commit: Fork from food tracking app"
git push origin main
```

#### ✅ Task 1.3: Update App Identity
- [ ] Open `app.config.js`
- [ ] Change app name:
```javascript
export default {
  name: "Forkcast",
  slug: "forkcast-nutrition",
  // Change bundle identifier
  ios: {
    bundleIdentifier: "com.yourname.forkcast",
  },
  android: {
    package: "com.yourname.forkcast",
  },
}
```
- [ ] Update `package.json`:
```json
{
  "name": "forkcast-nutrition-app",
  "version": "0.1.0",
  "description": "Gamified nutrition learning app"
}
```

#### ✅ Task 1.4: Create Windsurf Workspace
- [ ] Open Windsurf
- [ ] File → Open Folder → Select `forkcast-nutrition-app`
- [ ] Save workspace as "Forkcast Development"
- [ ] Close original app workspace to avoid confusion

### Afternoon (2-3 hours)

#### ✅ Task 1.5: Create New Supabase Project
- [ ] Go to [supabase.com/dashboard](https://supabase.com/dashboard)
- [ ] Click "New Project"
- [ ] Organization: Your existing org
- [ ] Name: `forkcast-nutrition`
- [ ] Database Password: Generate strong password (save in password manager!)
- [ ] Region: Choose closest to your users
- [ ] Pricing Plan: Free (for now)
- [ ] Click "Create new project"
- [ ] Wait 2-3 minutes for provisioning

#### ✅ Task 1.6: Copy Database Schema
```bash
# In your original app folder
cd ~/CascadeProjects/new_ai_food_app

# Export current schema
supabase db dump --schema public > schema_export.sql

# Copy to new project
cp schema_export.sql ~/CascadeProjects/forkcast-nutrition-app/supabase/

# In new project folder
cd ~/CascadeProjects/forkcast-nutrition-app

# Review and edit schema_export.sql if needed
# Then apply to new Supabase project (we'll do this tomorrow)
```

#### ✅ Task 1.7: Update Environment Variables
- [ ] Create `.env` file in new project:
```bash
# Supabase (NEW PROJECT)
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_NEW_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_new_anon_key

# OpenAI (can reuse same key)
OPENAI_API_KEY=your_openai_key

# App Environment
EXPO_PUBLIC_ENV=development
```
- [ ] Get new Supabase URL and keys from project settings
- [ ] Add `.env` to `.gitignore` (should already be there)

### Evening (1 hour)

#### ✅ Task 1.8: Test Basic Setup
```bash
# Install dependencies
npm install

# Start development server
npx expo start

# Test on iOS simulator or device
# Verify app opens (will have errors - that's OK for now)
```

#### ✅ Task 1.9: Commit Changes
```bash
git add .
git commit -m "Setup: Update app identity and Supabase config"
git push origin main
```

---

## 🗓️ DAY 2: Database & Backend Setup

### Morning (2-3 hours)

#### ✅ Task 2.1: Initialize Supabase CLI for New Project
```bash
cd ~/CascadeProjects/forkcast-nutrition-app

# Login to Supabase (if not already)
supabase login

# Link to your new project
supabase link --project-ref YOUR_NEW_PROJECT_REF

# Get project ref from: https://supabase.com/dashboard/project/YOUR_PROJECT/settings/general
```

#### ✅ Task 2.2: Apply Database Schema
```bash
# Push schema to new Supabase project
supabase db push

# Or manually run migrations
supabase migration new initial_schema
# Copy content from schema_export.sql to the new migration file
supabase db push
```

#### ✅ Task 2.3: Setup Row Level Security (RLS)
- [ ] Go to Supabase Dashboard → Authentication → Policies
- [ ] For each table, create policies:

```sql
-- food_logs table
CREATE POLICY "Users can view own logs"
ON food_logs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own logs"
ON food_logs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own logs"
ON food_logs FOR UPDATE
USING (auth.uid() = user_id);

-- Repeat for other tables
```

#### ✅ Task 2.4: Create New Tables for Gamification
```sql
-- Create migration file
-- supabase migration new gamification_tables

-- lessons table
CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module_id INTEGER NOT NULL,
  lesson_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  questions JSONB NOT NULL,
  xp_reward INTEGER DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- user_progress table
CREATE TABLE user_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES lessons(id),
  completed BOOLEAN DEFAULT FALSE,
  score INTEGER,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, lesson_id)
);

-- streaks table
CREATE TABLE streaks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_activity_date DATE,
  freeze_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- achievements table
CREATE TABLE achievements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_type TEXT NOT NULL,
  earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, achievement_type)
);

-- user_stats table
CREATE TABLE user_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  total_xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  gems INTEGER DEFAULT 0,
  coins INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;

-- Create policies (users can only access their own data)
CREATE POLICY "Anyone can view lessons"
ON lessons FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Users can view own progress"
ON user_progress FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own progress"
ON user_progress FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Similar policies for other tables...
```

### Afternoon (2-3 hours)

#### ✅ Task 2.5: Deploy Edge Functions
```bash
# Deploy OpenAI function to new project
supabase functions deploy openai

# Test function
curl -i --location --request POST \
  'https://YOUR_NEW_PROJECT.supabase.co/functions/v1/openai' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"mode":"classify","image_base64":"..."}'
```

#### ✅ Task 2.6: Setup Storage Buckets
- [ ] Go to Supabase Dashboard → Storage
- [ ] Create bucket: `food-images`
- [ ] Set to Public or Private (recommend Private)
- [ ] Create bucket: `user-avatars` (for gamification)
- [ ] Setup storage policies:

```sql
-- food-images bucket
CREATE POLICY "Users can upload own images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'food-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view own images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'food-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

#### ✅ Task 2.7: Test Database Connection
- [ ] Update `src/lib/supabase.ts` with new credentials
- [ ] Test auth flow (sign up, sign in)
- [ ] Test data insertion
- [ ] Verify RLS policies work

### Evening (1 hour)

#### ✅ Task 2.8: Commit Backend Changes
```bash
git add .
git commit -m "Backend: Setup Supabase database and gamification tables"
git push origin main
```

---

## 🗓️ DAY 3: App Store Connect & TestFlight Setup

### Morning (2-3 hours)

#### ✅ Task 3.1: Create App Store Connect Listing
- [ ] Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
- [ ] Click "My Apps" → "+" → "New App"
- [ ] Platforms: iOS
- [ ] Name: "Forkcast - Nutrition Learning"
- [ ] Primary Language: English (or your preference)
- [ ] Bundle ID: Select `com.yourname.forkcast` (must match app.config.js)
- [ ] SKU: `forkcast-nutrition-001` (unique identifier)
- [ ] User Access: Full Access
- [ ] Click "Create"

#### ✅ Task 3.2: Fill Out App Information
**App Information Tab**:
- [ ] Name: Forkcast
- [ ] Subtitle: "Learn nutrition like Duolingo"
- [ ] Category: Primary - Health & Fitness, Secondary - Education
- [ ] Content Rights: Check if you own rights

**Pricing and Availability**:
- [ ] Price: Free
- [ ] Availability: All countries (or select specific)

#### ✅ Task 3.3: Prepare App Store Assets
Create these in Figma/Canva:
- [ ] App Icon (1024x1024px, no transparency)
- [ ] Screenshots (6.5" iPhone - 1284x2778px):
  - Screenshot 1: Lesson interface
  - Screenshot 2: Streak/progress screen
  - Screenshot 3: Food scan challenge
  - Screenshot 4: Leaderboard
  - Screenshot 5: Achievement unlocked
- [ ] App Preview Video (optional, 15-30 seconds)

**Save in**: `assets/app-store/`

### Afternoon (2-3 hours)

#### ✅ Task 3.4: Setup EAS (Expo Application Services)
```bash
# Install EAS CLI globally
npm install -g eas-cli

# Login to Expo account
eas login

# Initialize EAS in project
eas build:configure

# This creates eas.json
```

#### ✅ Task 3.5: Configure EAS Build
Edit `eas.json`:
```json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": false
      }
    },
    "production": {
      "ios": {
        "bundleIdentifier": "com.yourname.forkcast"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "your.email@example.com",
        "ascAppId": "YOUR_APP_STORE_CONNECT_ID",
        "appleTeamId": "YOUR_TEAM_ID"
      }
    }
  }
}
```

#### ✅ Task 3.6: Create iOS Build for TestFlight
```bash
# Build for iOS (TestFlight)
eas build --platform ios --profile production

# This will:
# 1. Ask for Apple ID credentials
# 2. Generate/update provisioning profiles
# 3. Build the app in the cloud
# 4. Take 15-20 minutes

# Monitor build progress at: https://expo.dev/accounts/YOUR_ACCOUNT/projects/forkcast-nutrition/builds
```

### Evening (1 hour)

#### ✅ Task 3.7: Upload to TestFlight
**Option A: Automatic (Recommended)**
```bash
# After build completes, submit to App Store
eas submit --platform ios --latest

# Follow prompts to upload to TestFlight
```

**Option B: Manual**
- [ ] Download .ipa from EAS build page
- [ ] Open Transporter app (Mac App Store)
- [ ] Drag .ipa file to Transporter
- [ ] Click "Deliver"

#### ✅ Task 3.8: Configure TestFlight
- [ ] Go to App Store Connect → TestFlight
- [ ] Wait for build to process (10-30 minutes)
- [ ] Add "What to Test" notes:
```
Version 0.1.0 - Initial Internal Beta

New Features:
- Gamified nutrition lessons (Module 1: Macronutrients)
- Daily streak system
- Food scan challenges
- XP and leveling

Known Issues:
- Limited content (only 5 lessons available)
- Some animations may be choppy

Please test:
- Complete a lesson
- Scan a meal
- Check streak counter
```

---

## 🗓️ DAY 4: Internal Testing Setup

### Morning (2-3 hours)

#### ✅ Task 4.1: Add Internal Testers
- [ ] App Store Connect → TestFlight → Internal Testing
- [ ] Click "+" to add testers
- [ ] Add yourself and co-founder
- [ ] Add up to 100 internal testers (team members, friends)
- [ ] They'll receive email invitation

#### ✅ Task 4.2: Install TestFlight on Devices
- [ ] Download TestFlight app from App Store
- [ ] Open invitation email
- [ ] Click "View in TestFlight"
- [ ] Install Forkcast
- [ ] Test thoroughly

#### ✅ Task 4.3: Create Testing Checklist
Create `TESTING_CHECKLIST.md`:
```markdown
# Forkcast Internal Testing Checklist

## Authentication
- [ ] Sign up with email
- [ ] Sign in
- [ ] Sign out
- [ ] Password reset

## Lessons
- [ ] Complete Lesson 1.1
- [ ] Answer questions correctly
- [ ] Answer questions incorrectly (see feedback)
- [ ] Earn XP

## Streaks
- [ ] Complete daily goal
- [ ] Check streak counter
- [ ] Miss a day (test streak break)

## Food Scanning
- [ ] Scan a meal
- [ ] Answer food challenge questions
- [ ] Earn bonus XP

## Profile
- [ ] View XP and level
- [ ] Check achievements
- [ ] Customize avatar

## Bugs to Report
- Crash logs
- UI glitches
- Incorrect data
- Performance issues
```

### Afternoon (2-3 hours)

#### ✅ Task 4.4: Setup Feedback Collection
**Option A: Google Forms**
- [ ] Create Google Form with questions:
  - What did you like most?
  - What was confusing?
  - Any bugs or crashes?
  - Feature requests?
  - Rate 1-10: Would you use this daily?
- [ ] Share link with testers

**Option B: In-App Feedback (Better)**
- [ ] Add feedback button in app
- [ ] Use Supabase to store feedback:
```sql
CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  feedback_text TEXT NOT NULL,
  rating INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### ✅ Task 4.5: Setup Analytics
```bash
# Install analytics package
npm install @react-native-firebase/analytics
# OR
npm install expo-analytics

# Track key events:
# - lesson_completed
# - streak_maintained
# - food_scanned
# - level_up
```

### Evening (1 hour)

#### ✅ Task 4.6: Document Known Issues
Create `KNOWN_ISSUES.md`:
```markdown
# Known Issues - v0.1.0

## High Priority
- [ ] Streak counter resets at wrong time zone
- [ ] XP not updating after lesson completion

## Medium Priority
- [ ] Avatar customization UI laggy
- [ ] Some images not loading

## Low Priority
- [ ] Minor text alignment issues
- [ ] Animation stuttering on older devices

## Won't Fix (v0.1.0)
- Limited lesson content (by design)
- No social features yet (coming in v0.2.0)
```

---

## 🗓️ DAY 5: External Testing Preparation

### Morning (2-3 hours)

#### ✅ Task 5.1: Prepare for External Testing
**Requirements for External Testing**:
- [ ] Privacy Policy URL (required!)
- [ ] App Store description
- [ ] Support URL
- [ ] Marketing URL (optional)

#### ✅ Task 5.2: Create Privacy Policy
**Quick Option**: Use a generator
- [ ] Go to [privacypolicygenerator.info](https://www.privacypolicygenerator.info/)
- [ ] Fill out form for your app
- [ ] Download HTML
- [ ] Host on GitHub Pages or your website

**Better Option**: Write custom policy
```markdown
# Privacy Policy for Forkcast

Last updated: [DATE]

## Data We Collect
- Email address (for authentication)
- Food photos (stored securely in Supabase)
- Learning progress (lessons completed, XP, streaks)
- Usage analytics (anonymized)

## How We Use Data
- Provide personalized learning experience
- Track your progress and streaks
- Improve app features
- Send important updates (opt-in)

## Data Sharing
- We do NOT sell your data
- OpenAI processes food images (not stored by them)
- Analytics providers (Firebase/Mixpanel) - anonymized

## Your Rights
- Request data deletion
- Export your data
- Opt out of analytics

Contact: privacy@forkcast.app
```

Host at: `https://yourwebsite.com/privacy` or GitHub Pages

#### ✅ Task 5.3: Create Support Page
```markdown
# Forkcast Support

## Frequently Asked Questions

**Q: How do streaks work?**
A: Complete 1 lesson + 1 food scan daily to maintain your streak.

**Q: How do I earn XP?**
A: Complete lessons (10 XP), scan meals (15 XP), maintain streaks (5 XP).

**Q: Can I reset my progress?**
A: Contact support@forkcast.app

## Contact Us
Email: support@forkcast.app
Response time: 24-48 hours
```

Host at: `https://yourwebsite.com/support`

### Afternoon (2-3 hours)

#### ✅ Task 5.4: Update App Store Connect with URLs
- [ ] Go to App Store Connect → App Information
- [ ] Privacy Policy URL: `https://yourwebsite.com/privacy`
- [ ] Support URL: `https://yourwebsite.com/support`
- [ ] Marketing URL: `https://yourwebsite.com` (optional)
- [ ] Save changes

#### ✅ Task 5.5: Write App Store Description
```
🎓 Learn Nutrition Like Duolingo!

Forkcast makes nutrition science fun and easy to learn through:

✨ DAILY BITE-SIZED LESSONS
• 5-minute lessons on macros, vitamins, and healthy eating
• Science-backed content reviewed by dietitians
• Progress at your own pace

🔥 STREAK SYSTEM
• Build daily learning habits
• Earn XP and level up
• Unlock achievements and badges

📸 REAL-WORLD CHALLENGES
• Scan your meals and apply what you learned
• Get instant AI-powered feedback
• Track your nutrition journey

🏆 GAMIFIED LEARNING
• Multiple question types (MC, fill-blank, image-based)
• Compete on leaderboards
• Challenge friends

Perfect for:
• High school & college students
• Anyone wanting to understand nutrition
• Fitness enthusiasts
• Health-conscious individuals

Start your nutrition learning journey today! 🚀

---

FEATURES:
• 15+ lessons across 3 modules
• AI-powered food analysis
• Streak tracking & rewards
• XP and leveling system
• Achievements & badges
• Progress analytics

FREE to start. Premium unlocks unlimited lessons.
```

#### ✅ Task 5.6: Setup External Testing Group
- [ ] App Store Connect → TestFlight → External Testing
- [ ] Click "+" to create new group
- [ ] Name: "Public Beta Testers"
- [ ] Add build (the one you uploaded)
- [ ] Submit for Beta App Review (Apple reviews before external testing)
- [ ] Wait 24-48 hours for approval

### Evening (1 hour)

#### ✅ Task 5.7: Create Public Beta Link
Once approved:
- [ ] Get public TestFlight link
- [ ] Share on social media, website, etc.
- [ ] Example: `https://testflight.apple.com/join/XXXXXXXX`

#### ✅ Task 5.8: Final Checklist Review
```markdown
# Pre-Launch Checklist

## Technical
- [x] New GitHub repo created
- [x] Supabase project setup
- [x] Database schema migrated
- [x] Edge Functions deployed
- [x] Environment variables configured
- [x] App builds successfully

## App Store
- [x] App Store Connect listing created
- [x] Bundle ID configured
- [x] TestFlight build uploaded
- [x] Privacy policy published
- [x] Support page published
- [x] App description written

## Testing
- [x] Internal testers added
- [x] Testing checklist created
- [x] Feedback mechanism setup
- [x] Analytics configured
- [x] Known issues documented

## External Beta (Pending)
- [ ] Beta App Review submitted
- [ ] Waiting for Apple approval
- [ ] Public TestFlight link ready
```

---

## 📱 BONUS: Android Setup (Optional)

### If you want Android TestFlight equivalent (Google Play Internal Testing):

#### Task A1: Create Google Play Console Listing
- [ ] Go to [play.google.com/console](https://play.google.com/console)
- [ ] Create new app
- [ ] Fill out app details

#### Task A2: Build Android APK/AAB
```bash
# Build for Android
eas build --platform android --profile production

# Submit to Google Play
eas submit --platform android --latest
```

#### Task A3: Setup Internal Testing
- [ ] Google Play Console → Testing → Internal testing
- [ ] Upload AAB file
- [ ] Add testers via email
- [ ] Share opt-in link

---

## 🔧 Ongoing Maintenance Tasks

### Weekly
- [ ] Review TestFlight feedback
- [ ] Fix critical bugs
- [ ] Push new builds if needed
- [ ] Monitor analytics

### Bi-weekly
- [ ] Add new lesson content
- [ ] Improve based on user feedback
- [ ] Update known issues list

### Monthly
- [ ] Review app performance
- [ ] Plan new features
- [ ] Prepare for public launch

---

## 🚀 When Ready for Public Launch

### Pre-Launch Checklist
- [ ] 30+ lessons across 5 modules
- [ ] All critical bugs fixed
- [ ] 100+ beta testers with positive feedback
- [ ] App Store screenshots finalized
- [ ] Marketing materials ready
- [ ] Support infrastructure in place

### Launch Day
- [ ] Submit for App Store Review
- [ ] Wait 24-48 hours for approval
- [ ] Announce on social media
- [ ] Press release (optional)
- [ ] Monitor closely for issues

---

## 📞 Helpful Resources

**Expo Documentation**
- [EAS Build](https://docs.expo.dev/build/introduction/)
- [EAS Submit](https://docs.expo.dev/submit/introduction/)

**Apple Resources**
- [App Store Connect Help](https://developer.apple.com/help/app-store-connect/)
- [TestFlight Guide](https://developer.apple.com/testflight/)

**Supabase**
- [Database Migrations](https://supabase.com/docs/guides/cli/local-development)
- [Edge Functions](https://supabase.com/docs/guides/functions)

---

## ✅ Quick Reference Checklist

```
DAY 1: Repository & Project Setup
□ Create GitHub repo
□ Clone and copy files
□ Update app identity
□ Create Windsurf workspace
□ Create Supabase project
□ Update environment variables
□ Test basic setup

DAY 2: Database & Backend
□ Link Supabase CLI
□ Apply database schema
□ Setup RLS policies
□ Create gamification tables
□ Deploy Edge Functions
□ Setup storage buckets
□ Test database connection

DAY 3: App Store & TestFlight
□ Create App Store Connect listing
□ Prepare app assets
□ Setup EAS
□ Create iOS build
□ Upload to TestFlight
□ Configure TestFlight

DAY 4: Internal Testing
□ Add internal testers
□ Install and test app
□ Create testing checklist
□ Setup feedback collection
□ Setup analytics
□ Document known issues

DAY 5: External Testing Prep
□ Create privacy policy
□ Create support page
□ Update App Store Connect URLs
□ Write app description
□ Submit for Beta App Review
□ Create public beta link
```

---

**Good luck with your Forkcast launch! 🚀**

Let me know if you need help with any specific step!
