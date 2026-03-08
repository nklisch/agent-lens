"""Main course orchestration module.

Ties together grading, late policy, and transcript generation
to produce final grade reports for students.
"""

from typing import Optional

from models import Assignment, AuditLog, CategoryConfig, CourseConfig, GradeReport, Student
from grading import calculate_category_average, calculate_weighted_score
from late_policy import apply_penalty_to_score, get_extension_days
from transcripts import assign_letter_grade


def process_student_grades(
    student: Student,
    assignments: list[Assignment],
    config: CourseConfig,
    extensions: Optional[dict[str, dict[str, int]]] = None,
) -> GradeReport:
    """Process all assignments for a student and produce a final grade report.

    This is the main entry point for grade calculation. It:
    1. Groups assignments by category
    2. Applies late penalties to each assignment
    3. Calculates category averages (with drop policy)
    4. Computes the weighted overall score
    5. Assigns a letter grade

    Args:
        student: The student being graded.
        assignments: All of the student's assignments.
        config: The course grading configuration.
        extensions: Optional extension registry for late policy.

    Returns:
        A GradeReport with the final numeric score and letter grade.
    """
    audit = AuditLog(
        student_id=student.student_id,
        course_code=config.course_code,
        timestamp="",
    )

    # Step 1: Group assignments by category
    by_category: dict[str, list[Assignment]] = {}
    for assignment in assignments:
        if assignment.category not in by_category:
            by_category[assignment.category] = []
        by_category[assignment.category].append(assignment)

    audit.add_event("info", f"Found {len(assignments)} assignments in {len(by_category)} categories")

    # Step 2: Apply late penalties and build adjusted assignments
    adjusted_assignments: dict[str, list[Assignment]] = {}

    for cat_name, cat_assignments in by_category.items():
        cat_config = config.get_category(cat_name)
        if cat_config is None:
            audit.add_event("warning", f"Unknown category: {cat_name}")
            continue

        adjusted_list = []
        for a in cat_assignments:
            if cat_config.apply_late_penalty:
                ext_days = get_extension_days(student.student_id, a.name, extensions)
                # Create adjusted assignment with penalized score
                adjusted_score = apply_penalty_to_score(
                    a,
                    config.penalty_per_day,
                    config.max_penalty,
                )
                # Build a new assignment with the adjusted percentage as score
                adjusted = Assignment(
                    name=a.name,
                    score=adjusted_score,
                    max_score=100.0,
                    category=a.category,
                    due_date=a.due_date,
                    submitted_date=a.submitted_date,
                    weight=a.weight,
                )
                adjusted_list.append(adjusted)

                if adjusted_score != a.percentage:
                    audit.add_event(
                        "penalty",
                        f"{a.name}: {a.percentage:.2f} -> {adjusted_score:.2f}",
                        adjusted_score,
                    )
            else:
                # No late penalty for this category
                adjusted = Assignment(
                    name=a.name,
                    score=a.percentage,
                    max_score=100.0,
                    category=a.category,
                    due_date=a.due_date,
                    submitted_date=a.submitted_date,
                    weight=a.weight,
                )
                adjusted_list.append(adjusted)

        adjusted_assignments[cat_name] = adjusted_list

    # Step 3: Calculate category averages
    category_averages: dict[str, float] = {}

    for cat_name, adj_list in adjusted_assignments.items():
        cat_config = config.get_category(cat_name)
        if cat_config is None:
            continue
        avg = calculate_category_average(adj_list, cat_config)
        category_averages[cat_name] = avg
        audit.add_event("average", f"{cat_name}: {avg:.2f}", avg)

    # Step 4: Compute weighted overall score
    numeric_score = calculate_weighted_score(category_averages, config.categories)
    audit.add_event("final", f"Weighted score: {numeric_score:.2f}", numeric_score)

    # Step 5: Assign letter grade
    letter_grade = assign_letter_grade(numeric_score)
    audit.add_event("grade", f"Letter grade: {letter_grade}")

    return GradeReport(
        student=student,
        course_code=config.course_code,
        numeric_score=numeric_score,
        letter_grade=letter_grade,
        category_breakdown=category_averages,
    )


def process_class_grades(
    students_data: list[tuple[Student, list[Assignment]]],
    config: CourseConfig,
    extensions: Optional[dict[str, dict[str, int]]] = None,
) -> list[GradeReport]:
    """Process grades for an entire class.

    Args:
        students_data: List of (student, assignments) tuples.
        config: The course grading configuration.
        extensions: Optional extension registry.

    Returns:
        List of GradeReports, one per student.
    """
    reports = []
    for student, assignments in students_data:
        report = process_student_grades(student, assignments, config, extensions)
        reports.append(report)
    return reports
