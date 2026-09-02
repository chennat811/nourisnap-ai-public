CREATE OR REPLACE FUNCTION public.reserve_scan_quota(
  p_user_id uuid,
  p_scan_date date,
  p_limit integer
)
RETURNS TABLE(new_count integer, allowed boolean)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_limit < 1 THEN
    RAISE EXCEPTION 'p_limit must be positive';
  END IF;

  INSERT INTO public.daily_scan_usage (user_id, scan_date, scan_count)
  VALUES (p_user_id, p_scan_date, 1)
  ON CONFLICT (user_id, scan_date) DO UPDATE
    SET scan_count = public.daily_scan_usage.scan_count + 1,
        updated_at = now()
    WHERE public.daily_scan_usage.scan_count < p_limit
  RETURNING public.daily_scan_usage.scan_count INTO v_count;

  IF FOUND THEN
    RETURN QUERY SELECT v_count, true;
    RETURN;
  END IF;

  SELECT scan_count
  INTO v_count
  FROM public.daily_scan_usage
  WHERE user_id = p_user_id
    AND scan_date = p_scan_date;

  RETURN QUERY SELECT COALESCE(v_count, 0), false;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_scan_quota(
  p_user_id uuid,
  p_scan_date date
)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE public.daily_scan_usage
  SET scan_count = GREATEST(scan_count - 1, 0),
      updated_at = now()
  WHERE user_id = p_user_id
    AND scan_date = p_scan_date
    AND scan_count > 0;
$$;

REVOKE ALL ON FUNCTION public.reserve_scan_quota(uuid, date, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_scan_quota(uuid, date, integer) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_scan_quota(uuid, date, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_scan_quota(uuid, date, integer) TO service_role;

REVOKE ALL ON FUNCTION public.release_scan_quota(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_scan_quota(uuid, date) FROM anon;
REVOKE ALL ON FUNCTION public.release_scan_quota(uuid, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.release_scan_quota(uuid, date) TO service_role;
