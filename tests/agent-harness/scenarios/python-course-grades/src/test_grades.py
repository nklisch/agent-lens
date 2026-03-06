"""Visible failing test — agent can see and run this."""

from course import process_student_grades
from data import alice, alice_assignments, cs201_config


def test_alice_final_grade():
    report = process_student_grades(alice, alice_assignments, cs201_config)
    assert report.letter_grade == "A-", (
        f"Expected A- for Alice, got {report.letter_grade} "
        f"(numeric: {report.numeric_score:.2f})"
    )


def test_alice_numeric_score():
    report = process_student_grades(alice, alice_assignments, cs201_config)
    assert abs(report.numeric_score - 90.0) < 0.01, (
        f"Expected score ~90.0, got {report.numeric_score:.2f}"
    )
