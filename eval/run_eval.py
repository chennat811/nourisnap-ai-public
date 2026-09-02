import argparse
import base64
import json
import os
import re
import time
from dataclasses import dataclass, asdict, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
import requests
from dotenv import load_dotenv
from tqdm import tqdm


@dataclass
class CaseResult:
    id: str
    variant: str
    repeat_index: int
    base_id: str
    sugar_level: Optional[int]
    image: str
    # query actually sent to analysis (always "" for this eval pipeline)
    query: str
    # original user query from test case, used to drive overrides
    user_query: str
    expected: Dict[str, Tuple[Optional[float], Optional[float]]]

    # Raw responses
    breakdown_raw: Any
    analysis_raw: Any

    # Breakdown health
    breakdown_present: bool
    breakdown_schema_valid: bool
    analysis_used_breakdown: bool

    # Parsed analysis fields
    calories: Optional[float]
    carbs_g: Optional[float]
    protein_g: Optional[float]
    fat_g: Optional[float]
    fiber_g: Optional[float]

    # Metrics
    within_range: bool
    range_fail_fields: List[str]
    schema_valid: bool
    null_rate: float
    kcal_consistency_ok: bool
    kcal_consistency_applicable: bool
    kcal_error_pct: Optional[float]

    # Latency (ms)
    latency_breakdown_ms: Optional[float]
    latency_analysis_ms: Optional[float]

    error: Optional[str]

    # Metadata
    model_name: Optional[str] = None
    prompt_version: Optional[str] = None
    monotonic_group_ok: Optional[bool] = None
    monotonic_fail_reason: Optional[str] = None
    edge_function_url: Optional[str] = None

    # Eval labeling
    failure_labels: List[str] = field(default_factory=list)
    severity: str = "info"  # blocker | major | minor | info

    # Breakdown override debugging
    override_applied: bool = False
    original_breakdown: Optional[Dict[str, Any]] = None
    edited_breakdown: Optional[Dict[str, Any]] = None
    override_diff: Optional[str] = None
    edited_breakdown_equals_original: Optional[bool] = None


def load_image_base64(path: Path) -> str:
    with path.open("rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def call_edge_function(
    url: str,
    payload: Dict[str, Any],
    headers: Optional[Dict[str, str]] = None,
    timeout: int = 60,
    max_retries: int = 3,
) -> Tuple[float, Dict[str, Any]]:
    """Call edge function with retry logic for transient failures."""
    last_exception = None
    for attempt in range(max_retries):
        try:
            start = time.perf_counter()
            resp = requests.post(url, json=payload, headers=headers, timeout=timeout)
            latency_ms = (time.perf_counter() - start) * 1000
            resp.raise_for_status()
            return latency_ms, resp.json()
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            last_exception = e
            if attempt < max_retries - 1:
                wait_time = 2 ** attempt  # Exponential backoff: 1s, 2s, 4s
                time.sleep(wait_time)
            continue
        except requests.exceptions.HTTPError as e:
            # Don't retry on HTTP errors (4xx, 5xx from server)
            raise
    # If all retries failed, raise the last exception
    if last_exception:
        raise last_exception
    raise RuntimeError("Unexpected error in call_edge_function")


def _guess_mimetype(path: Path) -> str:
    """Best-effort mimetype detection from file extension.

    Keeps behavior deterministic; we only care about the common image types
    used in eval fixtures.
    """
    ext = path.suffix.lower()
    if ext in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if ext == ".png":
        return "image/png"
    if ext == ".webp":
        return "image/webp"
    return "image/jpeg"


def _normalize_query(q: str) -> str:
    """Normalize user query for rule matching.

    - strip whitespace
    - lower case
    - convert common full-width digits to ASCII
    """
    if not q:
        return ""
    s = q.strip().lower()
    # full-width digits ０-９ to 0-9
    trans = {ord(fw): ord("0") + (i) for i, fw in enumerate("０１２３４５６７８９")}
    s = s.translate(trans)
    return s


