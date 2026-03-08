"""Data models for the university course grading system."""

from dataclasses import dataclass, field
from datetime import date
from typing import Optional


@dataclass
class Student:
    """Represents a student enrolled in a course."""
    student_id: str
    name: str
    email: str
    enrollment_date: date = field(default_factory=date.today)
    advisor: Optional[str] = None

    def __repr__(self) -> str:
        return f"Student({self.student_id}, {self.name!r})"


@dataclass
class Assignment:
    """A single graded assignment with submission metadata."""
    name: str
    score: float
    max_score: float
    category: str
    due_date: date
    submitted_date: date
    weight: float = 1.0

    @property
    def percentage(self) -> float:
        """Score as a percentage of max_score."""
        if self.max_score == 0:
            return 0.0
        return (self.score / self.max_score) * 100.0

    @property
    def days_late(self) -> int:
        """Number of days between due date and submission date."""
        return (self.submitted_date - self.due_date).days


@dataclass
class CategoryConfig:
    """Configuration for a grading category (e.g., homework, exams)."""
    name: str
    weight: float
    drop_lowest: int = 0
    apply_late_penalty: bool = True


@dataclass
class CourseConfig:
    """Full configuration for a course's grading policy."""
    course_name: str
    course_code: str
    semester: str
    categories: list[CategoryConfig] = field(default_factory=list)
    penalty_per_day: float = 0.10
    max_penalty: float = 0.50

    def get_category(self, name: str) -> Optional[CategoryConfig]:
        """Look up a category config by name."""
        for cat in self.categories:
            if cat.name == name:
                return cat
        return None

    def total_weight(self) -> float:
        """Sum of all category weights. Should equal 1.0."""
        return sum(c.weight for c in self.categories)


@dataclass
class GradeReport:
    """Final grade report for a student in a course."""
    student: Student
    course_code: str
    numeric_score: float
    letter_grade: str
    category_breakdown: dict[str, float] = field(default_factory=dict)

    def summary(self) -> str:
        """Human-readable summary line."""
        return (
            f"{self.student.name}: {self.letter_grade} "
            f"({self.numeric_score:.2f}) in {self.course_code}"
        )


@dataclass
class AuditLog:
    """Tracks grade computation events for auditing purposes."""
    student_id: str
    course_code: str
    timestamp: str
    events: list[dict] = field(default_factory=list)

    def add_event(self, event_type: str, detail: str, value: Optional[float] = None) -> None:
        """Record an auditable event during grade computation."""
        entry = {"type": event_type, "detail": detail}
        if value is not None:
            entry["value"] = value
        self.events.append(entry)

    def has_warnings(self) -> bool:
        """Check if any warning events were recorded."""
        return any(e["type"] == "warning" for e in self.events)

    def get_events_by_type(self, event_type: str) -> list[dict]:
        """Filter events by type."""
        return [e for e in self.events if e["type"] == event_type]
