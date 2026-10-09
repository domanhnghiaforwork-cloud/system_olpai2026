"""Shared UTC normalization and lower bounds for dependent opening schedules."""
import datetime
from fastapi import HTTPException


def utc_naive(value):
    if value is not None and value.tzinfo is not None:
        return value.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    return value


def validate_opening_time(value, problem_unlock_at, label):
    value = utc_naive(value)
    parent = utc_naive(problem_unlock_at)
    if value is not None and parent is not None and value < parent:
        raise HTTPException(422, f"Thời gian mở {label} không được sớm hơn thời gian mở đề thi.")
    return value


def parse_opening_time(value, label):
    if not value or not value.strip():
        return None
    try:
        return utc_naive(datetime.datetime.fromisoformat(value.strip().replace('Z', '+00:00')))
    except ValueError as error:
        raise HTTPException(422, f"Thời gian mở {label} không hợp lệ.") from error