def evaluate_case(
    case: Dict[str, Any],
    function_url: str,
    base_dir: Path,
    headers: Optional[Dict[str, str]],
    variant: str,
    expected: Dict[str, Tuple[Optional[float], Optional[float]]],
    repeat_index: int,
    model_name: Optional[str],
    prompt_version: Optional[str],
    precomputed_breakdown_raw: Optional[Dict[str, Any]] = None,
) -> CaseResult:
    cid = case["id"]
    base_id = case.get("base_id") or cid
    sugar_level_val = case.get("sugar_level")
    sugar_level: Optional[int]
    try:
        sugar_level = int(sugar_level_val) if sugar_level_val is not None else None
    except (TypeError, ValueError):  # noqa: BLE001
        sugar_level = None
    image_rel = case["image"]
    query_from_case = case.get("query", "")

    image_path = base_dir / image_rel
    breakdown_raw: Any = None
    analysis_raw: Any = None
    calories = carbs_g = protein_g = fat_g = fiber_g = None
    latency_breakdown_ms = latency_analysis_ms = None
    error: Optional[str] = None

    breakdown_present = False
    breakdown_schema_valid = False
    analysis_used_breakdown = False

    # Query sent to analysis; for eval we normally keep this empty, but the
    # breakdown_user_override variant integrates the original user_query.
    query_for_analysis: str = ""

    # Track edited breakdown for override flow
    edited_breakdown: Optional[Dict[str, Any]] = None
    override_applied: bool = False
    override_diff: Optional[str] = None

    # Local holder for parsed breakdown dict so we can safely reference it
    provided_breakdown: Optional[Dict[str, Any]] = None

    try:
        if not image_path.exists():
            # Reclassify as infra error so it is excluded from model metrics
            raise FileNotFoundError(f"INFRA_MISSING_IMAGE: {image_path}")

        image_b64 = load_image_base64(image_path)

        # Guess mimetype from file extension
        mimetype = _guess_mimetype(image_path)

        # NEW: Single-pass variant (Gemini 2.0 Flash does everything in one call)
        if variant == "single_pass":
            single_pass_payload: Dict[str, Any] = {
                "mode": "single_pass",
                "query": query_from_case or "",
                "image_base64": image_b64,
                "mimetype": mimetype,
            }
            if sugar_level is not None:
                single_pass_payload["sugar_level"] = sugar_level
            
            latency_analysis_ms, analysis_raw = call_edge_function(
                function_url, single_pass_payload, headers=headers
            )
            # No separate breakdown step for single_pass
            breakdown_raw = None
            latency_breakdown_ms = None
            breakdown_present = False
            breakdown_schema_valid = False
            analysis_used_breakdown = False
            query_for_analysis = query_from_case or ""
        else:
            # OLD: Two-step breakdown → analysis flow
            # 1) Breakdown call (unless a precomputed raw response was provided)
            if precomputed_breakdown_raw is not None:
                breakdown_raw = precomputed_breakdown_raw
                latency_breakdown_ms = None
            else:
                breakdown_payload: Dict[str, Any] = {
                    "mode": "breakdown",
                    # Eval: breakdown is always image-only (no user query).
                    "query": "",
                    "image_base64": image_b64,
                    "mimetype": mimetype,
                }
                latency_breakdown_ms, breakdown_raw = call_edge_function(
                    function_url, breakdown_payload, headers=headers
                )

        # For non-single_pass variants, run breakdown validation + analysis call
        if variant != "single_pass":
            provided_breakdown = (
                breakdown_raw.get("breakdown") if isinstance(breakdown_raw, dict) else None
            )
            breakdown_present = isinstance(provided_breakdown, dict)

            # --- A. Enforce structured breakdown schema
            # For eval, require:
            # - items_detailed present with name + grams_g per item
            # - portion_confidence (high|medium|low)
            # - portion_assumption (string)
            if isinstance(provided_breakdown, dict):
                bd = provided_breakdown
                items = bd.get("items_detailed")
                if isinstance(items, list) and len(items) > 0:
                    valid_items = True
                    for it in items:
                        if not isinstance(it, dict):
                            valid_items = False
                            break
                        if "name" not in it or "grams_g" not in it:
                            valid_items = False
                            break
                    breakdown_schema_valid = valid_items
                else:
                    breakdown_schema_valid = False

                if breakdown_schema_valid:
                    portion_conf = bd.get("portion_confidence")
                    portion_assump = bd.get("portion_assumption")
                    if portion_conf not in {"high", "medium", "low"} or not isinstance(
                        portion_assump, str
                    ):
                        breakdown_schema_valid = False
            else:
                breakdown_schema_valid = False

            # If schema-valid, analysis must use structured breakdown; otherwise, we omit it.
            analysis_used_breakdown = breakdown_schema_valid

            # --- B. Prepare edited breakdown for user-override flow
            if breakdown_schema_valid and variant == "breakdown_user_override":
                edited_breakdown, override_applied, override_diff = (
                    apply_user_override_to_breakdown(provided_breakdown, query_from_case)
                )
                # Hygiene: do NOT allow new items or renamed items. Restore if polluted.
                try:
                    orig_items = (
                        provided_breakdown.get("items_detailed")
                        if isinstance(provided_breakdown, dict)
                        else None
                    )
                    edit_items = (
                        edited_breakdown.get("items_detailed")
                        if isinstance(edited_breakdown, dict)
                        else None
                    )
                    if isinstance(orig_items, list) and isinstance(edit_items, list):
                        orig_names = [
                            it.get("name") for it in orig_items if isinstance(it, dict)
                        ]
                        edit_names = [
                            it.get("name") for it in edit_items if isinstance(it, dict)
                        ]
                        if len(orig_names) != len(edit_names) or orig_names != edit_names:
                            # Mark diff but revert to original structure
                            override_diff = (
                                (override_diff + ";") if override_diff else ""
                            ) + "schema_polluted"
                            override_applied = True
                            edited_breakdown["items_detailed"] = json.loads(
                                json.dumps(orig_items)
                            )
                            # Ensure items[] stays subset and language-consistent by preserving original
                            edited_breakdown["items"] = provided_breakdown.get("items")
                except Exception:
                    # Never fail eval due to hygiene enforcement
                    pass
            else:
                edited_breakdown = provided_breakdown if breakdown_schema_valid else None

            # Decide which query string to send to analysis.
            # - breakdown_unedited: analysis is image + breakdown only (no user query)
            # - breakdown_user_override: analysis also sees the original user_query
            if variant == "breakdown_user_override":
                query_for_analysis = query_from_case or ""
            else:
                query_for_analysis = ""

            analysis_payload: Dict[str, Any] = {
                "mode": "analysis",
                "query": query_for_analysis,
                "image_base64": image_b64,
                "mimetype": mimetype,
                # Always send the full structured breakdown dict if schema-valid,
                # otherwise omit so the Edge Function knows breakdown was unusable.
            }
            if breakdown_schema_valid:
                analysis_payload["food_breakdown"] = (
                    edited_breakdown
                    if variant == "breakdown_user_override"
                    else provided_breakdown
                )
            # If this test case has a sugar_level modifier, forward it so the
            # Edge Function can include it in the analysis prompt.
            if sugar_level is not None:
                analysis_payload["sugar_level"] = sugar_level
            latency_analysis_ms, analysis_raw = call_edge_function(
                function_url, analysis_payload, headers=headers
            )

        analysis = (
            analysis_raw.get("analysis") if isinstance(analysis_raw, dict) else None
        )
        if isinstance(analysis, dict):
            calories = _safe_float(analysis.get("calories"))
            carbs_g = _safe_float(analysis.get("carbs_g"))
            protein_g = _safe_float(analysis.get("protein_g"))
            fat_g = _safe_float(analysis.get("fat_g"))
            fiber_g = _safe_float(analysis.get("fiber_g"))
        else:
            error = "analysis field missing or not an object"

    except FileNotFoundError as e:
        error = str(e)
    except Exception as e:  # noqa: BLE001
        error = str(e)

    # Derived metrics
    schema_valid = _check_schema_valid(analysis_raw)
    null_rate = _compute_null_rate(calories, carbs_g, protein_g, fat_g)
    kcal_applicable, kcal_error_pct = _check_kcal_consistency(
        calories, carbs_g, protein_g, fat_g
    )
    kcal_consistency_ok = bool(
        kcal_applicable and (kcal_error_pct is not None) and (kcal_error_pct <= 0.25)
    )

    # Adjust expected ranges if user query indicates explicit quantity scaling
    expected_for_check = expected
    if variant == "breakdown_user_override":
        try:
            scale = _detect_quantity_scale(query_from_case)
        except Exception:
            scale = None
        if scale and scale > 0 and scale != 1.0:
            expected_for_check = {
                k: (
                    (lo * scale if lo is not None else None),
                    (hi * scale if hi is not None else None),
                )
                for k, (lo, hi) in expected.items()
            }

    within_range, range_fail_fields = _check_ranges(
        expected_for_check,
        {
            "calories": calories,
            "carbs_g": carbs_g,
            "protein_g": protein_g,
            "fat_g": fat_g,
        },
    )

    return CaseResult(
        id=cid,
        variant=variant,
        repeat_index=repeat_index,
        base_id=base_id,
        sugar_level=sugar_level,
        image=image_rel,
        # Store the query that was actually sent to analysis for this variant
        query=query_for_analysis,
        user_query=query_from_case,
        expected=expected,
        breakdown_raw=breakdown_raw,
        analysis_raw=analysis_raw,
        breakdown_present=breakdown_present,
        breakdown_schema_valid=breakdown_schema_valid,
        analysis_used_breakdown=analysis_used_breakdown,
        calories=calories,
        carbs_g=carbs_g,
        protein_g=protein_g,
        fat_g=fat_g,
        fiber_g=fiber_g,
        within_range=within_range,
        range_fail_fields=range_fail_fields,
        schema_valid=schema_valid,
        null_rate=null_rate,
        kcal_consistency_ok=kcal_consistency_ok,
        kcal_consistency_applicable=bool(kcal_applicable),
        kcal_error_pct=kcal_error_pct,
        latency_breakdown_ms=latency_breakdown_ms,
        latency_analysis_ms=latency_analysis_ms,
        error=error,
        model_name=model_name,
        prompt_version=prompt_version,
        edge_function_url=function_url,
        override_applied=override_applied,
        original_breakdown=(
            provided_breakdown if isinstance(provided_breakdown, dict) else None
        ),
        edited_breakdown=(
            edited_breakdown if isinstance(edited_breakdown, dict) else None
        ),
        override_diff=override_diff,
        edited_breakdown_equals_original=(
            json.dumps(provided_breakdown, sort_keys=True, ensure_ascii=False)
            == json.dumps(edited_breakdown, sort_keys=True, ensure_ascii=False)
            if isinstance(provided_breakdown, dict)
            and isinstance(edited_breakdown, dict)
            else None
        ),
    )


