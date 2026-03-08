"""Test data for the course grading system.

Defines course configuration and student assignment data
for CS201 (Data Structures), Fall 2025.
"""

from datetime import date

from models import Assignment, CategoryConfig, CourseConfig, Student


# ---------------------------------------------------------------------------
# Course configuration
# ---------------------------------------------------------------------------

cs201_config = CourseConfig(
    course_name="Data Structures",
    course_code="CS201",
    semester="Fall 2025",
    categories=[
        CategoryConfig(name="homework", weight=0.40, drop_lowest=1, apply_late_penalty=True),
        CategoryConfig(name="midterm", weight=0.30, drop_lowest=0, apply_late_penalty=False),
        CategoryConfig(name="final_exam", weight=0.20, drop_lowest=0, apply_late_penalty=True),
        CategoryConfig(name="participation", weight=0.10, drop_lowest=0, apply_late_penalty=False),
    ],
    penalty_per_day=0.10,
    max_penalty=0.50,
)


# ---------------------------------------------------------------------------
# Student: Alice Chen
# ---------------------------------------------------------------------------

alice = Student(
    student_id="STU-1001",
    name="Alice Chen",
    email="achen@university.edu",
    enrollment_date=date(2025, 8, 25),
    advisor="Dr. Thompson",
)

# Homework assignments (weight 0.40, drop lowest 1)
# Scores: 95, 85, 72, 90, 85 out of 100
# Correct: drop 72, average of [95, 85, 90, 85] = 88.75
alice_assignments: list[Assignment] = [
    Assignment(
        name="HW1 - Linked Lists",
        score=95,
        max_score=100,
        category="homework",
        due_date=date(2025, 9, 8),
        submitted_date=date(2025, 9, 8),  # on time
    ),
    Assignment(
        name="HW2 - Stacks & Queues",
        score=85,
        max_score=100,
        category="homework",
        due_date=date(2025, 9, 22),
        submitted_date=date(2025, 9, 22),  # on time
    ),
    Assignment(
        name="HW3 - Trees",
        score=72,
        max_score=100,
        category="homework",
        due_date=date(2025, 10, 6),
        submitted_date=date(2025, 10, 6),  # on time
    ),
    Assignment(
        name="HW4 - Hash Tables",
        score=90,
        max_score=100,
        category="homework",
        due_date=date(2025, 10, 20),
        submitted_date=date(2025, 10, 20),  # on time
    ),
    Assignment(
        name="HW5 - Graphs",
        score=85,
        max_score=100,
        category="homework",
        due_date=date(2025, 11, 3),
        submitted_date=date(2025, 11, 3),  # on time
    ),
    # Midterm exam (weight 0.30, no late penalty)
    Assignment(
        name="Midterm Exam",
        score=87,
        max_score=100,
        category="midterm",
        due_date=date(2025, 10, 15),
        submitted_date=date(2025, 10, 15),
    ),
    # Final exam (weight 0.20, late penalty applies)
    # Submitted 2 days EARLY — should NOT incur penalty
    Assignment(
        name="Final Exam",
        score=92,
        max_score=100,
        category="final_exam",
        due_date=date(2025, 12, 12),
        submitted_date=date(2025, 12, 10),  # 2 days early
    ),
    # Participation (weight 0.10, no late penalty)
    Assignment(
        name="Participation",
        score=100,
        max_score=100,
        category="participation",
        due_date=date(2025, 12, 15),
        submitted_date=date(2025, 12, 15),
    ),
]


# ---------------------------------------------------------------------------
# Student: Bob Martinez
# ---------------------------------------------------------------------------
# Bob's grades are straightforward and not affected by any of the three bugs:
# - All homework scores are identical (dropping any one gives the same average)
# - All submissions are on time (no late penalty issue)
# - His final score does not land on an exact grade boundary
# Expected: 80*0.40 + 74*0.30 + 71*0.20 + 95*0.10 = 32.0 + 22.2 + 14.2 + 9.5 = 77.9 → C+

bob = Student(
    student_id="STU-1002",
    name="Bob Martinez",
    email="bmartinez@university.edu",
    enrollment_date=date(2025, 8, 25),
    advisor="Dr. Ramirez",
)

bob_assignments: list[Assignment] = [
    # Homework: all 80s — dropping any one still gives avg 80.0
    # This makes Bob immune to the drop-direction bug.
    Assignment(
        name="HW1 - Linked Lists",
        score=80,
        max_score=100,
        category="homework",
        due_date=date(2025, 9, 8),
        submitted_date=date(2025, 9, 8),
    ),
    Assignment(
        name="HW2 - Stacks & Queues",
        score=80,
        max_score=100,
        category="homework",
        due_date=date(2025, 9, 22),
        submitted_date=date(2025, 9, 22),
    ),
    Assignment(
        name="HW3 - Trees",
        score=80,
        max_score=100,
        category="homework",
        due_date=date(2025, 10, 6),
        submitted_date=date(2025, 10, 6),
    ),
    Assignment(
        name="HW4 - Hash Tables",
        score=80,
        max_score=100,
        category="homework",
        due_date=date(2025, 10, 20),
        submitted_date=date(2025, 10, 20),
    ),
    Assignment(
        name="HW5 - Graphs",
        score=80,
        max_score=100,
        category="homework",
        due_date=date(2025, 11, 3),
        submitted_date=date(2025, 11, 3),
    ),
    # Midterm — on time
    Assignment(
        name="Midterm Exam",
        score=74,
        max_score=100,
        category="midterm",
        due_date=date(2025, 10, 15),
        submitted_date=date(2025, 10, 15),
    ),
    # Final exam — on time (no early submission, no late penalty issue)
    Assignment(
        name="Final Exam",
        score=71,
        max_score=100,
        category="final_exam",
        due_date=date(2025, 12, 12),
        submitted_date=date(2025, 12, 12),
    ),
    # Participation
    Assignment(
        name="Participation",
        score=95,
        max_score=100,
        category="participation",
        due_date=date(2025, 12, 15),
        submitted_date=date(2025, 12, 15),
    ),
]
