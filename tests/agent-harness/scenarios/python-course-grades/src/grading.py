"""Core grade calculation logic for the course grading system.

Handles score aggregation, drop policies, and weighted averages
across multiple assignment categories.
"""

import math
from typing import Optional

from models import Assignment, CategoryConfig


def apply_drop_policy(scores: list[float], drop_count: int) -> list[float]:
    """Drop the N lowest scores from a list of scores.

    Args:
        scores: List of numeric scores.
        drop_count: Number of lowest scores to drop.

    Returns:
        A new list with the lowest scores removed.
    """
    if drop_count <= 0 or drop_count >= len(scores):
        return list(scores)
    # Sort scores for consistent ordering before dropping
    ordered = sorted(scores, reverse=True)
    return ordered[drop_count:]


def calculate_category_average(
    assignments: list[Assignment],
    category_config: CategoryConfig,
) -> float:
    """Calculate the average score for a single category.

    Applies the drop-lowest policy if configured, then computes
    the arithmetic mean of the remaining scores as percentages.

    Args:
        assignments: All assignments in this category.
        category_config: Config including drop policy.

    Returns:
        Average percentage score for the category.
    """
    if not assignments:
        return 0.0

    percentages = [a.percentage for a in assignments]

    if category_config.drop_lowest > 0:
        percentages = apply_drop_policy(percentages, category_config.drop_lowest)

    if not percentages:
        return 0.0

    return sum(percentages) / len(percentages)


def calculate_weighted_score(
    category_averages: dict[str, float],
    category_configs: list[CategoryConfig],
) -> float:
    """Compute the overall weighted score from category averages.

    Args:
        category_averages: Map of category name -> average score.
        category_configs: List of category configurations with weights.

    Returns:
        Weighted numeric score (0-100 scale).
    """
    total = 0.0
    for config in category_configs:
        avg = category_averages.get(config.name, 0.0)
        total += avg * config.weight
    return total


# ---------------------------------------------------------------------------
# Statistical helpers used for class-wide reporting
# ---------------------------------------------------------------------------


def compute_class_statistics(scores: list[float]) -> dict[str, float]:
    """Compute descriptive statistics for a set of scores.

    Returns a dict with mean, median, std_dev, min, max, and count.
    """
    if not scores:
        return {
            "mean": 0.0,
            "median": 0.0,
            "std_dev": 0.0,
            "min": 0.0,
            "max": 0.0,
            "count": 0,
        }

    n = len(scores)
    mean = sum(scores) / n

    sorted_scores = sorted(scores)
    if n % 2 == 1:
        median = sorted_scores[n // 2]
    else:
        median = (sorted_scores[n // 2 - 1] + sorted_scores[n // 2]) / 2.0

    variance = sum((s - mean) ** 2 for s in scores) / n
    std_dev = math.sqrt(variance)

    return {
        "mean": round(mean, 4),
        "median": round(median, 4),
        "std_dev": round(std_dev, 4),
        "min": min(scores),
        "max": max(scores),
        "count": n,
    }


def rank_students(
    student_scores: list[tuple[str, float]],
    descending: bool = True,
) -> list[tuple[str, float, int]]:
    """Rank students by their numeric scores.

    Args:
        student_scores: List of (student_name, score) tuples.
        descending: If True, highest score gets rank 1.

    Returns:
        List of (student_name, score, rank) tuples.
    """
    sorted_pairs = sorted(
        student_scores,
        key=lambda x: x[1],
        reverse=descending,
    )

    ranked: list[tuple[str, float, int]] = []
    current_rank = 1

    for i, (name, score) in enumerate(sorted_pairs):
        if i > 0 and score != sorted_pairs[i - 1][1]:
            current_rank = i + 1
        ranked.append((name, score, current_rank))

    return ranked


def normalize_score(
    raw_score: float,
    raw_max: float,
    target_max: float = 100.0,
) -> float:
    """Normalize a raw score to a target scale.

    Args:
        raw_score: The raw numeric score.
        raw_max: The maximum possible raw score.
        target_max: The target scale maximum (default 100).

    Returns:
        Normalized score on the target scale.
    """
    if raw_max <= 0:
        return 0.0
    return (raw_score / raw_max) * target_max