def _safe_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _check_schema_valid(analysis_raw: Any) -> bool:
    if not isinstance(analysis_raw, dict):
        return False
    analysis = (
        analysis_raw.get("analysis") if "analysis" in analysis_raw else analysis_raw
    )
    if not isinstance(analysis, dict):
        return False
    required_keys = [
        "title",
        "calories",
        "carbs_g",
        "protein_g",
        "fat_g",
        "food_breakdown",
        "tip_or_fact",
        "suggestion",
    ]
    for k in required_keys:
        if k not in analysis:
            return False
    return True


def _detect_quantity_scale(q: str) -> Optional[float]:
    """Return a simple multiplicative scale if clearly expressed.

    Examples:
    - 2x, double, 兩倍 => 2.0
    - 3x, triple, 三倍 => 3.0
    - half, 1/2, 半份, 半碗, 半杯 => 0.5
    If only an absolute weight (e.g., 500g) is provided without a baseline,
    return None so caller can choose to relax range checks instead of scaling.
    """
    qn = _normalize_query(q)
    if not qn:
        return None
    if re.search(r"\b(3x|triple)\b", qn) or ("三倍" in q):
        return 3.0
    if re.search(r"\b(2x|double)\b", qn) or ("兩倍" in q) or ("雙倍" in q):
        return 2.0
    if re.search(r"\b(half|1/2|1\/2)\b", qn) or any(
        tok in q for tok in ["半份", "半碗", "半杯"]
    ):
        return 0.5
    # Absolute grams without baseline
    if re.search(r"\b\d+(?:\.\d+)?\s*(g|kg|mg|oz|lb|公克|克|公斤|盎司|磅)\b", qn):
        return None
    # Size adjectives do not map cleanly to a scalar; ignore
    return None


