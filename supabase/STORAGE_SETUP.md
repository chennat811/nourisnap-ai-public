# Supabase Storage Setup for Fine-Tuning Dataset

This guide explains how to set up image storage for collecting a fine-tuning dataset.

## Overview

When `STORE_IMAGES=true` is enabled, the OpenAI edge function will:
- **Resize images to max 1024x1024** (maintains aspect ratio) for optimal API performance
- Upload resized images to Supabase Storage (`food-images` bucket)
- Organize by date: `YYYY/MM/DD/{correlation_id}.jpg`
- Log metadata in `openai_call_logs` table (`image_url`, `image_size_bytes`)
- Use JPEG quality 85% for good balance of quality vs size

**Benefits of 1024x1024:**
- ✅ Faster OpenAI API calls (fewer image tokens)
- ✅ Lower API costs (reduced token usage)
- ✅ 75% smaller storage size (~500KB vs 2MB)
- ✅ Perfect resolution for fine-tuning (OpenAI's recommended size)
- ✅ Sufficient detail for food recognition

## Setup Steps

### 1. Create Storage Bucket

In Supabase Dashboard → Storage:

1. Click "New bucket"
2. Name: `food-images`
3. Public bucket: **No** (keep private)
4. Click "Create bucket"

### 2. Set Up RLS Policies

Go to Storage → `food-images` → Policies:

**Policy 1: Service role can upload**
```sql
CREATE POLICY "Service role can upload images"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'food-images');
```

**Policy 2: Service role can read**
```sql
CREATE POLICY "Service role can read images"
ON storage.objects FOR SELECT
TO service_role
USING (bucket_id = 'food-images');
```

**Policy 3: Authenticated users can read their own images (optional)**
```sql
CREATE POLICY "Users can view their own images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'food-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

### 3. Update Database Schema

Add columns to `openai_call_logs` table:

```sql
ALTER TABLE openai_call_logs
ADD COLUMN image_url TEXT,
ADD COLUMN image_size_bytes INTEGER;

-- Add index for dataset export queries
CREATE INDEX idx_openai_call_logs_image_url 
ON openai_call_logs(image_url) 
WHERE image_url IS NOT NULL;
```

### 4. Enable Image Storage

Set environment variable in Supabase Dashboard → Edge Functions → Environment Variables:

```
STORE_IMAGES=true
```

**Cost considerations:**
- Each image: ~200-500KB (1024x1024, JPEG 85%)
- 1000 images ≈ 300-500MB storage
- Supabase free tier: 1GB storage included (fits ~2000-3000 images)
- Paid: $0.021/GB/month (~$0.01/1000 images)

**Recommendation:** Enable `STORE_IMAGES=true` to build your fine-tuning dataset. The 1024x1024 size is optimal for both API performance and fine-tuning quality.

## Exporting Dataset

### Query images with their analysis results:

```sql
SELECT 
  l.correlation_id,
  l.image_url,
  l.image_size_bytes,
  l.prompt_input,
  l.response_json,
  l.created_at
FROM openai_call_logs l
WHERE l.image_url IS NOT NULL
  AND l.ok = true
  AND l.kind = 'analysis'
ORDER BY l.created_at DESC;
```

### Download images programmatically:

```typescript
const { data } = await supabase.storage
  .from('food-images')
  .download('2026/02/25/abc-123.jpg');
```

### Bulk export for fine-tuning:

```sql
-- Export as JSONL for OpenAI fine-tuning
SELECT jsonb_build_object(
  'messages', jsonb_build_array(
    jsonb_build_object('role', 'system', 'content', 'You are a food nutrition analyzer'),
    jsonb_build_object('role', 'user', 'content', prompt_input::text),
    jsonb_build_object('role', 'assistant', 'content', response_json->'choices'->0->'message'->>'content')
  ),
  'image_url', image_url
) as training_example
FROM openai_call_logs
WHERE image_url IS NOT NULL
  AND ok = true
  AND kind = 'analysis';
```

## Storage Management

### Check storage usage:

```sql
SELECT 
  COUNT(*) as total_images,
  SUM(image_size_bytes) / 1024 / 1024 as total_mb,
  AVG(image_size_bytes) / 1024 as avg_kb_per_image
FROM openai_call_logs
WHERE image_url IS NOT NULL;
```

### Clean up old images (optional):

```sql
-- Delete images older than 90 days
DELETE FROM storage.objects
WHERE bucket_id = 'food-images'
  AND created_at < NOW() - INTERVAL '90 days';
```

## Troubleshooting

**Images not uploading:**
- Check `STORE_IMAGES=true` is set
- Verify service role has upload permissions
- Check edge function logs for errors

**Storage quota exceeded:**
- Upgrade Supabase plan or
- Implement retention policy (delete old images) or
- Temporarily set `STORE_IMAGES=false`

**Can't access images:**
- Verify RLS policies are correct
- Use service role key for admin access
- Check bucket is created and named correctly
