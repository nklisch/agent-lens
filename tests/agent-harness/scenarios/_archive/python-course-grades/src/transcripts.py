"""Transcript generation and letter grade assignment.

Converts numeric scores to letter grades using standard
university grade boundaries, and formats transcript entries.
"""

from datetime import date
from typing import Optional

from models import GradeReport, Student


# Standard university grade boundaries: (threshold, letter)
# A score at or above the threshold receives that grade.
GRADE_BOUNDARIES = [
    (93, "A"),
    (90, "A-"),
    (87, "B+"),
    (83, "B"),
    (80, "B-"),
    (77, "C+"),
    (73, "C"),
    (70, "C-"),
    (67, "D+"),
    (63, "D"),
    (60, "D-"),
]


def assign_letter_grade(score: float) -> str:
    """Assign a letter grade based on a numeric score.

    Uses the standard grade boundary table. Scores are compared
    against each threshold from highest to lowest.

    Args:
        score: Numeric score on a 0-100 scale.

    Returns:
        Letter grade string (e.g., "A-", "B+", "F").
    """
    for threshold, grade in GRADE_BOUNDARIES:
        if score > threshold:
            return grade
    return "F"


def generate_transcript(
    reports: list[GradeReport],
    semester: str,
    include_gpa: bool = True,
) -> dict:
    """Generate a full transcript for a student.

    Args:
        reports: List of grade reports for the semester.
        semester: Semester identifier (e.g., "Fall 2025").
        include_gpa: Whether to compute and include GPA.

    Returns:
        Transcript dict with student info, courses, and optional GPA.
    """
    if not reports:
        return {"error": "No grade reports provided"}

    student = reports[0].student

    courses = []
    for report in reports:
        entry = format_transcript_entry(report)
        courses.append(entry)

    transcript = {
        "student_id": student.student_id,
        "student_name": student.name,
        "semester": semester,
        "courses": courses,
        "total_courses": len(courses),
    }

    if include_gpa:
        letter_grades = [r.letter_grade for r in reports]
        transcript["semester_gpa"] = calculate_gpa(letter_grades)

    return transcript


def calculate_gpa(letter_grades: list[str]) -> float:
    """Convert a list of letter grades to a GPA on a 4.0 scale.

    Args:
        letter_grades: List of letter grade strings.

    Returns:
        GPA value (0.0 to 4.0).
    """
    gpa_map = {
        "A": 4.0,
        "A-": 3.7,
        "B+": 3.3,
        "B": 3.0,
        "B-": 2.7,
        "C+": 2.3,
        "C": 2.0,
        "C-": 1.7,
        "D+": 1.3,
        "D": 1.0,
        "D-": 0.7,
        "F": 0.0,
    }

    if not letter_grades:
        return 0.0

    total_points = sum(gpa_map.get(g, 0.0) for g in letter_grades)
    return round(total_points / len(letter_grades), 2)


def format_transcript_entry(report: GradeReport) -> dict:
    """Format a single grade report as a transcript entry.

    Args:
        report: The grade report to format.

    Returns:
        Dict with course code, grade, score, and breakdown.
    """
    return {
        "course_code": report.course_code,
        "letter_grade": report.letter_grade,
        "numeric_score": round(report.numeric_score, 2),
        "category_breakdown": {
            k: round(v, 2) for k, v in report.category_breakdown.items()
        },
    }


def format_grade_distribution(scores: list[float]) -> dict[str, int]:
    """Count how many scores fall into each letter grade bucket.

    Args:
        scores: List of numeric scores.

    Returns:
        Dict mapping letter grades to counts.
    """
    distribution: dict[str, int] = {}
    for score in scores:
        grade = assign_letter_grade(score)
        distribution[grade] = distribution.get(grade, 0) + 1
    return distribution
