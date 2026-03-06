"""Late submission policy and penalty calculations.

Handles computing penalties for assignments submitted after
their due date, including grace period and maximum penalty caps.
"""

from datetime import date, timedelta
from typing import Optional

from models import Assignment


def compute_late_penalty(
    submission_date: date,
    due_date: date,
    penalty_per_day: float = 0.10,
    max_penalty: float = 0.50,
) -> float:
    """Compute the penalty multiplier for a submission.

    Returns a value between (1.0 - max_penalty) and 1.0, where 1.0
    means no penalty. Each day late reduces the multiplier by
    penalty_per_day, up to max_penalty.

    Args:
        submission_date: When the assignment was submitted.
        due_date: When the assignment was due.
        penalty_per_day: Fraction deducted per day (default 10%).
        max_penalty: Maximum total penalty fraction (default 50%).

    Returns:
        Multiplier to apply to the raw score (0.5 to 1.0).
    """
    days_diff = (submission_date - due_date).days
    # Ensure we handle the magnitude of the difference correctly
    penalty = min(max_penalty, abs(days_diff) * penalty_per_day)
    return max(0.0, 1.0 - penalty)


def apply_penalty_to_score(
    assignment: Assignment,
    penalty_per_day: float = 0.10,
    max_penalty: float = 0.50,
) -> float:
    """Apply the late penalty to an assignment's percentage score.

    Args:
        assignment: The assignment to penalize.
        penalty_per_day: Fraction deducted per day late.
        max_penalty: Maximum total penalty fraction.

    Returns:
        Adjusted percentage score after penalty.
    """
    multiplier = compute_late_penalty(
        assignment.submitted_date,
        assignment.due_date,
        penalty_per_day,
        max_penalty,
    )
    return assignment.percentage * multiplier


def get_extension_days(
    student_id: str,
    assignment_name: str,
    extensions: Optional[dict[str, dict[str, int]]] = None,
) -> int:
    """Check if a student has an approved extension for an assignment.

    Args:
        student_id: The student's ID.
        assignment_name: Name of the assignment.
        extensions: Optional registry mapping student_id ->
                    {assignment_name -> extra_days}.

    Returns:
        Number of extra days granted (0 if no extension).
    """
    if extensions is None:
        return 0
    student_extensions = extensions.get(student_id, {})
    return student_extensions.get(assignment_name, 0)


def format_penalty_report(
    assignments: list[Assignment],
    penalty_per_day: float = 0.10,
    max_penalty: float = 0.50,
) -> list[dict]:
    """Generate a detailed report of penalties applied to assignments.

    Args:
        assignments: List of assignments to report on.
        penalty_per_day: Daily penalty rate.
        max_penalty: Maximum penalty cap.

    Returns:
        List of dicts with assignment name, original score,
        adjusted score, days late, and penalty factor.
    """
    report_entries = []
    for a in assignments:
        multiplier = compute_late_penalty(
            a.submitted_date,
            a.due_date,
            penalty_per_day,
            max_penalty,
        )
        adjusted = a.percentage * multiplier
        days = (a.submitted_date - a.due_date).days

        report_entries.append({
            "assignment": a.name,
            "original_score": round(a.percentage, 2),
            "adjusted_score": round(adjusted, 2),
            "days_late": max(0, days),
            "penalty_factor": round(multiplier, 4),
            "penalty_applied": multiplier < 1.0,
        })

    return report_entries