def _compute_null_rate(
    calories: Optional[float],
    carbs_g: Optional[float],
    protein_g: Optional[float],
    fat_g: Optional[float],
) -> float:
    vals = [calories, carbs_g, protein_g, fat_g]
    nulls = sum(1 for v in vals if v is None)
    return nulls / len(vals)


def _check_kcal_consistency(
    calories: Optional[float],
    carbs_g: Optional[float],
    protein_g: Optional[float],
    fat_g: Optional[float],
    tolerance: float = 0.25,
) -> Tuple[bool, Optional[float]]:
    if calories is None or carbs_g is None or protein_g is None or fat_g is None:
        # Not enough information to assess; mark as not applicable
        return False, None
    macro_kcal = 4 * carbs_g + 4 * protein_g + 9 * fat_g
    if macro_kcal <= 0:
        return False, None
    err_pct = abs(macro_kcal - calories) / macro_kcal
    return True, err_pct


def _check_ranges(
    expected: Dict[str, Tuple[Optional[float], Optional[float]]],
    actual: Dict[str, Optional[float]],
) -> Tuple[bool, List[str]]:
    fail_fields: List[str] = []
    for k, (lo, hi) in expected.items():
        v = actual.get(k)
        if v is None or lo is None or hi is None:
            fail_fields.append(k)
            continue
        if not (lo <= v <= hi):
            fail_fields.append(k)
    return len(fail_fields) == 0, fail_fields


def _check_monotonicity(group_rows: List[CaseResult]) -> Tuple[bool, Optional[str]]:
    """Check if calories and carbs are monotonically increasing with sugar level.
    
    Returns:
        Tuple of (is_monotonic, failure_reason)
    """
    if len(group_rows) < 2:
        return True, None
    
    sorted_rows = sorted(group_rows, key=lambda r: r.sugar_level or 0)
    prev_cal = None
    prev_carbs = None
    
    for r in sorted_rows:
        if r.calories is not None:
            if prev_cal is not None and r.calories < prev_cal:
                return False, "calories not monotonic"
            prev_cal = r.calories
        if r.carbs_g is not None:
            if prev_carbs is not None and r.carbs_g < prev_carbs:
                return False, "carbs_g not monotonic"
            prev_carbs = r.carbs_g
    
    return True, None


def _normalize_expected(
    raw_expected: Dict[str, List[float]],
) -> Dict[str, Tuple[Optional[float], Optional[float]]]:
    """Normalize expected ranges.

    Note: We intentionally ignore fiber_g in range checks for now, since
    fiber is not yet reliably modeled in prompts.
    """
    expected: Dict[str, Tuple[Optional[float], Optional[float]]] = {}
    for k, v in raw_expected.items():
        if k == "fiber_g":
            continue
        if isinstance(v, list) and len(v) == 2:
            expected[k] = (float(v[0]), float(v[1]))
        else:
            expected[k] = (None, None)
    return expected


