"""Hidden oracle tests -- copied into workspace after agent finishes."""

import pytest
from datetime import date

from grading import apply_drop_policy
from late_policy import compute_late_penalty
from transcripts import assign_letter_grade
from course import process_student_grades
from data import alice, alice_assignments, bob, bob_assignments, cs201_config


# ---------------------------------------------------------------------------
# Bug 1: drop_lowest should drop the LOWEST scores, not the highest
# ---------------------------------------------------------------------------


def test_drop_policy_drops_lowest():
    """Dropping 1 from [95, 85, 72, 90, 85] should remove 72, avg = 88.75."""
    scores = [95, 85, 72, 90, 85]
    result = apply_drop_policy(scores, 1)
    assert 72 not in result, f"72 (the lowest) should have been dropped, got {result}"
    assert sorted(result) == [85, 85, 90, 95], f"Expected [85, 85, 90, 95], got {sorted(result)}"
    avg = sum(result) / len(result)
    assert abs(avg - 88.75) < 0.01, f"Expected avg 88.75 after drop, got {avg}"


# ---------------------------------------------------------------------------
# Bug 2: early submissions should NOT receive a late penalty
# ---------------------------------------------------------------------------


def test_early_submission_no_penalty():
    """A submission 2 days early should have penalty factor 1.0 (no penalty)."""
    early = date(2025, 12, 10)
    due = date(2025, 12, 12)
    factor = compute_late_penalty(early, due, penalty_per_day=0.10, max_penalty=0.50)
    assert factor == 1.0, (
        f"Early submission should not be penalized, got factor {factor}"
    )


def test_late_submission_penalized():
    """A submission 3 days late should have penalty factor 0.70."""
    late = date(2025, 12, 15)
    due = date(2025, 12, 12)
    factor = compute_late_penalty(late, due, penalty_per_day=0.10, max_penalty=0.50)
    assert abs(factor - 0.70) < 0.001, (
        f"3 days late should give factor 0.70, got {factor}"
    )


# ---------------------------------------------------------------------------
# Bug 3: exact boundary scores should receive the matching grade
# ---------------------------------------------------------------------------


def test_grade_boundary_exact_90():
    """A score of exactly 90.0 should receive A-, not B+."""
    grade = assign_letter_grade(90.0)
    assert grade == "A-", f"Score 90.0 should be A-, got {grade}"


def test_grade_boundary_exact_93():
    """A score of exactly 93.0 should receive A, not A-."""
    grade = assign_letter_grade(93.0)
    assert grade == "A", f"Score 93.0 should be A, got {grade}"


def test_grade_boundary_exact_80():
    """A score of exactly 80.0 should receive B-, not C+."""
    grade = assign_letter_grade(80.0)
    assert grade == "B-", f"Score 80.0 should be B-, got {grade}"


# ---------------------------------------------------------------------------
# Integration: full student grade reports
# ---------------------------------------------------------------------------


def test_alice_complete():
    """Alice should get A- with numeric score 90.0."""
    report = process_student_grades(alice, alice_assignments, cs201_config)
    assert abs(report.numeric_score - 90.0) < 0.01, (
        f"Expected Alice's score ~90.0, got {report.numeric_score:.4f}"
    )
    assert report.letter_grade == "A-", (
        f"Expected A- for Alice, got {report.letter_grade} "
        f"(numeric: {report.numeric_score:.2f})"
    )


def test_bob_unaffected():
    """Bob should get C+ with numeric score 77.9, unaffected by any bugs."""
    report = process_student_grades(bob, bob_assignments, cs201_config)
    assert abs(report.numeric_score - 77.9) < 0.01, (
        f"Expected Bob's score ~77.9, got {report.numeric_score:.4f}"
    )
    assert report.letter_grade == "C+", (
        f"Expected C+ for Bob, got {report.letter_grade} "
        f"(numeric: {report.numeric_score:.2f})"
    )
