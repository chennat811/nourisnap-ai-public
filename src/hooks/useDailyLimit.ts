import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';

const DAILY_SCAN_LIMIT = parseInt(
  (Constants.expoConfig?.extra as any)?.dailyScanLimit
    ?? (process as any)?.env?.EXPO_PUBLIC_DAILY_SCAN_LIMIT
    ?? "5",
  10,
);
const ADMIN_BYPASS_KEY = '@admin_bypass_scan_limit';


function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export interface DailyLimitResult {
  scansToday: number;
  scansRemaining: number;
  canScan: boolean;
  loading: boolean;
  isAdminBypass: boolean;
  /** Call this immediately before navigating to a scan. Returns false if limit already reached. */
  consumeScan: () => Promise<boolean>;
  /** Re-read the stored counter (call on screen focus if needed). */
  refresh: () => Promise<void>;
  /** Toggle admin bypass mode */
  toggleAdminBypass: () => Promise<void>;
}

export function useDailyLimit(): DailyLimitResult {
  const [scansToday, setScansToday] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isAdminBypass, setIsAdminBypass] = useState(false);

  // Check if admin bypass is enabled
  const checkAdminBypass = useCallback(async (): Promise<boolean> => {
    try {
      const bypass = await AsyncStorage.getItem(ADMIN_BYPASS_KEY);
      return bypass === 'true';
    } catch {
      return false;
    }
  }, []);

  // Fetch actual server-side scan count from daily_scan_usage table
  const fetchServerScanCount = useCallback(async (): Promise<number> => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) return 0;

      const today = todayISO();
      const { data, error } = await supabase
        .from('daily_scan_usage')
        .select('scan_count')
        .eq('user_id', userId)
        .eq('scan_date', today)
        .maybeSingle();

      if (error) {
        if (__DEV__) console.error('[useDailyLimit] Error fetching scan count:', error);
        return 0;
      }

      return data?.scan_count ?? 0;
    } catch (e) {
      if (__DEV__) console.error('[useDailyLimit] Exception fetching scan count:', e);
      return 0;
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [serverCount, bypass] = await Promise.all([
      fetchServerScanCount(),
      checkAdminBypass(),
    ]);
    setScansToday(serverCount);
    setIsAdminBypass(bypass);
    setLoading(false);
  }, [fetchServerScanCount, checkAdminBypass]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const consumeScan = useCallback(async (): Promise<boolean> => {
    // Admin bypass allows unlimited scans
    if (isAdminBypass) return true;

    const current = await fetchServerScanCount();
    if (current >= DAILY_SCAN_LIMIT) return false;

    // Server will enforce and increment the count in the edge function.
    // Don't update local state here; the next refresh will show the true value.
    return true;
  }, [fetchServerScanCount, isAdminBypass]);

  const toggleAdminBypass = useCallback(async () => {
    const current = await checkAdminBypass();
    const next = !current;
    try {
      await AsyncStorage.setItem(ADMIN_BYPASS_KEY, next ? 'true' : 'false');
      setIsAdminBypass(next);
    } catch (e) {
      if (__DEV__) console.error('[useDailyLimit] Error toggling bypass:', e);
    }
  }, [checkAdminBypass]);

  const scansRemaining = Math.max(0, DAILY_SCAN_LIMIT - scansToday);
  const canScan = isAdminBypass || scansToday < DAILY_SCAN_LIMIT;

  return {
    scansToday,
    scansRemaining,
    canScan,
    loading,
    isAdminBypass,
    consumeScan,
    refresh,
    toggleAdminBypass,
  };
}

export { DAILY_SCAN_LIMIT };