def _has_quantity_override(q: str) -> bool:
    """Detect if the user query implies a quantity/portion override.

    Matches explicit weights (e.g., 500g), multipliers (2x, double, half), and common zh terms.
    """
    qn = _normalize_query(q)
    if not qn:
        return False
    # explicit weights
    if re.search(r"\b\d+(?:\.\d+)?\s*(g|kg|mg|oz|lb|公克|克|公斤|盎司|磅)\b", qn):
        return True
    # multipliers
    if re.search(r"\b(2x|3x|double|triple|half|1/2|1\/2)\b", qn):
        return True
    # common zh modifiers
    if any(
        tok in q
        for tok in [
            "大份",
            "特大",
            "加大",
            "小份",
            "半份",
            "雙倍",
            "兩倍",
            "三倍",
            "半碗",
            "半杯",
        ]
    ):
        return True
    return False


def apply_user_override_to_breakdown(
    provided_breakdown: Dict[str, Any],
    user_query: str,
) -> Tuple[Dict[str, Any], bool, str]:
    """Placeholder for user override logic.
    
    Currently returns the breakdown unchanged. In the future, this could
    implement deterministic edits based on user_query patterns.
    
    Returns:
        Tuple of (edited_breakdown, override_applied, diff_description)
    """
    # Return unchanged breakdown - no override logic implemented yet
    return provided_breakdown, False, "no_override"


def run_eval(
    cases_path: Path,
    function_url: str,
    output_dir: Path,
    headers: Optional[Dict[str, str]] = None,
    repeats: int = 1,
    model_name: Optional[str] = None,
    prompt_version: Optional[str] = None,
) -> None:
    with cases_path.open("r", encoding="utf-8") as f:
        cases: List[Dict[str, Any]] = json.load(f)

    base_dir = cases_path.parent
    output_dir.mkdir(parents=True, exist_ok=True)

    results: List[CaseResult] = []
    total_iterations = len(cases) * repeats * 3  # 3 variants per case
    
    with tqdm(total=total_iterations, desc="Evaluating cases", unit="call") as pbar:
        for case in cases:
            base_expected = _normalize_expected(case.get("expected", {}))

            # 每個 case：
            # 1) breakdown_unedited  流程：使用圖片做 breakdown，analysis 直接吃原始 items_detailed。
            # 2) breakdown_user_override 流程：同一張圖片先做 breakdown，再套用 user_query 模擬使用者
            #    對 items_detailed 的 deterministic 編輯，再送去 analysis。
            # 3) single_pass 流程：Gemini 2.0 Flash 一次完成所有步驟（新架構）

            for repeat_index in range(repeats):
                # Flow A: breakdown_unedited
                pbar.set_description(f"Eval: {case.get('id')} (unedited {repeat_index + 1}/{repeats})")
                res_unedited = evaluate_case(
                    case,
                    function_url=function_url,
                    base_dir=base_dir,
                    headers=headers,
                    variant="breakdown_unedited",
                    expected=base_expected,
                    repeat_index=repeat_index,
                    model_name=model_name,
                    prompt_version=prompt_version,
                )
                results.append(res_unedited)
                pbar.update(1)

                # Flow B: breakdown_user_override (reuse the exact same breakdown_raw)
                pbar.set_description(f"Eval: {case.get('id')} (override {repeat_index + 1}/{repeats})")
                res_override = evaluate_case(
                    case,
                    function_url=function_url,
                    base_dir=base_dir,
                    headers=headers,
                    variant="breakdown_user_override",
                    expected=base_expected,
                    repeat_index=repeat_index,
                    model_name=model_name,
                    prompt_version=prompt_version,
                    precomputed_breakdown_raw=(
                        res_unedited.breakdown_raw
                        if isinstance(res_unedited.breakdown_raw, dict)
                        else None
                    ),
                )
                results.append(res_override)
                pbar.update(1)

                # Flow C: single_pass (NEW: Gemini 2.0 Flash one-shot)
                pbar.set_description(f"Eval: {case.get('id')} (single_pass {repeat_index + 1}/{repeats})")
                res_single_pass = evaluate_case(
                    case,
                    function_url=function_url,
                    base_dir=base_dir,
                    headers=headers,
                    variant="single_pass",
                    expected=base_expected,
                    repeat_index=repeat_index,
                    model_name=None,  # Let edge function report actual model used
                    prompt_version=prompt_version,
                )
                results.append(res_single_pass)
                pbar.update(1)

    # --- Monotonicity check for sugar-level cases (only breakdown_user_override variant)
    # Group by (base_id, image, variant)
    from collections import defaultdict

    groups: Dict[Tuple[str, str, str], List[CaseResult]] = defaultdict(list)
    for r in results:
        if (
            r.variant == "breakdown_user_override"
            and r.sugar_level is not None
            and not r.error
        ):
            key = (r.base_id, r.image, r.variant)
            groups[key].append(r)

    for key, group_rows in groups.items():
        monotonic_ok, fail_reason = _check_monotonicity(group_rows)
        for r in group_rows:
            r.monotonic_group_ok = monotonic_ok
            r.monotonic_fail_reason = fail_reason

    # --- Assign failure labels & severities based on metrics and group info
    _assign_failure_labels(results)

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    json_path = output_dir / f"results_{timestamp}.json"
    csv_path = output_dir / f"results_{timestamp}.csv"
    summary_path = output_dir / f"summary_{timestamp}.txt"

    # Save JSON
    with json_path.open("w", encoding="utf-8") as f:
        json.dump([asdict(r) for r in results], f, ensure_ascii=False, indent=2)

    # Save CSV (flatten nested fields where reasonable)
    df_rows = []
    for r in results:
        bd = r.original_breakdown or {}
        portion_conf = bd.get("portion_confidence") if isinstance(bd, dict) else None
        portion_assump = bd.get("portion_assumption") if isinstance(bd, dict) else None

        row = {
            "id": r.id,
            "variant": r.variant,
            "repeat_index": r.repeat_index,
            "base_id": r.base_id,
            "sugar_level": r.sugar_level,
            "image": r.image,
            "query": r.query,
            "user_query": r.user_query,
            "calories": r.calories,
            "carbs_g": r.carbs_g,
            "protein_g": r.protein_g,
            "fat_g": r.fat_g,
            "fiber_g": r.fiber_g,
            "within_range": r.within_range,
            "schema_valid": r.schema_valid,
            "null_rate": r.null_rate,
            "kcal_consistency_ok": r.kcal_consistency_ok,
            "kcal_consistency_applicable": r.kcal_consistency_applicable,
            "kcal_error_pct": r.kcal_error_pct,
            "latency_breakdown_ms": r.latency_breakdown_ms,
            "latency_analysis_ms": r.latency_analysis_ms,
            "error": r.error,
            "range_fail_fields": ",".join(r.range_fail_fields),
            "breakdown_present": r.breakdown_present,
            "breakdown_schema_valid": r.breakdown_schema_valid,
            "analysis_used_breakdown": r.analysis_used_breakdown,
            "model_name": r.model_name,
            "prompt_version": r.prompt_version,
            "monotonic_group_ok": r.monotonic_group_ok,
            "monotonic_fail_reason": r.monotonic_fail_reason,
            "edge_function_url": r.edge_function_url,
            "failure_labels": ",".join(r.failure_labels),
            "severity": r.severity,
            "override_applied": r.override_applied,
            "override_diff": r.override_diff or "",
            "edited_breakdown_equals_original": r.edited_breakdown_equals_original,
            "portion_confidence": portion_conf,
            "portion_assumption": portion_assump,
        }
        df_rows.append(row)
    pd.DataFrame(df_rows).to_csv(csv_path, index=False)

    # ... (rest of the code remains the same)
    # Summary report
    _write_summary(summary_path, results)

    print(f"\nSaved reports to:\n- {json_path}\n- {csv_path}\n- {summary_path}")


