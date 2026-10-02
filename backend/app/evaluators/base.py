from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any

@dataclass
class EvaluationValidationResult:
    is_valid: bool
    message: str
    row_count: int = 0
    errors: List[str] = field(default_factory=list)
    details: Dict[str, Any] = field(default_factory=dict)

@dataclass
class EvaluationScoreResult:
    score: float
    metric: str
    message: str
    details: Dict[str, Any] = field(default_factory=dict)

class BaseEvaluator(ABC):
    """
    Abstract Base Class for all evaluation modules in the system.
    Every evaluator plugin must inherit from this class and implement
    validation and evaluation methods.
    """
    eval_id: str
    name: str
    description: str
    metric_name: str

    @abstractmethod
    def validate(self, filepath: str, submission_type: str, original_filename: str = "") -> EvaluationValidationResult:
        """
        Validate submission file format, headers, IDs, constraints, etc.
        """
        pass

    @abstractmethod
    def evaluate(self, filepath: str, submission_type: str) -> EvaluationScoreResult:
        """
        Compute metric score against ground-truth labels.
        """
        pass