def _write_summary(path: Path, results: List[CaseResult]) -> None:
    total = len(results)
    passed = sum(1 for r in results if r.within_range and not r.error)
    failed = total - passed

    avg_null_rate = sum(r.null_rate for r in results) / total if total else 0.0
    kcal_checks = [r.kcal_error_pct for r in results if r.kcal_error_pct is not None]
    avg_kcal_error = sum(kcal_checks) / len(kcal_checks) if kcal_checks else None

    lat_b = [
        r.latency_breakdown_ms for r in results if r.latency_breakdown_ms is not None
    ]
    lat_a = [
        r.latency_analysis_ms for r in results if r.latency_analysis_ms is not None
    ]

    # Sugar-level / monotonicity summary (using breakdown_user_override variant only)
    sugar_results = [
        r
        for r in results
        if r.sugar_level is not None and r.variant == "breakdown_user_override"
    ]
    sugar_result_count = len(sugar_results)

    from collections import defaultdict

    group_keys: Dict[Tuple[str, str], List[CaseResult]] = defaultdict(list)
    for r in sugar_results:
        if not r.error and r.sugar_level is not None:
            key = (r.base_id, r.image)
            group_keys[key].append(r)

    monotonic_groups_evaluated = 0
    monotonic_groups_passed = 0
    failing_groups: List[Tuple[str, str, str]] = []  # (base_id, image, reason)

    for (base_id, image), group_rows in group_keys.items():
        # Only consider groups with at least 2 valid points
        group_rows = [
            g for g in group_rows if g.sugar_level is not None and not g.error
        ]
        if len(group_rows) < 2:
            continue
        monotonic_groups_evaluated += 1

        # Use the per-row flags if set; otherwise recompute from kcal/carbs
        if all(g.monotonic_group_ok is not None for g in group_rows):
            group_ok = all(bool(g.monotonic_group_ok) for g in group_rows)
            reason = next(
                (
                    g.monotonic_fail_reason or "monotonicity failed"
                    for g in group_rows
                    if not g.monotonic_group_ok
                ),
                "",
            )
        else:
            # Fallback: recompute using helper function
            group_ok, reason = _check_monotonicity(group_rows)
            reason = reason or ""

        if group_ok:
            monotonic_groups_passed += 1
        else:
            if len(failing_groups) < 5:
                failing_groups.append((base_id, image, reason or "monotonicity failed"))

    worst_cases = sorted(
        results,
        key=lambda r: (
            (
                0 if (not r.within_range or r.error) else 1
            ),  # failures or errored cases first
            -(r.kcal_error_pct if r.kcal_error_pct is not None else -1),
        ),
    )[:10]

    with path.open("w", encoding="utf-8") as f:
        f.write(f"Total cases: {total}\n")
        f.write(f"Pass (within expected ranges, no error): {passed}\n")
        f.write(f"Fail: {failed}\n")
        f.write("\nSchema validity: ")
        f.write(f"{sum(1 for r in results if r.schema_valid)}/{total} valid\n")
        f.write(f"Average null-rate (macros): {avg_null_rate:.3f}\n")
        if avg_kcal_error is not None:
            f.write(f"Average kcal consistency error: {avg_kcal_error:.3f}\n")
        if lat_b:
            f.write(
                f"Latency breakdown (ms): avg={sum(lat_b)/len(lat_b):.1f}, min={min(lat_b):.1f}, max={max(lat_b):.1f}\n",
            )
        if lat_a:
            f.write(
                f"Latency analysis (ms): avg={sum(lat_a)/len(lat_a):.1f}, min={min(lat_a):.1f}, max={max(lat_a):.1f}\n",
            )

        # Sugar / monotonicity section
        f.write("\nSugar-level / monotonicity:\n")
        f.write(
            f"Sugar-level results (breakdown_user_override): {sugar_result_count}\n"
        )
        f.write(f"Monotonic groups evaluated: {monotonic_groups_evaluated}\n")
        f.write(f"Monotonic groups passed: {monotonic_groups_passed}\n")
        if failing_groups:
            f.write("Failing groups (up to 5):\n")
            for base_id, image, reason in failing_groups:
                f.write(f"- base_id={base_id}, image={image}, reason={reason}\n")

        f.write("\nWorst cases (up to 10):\n")
        for r in worst_cases:
            f.write(
                f"- id={r.id}, variant={r.variant}, repeat={r.repeat_index}, within_range={r.within_range}, error={r.error}, "
            )
            f.write(
                f"range_fail_fields={r.range_fail_fields}, kcal_error_pct={r.kcal_error_pct}, breakdown_present={r.breakdown_present}, breakdown_schema_valid={r.breakdown_schema_valid}\n"
            )


def _assign_failure_labels(results: List[CaseResult]) -> None:
    """Derive failure reason codes and severities for each result.

    This is purely post-processing on already-computed metrics.
    """

    # First pass: per-result labels from local metrics
    blocker_codes = {
        "ERR_HTTP",
        "ERR_SCHEMA_INVALID",
        "ERR_NULL_MACROS",
        "NUTR_KCAL_INCONSISTENT",
        "NUTR_NEGATIVE_OR_ZERO",
        "MOD_SUGAR_NOT_MONOTONIC",
    }
    major_codes = {
        "MOD_DIET_MODE_HALLUCINATION",
        "MOD_COMPONENT_DRIFT",
        "NUTR_OUT_OF_RANGE",
    }

    for r in results:
        labels: List[str] = []

        # --- A. Output quality & reliability
        if r.error:
            # Treat missing-image as infra; exclude from model error labeling
            if isinstance(r.error, str) and r.error.startswith("INFRA_MISSING_IMAGE:"):
                pass
            else:
                labels.append("ERR_HTTP")
        if not r.schema_valid:
            labels.append("ERR_SCHEMA_INVALID")
        if (
            r.null_rate >= 1.0
            and r.variant == "breakdown_user_override"
            and not r.error
        ):
            labels.append("ERR_NULL_MACROS")
        if (not r.breakdown_present) or (not r.breakdown_schema_valid):
            labels.append("ERR_BREAKDOWN_INVALID")
        elif not r.analysis_used_breakdown:
            labels.append("ERR_BREAKDOWN_UNUSED")

        # --- B. Nutrition plausibility
        if r.kcal_consistency_applicable and not r.kcal_consistency_ok:
            labels.append("NUTR_KCAL_INCONSISTENT")

        if (r.calories is not None and r.calories <= 0) or any(
            v is not None and v < 0 for v in [r.carbs_g, r.protein_g, r.fat_g]
        ):
            labels.append("NUTR_NEGATIVE_OR_ZERO")

        if not r.within_range:
            # Skip NUTR_OUT_OF_RANGE if quantity override present in override variant
            if not (
                r.variant == "breakdown_user_override"
                and _has_quantity_override(r.user_query)
            ):
                labels.append("NUTR_OUT_OF_RANGE")

        # --- C. Modifier handling (initially from monotonicity)
        if r.monotonic_group_ok is False:
            labels.append("MOD_SUGAR_NOT_MONOTONIC")

        r.failure_labels = labels

    # Second pass: sugar-group based labels (e.g., diet-mode hallucination, sugar ignored)
    from collections import defaultdict

    sugar_groups: Dict[Tuple[str, str], List[CaseResult]] = defaultdict(list)
    for r in results:
        if (
            r.sugar_level is not None
            and r.variant == "breakdown_user_override"
            and not r.error
        ):
            sugar_groups[(r.base_id, r.image)].append(r)

    for (base_id, image), group in sugar_groups.items():
        group = [g for g in group if g.sugar_level is not None]
        if len(group) < 2:
            continue
        group_sorted = sorted(group, key=lambda g: g.sugar_level or 0)

        # Baseline anchoring metric: fat & protein variance across sugar levels
        fats = [g.fat_g for g in group_sorted if g.fat_g is not None and g.fat_g > 0]
        prots = [
            g.protein_g
            for g in group_sorted
            if g.protein_g is not None and g.protein_g > 0
        ]

        def _ratio(vals: List[float]) -> float:
            return max(vals) / min(vals) if vals and min(vals) > 0 else 1.0

        fat_ratio = _ratio(fats)
        prot_ratio = _ratio(prots)

        if fat_ratio > 1.4 or prot_ratio > 1.4:
            # Diet-mode hallucination: fat/protein swing too much across sugar variants
            for g in group_sorted:
                if "MOD_DIET_MODE_HALLUCINATION" not in g.failure_labels:
                    g.failure_labels.append("MOD_DIET_MODE_HALLUCINATION")

        # Sugar ignored: calories/carbs almost identical across sugar levels
        cals = [g.calories for g in group_sorted if g.calories is not None]
        carbs = [g.carbs_g for g in group_sorted if g.carbs_g is not None]
        if cals and carbs:
            cal_span = max(cals) - min(cals)
            carb_span = max(carbs) - min(carbs)
            sugar_span = max(g.sugar_level or 0 for g in group_sorted) - min(
                g.sugar_level or 0 for g in group_sorted
            )
            if sugar_span > 0 and cal_span < 30 and carb_span < 5:
                for g in group_sorted:
                    if "MOD_SUGAR_IGNORED" not in g.failure_labels:
                        g.failure_labels.append("MOD_SUGAR_IGNORED")

    # Final pass: derive severity from labels
    for r in results:
        label_set = set(r.failure_labels)
        if label_set & blocker_codes:
            r.severity = "blocker"
        elif label_set & major_codes:
            r.severity = "major"
        elif label_set:
            r.severity = "minor"
        else:
            r.severity = "info"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Batch evaluation harness for Supabase OpenAI edge function."
    )
    parser.add_argument(
        "--cases",
        type=str,
        default="eval/test_cases_2.json",
        help="Path to test cases JSON file",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="eval/reports",
        help="Directory to write reports into",
    )
    parser.add_argument(
        "--function-url",
        type=str,
        default=None,
        help="Full URL for the Supabase edge function (e.g. https://<project>.functions.supabase.co/openai). If not set, uses SUPABASE_FUNCTION_URL env var.",
    )
    parser.add_argument(
        "--repeats",
        type=int,
        default=1,
        help="Number of times to repeat each variant per case (for variance analysis)",
    )

    args = parser.parse_args()

    load_dotenv()

    function_url = args.function_url or os.getenv("SUPABASE_FUNCTION_URL")
    if not function_url:
        raise SystemExit(
            "Missing function URL. Provide --function-url or set SUPABASE_FUNCTION_URL in your environment.",
        )

    # For eval, use service role key to bypass user authentication.
    # For production app calls, use user JWT tokens instead.
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not service_role_key:
        # Fallback to anon key for backward compatibility (though it won't work with auth guard)
        service_role_key = os.getenv("SUPABASE_ANON_KEY")
    
    headers: Optional[Dict[str, str]] = None
    if service_role_key:
        headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
        }

    project_root = Path(__file__).resolve().parents[1]
    cases_path = (project_root / args.cases).resolve()
    output_dir = (project_root / args.output_dir).resolve()

    model_name = os.getenv("EVAL_MODEL_NAME")
    prompt_version = os.getenv("EVAL_PROMPT_VERSION")

    run_eval(
        cases_path=cases_path,
        function_url=function_url,
        output_dir=output_dir,
        headers=headers,
        repeats=max(1, args.repeats),
        model_name=model_name,
        prompt_version=prompt_version,
    )


if __name__ == "__main__":
    main()
